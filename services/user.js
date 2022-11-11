'use strict';

const constants = require('../constants');
const productsService = require('./dynamo/products');
const dynamo = require('./aws/dynamo');
const cognito = require('./aws/cognito');
const citiesService = require('../services/dynamo/cities');
const ses = require('../services/aws/ses-emails');
const ml = require('../services/dynamo/mailingList');
const campaigns = require('../services/dynamo/campaigns');
const _ = require('lodash');

const {
  APP_TABLE,
} = process.env;

const self = module.exports = {
  listClients: async (limit = 1000, lastEvaluatedKey = null, type = constants.Groups.CLIENTS, filter) => {
    try {
      const cities = await citiesService.getAllCities();

      const dynamoResponse = await self.getClients(lastEvaluatedKey, limit, type, filter, cities);

      const clientsDtoOut = dynamoResponse.Items.map((u)=> {
        return {
          id: u.sub,
          attributes: {
            city_id: u.city_id,
            mailing_list_limit: u.mailing_list_limit,
            given_name: u.given_name,
            family_name: u.family_name,
            campaigns_enabled: u.campaigns_enabled,
            email: u.email,
            invited_at: u.invited_at,
            timezone: u.timezone,
            sub: u.sub,
          },
          email_verified: u.email_verified,
          createdAt: u.user_create_date,
          updatedAt: u.user_last_modified_date,
          account_status_updated_at: u.account_status_updated_at,
          status: u.status,
          enabled: u.enabled,
        }
      });
      const products = await productsService.getAllProducts();

      const response = await Promise.all(clientsDtoOut.map(async (user) => {

        const userProducts = await self.getUserProducts(user.id, products);

        const userDto = await self.getUserAttributes(user, user.attributes, cities);
        
        return {
          ...userDto,
          ...userProducts,
        };
      }));

      return {
        lastEvaluatedKey: dynamoResponse.LastEvaluatedKey,
        total: dynamoResponse.Total,
        data: response,
      };
            
    } catch (e) {
      throw e;
    }
  },
  usersCount: async (type = constants.Groups.CLIENTS) => {
    try {
      const users = await self.getClientsCount(type);

      return {
        count: users.length,
      };

    } catch (e) {
      throw e;
    }
  },
  getClientsCount: async (type) => {
    let result;
    let accumulated = [];
    let startKey = null;

    do {
      const params = {
        TableName: APP_TABLE,
        IndexName: 'reverse',
        ExclusiveStartKey: startKey,
        KeyConditionExpression: `#sk = :sk and begins_with(#pk, :pk)`,
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk":"sk",
          "#group": "group",
        },
        ExpressionAttributeValues: {
          ":pk": 'USER|',
          ":sk": "ATTRIBUTES",
          ":group": type,
        },
        FilterExpression : "#group=:group",
      }

      result = await dynamo.query(params)

      startKey = result.LastEvaluatedKey;

      accumulated = [...accumulated, ...result.Items];
    } while (result.LastEvaluatedKey);

    return accumulated;
  },
  getClients: async (exclusiveStartKey, limit, type, filter, cities) => {
    const cityFilterOptions = self.createCityFilterExpression(cities, filter);

    if(filter){
      return await self.listFilteredClients(exclusiveStartKey,cityFilterOptions, limit, type, filter);
    }else{
      return await self.listUnfilteredClients(exclusiveStartKey,cityFilterOptions, limit, type)
    }
  },
  listFilteredClients: async(exclusiveStartKey, cityFilterOptions, limit, type, filter) => {
    let startKey = exclusiveStartKey ? JSON.parse(exclusiveStartKey) : null;
    let tempStartKey = exclusiveStartKey ? JSON.parse(exclusiveStartKey) : null;
    const parsedLimit = limit ? parseInt(limit) : null;

    let result;
    let accumulated = [];

    do {
      const params = {
        TableName: APP_TABLE,
        IndexName: 'reverse',
        KeyConditionExpression: `#sk = :sk and begins_with(#pk, :pk)`,
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk":"sk",
          "#given_name": "search_given_name",
          "#family_name": "search_family_name",
          "#email": "search_email",
          "#user_status": "user_status",
          "#sub": "sub",
          "#group": "group",
        },
        ExpressionAttributeValues: {
          ":pk": 'USER|',
          ":sk": "ATTRIBUTES",
          ":filter": filter,
          ":group": type,
          ...cityFilterOptions,
        },
        FilterExpression : "#group=:group AND" +
          " ( contains(#given_name, :filter)" +
          " OR contains(#family_name, :filter)" +
          " OR contains(#email, :filter)" +
          " OR contains(#sub, :filter)" +
          " OR contains(#user_status, :filter)" +
          (cityFilterOptions ? ` OR city_id IN (${Object.keys(cityFilterOptions).toString()})` : '') +
          " )",
      }

      result = await dynamo.query(params)

      startKey = result.LastEvaluatedKey;

      accumulated = [...accumulated, ...result.Items];
    } while (result.LastEvaluatedKey);

    return self.applyLimitation(accumulated, tempStartKey, parsedLimit);
  },
  listUnfilteredClients: async(exclusiveStartKey, cityFilterOptions, limit, type) => {
    let startKey = exclusiveStartKey ? JSON.parse(exclusiveStartKey) : null;
    let tempStartKey = exclusiveStartKey ? JSON.parse(exclusiveStartKey) : null;
    const parsedLimit = limit ? parseInt(limit) : null;
    let result;
    let accumulated = [];

    do{
      const params = {
        TableName: APP_TABLE,
        IndexName: 'reverse',
        KeyConditionExpression: `#sk = :sk and begins_with(#pk, :pk)`,
        ExpressionAttributeNames: {
          "#pk": "pk",
          "#sk":"sk",
          "#group": "group",
        },
        ExpressionAttributeValues: {
          ":pk": 'USER|',
          ":sk": "ATTRIBUTES",
          ":group": type,
        },
        FilterExpression : "#group=:group",
      }
      result = await dynamo.query(params)

      startKey = result.LastEvaluatedKey;

      accumulated = [...accumulated, ...result.Items];
    }while(accumulated.length<parsedLimit+1 && result.LastEvaluatedKey)

    const clients = self.applyLimitation(accumulated, tempStartKey, parsedLimit);

    return {
      Items: clients.Items,
      LastEvaluatedKey: clients.LastEvaluatedKey,
    }
  },
  applyLimitation: (items, startKey, limit) => {
    const sorted = _.orderBy(items, e=> new Date(e.user_create_date), 'desc');

    const startIndex = startKey ? _.findIndex(sorted, (u) => { return u.pk == startKey.pk })+1 : 0;

    const filtered = sorted.slice(startIndex, startIndex+limit);

    const lastClient = _.last(filtered);

    const index = _.findIndex(sorted, (u) => { return u.sub == lastClient.sub });

    const lastEvaluatedKey = sorted.length > (index + 1) ? {pk: lastClient.pk, sk: lastClient.sk} : null;

    return {Items: filtered, LastEvaluatedKey: lastEvaluatedKey, Total: sorted.length};
  },
  getUserProducts: async (userId, productsList) => {
    const getUserProducts = await dynamo.getOne(APP_TABLE, {pk: `USER|${userId}`, sk: 'PRODUCTS'})
      
    if(!getUserProducts) return {
      allows: [],
    };
    
    const products = getUserProducts.productIds.map(pid => productsList.find(p => p.id == pid))

    return {
      allows: _.uniq(_.flatten(products.map(product => product.attributes.allows))),
      productIds: products.map(prod => prod.id),
    } 
  },
  getUserAttributes: async (user, userAttributes, cities) => {
    const city = await self.getUserCity(userAttributes, cities);

    if(city){
      user.attributes.city_id = userAttributes.city_id;
      user.attributes.city_name = city.attributes.name.toLowerCase();
    }

    const userMl = await ml.getMailingList(user.id);

    user.attributes.mailing_list_usage = userMl.filter(address => address.status === 'ok').length;

    const campaignsInfo = await self.getUserCampaignInfo(user);

    user.last_campaign = campaignsInfo;

    return user;
  },
  getUserCity: async (userAttributes, cities) => {
    if(!cities) return;

    const city = cities.find(city => city.id === userAttributes.city_id);

    if(!city) return;

    return city;
  },
  getUserCampaignInfo: async (user) => {
    const userCampaignAttributes = await campaigns.getLastUserCampaignAttributes(user.id);
    if (userCampaignAttributes) {

      const deliveryStats = await campaigns.getUserCampaignDeliveryStats(user.id, userCampaignAttributes.id);

      return {
        campaign_name: userCampaignAttributes.campaign_name,
        status: userCampaignAttributes.status,
        scheduled: userCampaignAttributes.scheduled,
        delivery_stats: {
          sent: deliveryStats.sent,
          bounce: deliveryStats.bounce,
        },
      };
    } else {
      return {
        delivery_stats: {},
      };
    }
  },
  createCityFilterExpression: (cities, filter) => {
    const city_ids = cities.filter(e=>self.contains(e.attributes.name, filter)).map(e=>e.id);

    if(!city_ids || city_ids.length===0) return null;

    let cityFilterOptions = {};

    let index = 1;

    city_ids.forEach(function(value) {
      index++;

      const titleKey = ":city_id_option"+index;

      cityFilterOptions[titleKey.toString()] = value;
    });

    return cityFilterOptions;
  },
  contains: (item, filter) => {
    return item.toLowerCase().includes(filter.toLowerCase());
  },
}
