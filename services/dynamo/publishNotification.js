'use strict'

const dynamo = require('../aws/dynamo');
const {parseId} = dynamo;

const formatRFC3339 = require('date-fns/formatRFC3339');
const _ = require('lodash');

const {APP_TABLE} = process.env;

const self = module.exports = {
  get: async () => {
    try {
      const notif = await dynamo.getOne(APP_TABLE, {
        pk: 'DEFAULT',
        sk: 'PUBLISH_NOTIFICATION',
      });
      return notif

    } catch (error) {
      throw error;
    }
  },
  set: async (text) => {
    try {

      const item = {
        pk: 'DEFAULT',
        sk: 'PUBLISH_NOTIFICATION',
        entity: 'DEFAULT',
        text,
      }

      await dynamo.put(APP_TABLE, item);

      return item;

    } catch (error) {
      throw error;
    }
  },
}
