const express = require('express');
const router = express.Router();
const controller = require('../controllers/usersController');
const { check, param, checkValidationFail, nameWithDiacritics, capitalize, userExists } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');

router.get('/', [
  hasOneRole('admin', 'editor'),
],controller.list);

router.get('/count', [
  hasOneRole('admin', 'editor'),
],controller.usersCount);

router.post('/', [
  hasOneRole('admin', 'editor'),
  check('email').exists({checkNull: true, checkFalsy: true}).isEmail(),
  check('family_name').exists({checkNull: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('given_name').exists({checkNull: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('city_id').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
],
controller.create);

router.get('/:id', [
  hasOneRole('admin', 'editor'),
], controller.detail);

router.post('/:id/invite', [
  hasOneRole('admin', 'editor'),
], controller.invite);

router.post('/:id/inviteDemo', [
    hasOneRole('admin', 'editor'),
], controller.inviteDemo);

router.post('/:id/undemo', [
  hasOneRole('admin', 'editor'),
], controller.promoteDemoToCustomer);

router.patch('/:id', [
  hasOneRole('admin', 'editor'),
  check('email').optional({nullable: true, checkFalsy: true}).isEmail(),
  check('family_name').optional({nullable: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('given_name').optional({nullable: true, checkFalsy: true}).isString().customSanitizer(capitalize),
  check('city_id').optional({nullable: true, checkFalsy: true}),
  check('mailing_list_limit').optional({nullable: true, checkFalsy: true}),
  checkValidationFail,
], controller.update);

router.post('/:id/status/account', [
  hasOneRole('admin', 'editor'),
  check('value').exists({checkNull: true}).isBoolean(),
  checkValidationFail,
], controller.changeAccountStatus)

router.post('/:id/status/publish', [
  hasOneRole('admin', 'editor'),
  check('value').exists({checkNull: true}).isBoolean(),
  checkValidationFail,
], controller.changePublishStatus)

router.post('/:id/products', [
  hasOneRole('admin', 'editor'),
  param('id').custom(userExists),
  check('productIds').exists().isArray(),
  checkValidationFail,
], controller.syncUserProducts)

router.delete('/:id', [
  hasOneRole('admin', 'editor'),
],controller.delete);


module.exports = router;
