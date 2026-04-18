const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const Product = require('../models/Product');
const OrderItem = require('../models/OrderItem');
const PickingLock = require('../models/PickingLock');
const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const db = require('../config/database');

const DEPARTMENT_LABELS = {
  2: 'Veterinária',
  3: 'Agrícola',
  4: 'Elétrica',
  5: 'Hidráulica',
  6: 'Ferragens',
  7: 'Imobilizado',
  9: 'Brinde',
  10: 'Despesa e Consumo',
  11: 'Material de Construção',
  14: 'Solar',
  22: 'Pet',
  23: 'Defensivos Agrícola',
  24: 'Diversos'
};

const DEFAULT_PRODUCT_FILES = [
  'cadastro_produto_view.xlsx',
  path.join('Produtos_Planilha', 'cadastro_produto_view.xlsx')
];

const BOOLEAN_COLUMNS = new Set(['item_ativo', 'ativo', 'ativo_compra']);
const INTEGER_COLUMNS = new Set(['codigo', 'cod_grupo', 'cod_departamento', 'cod_marca', 'cod_fornecedor']);
const NUMERIC_COLUMNS = new Set([
  'preco_custo_ultima_compra',
  'ite_precom_liq',
  'ipi_entrada',
  'frete',
  'valor_frete',
  'acrescimo_financeiro',
  'substituicao_tributaria',
  'diferencial_aliquota',
  'preco_custo',
  'icms_saida',
  'imposto_federal_entrada',
  'imposto_federal_saida',
  'despesas_operacionais',
  'boca_de_caixa',
  'preco_custo_real'
]);

const HEADER_MAP = {
  CODIGO: 'codigo',
  COD_FABRICA: 'cod_fabrica',
  DESCRICAO: 'descricao',
  REFERENCIA: 'referencia',
  UNIDADE: 'unidade',
  ITEM_ATIVO: 'item_ativo',
  COD_GRUPO: 'cod_grupo',
  GRUPO: 'grupo',
  COD_DEPARTAMENTO: 'cod_departamento',
  DEPARTAMENTO: 'departamento',
  COD_MARCA: 'cod_marca',
  MARCA: 'marca',
  COD_FORNECEDOR: 'cod_fornecedor',
  FORNECEDOR: 'fornecedor',
  NIVEL_DE_GIRO: 'nivel_de_giro',
  PRECO_CUSTO_ULTIMA_COMPRA: 'preco_custo_ultima_compra',
  ATIVO: 'ativo',
  ATIVO_COMPRA: 'ativo_compra',
  ITE_PRECOM_liq: 'ite_precom_liq',
  IPI_ENTRADA: 'ipi_entrada',
  FRETE: 'frete',
  VALOR_FRETE: 'valor_frete',
  ACRESCIMO_FINANCEIRO: 'acrescimo_financeiro',
  SUBSTITUICAO_TRIBUTARIA: 'substituicao_tributaria',
  DIFERENCIAL_ALIQUOTA: 'diferencial_aliquota',
  PRECO_CUSTO: 'preco_custo',
  ICMS_SAIDA: 'icms_saida',
  IMPOSTO_FEDERAL_ENTRADA: 'imposto_federal_entrada',
  IMPOSTO_FEDERAL_SAIDA: 'imposto_federal_saida',
  DESPESAS_OPERACIONAIS: 'despesas_operacionais',
  BOCA_DE_CAIXA: 'boca_de_caixa',
  PRECO_CUSTO_REAL: 'preco_custo_real',
  CLASSIFICACAO_IPI: 'classificacao_ipi',
  ABREVIACAO_FISCAL: 'abreviacao_fiscal',
  ABREVIACAO_PIS: 'abreviacao_pis',
  ABREVIACAO_COFINS: 'abreviacao_cofins',
  CEST: 'cest',
  TIPO_PRODUTO: 'tipo_produto'
};

function normalizeBoolean(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['s', 'sim', '1', 'true'].includes(normalized)) {
    return true;
  }
  if (['n', 'nao', 'não', '0', 'false'].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  const cleaned = String(value).replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Math.trunc(value);
  }

  const cleaned = String(value).replace(/[^0-9-]/g, '');
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCellValue(key, value) {
  if (value === '\\N') {
    return null;
  }

  if (BOOLEAN_COLUMNS.has(key)) {
    return normalizeBoolean(value);
  }

  if (INTEGER_COLUMNS.has(key)) {
    return normalizeInteger(value);
  }

  if (NUMERIC_COLUMNS.has(key)) {
    return normalizeNumber(value);
  }

  return value === undefined ? null : value;
}

function normalizeSku(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .trim()
    .replace(/^0+/, '')
    .toUpperCase();
}

function locateProductFile(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const candidates = DEFAULT_PRODUCT_FILES.map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function parseProductWorksheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null
  });

  if (rawRows.length <= 1) {
    return [];
  }

  const headerRow = rawRows[0];
  const mappedHeaders = headerRow.map((header) => HEADER_MAP[header] || null);

  const dataRows = rawRows.slice(1);

  return dataRows
    .map((row) => {
      const record = {};

      row.forEach((cell, index) => {
        const mappedKey = mappedHeaders[index];
        if (!mappedKey) {
          return;
        }
        record[mappedKey] = normalizeCellValue(mappedKey, cell);
      });

      return record;
    })
    .filter((record) => record.codigo);
}

async function buildProductRows(records) {
  return records.map((record) => ({
    codigo: record.codigo,
    cod_fabrica: record.cod_fabrica,
    descricao: record.descricao,
    referencia: record.referencia,
    unidade: record.unidade,
    item_ativo: record.item_ativo,
    cod_grupo: record.cod_grupo,
    grupo: record.grupo,
    cod_departamento: record.cod_departamento,
    departamento: record.departamento,
    cod_marca: record.cod_marca,
    marca: record.marca,
    cod_fornecedor: record.cod_fornecedor,
    fornecedor: record.fornecedor,
    nivel_de_giro: record.nivel_de_giro,
    preco_custo_ultima_compra: record.preco_custo_ultima_compra,
    ativo: record.ativo,
    ativo_compra: record.ativo_compra,
    ite_precom_liq: record.ite_precom_liq,
    ipi_entrada: record.ipi_entrada,
    frete: record.frete,
    valor_frete: record.valor_frete,
    acrescimo_financeiro: record.acrescimo_financeiro,
    substituicao_tributaria: record.substituicao_tributaria,
    diferencial_aliquota: record.diferencial_aliquota,
    preco_custo: record.preco_custo,
    icms_saida: record.icms_saida,
    imposto_federal_entrada: record.imposto_federal_entrada,
    imposto_federal_saida: record.imposto_federal_saida,
    despesas_operacionais: record.despesas_operacionais,
    boca_de_caixa: record.boca_de_caixa,
    preco_custo_real: record.preco_custo_real,
    classificacao_ipi: record.classificacao_ipi,
    abreviacao_fiscal: record.abreviacao_fiscal,
    abreviacao_pis: record.abreviacao_pis,
    abreviacao_cofins: record.abreviacao_cofins,
    cest: record.cest,
    tipo_produto: record.tipo_produto
  }));
}

async function ensureOrderStatusFor(allocationOrderId) {
  try {
    // 1. Descobrir qual é o 'numero_venda' a partir do ID da linha que acabamos de bipar
    const orderRow = await MercadoLivreOrder.findById(allocationOrderId);
    if (!orderRow) {
      console.warn(`[ensureOrderStatusFor] Não foi possível encontrar a linha de pedido ${allocationOrderId}`);
      return;
    }
    
    const { numero_venda } = orderRow;

    // 2. Verificar o status AGREGADO de todos os itens desse 'numero_venda'
    const statusInfo = await OrderItem.findOrderStatusByNumeroVenda(numero_venda);

    if (statusInfo && statusInfo.pedido_completo) {
      // 3. Se o pedido (kit) está completo, atualizar TODAS as linhas de pedido (MLO) para 'separado'
      const updatedRows = await MercadoLivreOrder.updateStatusByNumeroVenda(numero_venda, 'separado');
      console.log(`[ProductService] Pedido (Kit) ${numero_venda} concluído. ${updatedRows} linhas atualizadas.`);
    }
    // Se não, não faz nada (o status_bucket continua 'pendente')
  } catch (error) {
    console.error(`[ensureOrderStatusFor] Erro ao verificar status para pedido (linha ${allocationOrderId}):`, error);
  }
}

const ProductService = {

  async importFromSpreadsheet(customPath) {
    const filePath = locateProductFile(customPath);
    if (!filePath) {
      throw new Error('Planilha de produtos não encontrada na raiz ou em Produtos_Planilha/.');
    }

    const rawRecords = parseProductWorksheet(filePath);
    const productRows = await buildProductRows(rawRecords);

    const { inserted, updated } = await Product.bulkUpsert(productRows);

    return {
      filePath,
      total: productRows.length,
      inserted,
      updated
    };
  },

  /**
   * Retorna os departamentos que possuem itens pendentes, agrupados e com estatísticas.
   * Agora estrutura os dados de forma aninhada: Plataforma -> Empresa -> Unidades.
   */
  async getDepartmentsWithPending(filters = {}) {
    // Busca dados brutos no Model (agrupados por Dept, Plataforma e Empresa)
    const stats = await OrderItem.getSeparationStats(filters);
    
    // Processa os dados para a nova estrutura aninhada
    const departmentsMap = {};

    stats.forEach(row => {
        const deptCode = row.cod_departamento;
        const plataforma = row.plataforma || 'outra';
        const empresa = row.codigo_empresa || 'N/A';
        const unidades = parseInt(row.unidades_pendentes) || 0;
        const produtosUnicos = parseInt(row.produtos_unicos) || 0;
        
        if (!departmentsMap[deptCode]) {
            departmentsMap[deptCode] = {
                cod_departamento: deptCode,
                produtos_com_pendencia: 0, 
                unidades_pendentes: 0,
                // NOVO: Objeto que vai guardar as plataformas e, dentro delas, as empresas
                plataformas: {}
            };
        }

        const dept = departmentsMap[deptCode];
        
        // 1. Soma os totais gerais do departamento
        dept.produtos_com_pendencia += produtosUnicos;
        dept.unidades_pendentes += unidades;

        // 2. Inicializa a plataforma se ainda não existir
        if (!dept.plataformas[plataforma]) {
            dept.plataformas[plataforma] = {};
        }

        // 3. Inicializa a empresa dentro da plataforma se ainda não existir
        if (!dept.plataformas[plataforma][empresa]) {
            dept.plataformas[plataforma][empresa] = 0;
        }

        // 4. Soma as unidades para aquela empresa específica, dentro daquela plataforma
        dept.plataformas[plataforma][empresa] += unidades;
    });

    // Retorna apenas os valores como um array para o Handlebars iterar
    return Object.values(departmentsMap);
  },

  async getPendingProductsByDepartment(departmentCode) {
    const rows = await Product.findPendingProductsByDepartment(departmentCode);
    return rows.map((row) => ({
      ...row,
      unidades_pendentes: Number(row.unidades_pendentes || 0)
    }));
  },

  async getCurrentSession(userId, plataforma = 'mercado_livre', filters = {}) {
    const lock = await PickingLock.findByUser(userId);
    if (!lock) {
      return null;
    }

    const product = await Product.findByCodigo(lock.produto_codigo);

    // Busca a lista detalhada
    const pendingItems = await OrderItem.findPendingByProduct(lock.produto_codigo, plataforma, filters); // <-- REPASSA E FILTRA
    const ordersList = pendingItems.map(i => ({
        numero_venda: i.numero_venda,
        comprador: i.comprador,
        qty_needed: i.quantidade_total - i.quantidade_separada
    }));

    // Busca o total real atualizado
    const pendentesCount = await OrderItem.countPendingUnitsByProduct(lock.produto_codigo, plataforma, filters); // <-- REPASSA E FILTRA

    return {
      lock,
      product,
      orders: ordersList,
      status: {
          scanned: lock.quantidade_concluida,
          total: pendentesCount // Usa o valor real calculado na hora, ignorando o valor 'velho' do lock se houver
      }
      // ---------------------
    };
  },

  async acquireProductForUser({ userId, departmentCode, skip = 0, filters = {}, plataforma = 'mercado_livre' }) {
    await PickingLock.clearStaleLocks();

    // 1. Primeiro, buscamos qual seria o produto "alvo" baseado nos filtros e no pulo (skip)
    // Isso garante que estamos respeitando o botão "Próximo/Anterior" e os filtros da tela
    const nextProduct = await OrderItem.findNextItemToPick({
        userId,
        departmentCode,
        companyFilter: filters.companyFilter,
        deadlines: filters.deadlines,
        skip, // O offset que vem dos botões Anterior/Próximo
        plataforma // <--- NOVO: Repassa a plataforma para o Model
    });

    // 2. Verificamos se o usuário já tem algo travado
    const existingLock = await PickingLock.findByUser(userId);

    if (existingLock) {
        // Se não encontramos nenhum produto novo (fim da fila), mas temos um lock antigo,
        // devemos soltar o lock antigo para não prender o usuário num limbo.
        if (!nextProduct) {
            await PickingLock.releaseByUser(userId);
            return null;
        }

        // LÓGICA DE NAVEGAÇÃO:
        // Se o produto que encontramos na busca (nextProduct) for DIFERENTE do que está travado,
        // significa que o usuário clicou em "Próximo" ou "Anterior".
        // Então, soltamos a trava antiga para poder pegar a nova.
        if (existingLock.produto_codigo !== nextProduct.produto_codigo) {
            await PickingLock.releaseByUser(userId);
        } else {
            // Se for O MESMO produto (ex: F5 na página), mantemos a trava e retornamos.
            const product = await Product.findByCodigo(existingLock.produto_codigo);
            const pendentesReais = await OrderItem.countPendingUnitsByProduct(product.codigo, plataforma, filters);
            return {
                lock: existingLock,
                product,
                status: {
                    scanned: existingLock.quantidade_concluida, 
                    total: pendentesReais 
                }
            };
        }
    }

    // Se não achou nada (e não tinha lock para tratar acima), retorna null
    if (!nextProduct) return null;

    // 3. Cria a nova trava para o produto encontrado
    // (Se caiu aqui, ou não tinha trava, ou a trava antiga foi liberada no passo 2)
    const lock = await PickingLock.acquire({
      produtoCodigo: nextProduct.produto_codigo,
      departamento: nextProduct.cod_departamento, 
      userId,
      quantidadeMeta: Number(nextProduct.unidades_pendentes_totais) 
      // ---------------------
    });

    const pendingItems = await OrderItem.findPendingByProduct(nextProduct.produto_codigo, plataforma, filters); // <-- REPASSA
    const ordersList = pendingItems.map(i => ({
        numero_venda: i.numero_venda,
        comprador: i.comprador,
        qty_needed: i.quantidade_total - i.quantidade_separada
    }));

    return {
      lock,
      product: await Product.findByCodigo(nextProduct.produto_codigo), 
      orders: ordersList, 
      status: {
          scanned: 0,
          total: Number(nextProduct.unidades_pendentes_totais) 
      }
    };
  },

  async pickUnit({ userId, sku, isAdmin, plataforma = 'mercado_livre', filters = {} }) { // <-- NOVO PARAM E FILTERS
    const lock = await PickingLock.findByUser(userId);
    if (!lock) throw new Error('Sessão expirada. Atualize a página.');

    const product = await Product.findByCodigo(lock.produto_codigo);
    
    // 1. Lista de códigos permitidos
    const validCodes = [];

    // Barras: Sempre permitido
    if (product.cod_barras) validCodes.push(String(product.cod_barras).trim().toUpperCase());

    // SKU/Interno/Fábrica: Só se for Admin
    if (isAdmin) {
        if (product.codigo) validCodes.push(String(product.codigo).trim().toUpperCase());
        if (product.cod_fabrica) validCodes.push(String(product.cod_fabrica).trim().toUpperCase());
    }

    // Filtra vazios
    const finalList = validCodes.filter(c => c);

    let normalizedSku = String(sku).trim().toUpperCase();

    // Verifica se o bipado está na lista permitida
    if (!finalList.includes(normalizedSku)) {
        
        // Tentativa com Zero à esquerda (apenas para Barcode se não for admin, ou tudo se for admin)
        const skuWithZero = '0' + normalizedSku;
        
        // Verifica se o scan+0 bate com algum código permitido
        if (finalList.includes(skuWithZero)) {
            normalizedSku = skuWithZero;
        } else {
            // Se falhar, mensagem específica
            if (!isAdmin) {
                throw new Error(`Código de barras "${sku}" inválido ou não cadastrado.`);
            } else {
                throw new Error(`Código "${sku}" inválido.`);
            }
        }
    }

    // Pega o total real pendente
    const pendentesReais = await OrderItem.countPendingUnitsByProduct(lock.produto_codigo, plataforma, filters); // <-- REPASSA E FILTRA

    // --- LÓGICA DECIMAL ---
    // Calcula quanto falta bipar (Meta Total - O que já bipei no buffer)
    // .toFixed(4) evita bugs de ponto flutuante como 0.30000000004
    const jaBipado = Number(lock.quantidade_concluida);
    const faltaBipar = Number((pendentesReais - jaBipado).toFixed(4));

    if (faltaBipar <= 0) {
        throw new Error(`Quantidade excedida! O produto já foi concluído.`);
    }

    // Se faltar MENOS que 1 (ex: 0.25), o bip completa o decimal.
    // Se faltar MAIS ou IGUAL a 1 (ex: 5.0), o bip soma 1 unidade padrão.
    const increment = (faltaBipar < 1) ? faltaBipar : 1;

    // Atualiza Buffer com o incremento calculado
    const updatedLock = await PickingLock.updateProgress(lock.produto_codigo, increment, pendentesReais);

    return {
        scanned: Number(updatedLock.quantidade_concluida),
        total: Number(pendentesReais)
    };
  },

  async acquireProductByTerm({ userId, departmentCode, term, plataforma = 'mercado_livre', filters = {} }) {
    const cleanTerm = String(term).trim();
    if (!cleanTerm) return null;

    // Tenta interpretar como número para buscas exatas de código
    const numericTerm = parseInt(cleanTerm) || null;

    // A busca por termo não usa filtro restrito no WHERE inicial
    // pois o objetivo é encontrar a linha. Os filtros serão aplicados no OrderItem depois.
    const query = {
        text: `
            SELECT 
                oi.produto_codigo,
                (oi.quantidade_total - oi.quantidade_separada) as pendente_neste_pedido
            FROM order_items oi
            JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
            JOIN products p ON oi.produto_codigo = p.codigo
            WHERE 
                p.cod_departamento = $1
                AND oi.status != 'separado'
                AND mlo.plataforma = $6 -- <--- NOVO: Filtro de plataforma
                
                -- === A REGRA DE OURO (CONCORRÊNCIA) ===
                -- Exclui produtos que estão na tabela de locks presos por OUTRA pessoa.
                -- Se estiver travado por MIM (userId), pode retornar (caso eu pesquise o que já estou fazendo).
                AND oi.produto_codigo NOT IN (
                    SELECT produto_codigo 
                    FROM picking_locks 
                    WHERE user_id != $5
                )

                AND (
                    mlo.numero_venda ILIKE $2         -- Busca por Nº Pedido
                    OR mlo.comprador ILIKE $2         -- Busca por Cliente
                    OR oi.sku ILIKE $2                -- Busca por SKU
                    OR oi.descricao_produto ILIKE $2  -- Busca por Nome
                    OR ($3::int IS NOT NULL AND oi.produto_codigo = $3::int) -- Busca por ID
                    OR p.cod_barras::text = $4        -- Busca por EAN (Texto Exato)
                )
            ORDER BY mlo.data_venda ASC -- Prioridade FIFO
            LIMIT 1;
        `,
        // $1: Dept, $2: TermoLike, $3: TermoNum, $4: TermoExato, $5: UserID (Para checagem de Lock), $6: Plataforma
        values: [departmentCode, `%${cleanTerm}%`, numericTerm, cleanTerm, userId, plataforma]
    };

    const { rows } = await db.query(query.text, query.values);

    if (rows.length === 0) {
        return null; // Nada encontrado ou o item encontrado está em uso por outro colega
    }

    const targetProductCode = rows[0].produto_codigo;

    // --- TROCA DE SESSÃO ---
    
    // 1. Verifica se eu já estou travando ESSE produto (evita release/acquire desnecessário)
    const currentLock = await PickingLock.findByUser(userId);
    if (currentLock && currentLock.produto_codigo === targetProductCode) {
        // Se eu pesquisei o produto que JÁ estou fazendo, apenas retorno os dados atuais
        const product = await Product.findByCodigo(targetProductCode);
        const pendentesReais = await OrderItem.countPendingUnitsByProduct(targetProductCode, plataforma, filters); // <-- REPASSA
        return {
            lock: currentLock,
            product,
            orders: await this._getOrdersForProduct(targetProductCode, plataforma, filters), // <-- REPASSA
            status: { scanned: currentLock.quantidade_concluida, total: pendentesReais },
            foundViaSearch: true
        };
    }

    // 2. Se eu estava em OUTRO produto, solto ele primeiro
    if (currentLock) {
        await PickingLock.releaseByUser(userId);
    }

    // 3. Trava o novo produto encontrado para mim
    const pendentesReais = await OrderItem.countPendingUnitsByProduct(targetProductCode, plataforma, filters); // <-- REPASSA
    
    const lock = await PickingLock.acquire({
        produtoCodigo: targetProductCode,
        departamento: departmentCode,
        userId,
        quantidadeMeta: Number(pendentesReais)
    });

    // 4. Monta retorno
    const product = await Product.findByCodigo(targetProductCode);
    
    // Pequena repetição da lógica de listar pedidos (pode extrair para helper se quiser limpar código)
    const pendingItems = await OrderItem.findPendingByProduct(targetProductCode, plataforma, filters); // <-- REPASSA
    const ordersList = pendingItems.map(i => ({
        numero_venda: i.numero_venda,
        comprador: i.comprador,
        qty_needed: i.quantidade_total - i.quantidade_separada
    }));

    return {
        lock,
        product,
        orders: ordersList,
        status: {
            scanned: 0,
            total: Number(pendentesReais)
        },
        foundViaSearch: true
    };
  },

  // Helper auxiliar privado (opcional, para evitar repetição de código acima)
  async _getOrdersForProduct(produtoCodigo, plataforma = 'mercado_livre', filters = {}) { // <-- NOVO PARAM
      const pendingItems = await OrderItem.findPendingByProduct(produtoCodigo, plataforma, filters); // <-- REPASSA
      return pendingItems.map(i => ({
          numero_venda: i.numero_venda,
          comprador: i.comprador,
          qty_needed: i.quantidade_total - i.quantidade_separada
      }));
  },

  async confirmSeparation(userId, plataforma = 'mercado_livre', filters = {}) {
    const lock = await PickingLock.findByUser(userId);
    if (!lock) throw new Error('Sessão não encontrada.');
    
    // Garante conversão para número
    const scanned = Number(lock.quantidade_concluida);
    if (scanned <= 0) throw new Error('Nenhum item bipado.');

    // 1. Busca itens (FIFO - Com Filtros!)
    const itens = await OrderItem.findPendingByProduct(lock.produto_codigo, plataforma, filters); // <-- REPASSA
    
    let remaining = scanned;

    for (const item of itens) {
        if (remaining <= 0) break;
        
        // BLINDAGEM DECIMAL: Converte strings do banco para Number antes de calcular
        const qtdTotal = Number(item.quantidade_total);
        const qtdSeparada = Number(item.quantidade_separada);

        const needed = Number((qtdTotal - qtdSeparada).toFixed(4));
        
        // Pega o menor valor entre o que o pedido precisa e o que eu tenho na mão (remaining)
        const toTake = Math.min(needed, remaining);
        
        if (toTake > 0) {
            // Soma aritmética segura
            const novaQuantidade = Number((qtdSeparada + toTake).toFixed(4));

            // Atualiza o item no banco
            await OrderItem.updateQuantitySeparated(item.id, novaQuantidade);
            
            // Verifica se o PEDIDO PAI ficou completo
            await ensureOrderStatusFor(item.order_id);
            
            // Abate do saldo que tenho na mão
            remaining -= toTake;
            remaining = Number(remaining.toFixed(4)); // Limpa sujeira decimal
        }
    }

    await PickingLock.releaseByUser(userId);
    return { success: true };
  },

  async findDepartmentByTerm(term, plataforma = 'mercado_livre') {
    // Limpa o termo para evitar injeção básica e espaços
    const cleanTerm = String(term).trim();
    if (!cleanTerm) return null;

    // Tenta converter para número (para busca por ID/Código)
    const numericTerm = parseInt(cleanTerm) || null;
    
    const query = {
        text: `
            SELECT p.cod_departamento
            FROM order_items oi
            JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
            JOIN products p ON oi.produto_codigo = p.codigo
            WHERE 
                oi.status != 'separado' -- Só interessa o que está pendente
                AND mlo.plataforma = $4 -- <--- NOVO: Filtro de plataforma
                AND (
                    mlo.numero_venda ILIKE $1         -- Busca por Nº Pedido (Ex: MLB...)
                    OR mlo.comprador ILIKE $1         -- Busca por Nome do Comprador
                    OR oi.sku ILIKE $1                -- Busca por SKU
                    OR oi.descricao_produto ILIKE $1  -- Busca por Nome Produto
                    OR ($2::int IS NOT NULL AND oi.produto_codigo = $2::int) -- Busca por Código Interno
                    OR ($2::int IS NOT NULL AND p.cod_barras::text = $3)
                )
            ORDER BY mlo.data_venda ASC
            LIMIT 1;
        `,
        values: [`%${cleanTerm}%`, numericTerm, cleanTerm, plataforma]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] ? rows[0].cod_departamento : null;
  },

  async resetSeparation(userId) {
    const lock = await PickingLock.findByUser(userId);
    if (!lock) throw new Error('Sessão não encontrada.');

    // Chama o método novo que força zero
    await PickingLock.resetBuffer(userId);

    return { success: true, scanned: 0 };
  },

  async releaseSession(userId) {
    return PickingLock.releaseByUser(userId);
  },

  getDepartmentLabel(code) {
    return DEPARTMENT_LABELS[code] || `Departamento ${code}`;
  }
};

module.exports = ProductService;

