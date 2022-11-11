'use strict'

const cognito = require('../aws/cognito');
const dynamo = require('../aws/dynamo');
const {dynamoDb, parseId} = dynamo;

const uuidv4 = require('uuid/v4');

const formatRFC3339 = require('date-fns/formatRFC3339');
const _ = require('lodash');

const {APP_TABLE, MAILING_LIST_TABLE} = process.env;

const self = module.exports = {
  parseEntityArray: (entityArray) => {
    const grouped = _.groupBy(entityArray, i => parseId(i.pk));
    const parsed = Object.keys(grouped).map(key => {
      const omit = ['pk', 'sk', 'entity'];
      const attributesRow = grouped[key].find(ent => ent.sk === 'ATTRIBUTES');
      const productId = key;

      return {
        id: productId,
        attributes: _.omit(attributesRow, omit),
      }
    })

    return parsed;

  },
  getAllProducts: async () => {
    try {
      const list = await dynamo.getAllOfEntity('PRODUCT');

      const result = self.parseEntityArray(list);

      return result;

    } catch (error) {
      throw error;
    }
  },
  getProduct: async (productId) => {
    try {
      const product = await dynamo.getOne(APP_TABLE, {
        pk: `PRODUCT|${productId}`,
        sk: 'ATTRIBUTES',
      });

      const result = _.omit(product, ['pk', 'sk', 'entity']);

      return result;

    } catch (error) {
      throw error;
    }
  },
  createProduct: async ({name, allows}) => {
    const now = Date.now();

    const allProducts = await self.getAllProducts();

    const found = allProducts.find(product => product.attributes.name.toLowerCase() === name.toLowerCase());

    if (found) {
      throw {
        statusCode: 409,
        code: 'ProductAlreadyExists',
      }
    }

    try {
      const item = {
        pk: `PRODUCT|${now}`,
        sk: 'ATTRIBUTES',
        entity: 'PRODUCT',
        name,
        allows,
        created_at: formatRFC3339(new Date()),
      }

      await dynamo.put(APP_TABLE, item);

      return {
        id: now,
      };

    } catch (error) {
      throw error;
    }
  },
  updateProduct: async (productId, {name, allows}) => {
    try {
      const keys = {
        pk: `PRODUCT|${productId}`,
        sk: 'ATTRIBUTES',
      }

      const done = await dynamo.updateValues(APP_TABLE, keys, {name, allows});

      return done;

    } catch (error) {
      throw error;
    }
  },
  // deleteProduct: async (productId, name) => {
  //   try {
  //     const keys = {
  //       pk: `PRODUCT|${productId}`,
  //       sk: 'ATTRIBUTES',
  //     }

  //     const done = await dynamo.updateSingleValue(APP_TABLE, keys,
  //       'name', name);

  //     return done;

  //   } catch (error) {
  //     throw error;
  //   }
  // },

}
