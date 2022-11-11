'use strict';
const AWS = require('./aws');
const jose = require('node-jose');
const fetch = require('node-fetch');
const cognito = new AWS.CognitoIdentityServiceProvider();
const {fromUnixTime} = require('date-fns');

const ses = require('./ses-emails');
const fmt = require('../formatting');

const passwordRegex = new RegExp(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/);

const {
  AWS_REGION,
  COGNITO_CLIENT_ID,
  COGNITO_POOL_ID,
} = process.env;

const self = module.exports = {
  generateTemporaryPassword: (length = 8) => {
    const min = 33;
    const max = 126;
    const randomChar = () => {
      const asciiDec = Math.floor(Math.random() * (max - min) + min)
      return asciiDec
    };
    let password;
    while (true) {
      password = Array(length).fill().map(v => String.fromCharCode(randomChar()))
      password = password.join('');
      if (passwordRegex.test(password))
        break;
    }
    return password;
  },
  normalizeAttributes: (attributesObject) => {
    const userAttrs = {};
    attributesObject.forEach(attr => {
      let value = attr.Value;
      if (value === 'true' || value === 'false') {
        value = value === 'true' ? true : false;
      }

      const strippedName = attr.Name.replace('custom:', '');
      const attrName = fmt.toUnderscoreCase(strippedName);
      userAttrs[attrName] = value;
    });
    return userAttrs
  },
  getUserByAccessToken: async (token) => {
    try{
      return await cognito.getUser({ AccessToken : token }).promise();
    }catch (e) {
      return null
    }
  },
  getUser: async (username, raw = false) => {
    try {
      const user = await cognito.adminGetUser({
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
      }).promise()

      if (raw) return user;

      let groups = await self.listGroupsForUser(username);
      groups = groups.map(gr => gr.GroupName);
      const roles = {
        admin: groups.includes('admins'),
        editor: groups.includes('editors'),
        user: groups.includes('users'),
        demo: groups.includes('demo'),
      }

      const userObj = {
        id: user.Username,
        attributes: self.normalizeAttributes(user.UserAttributes),
        created_at: user.UserCreateDate,
        enabled: user.Enabled,
        status: user.UserStatus,
        groups,
        roles,
      }
      userObj.ses_verified = await ses.checkAddressVerified(userObj.attributes.email);
      return userObj;
    } catch (error) {
      if (error.code === 'UserNotFoundException')
        return undefined;

      console.error(error);
      throw error;
    }
  },

  getEmail: async (username) => {
    const user = await self.getUser(username);
    return user.UserAttributes.find(el => el.Name == 'email').Value;
  },
  addUserToGroup: (username, groupName) => {
    return new Promise((res, rej) => {
      cognito.adminAddUserToGroup({
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
        GroupName: groupName,
      }, (err, data) => {
        if (err) rej({error: {code: err.code, message: err.message}});
        else res(data);
      });
    });
  },
  removeUserFromGroup: (username, groupName) => {
    return new Promise((res, rej) => {
      cognito.adminRemoveUserFromGroup({
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
        GroupName: groupName,
      }, (err, data) => {
        if (err) rej({error: {code: err.code, message: err.message}});
        else res(data);
      });
    });
  },
  listGroupsForUser: async (username, arrayOnly = false) => {
    try {
      const data = await cognito.adminListGroupsForUser({
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
      }).promise();

      let groups = !arrayOnly ? data.Groups : data.Groups.map(g => g.GroupName);

      return groups;

    } catch (error) {
      console.error(error);
      throw Error({code: error.code, message: error.message})
    }
  },
  paginatedListOfUsersInGroup: async (groupName, limit = 60, nextToken = null) => {
    try {
      let users = [];

      const params = {
        UserPoolId: COGNITO_POOL_ID,
        Limit: limit,
        NextToken: nextToken,
        GroupName: groupName,
      };

      const response = await cognito.listUsersInGroup(params).promise();

      response.Users.forEach(user => {

        const attributes = self.normalizeAttributes(user.Attributes);

        const userDto = {
          id: user.Username,
          attributes: attributes,
          createdAt: user.UserCreateDate,
          enabled: user.Enabled,
          status: user.UserStatus,
        }

        users.push(userDto);

      });

      return {
        data: users,
        nextToken: response.NextToken,
      };

    } catch (error) {
      throw error;
    }
  },
  listUsersInGroup: async (groupName, withDisabled = false, withDeleted = false) => {
    try {
      let cognitoUsers = [];
      let nextToken = null;
      do {
        //cognito can return just a partial result - load more if not all results are returned on first try
        const params = {
          UserPoolId: COGNITO_POOL_ID,
          GroupName: groupName,
        };

        if (nextToken) params.NextToken = nextToken;

        const cognitoResponse = await cognito.listUsersInGroup(params).promise();
        
        cognitoUsers.push(...cognitoResponse.Users);

        nextToken = cognitoResponse.NextToken || null;

      } while (nextToken);

      let users = [];
      cognitoUsers.forEach(user => {
        if (!withDisabled && !user.Enabled) return;
        const userAttrs = self.normalizeAttributes(user.Attributes)
        if (!!userAttrs.deleted_at && !withDeleted) return;

        const userObj = {
          id: user.Username,
          attributes: userAttrs,
          createdAt: user.UserCreateDate,
          enabled: user.Enabled,
          status: user.UserStatus,
        }

        users.push(userObj);
      });

      return users;

    } catch (error) {
      throw error;
    }
  },
  createGroup: async (groupName) => {
    try {
      if (!groupName) return;

      const params = {
        userPoolId: COGNITO_POOL_ID,
        groupName: groupName,
      }

      await cognitoidentityserviceprovider.getGroup(params).promise();
    } catch (e) {
      await cognitoidentityserviceprovider.createGroup(params).promise();
    }
  },
  createUser: async (username, userAttributes = [], messageAction = undefined) => {

    try {
      var params = {
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
        UserAttributes: [
          {
            Name: 'email',
            Value: username,
          },
          {
            Name: 'email_verified',
            Value: 'true',
          },
          ...userAttributes,
        ],
      };

      if (messageAction == 'suppress') {
        params.MessageAction = 'SUPPRESS';
      }

      let newUser = await cognito.adminCreateUser(params).promise();
      return newUser

    } catch (error) {
      throw error;
    }
  },

  resendWelcomeMail: async (username) => {

    try {
      var params = {
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
        MessageAction: 'RESEND',
      };

      let newUser = await cognito.adminCreateUser(params).promise();
      return newUser

    } catch (error) {
      throw error;
    }
  },
  initiateAuth: async (username, password) => {
    try {
      return await cognito.initiateAuth({
        ClientId: COGNITO_CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }).promise();
    } catch (error) {
      throw error;
    }
  },
  respondToAuthChallenge: async (challengeName, challengeResponses, session) => {
    try {
      return await cognito.respondToAuthChallenge({
        ClientId: COGNITO_CLIENT_ID,
        ChallengeName: challengeName,
        ChallengeResponses: challengeResponses,
        Session: session,
      }).promise();
    } catch (error) {
      throw error;
    }
  },
  refreshToken: async (refreshToken) => {
    try {
      return await cognito.initiateAuth({
        ClientId: COGNITO_CLIENT_ID,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      }).promise();
    } catch (error) {
      throw error;
    }
  },

  globalSignOut: async (accessToken) => {
    try {
      const response = await cognito.globalSignOut({
        AccessToken: accessToken,
      }).promise();
      return response;

    } catch (err) {
      console.error(err);
      throw Error({error: {code: err.code, message: err.message}});
    }
  },
  adminUserGlobalSignOut: async (userId) => {
    try {
      const response = await cognito.adminUserGlobalSignOut({
        UserPoolId: COGNITO_POOL_ID,
        Username: userId,
      }).promise();
      return response;

    } catch (err) {
      console.error(err);
      throw Error({error: {code: err.code, message: err.message}});
    }
  },
  // signUp: (username, password, userAttributes = false) => {
  //   return new Promise(async (res, rej) => {
  //     const params = {
  //       ClientId: COGNITO_CLIENT_ID,
  //       Username: username,
  //       Password: password,
  //     };

  //     if (userAttributes) params.UserAttributes = userAttributes;

  //     let newUser = undefined;
  //     try {
  //       newUser = await cognito.signUp(params).promise();
  //       res(newUser);

  //     } catch (err) {
  //       rej({error: {code: err.code, message: err.message}});
  //     }
  //   });
  // },
  // confirmSignUp: (username, code) => {
  //   return new Promise(async (res, rej) => {
  //     const params = {
  //       ClientId: COGNITO_CLIENT_ID,
  //       Username: username,
  //       ConfirmationCode: code,
  //     };

  //     try {
  //       let data = await cognito.confirmSignUp(params).promise();
  //       res(data);

  //     } catch (err) {
  //       rej({error: {code: err.code, message: err.message}});
  //     }
  //   });
  // },
  changePassword: async (accessToken, oldPassword, newPassword) => {
    try {
      const result = await cognito.changePassword({
        AccessToken: accessToken, /* required */
        PreviousPassword: oldPassword, /* required */
        ProposedPassword: newPassword, /* required */
      }).promise();
    } catch (error) {
      throw error;
    }
  },
  setPassword: async (username, password, permanent = false) => {
    try {
      const params = {
        Password: password,
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
        Permanent: permanent,
      };

      let data = await cognito.adminSetUserPassword(params).promise();
      return data;
    } catch (error) {
      throw error;
    }
  },
  setTemporaryPassword: async (username) => {
    try {
      const newPassword = self.generateTemporaryPassword();
      await self.setPassword(
        username,
        newPassword,
        false,
      )
      return {
        password: newPassword,
      }
    } catch (error) {
      throw error;
    }
  },
  forgotPassword: async (username) => {
    const params = {
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
    };

    try {
      let data = await cognito.forgotPassword(params).promise();
      return data

    } catch (error) {
      throw error;
    }

  },
  confirmForgotPassword: async (username, password, code) => {
    const params = {
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      ConfirmationCode: code,
    };

    try {
      let data = await cognito.confirmForgotPassword(params).promise();
      return data;

    } catch (error) {
      throw error;
    }
  },
  disableUser: async (username) => {
    try {
      return await cognito.adminDisableUser({
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
      }).promise();

    } catch (error) {
      throw error;
    }
  },
  enableUser: async (username) => {
    return new Promise(async (res, rej) => {
      const params = {
        UserPoolId: COGNITO_POOL_ID,
        Username: username,
      };
      try {
        await cognito.adminEnableUser(params).promise();
        res(true);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  adminUpdateEmail: async (username, email) => {
    try {
      const attributes = [
        {
          Name: 'email',
          Value: email,
        },
      ];
      await self.adminUpdateUserAttributes(username, attributes);
      return true;
    } catch (error) {
      throw error;
    }
  },
  adminUpdateUserAttributes: async (username, attributes) => {
    const params = {
      UserPoolId: COGNITO_POOL_ID,
      Username: username,
      UserAttributes: attributes,
    };
    try {
      return await cognito.adminUpdateUserAttributes(params).promise();
    } catch (error) {
      throw error;
    }
  },
  adminDeleteUserAttributes: async (username, attributeNames) => {
    const params = {
      UserPoolId: COGNITO_POOL_ID,
      Username: username,
      UserAttributeNames: attributeNames,
    };
    try {
      return await cognito.adminDeleteUserAttributes(params).promise();
    } catch (error) {
      throw error;
    }
  },
  updateUserAttributes: (accessToken, attributes) => {
    return new Promise(async (res, rej) => {
      const params = {
        AccessToken: accessToken,
        UserAttributes: attributes,
      };
      try {
        let data = await cognito.updateUserAttributes(params).promise();
        res(true);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  verifyUserAttribute: (accessToken, attributeName, code) => {
    return new Promise(async (res, rej) => {
      const params = {
        AccessToken: accessToken,
        AttributeName: attributeName,
        Code: code.toString(),
      };
      try {
        let data = await cognito.verifyUserAttribute(params).promise();
        res(data);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  deleteUserAttributes: (accessToken, ...attributeNames) => {
    return new Promise(async (res, rej) => {
      const params = {
        AccessToken: accessToken,
        UserAttributeNames: attributeNames,
      };
      try {
        let data = await cognito.deleteUserAttributes(params).promise();
        res(data);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  updatePhoneNumber: (accessToken, phoneNumber) => {
    return new Promise(async (res, rej) => {
      const attributes = [
        {
          Name: 'phone_number',
          Value: phoneNumber,
        },
      ];
      try {
        let data = await self.updateUserAttributes(accessToken, attributes);
        res(data);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  updateEmail: (accessToken, email) => {
    return new Promise(async (res, rej) => {
      const attributes = [
        {
          Name: 'email',
          Value: email,
        },
      ];
      try {
        let data = await self.updateUserAttributes(accessToken, attributes);
        res(data);
      } catch (err) {
        console.error(err);
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  getVerificationCode: (accessToken, attributeName) => {
    return new Promise(async (res, rej) => {
      const params = {
        AccessToken: accessToken,
        AttributeName: attributeName,
      }
      try {
        let data = await cognito.getUserAttributeVerificationCode(params).promise();
        res(data);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },

  deleteSelf: (accessToken) => {
    return new Promise(async (res, rej) => {
      const params = {
        AccessToken: accessToken,
      }
      try {
        let data = await cognito.deleteUser(params).promise();
        res(data);
      } catch (err) {
        rej({error: {code: err.code, message: err.message}});
      }
    })
  },
  adminDeleteUser: async (username) => {
    try {
      var params = {
        UserPoolId: COGNITO_POOL_ID, /* required */
        Username: username, /* required */
      };
      let data = await cognito.adminDeleteUser(params).promise();
      return data;
    } catch (error) {
      throw error;
    }
  },
  resendCode: async (username) => {
    try {
      const params = {
        ClientId: COGNITO_CLIENT_ID,
        Username: username,
      }
      let data = await cognito.resendConfirmationCode(params).promise();
      return data;
    } catch (error) {
      throw error;
    }

  },
  verifyToken: async (token) => {
    try {
      // const keys_url = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_POOL_ID}/.well-known/jwks.json`;
      let cognitoKeys;
      if (process.env.APP_STAGE === 'staging') {
        cognitoKeys = require('../../keys/cognito-keys-staging.json')
      } else {
        cognitoKeys = require('../../keys/cognito-keys.json')
      }
      if (!token || token === 'undefined') throw {statusCode: 401, code: 'NoTokenProvided'};
      const sections = token.split(".");
      const authHeader = jose.util.base64url.decode(sections[0]);
      let authHeaderParsed;
      try {
        authHeaderParsed = JSON.parse(authHeader);
      } catch (error) {
        console.error(error);
        console.log('token', token);
        console.log('authHeader', authHeader);
        console.log('authHeaderParsed', authHeaderParsed);
        throw {statusCode: 401, code: 'InvalidBearerToken'};
      }

      if (!authHeaderParsed) {
        throw {statusCode: 401, code: 'InvalidBearerToken'};
      }

      const kid = authHeaderParsed.kid;
      // const rawRes = await fetch(keys_url);
      // const response = await rawRes.json();
      // const keys = response["keys"];

      const keys = cognitoKeys.keys;
      // if (rawRes.ok) {
      // let key_index = -1;
      // keys.some((key, index) => {
      //   if (kid == key.kid) {
      //     key_index = index;
      //   }
      // });
      const foundKey = keys.find(key => {
        return kid === key.kid;
      });

      if (!foundKey) {
        throw {statusCode: 401, code: 'KeyNotFound'};
      }

      const result = await jose.JWK.asKey(foundKey);
      const verified = await jose.JWS.createVerify(result).verify(token);
      // now we can use the claims
      const claims = JSON.parse(verified.payload);
      // additionally we can verify the token expiration
      const current_ts = Math.floor(new Date() / 1000);

      // in case we need to manually shorten the token validity (in seconds)
      // const shortenValidityBy = 60 * 59; // 60secs * 5
      const shortenValidityBy = 0; // 60secs * 5

      if (current_ts > claims.exp - shortenValidityBy) {
        throw {statusCode: 401, code: 'AccessTokenExpired', message: 'Access token expired, please refresh.'}
      }
      // and the Audience (use claims.client_id if verifying an access token)
      if (claims.client_id != COGNITO_CLIENT_ID) {
        throw {statusCode: 401, code: 'Unauthorized'};
      }
      return claims
      // }
    } catch (error) {
      throw error;
    }
  },
}