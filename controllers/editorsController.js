const cognito = require('../services/aws/cognito');

const {fail} = require('../services/responses');

const {
  APP_TABLE,
} = process.env;

const self = module.exports = {
  list: async (req, res) => {
    try {
      const editors = await cognito.listUsersInGroup('editors')

      res.json(editors);

    } catch (error) {
      fail(res, error);
    }
  },
  create: async (req, res) => {
    try {
      const {email, given_name, family_name} = req.body;

      const userAttrs = [
        {
          Name: 'given_name',
          Value: given_name,
        },
        {
          Name: 'family_name',
          Value: family_name,
        },
      ];
      const createResult = await cognito.createUser(email, userAttrs);

      const user = createResult.User;
      const userId = user.Attributes.find(attr => attr.Name === 'sub').Value;

      const done = await Promise.all([
        cognito.addUserToGroup(userId, 'editors'),
      ])

      if (done) {
        //
      }

      res.json(createResult);

    } catch (error) {
      fail(res, error);
    }
  },
  detail: async (req, res) => {
    const { id } = req.params;
    try {
      res.status(500).json({message: 'NOT IMPLEMENTED'});

    } catch (error) {
      fail(res, error);
    }
  },
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const {given_name, family_name} = req.body;

      const localUser = res.locals.user;

      if (!localUser.roles.admin) throw {statusCode: 403}

      let user = await cognito.getUser(id);
      if (!user) throw {statusCode: 404, message: 'User not found'}

      const attrs = [];
      if (given_name) attrs.push({Name: 'given_name', Value: given_name})
      if (family_name) attrs.push({Name: 'family_name', Value: family_name})

      if (!attrs.length) throw {statusCode: 400, message: 'Nothing to update'};

      const result = await cognito.adminUpdateUserAttributes(id, attrs);

      user = await cognito.getUser(id);
      res.json(user);

    } catch (error) {
      fail(res, error);
    }
  },
  delete: async (req, res) => {
    const { id } = req.params;
    const now = Date.now();

    try {
      res.status(500).json({message: 'NOT IMPLEMENTED'});

    } catch (error) {
      fail(res, error);
    }
  },

}
