// controllers/PackingController.js
// Interface HTTP para o módulo de empacotamento

const PackingService = require('../services/PackingService');
const LabelGenerationService = require('../services/LabelGenerationService');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

const PackingController = {

  // Renderiza a estação de empacotamento
  async renderStation(req, res) {
    try {
      const plataforma = req.query.plataforma || 'mercado_livre';

      // 1. Busca sessão atual (se houver)
      const session = await PackingService.getCurrentAssignment(req.user.id);
      
      // 2. Busca a fila de pedidos prontos (Sidebar)
      // Carregamos aqui para a página já abrir com a lista preenchida
      const queueList = await PackingService.getQueueList(plataforma);

      res.render('packing/station', {
        user: req.user,
        activePage: 'empacotamento',
        session: session,
        initialQueue: JSON.stringify(queueList), // Passamos como JSON para o JS montar fácil
        activePlatformFilter: plataforma
      });
    } catch (error) {
      console.error('[PackingController.renderStation] Erro:', error);
      res.render('packing/station', {
        user: req.user,
        activePage: 'empacotamento',
        error: 'Erro ao carregar a estação de empacotamento.'
      });
    }
  },

  async renderLabel(req, res) {
    const { numero_venda } = req.params;

    try {
        const labelResult = await LabelGenerationService.generateLabelImageBase64(numero_venda);
        
        // --- NOVO: Separa a renderização entre PDF nativo e Imagem Base64 ---
        if (labelResult && labelResult.type === 'pdf') {
            // É a etiqueta Vetorial da Shopee! 
            // Envia o PDF puro para o navegador abrir o leitor de impressão sem perdas.
            res.contentType('application/pdf');
            return res.send(labelResult.data);
            
        } else {
            // É a etiqueta Rasterizada (Mercado Livre/Amazon). Injeta na view padrão.
            // Repare que agora usamos labelResult.data
            res.render('packing/label', {
                layout: 'label', 
                imgBase64: labelResult ? labelResult.data : null,
                numero_venda: numero_venda
            });
        }
      
    } catch (error) {
      console.error('[PackingController.renderLabel] Erro:', error);
      res.status(500).send(`Erro ao gerar etiqueta: ${error.message}`);
    }
  },

  async renderPdfLabel(req, res) {
    const { filename } = req.params;

    try {
        // O __dirname no controller aponta para /controllers. 
        // Voltamos um nível (..) e entramos na pasta pdfEtiquetas
        const pdfPath = path.join(__dirname, '..', 'pdfEtiquetas', filename);

        // Verifica se o arquivo físico existe no servidor
        if (!fs.existsSync(pdfPath)) {
            console.warn(`[PackingController.renderPdfLabel] Arquivo não encontrado: ${pdfPath}`);
            return res.status(404).send('Etiqueta PDF não encontrada no servidor.');
        }

        // Define o tipo de conteúdo como PDF para o navegador renderizar nativamente
        res.contentType('application/pdf');
        res.sendFile(pdfPath);
        
    } catch (error) {
        console.error('[PackingController.renderPdfLabel] Erro ao servir PDF:', error);
        res.status(500).send(`Erro interno ao carregar a etiqueta: ${error.message}`);
    }
  },

  // --- API Endpoints ---

  // NOVO: Retorna a fila atualizada em JSON (Reactive)
  async api_getQueue(req, res) {
    try {
        const plataforma = req.query.plataforma || 'mercado_livre';

        const list = await PackingService.getQueueList(plataforma);
        return res.json(list);
    } catch (error) {
        console.error('[PackingController.api_getQueue] Erro:', error);
        return res.status(500).json({ message: 'Erro ao buscar fila.' });
    }
  },

  // Processa o bip (inicia ou continua pedido)
  async api_scan(req, res) {
    try {
      const { sku, plataforma } = req.body;
      if (!sku) {
        return res.status(400).json({ message: 'SKU é obrigatório.' });
      }

      const isAdminUser = req.user.role === 'admin';

      const result = await PackingService.processScan({
        userId: req.user.id,
        sku: sku,
        isAdmin: isAdminUser,
        plataforma: plataforma || 'mercado_livre'
      });

      // Se finalizou, grava o log e registra quem fez
      if (result.finished) {
          try {
              const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
              const details = JSON.stringify({
                  numero_venda: result.numero_venda,
                  item_finalizador: sku,
                  status_novo: 'em_romaneio'
              });

              const { rows: usuarioResp } = await db.query(`SELECT username FROM users
                  WHERE id = $1`, [req.user.id]
              ); 

              await db.query(
                  `UPDATE mercado_livre_orders SET empacotador = $1
                    WHERE numero_venda = $2`, [usuarioResp[0].username, result.numero_venda]
              );

              await db.query(
                  `INSERT INTO system_logs (user_id, action_type, details, ip_address) VALUES ($1, $2, $3, $4)`,
                  [req.user.id, 'EMPACOTAMENTO_CONCLUIDO', details, ip]
              );

              console.log(`[Log] Empacotamento concluído: ${result.numero_venda}`);
          } catch (logErr) {
              console.error('[PackingController] Falha ao salvar log:', logErr.message);
          }
      }

      return res.json(result);
    } catch (error) {
      console.error('[PackingController.api_scan] Erro:', error);
      const status = error.message.includes('não encontrado') ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }
  },

  // Cancela o pedido atual
  async api_cancel(req, res) {
    try {
        const result = await PackingService.cancelCurrentSession(req.user.id);
        if (!result.success) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (error) {
        console.error('[PackingController.api_cancel] Erro:', error);
        return res.status(500).json({ message: 'Erro interno ao cancelar.' });
    }
  }
};

module.exports = PackingController;