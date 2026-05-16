// models/OrderHistory.js
const db = require('../config/database');

const OrderHistory = {
    /**
     * Regista um novo evento no histórico do pedido
     * @param {number} orderId - ID interno do pedido na tabela mercado_livre_orders
     * @param {string} numeroVenda - Número da venda (ML, Shopee, etc)
     * @param {string} status - O status da ação (pendente, separado, em_romaneio, enviado)
     * @param {string} usuario - Nome do utilizador ou 'Hub' para processos automáticos
     */
    async log(orderId, numeroVenda, status, usuario = 'Sistema') {
        const query = {
            text: `
                INSERT INTO order_history (order_id, numero_venda, status, usuario)
                VALUES ($1, $2, $3, $4)
                RETURNING id, created_at;
            `,
            values: [orderId, numeroVenda, status, usuario]
        };

        try {
            const { rows } = await db.query(query.text, query.values);
            return rows[0];
        } catch (error) {
            console.error('Erro ao registar histórico do pedido:', error);
            return null;
        }
    }
};

module.exports = OrderHistory;