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

router.get('/subscription', [
  hasOneRole('admin', 'editor', 'user'),
], controller.listSubscription);

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
