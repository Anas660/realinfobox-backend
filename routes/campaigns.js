const express = require('express');
const router = express.Router();
const controller = require('../controllers/campaignsController');
const { check, checkValidationFail } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');


router.get('/', controller.list);


router.get('/:campaignId', controller.detail);
router.post('/:campaignId/duplicate', [
  hasOneRole('user'),
  check('campaign_name').exists({checkFalsy: true, checkNull: true}).isString(),
  check('scheduled').optional({nullable: true, checkNull: true}),
  checkValidationFail,
], controller.duplicate);

router.get('/:campaignId/user-preview', [
  hasOneRole('user'),
], controller.userPreview);

router.patch('/:campaignId', [
  hasOneRole('user'),
  check('blocks').optional({checkFalsy: true, nullable: true}).isArray({min: 1}),
  check('status').optional({checkFalsy: true, nullable: true}).isIn(['draft', 'scheduled']),
  checkValidationFail,
],
controller.update);

router.post('/:campaignId/send', [
  hasOneRole('user'),
  checkValidationFail,
],
controller.send);
router.delete('/:campaignId', controller.delete);

module.exports = router;
