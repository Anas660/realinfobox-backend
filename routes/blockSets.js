const express = require('express');
const router = express.Router();
const controller = require('../controllers/blockSetsController');
const { check, checkValidationFail } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');

router.get('/', controller.list);
router.post('/', [
  hasOneRole('admin'),
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('city_id').exists({checkFalsy: true, checkNull: true}),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
], controller.create);

router.get('/:blockSetId', controller.detail);

router.put('/:blockSetId', [
  hasOneRole('admin'),
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('city_id').exists({checkFalsy: true, checkNull: true}),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
], controller.update);

module.exports = router;
