// Importa as ferramentas necessárias
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Para aceder ao process.env.JWT_SECRET

/**
 * Middleware para proteger rotas.
 * Verifica se o utilizador possui um JWT válido.
 */
function protectRoute(req, res, next) {
  // Verifica o cookie 'auth_token' que definimos no AuthController
  const token = req.cookies.auth_token;

  // 1. Se não houver token, o utilizador não está autenticado.
  if (!token) {
    console.log('[Auth Middleware] Acesso negado. Token não encontrado.');
    // Redireciona imediatamente para o login.
    return res.redirect('/auth/login');
  }

  // 2. Se houver um token, tenta verificá-lo.
  try {
    // Tenta verificar o token usando o nosso segredo
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

    // O token é válido! Decodificamos o payload (que contém id, username, role)
    // Anexamos os dados do utilizador ao objeto 'req' (req.user)
    // para que as rotas protegidas saibam *quem* está logado.
    req.user = decodedPayload;

    res.locals.user = decodedPayload;

    // O utilizador está autenticado, permite que a requisição continue
    // para o próximo handler (ex: renderizar o dashboard).
    next();

  } catch (error) {
    // 3. Ocorreu um erro na verificação (token expirado, inválido, etc.)
    console.error('[Auth Middleware] Token inválido ou expirado:', error.message);
    
    // Limpa o cookie inválido do navegador (importante!)
    res.clearCookie('auth_token');
    
    // Redireciona para a página de login
    return res.redirect('/auth/login');
  }
}

/**
 * Middleware para verificar o cargo (role) do utilizador.
 * Este middleware DEVE ser usado DEPOIS do 'protectRoute',
 * pois ele depende de 'req.user' (que o protectRoute anexa).
 * * @param {Array<string>} allowedRoles - Um array de roles permitidas (ex: ['admin'])
 */
function checkRole(allowedRoles) {
  return (req, res, next) => {
    // 1. protectRoute já foi executado, então temos req.user
    if (!req.user || !req.user.role) {
      console.warn('[CheckRole] req.user ou req.user.role não definidos.');
      return res.redirect('/dashboard'); // Ou página de erro 403
    }

    // 2. Verifica se o cargo do utilizador está na lista de cargos permitidos
    const isAllowed = allowedRoles.includes(req.user.role);

    if (isAllowed) {
      // O utilizador tem permissão, continua para a rota
      next();
    } else {
      // O utilizador está logado, mas não tem permissão
      console.warn(`[CheckRole] Acesso negado para o utilizador ${req.user.username} (Role: ${req.user.role}) na rota ${req.originalUrl}`);
      
      // (Futuramente) Poderíamos renderizar uma página "Acesso Negado"
      // res.status(403).render('access-denied');
      
      // Por agora, redireciona para o dashboard
      // (Podemos adicionar uma mensagem de erro flash no futuro)
      return res.redirect('/dashboard');
    }
  };
}

// Exportamos a função de middleware
module.exports = {
  protectRoute,
  checkRole
};
