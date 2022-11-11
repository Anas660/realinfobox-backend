const express = require('express');
const router = express.Router();
const blockSetsRouter = require('./blockSets');
const citiesRouter = require('./cities');
const publishNotifRouter = require('./publishNotification');

const cities = require('../services/dynamo/cities')
const blockSets = require('../services/dynamo/blockSets')
const publishNotification = require('../services/dynamo/publishNotification')
const emailTemplates = require('../services/dynamo/emailTemplates')
const _ = require('lodash');

const config = require('../config/config.json')
const {fail} = require('../services/responses');

router.get('/all', async (req, res) => {
  try {
    const all = await Promise.all([
      cities.getAllCities(),
      blockSets.getAllBlockSets(),
      publishNotification,
    ])

    res.json({
      cities: all[0],
      blockSets: all[1],
      publishNotification: all[2],
      mailingListTiers: config.mailingListTiers,
    })

  } catch (error) {
    throw error;
  }
})

router.use('/cities', citiesRouter);
router.use('/block-sets', blockSetsRouter);
router.use('/publish-notification', publishNotifRouter);

router.get('/templates/:templateName', async (req, res) => {
  try {
    const result = await emailTemplates.get(req.params.templateName);

    res.json(_.omit(result, ['pk', 'sk']));

  } catch (error) {
    fail(res, error);
  }
});

router.post('/templates/:templateName', async (req, res) => {
  try {
    const {template, subject} = req.body;
    const result = await emailTemplates.set(req.params.templateName, template, subject)

    res.json(_.omit(result, ['pk', 'sk']));

  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
