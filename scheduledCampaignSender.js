const Sentry = require('@sentry/node');

const ses = require('./services/aws/ses-emails');
const dynamo = require('./services/aws/dynamo');
const cognito = require('./services/aws/cognito');
const emailing = require('./services/emailing');
const users = require('./services/dynamo/users');
const camp = require('./services/dynamo/campaigns');

const isBefore = require('date-fns/isBefore')
const formatRFC3339 = require('date-fns/formatRFC3339');

const {APP_TABLE} = process.env
const _ = require('lodash')

const {
  SENTRY_URL,
} = process.env;

Sentry.init({
  dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
  try {
    const agents = await cognito.listUsersInGroup('users');
    const userEmails = agents.map(agent => agent.attributes.email)

    const chunks = _.chunk(userEmails, 100)

    let allVerification = {}
    await Promise.all(
      chunks.map(async chunk => {
        try {
          const verifAttributes =  await ses.getIdentitiesVerificationAttributes(chunk)
          if (verifAttributes.VerificationAttributes){
            allVerification = {...allVerification, ...verifAttributes.VerificationAttributes}
            return true
          }

        } catch (error) {
          console.error(error)
          return false
        }
      }),
    );
    const verifiedAgentEmails = Object.keys(allVerification).filter(email => {
      const isVerified = allVerification[email].VerificationStatus === 'Success';
      return isVerified
    })

    const userEntities = await dynamo.getAllOfEntity('USER');
    const attrs = userEntities.filter(ue => /(CAMPAIGN\|.*\|ATTRIBUTES)/.test(ue.sk))
    const awaitingCampaigns = attrs.filter(camp => camp.status === 'scheduled')
    const pastCampaigns = awaitingCampaigns.filter(ac => isBefore(new Date(ac.scheduled), Date.now()))

    const allContent = await dynamo.getPkBeginsWithReverse(APP_TABLE, 'ATTRIBUTES', 'CAMPAIGN_CONTENT|')
    const awaitingContent = allContent.filter(c => c.status !== 'sent' && c.status !== 'sending')
    const pastContent = awaitingContent.filter(ac => isBefore(new Date(ac.scheduled), Date.now()))

    // const verifiedUserCampaigns =
    let done = await Promise.all(
      pastCampaigns.map(async pc => {
        try {
          const campaignId = pc.sk.split('|')[1]; // sk: 'CAMPAIGN|1582646548999|ATTRIBUTES'
          const userId = dynamo.parseId(pc.pk);
          const user = agents.find(u => u.id === userId);
          if (!user) {
            console.error(`user ${userId} not found`)
            return false;
          }
          if (!verifiedAgentEmails.includes(user.attributes.email)){
            console.error(`email ${user.attributes.email} not verified`);
            return false;
          }

          const campaign = await camp.getUserCampaign(userId, campaignId);
          const account = await users.getUserAccount(userId);
          if (!account.business_address){
            console.error(`business address of ${user.attributes.email} not set`);
            return false;
          }

          console.log('sending to mailing list of user: ', user.attributes.email)
          await emailing.sendUserCampaignToMailingList(
            userId,
            campaignId,
            user.attributes.email,
            campaign && campaign.mailing_list_tag_id ? [campaign.mailing_list_tag_id] : undefined,
            false)
          // mark campaign sent
          const now = formatRFC3339(new Date);
          await dynamo.updateValues(APP_TABLE, _.pick(pc, ['pk', 'sk']), {
            status: 'sending',
            sent_at: now,
          });
          return pc

        } catch (error) {
          // if (error.code === 'EmailNotVerified')
          //   return false
          await dynamo.updateValues(APP_TABLE, _.pick(pc, ['pk', 'sk']), {
            status: 'draft',
          });

          console.error(error);
          return false
        }

      }),
    )
    done = done.filter(d => !!d);
    if (done) {/** */}
    const now = formatRFC3339(new Date);
    // mark past content as sent
    const itemsToPut = pastContent.map(pc => {
      return {
        ...pc,
        status: 'sent',
        sent_at: now,
      }
    })

    await dynamo.batchWrite(APP_TABLE, itemsToPut);
    console.log(`processed '${done.length}' campaigns and '${pastContent.length}' content`);

    context.done(null, event);
    callback(null, event);

  } catch (error) {
    console.error(error);
    Sentry.captureException(error);
  }

};
