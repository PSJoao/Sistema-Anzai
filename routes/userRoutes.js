const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { protectRoute, checkRole } = require('../middleware/authMiddleware');

// Define o "porteiro" admin para todas as rotas neste arquivo
// Todas as rotas /admin/users/* exigirão login E cargo 'admin'
const isAdmin = [
    protectRoute,
    checkRole(['admin'])
];

// (READ) GET /admin/users - Lista todos os utilizadores
router.get('/', isAdmin, UserController.renderUserList);

// (CREATE) GET /admin/users/add - Mostra o formulário de adição
router.get('/add', isAdmin, UserController.renderCreateForm);

// (CREATE) POST /admin/users/add - Processa o formulário de adição
router.post('/add', isAdmin, UserController.handleCreateUser);

// (UPDATE) GET /admin/users/edit/:id - Mostra o formulário de edição
router.get('/edit/:id', isAdmin, UserController.renderEditForm);

// (UPDATE) POST /admin/users/edit/:id - Processa o formulário de edição
router.post('/edit/:id', isAdmin, UserController.handleUpdateUser);

// (DELETE) POST /admin/users/delete/:id - Processa a eliminação
// (Usamos POST para delete para evitar acionamento acidental por links)
router.post('/delete/:id', isAdmin, UserController.handleDeleteUser);

module.exports = router;