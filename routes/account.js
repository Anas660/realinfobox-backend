const express = require('express');
const router = express.Router();
const cntrl = require('../controllers/accountController');
const { check, checkValidationFail, usernameTaken } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');

router.post('/resend-ses-verification', cntrl.resendSesVerification);


router.post('/settings', [
  check('automated_campaign_delivery').optional({checkFalsy: true, nullable: true}),
  check('custom_color').optional({checkFalsy: true, nullable: true}),
  checkValidationFail,
], cntrl.updateSettings);

router.post('/business-address', [
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('brokerage').exists({checkFalsy: true, checkNull: true}),
  check('address1').exists({checkFalsy: true, checkNull: true}),
  check('city').exists({checkFalsy: true, checkNull: true}),
  check('province').exists({checkFalsy: true, checkNull: true}),
  check('zip').exists({checkFalsy: true, checkNull: true}),
  checkValidationFail,
], cntrl.updateBusinessAddress);


router.post('/billing-address', [
  check('contact_name').exists({checkFalsy: true, checkNull: true}),
  check('name').exists({checkFalsy: true, checkNull: true}),
  check('address_line_1').exists({checkFalsy: true, checkNull: true}),
  check('province').exists({checkFalsy: true, checkNull: true}),
  check('postal_code').exists({checkFalsy: true, checkNull: true}),
  checkValidationFail,
], cntrl.updateBillingAddress);

//
const social = ['facebook', 'instagram', 'youtube', 'pinterest', 'twitter', 'linkedin']
router.post('/social', [
  ...social.map(soc => check(soc).optional({checkFalsy: true, nullable: true})),
  checkValidationFail,
], cntrl.updateSocialMediaHandles);

// router.patch('/email', [
//   check('email').exists({checkNull: true, checkFalsy: true})
//     .normalizeEmail()
//     .isEmail()
//     .custom(usernameTaken),
//   checkValidationFail,
// ], cntrl.updateEmail);

// // router.post('/email/confirm', [
// //   check('hash').exists({checkNull: true, checkFalsy: true}),
// //   check('username').exists({checkNull: true, checkFalsy: true}),
// //   checkValidationFail,
// // ], cntrl.confirmEmail);

// router.post('/email/resend', cntrl.resendEmailCode);
// router.post('/phone/resend', cntrl.resendPhoneCode);

// router.patch('/', [
//   check('firstName').optional({checkFalsy: true}),
//   check('lastName').exists({checkNull: true, checkFalsy: true}),
//   check('sex').optional({checkFalsy: true})
//     .isIn(['M','F']).withMessage('BadGender'),
//   check('dob').optional({checkFalsy: true})
//     .isISO8601({strict: true}).withMessage('Invalid date'),
//   checkValidationFail,
// ], cntrl.updateAttributes);

// router.get('/avatar/signed-url', cntrl.getAvatarUploadUrl)
// // router.patch('/avatar',
// //   uploadAvatar.single('avatar'),
// //   cntrl.setAvatar);
// router.delete('/avatar', cntrl.deleteAvatar);

// router.post('/attribute', cntrl.setAttribute);

module.exports = router;
