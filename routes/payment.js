const express = require('express');
const router = express.Router();
const controller = require('../controllers/paymentController');
const {hasOneRole} = require('../middleware/permission');

router.get('/invoice', [
  hasOneRole('admin', 'editor'),
], controller.listInvoices);

router.get('/products', [
  hasOneRole('admin', 'editor', 'user'),
], controller.listProducts);

router.get('/subscriptions', [
  hasOneRole('admin', 'editor', 'user'),
], controller.listSubscriptions);
router.get('/mySubscriptions', [
  hasOneRole('admin', 'editor', 'user'),
], controller.listMySubscriptions);

router.post('/session', [
  hasOneRole('admin', 'editor', 'user'),
], controller.createSession);

router.post('/invoice', [
  hasOneRole('admin', 'editor'),
], controller.createInvoice);

router.post('/invoice/recurring', [
  hasOneRole('admin', 'editor'),
], controller.createRecurringInvoice);

module.exports = router;
