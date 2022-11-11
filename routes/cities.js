const express = require('express');
const router = express.Router();
const controller = require('../controllers/citiesController');
const { check, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');

router.get('/', controller.list);

router.post('/', [
  check('name').exists({checkNull: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
  check('timezone').exists({nullable: true, checkFalsy: true}).isString(),
  checkValidationFail,
],
controller.create);

router.patch('/:cityId', [
  check('name').exists({nullable: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
  check('timezone').exists({nullable: true, checkFalsy: true}).isString(),
  checkValidationFail,
], controller.update);
// router.patch('/:userId/enable', controller.enable);
// router.patch('/:userId/disable', controller.disable);
// router.delete('/:cityId', controller.delete);

module.exports = router;
