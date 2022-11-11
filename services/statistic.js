'use strict';

const dynamo = require('./aws/dynamo');
const constants = require('../constants');
const citiesService = require('../services/dynamo/cities');
const productsService = require('./dynamo/products');
const cognito = require('../services/aws/cognito');
const _ = require('lodash');

const {
  STATISTIC_TABLE,
  APP_TABLE,
} = process.env;


const self = module.exports = {
  getUserActionLogs: async (userId, timestamp) => {
    try {
      let result;
      let accumulated = [];
      let startKey = null;

      do {
        const params = {
          TableName: STATISTIC_TABLE,
          KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk":"sk",
          },
          ExpressionAttributeValues: {
            ":pk": `${constants.Statistic.PK_PART}${timestamp}`,
            ":sk": `${userId}|`,
          },
        }

        result = await dynamo.query(params)

        startKey = result.LastEvaluatedKey;

        accumulated = [...accumulated, ...result.Items];
      } while (result.LastEvaluatedKey);

      const response = [];

      const [ cities, products ] = await Promise.all([await citiesService.getAllCities(), productsService.getAllProducts()]);

      const user = await dynamo.getOne(APP_TABLE, {
        pk: `USER|${userId}`,
        sk: 'ATTRIBUTES',
      });

      const userCity = self.getCityName(cities, user.city_id);

      for(const statistic of result.Items){
        const dto = {
          ...statistic,
          user: user ? `${user.given_name} ${user.family_name} (${user.email})`: statistic.user,
          city: userCity,
          action: self.getTranslation(statistic.sk),
          value: self.parseStatisticValue(statistic.value, statistic.sk, products),
        }

        response.push(dto)
      }

      const sortedLogs = _.orderBy(
        response,
        (s) => new Date(s.createdAt),
        'desc',
      );

      return {
        logs: sortedLogs,
        user: `${user.given_name} ${user.family_name} (${user.email})`,
      }

    } catch (error) {
      console.log("action logs error", error);
      throw error
    }
  },
  getActionLogs: async (timestamp) => {
    try {
      let result;
      let statistics = [];
      let startKey = null;

      do {
        const params = {
          TableName: STATISTIC_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
          },
          ExpressionAttributeValues: {
            ":pk": `${constants.Statistic.PK_PART}${timestamp}`,
          },
        }

        result = await dynamo.query(params)

        startKey = result.LastEvaluatedKey;

        statistics = [...statistics, ...result.Items];
      } while (result.LastEvaluatedKey);

      const response = [];

      const [ cities, products ] = await Promise.all([await citiesService.getAllCities(), productsService.getAllProducts()]);

      for(const statistic of statistics){

        const user = await dynamo.getOne(APP_TABLE, {
          pk: `USER|${statistic.userId}`,
          sk: 'ATTRIBUTES',
        });

        const dto = {
          ...statistic,
          user: user ? `${user.given_name} ${user.family_name} (${user.email})`: statistic.user,
          city: self.getCityName(cities, statistic.city),
          action: self.getTranslation(statistic.sk),
          value: self.parseStatisticValue(statistic.value, statistic.sk, products),
        }

        response.push(dto)
      }

      return _.orderBy(
        response,
        (s) => new Date(s.createdAt),
        'desc',
      );

    } catch (error) {
      console.log("action logs error", error);
      throw error
    }
  },
  getCityName: (cities, cityId) => {
    const city = cities.find((city)=>city.id === cityId)

    if(!city) return;

    return city.attributes.name
  },
  parseStatisticValue: (value, sk, products) => {
    const action = sk.split('|')[1];

    if(action === constants.Statistic.CLIENT_ADD_PRODUCT || action === constants.Statistic.DEMO_ADD_PRODUCT){
      const product = products.find((p)=> p.id === value);

      if(!product) return '';

      return product.attributes.name;
    }

    return value;
  },
  getTranslation: (sk) =>{
    const action = sk.split('|')[1];

    switch (action){
      case constants.Statistic.NEW_CLIENT: return 'New Client'
      case constants.Statistic.CLIENT_STATUS_CONFIRMED: return 'Client Confirmed'
      case constants.Statistic.CLIENT_STATUS_FORCE_CHANGE_PASSWORD: return 'Client Force Change Password'
      case constants.Statistic.CLIENT_EMAIL_VERIFIED: return 'Client Email Verified'
      case constants.Statistic.CLIENT_EMAIL_NOT_VERIFIED: return 'Client Email Not Verified'
      case constants.Statistic.CLIENT_ENABLED: return 'Client Enabled'
      case constants.Statistic.CLIENT_DISABLED: return 'Client Disabled'
      case constants.Statistic.CLIENT_ADD_PRODUCT: return 'New Product'
      case constants.Statistic.NEW_DEMO: return 'New Demo User'
      case constants.Statistic.DEMO_STATUS_CONFIRMED: return 'Demo Confirmed'
      case constants.Statistic.DEMO_STATUS_FORCE_CHANGE_PASSWORD: return 'Demo Force Change Password'
      case constants.Statistic.DEMO_EMAIL_VERIFIED: return 'Demo Email Verified'
      case constants.Statistic.DEMO_EMAIL_NOT_VERIFIED: return 'Demo Email Not Verified'
      case constants.Statistic.DEMO_ENABLED: return 'Demo Enabled'
      case constants.Statistic.DEMO_DISABLED: return 'Demo Disabled'
      case constants.Statistic.DEMO_ADD_PRODUCT: return 'Demo New Product'
      case constants.Statistic.USER_SIGN_IN: return 'Sign In'
      case constants.Statistic.USER_REFRESH_TOKEN: return 'Token Refreshed'
    }
  },
  getClientsStatistics: async (year) => {
    try {
      const monthStart = year===2022 ? 8 : 1;
      const monthEnd = new Date().getMonth()+2;

      const months = _.range(monthStart, monthEnd).reverse();

      const response = [];

      for(const month of months){

        const timestamp = `${year}-${month}`;

        const newClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.NEW_CLIENT);
        const activatedClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.CLIENT_STATUS_CONFIRMED);
        const verifiedClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.CLIENT_EMAIL_VERIFIED);
        const enabledClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.CLIENT_ENABLED);
        const disabledClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.CLIENT_DISABLED);

        const results = await Promise.all([
          newClientsPromise,
          activatedClientsPromise,
          verifiedClientsPromise,
          enabledClientsPromise,
          disabledClientsPromise,
        ])

        const [newClients, activatedClients, verifiedClients, enabledClients, disabledClients]  = results;

        response.push({
          date: `${month}. ${year}`,
          timestamp,
          new: newClients.length,
          activated: activatedClients.length,
          verified: verifiedClients.length,
          enabled: enabledClients.length,
          disabled: disabledClients.length,
        })
      }

      return response;

    } catch (error) {
      console.log("get statistics", error);
      throw error
    }
  },
  getDemosStatistics: async (year) => {
    try {
      const monthStart = year===2022 ? 8 : 1;
      const monthEnd = new Date().getMonth()+2;

      const months = _.range(monthStart, monthEnd).reverse();

      const response = [];

      for(const month of months){

        const timestamp = `${year}-${month}`;

        const newClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.NEW_DEMO);
        const activatedClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.DEMO_STATUS_CONFIRMED);
        const verifiedClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.DEMO_EMAIL_VERIFIED);
        const enabledClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.DEMO_ENABLED);
        const disabledClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.DEMO_DISABLED);

        const results = await Promise.all([
          newClientsPromise,
          activatedClientsPromise,
          verifiedClientsPromise,
          enabledClientsPromise,
          disabledClientsPromise,
        ])

        const [newClients, activatedClients, verifiedClients, enabledClients, disabledClients]  = results;
        console.log("newClients", newClients)
        response.push({
          date: `${month}. ${year}`,
          timestamp,
          new: newClients.length,
          activated: activatedClients.length,
          verified: verifiedClients.length,
          enabled: enabledClients.length,
          disabled: disabledClients.length,
        })
      }

      return response;

    } catch (error) {
      console.log("get statistics", error);
      throw error
    }
  },
  getProductsStatistics: async (year) => {
    try {
      const monthStart = year===2022 ? 8 : 1;
      const monthEnd = new Date().getMonth()+2;

      const months = _.range(monthStart, monthEnd).reverse();

      const cities = await citiesService.getAllCities()

      const products = await productsService.getAllProducts();

      if(products.length !== 3 ) return;

      const response = [];

      for(const month of months){

        const timestamp = `${year}-${month}`;

        const newClientsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.NEW_CLIENT);
        const clientProductsPromise = self.getStatisticsByTimestamp(timestamp, constants.Statistic.CLIENT_ADD_PRODUCT);


        const results = await Promise.all([
          newClientsPromise,
          clientProductsPromise,
        ]);

        const [newClients, clientProducts]  = results;

        const groupedClientsByCityId = _.groupBy(newClients, (e)=>e.city);

        const groupedClientProductsByCityId = _.groupBy(clientProducts, (e)=>e.city);
        const groupedClientProductsByProducts = _.groupBy(clientProducts, (e)=>e.value);

        const reportsAndNewsletterProductId = products[0].id;
        const reportsProductId = products[1].id;
        const newsletterProductId = products[2].id;

        const reportsAndNewsletters = groupedClientProductsByProducts[reportsAndNewsletterProductId];
        const reports = groupedClientProductsByProducts[reportsProductId];
        const newsletters = groupedClientProductsByProducts[newsletterProductId];

        const sumStatistic = `${reportsAndNewsletters ? reportsAndNewsletters.length : 0}/${reports ? reports.length : 0}/${newsletters ? newsletters.length : 0}`

        let cityStatistics = {};

        for (const city of cities){
          if(city.attributes.name){
            const newProductsInTheCity = groupedClientProductsByCityId[city.id];

            let productsStatistic = ""
            for(const product of products){
              if(!newProductsInTheCity){
                productsStatistic = "/0/0/0";
                continue;
              }

              const statistics = newProductsInTheCity.filter((record)=> record.value === product.id);

              productsStatistic += `/${statistics ? statistics.length : 0}`
            }

            const newClientsInTheCity = groupedClientsByCityId[city.id];
            const newClientsLength = newClientsInTheCity ? newClientsInTheCity.length : 0;

            cityStatistics = {...cityStatistics, [city.attributes.name.toLowerCase()]: `${newClientsLength}${productsStatistic}`}
          }
        }

        response.push({
          ...cityStatistics,
          date: `${month}. ${year}`,
          timestamp,
          sum: `${newClients.length}/${sumStatistic}`,
        })
      }

      return response;

    } catch (error) {
      console.log("get statistics", error);
      throw error
    }
  },
  isUserDemo: async (userId) => {
    const userDB = await dynamo.getOne(APP_TABLE, {pk: `USER|${userId}`, sk: 'ATTRIBUTES'});

    const isDemo = userDB.group === constants.Groups.DEMOS;

    return isDemo;
  },
  updateUserProductStatistic: async(userId, productsId) => {
    const products = await dynamo.getOne(APP_TABLE, {
      pk: `USER|${userId}`,
      sk: 'PRODUCTS',
    })

    const isDemo = await self.isUserDemo(userId);

    const newProducts = products && products.productIds.length>0 ? productsId.filter((p)=> !products.productIds.includes(p)): productsId;

    const promises = [];

    for (const product of newProducts){
      promises.push(self.saveStatistic(userId, isDemo ? constants.Statistic.DEMO_ADD_PRODUCT : constants.Statistic.CLIENT_ADD_PRODUCT, product));
    }

    await Promise.all(promises);
  },
  updateUserStatistics: async (userId, user) => {
    const userDB = await dynamo.getOne(APP_TABLE, {pk: `USER|${userId}`, sk: 'ATTRIBUTES'});

    if(new Date(userDB.user_create_date).getTime() < new Date(2022, 6,30).getTime()) return;

    console.log("userDB", userDB)
    console.log("user", user)

    await Promise.all([
      self.handleUserEnabled(user.enabled, userId),
      self.handleUserStatus(user.status, userId),
      self.handleUserEmailVerification(user.email_verified, userId),
    ])
  },
  getCurrentState: (a, b) => {
    if (!a || a.length === 0) return b;
    if (!b || b.length === 0) return a;

    if (new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime()) return a;

    return b;
  },
  handleUserStatus: async (status, userId) => {
    const isDemo = await self.isUserDemo(userId);

    const skStatusConfirmed = isDemo ? constants.Statistic.DEMO_STATUS_CONFIRMED : constants.Statistic.CLIENT_STATUS_CONFIRMED;
    const skStatusForcePasswordChange = isDemo ? constants.Statistic.DEMO_STATUS_FORCE_CHANGE_PASSWORD : constants.Statistic.CLIENT_STATUS_FORCE_CHANGE_PASSWORD;

    const isConfirmed = await self.getCurrentUserStatistic(userId, skStatusConfirmed);
    const isPasswordChangeRequired = await self.getCurrentUserStatistic(userId, skStatusForcePasswordChange);
    console.log(userId, "isConfirmed", isConfirmed)
    console.log(userId, "isPasswordChangeRequired", isPasswordChangeRequired)

    if(!isConfirmed && !isPasswordChangeRequired) {
      await self.saveStatistic(userId, status==="CONFIRMED" ? skStatusConfirmed : skStatusForcePasswordChange);
      return;
    }

    const current = self.getCurrentState(isConfirmed, isPasswordChangeRequired);

    if(current.status===status) return;

    await self.saveStatistic(userId, status === "CONFIRMED" ? skStatusConfirmed : skStatusForcePasswordChange);
  },
  handleUserEmailVerification: async (email_verified, userId) => {
    const isDemo = await self.isUserDemo(userId);

    const skEmailVerified= isDemo ? constants.Statistic.DEMO_EMAIL_VERIFIED : constants.Statistic.CLIENT_EMAIL_VERIFIED;
    const skEmailNotVerified = isDemo ? constants.Statistic.DEMO_EMAIL_NOT_VERIFIED : constants.Statistic.CLIENT_EMAIL_NOT_VERIFIED;

    const isEmailVerified = await self.getCurrentUserStatistic(userId, skEmailVerified);
    const isEmailNotVerified = await self.getCurrentUserStatistic(userId, skEmailNotVerified);
    console.log(userId, "isEmailVerified", isEmailVerified)
    console.log(userId, "isEmailNotVerified", isEmailNotVerified)

    if(!isEmailVerified && !isEmailNotVerified) {
      await self.saveStatistic(userId, email_verified ? skEmailVerified : skEmailNotVerified);
      return;
    }

    const current = self.getCurrentState(isEmailVerified, isEmailNotVerified);

    if(current.email_verified===email_verified) return;

    await self.saveStatistic(userId, email_verified ? skEmailVerified : skEmailNotVerified);
  },

  handleUserEnabled: async (enabled, userId) => {
    const isDemo = await self.isUserDemo(userId);

    const skEnabled = isDemo ? constants.Statistic.DEMO_ENABLED : constants.Statistic.CLIENT_ENABLED;
    const skDisabled = isDemo ? constants.Statistic.DEMO_DISABLED : constants.Statistic.CLIENT_DISABLED;

    const isEnabled = await self.getCurrentUserStatistic(userId, skEnabled);
    const isDisabled = await self.getCurrentUserStatistic(userId, skDisabled);
    console.log(userId, "isEnabled", isEnabled)
    console.log(userId, "isDisabled", isDisabled)

    if(!isEnabled && !isDisabled) {
      await self.saveStatistic(userId, enabled ? skEnabled : skDisabled);
      return;
    }

    const current = self.getCurrentState(isEnabled, isDisabled);

    if(current.enabled===enabled) return;

    await self.saveStatistic(userId, enabled ? skEnabled : skDisabled);
  },
  createClient: async (userId, email) => {
    await self.saveStatistic(userId, constants.Statistic.NEW_CLIENT, email);
  },
  createDemo: async (userId, email) => {
    await self.saveStatistic(userId, constants.Statistic.NEW_DEMO, email);
  },
  getTimeStamp: () => {
    const now = new Date();
    const month = now.getMonth()+1;

    return `${now.getFullYear()}-${month}`;
  },
  getISODate: () => {
    return new Date().toISOString();
  },
  getCurrentUserStatistic: async  (userId, key) =>{
    try{
      let result;
      let statistics = [];
      let startKey = null;

      do {
        const params = {
          TableName: STATISTIC_TABLE,
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#sk":"sk",
          },
          IndexName: 'reverse',
          ExpressionAttributeValues: {
            ":pk": `${constants.Statistic.PK_PART}`,
            ":sk": `${userId}|${key}`,
          },
          FilterExpression : "begins_with(#pk, :pk) AND  begins_with(#sk, :sk)",
        }

        result = await dynamo.scan(params)

        startKey = result.LastEvaluatedKey;

        statistics = [...statistics, ...result.Items];
      } while (result.LastEvaluatedKey);

      if(!statistics || statistics.length===0) return null;

      const orderByCreatedAt = _.orderBy(
        statistics,
        (s) => new Date(s.createdAt),
        'asc',
      );

      const current = _.last(orderByCreatedAt);

      return current;
    }catch (e) {
      return null;
    }
  },
  getStatisticsByTimestamp: async  (timestamp, sk) =>{
    try{
      const params = {
        TableName: STATISTIC_TABLE,
        KeyConditionExpression: `pk = :pk`,
        ExpressionAttributeValues: {
          ":pk": `${constants.Statistic.PK_PART}${timestamp}`,
          ":userAction": sk,
        },
        FilterExpression: "contains(userAction, :userAction)",
      }

      return await dynamo.queryAll(params);
    }catch (e) {
      console.log('get statistics:', e);
      return [];
    }

  },
  saveUserSignIn: async (token) => {
    const user = await cognito.getUserByAccessToken(token);

    const cognitoUser = await cognito.getUser(user.Username);

    if(!cognitoUser) return;

    if(cognitoUser.groups.includes(constants.Groups.CLIENTS) || cognitoUser.groups.includes(constants.Groups.DEMOS)){
      await self.saveStatistic(user.Username, constants.Statistic.USER_SIGN_IN);
    }
  },
  saveUserRefreshToken: async (token) => {
    const user = await cognito.getUserByAccessToken(token);

    const cognitoUser = await cognito.getUser(user.Username);

    if(!cognitoUser) return;

    if(cognitoUser.groups.includes(constants.Groups.CLIENTS) || cognitoUser.groups.includes(constants.Groups.DEMOS)){
      await self.saveStatistic(user.Username, constants.Statistic.USER_REFRESH_TOKEN);
    }
  },
  saveStatistic: async (userId, sortKey, value = null) => {
    try {
      const timestamp = self.getTimeStamp();

      const user = await dynamo.getOne(APP_TABLE, {pk: `USER|${userId}`, sk: 'ATTRIBUTES'});

      if (!user) return;

      await dynamo.put(STATISTIC_TABLE, {
        pk: `${constants.Statistic.PK_PART}${timestamp}`,
        userId: userId,
        sk: `${userId}|${sortKey}|${new Date().getTime()}`,
        userAction: sortKey,
        value: value,
        city: user.city_id,
        createdAt: self.getISODate(),
      })
    } catch (e) {
      console.log(`STATISTIC error:`, e)
    }
  },
}
