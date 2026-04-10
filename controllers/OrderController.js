// controllers/OrderController.js
// Camada responsável por orquestrar as requisições relacionadas aos pedidos

const OrderService = require('../services/OrderService');
const db = require('../config/database');

// Mapeamento de labels para exibição na view, se necessário
const STATUS_LABELS = {
  // Fluxo Operacional (Status Buckets)
  pendente: 'Pendentes',
  separado: 'Separados',
  em_romaneio: 'Embalados',
  enviado: 'Enviados',
  entregue: 'Entregues',
  cancelado: 'Cancelados',
  
  // Status de Exceção / Pós-Venda
  nao_entregue: 'Não Entregue',
  devolucao_analise: 'Devolução em Análise',
  devolucao_concluida: 'Devolução Concluída',
  venda_concretizada: 'Venda Concretizada',

  // Filtros de Prazo (Datas)
  hoje: 'Para Hoje',
  atrasados: 'Atrasados',
  futuros: 'Futuros',
  agendados: 'Agendados'
};

const PLATFORM_LABELS = {
  mercado_livre: 'Mercado Livre',
  amazon: 'Amazon',
  shopee: 'Shopee'
};

const OrderController = {

  /**
   * Renderiza o NOVO dashboard avançado de pedidos (Torre de Controle).
   * Suporta renderização HTML completa ou retorno JSON para atualizações reativas (AJAX).
   */
  async renderDashboard(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const search = req.query.search || '';
      const statusFilter = req.query.status || 'todos';
      const dateFilter = req.query.date || 'hoje';
      const companyFilter = req.query.company || 'todos';
      const divergenceFilter = req.query.divergence;
      const flexFilter = req.query.flex;
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const mediationFilter = req.query.mediation;
      const devHistorico = req.query.devHistorico;
      const platformFilter = req.query.plataforma || 'todos';
      

      // 1. Busca a lista de empresas (para preencher o select dinamicamente)
      const companies = await OrderService.getCompanies();

      // 2. Busca os dados da dashboard
      const dashboardData = await OrderService.getAdvancedDashboard({
        page,
        search,
        statusFilter,
        dateFilter,
        companyFilter,
        divergenceFilter,
        flexFilter,
        startDate,       
        endDate,         
        mediationFilter, 
        devHistorico,
        platformFilter
      });

      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.json({
          orders: dashboardData.orders,
          pagination: dashboardData.pagination,
          stats: dashboardData.stats,
          activeStartDate: dashboardData.activeStartDate,
          activeEndDate: dashboardData.activeEndDate
        });
      }

      res.render('orders/dashboard', {
        user: req.user,
        activePage: 'pedidos',
        
        // Dados principais
        orders: dashboardData.orders,
        pagination: dashboardData.pagination,
        stats: dashboardData.stats,
        companies: companies, // <--- LISTA DE EMPRESAS ENVIADA PARA A VIEW
        
        // Estado atual
        activeStatusFilter: statusFilter,
        activeDateFilter: dateFilter,
        activeCompanyFilter: companyFilter,
        activeSearch: search,
        activeFlexFilter: flexFilter === 'true',
        activePlatformFilter: platformFilter,

        activeStartDate: dashboardData.activeStartDate,
        activeEndDate: dashboardData.activeEndDate,
        activeMediationFilter: dashboardData.activeMediationFilter,
        activeDevHistorico: dashboardData.activeDevHistorico,

        statusLabels: STATUS_LABELS,
        platformLabels: PLATFORM_LABELS
      });

    } catch (error) {
      console.error('[OrderController.renderDashboard] Erro:', error);
      res.render('orders/dashboard', {
        user: req.user,
        activePage: 'pedidos',
        orders: [],
        stats: {},
        error: 'Não foi possível carregar os pedidos.'
      });
    }
  },

  /**
   * API para atualização de Situação Manual em Massa.
   * Recebe { orderIds: [], status: 'atrasado'|'pendente'|etc }
   */
  async bulkUpdateManualStatus(req, res) {
    try {
      const { orderIds, status } = req.body;

      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ success: false, message: 'IDs de pedidos inválidos.' });
      }

      const updatedCount = await OrderService.updateManualStatus(orderIds, status);

      res.json({
        success: true,
        message: `${updatedCount} pedidos atualizados com sucesso.`,
        updated: updatedCount
      });
    } catch (error) {
      console.error('[OrderController.bulkUpdateManualStatus] Erro:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar pedidos.' });
    }
  },

  async updateOrderNote(req, res) {
    try {
      const { orderId, nota } = req.body;

      if (!orderId) {
        return res.status(400).json({ success: false, message: 'ID do pedido inválido.' });
      }

      // Chama o Service para atualizar e retornar a nova nota
      const result = await OrderService.updateOrderNote(orderId, nota);

      res.json({
        success: true,
        message: 'Nota guardada com sucesso!',
        nota: result ? result.nota_pedido : null
      });
    } catch (error) {
      console.error('[OrderController.updateOrderNote] Erro:', error);
      res.status(500).json({ success: false, message: 'Erro ao guardar a nota.' });
    }
  },

  async exportDashboardExcel(req, res) {
    try {
      // 1. Extrai os mesmos filtros que a dashboard usa
      const filters = {
        search: req.query.search || '',
        statusFilter: req.query.status || 'todos',
        dateFilter: req.query.date || 'hoje',
        companyFilter: req.query.company || 'todos',
        divergenceFilter: req.query.divergence,
        flexFilter: req.query.flex,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        mediationFilter: req.query.mediation,
        devHistorico: req.query.devHistorico,
        platformFilter: req.query.plataforma || 'todos'
      };

      // 2. Chama o serviço para gerar o buffer do Excel
      const buffer = await OrderService.generateDashboardExcel(filters);

      // 3. Define headers para download
      const fileName = `relatorio_pedidos_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.send(buffer);

    } catch (error) {
      console.error('[OrderController.exportDashboardExcel] Erro:', error);
      res.status(500).send('Erro ao gerar relatório.');
    }
  },

  /**
   * Renderiza a página de upload de planilhas.
   */
  renderUploadPage(req, res) {
    const availablePlatforms = OrderService.getAvailablePlatforms();

    res.render('orders/upload', {
      user: req.user,
      activePage: 'pedidos',
      platforms: availablePlatforms,
      query: req.query
    });
  },

  //Página de sem etiquetas
  async renderSemEtiquetasPage(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = req.query.search || '';

      // Construir a query dinamicamente
      let baseQuery = `FROM shipping_labels WHERE sem_etiqueta = TRUE AND ativo = TRUE`;
      const queryParams = [];

      if (search) {
        baseQuery += ` AND (order_number ILIKE $1 OR loja ILIKE $1)`;
        queryParams.push(`%${search}%`);
      }

      // Conta o total de registos para a paginação
      const countQuery = `SELECT COUNT(*) ${baseQuery}`;
      const { rows: countRows } = await db.query(countQuery, queryParams);
      const totalRecords = parseInt(countRows[0].count);
      const totalPages = Math.ceil(totalRecords / limit);

      // Busca os dados com paginação e o novo campo "loja"
      const dataQuery = `
        SELECT order_number, loja
        ${baseQuery}
        ORDER BY order_number DESC
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `;
      
      const { rows: pedidosSemEtiqueta } = await db.query(dataQuery, [...queryParams, limit, offset]);

      // Se for uma requisição AJAX (fetch no frontend), devolve apenas o JSON
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.json({
          success: true,
          pedidos: pedidosSemEtiqueta,
          pagination: {
            page,
            limit,
            totalPages,
            totalRecords
          }
        });
      }

      // Renderiza a página completa na primeira carga
      res.render('orders/sem_etiqueta', {
        user: req.user,
        activePage: 'sem-etiqueta',
        pedidos: pedidosSemEtiqueta,
        pagination: {
          page,
          limit,
          totalPages,
          totalRecords
        },
        activeSearch: search,
        activeLimit: limit
      });
    } catch (error) {
      console.error('[OrderController.renderSemEtiquetasPage] Erro:', error);
      res.status(500).send('Erro interno ao carregar a página de sem etiquetas.');
    }
  },

  /**
   * API: Realiza a exclusão fake (soft delete) do pedido sem etiqueta
   */
  async hideSemEtiqueta(req, res) {
    try {
      const { order_number } = req.body;

      if (!order_number) {
        return res.status(400).json({ success: false, message: 'Número do pedido não informado.' });
      }

      await db.query(`
        UPDATE shipping_labels 
        SET ativo = FALSE 
        WHERE order_number = $1
      `, [order_number]);

      res.json({ success: true, message: 'Pedido ocultado com sucesso.' });
    } catch (error) {
      console.error('[OrderController.hideSemEtiqueta] Erro:', error);
      res.status(500).json({ success: false, message: 'Erro ao ocultar o pedido.' });
    }
  },

  async renderReturnConference(req, res) {
      res.render('orders/return_conference', {
          title: 'Conferência de Devoluções',
          activePage: 'conference'
      });
  },

  /**
   * API: Busca pedido para resolução (bipagem).
   */
  async checkReturnOrder(req, res) {
      try {
          const { term } = req.query;
          const order = await OrderService.findOrderForReturnResolution(term);
          res.json({ success: true, data: order });
      } catch (error) {
          // Retorna 400 com a mensagem do serviço (ex: Pedido não encontrado)
          res.status(400).json({ success: false, message: error.message });
      }
  },

  /**
   * API: Realiza a ação de resolver a devolução.
   */
  async resolveReturnOrder(req, res) {
      try {
          const { orderId } = req.body;
          await OrderService.confirmReturnResolution(orderId);
          res.json({ success: true });
      } catch (error) {
          console.error('Erro ao resolver devolução:', error);
          res.status(500).json({ success: false, message: 'Erro ao processar resolução.' });
      }
  },

  /**
   * Processa o upload das planilhas selecionadas.
   */
  async handleUpload(req, res) {
    try {
      const { plataforma } = req.body;
      const files = req.files || [];

      const results = await OrderService.processUpload(files, plataforma, req.user.id);

      const totalInserted = results.reduce((acc, item) => acc + item.inserted, 0);
      const totalUpdated = results.reduce((acc, item) => acc + item.updated, 0);

      const successParams = new URLSearchParams({
        success: 'import',
        inserted: totalInserted,
        updated: totalUpdated
      });

      res.redirect(`/pedidos/upload?${successParams.toString()}`);
    } catch (error) {
      console.error('[OrderController.handleUpload] Erro no upload:', error);

      const errorParams = new URLSearchParams({
        error: error.message || 'Falha ao processar os ficheiros.'
      });

      res.redirect(`/pedidos/upload?${errorParams.toString()}`);
    }
  },

  // --- Novas Rotas para Conciliação de Plataforma (Relatório Excel) ---
  
  async renderPlatformImportPage(req, res) {
    // Reutiliza a lista de plataformas (ML, Amazon, Shopee)
    const availablePlatforms = OrderService.getAvailablePlatforms();
    
    res.render('orders/platform_import', {
      user: req.user,
      activePage: 'pedidos',
      platforms: availablePlatforms
    });
  },

  async handlePlatformImport(req, res) {
    try {
      const { plataforma } = req.body;
      const files = req.files || [];
      const availablePlatforms = OrderService.getAvailablePlatforms();

      if (!files || files.length === 0) {
        return res.render('orders/platform_import', {
          user: req.user,
          activePage: 'pedidos',
          platforms: availablePlatforms,
          error: 'Nenhum arquivo enviado.'
        });
      }

      // Pega o primeiro arquivo e processa
      const file = files[0];
      const results = await OrderService.processPlatformReport(
          file.buffer, 
          plataforma, 
          req.user ? req.user.id : null
      );

      res.render('orders/platform_import', {
        user: req.user,
        activePage: 'pedidos',
        platforms: availablePlatforms,
        success: 'Relatório processado com sucesso!',
        results: results // Passa { total, updated, divergences } para a view mostrar os contadores
      });

    } catch (error) {
      console.error('[OrderController.handlePlatformImport] Erro:', error);
      const availablePlatforms = OrderService.getAvailablePlatforms();
      
      res.render('orders/platform_import', {
        user: req.user,
        activePage: 'pedidos',
        platforms: availablePlatforms,
        error: 'Erro ao processar relatório: ' + error.message
      });
    }
  },

  // --- MÉTODOS LEGADOS / API AUXILIARES ---
  // Mantidos para compatibilidade com outros módulos que possam chamar via fetch antigo

  async getStatusSummary(req, res) {
    try {
      const summary = await OrderService.getStatusSummary();
      res.json(summary);
    } catch (error) {
      console.error('[OrderController.getStatusSummary] Erro:', error);
      res.status(500).json({ message: 'Não foi possível obter o resumo de pedidos.' });
    }
  },
  
  async renderStatusImportPage(req, res) {
    res.render('orders/status_import', {
      user: req.user,
      activePage: 'pedidos'
    });
  },

  async downloadStatusTemplate(req, res) {
    try {
      const buffer = await OrderService.generateStatusImportTemplate();
      res.setHeader('Content-Disposition', 'attachment; filename="modelo_importacao_status.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error(error);
      res.status(500).send('Erro ao gerar modelo.');
    }
  },

  async handleStatusImport(req, res) {
    try {
      if (!req.files || !req.files.length) {
        return res.render('orders/status_import', { error: 'Nenhum arquivo enviado.' });
      }
      
      const file = req.files[0];
      const results = await OrderService.processStatusImport(file.buffer);
      
      res.render('orders/status_import', { 
        success: `Importação concluída! ${results.processed} pedidos atualizados.`,
        details: results.details,
        errors: results.errors
      });

    } catch (error) {
      console.error(error);
      res.render('orders/status_import', { error: 'Erro ao processar planilha: ' + error.message });
    }
  },
  // ---------------------

  async exportSystemLogs(req, res) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).send('Datas inicial e final são obrigatórias.');
      }

      const buffer = await OrderService.generateProductivityReport(startDate, endDate);

      const fileName = `relatorio_produtividade_${startDate}_ate_${endDate}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.send(buffer);

    } catch (error) {
      console.error('[OrderController.exportSystemLogs] Erro:', error);
      res.status(500).send('Erro ao gerar relatório de produtividade.');
    }
  },

  /**
  * Recebe o upload da planilha de Medidas e Pesos (Packaging).
  */
  async uploadPackagingMeasures(req, res) {
      try {
          if (!req.file) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            }

            // Chama o serviço
            const result = await OrderService.importPackagingMeasures(req.file.buffer);

            // Monta a mensagem de feedback
            let message = `Importação concluída! ${result.total} registros novos inseridos.`;
            
            // Se houver duplicados ignorados, adiciona ao aviso
            if (result.duplicates && result.duplicates.length > 0) {
                message += ` Atenção: ${result.duplicates.length} códigos repetidos foram ignorados: (${result.duplicates.join(', ')}).`;
            }

            return res.json({
                success: true,
                message: message,
                total: result.total
            });

      } catch (error) {
          console.error('Erro no upload de medidas:', error);
          // Retorna erro 400 se for erro de validação (ex: duplicatas), ou 500 para outros
          const status = error.message.includes('duplicados') ? 400 : 500;
          return res.status(status).json({ 
              success: false, 
              error: error.message 
          });
      }
  },

  /**
   * Renderiza a tela de Conferência de Medidas (Bipagem).
   */
  async renderPackagingConference(req, res) {
      res.render('orders/packaging_conference', {
          title: 'Conferência de Embalagens',
          // Passamos isAdmin se precisar mostrar o botão de upload na view
          isAdmin: req.user && req.user.role === 'admin',
          activePage: 'conference'
      });
  },

  /**
   * Renderiza a tela de Upload do Gabarito de Medidas.
   */
  async renderPackagingUpload(req, res) {
      res.render('orders/packaging_upload', {
          title: 'Importar Medidas de Embalagem',
          activePage: 'conference'
      });
  },

  /**
   * API: Busca as medidas de um anúncio (MLB) bipado.
   * Chamado via AJAX pelo frontend da conferência.
   */
  async checkPackaging(req, res) {
      try {
          const { mlb } = req.query;

          if (!mlb) {
              return res.status(400).json({ success: false, message: 'Código MLB não informado.' });
          }

          // Busca no Service
          const measure = await OrderService.findPackagingMeasure(mlb);

          if (measure) {
              return res.json({
                  success: true,
                  found: true,
                  data: measure
              });
          } else {
              return res.json({
                  success: true, // A requisição foi sucesso, mas não achou o dado
                  found: false,
                  message: 'Medidas não encontradas para este anúncio.'
              });
          }

      } catch (error) {
          console.error('Erro ao buscar medidas:', error);
          return res.status(500).json({ success: false, message: 'Erro interno ao consultar medidas.' });
      }
  },

  async getOrdersByBucket(req, res) {
    const { bucket } = req.params;
    try {
      const orders = await OrderService.getOrdersByBucket(bucket);
      const normalizedOrders = orders.map((order) => ({
        ...order,
        bucket: order.status_bucket,
        plataforma_label: PLATFORM_LABELS[order.plataforma] || order.plataforma
      }));
      res.json({
        bucket,
        label: STATUS_LABELS[bucket],
        orders: normalizedOrders
      });
    } catch (error) {
      console.error('[OrderController.getOrdersByBucket] Erro:', error);
      res.status(400).json({ message: error.message });
    }
  }
};

module.exports = OrderController;