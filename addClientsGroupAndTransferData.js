const Sentry = require('@sentry/node');
const AWS = require('./services/aws/aws');
const cognitoService = require('./services/aws/cognito');
const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamo = require("./services/aws/dynamo");
const constants = require('./constants');

const {
  APP_TABLE,
  COGNITO_POOL_ID,
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

/**
 * Creates clients group, add clients to created group, transfer Cognito user data to DynamoDB.
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    await handleCognitoGroupCreation();

    const users = await listUsers();

    for (const user of users) {
      await updateUser(user);
    }

    context.done(null, event);

    callback(null, event);

  } catch (error) {
    console.error(error);

    Sentry.captureException(error);
  }
};

const handleCognitoGroupCreation = async () =>{
  try{
    await cognito.getGroup(
        {
          UserPoolId: COGNITO_POOL_ID,
          GroupName: constants.Groups.CLIENTS,
        },
    ).promise();
  }catch (e) {
    await cognito.createGroup({
      UserPoolId: COGNITO_POOL_ID,
      GroupName: constants.Groups.CLIENTS,
      Description: "Clients",
    }).promise();
  }
}

const listUsers = async () => {
  let nextToken = null;

  let users = [];

  do {
    const response = await cognito.listUsersInGroup({
      UserPoolId: COGNITO_POOL_ID,
      GroupName: constants.Groups.USERS,
      NextToken: nextToken}).promise();

    users.push(...response.Users);

    nextToken = response.NextToken || null;

  } while (nextToken);

  return users;
}

const updateUser = async (user) => {
  let cognitoGroups = await cognitoService.listGroupsForUser(user.Username);

  const groups = cognitoGroups.map(g=>g.GroupName);

  if(!groups.includes(constants.Groups.DEMOS) && !groups.includes(constants.Groups.CLIENTS)){
    await cognito.adminAddUserToGroup({
      UserPoolId: COGNITO_POOL_ID,
      GroupName: constants.Groups.CLIENTS,
      Username: user.Username,
    }).promise();
  }

  const attributes = cognitoService.normalizeAttributes(user.Attributes)

  await dynamo.updateValues(APP_TABLE, {
    pk: `USER|${user.Username}`,
    sk: 'ATTRIBUTES',
  }, {
    ...attributes,
    search_given_name: attributes.given_name.toLowerCase(),
    search_family_name: attributes.family_name.toLowerCase(),
    search_email: attributes.email.toLowerCase(),
    user_create_date: user.UserCreateDate.toISOString(),
    user_last_modified_date: user.UserLastModifiedDate.toISOString(),
    enabled: user.Enabled,
    user_status: user.UserStatus,
    group: groups.includes(constants.Groups.DEMOS) ? constants.Groups.DEMOS : constants.Groups.CLIENTS,
  },
  )
}