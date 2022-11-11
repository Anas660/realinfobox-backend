const express = require('express');
const router = express.Router();
const controller = require('../controllers/listingsController');
const { check, checkValidationFail } = require('../services/validation');

router.get('/', controller.list)
router.post('/', [
  check('title').exists({checkFalsy: true, checkNull: true}),
  check('url').exists({checkFalsy: true, checkNull: true}),
  check('text').exists({checkFalsy: true, checkNull: true}),
  check('type').exists({checkFalsy: true, checkNull: true}),
  check('size').exists({checkFalsy: true, checkNull: true}),
  checkValidationFail,
],controller.create);

module.exports = router;
