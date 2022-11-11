const Sentry = require('@sentry/node');

const dynamo = require('./services/aws/dynamo');
const s3 = require('./services/aws/s3');
const {calgaryParseXLSX, calgarySaveOrganizedData} = require('./services/reports');

const {
  SENTRY_URL,
  S3_REPORTS_BUCKET,
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

      const {object: {key}} = record.s3;
      if (eventName === 'ObjectCreated:Put') {
        const file = await s3.getObject(S3_REPORTS_BUCKET, key)
        try {
          console.log('put file: ', key)
          if (key.includes('reports/users/')) {
            // todo automatically assign url to user stuff if necessary

          } else {
            const organizedData = await calgaryParseXLSX(file.Body)
            console.log(organizedData)
            const saveResult = await calgarySaveOrganizedData(organizedData)
          }

        } catch (error) {
          //todo improve upload
          throw error
        }

      } else if (eventName === 'ObjectRemoved:Delete') {
        // TODO
      }
    }

    context.done(null, event);
    // callback(null, event);
    return true;

  } catch (error) {

    console.error(error);
    Sentry.captureException(error);
  }

};
