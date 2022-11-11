const pubNot = require('../services/dynamo/publishNotification')
const {fail} = require('../services/responses');

const _omit = require('lodash/omit')

const self = module.exports = {
  get: async (req, res) => {
    try {
      const item = await pubNot.get();

      res.json(_omit(item, ['pk', 'sk']));

    } catch (error) {
      fail(res, error);
    }
  },
  set: async (req, res) => {
    try {
      const {text} = req.body;
      const result = await pubNot.set(text)

      res.json();

    } catch (error) {
      fail(res, error);
    }
  },
}
