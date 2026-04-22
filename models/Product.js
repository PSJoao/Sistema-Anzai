// models/Product.js
// Camada de acesso a dados para produtos (Integração ERP + Picking)

const db = require('../config/database');

const TABLE_NAME = 'products';

// Lista completa de colunas, incluindo as NOVAS (cod_barras, peso)
const PRODUCT_COLUMNS = [
  'codigo',
  'cod_fabrica',
  'descricao',
  'referencia',
  'unidade',
  'item_ativo',
  'cod_grupo',
  'grupo',
  'cod_departamento',
  'departamento',
  'cod_marca',
  'marca',
  'cod_fornecedor',
  'fornecedor',
  'nivel_de_giro',
  'preco_custo_ultima_compra',
  'ativo',
  'ativo_compra',
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
  'preco_custo_real',
  'classificacao_ipi',
  'abreviacao_fiscal',
  'abreviacao_pis',
  'abreviacao_cofins',
  'cest',
  'tipo_produto',
  'cod_barras', 
  'peso',
  'cod_imagem'
];

const Product = {

  /**
   * Realiza a inserção ou atualização em massa de produtos (Upsert).
   * O conflito é verificado pelo campo 'codigo'.
   * Processa em lotes menores para evitar estouro de limite de parâmetros do Postgres.
   * @param {Array<Object>} products - Array de objetos de produto mapeados
   */
  async bulkUpsert(products) {
    if (!products || products.length === 0) {
      return;
    }

    const BATCH_SIZE = 1000; // Tamanho seguro do lote interno
    const total = products.length;

    // Itera em blocos de 1000 para salvar
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = products.slice(i, i + BATCH_SIZE);
      await this._executeUpsertChunk(chunk);
    }
  },

  /**
   * Método privado para executar a query SQL de um chunk específico.
   * Utiliza a constante PRODUCT_COLUMNS para montar a query dinamicamente.
   */
  async _executeUpsertChunk(chunk) {
    const values = [];
    const rowPlaceholders = [];
    let paramIndex = 1;

    chunk.forEach(product => {
      const colPlaceholders = [];
      
      PRODUCT_COLUMNS.forEach(col => {
        colPlaceholders.push(`$${paramIndex++}`);
        // Tratamento para valores undefined -> null
        let val = product[col];
        if (val === undefined) val = null;
        values.push(val);
      });

      rowPlaceholders.push(`(${colPlaceholders.join(', ')})`);
    });

    // Montagem da Query de Upsert
    const assignments = PRODUCT_COLUMNS
      .filter(col => col !== 'codigo') // Não atualiza a PK
      .map(col => `${col} = EXCLUDED.${col}`)
      .concat('updated_at = NOW()')
      .join(', ');

    const query = `
      INSERT INTO ${TABLE_NAME} (${PRODUCT_COLUMNS.join(', ')})
      VALUES ${rowPlaceholders.join(', ')}
      ON CONFLICT (codigo) 
      DO UPDATE SET ${assignments}
    `;

    try {
      await db.query(query, values);
    } catch (error) {
      console.error('[ProductModel] Erro no bulkUpsert (chunk):', error.message);
      throw error;
    }
  },

  /**
   * Busca um produto pelo código interno (PK).
   */
  async findByCodigo(codigo) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE codigo = $1`,
      values: [codigo]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  /**
   * Busca um produto pelo código de barras.
   */
  async findByBarcode(barcode) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE cod_barras = $1 LIMIT 1`,
      values: [barcode]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  /**
   * Busca códigos de produtos que já existem no banco.
   */
  async findExistingCodes(codes) {
    if (!codes || codes.length === 0) {
      return [];
    }

    const query = {
      text: `SELECT codigo FROM ${TABLE_NAME} WHERE codigo = ANY($1::bigint[])`,
      values: [codes]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows.map((row) => Number(row.codigo));
  },

  // --- Métodos Mantidos para o Sistema de Separação (Picking) ---

  async findPendingDepartments() {
    const query = `
      SELECT 
        p.cod_departamento,
        COALESCE(d.name, p.departamento) AS departamento_nome,
        COUNT(DISTINCT p.codigo) AS produtos_com_pendencia,
        SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
      FROM order_items oi
      INNER JOIN products p ON p.codigo = oi.produto_codigo
      -- CORREÇÃO: Join para verificar o status do pedido pai
      INNER JOIN mercado_livre_orders mlo ON mlo.id = oi.order_id
      LEFT JOIN departments d ON d.code = p.cod_departamento
      WHERE (oi.quantidade_total - oi.quantidade_separada) > 0
        AND mlo.status_bucket = 'pendente' -- FILTRO CRÍTICO: Ignora cancelados/enviados
      GROUP BY p.cod_departamento, departamento_nome
      ORDER BY departamento_nome ASC;
    `;

    const { rows } = await db.query(query);
    return rows;
  },

  async findPendingProductsByDepartment(departmentCode) {
    const query = {
      text: `
        SELECT 
          p.codigo,
          p.descricao,
          p.cod_barras,
          p.departamento,
          p.cod_departamento,
          p.unidade,
          SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
        FROM order_items oi
        INNER JOIN products p ON p.codigo = oi.produto_codigo
        WHERE p.cod_departamento = $1
          AND (oi.quantidade_total - oi.quantidade_separada) > 0
        GROUP BY p.codigo, p.descricao, p.departamento, p.cod_departamento, p.unidade
        ORDER BY p.descricao ASC;
      `,
      values: [departmentCode]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows;
  },

  async findNextAvailableProduct(departmentCode, skip = 0) {
    const query = {
      text: `
        WITH pending AS (
          SELECT 
            p.codigo,
            p.descricao,
            p.cod_barras,
            p.departamento,
            p.cod_departamento,
            p.unidade,
            SUM(oi.quantidade_total - oi.quantidade_separada) AS unidades_pendentes
          FROM order_items oi
          INNER JOIN products p ON p.codigo = oi.produto_codigo
          INNER JOIN mercado_livre_orders mlo ON mlo.id = oi.order_id -- JOIN NOVO
          WHERE p.cod_departamento = $1
            AND mlo.status_bucket = 'pendente' -- FILTRO NOVO: Apenas pedidos liberados
            AND (oi.quantidade_total - oi.quantidade_separada) > 0
          GROUP BY p.codigo, p.descricao, p.departamento, p.cod_departamento, p.unidade
        )
        SELECT pending.*
        FROM pending
        LEFT JOIN picking_locks pl ON pl.produto_codigo = pending.codigo
        WHERE pl.produto_codigo IS NULL
        ORDER BY pending.descricao ASC
        LIMIT 1 OFFSET $2;
      `,
      values: [departmentCode, skip]
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async getValidDepartmentCodes() {
    const query = `SELECT code FROM departments`;
    const { rows } = await db.query(query);
    // Retorna um Set com os números (ex: Set { 2, 3, 5, ... })
    return new Set(rows.map(row => Number(row.code)));
  }
};

module.exports = Product;