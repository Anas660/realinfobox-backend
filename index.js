const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const express = require('express');
const cors = require('cors');

const app = express();
const Sentry = require('@sentry/node');

const indexRouter = require('./routes/index');

const { SENTRY_URL, APP_STAGE } = process.env;

if (APP_STAGE === 'v1') {
  Sentry.init({
    dsn: SENTRY_URL,
  });
}
// process.on('warning', e => console.warn(e.stack));

if (!process.env.AWS_REGION) process.env.AWS_REGION = process.env.APP_REGION;

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.requestHandler());

// enable CORS for all requests, TODO: limit

var allowedOrigins = [
  'https://app.realinfobox.com',
  'https://realinfobox.netlify.com',
  'https://realinfobox.netlify.app',
  'https://staging--realinfobox.netlify.app',
  'https://downgradepdf--realinfobox.netlify.app',
  'https://v2--realinfobox.netlify.app',
  'http://localhost:3000',
  'http://localhost',
  '*',
];

var corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin
    // (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

app.use(cors(corsOptions));

app.use(
  bodyParser.json({
    limit: '6mb',
    strict: false,
  }),
);

// routes
app.use('/', indexRouter);

module.exports.handler = serverless(app);
