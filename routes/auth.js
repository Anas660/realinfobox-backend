const express = require('express');
const authRouter = express.Router();
const authController = require('../controllers/authController');
const usersController = require('../controllers/usersController');
const { check, checkValidationFail, capitalize, lowercase } = require('../services/validation');
const cognito = require('../services/aws/cognito');

const passwordRegex = new RegExp(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/);

// auth routes are not guarded by auth middleware
authRouter.get('/me', authController.me);

// authRouter.post('/logout', [
// ], authController.logout);

authRouter.post('/login', [
  check('username').exists({checkNull: true, checkFalsy: true})
    .isEmail().customSanitizer(lowercase),
  check('password').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
], authController.login);

authRouter.post('/login/refresh', [
  check('refresh_token').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
], authController.refreshToken);

authRouter.post('/login/challenge', [
  check('challenge_parameters').exists({checkNull: true, checkFalsy: true}),
  check('new_password').exists({checkNull: true, checkFalsy: true})
    .custom(input => {
      const valid = passwordRegex.test(input);
      if (!valid) throw Error('WeakPassword');
      return valid;
    }),
  checkValidationFail,
], authController.challenge);

authRouter.post('/password/forgot', [
  check('username').exists({checkNull: true, checkFalsy: true})
    .isEmail().customSanitizer(lowercase),
  checkValidationFail,
], authController.forgotPassword);

authRouter.post('/password/forgot/confirm', [
  check('username').exists({checkNull: true, checkFalsy: true}).customSanitizer(lowercase),
  check('new_password').exists({checkNull: true, checkFalsy: true})
    .custom(input => {
      const valid = passwordRegex.test(input);
      if (!valid) throw Error('WeakPassword');
      return valid;
    }),
  check('code').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
], authController.confirmPassword);

authRouter.post('/register/demo', [
  check('email').exists({checkNull: true, checkFalsy: true}).isEmail().customSanitizer(lowercase),
  check('family_name').exists({checkNull: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('given_name').exists({checkNull: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('city_id').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
], usersController.signupDemo);

// authRouter.post('/register', [
//   check('firstName').exists({checkNull: true, checkFalsy: true}),
//   check('lastName').exists({checkNull: true, checkFalsy: true}),
//   check('sex').optional({checkFalsy: true})
//     .isIn(['M','F']).withMessage('BadGender'),
//   check('dob').optional({checkFalsy: true})
//     .isISO8601({strict: true}).withMessage('Invalid date'),
//   check('username').exists({checkNull: true, checkFalsy: true})
//     .normalizeEmail()
//     .isEmail()
//     .custom(usernameTaken),
//   check('password').exists({checkNull: true, checkFalsy: true})
//   // .matches(passwordRegex).withMessage('WeakPassword')
//     .custom(input => {
//       const valid = passwordRegex.test(input);
//       if (!valid) Promise.reject('WeakPassword')
//       return valid;
//     }),
//   checkValidationFail,
// ],
// authController.register);

// authRouter.post('/register/resend-code', authController.resendCode);

// authRouter.post('/password/change', [
//   check('oldPassword').exists({checkNull: true, checkFalsy: true}),
//   check('newPassword').exists({checkNull: true, checkFalsy: true})
//     .custom(input => {
//       const valid = passwordRegex.test(input);
//       if (!valid) Promise.reject('WeakPassword')
//       return true;
//     }),
//   checkValidationFail,
// ], authController.changePassword);



// authRouter.delete('/account', authController.deleteSelfAccount);

module.exports = authRouter;
