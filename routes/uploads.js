const express = require('express');
const router = express.Router();
const controller = require('../controllers/uploadsController');
const { check, checkValidationFail, nameWithDiacritics, capitalize } = require('../services/validation');

router.get('/url', controller.getUrl);

module.exports = router;
