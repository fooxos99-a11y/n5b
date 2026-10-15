const { appVariant } = require('./scripts/appVariant.cjs');

module.exports = ({ config }) => appVariant(config);
