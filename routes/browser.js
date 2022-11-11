const express = require('express');
const browserRouter = express.Router();
const browserController = require('../controllers/browserController');
const accountController = require('../controllers/accountController');
const { check, checkValidationFail } = require('../services/validation');

// browserRouter.post('/email', [
//   check('hash').exists({checkNull: true, checkFalsy: true}),
//   check('username').exists({checkNull: true, checkFalsy: true}),
//   checkValidationFail,
// ],
// accountController.confirmEmail);

// browserRouter.post('/registration', [
//   check('code').exists({checkNull: true, checkFalsy: true}),
//   check('username').exists({checkNull: true, checkFalsy: true}),
//   checkValidationFail,
// ],
// browserController.confirmSignup);

// browserRouter.post('/password', [
//   check('code').exists({checkNull: true, checkFalsy: true}),
//   check('username').exists({checkNull: true, checkFalsy: true}),
//   check('new_password').exists({checkNull: true, checkFalsy: true}),
//   checkValidationFail,
// ],
// browserController.confirmForgotPassword);

module.exports = browserRouter;
