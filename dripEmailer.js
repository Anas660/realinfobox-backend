const Sentry = require('@sentry/node');

const ses = require('./services/aws/ses-emails');
const emailing = require('./services/emailing');
const camp = require('./services/dynamo/campaigns');
const drips = require('./services/dynamo/drips');
const users = require('./services/dynamo/users');

const dynamo = require('./services/aws/dynamo');
const formatRFC3339 = require('date-fns/formatRFC3339');

const {
  DRIP_DELIVERY_TABLE,
  SES_EMAIL,
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
  try {
    // process sending the emails

    for (const record of event.Records) {
      const success = [];
      const fail = [];
      const message = JSON.parse(record.body);
      const now = formatRFC3339(new Date);
      const keys = {
        pk: `DEMO_DRIP|${message.dripId}`,
        sk: `USER|${message.userId}`,
      }

      try {

        const deliveryLog = await dynamo.getOne(DRIP_DELIVERY_TABLE, keys)
        if (deliveryLog) {
          console.log(`Drip ${message.dripId} to ${message.to} (${message.userId}) already being processed`)
          continue;
        } else {
          await dynamo.put(DRIP_DELIVERY_TABLE, {
            ...keys,
            email: message.to,
            status: 'sending',
            created_at: now,
          })
        }
        const drip = await drips.getDrip(message.dripId);
        if (!drip) {
          throw {
            statusCode: 404,
            message: `Drip ${message.dripId} not found`,
          }
        }

        const html = await emailing.composeDripHTML(drip, message.userId);
        const text = html.replace(/<[^>]*>?/gm, ''); //TODO improve this, as this is a very basic way to strip out HTML tags
        const emailSubject = drip.attributes.subject || drip.attributes.name;

        const sent = await ses.send(
          `"Real Info BOX" <${SES_EMAIL}>`,
          message.to,
          emailSubject,
          html,
          {text},
        )

        await dynamo.put(DRIP_DELIVERY_TABLE, {
          ...keys,
          email: message.to,
          status: 'sent',
          created_at: now,
        })

        success.push(message);

      } catch (error) {
        await dynamo.put(DRIP_DELIVERY_TABLE, {
          ...keys,
          email: message.to,
          status: 'failed',
          created_at: now,
        })
        console.error(error);
        fail.push(message)
      }
      console.log(`Drip ${message.dripId} sent to ${success.length}, failed to ${fail.length}`)
    }

    context.done(null, event);
    callback(null, event);

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }

};
