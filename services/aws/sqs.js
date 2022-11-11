'use strict';
const AWS = require('./aws');
const sqs = new AWS.SQS();

const _ = require('lodash');

const {
  ACCOUNT_ID,
  APP_REGION,
  SQS_MAILING_QUEUE_NAME,
  SQS_DRIPS_QUEUE_NAME,
} = process.env;

const self = module.exports = {
  sendMessage: async (queueUrl, message) => {
    if (typeof queueUrl !== 'string') throw Error('SQS: QueueURL is not a string');
    if (typeof message !== 'string') throw Error('SQS: Message is not a string');
    try {
      const params = {
        MessageBody: message,
        QueueUrl: queueUrl,
      }

      const result = await sqs.sendMessage(params).promise();
    } catch (error) {
      throw error;
    }
  },
  sendManyMessages: async (queueUrl, messageArray) => {
    if (typeof queueUrl !== 'string') throw Error('SQS: QueueURL is not a string');
    const chunks = _.chunk(messageArray, 10);
    try {
      const done = await Promise.all(chunks.map(async chunk => {
        try {
          const params = {
            Entries: chunk.map((message, index) => {
              return {
                Id: 'message_' +index,
                MessageBody: message,
              }
            }),
            QueueUrl: queueUrl,
          }

          const result = await sqs.sendMessageBatch(params).promise();
          // TODO check errors
          return result;

        } catch (error) {
          throw error;
        }
      }))

      return _.flattenDepth(done, 1);
    } catch (error) {
      throw error;
    }
  },
  queueEmails: async (emailObjectsArray) => {
    var queueUrl = `https://sqs.${APP_REGION}.amazonaws.com/${ACCOUNT_ID}/${SQS_MAILING_QUEUE_NAME}`;
    try {
      const done = await self.sendManyMessages(
        queueUrl,
        emailObjectsArray.map(obj => JSON.stringify(obj)),
      )

      console.log(`-- Enqueued ${emailObjectsArray.length} messages.`)

      return done || true;

    } catch (error) {
      throw error;
    }
  },
  queueDripEmails: async (emailObjectsArray) => {
    var queueUrl = `https://sqs.${APP_REGION}.amazonaws.com/${ACCOUNT_ID}/${SQS_DRIPS_QUEUE_NAME}`;
    try {
      const done = await self.sendManyMessages(
        queueUrl,
        emailObjectsArray.map(obj => JSON.stringify(obj)),
      )

      return done || true;

    } catch (error) {
      throw error;
    }
  },
}
