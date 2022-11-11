const cognito = require('../services/aws/cognito');
const users = require('../services/dynamo/users');

// authorization middleware
const auth = async (req, res, next) => {
  let accessTokenFromClient = req.get("authorization");
  //Fail if token not present in header.
  if (!accessTokenFromClient) {
    res.set("WWW-Authenticate", "Basic realm=\"Authorization token missing\"");
    res.status(401).json({
      error: "Authorization token missing",
    });
    return;
  }
  // remove the 'bearer' part
  const accessToken = accessTokenFromClient.split(" ")[1];
  if (!accessToken){
    res.set("WWW-Authenticate", "Basic realm=\"Authorization token missing\"");
    res.status(401).json({
      error: "Authorization token missing",
    });
    return;
  }

  try {
    const tokenPayload = await cognito.verifyToken(accessToken);
    // API has been authenticated. Proceed.
    const isEditor = tokenPayload['cognito:groups'].includes('editors');
    const isAdmin = tokenPayload['cognito:groups'].includes('admins');

    res.locals.access_token = accessToken;

    let {aid} = req.query;
    if (aid && (isEditor || isAdmin)) {
      if (typeof aid === 'array') {
        aid = aid[0]
      }
      // user has elevated privileges, allow for assumed user id (aid)
      const assumedUser = await users.getFullUser(aid);
      console.log('aid:', aid)
      if (assumedUser.roles.user) {
        // only a user can be impersonated
        res.locals.user = assumedUser;
        res.locals.user.roles = {
          ...res.locals.user.roles,
          admin: isAdmin,
          editor: isEditor,
        }
      } else {
        throw {
          statusCode: 403,
          code: 'ImpersonationInvalid',
        }
      }

    } else {
      const authenticatedUser = await users.getFullUser(tokenPayload.sub);
      res.locals.user = authenticatedUser;
    }

    next();
    return;

  } catch (err) {
    console.log(err)
    //If API is not authenticated, Return 401 with error message.
    const statusCode = err ? err.statusCode || 401 : 401;
    const code = err ? err.code || 'Unauthorized' : 'Unautorized';
    const message = err ? err.message || undefined : undefined;

    res.set("WWW-Authenticate", "Basic realm=\"Error\"");
    res.status(statusCode).json({
      error: {
        code,
        message,
      },
    });
    return;
  }
};

module.exports = auth;
