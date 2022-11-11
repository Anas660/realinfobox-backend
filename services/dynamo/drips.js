'use strict'

const dynamo = require('../aws/dynamo');
const {dynamoDb, parseId} = dynamo;
const blockConfig = require('../../config/blocks');

const {APP_TABLE} = process.env;

const formatRFC3339 = require('date-fns/formatRFC3339');
const _ = require('lodash');

const self = module.exports = {
  parseContentEntitiesGroup: (entitiesArray) => {
    if (!entitiesArray.length) return undefined;

    const omit = ['pk', 'sk', 'entity'];
    const attributesRow = entitiesArray.find(ent => ent.sk.includes('ATTRIBUTES'));
    const blocksRow = entitiesArray.find(ent => ent.sk.includes('BLOCKS'));
    const dripId = parseId(attributesRow.pk);

    return {
      id: dripId,
      attributes: _.omit(attributesRow, omit),
      blocks: blocksRow.blocks,
    }
  },
  getAllDrips: async () => {
    try {
      const result = await dynamo.getAllOfEntity('DEMO_DRIP')
      if (!result.length) return [];

      const grouped = _.groupBy(result, i => parseId(i.pk));
      const parsed = Object.keys(grouped).map(key => {
        return self.parseContentEntitiesGroup(grouped[key]);
      })

      return parsed;

    } catch (error) {
      throw error;
    }
  },
  saveDrip: async (attributes, blocks, dripId = undefined) => {
    const now = formatRFC3339(new Date);
    const id = dripId || Date.now()

    const dripPk = `DEMO_DRIP|${id}`;

    const attrsObject = {
      sk: 'ATTRIBUTES',
      ...attributes,
    }
    const blocksObject = {
      sk: 'BLOCKS',
      blocks,
    }

    const putArray = [attrsObject, blocksObject].map(item => ({
      ...item,
      pk: dripPk,
      entity: 'DEMO_DRIP',
      created_at: now,
    }))

    await dynamo.batchWrite(APP_TABLE, putArray);

    return {id}
  },
  getDrip: async (dripId) => {
    try {
      let drip = await dynamo.getByPk(APP_TABLE, `DEMO_DRIP|${dripId}`);
      drip = self.parseContentEntitiesGroup(drip);
      if (!drip) return undefined;

      return {
        ...drip,
      };
    } catch (error) {
      throw error;
    }
  },

}
