const Sentry = require('@sentry/node');
const AWS = require('./services/aws/aws');
const cognitoService = require('./services/aws/cognito');
const statisticService = require('./services/statistic');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamo = require("./services/aws/dynamo");
const constants = require('./constants');
const ses = require('./services/aws/ses-emails');
const _ = require('lodash');

const {
  APP_TABLE,
  COGNITO_POOL_ID,
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

/**
 * Updated verification attributes from Cognito and SES every 30 minutes.
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    const users = await listUsers();
    console.log(users);
    console.log(users.length);

    await Promise.all(users.map(async (user) => await updateUser(user)));

  } catch (error) {
    console.error(error);

    Sentry.captureException(error);
  }
};

const listUsers = async () => {
  let nextToken = null;

  let users = [];

  do {
    const response = await cognito.listUsersInGroup({
      UserPoolId: COGNITO_POOL_ID,
      GroupName: constants.Groups.USERS,
      NextToken: nextToken,
    }).promise();

    users.push(...response.Users);

    nextToken = response.NextToken || null;

  } while (nextToken);

  return users;
}

const updateUser = async (user) => {
  try {
    const attributes = cognitoService.normalizeAttributes(user.Attributes)

    const ses_verified = await getUserVerificationAttributes(attributes.email);

    const updateUser = {
      email_verified: ses_verified,
      enabled: user.Enabled,
      status: user.UserStatus,
    };

    const userDB = await dynamo.getOne(APP_TABLE, {
      pk: `USER|${user.Username}`,
      sk: 'ATTRIBUTES',
    });

    if (_.isEqual({
      email_verified: userDB.email_verified,
      enabled: userDB.enabled,
      status: userDB.status,
    }, updateUser)) {
      console.log('User attributes are still same.');
      return;
    }

    const userUpdate = dynamo.updateValues(APP_TABLE, {
        pk: `USER|${user.Username}`,
        sk: 'ATTRIBUTES',
      }, {
      ...updateUser,
        user_last_modified_date: new Date().toISOString(),
      },
    );

    const statistics = statisticService.updateUserStatistics(user.Username, updateUser);

    await Promise.all([userUpdate, statistics])
  } catch (e) {
    console.log("update user error", e);
  }
}

const getUserVerificationAttributes = async (email) => {
  const verificationAttributes = await ses.getIdentityVerificationAttributes(email);

  if (!verificationAttributes && !verificationAttributes.VerificationAttributes) return false;

  const isEmpty = Object.keys(verificationAttributes.VerificationAttributes).length === 0;

  if (isEmpty) return false;

  const status = verificationAttributes.VerificationAttributes[email];

  return status && status.VerificationStatus === 'Success';
}