 const Groups = {
    CLIENTS: 'clients',
    DEMOS: 'demo',
    ADMINS: 'admins',
    EDITORS: 'editors',
    SUPERADMINS: 'superadmins',
    USERS: 'users',
}

const Statistic = {
    PK_PART: "STATISTIC|",

    NEW_CLIENT:  'NEW_CLIENT',

    CLIENT_STATUS_CONFIRMED:  'CLIENT_STATUS_CONFIRMED',
    CLIENT_STATUS_FORCE_CHANGE_PASSWORD:  'CLIENT_STATUS_FORCE_CHANGE_PASSWORD',

    CLIENT_EMAIL_VERIFIED:  'CLIENT_EMAIL_VERIFIED',
    CLIENT_EMAIL_NOT_VERIFIED:  'CLIENT_EMAIL_NOT_VERIFIED',

    CLIENT_ENABLED:  'CLIENT_ENABLED',
    CLIENT_DISABLED:  'CLIENT_DISABLED',

    CLIENT_ADD_PRODUCT: 'CLIENT_ADD_PRODUCT',

    NEW_DEMO:  'NEW_DEMO',

    DEMO_STATUS_CONFIRMED:  'DEMO_STATUS_CONFIRMED',
    DEMO_STATUS_FORCE_CHANGE_PASSWORD:  'DEMO_STATUS_FORCE_CHANGE_PASSWORD',

    DEMO_EMAIL_VERIFIED:  'DEMO_EMAIL_VERIFIED',
    DEMO_EMAIL_NOT_VERIFIED:  'DEMO_EMAIL_NOT_VERIFIED',

    DEMO_ENABLED:  'DEMO_ENABLED',
    DEMO_DISABLED:  'DEMO_DISABLED',

    DEMO_ADD_PRODUCT: 'DEMO_ADD_PRODUCT',

    USER_SIGN_IN:  'USER_SIGN_IN',
    USER_REFRESH_TOKEN:  'CLIENT_REFRESH_TOKEN',
    USER_SIGN_OUT:  'CLIENT_SIGN_OUT',
}

module.exports = {
    Groups,
    Statistic,
}