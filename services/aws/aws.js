'use strict';

const {
  AWS_REGION,
  AWS_PROFILE,
  IS_OFFLINE,
} = process.env;

const AWS = require('aws-sdk');
AWS.config.update({region: AWS_REGION});

if (IS_OFFLINE) { //serverless ofline
  var credentials = new AWS.SharedIniFileCredentials({profile: AWS_PROFILE});
  AWS.config.credentials = credentials;
}

module.exports = AWS;
