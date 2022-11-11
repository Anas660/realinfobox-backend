'use strict';

const self = module.exports = {
  /**
   * has to be AFTER auth middleware!!
   */
  hasRole: (roleName) => (req, res, next) => {
    console.log(`has role '${roleName}'`, res.locals.user.roles[roleName])
    if (res.locals.user.roles[roleName]) next();
    else {
      res.status(403).send();
      return;
    }
  },
  hasOneRole: (...roles) => (req, res, next) => {
    const permitted = roles.some(r => {
      return res.locals.user.roles[r];
    });
    console.log(`has role '${roles.join(', ')}'`, permitted);

    if (permitted) next();
    else {
      res.status(403).send();
      return;
    }
  },
}
