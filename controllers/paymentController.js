const dynamo = require('../services/aws/dynamo');
const cognito = require('../services/aws/cognito');
const {fail} = require('../services/responses');
const userService = require('../services/user');
const paymentService = require('../services/payment');
const users = require('../services/dynamo/users');

const {
  APP_TABLE,
} = process.env;

const self = module.exports = {
  listInvoices: async (req, res) => {
    try {
      const stripe_user_id  = res.locals?.user?.attributes?.stripe_user_id;

      if(!stripe_user_id) return res.json([]);

      const clients = await paymentService.listInvoices(res.locals?.user?.attributes?.stripe_user_id);

      res.json(clients);

    } catch (error) {
      fail(res, error);
    }
  },
  listProducts: async (req, res) => {
    try {
      const products = await paymentService.listProducts();

      res.json(products);

    } catch (error) {
      fail(res, error);
    }
  },
  listSubscriptions: async (req, res) => {
    try {
      const subscriptions = await paymentService.listSubscriptions();

      res.json(subscriptions);

    } catch (error) {
      fail(res, error);
    }
  },
  listMySubscriptions: async (req, res) => {
    try {
      const subscriptions = await paymentService.listMySubscriptions();

      res.json(subscriptions);

    } catch (error) {
      fail(res, error);
    }
  },
  createInvoice: async (req, res) => {
    try {
      const invoice = await paymentService.createInvoice(req.body);

      res.json(invoice);

    } catch (error) {
      fail(res, error);
    }
  },
  createSession: async (req, res) => {
    try {
      const { price, mode } = req.query;

      const session = await paymentService.createSession(res.locals?.user, price, mode);

      res.json(session);

    } catch (error) {
      fail(res, error);
    }
  },
  createRecurringInvoice: async (req, res) => {
    try {
      const invoice = await paymentService.createRecurringInvoice(req.body);

      res.json(invoice);

    } catch (error) {
      fail(res, error);
    }
  },

}
