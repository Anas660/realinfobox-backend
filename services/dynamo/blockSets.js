'use strict'

const dynamo = require('../aws/dynamo');
const {parseId} = dynamo;

const formatRFC3339 = require('date-fns/formatRFC3339');
const {nanoid} = require('nanoid');
const _ = require('lodash');

const {APP_TABLE} = process.env;

const self = module.exports = {
  saveBlockSet: async (attributes, blocks, campaignId = Date.now()) => {
    try {
      const now = formatRFC3339(new Date);

      const blockSetId = `BLOCK_SET|${campaignId}`;
      // we split the array to individual blocks for saving
      const blocksForSaving = blocks.map(b => {
        return {
          ...b,
          customizable: !!b.customizable,
          default: true,
        }
      })
      const blockObject = {};
      const blockOrder = []
      let cnt = 0
      for (let i = 0; i < blocksForSaving.length; i++) {
        const block = blocksForSaving[i];
        const blockId = !block.customizable ? `default:block-${cnt++}` : `block-${nanoid(10)}`;
        blockObject[blockId] = {
          ...block,
          block_id: blockId,
        };
        blockOrder.push(blockId)
      }
      const putArray = [
        {
          sk: 'ATTRIBUTES',
          ...attributes,
        },
        {
          sk: 'BLOCKS',
          ...blockObject,
          block_order: blockOrder,
        },

      ].map(item => {
        return {
          ...item,
          pk: blockSetId,
          entity: 'BLOCK_SET',
          created_at: now,
        }
      })

      await dynamo.batchWrite(APP_TABLE, putArray);

      return true;

    } catch (error) {
      throw error;
    }
  },
  getAllBlockSets: async () => {
    try {
      const result = await dynamo.getAllOfEntity('BLOCK_SET');
      if (!result.length) return [];

      const grouped = _.groupBy(result, i => parseId(i.pk));

      const parsed = await Promise.all(Object.keys(grouped).map(async key => {
        return await self.parseBlockSetsEntitiesGroup(grouped[key]);
      }))

      return parsed;
    } catch (error) {
      throw error;
    }
  },
  parseBlockSetsEntitiesGroup: async (entitiesArray) => {
    if (!entitiesArray.length) return undefined;
    const omit = ['pk', 'sk', 'entity', 'created_at'];
    const attributesRow = entitiesArray.find(ent => ent.sk === 'ATTRIBUTES');
    const blocksRow = entitiesArray.find(ent => ent.sk === 'BLOCKS');
    const campaignId = parseId(attributesRow.pk);
    const blockOrder = blocksRow.block_order;
    let blocksObject = _.pickBy(blocksRow, (value, key) => key.startsWith('block-') || key.startsWith('default:block-')); //what is left should be just object stuff

    const cityAttributes = await dynamo.getOne(APP_TABLE, {
      pk: `CITY|${attributesRow.city_id}`,
      sk: 'ATTRIBUTES',
    })

    const blocks = blockOrder.map(blockId => {
      return {
        ...blocksObject[blockId],
        block_id: blockId,
      }
    })

    const result = {
      id: campaignId,
      attributes: _.omit(attributesRow, omit),
      block_order: blockOrder,
      blocks: blocks,
    }

    result.attributes.city_name = cityAttributes.name;

    return result;
  },
  getBlockSet: async (blockSetId) => {
    try {
      const camp = await dynamo.getByPk(APP_TABLE, `BLOCK_SET|${blockSetId}`);
      return await self.parseBlockSetsEntitiesGroup(camp);
    } catch (error) {
      throw error;
    }
  },
}
