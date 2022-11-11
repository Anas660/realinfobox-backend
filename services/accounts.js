'use strict';

const cognito = require('./aws/cognito');

const {
  APP_TABLE,
} = process.env;

const self = module.exports = {

  hasGroup: async (userId, groupName) => {
    const groups = await cognito.listGroupsForUser(userId);
    const mappedGroups = (groups && groups.length) ? groups.map(el => el.GroupName) : [];
    console.log("has group: ", mappedGroups.includes(groupName));
    return mappedGroups.includes(groupName);
  },


}
