const dynamo = require('../services/aws/dynamo');
const {parseId} = dynamo;
const cognito = require('../services/aws/cognito');
const ses = require('../services/aws/ses-emails');
const constants = require('../constants');
const {fail} = require('../services/responses');
const camp = require('../services/dynamo/campaigns');
const products = require('../services/dynamo/products');
const userService = require('../services/user');
const cont = require('../services/dynamo/content');
const c = require('../services/dynamo/cities');
const bs = require('../services/dynamo/blockSets');
const templates = require('../services/dynamo/templates');
const bl = require('../services/dynamo/blocks');
const ml = require('../services/dynamo/mailingList');
const users = require('../services/dynamo/users');
const blockConfig = require('../config/blocks');
const emailing = require('../services/emailing');
const statisticService = require('../services/statistic');


const formatRFC3339 = require('date-fns/formatRFC3339');

const _ = require('lodash');

const {
  APP_TABLE,
} = process.env;

const self = module.exports = {
  list: async (req, res) => {
    const {
      filter,
      userType,
      limit,
      nextToken,
    } = req.query;
    try {
      const clients = await userService.listClients(limit, nextToken, userType, filter);

      res.json(clients);

    } catch (error) {
      fail(res, error);
    }
  },
  usersCount: async (req, res) => {
    const { userType } = req.query;

    try {
      const clients = await userService.usersCount(userType);

      res.json(clients);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const {email, given_name, family_name, city_id, mailing_list_limit, demo} = req.body;

      const userAttrs = [
        {
          Name: 'given_name',
          Value: given_name,
        },
        {
          Name: 'family_name',
          Value: family_name,
        },
        {
          Name: 'custom:campaigns_enabled',
          Value: 'true',
        },
      ];

      // create a fresh template for the user
      const blockSets = await bs.getAllBlockSets();
      const blockSetsOfCity = blockSets.filter(blockSet => blockSet.attributes.city_id === city_id);

      if (!blockSetsOfCity || !blockSetsOfCity.length) throw {
        statusCode: 404,
        code: 'NoBlockSetForCity',
        message: 'This city has no blockset defined, unable to create client template',
      }

      const createResult = await cognito.createUser(email, userAttrs, 'suppress');

      const user = createResult.User;
      const userId = user.Attributes.find(attr => attr.Name === 'sub').Value;

      const blockSet = blockSetsOfCity[0];

      const blocksetBlocks = blockSet.blocks.map(b => {
        return {
          ...b,
          default: !b.customizable,
        }
      })

      // we add a social media block to the template
      const blocksToWrite = [
        ...blocksetBlocks,
        ...blockConfig.defaultBlocks,
      ]

      const blocksRow = bl.createDynamoBlocksRow(blocksToWrite);

      const userAttributes = {
        city_id,
        family_name,
        given_name,
        email,
        search_given_name: given_name.toLowerCase(),
        search_family_name: family_name.toLowerCase(),
        search_email: email.toLowerCase(),
        account_status_updated_at: user.UserCreateDate.toISOString(),
        user_create_date: user.UserCreateDate.toISOString(),
        user_last_modified_date: user.UserLastModifiedDate.toISOString(),
        enabled: user.Enabled,
        status: user.UserStatus,
        sub: userId,
        group: demo ? constants.Groups.DEMOS : constants.Groups.CLIENTS,
        campaigns_enabled: true,
      }

      if (mailing_list_limit)
        userAttributes.mailing_list_limit = mailing_list_limit;

      const accountSettings = {
        automated_campaign_delivery: true,
        marketing_emails: true,
      }

      const defaultKeys = {
        pk: `USER|${userId}`,
        entity: 'USER',
      }
      const promises = [
        cognito.addUserToGroup(userId, 'users'),
        dynamo.batchWrite(APP_TABLE, [
          {
            ...defaultKeys,
            sk: 'ATTRIBUTES',
            ...userAttributes,
          },
          {
            ...defaultKeys,
            sk: 'ACCOUNT|SETTINGS',
            ...accountSettings,
          },
        ]),
        templates.putUserTemplateBlocks(userId, city_id, blocksRow),
        ml.updateTags(userId, [{
          color: "#3F51B5",
          name: "Campaign Template",
          default: true,
        }]),
      ]

      if (demo) {
        promises.push(cognito.addUserToGroup(userId, constants.Groups.DEMOS));

        const userObj = await cognito.getUser(userId);
        await emailing.sendDemoCreatedEmail(userObj);
        await statisticService.createDemo(userId, email);
      }else{
        await cognito.addUserToGroup(userId, constants.Groups.CLIENTS);
        await statisticService.createClient(userId, email);
      }

      await Promise.all(promises)

      res.json(createResult);

    } catch (error) {
      fail(res, error);
    }
  },
  invite: async (req, res) => {
    // the create flow should only create the user, not send them anything, to allow for pre-invite setup
    try {
      const {id} = req.params;
      const user = await cognito.getUser(id)
      // const email = user.attributes.email;
      // const sesVerified = await ses.checkAddressVerified(email);
      // if (!sesVerified)
      //   await ses.verifyEmailIdentity(email);

      // if

      // if (user.status != 'CONFIRMED') {
      //   if (user.status === 'FORCE_CHANGE_PASSWORD')
      //     await cognito.resendWelcomeMail(email);
      // }
      await emailing.sendUserInvitation(user);

      await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${id}`,
        sk: 'ATTRIBUTES',
      },
          {
            user_last_modified_date: new Date() .toISOString(),
            invited_at: formatRFC3339(new Date),
          },
      )

      res.json();

    } catch (error) {
      fail(res, error);
    }
  },
  inviteDemo: async (req, res) => {
    // the create flow should only create the user, not send them anything, to allow for pre-invite setup
    try {
      const {id} = req.params;
      const user = await cognito.getUser(id)
      // const email = user.attributes.email;
      // const sesVerified = await ses.checkAddressVerified(email);
      // if (!sesVerified)
      //   await ses.verifyEmailIdentity(email);

      // if

      // if (user.status != 'CONFIRMED') {
      //   if (user.status === 'FORCE_CHANGE_PASSWORD')
      //     await cognito.resendWelcomeMail(email);
      // }
      await emailing.sendDemoInvitation(user);

      await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${id}`,
        sk: 'ATTRIBUTES',
      },
      {
        demo_invited_at: formatRFC3339(new Date),
        user_last_modified_date: new Date().toISOString(),      
      });

      res.json();

    } catch (error) {
      fail(res, error);
    }
  },
  detail: async (req, res) => {
    const {id} = req.params;
    try {
      const user = await users.getFullUser(id);
      res.json(user);
    } catch (error) {
      fail(res, error);
    }
  },
  signupDemo: async (req, res) => {
    req.body.demo = true;
    req.body.mailing_list_limit = 5;

    try {

      await self.create(req, res)


    } catch (error) {
      fail(res, error);
    }
  },
  update: async (req, res) => {
    try {
      const {id} = req.params;

      const {given_name, family_name, email, city_id, mailing_list_limit} = req.body;

      let user = await cognito.getUser(id);

      if (!user) throw {statusCode: 404, message: 'User not found'}

      const cognitoAttrs = [];

      if (given_name) cognitoAttrs.push({Name: 'given_name', Value: given_name})

      if (family_name) cognitoAttrs.push({Name: 'family_name', Value: family_name})

      if (email) cognitoAttrs.push(
        {Name: 'email', Value: email},
        {Name: 'email_verified', Value: 'true'},
      )

      const attributes = {
        given_name,
        family_name,
        email,
        mailing_list_limit,
        city_id,
        search_given_name: given_name.toLowerCase(),
        search_family_name: family_name.toLowerCase(),
        search_email: email.toLowerCase(),
        user_last_modified_date: new Date().toISOString(),
        email_verified: true,
      };

      if (!cognitoAttrs.length && !Object.keys(attributes).length) throw {
        statusCode: 400,
        message: 'Nothing to update',
      };

      const requests = [];
      if (cognitoAttrs.length)
        requests.push(cognito.adminUpdateUserAttributes(id, cognitoAttrs));

      if (Object.keys(attributes).length)
        requests.push(dynamo.updateValues(APP_TABLE, {
          pk: `USER|${id}`,
          sk: 'ATTRIBUTES',
        }, attributes));

      if (email && user.attributes.email != email) {
        requests.push(
          ses.deleteIdentity(user.attributes.email),
          ses.verifyEmailIdentity(email),
        )
      }

      await Promise.all(requests);

      user = await cognito.getUser(id);
      res.json(user);

    } catch (error) {
      fail(res, error);
    }
  },
  delete: async (req, res) => {
    const {id} = req.params;

    try {
      const deleteResult = await cognito.adminDeleteUser(id);
      if (deleteResult) {/** */
      }

      const cleanupDone = await users.removeUser(id)
      if (cleanupDone) {/** */
      }

      res.send();

    } catch (error) {
      fail(res, error);
    }
  },
  // enable: async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     //check user exists
  //     const user = await users.getFullUser(id);
  //     await cognito.enableUser(id)

  //     res.send()
  //   } catch (error) {
  //     fail(res, error);
  //   }
  // },
  // disable: async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     //check user exists
  //     const user = await users.getFullUser(id);
  //     await cognito.disableUser(id);

  //     res.send()
  //   } catch (error) {
  //     fail(res, error);
  //   }
  // },

  promoteDemoToCustomer: async (req, res) => {
    const {id} = req.params;
    const {value} = req.body;

    // check user exists
    try {
      const user = await cognito.getUser(id);
      if (!user) {
        throw {
          statusCode: 404,
        }
      }
      await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${id}`,
        sk: 'ATTRIBUTES',
      }, {
        user_last_modified_date: new Date().toISOString(),
        group: constants.Groups.CLIENTS,
      });

      await cognito.removeUserFromGroup(id, constants.Groups.DEMOS);

      await cognito.addUserToGroup(id, constants.Groups.CLIENTS);

      res.send()

    } catch (error) {
      fail(res, error);
    }
  },
  changeAccountStatus: async (req, res) => {
    const {id} = req.params;
    const {value} = req.body;

    // check user exists
    try {
      const user = await users.getFullUser(id);

      if (value === true) {
        await cognito.enableUser(id)
      } else {
        await cognito.disableUser(id)
      }

      const update = dynamo.updateValues(APP_TABLE, {
        pk: `USER|${id}`,
        sk: 'ATTRIBUTES',
      }, {
        user_last_modified_date: new Date().toISOString(),
        account_status_updated_at: new Date().toISOString(),
        enabled: value,
      });

      const statistic = statisticService.handleUserEnabled(value, id);

      await Promise.all([update, statistic]);

      res.send()

    } catch (error) {
      fail(res, error);
    }
  },
  changePublishStatus: async (req, res) => {
    const {id} = req.params;
    const {value} = req.body;

    // check user exists
    try {
      const user = await users.getFullUser(id);
      await cognito.adminUpdateUserAttributes(id, [
        {
          Name: 'custom:campaigns_enabled',
          Value: value === true ? 'true' : 'false',
        },
      ]);

      await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${id}`,
        sk: 'ATTRIBUTES',
      }, {
        campaigns_enabled: value,
        user_last_modified_date: new Date().toISOString(),
      });

      res.send()

    } catch (error) {
      fail(res, error);
    }
  },
  syncUserProducts: async (req, res) => {
    try {
      const {id} = req.params;
      const {productIds} = req.body;

      await users.setUserProducts(id, productIds)

      res.send()

    } catch (error) {
      fail(res, error);
    }
  },


}
