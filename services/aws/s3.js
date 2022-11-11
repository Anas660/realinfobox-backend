'use strict';
const AWS = require('./aws');
const S3 = new AWS.S3();

const self = module.exports = {
  getSignedUrl: (bucketName, action, fileKey, fileType) => {
    return new Promise(async (res, rej) => {
      const params = {
        Bucket: bucketName,
        Key: fileKey,
        ContentType: fileType,
      };

      try {
        let data = await S3.getSignedUrlPromise(action, params);
        res(data);

      } catch (err) {
        console.error(err);
        rej({error: {code: err.code, message: err.message}});
      }
    });
  },
  getMetadata: async (bucketName, fileKey) => {
    try {
      const data = await S3.headObject({
        Bucket: bucketName,
        Key: fileKey,
      }).promise();

      return data;
    } catch (error) {
      throw error;
    }
  },
  getObject: async (bucketName, fileKey) => {
    try {
      const data = await S3.getObject({
        Bucket: bucketName,
        Key: fileKey,
      }).promise();

      return data;
    } catch (error) {
      throw error;
    }
  },
  listObjects: async (bucketName, fileKey) => {
    try {
      const data = await S3.listObjectsV2({
        Bucket: bucketName,
      }).promise();

      return data;
    } catch (error) {
      throw error;
    }
  },
}
