'use strict';
const _ = require('lodash');
const AWS = require('./aws');

const {APP_TABLE} = process.env;

const dynamoDb = process.env.IS_OFFLINE === true ?
  new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8000',
  }) :
  new AWS.DynamoDB.DocumentClient();

const parseId = (src) => {
  if (!src) return undefined;
  const prefixes = [
    'USER',
    'EDITOR',
    'CAMPAIGN',
    'CAMPAIGN_CONTENT',
    'BLOCK_SET',
    'CITY',
    'LISTING',
    'DEMO_DRIP',
    'PRODUCT',
  ]
  let resultId = src;
  for (const prefix of prefixes) {
    const regex = new RegExp(`^(${prefix}\\|)`);
    resultId = resultId.replace(regex, '');
  }
  return resultId;
};

const self = module.exports = {
  parseId,
  omitBase: ['pk', 'sk', 'entity'],
  parseRows: (sameSkStartRows, prefix = undefined) => {
    const parsed = {};

    sameSkStartRows.forEach(row => {
      const keyName = prefix ? row.sk.replace(prefix, '') : row.sk;
      parsed[keyName.toLowerCase()] = _.omit(row, self.omitBase);
    });

    if (sameSkStartRows.length === Object.keys(parsed).length) {
      return parsed;
    } else {
      console.error(sameSkStartRows);
      throw {
        statusCode: 500,
        code: 'CannotParse',
      }
    }
  },
  getOne: async (tableName, keys) => {
    try {
      const { Item } = await dynamoDb.get({
        TableName : tableName,
        Key: keys,
      }).promise();

      return Item;

    } catch (error) {
      console.error(error);
      return false;
    }
  },

  get: async (keys) => {
    try {
      return await self.getOne(APP_TABLE, keys);
    } catch (error) {
      console.error(error);
      return false;
    }
  },
  query: async (params) => {
    try {
      const items = await dynamoDb.query(params).promise();

      return items;

    } catch (error) {
      throw error
    }
  },
  scan: async (params) => {
    try {
      const items = await dynamoDb.scan(params).promise();

      return items;

    } catch (error) {
      throw error
    }
  },
  getByPk: async (tableName, pk) => {
    try {
      return await self.queryAll({
        TableName : tableName,
        Key: {
          pk,
        },
        KeyConditionExpression: `pk = :pkValue`,
        ExpressionAttributeValues: {
          ':pkValue': pk,
        },
      });
    } catch (error) {
      throw error;
    }
  },

  getWhere: async function (
    tableName,
    hashKeyName, hashKeyValue,
    exclusiveStartKey = '',
    rangeKeyName = '', rangeKeyOperator = '', rangeKeyValue1 = null, rangeKeyValue2 = null,
  ) {

    let conditionExpression = `${hashKeyName} = :hashValue`;

    let params = {
      TableName: tableName,
      ExpressionAttributeValues: {
        ':hashValue': hashKeyValue,
      },
    };

    if (rangeKeyName && rangeKeyOperator && rangeKeyValue1) {
      if (rangeKeyOperator == 'BETWEEN') {
        conditionExpression += ` and ${rangeKeyName} between :rangeKeyValue1 and :rangeKeyValue2`;
        params.ExpressionAttributeValues[':rangeKeyValue1'] = rangeKeyValue1;
        params.ExpressionAttributeValues[':rangeKeyValue2'] = rangeKeyValue2;
      } else {
        conditionExpression += ` and ${rangeKeyName} ${rangeKeyOperator} :rangeKeyValue1`;
        params.ExpressionAttributeValues[':rangeKeyValue1'] = rangeKeyValue1;
      }
    }

    if (exclusiveStartKey) params.ExclusiveStartKey = exclusiveStartKey;

    params.KeyConditionExpression = conditionExpression;

    // console.log(util.inspect(params, false, null, true /* enable colors */))
    try {
      const items = await self.queryAll(params);
      return items;

    } catch (error) {
      console.error(error);
      return [];
    }
  },

  getLastWhere: async function (
    tableName,
    hashKeyName, hashKeyValue,
    exclusiveStartKey = '',
    rangeKeyName = '', rangeKeyOperator = '', rangeKeyValue1 = null, rangeKeyValue2 = null,
  ) {

    let conditionExpression = `${hashKeyName} = :hashValue`;

    let params = {
      TableName: tableName,
      ExpressionAttributeValues: {
        ':hashValue': hashKeyValue,
      },
      ScanIndexForward: false, //default order is oldest to newest => reverse
      Limit: 1, //single one
    };

    if (rangeKeyName && rangeKeyOperator && rangeKeyValue1) {
      if (rangeKeyOperator == 'BETWEEN') {
        conditionExpression += ` and ${rangeKeyName} between :rangeKeyValue1 and :rangeKeyValue2`;
        params.ExpressionAttributeValues[':rangeKeyValue1'] = rangeKeyValue1;
        params.ExpressionAttributeValues[':rangeKeyValue2'] = rangeKeyValue2;
      } else {
        conditionExpression += ` and ${rangeKeyName} ${rangeKeyOperator} :rangeKeyValue1`;
        params.ExpressionAttributeValues[':rangeKeyValue1'] = rangeKeyValue1;
      }
    }

    if (exclusiveStartKey) params.ExclusiveStartKey = exclusiveStartKey;

    params.KeyConditionExpression = conditionExpression;

    // console.log(util.inspect(params, false, null, true /* enable colors */))
    try {
      const items = await self.queryAll(params);
      return items;

    } catch (error) {
      console.error(error);
      return [];
    }
  },

  queryAll: async (params) => {
    try {
      const resultArray = [];

      let moreToLoad = false;

      do {
        let response = await dynamoDb.query(params).promise();
        if (response.LastEvaluatedKey) {
          moreToLoad = true;
          params.ExclusiveStartKey = response.LastEvaluatedKey;
        } else {
          moreToLoad = false;
        }
        resultArray.push(...response.Items);

      } while (moreToLoad);

      return resultArray;
    } catch (error) {
      throw error;
    }
  },

  put: async (
    tableName,
    item,
  ) => {

    const params = {
      TableName: tableName,
      Item: item,
    };
    try {
      const response = await dynamoDb.put(params).promise();
      return response;

    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  batchWrite: async (tableName, items, operation='put') => {
    try {
      const readyPutRequests = items.map(i => {
        let requestItem = {}
        if (operation==='put') {
          requestItem = {
            PutRequest: {
              Item: i,
            },
          }
        } else if (operation==='delete') {
          requestItem = {
            DeleteRequest: {
              Key: i,
            },
          }
        }
        return requestItem;
      })

      // items.forEach(pr => {
      //   console.log(Buffer.byteLength(JSON.stringify(pr)))
      //   console.log(pr)
      // })

      const chunks = _.chunk(readyPutRequests, 25);
      const responses = [];
      for (const chunk of chunks) {
        let params = {
          RequestItems: {
            [tableName]: chunk,
          },
        }
        // batch write supports max 25 items at once
        const response = await dynamoDb.batchWrite(params);
        // response.on('sign', req => console.log(JSON.parse(req.httpRequest.body)))
        await response.promise()
        responses.push(response);
      }

      return responses;
    } catch (error) {
      throw error;
    }
  },

  getMany: async (
    tableName,
    keysArray,
  ) => {

    if (!typeof keysArray === 'array') throw new Error('keys to get is not an array');

    const params = {
      RequestItems: {
        [tableName]: {
          Keys: [],
        },
      },
    };
    keysArray.forEach( keys => params.RequestItems[tableName].Keys.push(keys));
    try {
      const response = await dynamoDb.batchGet(params).promise();
      // if (Object.keys(response.UnprocessedItems).length) {
      // // TODO retry ?
      // }
      return response.Responses[tableName];

    } catch (error) {
      console.error(error);
      return false;
    }
  },

  getAttributesOfMany: async (keysArray) => {
    if (!typeof keysArray === 'array') throw new Error('keys to get is not an array');

    const attrs = await self.getMany(APP_TABLE, keysArray.map(k => ({
      pk: k,
      sk: 'ATTRIBUTES',
    })));

    if (!attrs) throw new Error('Unable to get attributes');

    return attrs.map(item => {
      const newItem = {
        ...item,
        id: item.pk.split("|")[1],
      }
      return _.omit(newItem, ['pk', 'sk']);
    });
  },

  getPkBeginsWithReverse: async (tableName, sk, pkBegins) => {
    try {
      const params = {
        TableName: tableName,
        IndexName: 'reverse',
        KeyConditionExpression: `sk = :sk and begins_with(pk, :pk)`,
        ExpressionAttributeValues: {
          ":pk": pkBegins,
          ":sk": sk,
        },
      }

      const items = await self.queryAll(params);
      return items;

    } catch (error) {
      throw error
    }
  },

  getSkBeginsWith: async (tableName, pk, skBegins) => {
    try {
      const params = {
        TableName: tableName,
        KeyConditionExpression: `pk = :pk and begins_with(sk, :sk)`,
        ExpressionAttributeValues: {
          ":pk": pk,
          ":sk": skBegins,
        },
      }

      const items = await self.queryAll(params);
      return items;

    } catch (error) {
      throw error
    }
  },

  deleteEntry: async (
    tableName,
    hashKeyName, hashKeyValue,
    rangeKeyName = undefined, rangeKeyValue = undefined,
  ) => {

    const keys = {
      [hashKeyName]: hashKeyValue,
    }

    if (rangeKeyName && rangeKeyValue) {
      keys[rangeKeyName] = rangeKeyValue;
    }

    const params = {
      RequestItems: {
        [tableName]: [
          {
            DeleteRequest: {
              Key: keys,
            },
          },
        ],
      },
    };

    try {
      const response = await dynamoDb.batchWrite(params).promise();
      if (Object.keys(response.UnprocessedItems).length) {
      // TODO retry ?
      }
      return response;

    } catch (error) {
      console.error(error);
      return false;
    }
  },

  getAllEntityInfo: async (primaryKey) => {
    const params = {
      TableName: APP_TABLE,
      KeyConditionExpression: 'pk = :primaryKey',
      ExpressionAttributeValues: {
        ":primaryKey": primaryKey,
      },
    };

    try {
      const items = await self.queryAll(params);
      return items;

    } catch (error) {
      console.error(error);
      return false;
    }
  },
  getAllOfEntity: async (entityName) => {
    const params = {
      TableName: APP_TABLE,
      IndexName: 'entity',
      KeyConditionExpression: 'entity = :entityName',
      ExpressionAttributeValues: {
        ":entityName": entityName,
      },
    };

    try {
      const result = await self.queryAll(params);
      return result;

    } catch (error) {
      console.error(error);
      return false;
    }
  },
  update: async (params) => {
    try {
      const response = await dynamoDb.update(params).promise();

      return response;

    } catch (error) {
      console.error(error);
      return false;
    }
  },
  updateSingleValue: async (tableName, keys, fieldName, value) => {
    const params = {
      TableName: tableName,
      Key: keys,
      UpdateExpression: 'SET #attr = :val',
      ExpressionAttributeNames: {'#attr': fieldName},
      ExpressionAttributeValues: {':val' : value},
    };
    try {
      const response = await dynamoDb.update(params).promise();
      return response;

    } catch (error) {
      console.error(error);
      return false;
    }
  },
  updateValues: async (tableName, keys, keyValueObject) => {
    const params = {
      TableName: tableName,
      Key: keys,
    };
    const eav = {};
    const ean = {};

    let ue = Object.keys(keyValueObject).map(key => {
      const value = keyValueObject[key];
      if (value === undefined) {
        return false;
      }
      ean[`#${key}Attr`] = key;
      eav[`:${key}Value`] = value;

      return `#${key}Attr = :${key}Value`;
    });
    ue = ue.filter(i=>!!i).join(', ')

    params.UpdateExpression = `SET ${ue}`;
    params.ExpressionAttributeNames = ean;
    params.ExpressionAttributeValues = eav;
    try {
      const response = await dynamoDb.update(params).promise();
      return response.Attributes;

    } catch (error) {
      console.error(error);
      return false;
    }
  },
  delete: async (tableName, keys) => {
    try {
      var params = {
        TableName: tableName,
        Key: keys,
      };
      await dynamoDb.delete(params).promise();
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  },
  deleteMany: async (tableName, keysArray) => {
    try {
      const response = await self.batchWrite(tableName, keysArray, 'delete');
      // if (Object.keys(response.UnprocessedItems).length) {
      //   // TODO retry ?
      // }
      return response;
    } catch (error) {
      console.error(keysArray);
      console.error(error);
      return false;
    }
  },
  dynamoDb,
}
