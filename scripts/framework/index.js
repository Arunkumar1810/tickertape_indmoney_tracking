'use strict';

const yamlLoader = require('./yaml_loader');
const manifestValidator = require('./manifest_validator');
const contractValidator = require('./contract_validator');
const artifactHarness = require('./artifact_harness');
const authManager = require('./auth_manager');
const bankBalance = require('./bank_balance');
const xirrMath = require('./xirr_math');
const ledgerAggregator = require('./ledger_aggregator');
const frictionTracker = require('./friction_tracker');

module.exports = {
  ...yamlLoader,
  ...manifestValidator,
  ...contractValidator,
  ...artifactHarness,
  ...authManager,
  ...bankBalance,
  ...xirrMath,
  ...ledgerAggregator,
  ...frictionTracker
};
