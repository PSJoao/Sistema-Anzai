const UserService = require('../services/UserService');

// (READ) Renderiza a lista de todos os utilizadores
const renderUserList = async (req, res) => {
    try {
        const users = await UserService.getAllUsers();
        res.render('admin/users-list', { 
            users,
            user: req.user,
            activePage: 'users'
        });
    } catch (error) {
        console.error('Erro ao renderizar lista de utilizadores:', error);
        res.redirect('/dashboard?error=list_users');
    }
};

// (CREATE - GET) Renderiza o formulário de criação
const renderCreateForm = (req, res) => {
    res.render('admin/user-form', { 
        formTitle: 'Criar Novo Utilizador',
        formAction: '/admin/users/add',
        user: req.user,
        activePage: 'users'
    });
};

// (CREATE - POST) Processa a criação do novo utilizador
const handleCreateUser = async (req, res) => {
    const { username, password, role } = req.body;
    try {
        await UserService.createUser(username, password, role);
        res.redirect('/admin/users?success=create')
    } catch (error) {
        console.error('Erro ao criar utilizador:', error);
        // Renderiza o formulário novamente com o erro
        res.render('admin/user-form', {
            formTitle: 'Criar Novo Utilizador',
            formAction: '/admin/users/add',
            error: error.message,
            username,
            role,
            user: req.user,
            activePage: 'users'
        });
    }
};

// (UPDATE - GET) Renderiza o formulário de edição
const renderEditForm = async (req, res) => {
    try {
        const userId = req.params.id;

        // CORREÇÃO: Verifica se o utilizador está a tentar editar-se a si mesmo
        if (req.user.id == userId) {
            console.warn(`[UserController] Utilizador ${req.user.username} tentou editar o próprio perfil via /admin.`);
            return res.redirect('/admin/users?error=self_edit_forbidden');
        }

        const userToEdit = await UserService.getUserById(userId);

        if (!userToEdit) {
            return res.redirect('/admin/users?error=not_found');
        }

        res.render('admin/user-form', {
            formTitle: `Editar Utilizador: ${userToEdit.username}`,
            formAction: `/admin/users/edit/${userId}`,
            isEditing: true,
            userToEdit: userToEdit,
            user: req.user,
            activePage: 'users'
        });
    } catch (error) {
        console.error('Erro ao renderizar formulário de edição:', error);
        res.redirect('/admin/users');
    }
};

// (UPDATE - POST) Processa a atualização do utilizador
const handleUpdateUser = async (req, res) => {
    const userId = req.params.id;

    if (req.user.id == userId) {
         return res.redirect('/admin/users?error=self_edit_forbidden');
    }
    
    const { username, role, is_active } = req.body;
    
    try {
        // Converte 'is_active' (que vem do form) para boolean
        const activeBoolean = (is_active === 'on');

        await UserService.updateUser(userId, { 
            username, 
            role, 
            is_active: activeBoolean 
        });
        res.redirect('/admin/users?success=update');
    } catch (error) {
        console.error('Erro ao atualizar utilizador:', error);
        // Recarrega os dados e mostra o erro
        const userToEdit = await UserService.getUserById(userId);
        res.render('admin/user-form', {
            formTitle: `Editar Utilizador: ${userToEdit.username}`,
            formAction: `/admin/users/edit/${userId}`,
            isEditing: true,
            userToEdit: userToEdit,
            error: error.message,
            user: req.user,
            activePage: 'users'
        });
    }
};

// (DELETE - POST) Processa a eliminação
const handleDeleteUser = async (req, res) => {
    const userId = req.params.id;
    
    // Proteção: Não permitir que o admin se auto-elimine
    if (req.user.id == userId) {
        console.warn('Tentativa de auto-eliminação de admin bloqueada.');
        return res.redirect('/admin/users?error=self_delete');
    }

    try {
        await UserService.deleteUser(userId);
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Erro ao eliminar utilizador:', error);
        res.redirect(`/admin/users?error=${error.message}`);
    }
};

module.exports = {
    renderUserList,
    renderCreateForm,
    handleCreateUser,
    renderEditForm,
    handleUpdateUser,
    handleDeleteUser
};