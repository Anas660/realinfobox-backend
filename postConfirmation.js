const Sentry = require('@sentry/node');

const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

/**
 * Amazon Cognito invokes this trigger after a new user is confirmed
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    console.log("POST CONFIRMATION")
    console.log(event);
    console.log(event.userName);
    console.log(context)

    context.done(null, event);

    callback(null, event);

  } catch (error) {
    console.error(error);

    Sentry.captureException(error);
  }
};


const updateUserVerificationAttributes = async (user) => {

}
