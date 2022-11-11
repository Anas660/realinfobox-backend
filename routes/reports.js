const express = require('express');
const router = express.Router();
const cntrl = require('../controllers/reportsController');
const { check, checkValidationFail } = require('../services/validation');
const { hasOneRole } = require('../middleware/permission');

router.get('/branding', cntrl.brandingGet)
router.get('/branding/custom-banner-url', [
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('type').exists({checkFalsy: true, checkNull: true}),
  checkValidationFail,
], cntrl.customBannerUrl)

router.get('/branding/image-url', [
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('type').exists({checkFalsy: true, checkNull: true}),
  check('imageType').exists({checkFalsy: true, checkNull: true}).isIn(['logo', 'background', 'agent']),
  checkValidationFail,
], cntrl.brandingImageUrl)

router.put('/branding', [
  check('bannerType').isIn(['simple', 'custom']),
  check('customBannerUrl'),
  check('logoUrl'),
  check('backgroundUrl'),
  check('agentPhotoUrl'),
  check('color1').matches(/#[0-9a-fA-F]{6}/),
  check('color2').matches(/#[0-9a-fA-F]{6}/),
  check('color3').matches(/#[0-9a-fA-F]{6}/),
  check('name').isString(),
  check('title').isString(),
  check('company').isString(),
  check('phone').isString(),
  check('website').isString(),
  check('email').isEmail(),
  check('bannerHeight').isInt(),
  checkValidationFail,
], cntrl.brandingPatch)

//shared

router.post('/:cityName/last-available', hasOneRole('admin', 'editor'), cntrl.setLastAvailable)
router.get('/:cityName/last-available', cntrl.getLastAvailable)

router.get('/:cityName/:year/:month/market-distribution', [
  hasOneRole('admin', 'editor'),
  checkValidationFail,
], cntrl.marketDistributionGet);

router.put('/:cityName/:year/:month/market-distribution', [
  hasOneRole('admin', 'editor'),
  checkValidationFail,
], cntrl.marketDistributionPut);


// CALGARY
router.get('/calgary', hasOneRole('admin', 'editor'), cntrl.calgaryList);

router.get('/calgary/structure', cntrl.calgaryStructure);

router.get('/calgary/upload-url', [
  hasOneRole('admin', 'editor'),
  check('type').equals('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  check('month').isInt({min: 1, max: 12}),
  check('year').isInt({min: 2000}),
  checkValidationFail,
], cntrl.calgaryUploadUrl);

router.get('/calgary/:year/:month/:name', [
  check('only').optional().isIn(['city', 'regions']),
  checkValidationFail,
], cntrl.calgaryDetail);

router.put('/calgary/:region/:type', hasOneRole('admin', 'editor'), cntrl.updateCalgaryBenchmarkPrice);

// EDMONTON
router.get('/edmonton/:year/:month/:name', [
  checkValidationFail,
], cntrl.edmontonDetail);

router.post('/edmonton/import', hasOneRole('admin', 'editor'), cntrl.edmontonImport);
router.get('/edmonton/structure', cntrl.edmontonStructure);
router.post('/edmonton/fill-mls-areas', cntrl.edmontonFillMlsensightAreaData);
router.post('/edmonton/recalculate-avg-price-ytd', cntrl.edmontonRecalculateEdmontonAveragePriceYTD);

router.get('/:cityName/:locationName/latest', cntrl.cityDetailLatest);

// WINNIPEG
router.get('/winnipeg/structure', hasOneRole('admin', 'editor', 'user'), cntrl.winnipegStructure);
router.get('/winnipeg/statistics/:locationName', hasOneRole('admin', 'editor', 'user'), cntrl.winnipegDetail);
router.get('/winnipeg/statistics/:year/:month', hasOneRole('admin', 'editor', 'user'), cntrl.winnipegCityDetail);
router.put('/winnipeg/statistics/:year/:month', hasOneRole('admin', 'editor'), cntrl.updateWinnipegCityDetail);

router.get('/social/:cityName/:locationName/latest', [
  checkValidationFail,
], cntrl.getSocialReport);

router.get('/data/:cityName/:year/:month/:locationName', [
  hasOneRole('admin', 'editor'),
  check('month').toInt().isInt({min: 1, max: 12}),
  check('year').toInt().isInt({min: 2000}),
  check('cityName').isIn(['edmonton', 'winnipeg', 'victoria', 'vancouver', 'fraser-valley']),
  checkValidationFail,
],cntrl.dataGet);

router.put('/data/:cityName/:year/:month/:locationName', [
  hasOneRole('admin', 'editor'),
  check('month').isInt({min: 1, max: 12}),
  check('year').isInt({min: 2000}),
  check('cityName').isIn(['edmonton', 'winnipeg', 'victoria', 'vancouver', 'fraser-valley']),
  checkValidationFail,
],cntrl.dataPut);



module.exports = router;
