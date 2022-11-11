
const c = require('../services/dynamo/content');
const camp = require('../services/dynamo/campaigns');
const templ = require('../services/dynamo/templates');
const users = require('../services/dynamo/users');
const bl = require('../services/dynamo/blocks');
const ml = require('../services/dynamo/mailingList');
const cry = require('../services/encryption');
const emailing = require('../services/emailing');

const reportsController = require('../controllers/reportsController');

const dynamo = require('../services/aws/dynamo');

const {fail, succeed} = require('../services/responses');

const {CAMPAIGN_DELIVERY_TABLE } = process.env

const self = module.exports = {
  mailingUnsubscribe: async (req, res) => {
    try {
      const { user_id, campaign_id, email } = req.body;
      const campaign = await camp.getUserCampaign(user_id, campaign_id)
      await ml.updateAddressAttributes(email, {
        status: 'unsubscribed',
      })
      const keys = {
        pk: `USER|${user_id}`,
        sk: `CAMPAIGN|${campaign_id}|${email}`,
      }
      await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
        unsubscribed: true,
        status: 'unsubscribed',
      })

      res.status(204).send();

    } catch (error) {
      fail(res, error);
    }
  },
  // dripUnsubscribe: async (req, res) => {
  //   try {
  //     const { user_id, drip_id } = req.body;

  //     const keys = {
  //       pk: `USER|${user_id}`,
  //       sk: `ACCOUNT|${campaign_id}|${email}`,
  //     }
  //     await dynamo.updateSingleValue(DRIP_DELIVERY_TABLE, keys, 'unsubscribed', true)

  //     res.status(204).send();

  //   } catch (error) {
  //     fail(res, error);
  //   }
  // },
  contentPreview: async (req, res) => {
    try {
      const { content_token, campaign_token } = req.query;

      let decrypted;
      let campaignId, contentId, userId;
      if (content_token){
        decrypted = cry.aes256cbc.decrypt(content_token);
        contentId = decrypted

        const content = await c.getContent(contentId);
        if (!content)
          throw {
            statusCode: 404,
          }
        html = await emailing.composeHTMLFromBlocks(content.blocks);
        res.json({
          html,
        })
        return;

      }else if (campaign_token){

        decrypted = cry.aes256cbc.decrypt(campaign_token);
        const contentObject = JSON.parse(decrypted);
        campaignId = contentObject.campaignId;
        userId = contentObject.userId;
        let html = await emailing.composeUserCampaignEmailHTML(userId, campaignId);
        res.json({html})
        return;
      }

    } catch (error) {
      fail(res, error);
    }
  },
  reportPreview: async (req, res) => {
    try {
      const { report_token } = req.query;

      if (report_token) {
        const decrypted = cry.aes256cbc.decrypt(report_token);
        const {name, month, year, city, userId} = JSON.parse(decrypted);
        if (!(name && month && year && city)) {
          throw {
            statusCode: 401,
            code: 'InvalidToken',
          }
        }
        req.params.name = name;
        req.params.month = month;
        req.params.year = year;
        req.query.branding = true;
        res.locals.user = userId ? await users.getFullUser(userId) : null;
        if (city === 'calgary'){
          await reportsController.calgaryDetail(req, res)
          return;
        }
        if (city === 'edmonton'){
          await reportsController.edmontonDetail(req, res)
          return;
        }
      }
      throw {
        statusCode: 404,
        code: 'CityNotFound',
      }
    } catch (error) {
      fail(res, error);
    }
  },
  campaignMetricsRead: async (req, res) => {
    const {cid, email, uid} = req.query
    try {
      const keys = {
        pk: `USER|${uid}`,
        sk: `CAMPAIGN|${cid}|${email}`,
      }

      const stats = await dynamo.getOne(CAMPAIGN_DELIVERY_TABLE, keys)
      const openCount = (stats.open_count || 0)+ 1

      await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
        read: true,
        open_count: openCount,
      })

      let TRANSPARENT_GIF_BUFFER = Buffer.alloc(35)
      TRANSPARENT_GIF_BUFFER.write('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64')
      console.log(`READ ${openCount}`, cid, uid, email)
      res.writeHead(200,
        {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache,no-store,must-revalidate,max-age=0',
          'Cache-Control': 'post-check=0, pre-check=0", false',
          'Pragma': 'no-cache',
        });
      res.end(TRANSPARENT_GIF_BUFFER, 'binary');

    } catch (error) {
      console.error(error)
      fail(res, error);
    }
  },
  dripMetricsRead: async (req, res) => {
    // const {cid, email, uid} = req.query
    try {
      // const keys = {
      //   pk: `USER|${uid}`,
      //   sk: `CAMPAIGN|${cid}|${email}`,
      // }

      // await dynamo.updateSingleValue(CAMPAIGN_DELIVERY_TABLE, keys, 'read', true)
      const TRANSPARENT_GIF_BUFFER = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64');

      res.writeHead(200, { 'Content-Type': 'image/gif' });
      res.end(TRANSPARENT_GIF_BUFFER, 'binary');

    } catch (error) {
      console.error(error)
      fail(res, error);
    }
  },
}
