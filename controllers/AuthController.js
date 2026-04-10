// controllers/AuthController.js
const authService = require('../services/AuthService');

/**
 * Renderiza a página de login.
 * Se o utilizador já estiver logado (tiver um token válido),
 * redireciona-o para o dashboard.
 */
const renderLoginPage = (req, res) => {
    // Se o cookie 'auth_token' existir, tenta ir para o dashboard
    // O 'protectRoute' no /dashboard fará a validação final.
    if (req.cookies.auth_token) {
        return res.redirect('/dashboard');
    }
    // Se não houver cookie, mostra a página de login.
    res.render('login', {
        layout: 'public'
    });
};

/**
 * Processa a submissão do formulário de login.
 */
const handleLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            // Lógica de validação básica
            return res.render('login', { error: 'Utilizador e senha são obrigatórios.' });
        }

        // 1. Tenta fazer o login através do AuthService
        const { token } = await authService.login(username, password);

        // 2. Se o login for bem-sucedido, armazena o token num cookie
        res.cookie('auth_token', token, {
            httpOnly: true, // O cookie não pode ser acedido por JavaScript no cliente
            secure: process.env.NODE_ENV === 'production', // Usar HTTPS em produção
            maxAge: 1 * 24 * 60 * 60 * 1000 // Expira em 1 dia
        });

        // 3. Redireciona para o dashboard
        res.redirect('/dashboard');

    } catch (error) {
        // 4. Se o AuthService lançar um erro (ex: "Credenciais inválidas")
        // renderiza a página de login novamente com a mensagem de erro.
        console.error('[AuthController.handleLogin] Erro:', error.message);
        res.render('login', {
            error: error.message,
            username: req.body.username, // Mantém o nome de utilizador no campo
            layout: 'public'
        });
    }
};

/**
 * Processa o logout do utilizador.
 * (Esta rota é protegida, por isso só é acedida se o utilizador estiver logado)
 */
const handleLogout = (req, res) => {
    // 1. Limpa o cookie que armazena o token
    res.clearCookie('auth_token');

    // 2. Redireciona o utilizador para a página de login
    res.redirect('/auth/login');
};


module.exports = {
    renderLoginPage,
    handleLogin,
    handleLogout
};

