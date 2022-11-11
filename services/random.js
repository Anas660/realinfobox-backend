'use strict';

const _ = require('lodash');

var self = module.exports = {
  /**
   * Returns a random number between min (inclusive) and max (exclusive)
   */
  getRandomArbitrary: (min, max) => {
    return Math.random() * (max - min) + min;
  },
  /**
  * Returns a random integer between min (inclusive) and max (inclusive).
  * The value is no lower than min (or the next integer greater than min
  * if min isn't an integer) and no greater than max (or the next integer
  * lower than max if max isn't an integer).
  * Using Math.round() will give you a non-uniform distribution!
  */
  getRandomInt: (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * Return a random hex of desired length
   */
  getRandomHexOfLength: (length) => {
    const hex = "F".repeat(length);
    const int = parseInt(hex, 16);

    const random = self.getRandomInt(0, int);
    return _.padStart(random.toString(16), length, '0');
  },
}


