// routes/packingRoutes.js
const express = require('express');
const router = express.Router();

const PackingController = require('../controllers/PackingController');
const { protectRoute } = require('../middleware/authMiddleware');

// --- PÁGINAS (VIEWS) ---

// A raiz agora leva direto para a estação de empacotamento (Fluxo Único)
router.get('/', protectRoute, PackingController.renderStation);

// Rota para impressão da etiqueta (popup)
router.get('/etiqueta/:numero_venda', protectRoute, PackingController.renderLabel);

// Rota para visualizar/imprimir a etiqueta em formato PDF (Shopee)
router.get('/etiqueta/pdf/:filename', protectRoute, PackingController.renderPdfLabel);

// --- API ENDPOINTS (AJAX) ---

router.get('/api/queue', protectRoute, PackingController.api_getQueue);

// Endpoint Universal: Recebe o SKU e decide se inicia pedido ou bipa item
router.post('/api/scan', protectRoute, PackingController.api_scan);

// Endpoint para Cancelar/Liberar o pedido atual e voltar para a fila
router.post('/api/cancel', protectRoute, PackingController.api_cancel);

module.exports = router;