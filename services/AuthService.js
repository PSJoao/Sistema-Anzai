// --- 1. Importações ---
const User = require('../models/User'); // O nosso Model
const bcrypt = require('bcryptjs'); // Para comparar e gerar hashes de senha
const jwt = require('jsonwebtoken'); // Para criar e verificar os JSON Web Tokens

// (Futuro) Importaremos o LogService quando ele existir
// const LogService = require('./LogService');

// --- 2. Definição do Serviço ---
const AuthService = {

    /**
     * Tenta autenticar um utilizador.
     * @param {string} username - O nome de utilizador.
     * @param {string} password - A senha (texto simples).
     * @returns {Promise<object>} Um objeto contendo o token e os dados do utilizador.
     * @throws {Error} Lança um erro se as credenciais forem inválidas.
     */
    async login(username, password) {
        try {
            // 1. Encontrar o utilizador no banco de dados
            const user = await User.findByUsername(username);

            // 2. Verificar se o utilizador existe
            if (!user) {
                // (Futuro) Registar a tentativa de login falhada
                // await LogService.createLog('system', `Tentativa de login falhada: Utilizador '${username}' não encontrado.`, 'auth_fail');
                throw new Error('Credenciais inválidas.'); // Erro genérico por segurança
            }

            // 3. Comparar a senha enviada com o hash guardado no banco
            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                // (Futuro) Registar a tentativa de login falhada
                // await LogService.createLog(user.id, 'Tentativa de login falhada: Senha incorreta.', 'auth_fail');
                throw new Error('Credenciais inválidas.'); // Erro genérico por segurança
            }

            // 4. Se a senha estiver correta, gerar o JWT
            const payload = {
                id: user.id,
                username: user.username,
                role: user.role
            };

            const secret = process.env.JWT_SECRET;
            if (!secret) {
                console.error('[AuthService] O SEGREDO JWT (JWT_SECRET) não está definido no .env!');
                throw new Error('Erro interno do servidor.');
            }

            // O utilizador pediu um login que "permanece ativo". Vamos definir 7 dias.
            const token = jwt.sign(payload, secret, { expiresIn: '7d' });

            // (Futuro) Registar o login bem-sucedido
            // await LogService.createLog(user.id, 'Login bem-sucedido.', 'auth_success');

            // 5. Retornar o token e os dados básicos do utilizador
            return {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                }
            };

        } catch (error) {
            console.error('Erro no AuthService.login:', error.message);
            // Propaga o erro (ex: "Credenciais inválidas") para o Controller
            throw error;
        }
    },

    /**
     * Regista um novo utilizador.
     * @param {string} username
     * @param {string} password
     * @param {string} role - 'funcionario' ou 'admin'
     * @returns {Promise<object>} O novo utilizador criado (sem o hash da senha).
     * @throws {Error} Lança um erro se o utilizador já existir.
     */
    async register(username, password, role = 'funcionario') {
        try {
            // 1. Gerar o hash da senha
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // 2. Chamar o Model para criar o utilizador
            const newUser = await User.create(username, hashedPassword, role);
            
            // (Futuro) Registar a criação do novo utilizador
            // await LogService.createLog(newUser.id, `Nova conta registada: '${username}'.`, 'registration');

            return newUser;
        } catch (error) {
            console.error('Erro no AuthService.register:', error.message);
            // Propaga o erro (ex: "Nome de utilizador já existe.")
            throw error;
        }
    },

    /**
     * Verifica a validade de um token JWT.
     * @param {string} token - O token JWT (normalmente vindo de um cookie).
     * @returns {object|null} O payload decifrado se o token for válido, ou null se for inválido.
     */
    verifyToken(token) {
        if (!token) {
            return null;
        }
        
        try {
            const secret = process.env.JWT_SECRET;
            // jwt.verify lança um erro se o token for inválido (expirado, assinatura errada)
            const decoded = jwt.verify(token, secret);
            return decoded; // Devolve o payload (id, username, role)
        } catch (error) {
            console.warn('Tentativa de verificação de token inválido:', error.message);
            return null;
        }
    }
};

module.exports = AuthService;
