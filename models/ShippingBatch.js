// models/ShippingBatch.js
const db = require('../config/database');

const TABLE_NAME = 'shipping_batches';

const ShippingBatch = {
  async create({ userId }) {
    // Gera um número de romaneio único: ROM-YYYYMMDD-HHMMSS
    const now = new Date();
    const batchNumber = `ROM-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;

    const query = {
      text: `
        INSERT INTO ${TABLE_NAME} (batch_number, user_id, status, closed_at)
        VALUES ($1, $2, 'fechado', NOW())
        RETURNING *;
      `,
      values: [batchNumber, userId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },

  async findAll() {
    const query = {
      text: `
        SELECT 
          sb.*,
          u.username as responsavel,
          COUNT(mlo.id) as total_pedidos_linhas, -- Conta linhas totais
          COUNT(DISTINCT mlo.numero_venda) as total_pedidos_unicos
        FROM ${TABLE_NAME} sb
        LEFT JOIN public.users u ON sb.user_id = u.id
        LEFT JOIN public.mercado_livre_orders mlo ON mlo.shipping_batch_id = sb.id
        GROUP BY sb.id, u.username
        ORDER BY sb.created_at DESC;
      `
    };
    const { rows } = await db.query(query.text);
    return rows;
  },

  async findById(id) {
    const query = {
      text: `
        SELECT sb.*, u.username as responsavel
        FROM ${TABLE_NAME} sb
        LEFT JOIN public.users u ON sb.user_id = u.id
        WHERE sb.id = $1
      `,
      values: [id]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },
  
  // Busca os pedidos associados a este romaneio para o PDF
  async getOrdersForBatch(batchId) {
    const query = {
        text: `
            SELECT 
                numero_venda,
                STRING_AGG(titulo_anuncio, ' | ') as produtos,
                SUM(unidades) as total_unidades,
                MAX(plataforma) as plataforma,
                SUM(total) as valor_total
            FROM public.mercado_livre_orders
            WHERE shipping_batch_id = $1
            GROUP BY numero_venda
            ORDER BY numero_venda;
        `,
        values: [batchId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows;
  }
};

module.exports = ShippingBatch;