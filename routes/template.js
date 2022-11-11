const express = require('express');
const router = express.Router();
const controller = require('../controllers/templateController');
const { check, checkValidationFail } = require('../services/validation');
const { hasRole, hasOneRole } = require('../middleware/permission');


router.get('/', controller.get);
router.put('/', controller.update);


module.exports = router;
