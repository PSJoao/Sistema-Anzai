// models/OrderItem.js
// Gestão dos vínculos entre pedidos e produtos

const db = require('../config/database');

const TABLE_NAME = 'order_items';

const ORDER_ITEM_COLUMNS = [
  'order_id',
  'produto_codigo',
  'sku',
  'descricao_produto',
  'quantidade_total',
  'quantidade_separada',
  'status'
];

const UPSERT_BATCH_SIZE = 200;

function buildUpsertQuery(rows) {
  const values = [];

  const rowsSql = rows.map((row, rowIndex) => {
    const placeholders = ORDER_ITEM_COLUMNS.map((column, columnIndex) => {
      values.push(row[column] !== undefined ? row[column] : null);
      const valueIndex = rowIndex * ORDER_ITEM_COLUMNS.length + columnIndex + 1;
      return `$${valueIndex}`;
    });

    return `(${placeholders.join(', ')})`;
  });

  const updateAssignments = [
    'descricao_produto = EXCLUDED.descricao_produto',
    'quantidade_total = EXCLUDED.quantidade_total',
    `status = CASE 
        WHEN ${TABLE_NAME}.quantidade_separada >= EXCLUDED.quantidade_total THEN 'separado'
        ELSE 'pendente'
      END`,
    'updated_at = NOW()'
  ].join(', ');

  const queryText = `
      INSERT INTO ${TABLE_NAME} (${ORDER_ITEM_COLUMNS.join(', ')})
      VALUES ${rowsSql.join(', ')}
      ON CONFLICT (order_id, produto_codigo, sku)
      DO UPDATE SET ${updateAssignments}
      RETURNING id, (xmax = 0) AS inserted;
    `;

  return { queryText, values };
}

const OrderItem = {

  async bulkUpsert(orderItemRows) {
    if (!orderItemRows || orderItemRows.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    let inserted = 0;
    let updated = 0;

    for (let index = 0; index < orderItemRows.length; index += UPSERT_BATCH_SIZE) {
      const batch = orderItemRows.slice(index, index + UPSERT_BATCH_SIZE);
      const { queryText, values } = buildUpsertQuery(batch);

      const { rows } = await db.query(queryText, values);
      const batchInserted = rows.filter((row) => row.inserted).length;
      inserted += batchInserted;
      updated += rows.length - batchInserted;
    }

    return { inserted, updated };
  },

  // --- ALTERADO: Recebe a plataforma e Filtros ---
  async countPendingUnitsByProduct(produtoCodigo, plataforma = 'mercado_livre', filters = {}) {
    const whereClauses = [
        "oi.produto_codigo = $1",
        "mlo.status_bucket = 'pendente'",
        "mlo.plataforma = $2"
    ];
    const values = [produtoCodigo, plataforma];
    let paramCount = 3;

    if (filters.companyFilter && filters.companyFilter !== 'todos') {
        values.push(filters.companyFilter);
        whereClauses.push(`mlo.codigo_empresa = $${paramCount}`);
        paramCount++;
    }

    if (filters.deadlines && filters.deadlines.length > 0) {
        const dateConditions = [];
        const SQL_HOJE = `((mlo.data_coleta_agendada::date = CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date = CURRENT_DATE))`;
        const SQL_ATRASADO = `((mlo.data_coleta_agendada::date < CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date < CURRENT_DATE))`;
        const SQL_FUTURO = `((mlo.data_coleta_agendada::date > CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date > CURRENT_DATE))`;

        if (filters.deadlines.includes('atrasado')) dateConditions.push(SQL_ATRASADO);
        if (filters.deadlines.includes('hoje')) dateConditions.push(SQL_HOJE);
        if (filters.deadlines.includes('futuro')) dateConditions.push(SQL_FUTURO);

        if (dateConditions.length > 0) {
            whereClauses.push(`(${dateConditions.join(' OR ')})`);
        }
    }

    const whereSql = whereClauses.join(' AND ');

    const query = {
      text: `
        SELECT COALESCE(SUM(oi.quantidade_total - oi.quantidade_separada), 0) AS pendentes
        FROM ${TABLE_NAME} oi
        JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
        WHERE ${whereSql}
      `,
      values: values
    };

    const { rows } = await db.query(query.text, query.values);
    return Number(rows[0]?.pendentes || 0);
  },

  async checkIfOrderIsComplete(orderId) {
    const query = {
      text: `
        SELECT 
          BOOL_AND(status = 'separado') as todos_separados
        FROM order_items
        WHERE order_id = $1
      `,
      values: [orderId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0]?.todos_separados === true;
  },

  async deleteByOrderId(orderId) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE order_id = $1`,
      values: [orderId]
    };
    await db.query(query.text, query.values);
  },

  // --- NOVA FUNÇÃO PARA TRAVA DE SEGURANÇA ---
  async hasProcessedItems(orderId) {
    const query = {
      text: `
        SELECT EXISTS (
          SELECT 1 
          FROM ${TABLE_NAME} 
          WHERE order_id = $1 AND status != 'pendente'
        ) AS has_processed
      `,
      values: [orderId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0]?.has_processed || false;
  },
  // -------------------------------------------

  // Modifique a assinatura e a query
  async allocateUnit(produtoCodigo, increment = 1) {
    const query = {
      text: `
        WITH next_item AS (
          SELECT id
          FROM ${TABLE_NAME}
          WHERE produto_codigo = $1
            AND quantidade_separada < quantidade_total
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE ${TABLE_NAME} oi
        -- AQUI: Usa o parametro $2 para somar o valor exato (seja 1 ou 0.5)
        SET quantidade_separada = quantidade_separada + $2,
            status = CASE 
              -- Verifica se completou (considerando decimal)
              WHEN quantidade_separada + $2 >= quantidade_total THEN 'separado'
              ELSE 'pendente'
            END,
            updated_at = NOW()
        FROM next_item
        WHERE oi.id = next_item.id
        RETURNING oi.id, oi.order_id, oi.produto_codigo, oi.quantidade_total, oi.quantidade_separada, oi.status;
      `,
      values: [produtoCodigo, increment] // Adicionado increment
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  // --- ALTERADO: Recebe a plataforma e filtros ---
  async findPendingByProduct(produtoCodigo, plataforma = 'mercado_livre', filters = {}) {
    const whereClauses = [
        "oi.produto_codigo = $1",
        "(oi.quantidade_total - oi.quantidade_separada) > 0",
        "mlo.status_bucket = 'pendente'",
        "mlo.plataforma = $2"
    ];
    const values = [produtoCodigo, plataforma];
    let paramCount = 3;

    if (filters.companyFilter && filters.companyFilter !== 'todos') {
        values.push(filters.companyFilter);
        whereClauses.push(`mlo.codigo_empresa = $${paramCount}`);
        paramCount++;
    }

    if (filters.deadlines && filters.deadlines.length > 0) {
        const dateConditions = [];
        const SQL_HOJE = `((mlo.data_coleta_agendada::date = CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date = CURRENT_DATE))`;
        const SQL_ATRASADO = `((mlo.data_coleta_agendada::date < CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date < CURRENT_DATE))`;
        const SQL_FUTURO = `((mlo.data_coleta_agendada::date > CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date > CURRENT_DATE))`;

        if (filters.deadlines.includes('atrasado')) dateConditions.push(SQL_ATRASADO);
        if (filters.deadlines.includes('hoje')) dateConditions.push(SQL_HOJE);
        if (filters.deadlines.includes('futuro')) dateConditions.push(SQL_FUTURO);

        if (dateConditions.length > 0) {
            whereClauses.push(`(${dateConditions.join(' OR ')})`);
        }
    }

    const whereSql = whereClauses.join(' AND ');

    const query = {
      text: `
        SELECT 
            oi.*, 
            mlo.id as order_id,
            mlo.numero_venda,   
            mlo.comprador       
        FROM order_items oi
        JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
        WHERE ${whereSql}
        ORDER BY mlo.data_venda ASC, oi.id ASC; 
      `,
      values: values
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  // Adicione isso dentro do objeto OrderItem
  
  /**
   * Busca estatísticas de separação agrupadas por departamento, plataforma e empresa.
   * Aplica filtros de Prazo (order_deadline) e Empresa.
   */
  async getSeparationStats({ companyFilter, deadlines }) {
    // BLINDAGEM: Filtra item pendente E pedido pendente (ignora cancelados/entregues)
    const whereClauses = [
        "oi.status = 'pendente'",
        "mlo.status_bucket = 'pendente'"
    ];
    const values = [];
    let paramCount = 1;

    // 1. Filtro de Empresa
    if (companyFilter && companyFilter !== 'todos') {
        values.push(companyFilter);
        whereClauses.push(`mlo.codigo_empresa = $${paramCount}`);
        paramCount++;
    }

    // 2. Filtro de Prazos
    if (deadlines && deadlines.length > 0) {
        const dateConditions = [];
        const SQL_HOJE = `((mlo.data_coleta_agendada::date = CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date = CURRENT_DATE))`;
        const SQL_ATRASADO = `((mlo.data_coleta_agendada::date < CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date < CURRENT_DATE))`;
        const SQL_FUTURO = `((mlo.data_coleta_agendada::date > CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date > CURRENT_DATE))`;

        if (deadlines.includes('atrasado')) dateConditions.push(SQL_ATRASADO);
        if (deadlines.includes('hoje')) dateConditions.push(SQL_HOJE);
        if (deadlines.includes('futuro')) dateConditions.push(SQL_FUTURO);

        if (dateConditions.length > 0) {
            whereClauses.push(`(${dateConditions.join(' OR ')})`);
        }
    }

    const whereSql = whereClauses.join(' AND ');

    const query = {
        text: `
            SELECT 
                p.cod_departamento,
                mlo.plataforma,
                mlo.codigo_empresa,
                COUNT(DISTINCT oi.produto_codigo) as produtos_unicos,
                SUM(oi.quantidade_total - oi.quantidade_separada) as unidades_pendentes
            FROM ${TABLE_NAME} oi
            JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
            JOIN products p ON oi.produto_codigo = p.codigo
            WHERE ${whereSql}
            GROUP BY p.cod_departamento, mlo.plataforma, mlo.codigo_empresa
            ORDER BY p.cod_departamento ASC, mlo.plataforma ASC, mlo.codigo_empresa ASC;
        `,
        values: values
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  /**
   * Busca o próximo PRODUTO (agrupado) pendente respeitando filtros e prioridade.
   * CORRIGIDO: Alinhado com a lógica de contagem (ignora status textual, foca no saldo > 0)
   */
  async findNextItemToPick({ userId, departmentCode, companyFilter, deadlines, skip = 0, plataforma = 'mercado_livre' }) {
      const whereClauses = [
          // REMOVIDO: "oi.status = 'pendente'", -- Causa bugs se o status estiver desatualizado
          "(oi.quantidade_total - oi.quantidade_separada) > 0", // Lógica Real: Tem saldo pendente?
          "p.cod_departamento = $1",
          "mlo.status_bucket = 'pendente'",
          "mlo.plataforma = $2" // <--- NOVO: Filtra a plataforma correta
      ];
      const values = [departmentCode, plataforma]; // <--- NOVO: Injeta o valor da plataforma
      let paramCount = 3;  // <--- ALTERADO: O contador agora começa no 3

      // Filtro Empresa
      if (companyFilter && companyFilter !== 'todos') {
          values.push(companyFilter);
          whereClauses.push(`mlo.codigo_empresa = $${paramCount}`);
          paramCount++;
      }

      // Filtro Prazos
      if (deadlines && deadlines.length > 0) {
          const dateConditions = [];
          const SQL_HOJE = `((mlo.data_coleta_agendada::date = CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date = CURRENT_DATE))`;
          const SQL_ATRASADO = `((mlo.data_coleta_agendada::date < CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date < CURRENT_DATE))`;
          const SQL_FUTURO = `((mlo.data_coleta_agendada::date > CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date > CURRENT_DATE))`;

          if (deadlines.includes('atrasado')) dateConditions.push(SQL_ATRASADO);
          if (deadlines.includes('hoje')) dateConditions.push(SQL_HOJE);
          if (deadlines.includes('futuro')) dateConditions.push(SQL_FUTURO);

          if (dateConditions.length > 0) {
              whereClauses.push(`(${dateConditions.join(' OR ')})`);
          }
      }

      values.push(userId);
      const userParamIndex = paramCount;
      paramCount++;

      values.push(skip);
      const skipParamIndex = paramCount;

      const query = {
          text: `
              SELECT 
                  oi.produto_codigo, 
                  p.cod_departamento,
                  MIN(oi.sku) as sku, 
                  MIN(oi.descricao_produto) as descricao_produto,
                  
                  -- SOMA REAL: Junta a quantidade de TODOS os pedidos pendentes
                  SUM(oi.quantidade_total - oi.quantidade_separada) as unidades_pendentes_totais,
                  
                  MIN(
                      CASE 
                        WHEN ((mlo.data_coleta_agendada::date < CURRENT_DATE) OR (mlo.data_envio_limite::date < CURRENT_DATE)) THEN 1
                        WHEN ((mlo.data_coleta_agendada::date = CURRENT_DATE) OR (mlo.data_coleta_agendada IS NULL AND mlo.data_envio_limite::date = CURRENT_DATE)) THEN 2
                        ELSE 3
                      END
                  ) as prioridade_calculada

              FROM ${TABLE_NAME} oi
              JOIN mercado_livre_orders mlo ON oi.order_id = mlo.id
              JOIN products p ON oi.produto_codigo = p.codigo
              LEFT JOIN picking_locks pl ON pl.produto_codigo = oi.produto_codigo
              
              WHERE ${whereClauses.join(' AND ')}
                AND (pl.user_id IS NULL OR pl.user_id = $${userParamIndex}) 
              
              GROUP BY oi.produto_codigo, p.cod_departamento

              -- GARANTE QUE NÃO TRAGA PRODUTOS ZERADOS
              HAVING SUM(oi.quantidade_total - oi.quantidade_separada) > 0
              
              ORDER BY 
                  prioridade_calculada ASC,
                  MIN(mlo.data_venda) ASC
                  
              LIMIT 1 OFFSET $${skipParamIndex}
          `,
          values: values
      };

      const { rows } = await db.query(query.text, query.values);
      return rows[0] || null;
  },
  
  async updateQuantitySeparated(id, novaQuantidade) {
    const query = {
        text: `
            UPDATE order_items 
            SET 
                quantidade_separada = $1,
                status = CASE 
                    WHEN $1 >= quantidade_total THEN 'separado'
                    ELSE 'pendente'
                END,
                updated_at = NOW()
            WHERE id = $2 
            RETURNING *
        `,
        values: [novaQuantidade, id]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },
  
  async findAllByNumeroVenda(numeroVenda) {
    const query = {
      text: `
        SELECT 
          oi.produto_codigo,
          oi.sku,
          oi.descricao_produto,
          oi.quantidade_total,
          p.cod_fabrica,
          p.cod_barras
        FROM ${TABLE_NAME} oi
        JOIN public.mercado_livre_orders mlo ON oi.order_id = mlo.id
        JOIN public.products p ON oi.produto_codigo = p.codigo
        WHERE mlo.numero_venda = $1
        ORDER BY oi.descricao_produto;
      `,
      values: [numeroVenda],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  // Força todos os itens dos pedidos informados a ficarem com status "separado"
  // e iguala a quantidade separada à quantidade total.
  async forceCompleteItemsForOrders(orderIds) {
    const query = {
      text: `
        UPDATE order_items
        SET 
            quantidade_separada = quantidade_total,
            status = 'separado',
            updated_at = NOW()
        WHERE order_id = ANY($1::int[])
      `,
      values: [orderIds]
    };
    await db.query(query.text, query.values);
  },
  
  // Reseta os itens para pendente (caso você volte o pedido para pendente)
  async resetItemsForOrders(orderIds) {
    const query = {
      text: `
        UPDATE order_items
        SET 
            quantidade_separada = 0,
            status = 'pendente',
            updated_at = NOW()
        WHERE order_id = ANY($1::int[])
      `,
      values: [orderIds]
    };
    await db.query(query.text, query.values);
  },
  
  async findOrderStatusByNumeroVenda(numeroVenda) {
    const query = {
      text: `
        SELECT
          mlo.numero_venda,
          -- Conta o total de itens (linhas de produto) para este pedido
          COUNT(oi.id) AS total_itens,
          -- Conta quantos itens estão com status 'separado'
          COUNT(oi.id) FILTER (WHERE oi.status = 'separado') AS itens_separados,
          -- Retorna true APENAS se todos os itens estiverem separados
          BOOL_AND(oi.status = 'separado') AS pedido_completo
        FROM ${TABLE_NAME} oi
        JOIN public.mercado_livre_orders mlo ON oi.order_id = mlo.id
        WHERE mlo.numero_venda = $1
        GROUP BY mlo.numero_venda;
      `,
      values: [numeroVenda],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  }
};

module.exports = OrderItem;

