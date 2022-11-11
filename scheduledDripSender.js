const Sentry = require('@sentry/node');

const sqs = require('./services/aws/sqs');
const cognito = require('./services/aws/cognito');
const dynamo = require('./services/aws/dynamo');
const drips = require('./services/dynamo/drips');

const differenceInCalendarDays = require('date-fns/differenceInCalendarDays')
const parseISO = require('date-fns/parseISO')

const {
  SENTRY_URL,
  TEST_EMAIL,
  SES_EMAIL,
  APP_TABLE,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
  try {

    const loaded = await Promise.all([
      cognito.listUsersInGroup('demo'),
      dynamo.getPkBeginsWithReverse(APP_TABLE, 'ATTRIBUTES', 'USER|'),
    ])
    const agents = loaded[0];
    const userAttributes = loaded[1];
    const mappedAgends = agents.map(agent => {
      const userAttrs = userAttributes.find(ua => dynamo.parseId(ua.pk) === agent.id);
      const invitedAt = userAttrs ? parseISO( userAttrs.invited_at) : undefined
      const daysSinceInvitation = invitedAt ? differenceInCalendarDays(Date.now(), invitedAt ) : undefined
      return {
        ...agent,
        userAttrs,
        daysSinceInvitation,
      }
    })
    let allDrips = await drips.getAllDrips();
    allDrips = allDrips.filter(drip => !!drip.attributes.delay)
    const done = await Promise.all(mappedAgends.map(async agent => {
      try {
        if ((!agent.daysSinceInvitation && agent.daysSinceInvitation !== 0) || isNaN(agent.daysSinceInvitation)) return false;
        const foundDrips = allDrips.filter(drip => {
            return (drip.attributes.city_id === agent.userAttrs.city_id) ? drip.attributes.delay == agent.daysSinceInvitation : false
        })
        if (!foundDrips.length) return false;

        const defaultMessage = {
          from: SES_EMAIL,
          to: '',
          dripId: undefined,
          userId: agent.id,
        }

        const emails = foundDrips.map(drip => ({
          ...defaultMessage,
          dripId: drip.id,
          to: agent.attributes.email,
        }));

        // add an extra email to ourselves
        // emails.push({
        //   ...defaultMessage,
        //   to: TEST_EMAIL,
        // })
        const done = await sqs.queueDripEmails(emails);

      } catch (error) {
        console.error(error)
        return false;
      }
    }))

    context.done(null, event);
    callback(null, event);

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }

};
