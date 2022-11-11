'use strict'

const cognito = require('../aws/cognito');
const dynamo = require('../aws/dynamo');
const bl = require('../dynamo/blocks');
const usrs = require('../dynamo/users');
const cities = require('../dynamo/cities');
const templates = require('../dynamo/templates');
const blockSets = require('../dynamo/blockSets');
const ml = require('../dynamo/mailingList');
const {dynamoDb, parseId} = dynamo;
const blockConfig = require('../../config/blocks');

const uuidv4 = require('uuid/v4');

const formatRFC3339 = require('date-fns/formatRFC3339');

// const {isPast, endOfDay, differenceInMinutes} = require('date-fns');
const _ = require('lodash');

const {APP_TABLE, SCHEDULE_TABLE} = process.env;



const self = module.exports = {


  saveContent: async (attributes, blockSetId, blocks, contentId = Date.now()) => {
    try {
      const now = formatRFC3339(new Date);

      const attrsObject = {
        sk: 'ATTRIBUTES',
        ...attributes,
      }

      const content = await self.getContent(contentId);

      if (!content) {
        attrsObject.status = 'draft';
      }else {
        attrsObject.status = content.attributes.status;
      }

      const contentPk = `CAMPAIGN_CONTENT|${contentId}`;

      const blocksToSave = blocks.map(bl => ({
        ...bl,
        default: true,
      }))

      const putArray = [
        attrsObject,
        {
          sk: `BLOCK_SET|${blockSetId}`,
        },
        {
          sk: 'BLOCKS',
          ...bl.createDynamoBlocksRow(blocksToSave),
        },
      ].map(item => {
        return {
          ...item,
          pk: contentPk,
          entity: 'CAMPAIGN_CONTENT',
          created_at: now,
        }
      })

      await dynamo.batchWrite(APP_TABLE, putArray);

      return {
        contentId,
      };

    } catch (error) {
      throw error;
    }
  },
  getAllContent: async () => {
    try {
      const done = await Promise.all([
        dynamo.getAllOfEntity('CAMPAIGN_CONTENT'),
        blockSets.getAllBlockSets(),
        cities.getAllCities(),
      ])
      const result = done[0];
      const bSets = done[1];
      const cts = done[2];

      if (!result.length) return [];

      const grouped = _.groupBy(result, i => parseId(i.pk));

      const parsed = Object.keys(grouped).map(key => {
        return self.parseContentEntitiesGroup(grouped[key]);
      })

      const allContent = parsed.map(cont => {
        const blockSet = bSets.find(bs => bs.id === cont.block_set_id)
        const city = cts.find(city => city.id === blockSet.attributes.city_id)
        return {
          ...cont,
          city: {
            id: city.id,
            ...city.attributes,
          },
        }
      })

      return allContent;
    } catch (error) {
      throw error;
    }
  },
  getLastCityContent: async (cityId) => {
    const allContent = await self.getAllContent()
    const cityContent = allContent.filter(ac => ac.city.id === cityId)
    const lastContent = cityContent.reverse()[0]
    return lastContent
  },
  parseContentEntitiesGroup: (entitiesArray) => {
    if (!entitiesArray.length) return undefined;

    const omit = ['pk', 'sk', 'entity'];
    const attributesRow = entitiesArray.find(ent => ent.sk.includes('ATTRIBUTES'));
    const blocksRow = entitiesArray.find(ent => ent.sk.includes('BLOCKS'));
    const blockSetRow = entitiesArray.find(ent => ent.sk.startsWith('BLOCK_SET|'));
    const contentId = parseId(attributesRow.pk);

    const parsedBlocksRow = bl.parseBlocksRow(blocksRow);

    return {
      id: contentId,
      attributes: _.omit(attributesRow, omit),
      block_set_id: parseId(blockSetRow.sk),
      ...parsedBlocksRow,
    }

  },
  getContent: async (contentId) => {
    try {
      let content = await dynamo.getByPk(APP_TABLE, `CAMPAIGN_CONTENT|${contentId}`);
      content = self.parseContentEntitiesGroup(content);
      if (!content) return undefined;
      const blockSet = await blockSets.getBlockSet(content.block_set_id);
      const city = await cities.getCity(blockSet.attributes.city_id)
      return {
        ...content,
        block_set: blockSet,
        city: {
          ...city,
          id: blockSet.attributes.city_id,
        },
      };
    } catch (error) {
      throw error;
    }
  },

  publishContent: async (contentId, userIds = undefined) => {
    try {
      const content = await self.getContent(contentId);
      if (!content) throw {
        statusCode: 404,
      }

      const cityId = content.city.id;

      const users = await cognito.listUsersInGroup('users');

      const now = formatRFC3339(new Date);
      let usersToProcess = users;
      if (userIds && userIds.length) {
        usersToProcess = users.filter(u => userIds.includes(u.id));
      }

      let readyUsers = await Promise.all(usersToProcess.map(async u => {
        try {
          let userCityTemplate;
          try {
            userCityTemplate = await templates.getUserTemplateBlocks(u.id, cityId);

          } catch (error) {
            console.log(error);
            // user has no template for this city, skip
            return false;


            // if (error.statusCode === 404) {
            //   // user has no template, shouldnt happen, but initialize it as backup
            //   const blocksRow = bl.createDynamoBlocksRow(blockSet.blocks);
            //   userCityTemplate = await templates.putUserTemplateBlocks(u.id, cityId, blocksRow);
            // }
            // else throw error;
          }

          const account = await usrs.getUserAccount(u.id)
          const automatedDelivery = account.settings.automated_campaign_delivery;

          //skip disabled users and users with disabled campaigns
          if (!u.enabled) return false;
          if (!u.attributes.campaigns_enabled) return false;
          const tags = await ml.listTags(u.id);
          const defaultTags = tags.filter(t => t.default);

          // merge the template blocks with content blocks
          const userBlocks = userCityTemplate.blocks.filter(bl => !bl.default);
          const defaultBlocks = [
            ...content.blocks,
            ...blockConfig.defaultBlocks,
          ].map(bl => ({
            ...bl,
            default: true,
          }))

          const zippedBlocks = bl.zipBlocksFromBlockOrder(
            userCityTemplate.block_order,
            defaultBlocks,
            userBlocks,
          )

          const userKey = `USER|${u.id}`;
          const userObj = {
            pk: userKey,
            entity: 'USER',
            created_at: now,
          }

          const toPut = []
          let i = 1
          for (const dtag of defaultTags) {
            // replace milliseconds to not get duplicite keys from date.now
            const campaignKey = `CAMPAIGN|${Date.now()}`.slice(0, -defaultTags.length) + _.padStart(i++, defaultTags.length, '0');
            toPut.push(
              {
                ...userObj,
                sk: campaignKey + '|ATTRIBUTES',
                ..._.omit(content.attributes, ['pk', 'sk', 'entity', 'created_at']),
                status: automatedDelivery ? 'scheduled' : 'draft',
              },
              {
                ...userObj,
                sk: campaignKey + '|BLOCKS',
                ...bl.createDynamoBlocksRow(zippedBlocks),
              },
              {
                ...userObj,
                sk: campaignKey + '|CAMPAIGN_CONTENT|' + contentId,
              },
              {
                ...userObj,
                sk: campaignKey + '|MAILING_LIST_TAG|' + dtag.id,
              },
            )
          }

          return toPut;
        } catch (error) {
          console.error(u.id);
          console.error(error);
          throw error;
        }
      }));
      readyUsers = readyUsers.filter(ru => !!ru); // filter the skipped ones
      const itemsToPut = _.flattenDepth(readyUsers, 1);

      let writeScheduledDone;
      if (!userIds) {
        //only write this on initial publish to all users
        writeScheduledDone = dynamo.updateValues(APP_TABLE, {
          pk: `CAMPAIGN_CONTENT|${contentId}`,
          sk: 'ATTRIBUTES',
        }, {
          status: 'scheduled',
          published_at: now,
        })
      }

      const done = await Promise.all([
        dynamo.batchWrite(APP_TABLE, itemsToPut),
        writeScheduledDone,
      ])

      return true;
    } catch (error) {
      throw error;
    }
  },
}
