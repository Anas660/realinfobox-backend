const s3 = require('../services/aws/s3');

const {fail} = require('../services/responses');

const {
  S3_IMAGES_BUCKET,
} = process.env;

const self = module.exports = {
  getUrl: async (req, res) => {
    try {
      const { user } = res.locals;
      const { name, size, type } = req.query;

      // TODO validate size
      // TODO validate file types
      let filekey;
      if (user.roles.user) {
        filekey = `users/${user.id}/${name}`
      }else if (user.roles.editor) {
        filekey = `editors/${name}`
      }

      console.log(filekey)

      const url = await s3.getSignedUrl(S3_IMAGES_BUCKET, 'putObject', filekey, type.replace(' ', '+') );

      res.json({url});

    } catch (error) {
      fail(res, error);
    }
  },
}
