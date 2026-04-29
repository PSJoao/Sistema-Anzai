// models/MercadoLivreOrder.js
// Responsável por interagir com a tabela mercado_livre_orders

const db = require('../config/database');

const TABLE_NAME = 'mercado_livre_orders';

const INSERT_COLUMNS = [
  'numero_venda',
  'data_venda',
  'estado',
  'descricao_status',
  'pacote_diversos_produtos',
  'pertence_kit',
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'mes_faturamento_tarifas',
  'venda_publicidade',
  'sku',
  'numero_anuncio',
  'canal_venda',
  'loja_oficial',
  'titulo_anuncio',
  'variacao',
  'preco_unitario',
  'tipo_anuncio',
  'nfe_anexo',
  'dados_pessoais_empresa',
  'documento',
  'endereco',
  'tipo_contribuinte',
  'inscricao_estadual',
  'comprador',
  'negocio',
  'cpf',
  'endereco_entrega',
  'cidade',
  'estado_entrega',
  'cep',
  'pais',
  'status_bucket',
  'plataforma',
  'import_batch_id',
  'arquivo_original',
  'uploaded_by',
  'uploaded_at',
  'chave_acesso',
  'etiqueta_pedido',
  'transportadora',
  'peso_teorico',
  //'data_envio_limite',
  'data_envio_disponivel',
  'data_coleta_agendada',
  'data_previsao_entrega',
  'nfe_numero',
  'codigo_empresa',
  'divergencia_envio',
  'situacao_manual',
  'is_flex',
  'dev_historico',
  'nota_pedido',
  'medicao',
  'id_envio_dev',
  'status_dev_api',
  'status_envio_dev_api'
];

const UPDATABLE_COLUMNS = [
  //'data_venda',
  'estado',
  'descricao_status',
  //'status_bucket',
  'pacote_diversos_produtos',
  'pertence_kit',
  'unidades',
  'receita_produtos',
  'receita_acrescimo',
  'taxa_parcelamento_acrescimo',
  'tarifa_venda_impostos',
  'receita_envio',
  'tarifas_envio',
  'cancelamentos_reembolsos',
  'total',
  'mes_faturamento_tarifas',
  'venda_publicidade',
  'titulo_anuncio',
  'variacao',
  'preco_unitario',
  'tipo_anuncio',
  'nfe_anexo',
  'dados_pessoais_empresa',
  'documento',
  'endereco',
  'tipo_contribuinte',
  'inscricao_estadual',
  'comprador',
  'negocio',
  'cpf',
  'endereco_entrega',
  'cidade',
  'estado_entrega',
  'cep',
  'pais',
  'import_batch_id',
  'arquivo_original',
  //'data_envio_limite',
  'chave_acesso',
  'data_envio_disponivel',
  //'data_coleta_agendada',
  'data_previsao_entrega',
  'nfe_numero',
  'codigo_empresa',
  'uploaded_by',
  'uploaded_at',
  'divergencia_envio',
  'updated_at',
  //'is_flex',
  //'dev_historico',
  //'nota_pedido'
];

const UPSERT_BATCH_SIZE = 200;

function buildUpsertQuery(rows) {
  const values = [];

  const rowsSql = rows.map((row, rowIndex) => {
    const placeholders = INSERT_COLUMNS.map((column, columnIndex) => {
      values.push(row[column] !== undefined ? row[column] : null);
      const valueIndex = rowIndex * INSERT_COLUMNS.length + columnIndex + 1;
      return `$${valueIndex}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  // Gera a lista padrão de colunas atualizáveis
  const updatesSql = UPDATABLE_COLUMNS
    .map((column) => {
      if (column === 'updated_at') {
        return `${column} = NOW()`;
      }
      return `${column} = EXCLUDED.${column}`;
    })
    .join(', ');

  const statusProtectionSql = `
    status_bucket = CASE 
      WHEN EXCLUDED.status_bucket = 'cancelado' THEN 'cancelado' 
      ELSE ${TABLE_NAME}.status_bucket 
    END
  `;

  const queryText = `
      INSERT INTO ${TABLE_NAME} (${INSERT_COLUMNS.join(', ')})
      VALUES ${rowsSql.join(', ')}
      ON CONFLICT (numero_venda)
      DO UPDATE SET
        ${updatesSql},
        ${statusProtectionSql} 
      RETURNING id, numero_venda, sku, variacao, (xmax = 0) AS inserted;
    `;

  return { queryText, values };
}

// --- CORREÇÃO DAS REGRAS DE DATA ---

const SQL_CONDITION_HOJE = `
  (situacao_manual = 'hoje') 
  OR 
  (
    situacao_manual IS NULL 
    AND (
      -- Prioridade 1: Tem Coleta Agendada para HOJE
      (data_envio_limite::date = CURRENT_DATE)
      OR 
      -- Prioridade 2: Não tem coleta, mas o PRAZO LIMITE é HOJE
      (data_envio_limite IS NULL AND data_coleta_agendada::date = CURRENT_DATE)
    )
    AND status_bucket NOT IN ('cancelado', 'enviado', 'entregue', 'devolucao_concluida', 'nao_entregue', 'devolucao_analise', 'venda_concretizada', 'sem_enviar')
  )
`;

const SQL_CONDITION_ATRASADOS = `
  (situacao_manual = 'atrasado') 
  OR 
  (
    situacao_manual IS NULL 
    AND (
      -- Prioridade 1: Coleta Agendada já passou
      (data_envio_limite IS NOT NULL AND data_envio_limite::date < CURRENT_DATE)
      OR 
      -- Prioridade 2: Sem coleta, e PRAZO LIMITE já passou
      (data_envio_limite IS NULL AND data_coleta_agendada::date < CURRENT_DATE)
    )
    AND status_bucket NOT IN ('cancelado', 'enviado', 'entregue', 'devolucao_concluida', 'nao_entregue', 'devolucao_analise', 'venda_concretizada', 'sem_enviar')
  )
`;

const SQL_CONDITION_FUTUROS = `
  (situacao_manual = 'futuro') 
  OR 
  (
    situacao_manual IS NULL 
    AND (
      -- Prioridade 1: Coleta Agendada é FUTURA
      (data_envio_limite IS NOT NULL AND data_envio_limite::date > CURRENT_DATE)
      OR
      -- Prioridade 2: Sem coleta, e PRAZO LIMITE é FUTURO
      (data_envio_limite IS NULL AND data_coleta_agendada::date > CURRENT_DATE)
    )
    AND status_bucket NOT IN ('cancelado', 'enviado', 'entregue', 'devolucao_concluida', 'nao_entregue', 'devolucao_analise', 'venda_concretizada', 'sem_enviar')
  )
`;

const SQL_CONDITION_AGENDADOS = `
  (situacao_manual = 'agendado') 
  OR 
  (
    situacao_manual IS NULL 
    AND (
      data_coleta_agendada IS NOT NULL 
      AND data_coleta_agendada::date > CURRENT_DATE
    )
    AND status_bucket NOT IN ('cancelado', 'enviado', 'entregue', 'devolucao_concluida', 'nao_entregue', 'devolucao_analise', 'venda_concretizada', 'sem_enviar')
  )
`;

const SQL_CONDITION_CANCELADOS = `
  (situacao_manual = 'cancelado') 
  OR 
  (
    situacao_manual IS NULL 
    AND status_bucket = 'cancelado'
  )
`;

const SQL_CONDITION_ENTREGUES = `
  status_bucket = 'entregue' 
`;

const MercadoLivreOrder = {

  async bulkUpsert(orderRows) {
    if (!orderRows || orderRows.length === 0) {
      return { inserted: 0, updated: 0, records: [] };
    }

    // --- CORREÇÃO DO ERRO 21000 (Deduplicação) ---
    // Removemos duplicatas de 'numero_venda' antes de montar a query.
    // Isso acontece quando o pedido tem vários itens (várias linhas na planilha).
    const uniqueOrdersMap = new Map();
    for (const row of orderRows) {
      // Se já existe no map, ignoramos as próximas ocorrências (pegamos apenas a primeira linha do pedido)
      if (row.numero_venda && !uniqueOrdersMap.has(row.numero_venda)) {
        uniqueOrdersMap.set(row.numero_venda, row);
      }
    }
    const uniqueRows = Array.from(uniqueOrdersMap.values());
    // ----------------------------------------------

    let inserted = 0;
    let updated = 0;
    const records = [];

    for (let index = 0; index < uniqueRows.length; index += UPSERT_BATCH_SIZE) {
      const batch = uniqueRows.slice(index, index + UPSERT_BATCH_SIZE);
      const { queryText, values } = buildUpsertQuery(batch);

      const { rows } = await db.query(queryText, values);
      const batchInserted = rows.filter((row) => row.inserted).length;
      inserted += batchInserted;
      updated += rows.length - batchInserted;
      rows.forEach((row) => {
        records.push({
          id: row.id,
          inserted: row.inserted,
          numero_venda: row.numero_venda,
          sku: row.sku,
          variacao: row.variacao
        });
      });
    }

    return { inserted, updated, records };
  },

  // --- ADICIONE ISTO ---
  /**
   * Busca os 'numero_venda' correspondentes a uma lista de números de NFe.
   * IMPORTANTE: Ajuste o campo 'nfe_numero' caso sua tabela use outro nome ou JSON.
   */
  async findNumeroVendaByNfe(nfeNumbers) {
    if (!nfeNumbers || nfeNumbers.length === 0) return [];

    // Tenta converter para texto para evitar erro de tipo
    const nfes = nfeNumbers.map(n => String(n).trim());

    const query = {
      text: `
        SELECT numero_venda, nfe_numero 
        FROM ${TABLE_NAME}
        WHERE nfe_numero = ANY($1::text[])
           OR chave_acesso LIKE ANY($2::text[]) -- Opcional: Tenta achar pela chave também
      `,
      values: [nfes, nfes.map(n => `%${n}%`)] // Like para tentar achar se for parte da chave
    };

    try {
      const { rows } = await db.query(query.text, query.values);
      return rows;
    } catch (error) {
      console.error('Erro ao buscar pedidos por NFe:', error);
      return [];
    }
  },
  // ---------------------

  /**
   * Obtém estatísticas consolidadas para as abas da Dashboard.
   * Agora aceita filtros para que os contadores de PRAZO respeitem a aba de FLUXO atual.
   */
  async getDashboardStats({ statusFilter, companyFilter, search, flexFilter, startDate, endDate, mediationFilter, devHistorico, platformFilter } = {}) {
    const values = [];
    let paramCount = 1;
    let baseWhere = []; // Filtros globais (Empresa, Busca) aplicados a TUDO

    if (platformFilter && platformFilter !== 'todos') {
      values.push(platformFilter);
      baseWhere.push(`plataforma = $${paramCount}`);
      paramCount++;
    }

    // Filtro Período
    if (startDate && endDate) {
      values.push(startDate);
      values.push(endDate);
      // Casting para date garante que pegue o dia todo (00:00 até 23:59 implicitamente se a lógica do front mandar datas cheias)
      baseWhere.push(`data_acao::date >= $${paramCount} AND data_acao::date <= $${paramCount + 1}`);
      paramCount += 2;
    }

    // Filtro Mediação
    if (mediationFilter && mediationFilter !== 'todos') {
      if (mediationFilter === 'sem_mediacao') {
        baseWhere.push(`medicao IS NULL`);
      } else {
        values.push(mediationFilter); // 'aberta' ou 'fechada'
        baseWhere.push(`medicao = $${paramCount}`);
        paramCount++;
      }
    }

    //Filtro Histórico Dev
    /*if (devHistorico && devHistorico !== 'todos') {
        values.push(devHistorico); // 'nao_resolvido' ou 'resolvido'
        baseWhere.push(`dev_historico = $${paramCount}`);
        paramCount++;
    }*/

    // Filtro flex
    if (flexFilter === 'true' || flexFilter === true) {
      // Se filtro ativado, busca quem tem 't'
      baseWhere.push(`is_flex = 't'`);
    } else {
      // Se desativado, busca 'f' OU NULL (para garantir legado)
      baseWhere.push(`(is_flex = 'f' OR is_flex IS NULL)`);
    }

    // 1. Filtro de Empresa Global
    if (companyFilter && companyFilter !== 'todos') {
      values.push(companyFilter);
      baseWhere.push(`codigo_empresa = $${paramCount}`);
      paramCount++;
    }

    // 2. Busca Global
    if (search) {
      const searchTerm = `%${search}%`;
      values.push(searchTerm);
      baseWhere.push(`(
            numero_venda ILIKE $${paramCount} OR 
            pack_id ILIKE $${paramCount} OR
            comprador ILIKE $${paramCount} OR 
            titulo_anuncio ILIKE $${paramCount} OR
            nfe_numero ILIKE $${paramCount} OR
            codigo_empresa ILIKE $${paramCount} OR
            CAST(id AS TEXT) = $${paramCount}
        )`);
      paramCount++;
    }

    const whereSql = baseWhere.length > 0 ? `WHERE ${baseWhere.join(' AND ')}` : '';

    // 3. Condição do Filtro de Fluxo ATIVO (aplica-se APENAS aos contadores de Prazo)
    // Se estou na aba "Separados", quero ver quantos "Atrasados" existem DENTRO de "Separados".
    let statusCondition = 'TRUE'; // Default: conta tudo
    if (statusFilter && statusFilter !== 'todos') {
      values.push(statusFilter);
      // Mesma lógica do findAdvanced: considera a sobrecarga manual
      statusCondition = `(situacao_manual = $${paramCount} OR (situacao_manual IS NULL AND status_bucket = $${paramCount}))`;
      paramCount++;
    }

    const query = `
      SELECT
        -- A. Contadores de Prazo (Dinâmicos: Obedecem a aba de Fluxo selecionada)
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_HOJE} AND ${statusCondition}) AS count_hoje,
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_ATRASADOS} AND ${statusCondition}) AS count_atrasados,
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_FUTUROS} AND ${statusCondition}) AS count_futuros,
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_AGENDADOS} AND ${statusCondition}) AS count_agendados,
        
        -- B. Contadores de Fluxo (Estáticos: Mostram o total de cada aba, independente da atual)
        -- Usam a lógica completa (Manual OR Bucket) para serem precisos
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_ENTREGUES}) AS count_entregues,
        COUNT(*) FILTER (WHERE (situacao_manual = 'pendente' OR (situacao_manual IS NULL AND status_bucket = 'pendente'))) AS count_pendente,
        COUNT(*) FILTER (WHERE (situacao_manual = 'separado' OR (situacao_manual IS NULL AND status_bucket = 'separado'))) AS count_separado,
        COUNT(*) FILTER (WHERE (situacao_manual = 'em_romaneio' OR (situacao_manual IS NULL AND status_bucket = 'em_romaneio'))) AS count_em_romaneio,
        COUNT(*) FILTER (WHERE (situacao_manual = 'enviado' OR (situacao_manual IS NULL AND status_bucket = 'enviado'))) AS count_enviado,
        COUNT(*) FILTER (WHERE ${SQL_CONDITION_CANCELADOS}) AS count_cancelados,
        COUNT(*) FILTER (WHERE (situacao_manual = 'sem_enviar' OR (situacao_manual IS NULL AND status_bucket = 'sem_enviar'))) AS count_sem_enviar,

        COUNT(*) FILTER (WHERE (situacao_manual = 'devolucao_analise' OR (situacao_manual IS NULL AND status_bucket = 'devolucao_analise'))) AS count_devolucao_analise,
        COUNT(*) FILTER (WHERE (situacao_manual = 'devolucao_concluida' OR (situacao_manual IS NULL AND status_bucket = 'devolucao_concluida'))) AS count_devolucao_concluida,
        COUNT(*) FILTER (WHERE (situacao_manual = 'nao_entregue' OR (situacao_manual IS NULL AND status_bucket = 'nao_entregue'))) AS count_nao_entregue,
        COUNT(*) FILTER (WHERE (situacao_manual = 'venda_concretizada' OR (situacao_manual IS NULL AND status_bucket = 'venda_concretizada'))) AS count_venda_concretizada,
        COUNT(*) FILTER (WHERE (status_bucket = 'devolucao_concluida' AND dev_historico = 'resolvido')) AS count_dev_resolvido,
        COUNT(*) FILTER (WHERE (status_bucket = 'devolucao_concluida' AND dev_historico = 'nao_resolvido')) AS count_dev_nao_resolvido

      FROM ${TABLE_NAME}
      ${whereSql}
    `;

    const { rows } = await db.query(query, values);
    return rows[0];
  },

  async getDistinctCompanies() {
    const query = `
      SELECT DISTINCT codigo_empresa 
      FROM ${TABLE_NAME} 
      WHERE codigo_empresa IS NOT NULL 
      ORDER BY codigo_empresa ASC
    `;
    const { rows } = await db.query(query);
    return rows.map(r => r.codigo_empresa);
  },

  /**
   * Busca Avançada Combinada.
   * Agora aceita statusFilter E dateFilter simultaneamente.
   */
  async findAdvanced({ search, statusFilter, dateFilter, companyFilter, divergenceFilter, flexFilter, startDate, endDate, mediationFilter, devHistorico, platformFilter, page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    const values = [];
    let paramCount = 1;
    let whereClauses = [];

    if (platformFilter && platformFilter !== 'todos') {
      values.push(platformFilter);
      whereClauses.push(`mlo.plataforma = $${paramCount}`);
      paramCount++;
    }

    //Filtro de Período
    if (startDate && endDate) {
      values.push(startDate);
      values.push(endDate);
      whereClauses.push(`mlo.data_acao::date >= $${paramCount} AND mlo.data_acao::date <= $${paramCount + 1}`);
      paramCount += 2;
    }

    //Filtro de Histórico Dev
    if (devHistorico && devHistorico !== 'todos') {
      values.push(devHistorico);
      whereClauses.push(`mlo.dev_historico = $${paramCount}`);
      paramCount++;
    }

    //Filtro de Mediação
    if (mediationFilter && mediationFilter !== 'todos') {
      if (mediationFilter === 'sem_mediacao') {
        whereClauses.push(`mlo.medicao IS NULL`);
      } else {
        values.push(mediationFilter);
        whereClauses.push(`mlo.medicao = $${paramCount}`);
        paramCount++;
      }
    }

    // Filtro de flex
    if (flexFilter === 'true' || flexFilter === true) {
      whereClauses.push(`mlo.is_flex = 't'`);
    } else {
      whereClauses.push(`(mlo.is_flex = 'f' OR mlo.is_flex IS NULL)`);
    }

    // 1. Filtro de Fluxo (Considerando a Situação Manual)
    if (statusFilter && statusFilter !== 'todos') {
      values.push(statusFilter);
      // LÓGICA CORRIGIDA:
      // Se a situação manual for igual ao filtro 
      // OU (se a situação manual for nula E o bucket for igual ao filtro)
      whereClauses.push(`(
            mlo.situacao_manual = $${paramCount} 
            OR (mlo.situacao_manual IS NULL AND mlo.status_bucket = $${paramCount})
        )`);
      paramCount++;
    }

    // 2. Filtro de Prazo (Datas)
    if (dateFilter && dateFilter !== 'todos') {
      switch (dateFilter) {
        case 'hoje': whereClauses.push(`(${SQL_CONDITION_HOJE})`); break;
        case 'atrasados': whereClauses.push(`(${SQL_CONDITION_ATRASADOS})`); break;
        case 'futuros': whereClauses.push(`(${SQL_CONDITION_FUTUROS})`); break;
        case 'agendados': whereClauses.push(`(${SQL_CONDITION_AGENDADOS})`); break;
        case 'cancelados': whereClauses.push(`(${SQL_CONDITION_CANCELADOS})`); break;
        case 'entregues': whereClauses.push(`(${SQL_CONDITION_ENTREGUES})`); break;
      }
    }

    // 3. Filtro de Empresa (NOVO)
    if (companyFilter && companyFilter !== 'todos') {
      values.push(companyFilter);
      whereClauses.push(`mlo.codigo_empresa = $${paramCount}`);
      paramCount++;
    }

    if (divergenceFilter === 'true') {
      whereClauses.push(`mlo.divergencia_envio = true`);
    }

    // 4. Busca Global
    if (search) {
      const searchTerm = `%${search}%`;
      values.push(searchTerm);
      whereClauses.push(`(
            mlo.numero_venda ILIKE $${paramCount} OR 
            mlo.pack_id ILIKE $${paramCount} OR
            mlo.comprador ILIKE $${paramCount} OR 
            mlo.titulo_anuncio ILIKE $${paramCount} OR
            mlo.nfe_numero ILIKE $${paramCount} OR
            mlo.codigo_empresa ILIKE $${paramCount} OR
            CAST(mlo.id AS TEXT) = $${paramCount}
        )`);
      paramCount++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = {
      text: `
            SELECT 
                mlo.id, mlo.numero_venda, mlo.comprador, mlo.empacotador, mlo.data_venda, mlo.status_bucket, mlo.pack_id, mlo.desc_status,
                mlo.situacao_manual, mlo.total, mlo.unidades, mlo.plataforma, mlo.titulo_anuncio, mlo.mlb_anuncio,
                mlo.nfe_numero, mlo.codigo_empresa, mlo.data_envio_limite, mlo.data_coleta_agendada, mlo.nota_pedido,
                mlo.data_envio_disponivel, mlo.data_previsao_entrega, mlo.medicao, mlo.data_acao, sb.closed_at as data_envio,
                
                (
                    SELECT STRING_AGG(
                        oi.sku || ' - Qtd: ' || oi.quantidade_total || ' - ' || COALESCE(oi.descricao_produto, ''), 
                        ', '
                    ) 
                    FROM order_items oi 
                    WHERE oi.order_id = mlo.id
                ) as lista_skus,

                (
                    SELECT STRING_AGG(
                        COALESCE(p.cod_imagem, ''), 
                        ','
                    ) 
                    FROM order_items oi 
                    LEFT JOIN products p ON oi.produto_codigo = p.codigo
                    WHERE oi.order_id = mlo.id AND p.cod_imagem IS NOT NULL AND p.cod_imagem != ''
                ) as codigos_imagens,

                COUNT(*) OVER() as total_count
            FROM ${TABLE_NAME} mlo LEFT JOIN shipping_batches sb ON mlo.shipping_batch_id = sb.id 
            ${whereSql}
            ORDER BY 
              (CASE WHEN ${SQL_CONDITION_ATRASADOS} THEN 0 ELSE 1 END) ASC,
              mlo.data_venda DESC NULLS LAST
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `,
      values: [...values, limit, offset]
    };

    const { rows } = await db.query(query.text, query.values);

    const totalItems = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: rows,
      meta: { totalItems, totalPages, currentPage: page, itemsPerPage: limit }
    };
  },

  async updateManualStatus(orderIds, situacao) {
    if (!orderIds || orderIds.length === 0) return 0;
    const novoStatus = (situacao === '' || situacao === 'limpar') ? null : situacao;
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET situacao_manual = $2, updated_at = NOW()
        WHERE id = ANY($1::int[])
      `,
      values: [orderIds, novoStatus]
    };
    const { rowCount } = await db.query(query.text, query.values);
    return rowCount;
  },

  // --- Funções Legadas / Auxiliares ---
  async countByStatusBucket() {
    const query = `
      SELECT status_bucket, COUNT(*)::int AS total
      FROM ${TABLE_NAME}
      GROUP BY status_bucket;
    `;
    const { rows } = await db.query(query);
    return rows;
  },

  async findRecentByStatusBucket(bucket, limit = 10) {
    const query = {
      text: `
        SELECT
          numero_venda,
          status_bucket,
          MAX(plataforma) AS plataforma,
          MAX(comprador) AS comprador,
          MAX(data_venda) AS data_venda,
          STRING_AGG(titulo_anuncio, ' | ') AS titulo_anuncio,
          SUM(unidades) AS unidades,
          SUM(total) AS total
        FROM ${TABLE_NAME}
        WHERE status_bucket = $1
        GROUP BY numero_venda, status_bucket
        ORDER BY data_venda DESC NULLS LAST
        LIMIT $2;
      `,
      values: [bucket, limit],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async findBestOrderForPacking(produtoCodigo, plataforma = 'mercado_livre') {
    const query = {
      text: `
        SELECT mlo.numero_venda
        FROM ${TABLE_NAME} mlo
        JOIN order_items oi ON mlo.id = oi.order_id
        LEFT JOIN packing_locks pl ON mlo.numero_venda = pl.numero_venda
        WHERE mlo.status_bucket = 'separado'
          AND oi.produto_codigo = $1
          AND mlo.plataforma = $2 -- <-- NOVO: Filtro de Plataforma
          AND pl.numero_venda IS NULL
        ORDER BY
          mlo.pertence_kit ASC,
          mlo.data_venda ASC
        LIMIT 1;
      `,
      values: [produtoCodigo, plataforma] // <-- NOVO: Passagem do parâmetro
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findByStatusBucket(statusBucket, limit = 50) {
    const query = {
      text: `
        SELECT 
          id,
          numero_venda,
          data_venda,
          descricao_status,
          unidades,
          total,
          titulo_anuncio,
          comprador,
          plataforma,
          status_bucket,
          uploaded_at
        FROM ${TABLE_NAME}
        WHERE status_bucket = $1
        ORDER BY data_venda DESC NULLS LAST, uploaded_at DESC
        LIMIT $2
      `,
      values: [statusBucket, limit]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async findById(id) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE id = $1`,
      values: [id],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async updateStatusByNumeroVenda(numeroVenda, statusBucket) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET status_bucket = $2, updated_at = NOW()
        WHERE numero_venda = $1
          AND status_bucket != $2;
      `,
      values: [numeroVenda, statusBucket],
    };
    const { rowCount } = await db.query(query.text, query.values);
    return rowCount;
  },

  async bulkUpdateStatusBucket(orderIds, newStatus) {
    const query = {
      text: `
        UPDATE mercado_livre_orders
        SET status_bucket = $2, 
            situacao_manual = NULL,
            -- LÓGICA AUTOMÁTICA DE DEVOLUÇÃO:
            -- Se for para concluída e estiver nulo, marca como não resolvido.
            dev_historico = CASE 
                WHEN $2 = 'devolucao_concluida' AND dev_historico IS NULL THEN 'nao_resolvido'
                ELSE dev_historico 
            END,
            
            updated_at = NOW()
        WHERE id = ANY($1::int[])
      `,
      values: [orderIds, newStatus]
    };
    const { rowCount } = await db.query(query.text, query.values);
    return rowCount;
  },

  // --- FUNÇÃO PARA A NOTA DO PEDIDO ---
  async updateNotaPedido(orderId, nota) {
    // Se a nota vier vazia, guardamos como NULL para poupar espaço
    const valorNota = (nota && nota.trim() !== '') ? nota.trim() : null;

    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET nota_pedido = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, nota_pedido;
      `,
      values: [orderId, valorNota]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },


  // Cria um registro de lote/romaneio para envios manuais
  async createManualBatch(type = 'manual', description = '') {
    // Como não existe coluna 'tipo' ou 'description', usamos o batch_number para identificação.
    // Geramos um ID único baseado no tempo para não dar conflito.
    const timestamp = Date.now();
    const prefix = type === 'importacao' ? 'IMP' : 'MAN';
    const finalBatchNumber = `${prefix}_${timestamp}`; // Ex: MAN_170420500123

    const query = {
      text: `
            INSERT INTO shipping_batches (batch_number, status, created_at, closed_at)
            VALUES ($1, 'fechado', NOW(), NOW())
            RETURNING id
        `,
      values: [finalBatchNumber]
    };

    // Nota: Deixamos user_id como NULL pois geralmente processos automáticos não têm sessão de user aqui,
    // a menos que você queira passar o ID do admin como argumento.

    const { rows } = await db.query(query.text, query.values);
    return rows[0].id;
  },

  // Vincula pedidos a um lote específico e força o status para 'enviado'
  async linkOrdersToBatch(orderIds, batchId) {
    const query = {
      text: `
              UPDATE mercado_livre_orders
              SET shipping_batch_id = $2,
                  conferencia_saida = true,
                  status_bucket = 'enviado',
                  situacao_manual = NULL, -- Reseta flag manual
                  updated_at = NOW()
              WHERE id = ANY($1::int[])
          `,
      values: [orderIds, batchId]
    };
    await db.query(query.text, query.values);
  },

  // Remove o vínculo de lote (usado quando um pedido sai de 'enviado' para outro status)
  async unlinkOrdersFromBatch(orderIds) {
    const query = {
      text: `
              UPDATE mercado_livre_orders
              SET shipping_batch_id = NULL,
                  conferencia_saida = false,
                  updated_at = NOW()
              WHERE id = ANY($1::int[])
          `,
      values: [orderIds]
    };
    await db.query(query.text, query.values);
  },

  async findByNumeroVendas(numerosVenda) {
    if (!Array.isArray(numerosVenda)) {
      numerosVenda = [numerosVenda];
    }

    const query = {
      text: `
        SELECT 
            id, 
            numero_venda, 
            sku, 
            variacao,
            comprador,      -- ADICIONADO
            unidades,       -- ADICIONADO
            titulo_anuncio, -- ADICIONADO (Bom para debug)
            data_venda      -- ADICIONADO
        FROM ${TABLE_NAME}
        WHERE numero_venda = ANY($1)
      `,
      values: [numerosVenda]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async updateStatus(orderId, statusBucket) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET status_bucket = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      values: [orderId, statusBucket]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findReadyForShipping(term) {
    const query = {
      text: `
              SELECT 
                  numero_venda, 
                  status_bucket,
                  conferencia_saida,
                  MAX(comprador) as comprador
              FROM ${TABLE_NAME}
              WHERE status_bucket = 'em_romaneio'
                -- BLINDAGEM DE DATA: Só permite se já estiver na data de envio
                AND (data_envio_disponivel IS NULL OR data_envio_disponivel::date <= CURRENT_DATE)
                AND (numero_venda = $1 OR numero_venda LIKE '%' || $1 || '%' OR 
                    etiqueta_pedido = $1 OR
                    chave_acesso = $1)
              GROUP BY numero_venda, status_bucket, conferencia_saida;
          `,
      values: [term]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },

  async markAsChecked(numeroVenda) {
    const query = {
      text: `
              UPDATE ${TABLE_NAME}
              SET conferencia_saida = true, 
                  status_bucket = 'enviado',
                  updated_at = NOW()
              WHERE numero_venda = $1 AND status_bucket = 'em_romaneio'
          `,
      values: [numeroVenda]
    };
    await db.query(query.text, query.values);
  },

  async getCheckedOrderInfo(numeroVenda) {
    const query = {
      text: `
              SELECT 
                  numero_venda,
                  MAX(comprador) as comprador,
                  MAX(updated_at) as conferido_em
              FROM ${TABLE_NAME}
              WHERE numero_venda = $1 AND status_bucket = 'em_romaneio' AND conferencia_saida = true
              GROUP BY numero_venda;
          `,
      values: [numeroVenda]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async getPendingOrdersForShipping() {
    const query = {
      text: `
              SELECT 
                  numero_venda,
                  MAX(comprador) as comprador,
                  MAX(updated_at) as updated_at,
                  MAX(codigo_empresa) as codigo_empresa,
                  MAX(data_envio_limite) as data_envio_limite
              FROM ${TABLE_NAME}
              WHERE status_bucket = 'em_romaneio' 
                AND conferencia_saida = false
                -- BLINDAGEM DE DATA
                AND (data_envio_disponivel IS NULL OR data_envio_disponivel::date <= CURRENT_DATE)
              GROUP BY numero_venda
              ORDER BY MAX(updated_at) DESC;
          `
    };
    const { rows } = await db.query(query.text);
    return rows;
  },

  async getShippedTodayCount() {
    const query = {
      text: `
              SELECT COUNT(DISTINCT mo.numero_venda) as total
              FROM ${TABLE_NAME} mo INNER JOIN shipping_batches sb ON mo.shipping_batch_id = sb.id
		          WHERE DATE(sb.closed_at) = DATE(CURRENT_DATE)
          `
    };
    const { rows } = await db.query(query.text);
    return parseInt(rows[0].total) || 0;
  },

  async getCheckedPendingOrders() {
    const query = {
      text: `
              SELECT 
                  numero_venda,
                  MAX(comprador) as comprador,
                  MAX(updated_at) as conferido_em
              FROM ${TABLE_NAME}
              WHERE status_bucket = 'enviado' 
                AND conferencia_saida = true
                AND shipping_batch_id IS NULL -- Só os que ainda não têm relatório gerado
              GROUP BY numero_venda
              ORDER BY MAX(updated_at) DESC;
          `
    };
    const { rows } = await db.query(query.text);
    return rows;
  },

  // Amarra os pedidos "soltos" (enviados sem lote) ao novo Romaneio criado
  async finalizeShippingBatch(batchId) {
    const query = {
      text: `
              UPDATE ${TABLE_NAME}
              SET shipping_batch_id = $1, -- Apenas vincula o lote
                  updated_at = NOW()
              WHERE status_bucket = 'enviado' 
                AND conferencia_saida = true
                AND shipping_batch_id IS NULL; -- Pega todos que estavam acumulados
          `,
      values: [batchId]
    };
    const { rowCount } = await db.query(query.text, query.values);
    return rowCount;
  },

  // Atualiza apenas a flag de divergência de um pedido
  async updateDivergence(orderId, isDivergent) {
    const query = {
      text: `
              UPDATE ${TABLE_NAME}
              SET divergencia_envio = $2, updated_at = NOW()
              WHERE id = $1
          `,
      values: [orderId, isDivergent]
    };
    await db.query(query.text, query.values);
  },

  async findByPackId(packId) {
    if (!packId) return null;

    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE pack_id = $1`,
      values: [packId]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  // Atualiza apenas o código do anúncio (MLB...) vindo do relatório
  async updateMlbAnuncio(orderId, mlbAnuncio) {
    if (!mlbAnuncio) return;
    const query = {
      text: `UPDATE ${TABLE_NAME} SET mlb_anuncio = $2 WHERE id = $1`,
      values: [orderId, String(mlbAnuncio).trim()]
    };
    await db.query(query.text, query.values);
  },

  async findForReturnResolution(term) {
    // Limpa espaços
    const cleanTerm = String(term).trim();

    const query = {
      text: `
              SELECT 
                  id, 
                  numero_venda, 
                  pack_id, 
                  comprador, 
                  titulo_anuncio, 
                  status_bucket, 
                  dev_historico,
                  mlb_anuncio -- Para mostrar foto se precisar
              FROM ${TABLE_NAME}
              WHERE 
                  numero_venda = $1 
                  OR pack_id = $1 
                  OR chave_acesso = $1
                  OR etiqueta_pedido = $1
                  OR id_envio_dev = $1
              LIMIT 1
          `,
      values: [cleanTerm]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  /**
   * Marca uma devolução como 'resolvida'.
   */
  async resolveReturn(orderId) {
    const query = {
      text: `
              UPDATE ${TABLE_NAME}
              SET dev_historico = 'resolvido', updated_at = NOW()
              WHERE id = $1
          `,
      values: [orderId]
    };
    await db.query(query.text, query.values);
  },

  /**
   * Busca a fila de pedidos prontos para empacotamento (Status: 'separado').
   * Usado para montar a lista lateral dinâmica na estação de empacotamento.
   */
  async getOrdersReadyToPack(plataforma = 'mercado_livre') {
    const query = {
      text: `
              SELECT 
                  mlo.numero_venda,
                  MAX(mlo.comprador) as comprador,
                  MAX(mlo.data_envio_limite) as data_envio_limite,
                  MAX(mlo.codigo_empresa) as loja_oficial,
                  MAX(mlo.nfe_numero) as nfe_numero,
                  COUNT(oi.id) as total_itens,
                  
                  -- Lista detalhada dos produtos em JSON
                  JSON_AGG(
                      JSON_BUILD_OBJECT(
                          'sku', oi.sku,
                          'descricao', oi.descricao_produto,
                          'qtd', oi.quantidade_total
                      )
                  ) as lista_produtos

              FROM ${TABLE_NAME} mlo
              LEFT JOIN order_items oi ON mlo.id = oi.order_id
              WHERE mlo.status_bucket = 'separado'
                AND mlo.plataforma = $1 -- <-- NOVO: Filtro de Plataforma
              GROUP BY mlo.numero_venda
              ORDER BY 
                  MAX(mlo.data_envio_limite) ASC NULLS LAST
          `,
      values: [plataforma] // <-- NOVO: Array de valores necessário agora
    };

    // --- ALTERADO: db.query agora recebe os values ---
    const { rows } = await db.query(query.text, query.values);
    return rows;
  }

};

module.exports = MercadoLivreOrder;