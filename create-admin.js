// create-admin.js
// Script para inserir o primeiro utilizador administrador no sistema.
// Use: node create-admin.js

// 1. Carrega as variáveis de ambiente (DB_USER, DB_PASSWORD, etc.)
require('dotenv').config();

// 2. Importa as ferramentas necessárias
const bcrypt = require('bcryptjs'); // Para fazer o hash da senha
const { Pool } = require('pg');   // Para conectar ao banco de dados

// --- Dados do Administrador ---
const USERNAME = 'admanzai';
const PASSWORD = 'sistema_ANZAI@9050!';
const ROLE = 'admin';
// -----------------------------

// 3. Configura o pool de conexão (exatamente como em config/database.js)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// 4. Função principal auto-executável (async/await)
(async () => {
    let client;
    try {
        console.log('Iniciando criação do administrador...');
        
        // 5. Gerar o hash da senha (lógica do AuthService.register)
        console.log('Gerando hash da senha...');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(PASSWORD, salt);

        // 6. Conectar ao banco
        console.log('Conectando ao banco de dados...');
        client = await pool.connect();
        
        // 7. Preparar e executar a query (lógica do User.create)
        console.log('Inserindo utilizador no banco...');
        const query = {
            text: `
                INSERT INTO users (username, password_hash, role)
                VALUES ($1, $2, $3)
                RETURNING id, username, role, created_at
            `,
            values: [USERNAME, hashedPassword, ROLE],
        };

        const { rows } = await client.query(query);

        // 8. Sucesso
        console.log('=========================================');
        console.log('Administrador criado com sucesso!');
        console.log(rows[0]);
        console.log('=========================================');

    } catch (error) {
        // Trata o erro de utilizador duplicado (lógica do User.create)
        if (error.code === '23505') {
            console.error(`\nERRO: O nome de utilizador '${USERNAME}' já existe no banco de dados.`);
        } else {
            console.error('\nERRO ao criar administrador:', error.message);
        }
    } finally {
        // 9. Garante que a conexão seja fechada
        if (client) {
            client.release(); // Libera o cliente de volta para o pool
            console.log('Cliente de banco de dados liberado.');
        }
        await pool.end(); // Fecha o pool (permite que o script termine)
        console.log('Conexão com o banco de dados fechada.');
    }
})();