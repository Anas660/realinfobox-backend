'use strict';

const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.APP_SECRET; // Must be 256 bytes (32 characters)

const self = module.exports = {

  aes256cbc: {
    encrypt: (text) => {
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
      let encrypted = cipher.update(text);

      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const encryptedHex = iv.toString('hex') + ':' + encrypted.toString('hex');

      return encryptedHex;
    },
    decrypt: (encryptedHex) => {
      const textParts = encryptedHex.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(Buffer.from(textParts.shift(), 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString();

      } catch (error) {
        console.error(error)
        throw {
          code: 'UnableToDecrypt',
          message: error.message,
        }
      }
    },

  },
}


