// models/PickingLock.js
const db = require('../config/database');
const TABLE_NAME = 'picking_locks';

const PickingLock = {

  async acquire({ produtoCodigo, departamento, userId, quantidadeMeta }) {
    // Tenta inserir. Se já existe (conflito), não faz nada.
    const query = {
      text: `
        INSERT INTO ${TABLE_NAME} (produto_codigo, departamento, user_id, quantidade_meta, quantidade_concluida)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT (produto_codigo) DO NOTHING
        RETURNING *;
      `,
      values: [produtoCodigo, departamento, userId, quantidadeMeta]
    };
    const { rows } = await db.query(query.text, query.values);
    
    // Se não retornou rows, significa que deu conflito (já existe lock). Buscamos ele.
    if (rows.length === 0) {
        return this.findByProduct(produtoCodigo);
    }
    return rows[0];
  },

  async findByUser(userId) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`,
      values: [userId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  async findByProduct(produtoCodigo) {
    const query = {
      text: `SELECT * FROM ${TABLE_NAME} WHERE produto_codigo = $1`,
      values: [produtoCodigo]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  // Incrementa a contagem (Buffer)
  async updateProgress(produtoCodigo, increment, quantidadeMeta) {
    const query = {
      text: `
        UPDATE ${TABLE_NAME}
        SET 
            quantidade_concluida = quantidade_concluida + $2,
            quantidade_meta = $3,
            updated_at = NOW()
        WHERE produto_codigo = $1
        RETURNING *;
      `,
      values: [produtoCodigo, increment, quantidadeMeta]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  },

  // NOVO: Zera o buffer explicitamente (Para o botão Reiniciar)
  async resetBuffer(userId) {
    const query = {
        text: `
            UPDATE ${TABLE_NAME} 
            SET quantidade_concluida = 0, updated_at = NOW() 
            WHERE user_id = $1 
            RETURNING *;
        `,
        values: [userId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0];
  },

  async clearStaleLocks(timeoutMinutes = 120) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE updated_at < NOW() - INTERVAL '${Number(timeoutMinutes)} minutes';`,
    };
    try {
        await db.query(query.text);
    } catch (e) { console.error(e); }
  },

  async releaseByUser(userId) {
    const query = {
      text: `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 RETURNING *;`,
      values: [userId]
    };
    const { rows } = await db.query(query.text, query.values);
    return rows[0] || null;
  }
};

module.exports = PickingLock;