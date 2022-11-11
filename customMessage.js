const Sentry = require('@sentry/node');
// const sha512 = requires('js-sha512');
const emailTemplates = require('./services/dynamo/emailTemplates');
const cognito = require('./services/aws/cognito');
const ses = require('./services/aws/ses-emails');
const {
    COGNITO_POOL_ID,
    FRONTEND_URL,
    // APP_SECRET,
    SES_EMAIL,
    TEST_EMAIL,
    SENTRY_URL,
} = process.env;

Sentry.init({
    dsn: SENTRY_URL,
});

exports.handler = async (event, context, callback) => {
    //
    const { codeParameter, usernameParameter, linkParameter } = event.request;
    const { userName, region } = event;
    let emailSubject, emailMessage, smsMessage;

    const user = await cognito.getUser(userName);
    //const email = await cognito.getEmail(userName);

    let { template, subject } = await emailTemplates.get('RESETPASSWORD_EMAIL');

    try {
        if (event.userPoolId === COGNITO_POOL_ID) {
            // Identify why was this function invoked
            let url, link;

            switch (event.triggerSource) {
                case "CustomMessage_SignUp":
                case "CustomMessage_ResendCode":

                    break;

                case "CustomMessage_ForgotPassword":
                    url = `${FRONTEND_URL}/new-password?u=${user.attributes.email}&c=${codeParameter}`
                    link = `<a href="${url}" target="_blank">${url}</a>`;

                    if (subject) {
                        emailSubject = subject;
                    } else {
                        emailSubject = "[RealInfoBOX] Password reset confirmation";
                    }

                    if (template) {
                        emailMessage = template.replace("{link}", link).replace("{LIST-GIVEN-NAME}", user.attributes.given_name);
                    } else {
                        emailMessage = "Hi,<br>" +
                            "To confirm your password reset, please click the following link or copy it into the address bar of your browser:" +
                            `<br>${link}<br><br>Sincerely,<br>Your <strong>RealInfoBOX<strong> team`;
                    }
                    break;

                case "CustomMessage_UpdateUserAttribute":
                case "CustomMessage_VerifyUserAttribute":

                    break

                // we do this manually at the moment, this shouldnt be needed
                // case "CustomMessage_AdminCreateUser":
                //   emailSubject = "[RealInfoBOX] Your invitation";
                //   emailMessage = `Hi!<br> You have just been invited to our application.<br>` +
                //     `Your username is <pre>${usernameParameter}</pre> and temporary password: <pre>${codeParameter}</pre>`;

                //   emailMessage += `<br>You can log in at <a href="https://${FRONTEND_URL}/login" target="_blank">${FRONTEND_URL}</a><br>`
                //   if (user.roles.user) {
                //     emailMessage += 'As our emailing service provider will need to verify your email address for sending themselves, you will be receiving an email from Amazon Web Services with instructions included.<br>';
                //     emailMessage += '<strong>Please follow the instructions for verification, as not doing so will render us unable to send email in your name.<strong><br><br>';
                //     emailMessage += `<br><br>Let us know should you have any issues. <br>`;
                //   }

                //   emailMessage += `Sincerely,<br>Your <strong>RealInfoBOX<strong> team`



                //   break

                default:
                    break;
            }

            // Create custom message for other events
        } else {
            emailSubject = `[POOL ${event.userPoolId}]<Custom message not set for ${event.triggerSource}>`;
            emailMessage = '<Not set>'
        }

        // Customize messages for other user pools
        if (smsMessage) event.response.smsMessage = smsMessage;
        if (emailSubject) event.response.emailSubject = emailSubject;
        if (emailMessage) event.response.emailMessage = emailMessage;
        // Return to Amazon Cognito

        context.done(null, event);
        callback(null, event);
    } catch (error) {
        console.error(error);
        Sentry.captureException(error);
    }

};
