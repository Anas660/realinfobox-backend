const cognito = require('../aws/cognito');
const dynamo = require('../aws/dynamo');
const c = require('./cities');
const p = require('./products');
const statisticService = require("../statistic");
const _ = require('lodash');

const { APP_TABLE, MAILING_LIST_TABLE } = process.env;

const self = module.exports = {
  getFullUser: async (userId) => {
    try {
      const userPk = `USER|${userId}`;
      const done = await Promise.all([
        cognito.getUser(userId),
        c.getAllCities(),
        dynamo.getOne(APP_TABLE, {pk: userPk, sk: 'ATTRIBUTES'}),
        dynamo.getSkBeginsWith(APP_TABLE, userPk, 'ACCOUNT|'),
        dynamo.getOne(APP_TABLE, {pk: userPk, sk: 'PRODUCTS'}),
        p.getAllProducts(),
      ]);

      const user = done[0];
      if (!user) {
        throw {
          statusCode: 404,
          message: `User ${userId} not found`,
        }
      }

      const cities = done[1];
      const attributes = done[2];
      const accountRows = done[3];
      const productRow = done[4];
      const products = done[5];

      let parsed = {
        ...user,
      }
      if (accountRows && accountRows.length) {
        parsed = {
          ...parsed,
          ...dynamo.parseRows(accountRows, 'ACCOUNT|'),
        }
      }
      if (attributes) {
        parsed.attributes = {
          ...parsed.attributes,
          ..._.omit(attributes, dynamo.omitBase),
        }

        const foundCity = cities.find(city => city.id === attributes.city_id);
        if (foundCity) {
          parsed.attributes.city_id = attributes.city_id;
          const city_name = foundCity.attributes.name.toLowerCase();
          parsed.attributes.city_name = city_name;
        }
      }

      parsed.productIds = []
      parsed.allows = []
      if (productRow) {
        parsed.productIds = productRow.productIds.map(pid => products.find(p => p.id == pid))
        parsed.allows = _.uniq(_.flatten(parsed.productIds.map(product => product.attributes.allows)))
      }

      return parsed;
    } catch (error) {
      throw error;
    }
  },
  getUserAccount: async (userId) => {
    try {
      const prefix = 'ACCOUNT|';
      const accountRows = await dynamo.getSkBeginsWith(APP_TABLE, `USER|${userId}`, prefix);
      const account = dynamo.parseRows(accountRows, prefix);

      return account;
    } catch (error) {
      throw error;
    }
  },
  removeUser: async (userId) => {
    try {
      const appTableRows = await dynamo.getByPk(APP_TABLE, `USER|${userId}`);
      const mailingListRows = await dynamo.getByPk(MAILING_LIST_TABLE, `USER|${userId}`);

      const requests = [];
      if (appTableRows.length)
        requests.push(dynamo.deleteMany(APP_TABLE, appTableRows.map(atr => _.pick(atr, ['pk', 'sk']))))

      if (mailingListRows.length)
        requests.push(dynamo.deleteMany(APP_TABLE, mailingListRows.map(atr => _.pick(atr, ['pk', 'sk']))))
      const done = await Promise.all(requests)

      return done;
    } catch (error) {
      throw error;
    }
  },
  setUserProducts: async (userId, productIds) => {
    try {
      await statisticService.updateUserProductStatistic(userId, productIds);

      await dynamo.put(APP_TABLE, {
        pk: `USER|${userId}`,
        sk: 'PRODUCTS',
        entity: 'USER',
        productIds,
      })

      return true
    } catch (error) {
      console.log(error)
      throw error;
    }
  },
}
