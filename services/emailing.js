const sqs = require('./aws/sqs');
const ses = require('./aws/ses-emails');
const cognito = require('./aws/cognito');

const ml = require('./dynamo/mailingList');
const camp = require('./dynamo/campaigns');
const cont = require('./dynamo/content');
const bl = require('./dynamo/blocks');
// const content = require('./dynamo/content');
const users = require('./dynamo/users');
const templates = require('./dynamo/templates');
const emailTemplates = require('./dynamo/emailTemplates')

const dynamo = require('./aws/dynamo');

const styles = require('../emailing/styles');
const blockConfig = require('../config/blocks');

const _ = require('lodash')

const {FRONTEND_URL, SES_EMAIL, EMAIL_WIDTH, TEST_EMAIL, API_URL, APP_TABLE} = process.env;

const self = module.exports = {
  targetReplaceTokens: [
    {
      match: 'LIST-GIVEN-NAME',
      replacementAttribute: 'given_name',
    },
    {
      match: 'LIST-FAMILY-NAME',
      replacementAttribute: 'family_name',
    },
    {
      match: 'DEMO-GIVEN-NAME',
      replacementAttribute: 'given_name',
    },
    {
      match: 'LIST-EMAIL',
      replacementAttribute: 'email',
    },
    {
      match: 'USERNAME',
      replacementAttribute: 'username',
    },
    {
      match: 'TEMP_PASSWORD',
      replacementAttribute: 'temp_password',
    },
  ],
  sendUserCampaignToMailingList: async (userId, campaignId, fromEmail, tags = undefined, checkVerified = true) => {
    if (checkVerified) {
      const identityVerified = await ses.checkAddressVerified(fromEmail);
      if (!identityVerified) throw {
        statusCode: 403,
        code: 'EmailNotVerified',
        message: `The email ${fromEmail} has not been verified for sending`,
      }
    }
    try {
      let mailingList = await ml.getMailingList(userId);
      // filter out bounces and complaints and unsubscribes
      mailingList = mailingList.filter(ml => ml.status === 'ok')
      if (tags)
        mailingList = mailingList.filter(ml => {
          if (!ml.tags) return false;
          const commonTags = _.intersection(ml.tags, tags);
          return !!commonTags.length;
        })

      const defaultMessage = {
        from: fromEmail,
        to: '',
        campaignId,
        userId,
      }

      const emails = mailingList.map(mlEntry => ({
        ...defaultMessage,
        to: mlEntry.email,
      }));

      //add an extra email to ourselves
      emails.push({
        ...defaultMessage,
        to: TEST_EMAIL,
      })

      const done = await sqs.queueEmails(emails);

      return true;
    } catch (error) {
      throw error;
    }
  },
  notifyUserOfPublish: async (userId, campaignId) => {
    try {
      let campaign, user;
      const appTableKeys = {
        pk: `CAMPAIGN_CONTENT|${campaignId}`,
        sk: `PUBLISH_NOTIFICATION_DELIVERY|${userId}`,
      }
      try {
        campaign = await camp.getUserCampaign(userId, campaignId);
      } catch (error) {
        console.log(campaignId+ ' campaign not found')
      }
      try {
        user = await users.getFullUser(userId)
      } catch (error) {
        console.log(userId + ' user not found')
      }

      if (!user || !campaign) {
        console.error('failed for user '+ userId +', campaign ' + campaignId)
        return;
      }
      console.log('notifying user:', user.attributes.email)

      const html = await self.composeUserCampaignEmailHTML(userId, campaignId, undefined, true);
      const text = html.replace(/<[^>]*>?/gm, ''); //TODO improve this, as this is a very basic way to strip out HTML tags

      const options = {
        text,
      }

      if (user.settings.notification_emails) {
        options.cc = user.settings.notification_emails;
      }

      await ses.send(
        `"Real Info BOX" <${SES_EMAIL}>`,
        user.attributes.email,
        campaign.attributes.campaign_name + ' published',
        html,
        options,
      )

      await ses.send(
        `"Real Info BOX" <${SES_EMAIL}>`,
        TEST_EMAIL,
        campaign.attributes.campaign_name + ' published for user ' + user.attributes.email,
        html,
        {text},
      )

      await dynamo.put(APP_TABLE, {
        ...appTableKeys,
        sent: true,
      })

      return true;
    } catch (error) {
      throw error;
    }
  },
  composeHTMLFromBlocks: async (blocks, account = undefined, notificationBlock = undefined, options = {}) => {
    try {
      const {drip} = options;
      let htmlContent = '';
      let ba, businessAddress;
      if (account) {
        ba = account.business_address;
        if (ba)
          businessAddress = `${ba.name} - ${ba.brokerage}, ${ba.address1}, ${ba.city}, ${ba.province}, ${ba.zip}`;
      }

      let done = await Promise.all(blocks.map(async bl => {
        try {
          let toAdd = '';
          if (!bl.type || bl.type === "editor"){
            toAdd += self.applyStyles(bl.text);
          }

          else if (['image', 'svg'].includes(bl.type)) {
            const imageTag = `<img src="${bl.image_url}" width="${EMAIL_WIDTH}" style="width: ${EMAIL_WIDTH}px; max-width: ${EMAIL_WIDTH}px;"/>`;
            toAdd += `<a href="${bl.href || ''}" target="_blank">${imageTag}</a>`;
          }

          else if (bl.type === 'social') {
            toAdd += '<div class="Socials" style="display: flex; align-items: center; margin: 0 -10px 1.2rem">';
            if (account && account.social_handles && Object.keys(account.social_handles).length) {
              const socialImgWidth = 35;
              const handlesCount = Object.keys(account.social_handles).length;
              const marginLeft = Math.abs((EMAIL_WIDTH-(socialImgWidth*handlesCount))/(handlesCount+1));
              Object.keys(account.social_handles).forEach((handle, index) => {
                const value = account.social_handles[handle];
                toAdd += `<div class="SocialHandle" style="height: ${socialImgWidth}px; width: ${socialImgWidth}px; margin-left: ${marginLeft}px">`;
                toAdd += `<a href="${value}" target="_blank">`;
                toAdd += `<img src="https://${FRONTEND_URL}/images/social/${handle}.png" height="${socialImgWidth}" width="${socialImgWidth}" style="height: ${socialImgWidth}px; width: ${socialImgWidth}px">`
                toAdd += '</a>'
                toAdd += '</div>'
              })
            } else {
              toAdd += 'Target\'s social media links are going to be here'
            }
            toAdd += '</div>'
          }
          // else if (bl.type === "svg") {
          // // TODO?
          // }
          let toAddHtmlContent = '';
          toAddHtmlContent += `<table><tbody><tr style="min-width: ${EMAIL_WIDTH}px; max-width: ${EMAIL_WIDTH}px;"><td style="min-width: ${EMAIL_WIDTH}px; max-width: ${EMAIL_WIDTH}px; width: ${EMAIL_WIDTH}px;">`;
          toAddHtmlContent += toAdd;
          toAddHtmlContent += '</td></tr></tbody></table>';
          return toAddHtmlContent;
        } catch (error) {
          console.error(error)
        }

        return false;
      }))

      done = done.filter(b => !!b)

      htmlContent += done.join('');

      let headStyles = self.composeMainCSSFromJS();

      let footer = '<tr><td align="center" >';
      footer += '<table class="Footer" style="font-size: 0.5rem; line-height: 1.2; margin: 1.2rem 0; text-align: center ">';

      if (account){
        footer += `<tr><td align="center">This email was sent by:</td></tr>`;
        footer += `<tr><td align="center">${businessAddress || 'BUSSINESS ADDRESS NOT SET'}</td></tr>`;
      }

      if (!drip)
        footer += '<tr><td align="center">If you don’t want to receive emails anymore, you can <a style="color: {CUSTOM_COLOR} !important;" href="{UNSUBSCRIBE_URL}" target="_blank">unsubscribe</a></td></tr>';

      footer += '<tr><td align="center">Email Newsletter for Real Estate Professionals Designed by <a style="color: {CUSTOM_COLOR} !important;" href="https://www.realinfobox.com" target="_blank">RealInfoBOX.com</a></td></tr>';
      footer += '<tr><td align="center"><img height="1" width="1" style="height:1px; width: 1px; opacity: 0" src="{READ_URL}"></td></tr>';
      footer += '</table>';
      footer += '</td></tr>';

      let html = '<!DOCTYPE html>';
      html += '<html>';
      html += '<head>';
      html += '<style type="text/css">';
      html += headStyles;
      html += '</style>';
      html += '</head>';
      html += '<body >';
      html += '<div style="margin:0;padding:0" class="CampaignEmail">';
      html += '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 600px;">';
      html += '<tbody>';
      if (notificationBlock)
        html += '<tr><td style="max-width: 600px;">'+self.applyStyles(notificationBlock)+'</td></tr>';

      html += '<tr><td style="max-width: 600px; width: 600px;" align="center">';
      html += htmlContent;
      html += '</td></tr>';

      html += footer;

      html += '</tbody></table>';
      html += '</div>';

      html += '</body>';
      html += '</html>';

      return html
    } catch (error) {
      throw error;
    }
  },

  composeUserCampaignEmailHTML: async (userId, campaignId, recipientEmail = undefined, notification = false) => {
    try {
      let userCampaign
      try {
        userCampaign = await camp.getUserCampaign(userId, campaignId)
      } catch (error) {
        if (error.statusCode === 404){
          const user = await users.getFullUser(userId);
          //fallback in case the campaign was not published yet, grab template
          userCampaign = await templates.getUserTemplateBlocks(userId, user.attributes.city_id);
        }else {
          throw error;
        }
      }
      // console.log(userCampaign)
      let content = await cont.getContent(userCampaign.content_id || campaignId); // fallback

      const account = await users.getUserAccount(userId);

      const defaultBlocks = [
        ...content.blocks,
        ...blockConfig.defaultBlocks,
      ]

      const blocks = bl.zipBlocksFromBlockOrder(
        userCampaign.block_order,
        defaultBlocks,
        userCampaign.blocks,
      )

      let html = await self.composeHTMLFromBlocks(blocks,
        account,
        notification ? content.attributes.publish_notification : undefined,
      );
      if (recipientEmail) {
        let recipient;
        if (recipientEmail === TEST_EMAIL) {
          recipient = {
            given_name: 'TEST COPY',
            family_name: 'TEST COPY',
          }
        } else {
          recipient = await ml.getAddress(userId, recipientEmail);
        }

        if (!recipient)
          throw {
            statusCode: 404,
            code: 'TargetNotFound',
          }

        const unsubscribeUrl = `${FRONTEND_URL}/unsubscribe?uid=${userId}&cid=${campaignId}&email=${recipientEmail}`
        html = html.replace('{UNSUBSCRIBE_URL}', unsubscribeUrl)

        const readUrl = `${API_URL}/public/campaign-metrics/read?uid=${userId}&cid=${campaignId}&email=${recipientEmail}`
        html = html.replace('{READ_URL}', readUrl)

        self.targetReplaceTokens.forEach(token => {
          const regex = new RegExp(`\{${token.match}\}`, 'g');

          const attr = recipient[token.replacementAttribute] ? recipient[token.replacementAttribute].trim() : undefined;
          html = html.replace(regex, attr || 'Friends');
        })
      }

      const customColor = account.settings.custom_color;
      html = self.replaceCustomColor(html, customColor || 'unset');

      return html;

    } catch (error) {
      throw error;
    }
  },

  composeDripHTML: async (drip, userId) => {
    try {
      let html = await self.composeHTMLFromBlocks(drip.blocks, undefined, undefined, {
        drip: true,
      });

      // const unsubscribeUrl = `${FRONTEND_URL}/drip-unsubscribe?uid=${userId}&did=${drip.id}`
      // html = html.replace('{UNSUBSCRIBE_URL}', unsubscribeUrl)

      // const readUrl = `${API_URL}/public/drip-metrics/read?uid=${userId}&did=${drip.id}`
      // html = html.replace('{READ_URL}', readUrl)

      const recipient = await cognito.getUser(userId)
      self.targetReplaceTokens.forEach(token => {
        const regex = new RegExp(`\{${token.match}\}`, 'g');

        const attr = recipient.attributes[token.replacementAttribute] ? recipient.attributes[token.replacementAttribute].trim() : undefined;
        html = html.replace(regex, attr || 'Friends');
      })

      return html;

    } catch (error) {
      throw error;
    }
  },

  composeMainCSSFromJS() {
    let styleString = '';
    Object.keys(styles.tags).forEach(tag => {
      if (!styles.tags[tag].global) return;
      const styleObject = styles.tags[tag].style;
      let classPrefix = '.CampaignEmail';
      styleString += ` ${classPrefix} ${tag} { `;
      Object.keys(styleObject).forEach(property => {
        const value = styleObject[property];
        styleString += `${property}:${value}; `
      })
      styleString += `}`
    })
    return styleString;
  },

  replaceCustomColor(string, color) {
    return string.replace(/\{CUSTOM_COLOR\}/g, color)
  },

  applyStyles(string) {
    if (!string) return '';
    let htmlContent = string;
    Object.keys(styles.tags).forEach(tag => {
      if (!styles.tags[tag].inline) return;
      const styleObject = styles.tags[tag].style;
      let styleString = '';
      Object.keys(styleObject).forEach(property => {
        const value = styleObject[property];
        styleString += `${property}:${value}; `
      })

      const attrsObject = styles.tags[tag].attrs;
      let attrsString = '';
      if (attrsObject)
        Object.keys(attrsObject).forEach(property => {
          const value = attrsObject[property];
          attrsString += `${property}="${value}" `
        })

      function escapeRegExp(string) {
        return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
      }

      // find all the tags and append the styles to them
      const escapedTag = escapeRegExp(tag)
      const regex = new RegExp(`(?:<)(${escapedTag})`, 'g')
      htmlContent = htmlContent.replace(regex, `<${tag} style="${styleString}" ${attrsString}`);
    })
    return htmlContent;
  },

  sendUserInvitation: async (userObject) => {
    try {
      const username = userObject.attributes.email;
      const {password} = await cognito.setTemporaryPassword(username);

      const sendingEmail = `"Real Info BOX" <${SES_EMAIL}>`

      const recipient = userObject.attributes;
      recipient.username = username;
      recipient.temp_password = password;

      let {template, subject} = await emailTemplates.get('INVITE_EMAIL');
      if (!subject) {
        subject = 'Welcome to Real Info Box!';
      }

      let html;
      if (template) {
        html = template;
      } else {
        html = `Hello ${userObject.attributes.given_name}<br><br>`;
        html += 'Thanks for choosing Real Info Box. Now it\'s time to activate your account so you can start using our services.<br><br>';
        html += 'Please follow the instructions below:<br><br>';
        html += '1. OPEN THE APP<br>';
        html += 'Sign in to your account at <a href="https://app.realinfobox.com/login" target="_blank">https://app.realinfobox.com/login</a><br><br>';
        html += '2. LOG IN TO YOUR ACCOUNT<br>';
        html += 'Please use these login credentials:<br>';
        html += `Username:<pre>${username}</pre><br>`;
        html += `Temporary Password:<pre>${password}</pre><br><br>`;
        html += `3. VERIFY YOUR EMAIL ADDRESS`;
        html += `<p>When you are logged in, please click SEND VERIFICATION EMAIL. This is for us to verify your identity and activate your account.</p>`;
        html += `<p>You will receive an email from Amazon Web Services with subject: <strong>Amazon Web Services – Email Address Verification Request in region US East (N. Virginia)</strong>. Please click the link provided in that email for verification.</p>`;
        html += `<br>`;
        html += `<p>Once you complete these steps, your account will be activated. If you need any help in setting up your email newsletter or market reports accounts, please email us at <a href="mailto:info@realinfobox.com">info@realinfobox.com</a> or call us at <a href="tel:403-909-0582">403-909-0582</a>.</p>`;
        html += '<br><br>';
        html += 'Enjoy!';
        html += '<br><br>';
        html += 'Sincerely,<br>';
        html += 'Your Real Info BOX team';
      }

      html = self.wrapEmailTemplate(html);
      html = self.replaceTokens(html, recipient);
      html = self.applyStyles(html);

      await ses.send(
        sendingEmail,
        username,
        subject,
        html,
      );
      await ses.send(
        sendingEmail,
        [
          TEST_EMAIL,
        ],
        `RealInfoBOX - user ${username} invited`,
        `username: <pre>${username}</pre><br>temporary password: <pre>${password}</pre>`,
      );
    } catch (error) {
      throw error;
    }
  },

    sendDemoInvitation: async (userObject) => {
    try {
        const username = userObject.attributes.email;
        const { password } = await cognito.setTemporaryPassword(username);

        const sendingEmail = `"Real Info BOX" <${SES_EMAIL}>`

        const recipient = userObject.attributes;
        recipient.username = username;
        recipient.temp_password = password;

        let { template, subject } = await emailTemplates.get('INVITE_DEMO_EMAIL');
        if (!subject) {
            subject = 'Welcome to Real Info Box!';
        }

        let html;
        if (template) {
            html = template;
        } else {
            html = `Hello ${userObject.attributes.given_name}<br><br>`;
            html += 'Thanks for choosing Real Info Box. Now it\'s time to activate your account so you can start using our services.<br><br>';
            html += 'Please follow the instructions below:<br><br>';
            html += '1. OPEN THE APP<br>';
            html += 'Sign in to your account at <a href="https://app.realinfobox.com/login" target="_blank">https://app.realinfobox.com/login</a><br><br>';
            html += '2. LOG IN TO YOUR ACCOUNT<br>';
            html += 'Please use these login credentials:<br>';
            html += `Username:<pre>${username}</pre><br>`;
            html += `Temporary Password:<pre>${password}</pre><br><br>`;
            html += `3. VERIFY YOUR EMAIL ADDRESS`;
            html += `<p>When you are logged in, please click SEND VERIFICATION EMAIL. This is for us to verify your identity and activate your account.</p>`;
            html += `<p>You will receive an email from Amazon Web Services with subject: <strong>Amazon Web Services – Email Address Verification Request in region US East (N. Virginia)</strong>. Please click the link provided in that email for verification.</p>`;
            html += `<br>`;
            html += `<p>Once you complete these steps, your account will be activated. If you need any help in setting up your email newsletter or market reports accounts, please email us at <a href="mailto:info@realinfobox.com">info@realinfobox.com</a> or call us at <a href="tel:403-909-0582">403-909-0582</a>.</p>`;
            html += '<br><br>';
            html += 'Enjoy!';
            html += '<br><br>';
            html += 'Sincerely,<br>';
            html += 'Your Real Info BOX team';
        }

        html = self.wrapEmailTemplate(html);
        html = self.replaceTokens(html, recipient);
        html = self.applyStyles(html);

        await ses.send(
            sendingEmail,
            username,
            subject,
            html,
        );
        await ses.send(
            sendingEmail,
            [
                TEST_EMAIL,
            ],
            `RealInfoBOX - user ${username} invited`,
            `username: <pre>${username}</pre><br>temporary password: <pre>${password}</pre>`,
        );
    } catch (error) {
        throw error;
    }
    },

  sendDemoCreatedEmail: async (userObject) => {
    try {
      const username = userObject.attributes.email;
      const {password} = await cognito.setTemporaryPassword(username);

      const sendingEmail = `"Real Info BOX" <${SES_EMAIL}>`

      const recipient = userObject.attributes;
      recipient.username = username;
      recipient.temp_password = password;

      let {template, subject} = await emailTemplates.get('DEMO_REGISTERED_EMAIL');
      if (!subject) {
        subject = 'Welcome to Real Info Box Demo!';
      }

      let html = template || '';

      html = self.wrapEmailTemplate(html);
      html = self.replaceTokens(html, recipient);
      html = self.applyStyles(html);

      await ses.send(
        sendingEmail,
        username,
        subject,
        html,
      );
      await ses.send(
        sendingEmail,
        [
          TEST_EMAIL,
        ],
        `RealInfoBOX - new demo account - user ${username}`,
        `username: <pre>${username}</pre><br>temporary password: <pre>${password}</pre>`,
      );
    } catch (error) {
      throw error;
    }
  },

  wrapEmailTemplate: (htmlContent) => {
    let footer = '<tr><td align="center" >';
    footer += '<table class="Footer" style="font-size: 0.5rem; line-height: 1.2; margin: 1.2rem 0; text-align: center ">';
    footer += '<tr><td align="center">Email Newsletter for Real Estate Professionals by <a href="https://www.realinfobox.com" target="_blank">RealInfoBOX.com</a></td></tr>';
    footer += '<tr><td align="center"><img height="1" width="1" style="height:1px; width: 1px; opacity: 0" src="{READ_URL}"></td></tr>';
    footer += '</table>';
    footer += '</td></tr>';

    let headStyles = self.composeMainCSSFromJS();

    let html = '<!DOCTYPE html>';
    html += '<html>';
    html += '<head>';
    html += '<style type="text/css">';
    html += headStyles;
    html += '</style>';
    html += '</head>';
    html += '<body >';
    html += '<div style="margin:0;padding:0;background:white" class="CampaignEmail">';
    html += '<table width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 600px;">';
    html += '<tbody>';


    html += '<tr><td style="max-width: 600px; width: 600px;" align="center">';
    html += htmlContent;
    html += '</td></tr>';

    html += footer;

    html += '</tbody></table>';
    html += '</div>';

    html += '</body>';
    html += '</html>';

    return html
  },

  replaceTokens: (text, recipient) => {
    let html = text;
    self.targetReplaceTokens.forEach(token => {
      const regex = new RegExp(`\{${token.match}\}`, 'g');

      const attr = recipient[token.replacementAttribute] ? recipient[token.replacementAttribute].trim() : undefined;
      console.log(html)
      html = html.replace(regex, attr || 'Friends');
    })

    return html
  },


}
