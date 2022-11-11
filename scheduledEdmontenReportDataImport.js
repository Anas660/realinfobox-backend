const Sentry = require('@sentry/node');
const reportService = require('./services/reports')

const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

/**
 * Imports Edmonton report data using CRON.
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    const currentYear = new Date().getFullYear();

    await reportService.edmontonImport(currentYear);

    context.done(null, event);

    callback(null, event);

  } catch (error) {
    console.error(error);

    Sentry.captureException(error);
  }
};
