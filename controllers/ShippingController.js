// controllers/ShippingController.js
const ShippingService = require('../services/ShippingService');
const BatchReportService = require('../services/BatchReportService'); 

const ShippingController = {

  // Renderiza a página principal de conferência
  async renderShippingPage(req, res) {
    try {
      const pendingOrders = await ShippingService.getPendingOrdersForShipping();
      const checkedOrders = await ShippingService.getPendingCheckedOrders();
      const shippedTodayCount = await ShippingService.getShippedTodayCount();

      // Calcula as estatísticas
      const stats = {
          total: pendingOrders.length,
          hoje: 0,
          atrasado: 0,
          futuro: 0,
          enviadosHoje: shippedTodayCount
      };

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      pendingOrders.forEach(order => {
          if (!order.data_envio_limite) {
              // Se não tem limite, podemos classificar como hoje (ou futuro, mas pela regra de pendência assumiremos hoje para simplificar, ou contar apenas no total)
              // Pela instrução "se tiver data limite de envio", vamos focar nela:
              stats.hoje++;
              return;
          }
          
          const limite = new Date(order.data_envio_limite);
          limite.setHours(0, 0, 0, 0);

          if (limite.getTime() < hoje.getTime()) {
              stats.atrasado++;
          } else if (limite.getTime() === hoje.getTime()) {
              stats.hoje++;
          } else {
              stats.futuro++;
          }
      });

      res.render('shipping/index', {
        user: req.user,
        activePage: 'expedicao',
        pendingOrders,
        checkedOrders,
        stats
      });
    } catch (error) {
      console.error('[ShippingController] Erro ao carregar página:', error);
      res.render('shipping/index', {
        user: req.user,
        activePage: 'expedicao',
        pendingOrders: [],
        checkedOrders: [],
        error: 'Erro ao carregar dados da expedição.'
      });
    }
  },

  // Renderiza a lista de romaneios (histórico)
  async renderBatchesPage(req, res) {
    try {
      const batches = await ShippingService.listBatches();
      res.render('shipping/batches', {
        user: req.user,
        activePage: 'expedicao',
        batches
      });
    } catch (error) {
      console.error('[ShippingController] Erro ao listar romaneios:', error);
      res.render('shipping/batches', {
        user: req.user,
        activePage: 'expedicao',
        batches: [],
        error: 'Erro ao carregar histórico de romaneios.'
      });
    }
  },

  // GERA O PDF DO ROMANEIO (Substituído para usar o BatchReportService)
  async renderBatchPdf(req, res) {
    try {
      const { id } = req.params;
      const batchData = await ShippingService.getBatchDetails(id);

      if (!batchData) {
        return res.status(404).send('Romaneio não encontrado.');
      }

      // Configura headers para o navegador entender que é um PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=romaneio-${batchData.batch_number}.pdf`);

      // Gera o PDF vetorial
      await BatchReportService.generatePdf(batchData, res);

    } catch (error) {
      console.error('[ShippingController] Erro ao gerar PDF:', error);
      res.status(500).send('Erro ao gerar romaneio.');
    }
  },

  // API: Bipar/Conferir Pedido
  async api_checkOrder(req, res) {
    try {
      const { term } = req.body;
      if (!term) {
        return res.status(400).json({ message: 'Informe o código do pedido ou NF.' });
      }

      const result = await ShippingService.checkOrder(term);
      return res.json(result);

    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  },

  // API: Gera o Relatório (Romaneio) agrupando os pedidos já enviados
  async api_finalizeBatch(req, res) {
    try {
      const result = await ShippingService.finalizeBatch(req.user.id);
      
      // Se o serviço retornou null, significa que não havia nada pendente.
      // Retornamos sucesso (status 200) com uma flag para o frontend saber que nada foi criado.
      if (!result) {
          return res.json({ success: true, generated: false, message: 'Nenhum pedido pendente para gerar relatório.' });
      }

      return res.json({ success: true, generated: true, ...result });

    } catch (error) {
      console.error('[ShippingController] Erro ao gerar relatório:', error);
      return res.status(400).json({ message: error.message });
    }
  }
  
};

module.exports = ShippingController;