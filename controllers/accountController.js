const cognito = require('../services/aws/cognito');
const dynamo = require('../services/aws/dynamo');
const ses = require('../services/aws/ses-emails');
const _ = require('lodash');

const {fail} = require('../services/responses');

const {APP_TABLE} = process.env;
/**
 *
 */
const self = module.exports = {
  resendSesVerification: async (req, res) => {
    try {
      const response = await ses.verifyEmailIdentity(res.locals.user.attributes.email);
      res.json(response);
    } catch (error) {
      fail(res, error);
    }
  },

  //TODO remove after testing
  setAttribute: async (req, res) => {
    const { attribute, value, userSub } = req.body;
    let userId = res.locals.user.sub;

    try {
      await cognito.adminUpdateUserAttributes(userSub || userId , [{
        Name: attribute,
        Value: value,
      }]);

      res.json({
        message: 'attribute set',
      })
      return;
    } catch (error) {
      res.status(400).json(error);
      return;
    }
  },

  updateSettings: async (req, res) => {
    try {
      const user = res.locals.user;

      if (!user.roles.user) throw {
        statusCode: 403,
      }

      const knownSettings = ['automated_campaign_delivery', 'custom_color', 'notification_emails'];
      const pickedRequest = _.pick(req.body, knownSettings);

      const updateItems = await dynamo.updateValues(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: 'ACCOUNT|SETTINGS',
      }, pickedRequest)

      res.json();
    } catch (error) {
      fail(res, error);
    }
  },

  updateBusinessAddress: async (req, res) => {
    try {
      const user = res.locals.user;

      if (!user.roles.user) throw {
        statusCode: 403,
      }

      const knownSettings = ['address1', 'zip', 'city', 'province', 'name', 'brokerage'];
      const pickedRequest = _.pick(req.body, knownSettings);

      const updateItems = await dynamo.put(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: 'ACCOUNT|BUSINESS_ADDRESS',
        entity: 'USER',
        ...pickedRequest,
      })

      res.json();
    } catch (error) {
      fail(res, error);
    }
  },

  updateBillingAddress: async (req, res) => {
    try {
      const user = res.locals.user;
      await dynamo.put(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: 'ACCOUNT|BILLING_ADDRESS',
        entity: 'USER',
        ...req.body,
      })

      res.json();
    } catch (error) {
      fail(res, error);
    }
  },

  updateSocialMediaHandles: async (req, res) => {
    try {
      const user = res.locals.user;

      const knownSettings = [
        'facebook',
        'instagram',
        'youtube',
        'pinterest',
        'twitter',
        'linkedin',
      ];
      const pickedRequest = _.pick(req.body, knownSettings);

      const escaped = {}
      Object.keys(pickedRequest).forEach(handleName => {
        const handleValue = pickedRequest[handleName];
        escaped[handleName] = encodeURI(handleValue)
      })

      const updateItems = await dynamo.put(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: 'ACCOUNT|SOCIAL_HANDLES',
        entity: 'USER',
        ...escaped,
      })

      res.json();
    } catch (error) {
      fail(res, error);
    }
  },



}

