// Thin re-export: the Angel One MCP client now lives in the shared location
// .agents/shared/angelone so every LTS skill uses the same client and config.
module.exports = require('../../../../shared/angelone/client');
