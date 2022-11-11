const bs = require('../services/dynamo/blockSets');
const {fail} = require('../services/responses');

const self = module.exports = {
  list: async (req, res) => {
    try {
      const localUser = res.locals.user;

      if (localUser.roles.admin || localUser.roles.editor) {
        const blockSets = await bs.getAllBlockSets();
        res.json(blockSets);
        return;
      }
      else if (localUser.roles.user) {
        // TODO load only user's campaigns
      }
      // res.json(campaigns);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const { name, city_id, blocks } = req.body;

      const attributes = {
        name,
        city_id,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        dynamoBlocks.push(b);
      })

      await bs.saveBlockSet(attributes, dynamoBlocks);
      res.status(201).json();

    } catch (error) {
      fail(res, error);
    }
  },
  detail: async (req, res) => {
    const { blockSetId } = req.params;
    try {
      const blockSet = await bs.getBlockSet(blockSetId);

      if (!blockSet) throw {
        statusCode: 404,
      }

      res.json(blockSet);

    } catch (error) {
      fail(res, error);
    }
  },
  update: async (req, res) => {
    try {
      const { blockSetId } = req.params;
      const { name, blocks, city_id } = req.body;

      const attributes = {
        name,
        city_id,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        dynamoBlocks.push(b);
      })

      await bs.saveBlockSet(attributes, dynamoBlocks, blockSetId);
      res.status(200).json();

    } catch (error) {
      fail(res, error);
    }
  },
  delete: async (req, res) => {
    try {
      res.status(500).json({message: 'NOT IMPLEMENTED'});

    } catch (error) {
      fail(res, error);
    }
  },

}
