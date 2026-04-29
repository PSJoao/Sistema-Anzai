const User = require('../models/User');
const AuthService = require('./AuthService'); // Reutilizamos o register
const bcrypt = require('bcryptjs');

const UserService = {
    
    async getAllUsers() {
        return await User.findAll();
    },

    async getUserById(id) {
        return await User.findById(id);
    },

    /**
     * Cria um novo utilizador (lógica de negócio).
     * Reutiliza o AuthService.register que já trata do hash da senha.
     */
    async createUser(username, password, role) {
        // (Podemos adicionar validações aqui: ex: senha forte?)
        return await AuthService.register(username, password, role);
    },

    /**
     * Atualiza um utilizador.
     * (Não permite atualizar senha por aqui, isso seria um fluxo separado)
     */
    async updateUser(id, { username, role, is_active }) {
        if (!username || !role || is_active === undefined) {
            throw new Error('Campos em falta para atualização.');
        }
        return await User.update(id, { username, role, is_active });
    },

    async updatePassword(id, newPassword) {
        if (!newPassword) throw new Error('A nova senha não pode estar vazia.');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        return await User.updatePassword(id, hashedPassword);
    },

    async deleteUser(id) {
        return await User.deleteById(id);
    }
};

module.exports = UserService;