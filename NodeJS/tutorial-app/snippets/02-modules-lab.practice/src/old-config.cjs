// CommonJS can require() JSON directly: no import attribute needed.
const config = require('./config.json');

function describe() {
  return `${config.appName} shows at most ${config.maxItems} items`;
}

module.exports = { describe };
