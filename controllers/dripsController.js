const c = require('../services/dynamo/drips');
const cry = require('../services/encryption');
const {fail} = require('../services/responses');


const {FRONTEND_URL, IS_OFFLINE} = process.env;
const endpoint = IS_OFFLINE ? 'http://localhost:8001' : FRONTEND_URL;

const self = module.exports = {
  list: async (req, res) => {
    try {
      let dripsList = await c.getAllDrips();
      dripsList.sort((a,b) => b.id - a.id)
      res.json(dripsList);
      return;

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const { name, subject, city_id, delay, blocks } = req.body;

      const attributes = {
        name,
        subject,
        city_id,
        delay,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        //edit blocks here
        dynamoBlocks.push({
          ...b,
        });
      })

      const {id} = await c.saveDrip(attributes, dynamoBlocks);
      res.status(201).json({
        id,
      });

    } catch (error) {
      fail(res, error);
    }
  },

  detail: async (req, res) => {
    const { id } = req.params;
    try {

      let drip = await c.getDrip(id);

      res.json({
        ...drip,
        preview_url: endpoint + '/drip/preview?drips_token=' + cry.aes256cbc.encrypt(id),
      });
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const { dripId } = req.params;
      const { name, subject, city_id, delay, blocks } = req.body;

      const attributes = {
        name,
        subject,
        city_id,
        delay,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        //edit blocks here
        dynamoBlocks.push(b);
      })

      await c.saveDrip(attributes, dynamoBlocks, dripId);
      res.json();

    } catch (error) {
      fail(res, error);
    }
  },

  delete: async (req, res) => {
    const { dripId } = req.params;
    const now = Date.now();

    try {
      res.status(500).json({message: 'NOT IMPLEMENTED'});

    } catch (error) {
      fail(res, error);
    }
  },


}
