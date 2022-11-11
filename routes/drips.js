const express = require('express');
const router = express.Router();
const controller = require('../controllers/dripsController');
const { check, checkValidationFail } = require('../services/validation');

router.get('/', controller.list);

router.post('/', [
  check('name').exists({ checkFalsy: true, checkNull: true }),
  check('subject').exists({ checkFalsy: true, checkNull: true }),
  check('city_id').exists({ checkFalsy: true, checkNull: true }),
  check('delay').exists({checkFalsy: true, checkNull: true}).isNumeric(),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
],
controller.create);

router.get('/:id', controller.detail);
// router.get('/:contentId/preview', controller.preview);

router.put('/:dripId', [
  check('name').exists({ checkFalsy: true, checkNull: true }),
  check('subject').exists({ checkFalsy: true, checkNull: true }),
  check('city_id').exists({ checkFalsy: true, checkNull: true }),
  check('delay').exists({checkFalsy: true, checkNull: true}).isNumeric(),
  check('blocks').exists({checkFalsy: true, checkNull: true}).isArray({min: 1}),
  checkValidationFail,
],
controller.update);

// router.delete('/:dripId', controller.delete);

module.exports = router;
