const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
// NOVA IMPORTAÇÃO: O nosso "segurança" (porteiro)
const { protectRoute } = require('../middleware/authMiddleware');

// --- Rotas Públicas (Não precisam de login) ---

// GET /auth/login - Exibe a página de login
// (O AuthController irá verificar se o usuário JÁ está logado e redirecionar se for o caso)
router.get('/login', authController.renderLoginPage);

// POST /auth/login - Processa os dados do formulário de login
router.post('/login', authController.handleLogin);

// (Futuramente)
// router.get('/register', authController.renderRegisterPage);
// router.post('/register', authController.handleRegister);


// --- Rotas Protegidas (Precisa estar logado) ---

// GET /auth/logout - Processa o logout do usuário
// Agora, só utilizadores autenticados (com token válido) podem aceder esta rota.
router.get('/logout', protectRoute, authController.handleLogout);


module.exports = router;

