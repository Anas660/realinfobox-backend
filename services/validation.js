'use strict';
const validator = require('express-validator');
const cognito = require('./aws/cognito');
const dateFNS = require('date-fns');
const _ = require('lodash');

const checkValidationFail = (req, res, next) => {
  const errors = validator.validationResult(req);

  if (!errors.isEmpty()) {
    const fields = {};
    errors.array().forEach(e => {
      fields[e.param] = e.msg;
    })

    res.status(422).json({
      error: {
        code: 'InvalidInput',
        message: 'Some fields are not valid',
        invalid_fields: fields,
      },
    });
    return;
  }
  next();
}


const self = module.exports = {
  ..._.pick(dateFNS, ['isPast', 'isFuture']),
  ...validator,
  checkValidationFail,
  nameRegex: new RegExp(/^(?=.{1,40}$)[a-zA-Z]+(?:[-'\s][a-zA-Z]+)*$/g),
  usernameTaken: async (value) => {
    try {
      const found = await cognito.getUser(value);

      if (found) return Promise.reject('EmailTaken');
    } catch (error) {
      // not found or some other getUser error
    }

    return true;
  },
  userExists: async (value) => {
    try {
      const found = await cognito.getUser(value);

      if (!found) return Promise.reject('UserDoesntExist');
      return Promise.resolve();
    } catch (error) {
      return Promise.reject('UserDoesntExist');
    }
  },
  nameWithDiacritics: new RegExp(/^[a-zA-Z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]+$/),
  capitalize: (string) => string.charAt(0).toUpperCase() + string.slice(1),
  lowercase: (string) => string.toLowerCase(),
}
