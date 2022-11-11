'use strict';

const dynamo = require('./services/aws/dynamo')
const {parseId} = dynamo

const campaigns = require('./services/dynamo/campaigns')
const emailing = require('./services/emailing')
const success = {
  statusCode: 200,
};


const parseImage = (image) => {
  if (!image) return undefined;

  const parsedImage = {};
  Object.keys(image).forEach(key => {
    const value = image[key];
    if (value.S) parsedImage[key] = value.S;
    if (value.N) parsedImage[key] = value.N;
    if (value.NULL) parsedImage[key] = undefined;
  });
  return parsedImage;
}

const valueChanged = (oldImage, newImage, attr) => {
  return oldImage[attr] !== newImage[attr];
}

const self = module.exports = {
  handler: async (event, context) => {
    const results = event.Records.map(async (record, index) => {
      try {
        const {eventName} = record;

        const newImage = parseImage(record.dynamodb.NewImage);
        const oldImage = parseImage(record.dynamodb.OldImage);

        const valChanged = (valName) => valueChanged(oldImage, newImage, valName);

        const pk = newImage ? newImage.pk : oldImage.pk;
        const sk = newImage ? newImage.sk : oldImage.sk;

        if (pk.startsWith('USER|')) {
          const userId = parseId(pk)

          if (/(CAMPAIGN\|.*\|ATTRIBUTES)/.test(sk)) {
            let campaignId = sk.replace('CAMPAIGN|', '')
            campaignId = campaignId.replace('|ATTRIBUTES', '')

            switch (eventName) {
              case 'INSERT':
                console.log('campaign attributes insert')
                // content being published or duplicated

                // do not notify the user if the campaign is being duplicated
                if (!newImage.duplicate_source){
                  // notify user and his emails
                  await emailing.notifyUserOfPublish(userId, campaignId)
                }

                break;
              case 'REMOVE':
                break;
            }
          }
        }

      } catch (error) {
        console.error(error);
      }

    })

    await Promise.all(results);
    return success;
  },
}
