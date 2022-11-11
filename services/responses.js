const Sentry = require('@sentry/node');
const {convertToCamel} = require('./formatting');
const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});



const self = module.exports = {
  fail: (res, error) => {
    console.error(error);
    const statusCode = error.statusCode || 500;

    let defaultCode = 'InternalServerError';
    if (statusCode == 404) defaultCode = 'NotFound';
    if (statusCode == 403) defaultCode = 'Forbidden';

    if (statusCode === 500)
      Sentry.captureException(error);

    res.status(statusCode).json({
      error: {
        ...error,
        code: error.code || defaultCode,
        message: error.message,
      },
    });
  },
  succeed: (res, data) => {
    res.json(convertToCamel(data))
  },
}
