'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const {
  parseYamlOrJson,
  loadManifestFile,
  validateManifestObject,
  validateManifestFile
} = require('../index');

const DEFAULT_MANIFEST_PATH = fs.existsSync(path.resolve(__dirname, '../../../config/investment_ways.yaml'))
  ? path.resolve(__dirname, '../../../config/investment_ways.yaml')
  : path.resolve(__dirname, '../../../../config/investment_ways.yaml');
const VALIDATOR_CLI_PATH = path.resolve(__dirname, '../manifest_validator.js');

function cloneDefaultManifest() {
  return JSON.parse(JSON.stringify(loadManifestFile(DEFAULT_MANIFEST_PATH)));
}

test('YAML Loader parses default config/investment_ways.yaml accurately', () => {
  const manifest = loadManifestFile(DEFAULT_MANIFEST_PATH);
  assert.equal(manifest.version, '1.0');
  assert.ok(manifest.accounts.angelone);
  assert.ok(manifest.accounts.indmoney_us);
  assert.equal(manifest.accounts.angelone.currency, 'INR');
  assert.equal(manifest.accounts.indmoney_us.currency, 'USD');
  assert.deepEqual(manifest.investment_ways.fundamental_lts.accounts, ['angelone']);
  assert.deepEqual(manifest.investment_ways.fundamental_foreign.accounts, ['indmoney_us']);
});

test('YAML Loader parses JSON and strips inline comments outside quotes', () => {
  const sample = `
# Header comment
version: "1.0" # inline comment
name: "value # not a comment"
items:
  - "alpha" # item 1
  - "beta"
flags: [true, false]
`;
  const parsed = parseYamlOrJson(sample);
  assert.equal(parsed.version, '1.0');
  assert.equal(parsed.name, 'value # not a comment');
  assert.deepEqual(parsed.items, ['alpha', 'beta']);
  assert.deepEqual(parsed.flags, [true, false]);
});

test('Scenario: Load default manifest and pass unique account partition check', () => {
  const result = validateManifestFile(DEFAULT_MANIFEST_PATH);
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.assignedAccounts, 2);
  assert.deepEqual(result.summary.accountPartition, {
    angelone: 'fundamental_lts',
    indmoney_us: 'fundamental_foreign'
  });
});

test('Scenario: Missing manifest file returns ERR_MANIFEST_NOT_FOUND', () => {
  const result = validateManifestFile(path.join(__dirname, 'non_existent_manifest.yaml'));
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'ERR_MANIFEST_NOT_FOUND');
});

test('Scenario: Duplicate account assigned to two investment ways fails with ERR_ACCOUNT_PARTITION_COLLISION', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.swing_trading = {
    title: 'Swing Trading',
    skill: 'way-swing',
    base_currency: 'INR',
    accounts: ['angelone'],
    data_provider: 'provider-tickertape',
    gatekeepers: [],
    analysis_principles: ['analyze-graham'],
    weights: { 'analyze-graham': 1.0 }
  };

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const collision = result.errors.find((e) => e.code === 'ERR_ACCOUNT_PARTITION_COLLISION');
  assert.ok(collision, 'Expected ERR_ACCOUNT_PARTITION_COLLISION');
  assert.match(collision.message, /angelone/);
  assert.match(collision.message, /fundamental_lts/);
  assert.match(collision.message, /swing_trading/);
});

test('Scenario: Duplicate account within the same investment way fails with ERR_DUPLICATE_ACCOUNT_IN_WAY', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.fundamental_lts.accounts = ['angelone', 'angelone'];

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const dup = result.errors.find((e) => e.code === 'ERR_DUPLICATE_ACCOUNT_IN_WAY');
  assert.ok(dup, 'Expected ERR_DUPLICATE_ACCOUNT_IN_WAY');
});

test('Scenario: Unregistered account referenced by an investment way fails with ERR_UNKNOWN_ACCOUNT', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.fundamental_lts.accounts = ['angelone', 'zerodha_main'];

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const unknown = result.errors.find((e) => e.code === 'ERR_UNKNOWN_ACCOUNT');
  assert.ok(unknown, 'Expected ERR_UNKNOWN_ACCOUNT');
  assert.match(unknown.message, /zerodha_main/);
});

test('Scenario: Registered account left unassigned fails with ERR_ORPHAN_ACCOUNT', () => {
  const manifest = cloneDefaultManifest();
  manifest.accounts.zerodha_huf = {
    broker: 'zerodha',
    currency: 'INR',
    skill: 'fetch-zerodha',
    active: true
  };

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const orphan = result.errors.find((e) => e.code === 'ERR_ORPHAN_ACCOUNT');
  assert.ok(orphan, 'Expected ERR_ORPHAN_ACCOUNT');
  assert.match(orphan.message, /zerodha_huf/);
});

test('Scenario: Investment way with empty accounts list fails with ERR_EMPTY_ACCOUNTS', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.fundamental_lts.accounts = [];

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const emptyErr = result.errors.find((e) => e.code === 'ERR_EMPTY_ACCOUNTS');
  assert.ok(emptyErr, 'Expected ERR_EMPTY_ACCOUNTS');
});

test('Scenario: Unknown analysis principle, provider, or gatekeeper fails validation', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.fundamental_lts.analysis_principles.push('analyze-momentum');
  manifest.investment_ways.fundamental_lts.weights['analyze-momentum'] = 0.0;
  manifest.investment_ways.fundamental_lts.data_provider = 'provider-unknown';
  manifest.investment_ways.fundamental_lts.gatekeepers = ['unknown-gatekeeper'];

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === 'ERR_UNKNOWN_PRINCIPLE'));
  assert.ok(result.errors.some((e) => e.code === 'ERR_UNKNOWN_PROVIDER'));
  assert.ok(result.errors.some((e) => e.code === 'ERR_UNKNOWN_GATEKEEPER'));
});

test('Scenario: Weights do not sum to 1.0 fails with ERR_WEIGHT_SUM_MISMATCH', () => {
  const manifest = cloneDefaultManifest();
  manifest.investment_ways.fundamental_lts.weights = {
    'analyze-graham': 0.25,
    'analyze-lynch': 0.25,
    'analyze-buffett-munger': 0.20,
    'analyze-klarman-solvency': 0.15
  };

  const result = validateManifestObject(manifest);
  assert.equal(result.ok, false);
  const weightErr = result.errors.find((e) => e.code === 'ERR_WEIGHT_SUM_MISMATCH');
  assert.ok(weightErr, 'Expected ERR_WEIGHT_SUM_MISMATCH');
  assert.match(weightErr.message, /0\.85/);
});

test('Scenario: CLI validation output and exit codes (--json on valid and invalid manifests)', () => {
  // Valid CLI run
  const validProc = spawnSync(
    process.execPath,
    [VALIDATOR_CLI_PATH, '--config', DEFAULT_MANIFEST_PATH, '--json'],
    { encoding: 'utf8' }
  );
  assert.equal(validProc.status, 0);
  const validJson = JSON.parse(validProc.stdout);
  assert.equal(validJson.ok, true);
  assert.equal(validJson.errors.length, 0);

  // Invalid CLI run with duplicate account collision
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  const invalidPath = path.join(tmpDir, 'invalid_manifest.json');
  const badManifest = cloneDefaultManifest();
  badManifest.investment_ways.fundamental_foreign.accounts = ['angelone', 'indmoney_us'];
  fs.writeFileSync(invalidPath, JSON.stringify(badManifest, null, 2), 'utf8');

  try {
    const invalidProc = spawnSync(
      process.execPath,
      [VALIDATOR_CLI_PATH, '--config', invalidPath, '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(invalidProc.status, 1);
    const invalidJson = JSON.parse(invalidProc.stdout);
    assert.equal(invalidJson.ok, false);
    assert.ok(
      invalidJson.errors.some((e) => e.code === 'ERR_ACCOUNT_PARTITION_COLLISION'),
      'Expected ERR_ACCOUNT_PARTITION_COLLISION in CLI JSON output'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

