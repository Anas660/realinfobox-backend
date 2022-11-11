const s3 = require('../services/aws/s3');
const dynamo = require('../services/aws/dynamo');

const {fail} = require('../services/responses');

const uuidv4 = require('uuid/v4');
const _omit = require('lodash/omit');

const {
  APP_TABLE,
  S3_IMAGES_BUCKET,
} = process.env;

const self = module.exports = {
  create: async (req, res) => {
    try {
      const { user } = res.locals;
      const { url, title, text, type, size, name } = req.body;

      const listingId = uuidv4()

      // TODO validate size
      // TODO validate file types
      const splitName = name.split('.');
      const extension = splitName[splitName.length-1];
      const fileName = `${listingId}.${extension}`;
      let filekey = `users/${user.id}/listings/${fileName}`;
      const upload_url = await s3.getSignedUrl(S3_IMAGES_BUCKET, 'putObject', filekey, type );
      await dynamo.put(APP_TABLE, {
        pk: `USER|${user.id}`,
        sk: `LISTING|${listingId}`,
        entity: 'USER',
        image_url: upload_url.split('?')[0],
        url: url,
        title,
        text,
        type,
      })

      res.json({
        upload_url,
        upload_name: fileName,
      });

    } catch (error) {
      fail(res, error);
    }
  },
  list: async (req, res) => {
    try {
      const userId = res.locals.user.id;

      const listings = await dynamo.getSkBeginsWith(APP_TABLE,`USER|${userId}`, 'LISTING|');

      res.json(listings.map(l=>{
        const listingId = dynamo.parseId(l.sk);
        return {
          ...l,
          id: listingId,
        }

      }))

    } catch (error) {
      fail(res, error);
    }
  },
}
