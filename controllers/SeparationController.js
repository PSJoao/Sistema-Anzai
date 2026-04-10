// controllers/SeparationController.js
// Interface entre rotas HTTP e lógica de separação de produtos

const ProductService = require('../services/ProductService');
const OrderService = require('../services/OrderService');
const db = require('../config/database');

function parseDepartmentCode(value) {
  const code = Number.parseInt(value, 10);
  return Number.isFinite(code) ? code : null;
}

const SeparationController = {

  _normalizeFilters(req) {
      let filters = {};
      if (req.method === 'GET') {
          filters.companyFilter = req.query.company || 'todos';
          let deadlines = req.query.deadlines;
          if (deadlines && !Array.isArray(deadlines)) deadlines = [deadlines];
          if (!deadlines || deadlines.length === 0) deadlines = ['atrasado', 'hoje'];
          filters.deadlines = deadlines;
      } else {
          filters = req.body.filters || {};
          filters.companyFilter = filters.companyFilter || 'todos';
          let deadlines = filters.deadlines;
          if (deadlines && !Array.isArray(deadlines)) deadlines = [deadlines];
          if (!deadlines || deadlines.length === 0) deadlines = ['atrasado', 'hoje'];
          filters.deadlines = deadlines;
      }
      return filters;
  },

  async renderDepartmentList(req, res) {
    try {
      // 1. Captura e normaliza os filtros da URL
      const companyFilter = req.query.company || 'todos';
      const plataforma = req.query.plataforma || 'mercado_livre'; // <--- NOVO: Captura a plataforma
      
      // Checkboxes podem vir como string ou array. Normalizamos para array.
      let deadlines = req.query.deadlines || ['atrasado', 'hoje']; // Default inteligente
      if (!Array.isArray(deadlines)) deadlines = [deadlines];

      // 2. Busca departamentos aplicando os filtros
      const departments = await ProductService.getDepartmentsWithPending({
          companyFilter,
          deadlines,
          plataforma // <--- NOVO: Filtra os cartões pela plataforma
      });

      // 3. Busca a lista de empresas disponíveis (para preencher o <select>)
      const companies = await OrderService.getCompanies();

      // 4. Prepara labels dos departamentos
      const departmentLabels = departments.reduce((acc, department) => {
        acc[department.cod_departamento] = ProductService.getDepartmentLabel(department.cod_departamento);
        return acc;
      }, {});

      res.render('separation/index', {
        user: req.user,
        activePage: 'separacao',
        departments,
        departmentLabels,
        
        // Novos dados para a View
        companies, 
        activeCompany: companyFilter,
        activeDeadlines: deadlines
      });
    } catch (error) {
      console.error('[SeparationController.renderDepartmentList] Erro:', error);
      res.render('separation/index', {
        user: req.user,
        activePage: 'separacao',
        departments: [],
        departmentLabels: {},
        error: 'Não foi possível carregar os departamentos com pendências.'
      });
    }
  },

  async renderDepartmentPage(req, res) {
    const departmentCode = parseDepartmentCode(req.params.code);

    if (!departmentCode) {
      return res.redirect('/separacao');
    }

    const departmentName = ProductService.getDepartmentLabel(departmentCode);

    let session = null;
    try {
      session = await ProductService.getCurrentSession(req.user.id);
    } catch (error) {
      console.error('[SeparationController.renderDepartmentPage] Erro ao obter sessão:', error);
    }

    const sessionForDepartment = session && session.lock.departamento === departmentCode ? session : null;

    res.render('separation/department', {
      user: req.user,
      activePage: 'separacao',
      departmentCode,
      departmentName,
      session: sessionForDepartment
    });
  },

  async searchAndAcquire(req, res) {
    try {
      const { term, departmentCode, plataforma } = req.body; // <--- NOVO: Extrai a plataforma
      const filters = SeparationController._normalizeFilters(req);

      // Validação básica
      if (!term || !departmentCode) {
        return res.status(400).json({ message: 'Dados incompletos para busca.' });
      }

      // Chama o serviço blindado (que criamos no ProductService)
      const result = await ProductService.acquireProductByTerm({
        userId: req.user.id,
        departmentCode: Number(departmentCode), // Garante numérico
        term: term,
        plataforma: plataforma || 'mercado_livre', // <--- NOVO: Envia para o Model
        filters: filters
      });

      if (!result) {
        // Mensagem clara para o usuário final
        return res.status(404).json({ 
            message: 'Nada encontrado. Verifique se o item pertence a este setor ou se já está sendo separado por outro colega.' 
        });
      }

      // Sucesso: Retorna a nova sessão (Lock + Produto) para o front atualizar a tela imediatamente
      return res.json(result);

    } catch (error) {
      console.error('[SeparationController.searchAndAcquire] Erro:', error);
      return res.status(500).json({ message: error.message || 'Erro ao realizar busca.' });
    }
  },

  async globalSearch(req, res) {
    try {
        const { term, plataforma } = req.query; // <--- NOVO: Extrai a plataforma da URL
        
        if (!term) {
            return res.status(400).json({ message: 'Termo de busca vazio.' });
        }

        const deptCode = await ProductService.findDepartmentByTerm(term, plataforma || 'mercado_livre'); // <--- NOVO: Envia para o DB

        if (deptCode) {
            return res.json({ 
                found: true, 
                redirectUrl: `/separacao/departamento/${deptCode}`,
                message: `Item encontrado no Departamento ${deptCode}`
            });
        } else {
            return res.json({ 
                found: false, 
                message: 'Nenhum item pendente encontrado para este termo.' 
            });
        }

    } catch (error) {
        console.error('[SeparationController.search] Erro:', error);
        return res.status(500).json({ message: 'Erro interno na busca.' });
    }
  },

  async getCurrentSession(req, res) {
    try {
      const plataforma = req.query.plataforma || 'mercado_livre'; // <-- Extrai da URL
      const filters = SeparationController._normalizeFilters(req);
      const session = await ProductService.getCurrentSession(req.user.id, plataforma, filters); // <-- Repassa
      if (!session) {
        return res.status(204).send();
      }

      return res.json(session);
    } catch (error) {
      console.error('[SeparationController.getCurrentSession] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível recuperar a sessão atual.' });
    }
  },

  async acquireProduct(req, res) {
    try {
      // Recebe os dados
      let { departmentCode, skip, plataforma } = req.body; // <--- NOVO: Extrai a plataforma
      const filters = SeparationController._normalizeFilters(req);

      if (!departmentCode) {
        return res.status(400).json({ message: 'Departamento inválido.' });
      }

      const assignment = await ProductService.acquireProductForUser({
        userId: req.user.id,
        departmentCode,
        skip: Number(skip) || 0,
        filters: filters,
        plataforma: plataforma || 'mercado_livre' // <--- NOVO: Passa para o Service
      });

      if (!assignment) {
        return res.status(204).send();
      }

      return res.json(assignment);
    } catch (error) {
      console.error('[SeparationController.acquireProduct] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível atribuir um produto.' });
    }
  },

  async pickUnit(req, res) {
    try {

      const isAdminUser = req.user.role === 'admin';
      const filters = SeparationController._normalizeFilters(req);

      const result = await ProductService.pickUnit({
        userId: req.user.id,
        sku: req.body.sku,
        isAdmin: isAdminUser,
        plataforma: req.body.plataforma || 'mercado_livre', // <-- Extrai do Body
        filters: filters
      });

      try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        const prodInfo = result.product || {};
        const details = `Bipou SKU: ${req.body.sku} | Produto: ${prodInfo.sku} - ${prodInfo.descricao}`;
        
        await db.query(
            `INSERT INTO system_logs (user_id, action_type, details, ip_address) 
             VALUES ($1, $2, $3, $4)`,
            [
                req.user.id, 
                'SEPARACAO_ITEM', // Action Type Padronizado
                details, 
                ip
            ]
        );
      } catch (logErr) {
        // Erro de log não deve travar a operação principal, apenas avisar no console
        console.error('[SeparationController] Falha ao salvar log:', logErr.message);
      }

      return res.json(result);
    } catch (error) {
      console.error('[SeparationController.pickUnit] Erro:', error);
      return res.status(400).json({ message: error.message || 'Falha ao registrar bipagem.' });
    }
  },

  async confirmSeparation(req, res) {
    try {
        const filters = SeparationController._normalizeFilters(req);
        await ProductService.confirmSeparation(req.user.id, req.body.plataforma || 'mercado_livre', filters); // <-- Extrai do Body e repassa filtros
        return res.json({ success: true });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
  },

  async resetSeparation(req, res) {
    try {
        const result = await ProductService.resetSeparation(req.user.id);
        return res.json(result);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
  },

  async releaseSession(req, res) {
    try {
      await ProductService.releaseSession(req.user.id);
      return res.status(204).send();
    } catch (error) {
      console.error('[SeparationController.releaseSession] Erro:', error);
      return res.status(500).json({ message: 'Não foi possível liberar a sessão.' });
    }
  }
};

module.exports = SeparationController;

