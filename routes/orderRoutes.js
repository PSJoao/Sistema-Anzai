const express = require('express');
const router = express.Router();

const OrderController = require('../controllers/OrderController');
const { protectRoute, checkRole } = require('../middleware/authMiddleware');
const { ordersUpload, ordersUploadText } = require('../middleware/uploadMiddleware');

const isAdmin = [
    protectRoute,
    checkRole(['admin'])
];

// Listagem / dashboard (Torre de Controle)
router.get('/', protectRoute, OrderController.renderDashboard);

// Upload de planilhas
router.get('/upload', protectRoute, OrderController.renderUploadPage);
router.post(
  '/upload',
  protectRoute,
  ordersUploadText.array('orderFiles', 50),
  OrderController.handleUpload
);

//Página de Conferência de Pedidos Sem Etiqueta
router.get('/sem-etiqueta', protectRoute, OrderController.renderSemEtiquetasPage);

// Ação de ocultar (soft delete) pedido sem etiqueta
router.post('/sem-etiqueta/hide', protectRoute, OrderController.hideSemEtiqueta);

// --- Novas APIs para a Dashboard Avançada ---

// Atualização de Status Manual em Massa (Soberania)
router.post('/api/bulk-manual-status', isAdmin, OrderController.bulkUpdateManualStatus);

router.get('/api/export', OrderController.exportDashboardExcel);

// APIs auxiliares (Mantidas para compatibilidade ou uso futuro)
router.get('/api/status-summary', protectRoute, OrderController.getStatusSummary);
router.get('/api/status/:bucket', protectRoute, OrderController.getOrdersByBucket);

// --- Rota de Importação de Status em Massa ---
router.get('/importacao-status', isAdmin, OrderController.renderStatusImportPage);
router.get('/importacao-status/modelo', isAdmin, OrderController.downloadStatusTemplate);
router.post('/importacao-status', isAdmin, ordersUpload.any(), OrderController.handleStatusImport);

router.get('/importacao-plataforma', isAdmin, OrderController.renderPlatformImportPage);
router.post('/importacao-plataforma', isAdmin, ordersUpload.any(), OrderController.handlePlatformImport);

router.post('/packaging/upload', ordersUpload.single('file'), OrderController.uploadPackagingMeasures);

// 1. Tela Principal de Conferência (Bipagem)
router.get('/packaging/conference', protectRoute, OrderController.renderPackagingConference);

// 2. Tela de Upload de Planilha
router.get('/packaging/upload', protectRoute, OrderController.renderPackagingUpload);

// 3. API de Consulta (Usada pelo AJAX ao bipar o QR Code)
router.get('/api/packaging/check', protectRoute, OrderController.checkPackaging);

router.get('/api/export-logs', isAdmin, OrderController.exportSystemLogs);

router.get('/return/conference', protectRoute, OrderController.renderReturnConference);

// 2. API de Consulta (Usada pelo AJAX ao bipar)
router.get('/api/check-return', protectRoute, OrderController.checkReturnOrder);

// 3. API de Resolução (Marca como Resolvido)
router.post('/api/resolve-return', protectRoute, OrderController.resolveReturnOrder);

router.post('/api/nota', protectRoute, OrderController.updateOrderNote);

module.exports = router;