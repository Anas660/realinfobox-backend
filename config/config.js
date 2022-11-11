const config = require('./config.json');
const defaultConfig = config.dev;
const environment = process.env.NODE_ENV || 'dev';
const environmentConfig = config[environment];
const finalConfig = {...defaultConfig, ...environmentConfig};

// as a best practice
// all global variables should be referenced via global. syntax
// and their names should always begin with g
global.gConfig = finalConfig;
