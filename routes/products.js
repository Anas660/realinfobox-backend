const express = require('express');
const router = express.Router();
const controller = require('../controllers/productsController');
const { check, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');

router.get('/', controller.list);

router.post('/', [
  check('name').exists({checkNull: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('allows').exists({checkNull: true, checkFalsy: true}).isArray(),
  check('allows.*').isIn(['newsletter', 'reports']),
  checkValidationFail,
],
controller.create);

router.patch('/:productId', [
  check('name').exists({nullable: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('allows').exists({checkNull: true, checkFalsy: true}).isArray(),
  check('allows.*').isIn(['newsletter', 'reports']),
  checkValidationFail,
], controller.update);

module.exports = router;
