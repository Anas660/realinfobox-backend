const express = require('express');
const router = express.Router();
const controller = require('../controllers/editorsController');
const { check, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');

router.get('/', controller.list);

router.post('/', [
  check('email').exists({checkNull: true, checkFalsy: true}).isEmail(),
  check('family_name').exists({checkNull: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
  check('given_name').exists({checkNull: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
  checkValidationFail,
],
controller.create);

router.get('/:id', controller.detail);
router.patch('/:id', [
  check('family_name').optional({nullable: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
  check('given_name').optional({nullable: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
], controller.update);
// router.patch('/:userId/enable', controller.enable);
// router.patch('/:userId/disable', controller.disable);
router.delete('/:id', controller.delete);

module.exports = router;
