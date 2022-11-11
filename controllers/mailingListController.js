const m = require('../services/dynamo/mailingList')
const camp = require('../services/dynamo/campaigns')
const {fail} = require('../services/responses');

const _ = require('lodash');

const getPercent = (val1, val2) => {
  const result = (100*val1/val2)
  return !isNaN(result) ? result.toFixed(0) : '-'
}

const self = module.exports = {
  list: async (req, res) => {
    try {
      const userId = res.locals.user.id;

      const list = await m.getMailingList(userId);
      const stats = await camp.getUserCampaignDeliveriesForEmails(userId);
      const mlContacts = list.map(l => {
        let listItem = {
          ...l,
          stats: undefined,
        }
        const counts = {
          sent: 0,
          read: 0,
          delivered: 0,
          clicks: 0,
          clicks_unique: 0,
        }
        if (stats[l.email]) {
          const trimmedStats = stats[l.email].stats.slice(-10)
          const groupedStats = _.keyBy(trimmedStats, 'campaign_id')
          const groupedLinks = _.groupBy(stats[l.email].links, 'campaign_id')

          const resultingStats = {}
          Object.keys(groupedStats).forEach(campaignId => {
            const links = groupedLinks[campaignId]
            const totalClicks = links ? links.reduce((acc, cur) => acc+cur.click_count, 0) : 0
            const prunedStats = groupedStats[campaignId]
            delete prunedStats.email;
            delete prunedStats.campaign_id;

            resultingStats[campaignId] = {
              ...prunedStats,
              clicks: totalClicks,
            }
            counts.clicks += totalClicks
            if (totalClicks > 0) counts.clicks_unique++
          })
          listItem.stats = resultingStats

          stats[l.email].stats.forEach(s => {
            if (!!s.sent || s.status !== 'sending') counts.sent++
            if (!!s.read) counts.read++
            if (!!s.delivered) counts.delivered++
          })
        }

        // fix discrepancies in some stats we may not have caught in the past
        if (counts.read > counts.delivered) counts.delivered = counts.read
        if (counts.delivered > counts.sent) counts.sent = counts.delivered

        listItem.totals = counts

        listItem.totals_percent = {
          read: getPercent(counts.read, counts.delivered),
          delivered: getPercent(counts.delivered, counts.sent),
          clicks_unique: getPercent(counts.clicks_unique, counts.read),
        }

        return listItem;
      })

      const responseTotals = {
        contacts: mlContacts.length,
        ok: 0,
        unsubscribed: 0,
        complaint: 0,
        bounce: 0,
      }
      mlContacts.forEach(addr => {
        switch (addr.status) {
          case 'bounce':
            responseTotals.bounce++
            break;
          case 'unsubscribed':
            responseTotals.unsubscribed++
            break;
          case 'complaint':
            responseTotals.complaint++
            break;
          default:
            responseTotals.ok++
            break;
        }
      })

      const totalsPercent = {
        ok: getPercent(responseTotals.ok, responseTotals.contacts),
        unsubscribed: getPercent(responseTotals.unsubscribed, responseTotals.contacts),
        complaint: getPercent(responseTotals.complaint, responseTotals.contacts),
        bounce: getPercent(responseTotals.bounce, responseTotals.contacts),
      }

      const response = {
        data: mlContacts,
        totals: responseTotals,
        totals_percent: totalsPercent,
      }

      res.json(response);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const userId = res.locals.user.id;
      const {contacts, email} = req.body;

      if (!contacts && !email)
        throw {
          statusCode: 400,
          code: 'InvalidParams',
        }

      const added = [];
      const failed = [];
      if (contacts){
        await Promise.all(contacts.map(async contact => {
          try {
            const picked = {
              email: contact.email.trim().toLowerCase(),
              given_name: contact.given_name || null,
              family_name: contact.family_name || null,
              tags: contact.tags,
              status: contact.status,
            };

            const done = await m.setAddress(userId, picked);
            if(done) {/** */}
            added.push(contact.email.trim().toLowerCase());

          } catch (error) {
            console.log(error)
            failed.push(contact.email.trim().toLowerCase())
          }
          return true;
        }))

      } else {
        const picked = _.pick(req.body, ['email', 'given_name', 'family_name', 'tags', 'status']);

        await m.setAddress(userId, {
          ...picked,
          email: picked.email.trim().toLowerCase(),
        });
        added.push(req.body.email.trim().toLowerCase());
      }
      res.json({
        added,
        failed,
      });

    } catch (error) {
      fail(res, error);
    }
  },

  update: async (req, res) => {
    try {
      const user = res.locals.user;
      const {currentEmail} = req.params;
      const picked = _.pick(req.body, ['email', 'given_name', 'family_name', 'tags', 'status']);

      await m.updateAddress(user.id, currentEmail, picked)

      res.send();

    } catch (error) {
      fail(res, error);
    }
  },
  delete: async (req, res) => {
    try {
      const userId = res.locals.user.id;
      const {currentEmail} = req.params;

      await m.deleteAddress(userId, currentEmail);

      res.json();
    } catch (error) {
      fail(res, error);
    }
  },
  deleteMany: async (req, res) => {
    try {
      const userId = res.locals.user.id;
      const {emails} = req.body;

      const success = [];
      const fail = [];
      if (emails.length) {
        await Promise.all(emails.map(async email => {
          try {
            await m.deleteAddress(userId, email);
            success.push(email)
            return true;
          } catch (error) {
            fail.push(email)
            return false
          }
        }))
      }

      res.json({
        success,
        fail,
      });
    } catch (error) {
      fail(res, error);
    }
  },
  listTags: async (req, res) => {
    const userId = res.locals.user.id;
    try {
      const tags = await m.listTags(userId);
      res.send(tags);

    } catch (error) {
      fail(res, error);
    }
  },
  updateTags: async (req, res) => {
    const userId = res.locals.user.id;
    const {tags} = req.body;
    try {
      const newTags = await m.updateTags(userId, tags);

      res.json({tags: newTags});

    } catch (error) {
      fail(res, error);
    }
  },

}
