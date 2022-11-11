const dynamo = require('../services/aws/dynamo');
const cognito = require('../services/aws/cognito');


exports.confirmSignup = async (req, res) => {
  const {code, username} = req.body;
  try {
    await cognito.confirmSignUp(username, code);
    res.json({message:'Account confirmed'});
    return;
  } catch (error) {
    console.error(error);
    const status = 500;


    res.status(500).json(error);
    return;
  }
}
// exports.confirmEmail = async (req, res) => {
//   const {code, username} = req.body;
//   try {
//     await cognito.confirmSignUp(username, code);
//     res.send('Účet bol aktivovaný');
//     return;
//   } catch (error) {
//     console.error(error);
//     const status = 500;


//     res.status(500).json(error);
//     return;
//   }
// }

exports.confirmForgotPassword = async (req, res) => {
  const {username, newPassword, code} = req.body;
  try {
    await cognito.confirmForgotPassword(username, newPassword, code);
    res.json({message:'Password reset confirmed'});
    return;
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
    return;
  }
}
