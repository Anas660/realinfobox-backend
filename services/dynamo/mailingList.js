'use strict'

const dynamo = require('../aws/dynamo');
const cognito = require('../aws/cognito');
const formatRFC3339 = require('date-fns/formatRFC3339');

// const {isPast, endOfDay, differenceInMinutes} = require('date-fns');
const _ = require('lodash');
const uuidv4 = require('uuid/v4')


const {APP_TABLE, MAILING_LIST_TABLE} = process.env;



const self = module.exports = {
  getMailingList: async (userId) => {
    try {
      const list = await dynamo.getByPk(MAILING_LIST_TABLE, `USER|${userId}`);
      const result = list.map(row => _.omit(row, ['pk', 'sk']));

      return result;

    } catch (error) {
      throw error;
    }
  },
  setAddress: async (userId, addressObject, update = false) => {
    try {
      const keys = {
        pk: `USER|${userId}`,
        sk: `ADDRESS|${addressObject.email}`,
      }
      const exists = await dynamo.getOne(MAILING_LIST_TABLE, keys);
      const action = update && exists
        ? 'update' //same address
        : 'create' //different address

      if (action === 'create' && exists) {
        throw {
          statusCode: 400,
          code: 'AlreadyExists',
        }
      }

      const item = {
        ...keys,
        ...addressObject,
      }
      if (action === 'create') {
        item.created_at = formatRFC3339(new Date)
      }
      else {
        item.updated_at = formatRFC3339(new Date)
      }

      if (addressObject.tags) {
        if (typeof addressObject.tags.map === 'function') {
          item.tags = addressObject.tags.map(tag => tag.id || tag.name || tag);
        } else {
          item.tags = [addressObject.tags];
        }
      }
      else {
        item.tags = [];
      }

      await dynamo.put(MAILING_LIST_TABLE, item);

      return {
        action,
      };

    } catch (error) {
      throw error;
    }
  },
  getAddress: async (userId, address) => {
    try {
      return await dynamo.getOne(MAILING_LIST_TABLE, {
        pk: `USER|${userId}`,
        sk: `ADDRESS|${address}`,
      })
    } catch (error) {
      throw error;
    }
  },
  updateAddress: async (userId, address, addressObject) => {
    try {
      const {action} = await self.setAddress(userId, addressObject, true);
      if (action === 'create') {
        await dynamo.delete(MAILING_LIST_TABLE, {
          pk: `USER|${userId}`,
          sk: `ADDRESS|${address}`,
        })
      }

      return true;

    } catch (error) {
      throw error;
    }
  },
  updateAddressAttributes: async (address, attributesObject, username = undefined) => {
    try {
      let pk = 'USER|'
      if (username) {
        const user = await cognito.getUser(username)
        pk += user.id;
      }

      const allRecords = await dynamo.getPkBeginsWithReverse(MAILING_LIST_TABLE, `ADDRESS|${address}`, pk)

      const done = await Promise.all(allRecords.map(async record => {
        const keys = _.pick(record, ['pk','sk'])
        await dynamo.updateValues(MAILING_LIST_TABLE, keys, attributesObject)
        return true;
      }))

      return true;
    } catch (error) {
      throw error;
    }
  },
  deleteAddress: async (userId, address ) => {
    try {
      await dynamo.delete(MAILING_LIST_TABLE, {
        pk: `USER|${userId}`,
        sk: `ADDRESS|${address}`,
      })
      return true;

    } catch (error) {
      throw error;
    }
  },
  listTags: async (userId) => {
    try {
      const tagsRow = await dynamo.get({pk: `USER|${userId}`, sk: 'MAILING_LIST_TAGS'});

      return tagsRow ? tagsRow.tags : [];

    } catch (error) {
      throw error;
    }
  },

  updateTags: async (userId, tagsArray) => {
    try {
      const newTags = tagsArray.map(t => {
        if (!t.id) t.id = uuidv4();
        return t;
      });
      const hasDefault = newTags.find(t => t.default)
      if (!hasDefault && newTags.length) {
        newTags[0].default = true;
      }

      const item = {
        pk:`USER|${userId}`,
        sk: 'MAILING_LIST_TAGS',
        entity: 'USER',
        tags: newTags,
      }
      await dynamo.put(APP_TABLE, item);

      return newTags;

    } catch (error) {
      throw error;
    }
  },

}
