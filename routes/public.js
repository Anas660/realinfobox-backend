const express = require('express');
const router = express.Router();
const controller = require('../controllers/publicController');
const cities = require('../controllers/citiesController');
const { check, query, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');


router.post('/unsubscribe', [
  check('user_id').exists({checkNull: true, checkFalsy: true}),
  check('campaign_id').exists({checkNull: true, checkFalsy: true}),
  check('email').exists({checkNull: true, checkFalsy: true}),
  checkValidationFail,
],
controller.mailingUnsubscribe);
// router.post('/drip-unsubscribe', [
//   check('user_id').exists({checkNull: true, checkFalsy: true}),
//   check('drip_id').exists({checkNull: true, checkFalsy: true}),
//   checkValidationFail,
// ],
// controller.dripUnsubscribe);

router.get('/content/preview', [
  query('content_token').optional({checkFalsy: true, nullable: true}),
  query('campaign_token').optional({checkFalsy: true, nullable: true}),
  checkValidationFail,
],
controller.contentPreview);

router.get('/reports/preview', [
  query('report_token').exists({checkFalsy: true, checkNull: true}),
  checkValidationFail,
],
controller.reportPreview);

router.get('/config/cities', cities.list);

router.get('/campaign-metrics/read', controller.campaignMetricsRead);
router.get('/drip-metrics/read', controller.dripMetricsRead);

// router.put('/:currentEmail', [
//   check('email').exists({checkNull: true, checkFalsy: true}).isEmail(),
//   check('given_name').exists({checkNull: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
//   check('family_name').exists({checkNull: true, checkFalsy: true}).matches(nameWithDiacritics).customSanitizer(capitalize),
//   // check('tags').optional({checkNull: true, checkFalsy: true}),
//   checkValidationFail,
// ],
// controller.update);


module.exports = router;
