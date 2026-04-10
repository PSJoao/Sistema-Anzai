// Importa o 'dotenv' para carregar as variáveis de ambiente do .env
require('dotenv').config();

// Importa a classe 'Pool' da biblioteca 'pg' (node-postgres)
const { Pool } = require('pg');

// Configura o pool de conexões com base nas variáveis de ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Exportamos uma função 'query' que nos permite executar consultas
// usando o pool. Centralizando a lógica de consulta
module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};