const express = require('express');
const router = express.Router();
const controller = require('../controllers/mailingListController');
const { check, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');

router.get('/', controller.list);


router.post('/', [
  check('contacts').optional({checkNull: true, nullable: true}).isArray(),
  check('email').optional({checkNull: true, nullable: true}).isEmail(),
  check('given_name').optional({checkNull: true, nullable: true}).trim().customSanitizer(capitalize),
  check('family_name').optional({checkNull: true, nullable: true}).trim().customSanitizer(capitalize),
  // check('tags').optional({checkNull: true, checkFalsy: true}),
  checkValidationFail,
],
controller.create);

router.put('/:currentEmail', [
  check('email').exists({checkNull: true, checkFalsy: true}).isEmail(),
  check('given_name').optional({checkNull: true, nullable: true}).trim().customSanitizer(capitalize),
  check('family_name').optional({checkNull: true, nullable: true}).trim().customSanitizer(capitalize),
  // check('tags').optional({checkNull: true, checkFalsy: true}),
  checkValidationFail,
],
controller.update);

router.post('/delete-many', controller.deleteMany);
router.delete('/:currentEmail', controller.delete);

router.get('/tags', controller.listTags);
router.patch('/tags', controller.updateTags);


module.exports = router;
