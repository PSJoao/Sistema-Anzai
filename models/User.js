// Importa a configuração do nosso pool de conexão do banco de dados
const db = require('../config/database');
// Importa o bcrypt para 'hash' de senha na criação
const bcrypt = require('bcryptjs');

const User = {
    /**
     * Encontra um usuário pelo seu nome de usuário (username).
     * Usado para o processo de login.
     * @param {string} username - O nome de usuário a ser buscado.
     * @returns {Promise<object|null>} O objeto do usuário se encontrado, ou null.
     */
    async findByUsername(username) {
        try {
            const query = {
                text: 'SELECT * FROM users WHERE username = $1',
                values: [username],
            };
            const { rows } = await db.query(query.text, query.values);

            // Retorna o primeiro usuário encontrado (ou null se 'rows' estiver vazio)
            return rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar usuário por username:', error);
            throw error;
        }
    },

    /**
     * Encontra um usuário pelo seu ID.
     * @param {number} id - O ID do usuário.
     * @returns {Promise<object|null>} O objeto do usuário se encontrado, ou null.
     */
    async findById(id) {
        try {
            const query = {
                text: 'SELECT id, username, role, is_active, created_at FROM users WHERE id = $1',
                values: [id],
            };
            const { rows } = await db.query(query.text, query.values);
            
            // Retorna o usuário (sem a senha)
            return rows[0] || null;
        } catch (error) {
            console.error('Erro ao buscar usuário por ID:', error);
            throw error;
        }
    },

    /**
     * Cria um novo usuário no banco de dados.
     * A senha já deve vir 'hashed' do AuthService, mas por segurança,
     * vamos garantir o hash aqui também ou mover a lógica de hash para cá.
     * Por uma questão de separação de responsabilidades, o hash será feito no AuthService,
     * mas o model é um bom lugar para centralizar isso se preferir.
     *
     * Vamos adotar o padrão de receber os dados e o AuthService já ter feito o hash.
     *
     * @param {string} username
     * @param {string} hashedPassword - A senha já processada pelo bcrypt.
     * @param {string} role - 'funcionario' ou 'admin'.
     * @returns {Promise<object>} O novo usuário criado (sem a senha).
     */
    async create(username, hashedPassword, role = 'funcionario') {
        try {
            const query = {
                text: `
                    INSERT INTO users (username, password_hash, role)
                    VALUES ($1, $2, $3)
                    RETURNING id, username, role, created_at
                `,
                values: [username, hashedPassword, role],
            };

            const { rows } = await db.query(query.text, query.values);
            return rows[0];
        } catch (error) {
            // Trata erros de 'unique constraint' (usuário já existe)
            if (error.code === '23505') {
                throw new Error('Nome de usuário já existe.');
            }
            console.error('Erro ao criar usuário:', error);
            throw error;
        }
    },

    /**
     * Busca TODOS os utilizadores do banco.
     * @returns {Promise<Array<object>>} Uma lista de utilizadores (sem senha).
     */
    async findAll() {
        try {
            const query = {
                text: `
                    SELECT id, username, role, is_active, created_at, updated_at 
                    FROM users
                    ORDER BY username
                `,
            };
            const { rows } = await db.query(query.text);
            return rows;
        } catch (error) {
            console.error('Erro ao buscar todos os utilizadores:', error);
            throw error;
        }
    },

    /**
     * Atualiza os dados de um utilizador no banco.
     * @param {number} id - O ID do utilizador a ser atualizado.
     * @param {object} details - Objeto com os campos a atualizar (username, role, is_active).
     * @returns {Promise<object>} O utilizador atualizado.
     */
    async update(id, { username, role, is_active }) {
        try {
            const query = {
                text: `
                    UPDATE users
                    SET username = $1, role = $2, is_active = $3
                    WHERE id = $4
                    RETURNING id, username, role, is_active
                `,
                values: [username, role, is_active, id],
            };
            
            const { rows } = await db.query(query.text, query.values);
            
            if (rows.length === 0) {
                throw new Error('Utilizador não encontrado para atualização.');
            }
            return rows[0];
        } catch (error) {
            // Trata erros de 'unique constraint' (utilizador já existe)
            if (error.code === '23505') {
                throw new Error('Nome de utilizador já existe.');
            }
            console.error('Erro ao atualizar utilizador:', error);
            throw error;
        }
    },

    /**
     * Elimina um utilizador do banco de dados.
     * @param {number} id - O ID do utilizador a ser eliminado.
     * @returns {Promise<object>} O utilizador que foi eliminado.
     */
    async deleteById(id) {
         try {
            // (Nota: Em sistemas reais, podemos preferir 'is_active = false' 
            // em vez de DELETE para manter o histórico de logs)
            const query = {
                text: `
                    DELETE FROM users 
                    WHERE id = $1
                    RETURNING id, username
                `,
                values: [id],
            };
            const { rows } = await db.query(query.text, query.values);
            
            if (rows.length === 0) {
                throw new Error('Utilizador não encontrado para eliminação.');
            }
            return rows[0];
        } catch (error) {
            console.error('Erro ao eliminar utilizador:', error);
            // (Verificar restrições de chave estrangeira, ex: logs)
            if (error.code === '23503') {
                 throw new Error('Não é possível eliminar este utilizador pois ele possui logs associados.');
            }
            throw error;
        }
    }
};

module.exports = User;
