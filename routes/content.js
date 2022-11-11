const express = require('express');
const router = express.Router();
const controller = require('../controllers/contentController');
const { check, checkValidationFail } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');


router.get('/', controller.list);

router.post('/', [
  check('campaign_name').exists({checkFalsy: true, checkNull: true}),
  check('block_set_id').exists({checkFalsy: true, checkNull: true}),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
],
controller.create);

router.get('/:contentId', controller.detail);
router.get('/:contentId/preview', controller.preview);

router.post('/:contentId/duplicate', [hasOneRole('admin', 'editor')], controller.duplicate);
router.post('/:contentId/publish', [hasOneRole('admin', 'editor')], controller.publish);
router.put('/:contentId', [
  check('campaign_name').exists({checkFalsy: true, checkNull: true}),
  check('block_set_id').exists({checkFalsy: true, checkNull: true}),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
],
controller.update);

router.delete('/:contentId', controller.delete);

module.exports = router;
