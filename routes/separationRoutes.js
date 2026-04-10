const express = require('express');
const router = express.Router();

const SeparationController = require('../controllers/SeparationController');
const { protectRoute } = require('../middleware/authMiddleware');

router.get('/', protectRoute, SeparationController.renderDepartmentList);
router.get('/departamento/:code', protectRoute, SeparationController.renderDepartmentPage);

router.get('/api/session', protectRoute, SeparationController.getCurrentSession);
router.post('/api/acquire', protectRoute, SeparationController.acquireProduct);
router.post('/api/pick', protectRoute, SeparationController.pickUnit);
router.post('/api/release', protectRoute, SeparationController.releaseSession);
router.post('/api/confirm', protectRoute, SeparationController.confirmSeparation);
router.post('/api/reset', protectRoute, SeparationController.resetSeparation);
router.get('/api/search', protectRoute, SeparationController.globalSearch);
router.post('/api/search-acquire', protectRoute, SeparationController.searchAndAcquire);

module.exports = router;

