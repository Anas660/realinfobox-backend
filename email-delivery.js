const Sentry = require('@sentry/node');
const dynamo = require('./services/aws/dynamo');
const ml = require('./services/dynamo/mailingList');
const md5 = require('md5')

const {
  SENTRY_URL,
  CAMPAIGN_DELIVERY_TABLE,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
  try {
    const done = await Promise.all(
      event.Records.map(async record => {
        const message = JSON.parse(record.body);
        const tags = message.mail.tags
        const campaignId = tags.campaignId && tags.campaignId.length ? tags.campaignId[0] : undefined
        const userId = tags.userId && tags.userId.length ? tags.userId[0] : undefined
        const sourceMail = message.mail.source.replace(/^.*</, '').replace(/>$/, '') //strip source to base email address
        console.log(message.eventType, campaignId, userId, sourceMail)
        try {
          switch (message.eventType) {
            case 'Bounce':
              const bounce = message.bounce;
              // bounced email invalid address
              console.log(bounce.bouncedRecipients)
              await Promise.all(bounce.bouncedRecipients.map(async rec => {
                await ml.updateAddressAttributes(rec.emailAddress, {
                  status: 'bounce',
                })

                const keys = {
                  pk: `USER|${userId}`,
                  sk: `CAMPAIGN|${campaignId}|${rec.emailAddress}`,
                }

                await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
                  delivered: true,
                })
              }))



              break;

            case 'Open':
              if (campaignId && userId){
                await Promise.all(message.mail.destination.map(async address => {
                  const keys = {
                    pk: `USER|${userId}`,
                    sk: `CAMPAIGN|${campaignId}|${address}`,
                  }

                  await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
                    read: true,
                  })
                }))
              }

              break;

            case 'Click':
              const clickTarget = message.click.link
              const clickTargetHash = md5(clickTarget)
              if (campaignId && userId){
                await Promise.all(message.mail.destination.map(async address => {
                  const keys1 = {
                    pk: `USER|${userId}`,
                    sk: `CAMPAIGN|${campaignId}|LINK|${clickTargetHash}`,
                  }

                  const linkStats = await dynamo.getOne(CAMPAIGN_DELIVERY_TABLE, keys1)
                  const clickCount = linkStats ? linkStats.click_count || 0 : 0

                  const keys2 = {
                    pk: `USER|${userId}`,
                    sk: `CAMPAIGN|${campaignId}|${address}|LINK|${clickTargetHash}`,
                  }

                  const userStats = await dynamo.getOne(CAMPAIGN_DELIVERY_TABLE, keys2)
                  const userLinkClickCount = userStats ? userStats.click_count || 0 : 0
                  const common = {
                    link: clickTarget,
                    link_hash: clickTargetHash,
                    campaign_id: campaignId,
                  }
                  await Promise.all([
                    dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys1, {
                      ...common,
                      click_count: clickCount + 1,
                    }),
                    dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys2, {
                      ...common,
                      click_count: userLinkClickCount + 1,
                      email: address,
                    }),
                  ])
                }))
              }

              break;

            case 'Complaint':
              const complaint = message.complaint;
              // marked as spam
              await Promise.all(complaint.complainedRecipients.map(async rec => {
                await ml.updateAddressAttributes(rec.emailAddress, {
                  status: 'complaint',
                }, sourceMail)

                const keys = {
                  pk: `USER|${userId}`,
                  sk: `CAMPAIGN|${campaignId}|${rec.emailAddress}`,
                }

                await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
                  complaint: true,
                })

              }))
              break;

            case 'Delivery':
              // delivered ok
              await Promise.all(message.mail.destination.map(async address => {
                await ml.updateAddressAttributes(address, {
                  status: 'ok',
                }, sourceMail)

                const keys = {
                  pk: `USER|${userId}`,
                  sk: `CAMPAIGN|${campaignId}|${address}`,
                }

                await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
                  delivered: true,
                })
              }))

              break;

            case 'Send':
              // Sent ok
              await Promise.all(message.mail.destination.map(async address => {
                const keys = {
                  pk: `USER|${userId}`,
                  sk: `CAMPAIGN|${campaignId}|${address}`,
                }
                await dynamo.updateValues(CAMPAIGN_DELIVERY_TABLE, keys, {
                  sent: true,
                })
              }))

              break;

            default:
              break;
          }

          return true;

        } catch (error) {
          console.error(error);
          return false;
        }

      }),
    )

    context.done(null, event);
    callback(null, event);
    return done;

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }
};
