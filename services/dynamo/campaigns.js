'use strict'

const bl = require('./blocks');
const cont = require('./content');
const ml = require('./mailingList');
const dynamo = require('../aws/dynamo');

const formatRFC3339 = require('date-fns/formatRFC3339');
const isAfter = require('date-fns/isAfter');
const parseISO = require('date-fns/parseISO');

const _ = require('lodash');

const {APP_TABLE, CAMPAIGN_DELIVERY_TABLE, TEST_EMAIL} = process.env;

const self = module.exports = {

  parseCampaignEntitiesGroup: (entitiesArray) => {
    if (!entitiesArray.length) return undefined;

    const omit = ['pk', 'sk', 'entity'];
    const attributesRow = entitiesArray.find(ent => ent.sk.includes('ATTRIBUTES'));
    const blocksRow = entitiesArray.find(ent => ent.sk.includes('BLOCKS'));
    const contentRow = entitiesArray.find(ent => ent.sk.includes('|CAMPAIGN_CONTENT|'));
    const mailingListTagRow = entitiesArray.find(ent => ent.sk.includes('|MAILING_LIST_TAG|'));
    const campaignId = attributesRow.sk.split('|')[1];
    const parsedBlockObject = bl.parseBlocksRow(blocksRow);

    const campaign = {
      id: campaignId,
      attributes: _.omit(attributesRow, omit),
      blocks: parsedBlockObject.blocks,
      block_order: parsedBlockObject.block_order,
    }

    if (contentRow) {
      campaign.content_id = contentRow.sk.split('|').reverse()[0];
    }
    if (mailingListTagRow) {
      campaign.mailing_list_tag_id = mailingListTagRow.sk.split('|').reverse()[0];
    }

    return campaign;

  },
  getCampaign: async (campaignId) => {
    try {
      const camp = await dynamo.getByPk(APP_TABLE, `CAMPAIGN|${campaignId}`);
      return self.parseCampaignEntitiesGroup(camp);
    } catch (error) {
      throw error;
    }
  },
  getUserCampaigns: async (userId) => {
    try {
      const result = await dynamo.getSkBeginsWith(APP_TABLE, `USER|${userId}`, 'CAMPAIGN|');
      const grouped = _.groupBy(result, i => {
        const campaignId = i.sk.split('|')[1]; //first part of key between |s
        return campaignId;
      });

      const loadedContent = {};
      const parsed = await Promise.all(Object.keys(grouped).map(async campaignId => {
        const campaign = self.parseCampaignEntitiesGroup(grouped[campaignId]);
        let content;
        if (!loadedContent[campaign.content_id]) {
          content = await cont.getContent(campaign.content_id);
          loadedContent[campaign.content_id] = content;
        } else {
          content = loadedContent.content;
        }
        campaign.city = content.city;
        return campaign;
      }))

      return parsed;

    } catch (error) {
      throw error;
    }
  },
  getUserCampaignHTML: async (userId, campaignId) => {
    try {
      const userCampaign = await self.getUserCampaign(userId, campaignId);
      const html = userCampaign.blocks.map(pb => pb.text).join('');

      return html;
    } catch (error) {
      throw error;
    }
  },
  getUserCampaign: async (userId, campaignId, options = {}) => {
    const {withStats} = options
    try {
      const result = await dynamo.getSkBeginsWith(APP_TABLE,`USER|${userId}`, `CAMPAIGN|${campaignId}`);
      if (!result || !result.length) throw {
        statusCode: 404,
        message: `Campaign ${campaignId} of user ${userId} not found`,
      }

      const parsed = self.parseCampaignEntitiesGroup(result);
      const content = await cont.getContent(parsed.content_id);
      const clientCampaign = {
        ...parsed,
        id: campaignId,
        blocks: parsed.blocks,
        city: content.city,
        content,
      }

      if (withStats && clientCampaign.attributes.status === 'sent') {
        clientCampaign.delivery_stats = await self.getUserCampaignDeliveryStats(userId, campaignId, {withMailingList: true})
      }

      return clientCampaign;

    } catch (error) {
      throw error;
    }
  },
  getLastUserCampaignAttributes: async (userId) => {
    const userCampaigns = await dynamo.getSkBeginsWith(APP_TABLE, `USER|${userId}`, 'CAMPAIGN|')
    let userCampaignsAttributes = userCampaigns.filter(uc => ~uc.sk.indexOf('ATTRIBUTES'))
    userCampaignsAttributes = userCampaignsAttributes.map(uca => ({
      ...uca,
      id: uca.sk.replace('CAMPAIGN|', '').replace('|ATTRIBUTES', ''),
    }))
    userCampaignsAttributes.sort((a,b) => b.id - a.id)
    return userCampaignsAttributes[0]
  },
  getUserCampaignDeliveries: async (userId, campaignId = undefined) => {
    try {
      const pk = `USER|${userId}`
      const sk = `CAMPAIGN|${campaignId || ''}`
      let allDeliveries = await dynamo.getSkBeginsWith(CAMPAIGN_DELIVERY_TABLE, pk, sk)
      allDeliveries = allDeliveries
        .filter(ds => !~ds.sk.indexOf(TEST_EMAIL))
        .filter(ds=>{
          const split = ds.sk.split('|')
          return split[2] !== 'LINK' //email missing in sk, skip
        })
      let deliveries = []
      let links = [];
      allDeliveries.forEach(ads=> {
        if (ads.sk.includes('|LINK|')) links.push(ads)
        else deliveries.push(ads)
      })

      deliveries = deliveries.map(ds=> {
        const split = ds.sk.split('|')
        const email = ds.email || split.reverse()[0] //TODO remove OR part
        const campaignId = ds.campaignId || split[1] //TODO remove OR part
        return {
          ..._.omit(ds, ['pk', 'sk']),
          campaign_id: campaignId,
          email,
        }
      })

      links = links.map(ds=> {
        const split = ds.sk.split('|')
        const email = ds.email || split[2] //TODO remove OR part
        const campaignId = ds.campaign_id || split[1] //TODO remove OR part
        const linkHash = ds.link_hash || split.reverse()[0] //TODO remove OR part
        return {
          ..._.omit(ds, ['pk', 'sk']),
          campaign_id: campaignId,
          email,
          link_hash: linkHash,
        }
      })

      // since the metrics should be fully functional starting 2020-11-01, skip all stats until then
      const dateFilter = (delivery) => {
        return(isAfter(parseISO(delivery.created_at), parseISO('2020-10-31T23:59:59Z')))
      }

      const result = {
        links: links,
        deliveries: deliveries.filter(dateFilter),
      }
      return result

    } catch (error) {
      console.error(error)
    }
  },
  parseUserCampaignDeliveryStats: ({links,deliveries}) => {
    const counts = {
      sent: 0,
      delivered: 0,
      complaint: 0,
      bounce: 0,
      read: 0,
      unsubscribed: 0,
    }
    const mailingList = []
    const groupedLinksEmail = _.groupBy(links, 'email')
    const groupedLinksHash = _.groupBy(links, 'link_hash')

    const linkStats = Object.keys(groupedLinksHash).map(linkHash => {
      const userStatsArray = groupedLinksHash[linkHash]
      return {
        link: userStatsArray[0].link,
        link_hash: userStatsArray[0].link_hash,
        click_count: userStatsArray.reduce((prev, next) => (prev+next.click_count), 0),
        clicks_unique: userStatsArray.length,
      }
    }).sort((a,b) => b.click_count - a.click_count)

    if (deliveries && deliveries.length) {
      deliveries.forEach(ds => {
        if (!!ds.sent || ds.status === 'sent') counts.sent++
        if (!!ds.delivered) counts.delivered++
        if (!!ds.complaint || ds.status === 'complaint' ) counts.complaint++
        if (!!ds.unsubscribed) counts.unsubscribed++
        if (!!ds.read) counts.read++
        if (!!ds.bounce || ds.status === 'bounce' ) counts.bounce++

        const foundLinks = groupedLinksEmail[ds.email];
        mailingList.push({
          ...ds,
          links: foundLinks ? foundLinks.sort((a,b) => b.click_count - a.click_count) : [],
          clicks_total: foundLinks ? foundLinks.reduce((prev, next) => (prev+next.click_count), 0) : 0,
        })
      })
    }
    const stats = {
      ...counts,
      percent: {
        delivered: 100*counts.delivered/counts.sent|| 0,
        complaint: counts.delivered ? 100*counts.complaint/counts.delivered : 0,
        bounce: counts.delivered ? 100*counts.bounce/counts.delivered : 0,
        read: counts.delivered ? 100*counts.read/counts.delivered : 0,
        unsubscribed: counts.delivered ? 100*counts.unsubscribed/counts.delivered : 0,
      },
      mailing_list: mailingList,
      links: linkStats,
      clicks: {
        total: links.map(link => link.click_count).reduce((prev, next) => (prev+next), 0),
        unique: Object.keys(groupedLinksEmail).length,
      },
    }
    return stats
  },
  getUserCampaignDeliveryStats: async (userId, campaignId, {withMailingList} = {}) => {
    const {deliveries, links} = await self.getUserCampaignDeliveries(userId, campaignId)
    const userMailingList = await ml.getMailingList(userId)
    const keyedUserMailingList = _.keyBy(userMailingList, 'email')

    let parsedStats = self.parseUserCampaignDeliveryStats({deliveries, links})
    if (!withMailingList) {
      // remove mailing list delivery stats - used on userController to reduce response size
      delete parsedStats.mailing_list
    } else {
      parsedStats.mailing_list = parsedStats.mailing_list.map(ml => {
        const foundMl = keyedUserMailingList[ml.email]
        const name = foundMl ? `${foundMl.given_name} ${foundMl.family_name}` : undefined
        return {
          ...ml,
          name,
        }
      })
    }

    return parsedStats
  },
  getUserCampaignDeliveriesForEmails: async (userId) => {
    try {
      const {deliveries, links} = await self.getUserCampaignDeliveries(userId)
      const groupedStats = _.groupBy(deliveries, 'email')
      const groupedLinks = _.groupBy(links, 'email')
      const grouped = {}
      Object.keys(groupedStats).forEach(email => {
        grouped[email] = {
          stats: groupedStats[email],
          links: groupedLinks[email],
        }
      })
      return grouped

    } catch (error) {
      console.error(error)
    }
  },
  saveUserCampaign: async (userId, campaignId, {blocks, attributes, contentId, mailingListTagId}) => {
    try {
      let blocksDone, attrsDone, contentIdDone, mailingListTagIdDone;
      if (blocks)
        blocksDone = self.saveUserCampaignBlocks(userId, campaignId, blocks)

      if (attributes)
        attrsDone = self.updateAttrs(userId, campaignId, attributes)

      if (contentId){
        const item = {
          pk: `USER|${userId}`,
          sk: `CAMPAIGN|${campaignId}|CAMPAIGN_CONTENT|${contentId}`,
          entity: 'USER',
        }
        contentIdDone = dynamo.put(APP_TABLE, item)
      }
      if (mailingListTagId){
        const item = {
          pk: `USER|${userId}`,
          sk: `CAMPAIGN|${campaignId}|MAILING_LIST_TAG|${mailingListTagId}`,
          entity: 'USER',
        }
        mailingListTagIdDone = dynamo.put(APP_TABLE, item)
      }

      await Promise.all([blocksDone, attrsDone, contentIdDone, mailingListTagIdDone])

      return true;

    } catch (error) {
      throw error;
    }
  },
  saveUserCampaignBlocks: async (userId, campaignId, blocks) => {
    try {
      const pk = `USER|${userId}`;
      const sk = `CAMPAIGN|${campaignId}`;

      const putArray = [
        {
          pk,
          sk: sk + '|BLOCKS',
          ...bl.createDynamoBlocksRow(blocks),
          entity: 'USER',
          created_at: formatRFC3339(new Date),

        },
      ]
      return await dynamo.batchWrite(APP_TABLE, putArray);

    } catch (error) {
      throw error;
    }
  },
  updateAttrs: async (userId, campaignId, updateAttrs) => {
    try {
      return await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${userId}`,
        sk: `CAMPAIGN|${campaignId}|ATTRIBUTES`,
      }, {
        ...updateAttrs,
        entity: 'USER',
      })

    } catch (error) {
      throw error;
    }
  },
}
