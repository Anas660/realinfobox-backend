global.fetch = require('node-fetch');
const cognito = require('../services/aws/cognito');
const accs = require('../services/accounts');
const dynamo = require('../services/aws/dynamo');
const constants = require('../constants');
const users = require('../services/dynamo/users');
const ses = require('../services/aws/ses-emails');
const statisticService = require('../services/statistic');

const {fail} = require('../services/responses');

const _ = require('lodash');
const self = module.exports = {
  login: async (req, res) => {
    const {username, password} = req.body;
    try {
      // const pre = await database.preSignIn(username);
      // if (pre) {
      //   //
      // }
      let data = await cognito.initiateAuth(username, password);

      // handle possible challenges
      if (data.ChallengeName) {
        switch (data.ChallengeName) {
          case 'NEW_PASSWORD_REQUIRED':
            res.set('WWW-Authenticate', 'Basic realm="New password required"');
            res.status(401).json({
              code: 'LoginChallenge',
              challenge_parameters: {
                challenge_name: 'NEW_PASSWORD_REQUIRED',
                user_id: data.ChallengeParameters.USER_ID_FOR_SRP,
                session: data.Session,
                username: username,
              },
            });
            return;
            break;

          default:
            break;
        }
      }

      const accessToken = data.AuthenticationResult.AccessToken;
      const refreshToken = data.AuthenticationResult.RefreshToken;


      await statisticService.saveUserSignIn(accessToken);

      // log the device of guards & clients
      // if (accessToken) await database.postSignIn(accessToken);

      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return;

    } catch (error) {
      console.error(error.code);
      let status, message;

      const responseError = {
        statusCode: 400,
        code: error.code,
        message: error.message,
      }

      switch (error.code) {
        case 'UserNotFoundException':
          responseError.statusCode = 404;
          break;

        case 'UserNotConfirmedException':
          responseError.statusCode = 409;
          break;

        case 'PasswordResetRequiredException':
          responseError.statusCode = 400;
          responseError.message = 'Please check your email for password reset.';
          break;

        case 'NotAuthorizedException':
          res.set('WWW-Authenticate', `Basic realm="${error.message}`);
          responseError.statusCode = 401;
          break;

        default:
          break;
      }

      fail(res, responseError)
    }
  },

  forgotPassword: async (req, res) => {
    const {username} = req.body;
    try {
      const user = await cognito.getUser(username)
      if (!user) {
        throw {
          statusCode: 404,
          message: 'User not found',
        }
      }
      if (user.status === 'FORCE_CHANGE_PASSWORD'){
        throw {
          statusCode: 400,
          message: 'Your account is probably not active. Please follow the instructions in your invitation email.',
        }
      }

      await cognito.forgotPassword(username);
      res.json({message: 'Please check your email for confirmation code.'})
    } catch (error) {
      if (error.error)
        if (error.error.code === 'InvalidParameterException') {
          res.status(409).json(error);
          return;
        }

      fail(res, error);
    }
  },

  me: async (req, res) => {
    try {
      const user = await users.getFullUser(res.locals.user.id);
      res.json(user);
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  refreshToken: async (req, res) => {
    const {refresh_token} = req.body;

    if (!refresh_token) {
      res.status(400).json({
        error: 'No refresh token provided.',
      });
      return;
    }

    try {
      const data = await cognito.refreshToken(refresh_token);

      const accessToken = data.AuthenticationResult.AccessToken;

      await statisticService.saveUserRefreshToken(accessToken);

      res.json({
        access_token: accessToken,
      });
      return;

    } catch (error) {
      fail(res, error);
    }
  },

  challenge: async (req, res) => {
    const { new_password, challenge_parameters } = req.body;
    const { user_id, challenge_name, session } = challenge_parameters;
    try {
      const data = await cognito.respondToAuthChallenge(challenge_name, {
        NEW_PASSWORD: new_password,
        USERNAME: user_id,
      }, session);

      if (data.AuthenticationResult) {
        const accessToken = data.AuthenticationResult.AccessToken;
        // if (accessToken) await database.postSignIn(accessToken);

        // challenge passed successfully
        res.json({
          access_token: data.AuthenticationResult.AccessToken,
          refresh_token: data.AuthenticationResult.RefreshToken,
        });
        return;

      } else {
      // error processing challenge
        console.error('New challenge incoming');
        res.status(500).send();
        return;
      }


    } catch (error) {
      fail(res, error);
    }
  },

  confirmPassword: async (req, res) => {
    const {username, code, new_password} = req.body;
    try {
      await cognito.confirmForgotPassword(username, new_password, code);
      res.json({
        message: 'Password Confirmed',
      });
      return;
    } catch (error) {
      fail(res, error);
    }
  },
}

// exports.resendCode = async (req, res) => {
//   const {username} = req.body;

//   try {
//     const { CodeDeliveryDetails} = await cognito.resendCode(username);
//     const {Destination, DeliveryMedium} = CodeDeliveryDetails;

//     res.json({
//       destination: Destination,
//       deliveryMedium: DeliveryMedium,
//     })
//     return;
//   } catch (error) {
//     console.error(error);
//     res.status(400).json(error);
//   }
// }

// exports.logout = async (req, res) => {
//   let userId = res.locals.user.sub;

//   await database.logSession(userId, role, 'out');

//   try {
//     res.json({
//       message: 'Logout OK',
//     })
//     return;
//   } catch (error) {
//     console.error(error);
//     res.status(400).json(error);
//   }
// }
