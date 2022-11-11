'use strict';
const AWS = require('./aws');
const ses = new AWS.SES();
const ses2 = new AWS.SESV2();

const {
  // SES_EMAIL,
  // SES_DOMAIN,
  // AWS_LAMBDA_ENDPOINT,
  // IS_OFFLINE,
  SES_CONFIGURATION_SET_NAME,
} = process.env;

// const endpoint = IS_OFFLINE ? 'http://localhost:3000' : AWS_LAMBDA_ENDPOINT;


const self = module.exports = {

  generateEmailParams: (sourceEmail, targetEmails, subject, html, {text, cc, bcc, tags}) => {
    if (!(targetEmails && subject && html)) {
      console.error(sourceEmail, targetEmails, subject, html, {text, cc, bcc, tags});
      throw new Error('Cannot send email, missing params.');
    }

    const result = {
      Content: {
        Simple: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: html,
            },
          },
          Subject: {
            Charset: 'UTF-8',
            Data: subject,
          },
        },
      },
      FromEmailAddress: sourceEmail,
      Destination: { ToAddresses: targetEmails },
      ConfigurationSetName: SES_CONFIGURATION_SET_NAME,
    }

    if (text) {
      result.Content.Simple.Body.Text = {
        Charset: 'UTF-8',
        Data: text,
      }
    }
    if (cc) {
      result.Destination.CcAddresses = cc;
    }
    if (bcc) {
      result.Destination.BccAddresses = bcc;
    }
    if (tags && tags.length) {
      result.EmailTags = tags
    }

    return result
  },

  send: async (sourceEmail, targetEmails, subject, html, options = undefined) => {
    try {
      let text,cc,bcc, tags;
      if (options) {
        text = options.text;
        cc = options.cc;
        bcc = options.bcc;
        tags = options.tags;
      }

      let targets = (typeof targetEmails === 'string') ? [targetEmails] : targetEmails;
      const emailParams = self.generateEmailParams(sourceEmail, targets, subject, html, {text, cc, bcc, tags});
      console.log(emailParams)
      const messageId = await ses2.sendEmail(emailParams).promise();
      console.log(`sent mail to: ${targetEmails}, cc: ${cc}, bcc: ${bcc}`)
      return messageId;
    } catch (error) {
      throw error;
    }
  },

  verifyEmailIdentity: async (email) => {
    try {
      const verifyResult = await ses.verifyEmailIdentity({
        EmailAddress: email,
      }).promise();

      return true;

    } catch (error) {
      throw error;
    }
  },
  deleteIdentity: async (identity) => {
    try {
      const verifyResult = await ses.deleteIdentity({
        Identity: identity,
      }).promise();

      return true;

    } catch (error) {
      throw error;
    }
  },
  listIdentities: async () => {
    try {
      const params = {
        IdentityType: 'EmailAddress',
      }
      const identities = [];
      let done = false;

      do {
        const response = await ses.listIdentities(params).promise();
        identities.push(...response.Identities);
        if (!response.NextToken) done = true;
        else {
          params.NextToken = response.NextToken;
        }

      } while (!done);
      return identities;

    } catch (error) {
      throw error;
    }
  },
  getIdentityVerificationAttributes: async (identity) => {
    try {
      const response = await self.getIdentitiesVerificationAttributes([identity]);
      return response;
    } catch (error) {
      throw error;
    }
  },
  getIdentitiesVerificationAttributes: async (identitiesArray) => {
    try {
      const params = {
        Identities: identitiesArray,
      }
      const response = await ses.getIdentityVerificationAttributes(params).promise();
      return response;
    } catch (error) {
      throw error;
    }
  },
  checkAddressVerified: async (address) => {
    try {
      const {VerificationAttributes} = await self.getIdentityVerificationAttributes(address);
      const status = VerificationAttributes[address]
      if (status && status.VerificationStatus === 'Success') {
        return true;
      }

      return false;

    } catch (error) {
      console.error('address verification failed')
      console.error(error)
      throw error;
    }
  },

}
