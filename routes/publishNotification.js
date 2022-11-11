const express = require('express');
const router = express.Router();
const controller = require('../controllers/publishNotificationController');
const { check, checkValidationFail } = require('../services/validation');

router.get('/', controller.get);

router.post('/', [
  check('text').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
],
controller.set);


module.exports = router;
