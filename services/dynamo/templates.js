const dynamo = require('../aws/dynamo');
const bl = require('./blocks');


const {
  APP_TABLE,
} = process.env;

const self = module.exports = {
  getUserTemplateBlocks: async (userId, cityId) => {
    try {
      const template = await dynamo.getOne(APP_TABLE, {
        pk: `USER|${userId}`,
        sk: `TEMPLATE|CITY|${cityId}|BLOCKS`,
      })

      if (!template) throw {
        statusCode: 404,
      }

      const parsed = bl.parseBlocksRow(template);
      return parsed;
    } catch (error) {
      throw error;
    }
  },
  putUserTemplateBlocks: async (userId, cityId, blockRowObject) => {
    try {
      const toPut = {
        pk: `USER|${userId}`,
        sk: `TEMPLATE|CITY|${cityId}|BLOCKS`,
        entity: 'USER',
        ...blockRowObject,
      };
      const template = await dynamo.put(APP_TABLE, toPut)

      const parsed = bl.parseBlocksRow(toPut);

      return parsed;
    } catch (error) {
      throw error;
    }
  },
}
