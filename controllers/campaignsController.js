const c = require('../services/dynamo/campaigns');
const cont = require('../services/dynamo/content');
const bl = require('../services/dynamo/blocks');
const cry = require('../services/encryption');
const dynamo = require('../services/aws/dynamo');

const emailing = require('../services/emailing');
const formatRFC3339 = require('date-fns/formatRFC3339');
const _omit = require('lodash/omit');
const _ = require('lodash');

const blockConfig = require('../config/blocks');

const {fail} = require('../services/responses');
const {FRONTEND_URL, IS_OFFLINE, APP_TABLE} = process.env;

const endpoint = IS_OFFLINE ? 'http://localhost:8001' : FRONTEND_URL;

const self = module.exports = {
  list: async (req, res) => {
    try {
      const localUser = res.locals.user;

      const campaigns = await c.getUserCampaigns(localUser.id);
      campaigns.sort((a,b) => b.id - a.id);
      res.json(campaigns);

    } catch (error) {
      fail(res, error);
    }
  },

  detail: async (req, res) => {
    const { campaignId } = req.params;
    try {
      const localUser = res.locals.user;

      const userCampaign = await c.getUserCampaign(localUser.id, campaignId, {withStats: true});
      const defaultBlocks = [
        ...userCampaign.content.blocks.filter(bl => !bl.customizable),
        ...blockConfig.defaultBlocks,
      ]

      const response = {
        ...userCampaign,
        blocks: bl.zipBlocksFromBlockOrder(
          userCampaign.block_order,
          defaultBlocks,
          userCampaign.blocks,
        ),
        default_blocks: defaultBlocks,
      }

      const contentObject = {userId: localUser.id, campaignId: campaignId}
      const contentToken = cry.aes256cbc.encrypt(JSON.stringify(contentObject))
      response.preview_url = endpoint + '/content/preview?campaign_token=' + contentToken;

      res.json({
        ...response,
        city: userCampaign.content.city,
      });
      return;

    } catch (error) {
      fail(res, error);
    }
  },
  duplicate: async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { campaign_name, scheduled, mailing_list_tag_id } = req.body;
      const userId = res.locals.user.id;

      const userCampaign = await c.getUserCampaign(userId, campaignId);
      const defaultBlocks = [
        ...userCampaign.content.blocks,
        ...blockConfig.defaultBlocks,
      ]

      const newAttrs = {
        ..._omit(userCampaign.attributes, ['sent_at', 'scheduled']),
        campaign_name,
        scheduled,
        duplicate_source: campaignId,
        status: 'draft',
      }

      const newCampaignId = Date.now();

      const saved = await c.saveUserCampaign(userId, newCampaignId, {
        blocks: bl.zipBlocksFromBlockOrder(
          userCampaign.block_order,
          defaultBlocks,
          userCampaign.blocks,
        ),
        attributes: newAttrs,
        contentId: userCampaign.content_id || campaignId, //fallback
        mailingListTagId: mailing_list_tag_id,
      });
      res.status(201).json({
        newCampaignId,
      });

    } catch (error) {
      fail(res, error);
    }
  },
  userPreview: async (req, res) => {
    const { campaignId } = req.params;
    try {
      const userId = res.locals.user.id;

      const html = await emailing.composeUserCampaignEmailHTML(userId, campaignId);

      res.json(html);
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  send: async (req, res) => {
    const { campaignId } = req.params;
    const user = res.locals.user;
    try {
      const campaign = await c.getUserCampaign(user.id, campaignId)
      if (!['draft', 'scheduled', 'published'].includes(campaign.attributes.status)) {
        throw {
          statusCode: 409,
          code: 'InvalidState',
          message: 'Campaign not in a state that allows sending',
        }
      }
      if (!user.business_address) {
        throw {
          statusCode: 403,
          code: 'NoBusinessAddress',
          message: 'No business address set',
        }
      }

      const now = formatRFC3339(new Date);
      await emailing.sendUserCampaignToMailingList(user.id, campaignId, user.attributes.email,
        campaign.mailing_list_tag_id ? [campaign.mailing_list_tag_id] : undefined);
      await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: `CAMPAIGN|${campaignId}|ATTRIBUTES`,
      }, {
        status: 'sent',
        sent_at: now,
      })

      res.json();

    } catch (error) {
      fail(res, error);
    }
  },
  update: async (req, res) => {
    try {
      const { campaignId } = req.params;
      const userId = res.locals.user.id;
      const { blocks, scheduled, status, email_subject } = req.body;
      const campaign = await c.getUserCampaign(userId, campaignId);

      if (campaign.attributes.status === 'sent')
        throw {
          statusCode: 409,
          code: 'CampaignAlreadySent',
          message: 'Campaign was already sent',
        }

      if (blocks && blocks.length)
        await c.saveUserCampaign(userId, campaignId, {blocks});

      const updateObj = {}
      if (scheduled) updateObj.scheduled = scheduled;
      if (status) updateObj.status = status;

      updateObj.email_subject = email_subject || null;

      if (Object.keys(updateObj).length)
        await c.updateAttrs(userId, campaignId, updateObj);

      res.json();

    } catch (error) {
      fail(res, error);
    }
  },

  delete: async (req, res) => {
    try {
      const { campaignId } = req.params;
      const userId = res.locals.user.id;

      const rows = await dynamo.getSkBeginsWith(APP_TABLE, `USER|${userId}`, `CAMPAIGN|${campaignId}`);
      if (rows && rows.length) {
        await dynamo.deleteMany(APP_TABLE, rows.map(r => _.pick(r, ['pk', 'sk'])))
      }

      res.send()

    } catch (error) {
      fail(res, error);
    }
  },


}
