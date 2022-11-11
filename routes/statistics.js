const express = require('express');
const router = express.Router();
const statisticsController = require('../controllers/statisticsController');
const { hasOneRole } = require('../middleware/permission');

router.get('/clients', hasOneRole('admin'), statisticsController.getClientsStatistics);
router.get('/demos', hasOneRole('admin'), statisticsController.getDemosStatistics);
router.get('/products', hasOneRole('admin'), statisticsController.getProductsStatistics);
router.get('/logs', hasOneRole('admin'), statisticsController.getActionLogs);
router.get('/user-logs', hasOneRole('admin'), statisticsController.getUserActionLogs);

module.exports = router;
