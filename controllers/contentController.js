const c = require('../services/dynamo/content');
const cry = require('../services/encryption');
const emailing = require('../services/emailing');

const {fail} = require('../services/responses');

const _omit = require('lodash/omit')

const {FRONTEND_URL, IS_OFFLINE} = process.env;
const endpoint = IS_OFFLINE ? 'http://localhost:8001' : FRONTEND_URL;

const self = module.exports = {
  list: async (req, res) => {
    try {
      let contentList = await c.getAllContent();
      contentList.sort((a,b) => b.id - a.id)
      res.json(contentList);
      return;

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const { campaign_name, block_set_id, blocks, scheduled } = req.body;

      const attributes = {
        campaign_name,
        scheduled,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        //edit blocks here
        dynamoBlocks.push({
          ...b,
        });
      })

      const {contentId} = await c.saveContent(attributes, block_set_id, dynamoBlocks);
      res.status(201).json({
        id: contentId,
      });

    } catch (error) {
      fail(res, error);
    }
  },
  duplicate: async (req, res) => {
    try {
      const { contentId } = req.params;

      const content = await c.getContent(contentId)

      if (!content) throw {
        statusCode: 404,
        code: 'ContentNotFound',
      }

      const newAttrs = {
        ..._omit(content.attributes, ['sent_at', 'scheduled']),
        status: 'draft',
      }

      const result = await c.saveContent(newAttrs, content.block_set_id, content.blocks);
      res.status(201).json({
        newContentId: result.contentId,
      });

    } catch (error) {
      fail(res, error);
    }
  },
  detail: async (req, res) => {
    const { contentId } = req.params;
    try {

      let content = await c.getContent(contentId);

      res.json({
        ...content,
        preview_url: endpoint + '/content/preview?content_token=' + cry.aes256cbc.encrypt(contentId),
      });
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  preview: async (req, res) => {
    try {
      const { contentId } = req.params;
      const { user } = req.query;
      let html;
      if (user) {
        html = await emailing.composeUserCampaignEmailHTML(user.trim(), contentId);

      } else {
        let content = await c.getContent(contentId);
        html = await emailing.composeHTMLFromBlocks(content.blocks);
      }

      const response = {
        html,
      }
      if (user) {
        const contentObject = {userId: user, campaignId: contentId}
        const contentToken = cry.aes256cbc.encrypt(JSON.stringify(contentObject))
        response.preview_url = endpoint + '/content/preview?campaign_token=' + contentToken;
      }
      res.json(response)
    } catch (error) {
      fail(res, error);
    }
  },

  publish: async (req, res) => {
    const { contentId } = req.params;
    const { users } = req.body;
    try {
      await c.publishContent(contentId, users);
      res.json();

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const { contentId } = req.params;
      const { campaign_name, block_set_id, blocks, publish_notification, scheduled } = req.body;

      const attributes = {
        campaign_name,
        publish_notification,
        scheduled,
      }

      const dynamoBlocks = [];

      blocks.forEach(b => {
        //edit blocks here
        dynamoBlocks.push(b);
      })

      await c.saveContent(attributes, block_set_id, dynamoBlocks, contentId);
      res.json();

    } catch (error) {
      fail(res, error);
    }
  },

  delete: async (req, res) => {
    const { contentId } = req.params;
    const now = Date.now();

    try {
      res.status(500).json({message: 'NOT IMPLEMENTED'});

    } catch (error) {
      fail(res, error);
    }
  },


}
