// const c = require('../services/dynamo/template');

const {fail} = require('../services/responses');
const bs = require('../services/dynamo/blockSets');
const templates = require('../services/dynamo/templates');
const bl = require('../services/dynamo/blocks');
const ml = require('../services/dynamo/mailingList');

const blockConfig = require('../config/blocks');

const self = module.exports = {
  get: async (req, res) => {
    try {
      const user = res.locals.user;

      const cityId = user.attributes.city_id;

      const cityTemplate = await templates.getUserTemplateBlocks(user.id, cityId);
      if (!cityTemplate) throw {
        statusCode: 404,
        code: 'NoTemplate',
        message: 'User template not found',
      }

      // load default blocks
      const blockSets = await bs.getAllBlockSets();
      const blockSetsOfCity = blockSets.filter(blockSet => blockSet.attributes.city_id === cityId);
      const blockSet =  blockSetsOfCity[0];

      // in template we filter out the customizable blocks, because they are only imported on template creation
      const blocksetBlocks = blockSet.blocks.filter(bl => !bl.customizable)
      const defaultBlocks = [
        ...blocksetBlocks,
        ...blockConfig.defaultBlocks,
      ]
      const mappedDefaultBlocks = defaultBlocks.map(bl => {
        return {
          ...bl,
          default: true,
        }
      })
      let blocks = bl.zipBlocksFromBlockOrder(cityTemplate.block_order, mappedDefaultBlocks, cityTemplate.blocks);

      blocks = blocks.map(b => {
        return {
          ...b,
          default: !!b.default,
        }
      })

      res.json({
        blocks,
        block_order: cityTemplate.block_order,
        default_blocks: mappedDefaultBlocks,
      });
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const user = res.locals.user;

      const {blocks, default_tag_ids} = req.body;
      const blockRowObject = bl.createDynamoBlocksRow(blocks);

      const cityId = user.attributes.city_id;

      // update the default tag
      const currentTags = await ml.listTags(user.id)
      const newTags = currentTags.map(tag => {
        tag.default = default_tag_ids.includes(tag.id)
        return tag;
      })
      await ml.updateTags(user.id, newTags)

      const cityTemplate = await templates.putUserTemplateBlocks(user.id, cityId, blockRowObject);
      res.json();

    } catch (error) {
      fail(res, error);
    }
  },

}
