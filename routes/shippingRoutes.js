// routes/shippingRoutes.js
const express = require('express');
const router = express.Router();

const ShippingController = require('../controllers/ShippingController');
const { protectRoute } = require('../middleware/authMiddleware');

// Páginas
router.get('/', protectRoute, ShippingController.renderShippingPage);
router.get('/romaneios', protectRoute, ShippingController.renderBatchesPage);
router.get('/romaneio/:id/pdf', protectRoute, ShippingController.renderBatchPdf);

// APIs
router.post('/api/check', protectRoute, ShippingController.api_checkOrder);
router.post('/api/finalize', protectRoute, ShippingController.api_finalizeBatch);

module.exports = router;