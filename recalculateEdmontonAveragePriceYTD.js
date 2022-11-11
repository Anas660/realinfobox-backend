const Sentry = require('@sentry/node');
const reportService = require('./services/reports')

const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

/**
 * Recalculate Edmonton Average Price YTD.
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    console.log("recalculate edmonton average price YTD", new Date().toISOString());

    const currentYear = new Date().getFullYear();

    const locationNames = await reportService.edmontonGetAllLocationNames();

    console.log(locationNames);

    await Promise.all(locationNames.map(locationName => {
      return reportService.calculateEdmontonAveragePriceYTD(locationName, currentYear)
    }))

    context.done(null, event);

    callback(null, event);

  } catch (error) {
    console.error(error);

    Sentry.captureException(error);
  }
};
