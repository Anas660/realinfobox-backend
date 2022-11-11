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
      const cityId = key;

      return {
        id: cityId,
        attributes: _.omit(attributesRow, omit),
      }
    })

    return parsed;

  },
  getAllCities: async () => {
    try {
      const list = await dynamo.getAllOfEntity('CITY');

      const result = self.parseEntityArray(list);

      return result;

    } catch (error) {
      throw error;
    }
  },
  getCity: async (cityId) => {
    try {
      const city = await dynamo.getOne(APP_TABLE, {
        pk: `CITY|${cityId}`,
        sk: 'ATTRIBUTES',
      });

      const result = _.omit(city, ['pk', 'sk', 'entity']);

      return result;

    } catch (error) {
      throw error;
    }
  },
  createCity: async ({name, timezone}) => {
    const now = Date.now();

    const allCities = await self.getAllCities();

    const found = allCities.find(city => city.attributes.name.toLowerCase() === name.toLowerCase());

    if (found) {
      throw {
        statusCode: 409,
        code: 'CityAlreadyExists',
      }
    }

    try {
      const item = {
        pk: `CITY|${now}`,
        sk: 'ATTRIBUTES',
        entity: 'CITY',
        name,
        timezone,
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
  updateCity: async (cityId, {name, timezone}) => {
    try {
      const keys = {
        pk: `CITY|${cityId}`,
        sk: 'ATTRIBUTES',
      }

      const done = await dynamo.updateValues(APP_TABLE, keys, {
        name,
        timezone,
      });

      return done;

    } catch (error) {
      throw error;
    }
  },
  // deleteCity: async (cityId, name) => {
  //   try {
  //     const keys = {
  //       pk: `CITY|${cityId}`,
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
