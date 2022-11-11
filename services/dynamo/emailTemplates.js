'use strict'

const dynamo = require('../aws/dynamo');

const {APP_TABLE} = process.env;

const self = module.exports = {
  get: async (templateName) => {
    try {
      const sk = templateName.replace(/-/g, '_').toUpperCase();

      const notif = await dynamo.getOne(APP_TABLE, {
        pk: 'EMAIL_TEMPLATE',
        sk,
      });
      return notif

    } catch (error) {
      throw error;
    }
  },
  set: async (templateName, template, subject) => {
    try {
      const sk = templateName.replace(/-/g, '_').toUpperCase();

      const item = {
        pk: 'EMAIL_TEMPLATE',
        sk,
        entity: 'EMAIL_TEMPLATE',
        template,
        subject,
      }

      await dynamo.put(APP_TABLE, item);

      return item;

    } catch (error) {
      throw error;
    }
  },
}
