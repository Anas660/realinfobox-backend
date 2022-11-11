const express = require('express');

const router = express.Router();
const accountRouter = require('./account');
const authRouter = require('./auth');
const publicRouter = require('./public');
// const browserRouter = require('./browser');

const campaignsRouter = require('./campaigns');
const contentRouter = require('./content');
const dripsRouter = require('./drips');

const configRouter = require('./config');
const templateRouter = require('./template');
const statisticsRouter = require('./statistics');

const editorsRouter = require('./editors');
const usersRouter = require('./users');
const uploadsRouter = require('./uploads');
const mailingListRouter = require('./mailingList');
const productsRouter = require('./products');
const listingsRouter = require('./listings');
const reportsRouter = require('./reports');
const paymentRouter = require('./payment');

const authMiddleware = require('../middleware/auth');
const { hasRole, hasOneRole } = require('../middleware/permission');
const differenceInCalendarDays = require('date-fns/differenceInCalendarDays')

const cognito = require('../services/aws/cognito')
const dynamo = require('../services/aws/dynamo')
const ses = require('../services/aws/ses-emails')
const sqs = require('../services/aws/sqs')

const emailing = require('../services/emailing');
// const users = require('../services/dynamo/users');
const drips = require('../services/dynamo/drips');
const ml = require('../services/dynamo/mailingList');
// const tags = require('../services/dynamo/tag');
const camp = require('../services/dynamo/campaigns');
const cont = require('../services/dynamo/content');

const _ = require('lodash');
const { send } = require('../services/aws/ses-emails');
const parseISO = require('date-fns/parseISO');
const reports = require('../services/reports');

// const formatRFC3339 = require('date-fns/formatRFC3339');

const {
  APP_TABLE,
  CAMPAIGN_DELIVERY_TABLE,
  MAILING_LIST_TABLE,
  TEST_EMAIL,
  SES_EMAIL } = process.env

router.post('/test', [], async (req, res) => {
  try {

    res.send()
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
});

router.use('/auth/logout', [authMiddleware, authRouter]);
router.use('/auth/me', [authMiddleware, authRouter]);
router.use('/auth/password/change', [authMiddleware, authRouter]);
router.use('/auth', authRouter);

// router.use('/account/email/confirm', accountRouter);
router.use('/public', publicRouter);

// this adds user info to res.locals
// also checks if the calls are authorized
router.use('/', authMiddleware);
router.use('/account', accountRouter);

router.use('/campaigns', campaignsRouter);

router.use('/template', templateRouter);

router.use('/content', contentRouter);
router.use('/drips', dripsRouter);

router.use('/listings', listingsRouter);

router.use('/users', usersRouter);
router.use('/reports', reportsRouter);
router.use('/editors', hasOneRole('admin'), editorsRouter);
router.use('/mailing-list', hasOneRole('user'), mailingListRouter);
router.use('/products', hasOneRole('admin','editor'), productsRouter);

router.use('/config', hasOneRole('admin', 'editor'), configRouter);
router.use('/statistics', hasOneRole('admin'), statisticsRouter);

router.use('/uploads', uploadsRouter);

router.use('/payment', paymentRouter);

module.exports = router;
