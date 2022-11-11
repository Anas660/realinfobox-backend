const Sentry = require('@sentry/node');

const cognito = require('./services/aws/cognito');

const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});


exports.handler = async (event, context, callback) => {
  //
  try {
    const records = event.Records;

    for (const record of records) {
      const {eventName, requestParameters, responseElements} = record;

      const {object} = record.s3;
      if (eventName === 'ObjectCreated:Put') {
        // // larger than 4 MB
        // if (object.size / 1024 / 1024 > 4) {
        //   // dont process such image, maybe delete it even?
        //   return;
        // }

      } else if (eventName === 'ObjectRemoved:Delete') {
        // TODO
      }
    }

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }

};
