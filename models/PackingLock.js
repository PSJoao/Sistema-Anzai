// models/PackingLock.js
// Gerencia as travas de empacotamento por pedido e operador

const db = require('../config/database');

const TABLE_NAME = 'packing_locks';

const PackingLock = {

  async acquire({ numeroVenda, userId, progressData }) {
    const query = {
      text: `
        INSERT INTO ${TABLE_NAME} (numero_venda, user_id, progress)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (numero_venda) DO NOTHING
        RETURNING *;
      `,
      values: [numeroVenda, userId, progressData],
    };

    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findByUser(userId) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`,
      values: [userId],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async updateProgress(numeroVenda, newProgressJson) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET progress = $2::jsonb,
            updated_at = NOW()
        WHERE numero_venda = $1
        RETURNING *;
      `,
      values: [numeroVenda, newProgressJson],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async clearStaleLocks(timeoutMinutes = 120) {
    const query = {
      text: `
        DELETE FROM ${TABLE_NAME} 
        WHERE updated_at < NOW() - INTERVAL '${Number(timeoutMinutes)} minutes';
      `,
    };
    try {
      const { rowCount } = await db.query(query.text);
      if (rowCount > 0) {
        console.log(`[PackingLock.clearStaleLocks] Limpas ${rowCount} travas obsoletas.`);
      }
      return rowCount;
    } catch (error) {
      console.error('[PackingLock.clearStaleLocks] Erro:', error);
    }
  },

  async releaseByUser(userId) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 RETURNING *;`,
      values: [userId],
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },
};

module.exports = PackingLock;