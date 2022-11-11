const Sentry = require('@sentry/node');

const ses = require('./services/aws/ses-emails');
const emailing = require('./services/emailing');
const camp = require('./services/dynamo/campaigns');
const users = require('./services/dynamo/users');

const dynamo = require('./services/aws/dynamo');
const formatRFC3339 = require('date-fns/formatRFC3339');

const {
  APP_TABLE,
  CAMPAIGN_DELIVERY_TABLE,
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
  try {
    // process sending the emails
    console.log(event.Records);

    for (const [index, record] of event.Records.entries()) {
      const success = [];
      const fail = [];
      const message = JSON.parse(record.body);
      const now = formatRFC3339(new Date);



        //apptable update campaign sent after sending all emails
        const appTableKeys = {
            pk: `USER|${message.userId}`,
            sk: `CAMPAIGN|${message.campaignId}|ATTRIBUTES`,
        }

        if (event.Records[index + 1] != undefined) {
            if (JSON.parse(event.Records[index + 1].body)['campaignId'] != message.campaignId || JSON.parse(event.Records[index + 1].body)['userId'] != message.userId) {
                try {
                    await dynamo.updateValues(APP_TABLE, appTableKeys, {
                        status: 'sent',
                        sent_at: now,
                    });
                } catch (error) {
                    await dynamo.updateValues(APP_TABLE, appTableKeys, {
                        status: 'failed',
                        sent_at: now,
                    });
                }
            }
        } else {
            try {
                await dynamo.updateValues(APP_TABLE, appTableKeys, {
                    status: 'sent',
                    sent_at: now,
                });
            } catch (error) {
                await dynamo.updateValues(APP_TABLE, appTableKeys, {
                    status: 'failed',
                    sent_at: now,
                });
            }
        }

      const keys = {
        pk: `USER|${message.userId}`,
        sk: `CAMPAIGN|${message.campaignId}|${message.to}`,
      }
      try {
        const deliveryLog = await dynamo.getOne(CAMPAIGN_DELIVERY_TABLE, keys);
        if (deliveryLog) {
          console.log(`Campaign ${message.campaignId} of ${message.from} to ${message.to} already being processed`)
          continue;
        } else {
          await dynamo.put(CAMPAIGN_DELIVERY_TABLE, {
            ...keys,
            status: 'sending',
            created_at: now,
          })
        }
        const userCamp = await camp.getUserCampaign(message.userId, message.campaignId);
        if (!userCamp) {
          console.log(`Campaign ${message.campaignId} of ${message.userId} not found`);
          throw {
            statusCode: 404,
            message: `Campaign ${message.campaignId} of ${message.userId} not found`,
          }
        }

        const account = await users.getUserAccount(message.userId);
        if (!account.business_address) {
            console.log(`Business address not set for user ${message.from}`);
            throw {
                statusCode: 403,
                message: `Business address not set for user ${message.from}`,
            }
        }

        const html = await emailing.composeUserCampaignEmailHTML(message.userId, message.campaignId, message.to);
        const text = html.replace(/<[^>]*>?/gm, ''); //TODO improve this, as this is a very basic way to strip out HTML tags
        const emailSubject = message.subject || userCamp.attributes.email_subject ||userCamp.attributes.campaign_name;

        //tags to send with the email for tracking
        const tags = [
          {
            Name: 'campaignId',
            Value: message.campaignId,
          },
          {
            Name: 'userId',
            Value: message.userId,
          },
        ]

        const messageId = await ses.send(
          `"${account.business_address.name}" <${message.from}>`,
          message.to,
          emailSubject,
          html,
          {text, tags},
        )

        await dynamo.put(CAMPAIGN_DELIVERY_TABLE, {
          ...keys,
          status: 'sent',
          created_at: now,
          sent: true,
        })

        success.push(message);

      } catch (error) {
        await dynamo.put(CAMPAIGN_DELIVERY_TABLE, {
          ...keys,
          status: 'failed',
          created_at: now,
        })
        console.error("error", error);
        fail.push(message)
      }
      console.log(`campaign ${message.campaignId} from ${message.from} sent to ${success.length}, failed to ${fail.length}`)
    }

    context.done(null, event);
    callback(null, event);

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }

};
