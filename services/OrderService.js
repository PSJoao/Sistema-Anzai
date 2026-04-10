// services/OrderService.js
// Camada de regras de negócio para pedidos (Mercado Livre, outros canais futuramente)

const crypto = require('crypto');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const AdmZip = require('adm-zip');
const db = require('../config/database');
const axios = require('axios');
const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const OrderItem = require('../models/OrderItem');
const Product = require('../models/Product');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

const PDF_STORAGE_DIR = path.join(__dirname, '..', 'pdfEtiquetas');
fs.promises.mkdir(PDF_STORAGE_DIR, { recursive: true }).catch(console.error);

const HubOrderService = require('./HubOrderService');

const PLATFORM_KEYS = {
  MERCADO_LIVRE: 'mercado_livre',
  AMAZON: 'amazon',
  SHOPEE: 'shopee'
};

const STATUS_TRANSLATIONS = {
  pendente: 'Pendentes',
  separado: 'Separados',
  em_romaneio: 'Embalados',
  enviado: 'Enviados',
  agendado: 'Agendados',
  entregue: 'Entregues',
  // NOVOS STATUS:
  devolucao_analise: 'Devolução em Análise',
  devolucao_concluida: 'Devolução Concluída',
  nao_entregue: 'Não Entregue',
  venda_concretizada: 'Venda Concretizada'
};

const NUMERIC_COLUMNS = new Set([
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'preco_unitario'
]);

function checkIsFlex(zplContent) {
    if (!zplContent) return false;
    // Verifica a presença explícita de "Envio Flex" no ZPL
    return /Envio Flex/i.test(zplContent);
}

function canonicalizeHeader(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Amazon: Decodifica string Hex do ZPL (ex: _4F -> O)
function decodeZplHex(str) {
    return str.replace(/_([0-9A-Fa-f]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
}

// Shopee: Renderiza ZPL, Recorta (sem zoom digital) e Limpa para OCR
async function performOcrOnZpl(zpl) {
    try {
        // 1. Renderiza ZPL para Imagem PNG (Labelary)
        // Usamos 12dpmm para garantir alta definição original
        const response = await axios.post('http://api.labelary.com/v1/printers/12dpmm/labels/4x6/0/', zpl, {
            responseType: 'arraybuffer',
            headers: { 'Accept': 'image/png' }
        });

        // 2. Processamento Inteligente (Sharp)
        const image = sharp(response.data);
        const metadata = await image.metadata();

        // Lógica de Recorte Ajustada:
        let leftPos = Math.floor(metadata.width / 2) - 420;
        if (leftPos < 0) leftPos = 0; 

        const extractRegion = {
            left: leftPos, 
            top: 0,
            width: Math.floor(metadata.width / 2) + 50, // Um pouco mais de largura para garantir
            // "Diminuímos o zoom" do recorte aumentando a área vertical capturada
            // Antes subtraía 455, agora 400 (sobra mais altura de imagem)
            height: Math.floor(metadata.height / 3) - 400 
        };

        const processedBuffer = await image
            .extract(extractRegion)
            .grayscale()   
            .threshold(150) // Preto e branco puro para alto contraste
            // --- REMOVIDO O RESIZE (ZOOM) ---
            // Usamos o tamanho original (nítido) em vez de esticar artificialmente
            .extend({ 
                top: 30, bottom: 30, left: 30, right: 30, // Mais borda branca para o OCR respirar
                background: { r: 255, g: 255, b: 255 }
            })
            .toBuffer();

        // --- DEBUG: Salva para você conferir ---
        await fs.promises.writeFile('debug_shopee.png', processedBuffer);
        console.log('[OrderService] Imagem de debug salva: debug_shopee.png');

        // 3. Realiza OCR
        const { data: { text } } = await Tesseract.recognize(processedBuffer, 'eng', {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789: ', // Lista branca rigorosa
            tessedit_pageseg_mode: '6' // Assume uma única linha/bloco de texto uniforme
        });
        
        console.log('[OrderService] Texto lido pelo OCR:', text);

        return text;

    } catch (e) {
        console.error('[OrderService] Erro no OCR da Shopee:', e.message);
        return '';
    }
}
// ---------------------------------

const RAW_HEADER_MAP = {
  'N.º de venda': 'numero_venda',
  'Data da venda': 'data_venda',
  'Estado': 'estado',
  'Descrição do status': 'descricao_status',
  'Pacote de diversos produtos': 'pacote_diversos_produtos',
  'Pertence a um kit': 'pertence_kit',
  'Unidades': 'unidades',
  'Receita por produtos (BRL)': 'receita_produtos',
  'Receita por acréscimo no preço (pago pelo comprador)': 'receita_acrescimo',
  'Taxa de parcelamento equivalente ao acréscimo': 'taxa_parcelamento_acrescimo',
  'Tarifa de venda e impostos (BRL)': 'tarifa_venda_impostos',
  'Receita por envio (BRL)': 'receita_envio',
  'Tarifas de envio (BRL)': 'tarifas_envio',
  'Cancelamentos e reembolsos (BRL)': 'cancelamentos_reembolsos',
  'Total (BRL)': 'total',
  'Mês de faturamento das suas tarifas': 'mes_faturamento_tarifas',
  'Venda por publicidade': 'venda_publicidade',
  'SKU': 'sku',
  '# de anúncio': 'numero_anuncio',
  'Canal de venda': 'canal_venda',
  'Loja oficial': 'loja_oficial',
  'Título do anúncio': 'titulo_anuncio',
  'Variação': 'variacao',
  'Preço unitário de venda do anúncio (BRL)': 'preco_unitario',
  'Tipo de anúncio': 'tipo_anuncio',
  'NF-e em anexo': 'nfe_anexo',
  'Dados pessoais ou da empresa': 'dados_pessoais_empresa',
  'Tipo e número do documento': 'documento',
  'Endereço': 'endereco',
  'Tipo de contribuinte': 'tipo_contribuinte',
  'Inscrição estadual': 'inscricao_estadual',
  'Comprador': 'comprador',
  'Negócio': 'negocio',
  'CPF': 'cpf',
  'Endereço_2': 'endereco_entrega',
  'Cidade': 'cidade',
  'Estado_2': 'estado_entrega',
  'CEP': 'cep',
  'País': 'pais'
};

const HEADER_MAP_MERCADO_LIVRE = Object.entries(RAW_HEADER_MAP).reduce((acc, [rawKey, value]) => {
  const canonicalKey = canonicalizeHeader(rawKey);
  if (canonicalKey) {
    acc[canonicalKey] = value;
  }
  return acc;
}, {});

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractPackIdFromZpl(zplContent) {
    // Regex atualizada para suportar "Pack ID:" OU "Venda:"
    // (?:Pack ID|Venda) -> Grupo de não captura que aceita um ou outro
    // \s* -> Espaços opcionais
    // (\d+) -> Captura o prefixo (Ex: 20000)
    // [\s\S]*? -> Ignora tudo no meio (coordenadas, quebras de linha) até achar...
    // \^FD(\d{5,})\^FS -> O comando com o número longo subsequente
    const match = zplContent.match(/(?:Pack ID|Venda):\s*(\d+)[\s\S]*?\^FD(\d{5,})\^FS/i);
    
    if (match && match[1] && match[2]) {
        // Concatena: 20000 + 14501948080 -> 2000014501948080
        return `${match[1]}${match[2]}`;
    }
    return null;
}

function extractShippingDateFromZpl(zplContent) {
    if (!zplContent) return null;

    // TENTATIVA 1: Padrão "Despachar:" (Etiqueta Normal)
    // Ex: Despachar: 30/dec
    let match = zplContent.match(/Despachar:[\s\S]*?(\d{1,2})\/([a-zç]{3})/i);
    
    // TENTATIVA 2: Padrão Flex (Se não achou Despachar)
    // O Flex usa "Entrega:" e a data vem em um campo ^FD separado com hífen
    // Ex: ^FD12-Jan^FS
    if (!match) {
        match = zplContent.match(/\^FD(\d{1,2})-([a-zç]{3})\^FS/i);
    }

    if (!match) return null;

    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase();

    // MELHORIA 2: Mapa Híbrido (Português e Inglês) para garantir compatibilidade
    const months = {
        // Português
        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
        // Inglês (comum em ZPLs gerados globalmente)
        'feb': 1, 'apr': 3, 'may': 4, 'aug': 7, 'sep': 8, 'oct': 9, 'dec': 11
    };

    if (months[monthStr] === undefined) return null;

    const now = new Date();
    // Usa o ano atual para novos uploads (o script retroativo cuida da virada de ano)
    let year = now.getFullYear();

    // Lógica simples de virada de ano (se estamos em Dez e a etiqueta é Jan, é ano que vem)
    // Se estamos em Jan e etiqueta é Dez, pode ser ano passado (mas uploads geralmente são futuros)
    const currentMonth = now.getMonth();
    const labelMonth = months[monthStr];

    if (currentMonth === 11 && labelMonth === 0) {
        year++;
    }

    // Cria a data (meio-dia UTC)
    return new Date(Date.UTC(year, labelMonth, day, 12, 0, 0));
}

function toInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }

  const strValue = String(value).trim();
  if (!strValue) {
    return null;
  }

  const normalized = strValue.replace(',', '.');
  const floatVal = Number.parseFloat(normalized);

  if (Number.isFinite(floatVal)) {
    return Math.trunc(floatVal);
  }

  const digitsOnly = strValue.replace(/[^0-9-]/g, '');
  if (!digitsOnly) {
    return null;
  }

  const parsedInt = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsedInt) ? parsedInt : null;
}

function toBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['sim', 'yes', 'true', '1'].includes(normalized)) {
    return true;
  }
  if (['não', 'nao', 'no', 'false', '0'].includes(normalized)) {
    return false;
  }
  return null;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeHeaders(headers) {
  let enderecoCount = 0;
  let estadoCount = 0;

  return headers.map((header) => {
    if (!header) {
      return header;
    }

    if (header === 'Endereço') {
      enderecoCount += 1;
      return enderecoCount === 1 ? header : 'Endereço_2';
    }

    if (header === 'Estado') {
      estadoCount += 1;
      return estadoCount === 1 ? header : 'Estado_2';
    }

    return header;
  });
}

function parseMercadoLivreWorksheet(fileBuffer, options = {}) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
 
  if (!worksheet) {
    throw new Error('Planilha sem aba principal detectada.');
  }
 
  const rows = XLSX.utils.sheet_to_json(worksheet, {
     header: 1,
     raw: true,
     defval: null
   });
 
   if (rows.length < 7) {
     return [];
   }
 
  const normalizedHeaders = normalizeHeaders(rows[5]);

  const headerInfos = normalizedHeaders.map((header) => {
    if (!header) {
      return null;
    }
    const canonical = canonicalizeHeader(header);
    if (!canonical) {
      return null;
    }
    const internalKey = HEADER_MAP_MERCADO_LIVRE[canonical];
    if (!internalKey) {
      return null;
    }
    return { internalKey, canonical };
  });

  const numeroVendaIndex = headerInfos.findIndex((info) => info?.internalKey === 'numero_venda');
  const skuIndex = headerInfos.findIndex((info) => info?.internalKey === 'sku');

  if (numeroVendaIndex === -1 || skuIndex === -1) {
    throw new Error('As colunas "N.º de venda" ou "SKU" não foram reconhecidas na planilha.');
  }

  const dataRows = rows.slice(6).filter((row) => {
    return row && row[numeroVendaIndex] && row[skuIndex];
  });

  return dataRows.map((row) => {
    const normalizedRow = {};

    headerInfos.forEach((info, headerIndex) => {
      if (!info) {
        return;
      }

      let cellValue = row[headerIndex];

      if (NUMERIC_COLUMNS.has(info.internalKey)) {
        cellValue = toNumber(cellValue);
      } else if (info.internalKey === 'data_venda') {
        cellValue = toDate(cellValue);
      } else if (['pacote_diversos_produtos', 'pertence_kit', 'nfe_anexo'].includes(info.internalKey)) {
        cellValue = toBoolean(cellValue);
      } else if (typeof cellValue === 'string') {
        cellValue = cellValue.trim();
      }

      normalizedRow[info.internalKey] = cellValue;
    });

    normalizedRow.status_bucket = 'pendente';
    normalizedRow.plataforma = PLATFORM_KEYS.MERCADO_LIVRE;
    normalizedRow.uploaded_at = new Date();

    if (options.importBatchId) {
      normalizedRow.import_batch_id = options.importBatchId;
    }

    if (options.fileName) {
      normalizedRow.arquivo_original = options.fileName;
    }

    if (options.uploadedBy) {
      normalizedRow.uploaded_by = options.uploadedBy;
    }

    return normalizedRow;
  });
}

const OrderService = {

  async getCompanies() {
    return await MercadoLivreOrder.getDistinctCompanies();
  },

  getAvailablePlatforms() {
    return [
      {
        id: PLATFORM_KEYS.MERCADO_LIVRE,
        label: 'Mercado Livre',
        descricao: 'Importação de etiquetas do Mercado Livre.'
      },
      {
        id: PLATFORM_KEYS.AMAZON,
        label: 'Amazon',
        descricao: 'Importação de etiquetas da Amazon.'
      },
      {
        id: PLATFORM_KEYS.SHOPEE,
        label: 'Shopee',
        descricao: 'Importação de etiquetas da Shopee.'
      }
    ];
  },

  async generateProductivityReport(startDate, endDate) {
    // 1. Query de Separação Geral (Inalterada)
    const querySeparacao = `
        SELECT u.username, COUNT(l.id) AS total_logs
        FROM users u
        INNER JOIN system_logs l ON u.id = l.user_id
        WHERE l.action_type = 'SEPARACAO_ITEM'
          AND l.created_at::date >= $1 
          AND l.created_at::date <= $2
        GROUP BY u.username
        ORDER BY total_logs DESC;
    `;

    // 2. Query de Empacotamento - Exclusiva Mercado Livre
    // Procura no texto do JSON a chave "numero_venda" com valor começando em "MLB"
    const queryEmpacotamentoML = `
        SELECT u.username, COUNT(l.id) AS total_logs
        FROM users u
        INNER JOIN system_logs l ON u.id = l.user_id
        WHERE l.action_type = 'EMPACOTAMENTO_CONCLUIDO'
          AND l.created_at::date >= $1 
          AND l.created_at::date <= $2
          AND l.details LIKE '%"numero_venda":"MLB%'
        GROUP BY u.username
        ORDER BY total_logs DESC;
    `;

    // 3. Query de Empacotamento - Exclusiva Shopee
    // Procura no texto do JSON a chave "numero_venda" com valor começando em "SHP_"
    const queryEmpacotamentoShopee = `
        SELECT u.username, COUNT(l.id) AS total_logs
        FROM users u
        INNER JOIN system_logs l ON u.id = l.user_id
        WHERE l.action_type = 'EMPACOTAMENTO_CONCLUIDO'
          AND l.created_at::date >= $1 
          AND l.created_at::date <= $2
          AND l.details LIKE '%"numero_venda":"SHP_%'
        GROUP BY u.username
        ORDER BY total_logs DESC;
    `;

    // Executa as TRÊS queries em paralelo no banco de dados
    const [resSep, resEmpML, resEmpShopee] = await Promise.all([
      db.query(querySeparacao, [startDate, endDate]),
      db.query(queryEmpacotamentoML, [startDate, endDate]),
      db.query(queryEmpacotamentoShopee, [startDate, endDate])
    ]);

    // Cria o Workbook do Excel
    const wb = XLSX.utils.book_new();

    // Aba 1: Separação (Geral)
    const wsSep = XLSX.utils.json_to_sheet(resSep.rows);
    XLSX.utils.book_append_sheet(wb, wsSep, "Separação Geral");

    // Aba 2: Empacotamento ML
    const wsEmpML = XLSX.utils.json_to_sheet(resEmpML.rows);
    XLSX.utils.book_append_sheet(wb, wsEmpML, "Empacotamento ML");

    // Aba 3: Empacotamento Shopee
    const wsEmpShopee = XLSX.utils.json_to_sheet(resEmpShopee.rows);
    XLSX.utils.book_append_sheet(wb, wsEmpShopee, "Empacotamento Shopee");

    // Gera o buffer do Excel final
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },

   /**
   * Processa o arquivo de medidas e pesos de embalagens.
   * 1. Verifica duplicidades no arquivo.
   * 2. Limpa a tabela (Truncate).
   * 3. Insere os novos dados.
   */
  async importPackagingMeasures(buffer) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets[0]; // Pega a primeira aba

      const measures = [];
      const mlbSet = new Set();
      const duplicates = [];

      // Itera a partir da linha 2 (pula cabeçalho)
      worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;

          // Coluna A: mlb_anuncio
          // Coluna B: altura
          // Coluna C: comprimento
          // Coluna D: largura
          // Coluna E: peso
          const mlb = row.getCell(1).value ? row.getCell(1).value.toString().trim() : null;
          
          if (mlb) {
              if (mlbSet.has(mlb)) {
                  duplicates.push(mlb);
              } else {
                  mlbSet.add(mlb);
                  measures.push({
                      mlb_anuncio: mlb,
                      altura: parseFloat(row.getCell(2).value || 0),
                      comprimento: parseFloat(row.getCell(3).value || 0),
                      largura: parseFloat(row.getCell(4).value || 0),
                      peso: parseFloat(row.getCell(5).value || 0)
                  });
              }
          }
      });

      // Validação de Redundância
      /*if (duplicates.length > 0) {
          throw new Error(`Arquivo contém códigos MLB duplicados: ${duplicates.join(', ')}. Corrija e tente novamente.`);
      }*/

      if (measures.length === 0) {
          throw new Error('Nenhum dado válido encontrado na planilha.');
      }

      const client = await db.connect();
      try {
          await client.query('BEGIN');

          // 1. Limpeza Total da Tabela
          await client.query('TRUNCATE TABLE packaging_measures RESTART IDENTITY');

          // 2. Inserção em Batch
          const insertQuery = `
              INSERT INTO packaging_measures (mlb_anuncio, altura, comprimento, largura, peso)
              VALUES ($1, $2, $3, $4, $5)
          `;

          for (const item of measures) {
              await client.query(insertQuery, [
                  item.mlb_anuncio,
                  item.altura,
                  item.comprimento,
                  item.largura,
                  item.peso
              ]);
          }

          await client.query('COMMIT');
          return { total: measures.length, duplicates: duplicates };

      } catch (error) {
          await client.query('ROLLBACK');
          console.error('[OrderService] Erro ao importar medidas:', error);
          throw error;
      } finally {
          client.release();
      }
  },

  /**
   * Extrai o número do pedido do conteúdo ZPL.
   */
  async extractOrderNumberFromZpl(zplContent, plataforma) {
    
    // --- 1. MERCADO LIVRE ---
    if (plataforma === PLATFORM_KEYS.MERCADO_LIVRE) {
      const match = zplContent.match(/"id":"(\d+)"/);
      if (match && match[1]) {
        return `MLB_SHML${match[1]}`;
      }
    }
    
    // --- 2. AMAZON ---
    if (plataforma === PLATFORM_KEYS.AMAZON) {
        const lineMatch = zplContent.match(/\^FD(.*_4F_72_64_65_72_20_49_44_3A.*)\^FS/);
        
        if (lineMatch) {
            const fullHex = lineMatch[1];
            const decoded = decodeZplHex(fullHex); 
            const idMatch = decoded.match(/Order ID:\s*([\d-]+)/i);
            
            if (idMatch) return `AMZ_${idMatch[1]}`;
        }
    }

    // --- 3. SHOPEE ---
    if (plataforma === PLATFORM_KEYS.SHOPEE) {
        // Tentativa A: Texto plano
        let match = zplContent.match(/ID pedido:?\s*([A-Z0-9]+)/i);
        if (match) return `SHP_${match[1]}`;

        // Tentativa B: Imagem Comprimida (OCR)
        if (zplContent.includes('~DGR') || zplContent.includes('^GF')) {
            console.log('[OrderService] Etiqueta Shopee gráfica detectada. Iniciando OCR...');
            const text = await performOcrOnZpl(zplContent);
            
            match = text.match(/ID pedido:?\s*([A-Z0-9]+)/i);
            if (match) {
                console.log(`[OrderService] OCR Sucesso: ${match[1]}`);
                return `SHP_${match[1]}`;
            }
        }
    }

    return null;
  },

  async processLabelUpload(buffer, fileName, batchId, plataforma) {
    let labelsToInsert = [];
    const isZip = fileName.toLowerCase().endsWith('.zip');
    
    // Fila de tarefas (conteúdo + nome original)
    const tasks = [];

    // Função interna para enfileirar conteúdo, tratando múltiplas etiquetas
    const queueContent = (content, originName) => {
        // 1. EXCEÇÃO SHOPEE (IMAGEM COMPLETA):
        // A trava de segurança agora verifica se é SHOPEE.
        // Mercado Livre usa ^GF para logotipos, mas DEVE ser dividido.
        // A Shopee às vezes manda um arquivo único gigante onde o ZPL é uma imagem só.
        const isShopeeGraphic = plataforma === PLATFORM_KEYS.SHOPEE && 
                                (content.includes('~DGR') || content.includes('^GF'));

        if (isShopeeGraphic) {
             tasks.push({ content: content, name: originName });
             return;
        }

        // 2. PADRÃO ZPL (Mercado Livre / Amazon / Shopee Texto):
        // Procuramos por múltiplos blocos de etiqueta (iniciando em ^XA e terminando em ^XZ)
        // O regex [\s\S]*? pega tudo entre os comandos, inclusive quebras de linha.
        const zplMatches = content.match(/\^XA[\s\S]*?\^XZ/g);

        if (zplMatches && zplMatches.length > 0) {
            // Se encontrou blocos (tripa), adiciona cada um como uma tarefa separada
            zplMatches.forEach(block => {
                tasks.push({ content: block, name: originName });
            });
        } else {
            // Se não achou o padrão de blocos (arquivo vazio ou formato estranho), 
            // tenta processar o conteúdo inteiro como fallback
            tasks.push({ content: content, name: originName });
        }
    };

    // Leitura do arquivo (Zip ou Texto Solto)
    if (isZip) {
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      zipEntries.forEach((entry) => {
        if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.txt')) {
            const content = entry.getData().toString('utf8');
            queueContent(content, entry.entryName);
        }
      });
    } else {
      const content = buffer.toString('utf8');
      queueContent(content, fileName);
    }

    // Processamento Sequencial das Tarefas
    let insertedCount = 0;
    const priorityList = [];

    for (const task of tasks) {
        // O await aqui é crucial
        const orderNumber = await this.extractOrderNumberFromZpl(task.content, plataforma);
        
        // Extrai o Pack ID se for Mercado Livre
        const packId = (plataforma === PLATFORM_KEYS.MERCADO_LIVRE) 
            ? extractPackIdFromZpl(task.content) 
            : null;

        const shippingDate = (plataforma === PLATFORM_KEYS.MERCADO_LIVRE)
            ? extractShippingDateFromZpl(task.content)
            : null;

        const isFlexBool = (plataforma === PLATFORM_KEYS.MERCADO_LIVRE)
            ? checkIsFlex(task.content)
            : false;

        const isFlex = isFlexBool ? 't' : 'f';
            
        if (orderNumber) {
             await db.query(
                `INSERT INTO shipping_labels (file_name, order_number, zpl_content, batch_id, plataforma, pack_id, data_envio_limite) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (order_number) 
                DO UPDATE SET 
                    zpl_content = EXCLUDED.zpl_content,
                    batch_id = EXCLUDED.batch_id,
                    file_name = EXCLUDED.file_name,
                    pack_id = EXCLUDED.pack_id,
                    data_envio_limite = EXCLUDED.data_envio_limite,
                    created_at = NOW()`,
                [task.name, orderNumber, task.content, batchId, plataforma, packId, shippingDate]
            );

            let updateFields = [];
            let updateValues = [];
            let paramCount = 1;
            if (packId) {
                updateFields.push(`pack_id = $${paramCount++}`);
                updateValues.push(packId);
            }
            if (shippingDate) {
                updateFields.push(`data_envio_limite = $${paramCount++}`);
                updateValues.push(shippingDate);
            }
            if (isFlex) {
                updateFields.push(`is_flex = $${paramCount++}`);
                updateValues.push(isFlex);
            }

            if (updateFields.length > 0) {
                updateValues.push(orderNumber); // Último parâmetro é o WHERE
                await db.query(
                    `UPDATE mercado_livre_orders SET ${updateFields.join(', ')} WHERE numero_venda = $${paramCount}`,
                    updateValues
                );
            }

            priorityList.push(orderNumber);
            insertedCount++;
        } else {
             console.warn(`[OrderService] ID não identificado na etiqueta: ${task.name}`);
        }
    }

    if (priorityList.length > 0) {
        console.log(`[OrderService] Acionando busca prioritária para ${priorityList.length} etiquetas.`);
        // Não usamos 'await' para não travar a resposta da interface (o user não precisa esperar a Citel responder)
        HubOrderService.syncPriorityList(priorityList)
            .catch(err => console.error('[OrderService] Erro ao disparar sync prioritário:', err));
    }

    return insertedCount;
  },

  async processShopeePdfUpload(buffer, originalFilename, batchId) {
    const originalDoc = await PDFDocument.load(buffer);
    const pageCount = originalDoc.getPageCount();
    const pages = originalDoc.getPages();

    let insertedCount = 0;
    const priorityList = [];
    
    for (let i = 0; i < pageCount; i++) {
        // Extrai o texto da página inteira
        const tempDoc = await PDFDocument.create();
        const [copied] = await tempDoc.copyPages(originalDoc, [i]);
        tempDoc.addPage(copied);
        const tempBuffer = Buffer.from(await tempDoc.save());
        const pdfParseFunc = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
        const parsed = await pdfParseFunc(tempBuffer);

        // Regex para capturar os números de pedido e a data
        const regexPedido = /Pedido:\s*([A-Z0-9]{12,25})/gi;
        const regexDireta = /\b(\d{6}[A-Z0-9]{8})\b/gi; // Fallback
        const regexData = /\b(\d{2}\/\d{2}\/\d{4})\b/i;

        const pedidosEncontrados = [];
        let match;
        
        while ((match = regexPedido.exec(parsed.text)) !== null) {
            pedidosEncontrados.push(match[1]);
        }

        if (pedidosEncontrados.length === 0) {
            while ((match = regexDireta.exec(parsed.text)) !== null) {
                pedidosEncontrados.push(match[1]);
            }
        }

        // Lógica de captura da data
        let dataEnvioLimite = null;
        const dataMatch = parsed.text.match(regexData);

        if (dataMatch) {
            const [dia, mes, ano] = dataMatch[1].split('/');
            dataEnvioLimite = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
        }

        const pedidosUnicos = [...new Set(pedidosEncontrados)];

        const page = pages[i];
        const { width, height } = page.getSize();

        // Quadrantes: Top-Left, Bottom-Left, Top-Right, Bottom-Right
        const quadrants = [
            { x: 0, y: -(height / 2) },            
            { x: 0, y: 0 },                        
            { x: -(width / 2), y: -(height / 2) }, 
            { x: -(width / 2), y: 0 }              
        ];

        for (let j = 0; j < pedidosUnicos.length; j++) {
            if (j >= 4) break; // Segurança para não exceder a página

            const orderNumber = `SHP_${pedidosUnicos[j]}`;

            // --- Cria um documento isolado para esta etiqueta ---
            const singleLabelDoc = await PDFDocument.create();
            // Embutir apenas a página atual (i) do PDF original neste novo documento
            const [embeddedPage] = await singleLabelDoc.embedPdf(buffer, [i]);

            // Cria a página A6 (metade da largura e metade da altura)
            const newPage = singleLabelDoc.addPage([width / 2, height / 2]);
            newPage.drawPage(embeddedPage, {
                x: quadrants[j].x,
                y: quadrants[j].y,
                width: width,
                height: height
            });

            // --- Define um nome único para o arquivo do pedido ---
            const individualPdfName = `shopee_${orderNumber}_${Date.now()}.pdf`;
            const individualPdfPath = path.join(PDF_STORAGE_DIR, individualPdfName);

            // Salva o arquivo individual no servidor
            const singlePdfBytes = await singleLabelDoc.save();
            await fs.promises.writeFile(individualPdfPath, singlePdfBytes);
            // ----------------------------------------------------------

            // Insere na base de dados (associando o arquivo individual)
            await db.query(
                `INSERT INTO shipping_labels (file_name, order_number, batch_id, plataforma, data_envio_limite, pdf_file_name, zpl_content, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (order_number) 
                DO UPDATE SET 
                    batch_id = EXCLUDED.batch_id,
                    file_name = EXCLUDED.file_name,
                    data_envio_limite = EXCLUDED.data_envio_limite,
                    pdf_file_name = EXCLUDED.pdf_file_name,
                    zpl_content = EXCLUDED.zpl_content,
                    created_at = NOW()`,
                [originalFilename, orderNumber, batchId, PLATFORM_KEYS.SHOPEE, dataEnvioLimite, individualPdfName, '[PDF_SHOPEE]']
            );

            priorityList.push(orderNumber);
            insertedCount++;
        }
    }

    // Despacha para a Citel (Prioritário)
    if (priorityList.length > 0) {
        console.log(`[OrderService] Acionando busca prioritária para ${priorityList.length} etiquetas Shopee.`);
        HubOrderService.syncPriorityList(priorityList)
            .catch(err => console.error('[OrderService] Erro ao disparar sync prioritário:', err));
    }

    return insertedCount;
  },

  // Gera a planilha modelo para o usuário baixar
  async generateStatusImportTemplate() {
    const wb = XLSX.utils.book_new();
    const headers = [
      ['PENDENTE', 'SEPARADO', 'EM ROMANEIO', 'CANCELADO', 'ENVIADO'],
      ['12345', '12346', '12347', '12348', '12349'],
      ['Digite apenas', 'os números', 'das NFes', 'nas colunas', 'desejadas']
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo Importação');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },

  // Processa o arquivo enviado
  async processStatusImport(filePath) {
    const workbook = XLSX.read(filePath, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const cellA1 = sheet["A1"] ? sheet["A1"].v : null;
    if (cellA1 !== "PENDENTE") {
        throw new Error("Arquivo inválido: a planilha utilizada deve ser a modelo!");
    }
    
    // Converte para JSON matriz (linhas x colunas)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Ignora cabeçalho (linha 0) e começa da linha 1
    const dataRows = rows.slice(1);

    const mapStatusToNfes = {
        pendente: [],
        separado: [],
        em_romaneio: [],
        cancelado: [],
        enviado: [] 
    };

    // Varre as colunas A(0) até E(4)
    dataRows.forEach(row => {
        if (row[0]) mapStatusToNfes.pendente.push(row[0]);
        if (row[1]) mapStatusToNfes.separado.push(row[1]);
        if (row[2]) mapStatusToNfes.em_romaneio.push(row[2]);
        if (row[3]) mapStatusToNfes.cancelado.push(row[3]);
        if (row[4]) mapStatusToNfes.enviado.push(row[4]);
    });

    const results = {
        processed: 0,
        errors: [],
        details: {}
    };

    // Função auxiliar para processar um lote (MANTIDA IGUAL, APENAS COPIADA PARA CONTEXTO)
    const processBatch = async (identifiers, targetStatus) => {
        if (!identifiers.length) return;
        const rawInputs = identifiers.map(id => String(id).trim());
        const foundByNfeRows = await MercadoLivreOrder.findNumeroVendaByNfe(rawInputs);
        const orderNumbersFromNfe = foundByNfeRows.map(r => r.numero_venda);
        const inputsResolvedAsNfe = foundByNfeRows.map(r => String(r.nfe_numero));
        const unresolvedInputs = rawInputs.filter(input => !inputsResolvedAsNfe.includes(input));

        let orderNumbersFromDirect = [];
        let inputsResolvedAsOrder = [];

        if (unresolvedInputs.length > 0) {
            const foundByOrderRows = await MercadoLivreOrder.findByNumeroVendas(unresolvedInputs);
            orderNumbersFromDirect = foundByOrderRows.map(r => r.numero_venda);
            inputsResolvedAsOrder = orderNumbersFromDirect;
        }

        const allValidOrderNumbers = [...new Set([...orderNumbersFromNfe, ...orderNumbersFromDirect])];

        const allResolved = [...inputsResolvedAsNfe, ...inputsResolvedAsOrder];
        const missing = rawInputs.filter(input => {
            return !allResolved.includes(input) && !orderNumbersFromDirect.includes(input);
        });

        if (missing.length > 0) {
            results.errors.push(`Status '${targetStatus}': Códigos não encontrados: ${missing.join(', ')}`);
        }

        if (allValidOrderNumbers.length > 0) {
            const ordersToUpdate = await MercadoLivreOrder.findByNumeroVendas(allValidOrderNumbers);
            const ids = ordersToUpdate.map(o => o.id);

            // Chama a função central que agora lida com a criação de lotes
            const count = await this.updateManualStatus(ids, targetStatus);
            
            results.processed += count;
            results.details[targetStatus] = (results.details[targetStatus] || 0) + count;
        }
    };

    // Executa em sequência
    await processBatch(mapStatusToNfes.pendente, 'pendente');
    await processBatch(mapStatusToNfes.separado, 'separado');
    await processBatch(mapStatusToNfes.em_romaneio, 'em_romaneio');
    await processBatch(mapStatusToNfes.cancelado, 'cancelado');
    await processBatch(mapStatusToNfes.enviado, 'enviado'); 

    return results;
  },
  // ---------------------

  async importMercadoLivrePlanilha(fileBuffer, { fileName, uploadedBy, importBatchId }) {
    const parsedRows = parseMercadoLivreWorksheet(fileBuffer, {
      fileName,
      uploadedBy,
      importBatchId
    });

    if (parsedRows.length === 0) {
      return { inserted: 0, updated: 0, total: 0 };
    }

    const result = await MercadoLivreOrder.bulkUpsert(parsedRows);

    const uniqueOrderNumbers = Array.from(
      new Set(parsedRows.map((row) => row.numero_venda).filter(Boolean))
    );

    const orderRecords = await MercadoLivreOrder.findByNumeroVendas(uniqueOrderNumbers);
    const orderMap = new Map();

    orderRecords.forEach((record) => {
      const key = `${record.numero_venda}::${record.sku || ''}::${record.variacao || ''}`;
      orderMap.set(key, record.id);
    });

    const aggregated = new Map();
    const missingProducts = new Set();
    const missingOrders = new Set();

    const candidateProductCodes = Array.from(
      new Set(
        parsedRows
          .map((row) => toInteger(row.sku))
          .filter((codigo) => codigo !== null && codigo !== undefined)
      )
    );

    const existingProductCodes = new Set(await Product.findExistingCodes(candidateProductCodes));

    parsedRows.forEach((row) => {
      const sku = row.sku;
      const orderKey = `${row.numero_venda}::${sku || ''}::${row.variacao || ''}`;
      const orderId = orderMap.get(orderKey);

      if (!orderId) {
        missingOrders.add(orderKey);
        return;
      }

      const produtoCodigo = toInteger(sku);
      if (!produtoCodigo) {
        missingProducts.add(sku);
        return;
      }

      if (!existingProductCodes.has(produtoCodigo)) {
        missingProducts.add(sku || produtoCodigo);
        return;
      }

      const quantidade = Number(row.unidades || 0);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return;
      }

      const aggregateKey = `${orderId}::${produtoCodigo}::${sku}`;
      const descricao = [row.titulo_anuncio, row.variacao].filter(Boolean).join(' - ');

      if (!aggregated.has(aggregateKey)) {
        aggregated.set(aggregateKey, {
          order_id: orderId,
          produto_codigo: produtoCodigo,
          sku,
          descricao_produto: descricao || row.titulo_anuncio || String(produtoCodigo),
          quantidade_total: 0,
          quantidade_separada: 0,
          status: 'pendente'
        });
      }

      const current = aggregated.get(aggregateKey);
      current.quantidade_total += quantidade;
    });

    let orderItemResult = { inserted: 0, updated: 0 };
    if (aggregated.size > 0) {
      orderItemResult = await OrderItem.bulkUpsert(Array.from(aggregated.values()));
    }

    if (missingProducts.size > 0) {
      console.warn('[OrderService] Produtos não encontrados na base:', Array.from(missingProducts.values()));
    }

    if (missingOrders.size > 0) {
      console.warn('[OrderService] Registos de pedido não conciliados:', missingOrders.size);
    }

    return {
      ...result,
      total: parsedRows.length,
      orderItems: orderItemResult,
      missingProducts: Array.from(missingProducts.values()),
      missingOrders: Array.from(missingOrders.values())
    };
  },

  /**
   * Obtém os dados para o Dashboard Avançado com paginação, filtros por data e totais das abas.
   * @param {object} params
   * @param {string} params.search - Busca textual
   * @param {string} params.filterType - 'hoje', 'atrasados', 'futuros', 'agendados', 'todos'
   * @param {number} params.page - Página atual
   */
  async getAdvancedDashboard(params) {
    const page = parseInt(params.page) || 1;
    const limit = 50; 
    const search = params.search || '';
    const statusFilter = params.statusFilter || 'todos';
    const dateFilter = params.dateFilter || 'hoje';
    const companyFilter = params.companyFilter || 'todos';
    const divergenceFilter = params.divergenceFilter;
    const flexFilter = params.flexFilter;
    const mediationFilter = params.mediationFilter || 'todos';
    const platformFilter = params.platformFilter || 'todos';
    const devHistorico = params.devHistorico || 'todos';

    let startDate = params.startDate;
    let endDate = params.endDate;

    if (!startDate || !endDate) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    }

    const result = await MercadoLivreOrder.findAdvanced({
        search,
        statusFilter,
        dateFilter,
        companyFilter,
        divergenceFilter,
        flexFilter,
        startDate,      
        endDate,        
        mediationFilter, 
        devHistorico,
        platformFilter,
        page,
        limit
    });

    // Passando os filtros para o cálculo das estatísticas
    const stats = await MercadoLivreOrder.getDashboardStats({
        statusFilter,  
        companyFilter, 
        search,
        flexFilter,
        startDate,
        endDate,
        devHistorico,
        platformFilter,
        mediationFilter
    });

    return {
        orders: result.data,
        pagination: result.meta,
        stats: stats,
        activeStatusFilter: statusFilter,
        activeDateFilter: dateFilter,
        activeCompanyFilter: companyFilter,
        activeSearch: search,
        activeStartDate: startDate,
        activeEndDate: endDate,
        activeMediationFilter: mediationFilter, 
        activeDevHistorico: devHistorico
    };
  },

  /**
   * Atualiza a situação manual de uma lista de pedidos (Em Massa).
   * @param {Array<number|string>} orderIds 
   * @param {string} status 'atrasado', 'pendente', 'cancelado', 'entregue' ou ''
   */
  /*async updateManualStatus(orderIds, status) {
      if (!Array.isArray(orderIds)) {
          orderIds = [orderIds];
      }
      
      const ids = orderIds.map(id => parseInt(id)).filter(id => Number.isFinite(id));
      if (ids.length === 0) return 0;

      return await MercadoLivreOrder.updateManualStatus(ids, status);
  },*/

  /**
   * Modificado: Agora suporta criação automática de Romaneios para status 'enviado'.
   */
  async updateManualStatus(orderIds, status) {
      if (!Array.isArray(orderIds)) {
          orderIds = [orderIds];
      }
      
      const ids = orderIds.map(id => parseInt(id)).filter(id => Number.isFinite(id));
      if (ids.length === 0) return 0;

      // CENÁRIO A: Movendo PARA Enviado
      if (status === 'enviado') {
          // 1. Cria um novo Romaneio (Lote) do tipo Manual
          // Define um nome descritivo com data/hora
          const desc = `Lote Manual/Importação - ${new Date().toLocaleString('pt-BR')}`;
          const batchId = await MercadoLivreOrder.createManualBatch('manual', desc);

          // 2. Vincula os pedidos a este lote e marca como conferido/enviado
          await MercadoLivreOrder.linkOrdersToBatch(ids, batchId);

          // 3. Garante que os itens sejam baixados do estoque
          await OrderItem.forceCompleteItemsForOrders(ids);

          return ids.length;
      } 
      
      // CENÁRIO B: Movendo PARA qualquer outro status (Pendente, Separado, Cancelado...)
      else {
          // 1. Segurança: Desvincula de qualquer lote anterior (caso estivesse em 'enviado')
          await MercadoLivreOrder.unlinkOrdersFromBatch(ids);

          // 2. Atualiza o Status do Pedido (agora sem a blindagem, graças ao Model atualizado)
          const updatedCount = await MercadoLivreOrder.bulkUpdateStatusBucket(ids, status);

          // 3. Lógica de consistência dos Itens
          // Se for status que exige baixa de estoque
          if (['separado', 'em_romaneio', 'entregue'].includes(status)) {
              await OrderItem.forceCompleteItemsForOrders(ids);
          } 
          // Se voltou para Pendente -> Zera a separação
          else if (status === 'pendente') {
              await OrderItem.resetItemsForOrders(ids);
          }

          return updatedCount;
      }
  },

  async syncNfeData(numeroVenda, chaveAcesso) {
    if (!chaveAcesso || chaveAcesso.length < 44) {
        throw new Error('Chave de acesso inválida ou ausente.');
    }

    try {
        const HUB_API_URL = process.env.HUB_API_URL || 'http://localhost:3000'; 
        const response = await axios.get(`${HUB_API_URL}/xmlnfe/${chaveAcesso}`);
        
        const data = response.data;
        if (!data) throw new Error('Retorno vazio da API de NFe.');

        const codigoEmpresa = data.pedido?.codigoEmpresa || null;
        let nfeNumero = null;
        
        if (typeof data.xml === 'string') {
            const match = data.xml.match(/<nNF>(\d+)<\/nNF>/);
            if (match) nfeNumero = match[1];
        } else if (data.nfeProc) {
            nfeNumero = data.nfeProc?.NFe?.infNFe?.ide?.nNF;
        }

        if (nfeNumero || codigoEmpresa) {
            await db.query(`
                UPDATE mercado_livre_orders 
                SET nfe_numero = $1, codigo_empresa = $2, updated_at = NOW()
                WHERE numero_venda = $3
            `, [nfeNumero, codigoEmpresa, numeroVenda]);
        }

        return { success: true, nfeNumero, codigoEmpresa };

    } catch (error) {
        console.error(`[OrderService] Erro ao sincronizar NFe para venda ${numeroVenda}:`, error.message);
        throw error;
    }
  },

  async updateOrderNote(orderId, nota) {
      if (!orderId) {
          throw new Error('ID do pedido não fornecido para a nota.');
      }
      return await MercadoLivreOrder.updateNotaPedido(orderId, nota);
  },

  async generateDashboardExcel(filters) {
    let { startDate, endDate, devHistorico } = filters;

    if (!startDate || !endDate) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        startDate = start.toISOString().split('T')[0];
        endDate = end.toISOString().split('T')[0];
    }
    // 1. Busca os dados usando a mesma query da dashboard
    // Forçamos page 1 e um limite alto (ex: 100 mil) para trazer "tudo" que bate com o filtro
    const result = await MercadoLivreOrder.findAdvanced({
        ...filters,
        devHistorico,
        startDate,
        endDate,
        page: 1,
        limit: 100000 
    });

    const orders = result.data || [];

    // 2. Mapeia os dados para o formato de colunas do Excel
    // Incluindo tudo que aparece no Card: ID, Comprador, Valores, Status, Datas...
    const excelData = orders.map(order => {
        
        // --- LÓGICA DE LIMPEZA DO NOME ---
        let nomeLimpo = order.comprador || 'N/A';
        
        // Regex : Procura por (Texto) + Espaço + (Mesmo Texto)
        // Se encontrar "João Silva João Silva", substitui por "João Silva"
        // O 'i' no final torna case-insensitive (pega "João joão" também)
        nomeLimpo = nomeLimpo.replace(/^(.*?)\s+\1$/i, '$1');
        // ---------------------------------
        let statusMediacao = 'Sem Mediação';
        if (order.medicao === 'aberta') statusMediacao = 'Aberta';
        if (order.medicao === 'fechada') statusMediacao = 'Fechada';

        let statusDevHistorico = '-';
        if (order.dev_historico === 'nao_resolvido') statusDevHistorico = 'Não Resolvido';
        if (order.dev_historico === 'resolvido') statusDevHistorico = 'Resolvido';


        return {
            "Nº Venda": order.numero_venda,
            "Pack ID": order.pack_id,
            "MLB Anúncio": order.mlb_anuncio,
            "Loja": order.codigo_empresa || '',
            "Comprador": nomeLimpo, 
            "CPF/CNPJ": order.documento || order.cpf || '',
            "Status Sistema": STATUS_TRANSLATIONS[order.status_bucket] || order.status_bucket,
            "Mediação": statusMediacao,
            "Histórico Dev.": statusDevHistorico,
            "Data Venda": order.data_venda ? new Date(order.data_venda).toLocaleDateString('pt-BR') : '',
            "Data Envio": order.data_envio ? new Date(order.data_envio).toLocaleDateString('pt-BR') : '',
            "Total (R$)": parseFloat(order.total || 0),
            "Itens": order.lista_skus || order.unidades || '', 
            "Cidade/UF": order.cidade && order.estado_entrega ? `${order.cidade}/${order.estado_entrega}` : '',
            "Plataforma": order.plataforma === 'mercado_livre' ? 'Mercado Livre' : order.plataforma,
            "Código Rastreio": order.codigo_rastreio || '',
            "Nota Fiscal": order.nfe_numero || '',
            "Empacotador": order.empacotador || ''
        };
    });

    // 3. Cria a planilha usando XLSX
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Ajuste de largura de colunas
    const wscols = [
        {wch: 20}, // Nº Venda
        {wch: 40}, // Pack Id
        {wch: 40}, // MLB Anúncio
        {whc: 20}, // Código Empresa
        {wch: 30}, // Comprador
        {wch: 18}, // Doc
        {wch: 15}, // Status
        {wch: 15}, // Mediação
        {wch: 15}, // Histórico Dev
        {wch: 12}, // Data Venda
        {wch: 12}, // Data Envio
        {wch: 10}, // Total
        {wch: 60}, // Itens
        {wch: 25}, // Cidade
        {wch: 15}, // Plataforma
        {wch: 20}, // Rastreio
        {wch: 45}, // NF
        {wch: 45}  // Empacotador
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório Pedidos");

    // 4. Retorna o Buffer
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  },

  async findPendingByProduct(produtoCodigo) {
    const query = {
      text: `
        SELECT * FROM order_items 
        WHERE produto_codigo = $1 
          AND (quantidade_total - quantidade_separada) > 0
        ORDER BY id ASC; -- FIFO
      `,
      values: [produtoCodigo]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async updateQuantitySeparated(id, novaQuantidade) {
    const query = {
        text: `UPDATE order_items SET quantidade_separada = $1 WHERE id = $2 RETURNING *`,
        values: [novaQuantidade, id]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },

  async processUpload(files, plataforma, uploadedBy) {
    if (!files || files.length === 0) {
      throw new Error('Nenhum ficheiro foi recebido.');
    }

    const importBatchId = crypto.randomUUID();
    const results = [];

    for (const file of files) {
      const ext = file.originalname.split('.').pop().toLowerCase();

      if (ext === 'xlsx' || ext === 'xls') {
        if (plataforma !== PLATFORM_KEYS.MERCADO_LIVRE) {
          throw new Error('Plataforma ainda não suportada para planilhas.');
        }

        const outcome = await this.importMercadoLivrePlanilha(file.buffer, {
          fileName: file.originalname,
          uploadedBy,
          importBatchId
        });

        results.push({
          fileName: file.originalname,
          ...outcome,
          type: 'spreadsheet'
        });

      } else if (ext === 'txt' || ext === 'zip') {
        const count = await this.processLabelUpload(file.buffer, file.originalname, importBatchId, plataforma);
        results.push({
            fileName: file.originalname,
            inserted: count,
            updated: 0,
            type: 'label_import'
        });
      
      } else if (ext === 'pdf') {
        if (plataforma !== PLATFORM_KEYS.SHOPEE) {
            throw new Error('O formato PDF atualmente é suportado apenas para importação de etiquetas da Shopee.');
        }
        
        const count = await this.processShopeePdfUpload(file.buffer, file.originalname, importBatchId);
        results.push({
            fileName: file.originalname,
            inserted: count,
            updated: 0,
            type: 'label_import'
        });
      }
    }
    return results;
  },
  
  async processPlatformReport(fileBuffer, plataforma, uploadedBy) {
      if (plataforma !== PLATFORM_KEYS.MERCADO_LIVRE) {
          throw new Error('Apenas Mercado Livre é suportado neste momento.');
      }

      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // header: 1 traz a planilha como uma matriz (array de arrays)
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      // Começa da linha 7 (índice 6) conforme solicitado
      const dataRows = rows.slice(6); 

      let processedCount = 0;
      let divergenceCount = 0;
      let updatedCount = 0;

      for (const row of dataRows) {
          // Coluna AT (índice 45) -> ID do envio (MEL...)
          const rawId = row[45]; 
          // Coluna A (índice 0) -> Pack ID (Novo Identificador)
          const rawPackId = row[0];
          // Coluna C (índice 2) -> Status descrito
          const rawStatus = row[2];
          // Coluna D (Descrição do Status)
          const rawDescription = row[3]; 
          // Coluna U
          const rawMlbAnuncio = row[20];

          let order = null;

          // --- ESTRATÉGIA DE BUSCA 1: ID DO ENVIO (MEL...) ---
          if (rawId) {
              const idMatch = String(rawId).match(/MEL(\d+)/);
              if (idMatch) {
                  const numeroVenda = `MLB_SHML${idMatch[1]}`;
                  const basicOrders = await MercadoLivreOrder.findByNumeroVendas([numeroVenda]);
                  
                  if (basicOrders && basicOrders.length > 0) {
                      // Busca o pedido completo para ter acesso ao status_bucket
                      order = await MercadoLivreOrder.findById(basicOrders[0].id);
                  }
              }
          }

          // --- ESTRATÉGIA DE BUSCA 2: PACK ID (Fallback) ---
          // Se não encontrou pelo MEL, tenta pelo Pack ID da coluna A
          if (!order && rawPackId) {
              // Limpa o Pack ID (remove letras/espaços, deixa só números)
              // Ex: "2000010879267893"
              const cleanPackId = String(rawPackId).replace(/\D/g, ''); 
              
              // Validação básica para evitar buscar números curtos irrelevantes
              if (cleanPackId.length > 5) { 
                  order = await MercadoLivreOrder.findByPackId(cleanPackId);
              }
          }

          // Se o pedido não foi encontrado por nenhum método, pula para o próximo
          if (!order) continue;

          if (rawMlbAnuncio) {
              await MercadoLivreOrder.updateMlbAnuncio(order.id, rawMlbAnuncio);
          }

          const currentStatus = order.status_bucket;

          // 3. Normalização do Status do Relatório (Remove acentos e caixa alta)
          const normalizeText = (text) => {
              return String(text || '')
                  .toLowerCase()
                  .trim()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "");
          };

          const statusNorm = normalizeText(rawStatus);
          const descNorm = normalizeText(rawDescription);
          
          let novaMedicao = null;

          if (
              statusNorm.includes('mediacao com o mercado livre') || // "Interviemos para ajudar"
              statusNorm.includes('mediacao em espera') ||           // "em espera de resposta..."
              statusNorm.includes('mediacao para responder') ||
              statusNorm.includes('o seu comprador quer cancelar') ||
              statusNorm.includes('reclamacao aberta para resolver') ||
              statusNorm.includes('reclamacao com devolucao habilitada') ||
              statusNorm.includes('reclamacao com oferta de reembolso parcial') ||
              statusNorm.includes('reclamacao esperando resposta') ||
              statusNorm.includes('venda com solicitacao de alteracao')
          ) {
              novaMedicao = 'aberta';
          }
          // 2. Regras para Mediação FECHADA
          else if (
              statusNorm.includes('mediacao finalizada') || // Cobre "com reembolso" e "Te demos o dinheiro"
              statusNorm.includes('reclamacao encerrada')   // Cobre todas as variações de "Reclamação encerrada..."
          ) {
              novaMedicao = 'fechada';
          }

          if (novaMedicao) {
              // Executa o UPDATE direto para não interferir na lógica do status_bucket
              await db.query(
                  `UPDATE mercado_livre_orders SET medicao = $1 WHERE id = $2`,
                  [novaMedicao, order.id]
              );
          }

          // 4. Detecção Inteligente de Status Baseada em Palavras-Chave
          let mappedStatus = null;

          // --- GRUPO: DEVOLUÇÃO EM ANÁLISE ---
          // Casos onde o processo está aberto, em mediação, ou o objeto está voltando (mas houve problema)
          if (
              // "Devolução em mediação para responder hoje..."
              (statusNorm.includes('devolucao em mediacao')) ||
              
              // "Devolução finalizada. Descartamos o produto..." 
              // (Embora finalizada, o descarte implica ação financeira/análise, não retorno físico imediato ao estoque padrão)
              (statusNorm.includes('devolucao finalizada') && descNorm.includes('descartamos o produto')) ||
              
              // "Devolução finalizada. O produto está apto para vender - Vamos enviá-lo..."
              // (Indica que o ML revisou e vai enviar, então está em trânsito de volta -> Análise/Espera)
              (statusNorm.includes('devolucao finalizada') && descNorm.includes('apto para vender')) ||
              
              // "Devolução não entregue..."
              (statusNorm.includes('devolucao nao entregue')) ||
              
              // "Troca não entregue. Vamos devolver..."
              (statusNorm.includes('troca nao entregue'))
          ) {
              mappedStatus = 'devolucao_analise';
          }

          // --- GRUPO: DEVOLUÇÃO CONCLUÍDA ---
          // Casos onde o ciclo fechou: dinheiro devolvido sem retorno ou produto já recebido/estocado
          else if (
              // "A devolução não foi feita. Nós te devolvemos o dinheiro..."
              (statusNorm.includes('a devolucao nao foi feita')) ||

              // "Devolução finalizada com reembolso para o comprador..." 
              // (Abrange casos: "O pacote chegou...", "Recebeu conforme esperado...")
              (statusNorm.includes('devolucao finalizada com reembolso')) ||

              // "Devolvido no dia X" 
              // (Cobre todas as variações de data: "1 de dezembro", "19 de janeiro", etc.
              //  Cobre motivos: "não foi possível entregar", "recusada", "endereço incorreto", "não encontramos ninguém", "adicionamos ao estoque")
              (statusNorm.includes('devolvido no dia')) ||

              // "Liberamos o dinheiro da venda... e reembolsamos o comprador"
              (statusNorm.includes('liberamos o dinheiro') && statusNorm.includes('reembolsamos')) ||

              // "Seu pacote foi devolvido em..."
              (statusNorm.includes('seu pacote foi devolvido'))
          ) {
              mappedStatus = 'devolucao_concluida';
          }

          // --- OUTROS STATUS (Mantém a lógica existente para o resto) ---
          
          // REGRA: NÃO ENTREGUE
          else if (statusNorm.includes('nao entregue')) {
              mappedStatus = 'nao_entregue';
          }
          // REGRA: CANCELADO
          else if (statusNorm.includes('cancelad') || statusNorm.includes('cancelou')) {
              mappedStatus = 'cancelado';
          }
          // REGRA: ENTREGUE (Só marca se NÃO cair nas regras acima de devolução/não entregue)
          else if (
              (statusNorm.includes('entregue') && !statusNorm.includes('nao entregue')) || 
              statusNorm.includes('no ponto de retirada')
          ) {
              mappedStatus = 'entregue';
          }
          else if (statusNorm.includes('venda concretizada')) {
            mappedStatus = 'venda_concretizada';  
          } 
          // REGRA: ENVIADO
          else if (
              statusNorm.includes('a caminho') ||
              statusNorm.includes('chega') || 
              statusNorm.includes('centro de distribuicao')
          ) {
              mappedStatus = 'enviado';
          }

          if (mappedStatus == 'devolucao_concluida' || mappedStatus == 'devolucao_analise') {
              // Executa o UPDATE direto para não interferir na lógica do status_bucket
              await db.query(
                  `UPDATE mercado_livre_orders SET desc_status = $1 WHERE id = $2`,
                  [rawDescription, order.id]
              );
          } else if (mappedStatus == 'nao_entregue') {
              // Executa o UPDATE direto para não interferir na lógica do status_bucket
              await db.query(
                  `UPDATE mercado_livre_orders SET desc_status = $1 WHERE id = $2`,
                  [rawDescription, order.id]
              );
          } else if (mappedStatus == 'venda_concretizada') {
              // Executa o UPDATE direto para não interferir na lógica do status_bucket
              await db.query(
                  `UPDATE mercado_livre_orders SET desc_status = $1 WHERE id = $2`,
                  [rawDescription, order.id]
              );
          } else if (novaMedicao) {
              // Executa o UPDATE direto para não interferir na lógica do status_bucket
              await db.query(
                  `UPDATE mercado_livre_orders SET desc_status = $1 WHERE id = $2`,
                  [rawDescription, order.id]
              );
          } else {
            await db.query(
                  `UPDATE mercado_livre_orders SET desc_status = NULL WHERE id = $1`,
                  [order.id]
              );  
          }

          // 5. Lógica de Decisão (Conciliação)
          let action = 'none'; // Opções: 'update', 'divergence', 'clean'

          if (mappedStatus) {
              // Se detectamos um status relevante no relatório...
              
              if (currentStatus !== mappedStatus) {
                  // Proteção: Não regredir status finalizados (Entregue/Cancelado) para Enviado
                  const isSystemFinalized = ['entregue', 'cancelado'].includes(currentStatus);
                  const isReportRegression = mappedStatus === 'enviado';

                  if (!(isSystemFinalized && isReportRegression)) {
                      action = 'update';
                  } else {
                      action = 'clean'; 
                  }
              } else {
                  action = 'clean';
              }
          } else {
              // Status desconhecido no relatório
              if (currentStatus === 'enviado') {
                  // Sistema diz Enviado, Relatório não confirma -> Divergência
                  action = 'divergence';
              } else {
                  action = 'clean';
              }
          }

          // 6. Execução da Ação
          if (action === 'update') {
              await this.updateManualStatus([order.id], mappedStatus);
              await MercadoLivreOrder.updateDivergence(order.id, false); 
              updatedCount++;
          } 
          else if (action === 'divergence') {
              await MercadoLivreOrder.updateDivergence(order.id, true);
              divergenceCount++;
          } 
          else if (action === 'clean') {
              await MercadoLivreOrder.updateDivergence(order.id, false);
          }

          processedCount++;
      }

      return {
          total: processedCount,
          updated: updatedCount,
          divergences: divergenceCount
      };
  },

  async generateReport(params) {
    const result = await MercadoLivreOrder.findAdvanced({
        ...params,
        page: 1,
        limit: 10000 
    });
    return result.data;
  },

  // --- MÉTODOS LEGADOS ---
  // Mantidos para compatibilidade, mas o novo dashboard usa getAdvancedDashboard
  
  async getStatusSummary() {
    const rawCounts = await MercadoLivreOrder.countByStatusBucket();
    const defaults = { pendente: 0, separado: 0, em_romaneio: 0, enviado: 0, cancelado: 0 };
    rawCounts.forEach(({ status_bucket: bucket, total }) => {
      if (defaults.hasOwnProperty(bucket)) defaults[bucket] = total;
    });
    return {
      cards: Object.entries(defaults).map(([key, total]) => ({
        id: key,
        label: STATUS_TRANSLATIONS[key] || key,
        total
      }))
    };
  },

  async getRecentOrdersGrouped(limitPorBucket = 6) {
    const buckets = Object.keys(STATUS_TRANSLATIONS);
    const result = {};
    for (const bucket of buckets) {
      result[bucket] = await MercadoLivreOrder.findRecentByStatusBucket(bucket, limitPorBucket);
    }
    return result;
  },

  async findOrderForReturnResolution(term) {
      if (!term) throw new Error('Termo de busca vazio.');
      
      const cleanTerm = String(term).trim();
      
      // 1. Tenta busca exata (Pack ID, Chave de Acesso, Etiqueta ou Venda já com prefixo)
      let order = await MercadoLivreOrder.findForReturnResolution(cleanTerm);
      
      // 2. FALLBACK INTELIGENTE: 
      // Se não achou e o termo é puramente numérico, tenta adicionar o prefixo padrão do ML.
      // Isso resolve o caso onde o leitor bipa apenas "20000..." mas o banco tem "MLB_SHML20000..."
      if (!order && /^\d+$/.test(cleanTerm)) {
          order = await MercadoLivreOrder.findForReturnResolution(`MLB_SHML${cleanTerm}`);
      }

      if (!order) {
          throw new Error('Pedido não encontrado para este código (Pack ID, Venda ou Chave).');
      }

      // --- TRAVA DE SEGURANÇA CRÍTICA ---
      // Apenas aceita pedidos que já constam como devolução no sistema.
      const statusDeDevolucao = ['devolucao_concluida', 'devolucao_analise', 'nao_entregue'];
      
      if (!statusDeDevolucao.includes(order.status_bucket)) {
          throw new Error(`Bloqueado: Este pedido está como "${order.status_bucket}" e não é uma devolução.`);
      }
      // ----------------------------------

      return order;
  },

  async confirmReturnResolution(orderId) {
      if (!orderId) throw new Error('ID do pedido inválido.');
      await MercadoLivreOrder.resolveReturn(orderId);
  },

  /**
   * Busca as medidas de embalagem de um anúncio específico.
   */
  async findPackagingMeasure(mlb) {
      // Remove espaços e garante maiúsculo (caso o excel tenha vindo misturado)
      const cleanMlb = String(mlb).trim();
      
      const query = `
          SELECT mlb_anuncio, altura, largura, comprimento, peso 
          FROM packaging_measures 
          WHERE mlb_anuncio ILIKE $1 -- ILIKE para ignorar case sensitive
          LIMIT 1
      `;
      
      const { rows } = await db.query(query, [cleanMlb]);
      return rows[0];
  },

  async getOrdersByBucket(bucket, limit = 50) {
    if (!STATUS_TRANSLATIONS[bucket]) {
      throw new Error('Bucket de status inválido.');
    }
    return MercadoLivreOrder.findByStatusBucket(bucket, limit);
  }
};

module.exports = OrderService;