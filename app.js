// --- 1. Importações ---
require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const SchedulerService = require('./services/SchedulerService'); 
const cookieParser = require('cookie-parser');
const { protectRoute } = require('./middleware/authMiddleware'); 

// --- 2. Inicialização da Aplicação ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- 3. Configuração dos Middlewares ---
// Aumentado para 500MB (ou o quanto você quiser) para aceitar uploads gigantes
app.use(express.json({ limit: '800mb' })); 
app.use(express.urlencoded({ extended: true, limit: '800mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. Configuração da View Engine (Handlebars) ---

// Carrega os helpers personalizados
const customHelpers = require('./helpers/handlebars-helpers');

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: customHelpers
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- 5. Definição de Rotas ---

const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/admin/users', userRoutes);

const orderRoutes = require('./routes/orderRoutes');
app.use('/pedidos', orderRoutes);

const separationRoutes = require('./routes/separationRoutes');
app.use('/separacao', separationRoutes);

const packingRoutes = require('./routes/packingRoutes');
app.use('/empacotamento', packingRoutes);

const shippingRoutes = require('./routes/shippingRoutes');
app.use('/expedicao', shippingRoutes);

// --- Rota Proxy: Imagem de Produto (Citel API) ---
const CitelGateway = require('./services/CitelGateway');
app.get('/api/produto-imagem/:codImagem', protectRoute, async (req, res) => {
    try {
        const { codImagem } = req.params;
        if (!codImagem) return res.status(400).send('Código de imagem obrigatório.');

        const result = await CitelGateway.getProdutoImagem(codImagem);
        if (!result || !result.data) {
            return res.status(404).send('Imagem não encontrada.');
        }

        // Cache de 1 hora para não martelar a API a cada render
        res.set('Content-Type', result.contentType);
        res.set('Cache-Control', 'public, max-age=3600');
        return res.send(Buffer.from(result.data));
    } catch (error) {
        console.error('[ImageProxy] Erro:', error.message);
        return res.status(500).send('Erro ao buscar imagem.');
    }
});

// --- Rota Raiz (Redireciona para o login) ---
app.get('/', (req, res) => {
    // Se o usuário já estiver logado (tem token), vai para o dashboard
    // Se não, vai para o login (será tratado pelo protectRoute se tentasse /dashboard)
    res.redirect('/dashboard'); 
});

// --- Rota do Dashboard (AGORA PROTEGIDA) ---
// 1. O 'protectRoute' é executado primeiro.
// 2. Se o token for válido, ele chama next() e o (req, res) => {...} é executado.
// 3. Se o token for inválIDO, o 'protectRoute' redireciona para /auth/login.
app.get('/dashboard', protectRoute, (req, res) => {
    // 'req.user' foi adicionado pelo middleware protectRoute
    // Agora podemos passar o nome de usuário, cargo, etc., para a view.
    res.render('dashboard', {
        user: req.user,
        activePage: 'dashboard' // Passa os dados do usuário (payload do JWT) para o .hbs
    });
});

SchedulerService.start();


// --- 6. Inicialização do Servidor ---
app.listen(PORT, () => {
    console.log(`[Casa Anzai] Servidor rodando na porta ${PORT}`);
    console.log(`Acesse em: http://localhost:${PORT}`);
});