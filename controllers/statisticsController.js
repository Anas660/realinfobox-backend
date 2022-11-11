const statisticsService = require('../services/statistic')

const {fail} = require('../services/responses');

const self = module.exports = {
  getClientsStatistics: async (req, res) => {
    try {
      const {year} = req.query;

      const parsedYear = parseInt(year);

      const clients = await statisticsService.getClientsStatistics(parsedYear);

      res.json({clients: clients});

    } catch (error) {
      fail(res, error)
    }
  },
  getDemosStatistics: async (req, res) => {
    try {
      const {year} = req.query;

      const parsedYear = parseInt(year);

      const clients = await statisticsService.getDemosStatistics(parsedYear);

      res.json({demos: clients});

    } catch (error) {
      fail(res, error)
    }
  },
  getProductsStatistics: async (req, res) => {
    try {
      const {year} = req.query;

      const parsedYear = parseInt(year);

      const products = await statisticsService.getProductsStatistics(parsedYear);

      res.json({products: products});

    } catch (error) {
      fail(res, error)
    }
  },
  getActionLogs: async (req, res) => {
    try {
      const { timestamp } = req.query;

      const logs = await statisticsService.getActionLogs(timestamp);

      res.json({logs: logs});

    } catch (error) {
      fail(res, error)
    }
  },
  getUserActionLogs: async (req, res) => {
    try {
      const {userId, timestamp} = req.query;

      const logs = await statisticsService.getUserActionLogs(userId, timestamp);

      res.json(logs);

    } catch (error) {
      fail(res, error)
    }
  },
}
