'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function findRepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) return curr;
    curr = path.dirname(curr);
  }
  return path.resolve(startDir, '../../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);

const {
  validateAccountHoldingsSnapshot,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

const {
  generateSnapshot,
  parseArgs,
  main
} = require('../scripts/fetch_angelone');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'sample_holdings.json');
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/fetch_angelone.js');

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

test('fetch_angelone: parseArgs defaults and CLI options', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.broker, 'angelone');
  assert.equal(defaults.refresh, false);
  assert.equal(defaults.only, null);
  assert.equal(defaults.jsonOutput, false);

  const custom = parseArgs([
    '--out', './tmp_out',
    '--only', 'itc',
    '--refresh',
    '--json-output'
  ]);
  assert.equal(custom.broker, 'angelone');
  assert.equal(custom.out, './tmp_out');
  assert.equal(custom.only, 'ITC');
  assert.equal(custom.refresh, true);
  assert.equal(custom.jsonOutput, true);
});

test('fetch_angelone: generateSnapshot creates schema-compliant AccountHoldingsSnapshot', () => {
  const rawData = loadFixture();
  const snapshot = generateSnapshot(rawData);

  assert.equal(snapshot.account_id, 'angelone');
  assert.equal(snapshot.broker, 'angelone');
  assert.equal(snapshot.currency, 'INR');
  assert.ok(snapshot.timestamp);
  assert.equal(snapshot.holdings.length, 3);

  // Summary checks
  const s = snapshot.summary;
  assert.equal(s.holdings_count, 3);
  assert.equal(s.available_cash, 12500.5);
  // Invested: 7797.23 + 5214.95 + 9500.0 = 22512.18
  assert.equal(s.total_invested, 22512.18);
  // Current: 7479.1 + 5769.0 + 10200.0 = 23448.1
  assert.equal(s.total_current_value, 23448.1);
  assert.equal(s.unrealized_pnl, 935.92);
  assert.equal(s.total_account_equity, 35948.6);
  assert.equal(s.funds_invested, 25000.0);
  assert.ok(typeof s.account_xirr === 'number', 'account_xirr must be a calculated number');
  assert.ok(Array.isArray(snapshot.ledger), 'ledger must be an array');
  assert.equal(snapshot.ledger.length, 2);

  // Margin checks
  const m = snapshot.margin;
  assert.equal(m.available_cash, 12500.5);
  assert.equal(m.collateral, 0);
  assert.equal(m.utilised, 0);
  assert.equal(m.net_margin, 12500.5);

  // Holdings checks (ordered descending by current value)
  assert.equal(snapshot.holdings[0].ticker, 'ZYDUSLIFE');
  assert.equal(snapshot.holdings[0].name, 'Zydus Lifesciences Ltd');
  assert.equal(snapshot.holdings[0].sector, 'Healthcare');
  assert.equal(snapshot.holdings[0].current_value, 10200.0);
  assert.equal(snapshot.holdings[0].fractional_shares, false);
  assert.equal(snapshot.holdings[0].buy_date, '2026-08-15');

  // Verify against canonical contract schema
  const validation = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
  assert.equal(validation.errors.length, 0);
});

test('fetch_angelone: generateSnapshot supports --only <ticker> filtering', () => {
  const rawData = loadFixture();
  const snapshot = generateSnapshot(rawData, { only: 'INFY' });

  assert.equal(snapshot.holdings.length, 1);
  assert.equal(snapshot.holdings[0].ticker, 'INFY');
  assert.equal(snapshot.holdings[0].quantity, 5);
  assert.equal(snapshot.holdings[0].current_value, 5769.0);
  assert.equal(snapshot.summary.holdings_count, 1);

  const validation = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(validation.ok, true);
});

test('fetch_angelone: main() writes accounts/angelone.json and accounts/angelone.html passing verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-angelone-test-'));

  try {
    const res = await main([
      '--out', tmpDir,
      '--mock-data', FIXTURE_PATH,
      '--json-output'
    ]);

    assert.equal(res.ok, true);

    const jsonPath = path.join(tmpDir, 'accounts', 'angelone.json');
    const htmlPath = path.join(tmpDir, 'accounts', 'angelone.html');

    assert.ok(fs.existsSync(jsonPath), 'accounts/angelone.json must exist');
    assert.ok(fs.existsSync(htmlPath), 'accounts/angelone.html must exist');

    // Also check top-level compatibility outputs
    assert.ok(fs.existsSync(path.join(tmpDir, 'angelone.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'angelone.html')));

    // Universal Verification Harness test
    const harnessResult = verifyArtifactPair({
      jsonPath,
      htmlPath,
      schemaType: 'holdings'
    });
    assert.equal(harnessResult.ok, true, `Harness errors: ${JSON.stringify(harnessResult.errors)}`);

    // Invariant 2: 100% offline self-containment check
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const selfContainment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(selfContainment.ok, true, `Errors found: ${JSON.stringify(selfContainment.errors)}`);
    assert.equal(selfContainment.errors.length, 0);

    // Verify presence of 2 donut charts: Stock Composition & Sector Composition
    assert.ok(htmlContent.includes('Stock Composition'), 'HTML must include Stock Composition chart');
    assert.ok(htmlContent.includes('Sector Composition'), 'HTML must include Sector Composition chart');
    assert.ok(htmlContent.includes('stockDonutSvg'), 'HTML must include stockDonutSvg element');
    assert.ok(htmlContent.includes('sectorDonutSvg'), 'HTML must include sectorDonutSvg element');

    // Verify Funds Invested, Account XIRR, and Bank Transactions Ledger modal
    assert.ok(htmlContent.includes('Funds Invested'), 'HTML must include Funds Invested card');
    assert.ok(htmlContent.includes('Account XIRR'), 'HTML must include Account XIRR card');
    assert.ok(htmlContent.includes('kpiFundsInvested'), 'HTML must include kpiFundsInvested element');
    assert.ok(htmlContent.includes('kpiAccountXirr'), 'HTML must include kpiAccountXirr element');
    assert.ok(htmlContent.includes('ledgerModal'), 'HTML must include ledgerModal popup element');
    assert.ok(htmlContent.includes('Bank Transactions Ledger'), 'HTML must include Bank Transactions Ledger modal');
    assert.ok(htmlContent.includes('openLedgerModal'), 'HTML must include openLedgerModal handler');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_angelone: CLI process execution with --json-output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-angelone-cli-test-'));

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--out', tmpDir,
        '--mock-data', FIXTURE_PATH,
        '--json-output'
      ],
      { encoding: 'utf8' }
    );

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.account_id, 'angelone');
    assert.equal(parsed.broker, 'angelone');
    assert.equal(parsed.currency, 'INR');
    assert.equal(parsed.summary.holdings_count, 3);
    assert.ok(fs.existsSync(parsed.artifacts.json));
    assert.ok(fs.existsSync(parsed.artifacts.html));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_angelone: CLI execution handles --only filter with no match', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-angelone-cli-nomatch-'));

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--out', tmpDir,
        '--mock-data', FIXTURE_PATH,
        '--only', 'NONEXISTENT',
        '--json-output'
      ],
      { encoding: 'utf8' }
    );

    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /No holding found/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_angelone: rejects unknown options', () => {
  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--broker', 'zerodha'],
    { encoding: 'utf8' }
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Unknown option: --broker/);
});

test('fetch_angelone: cached snapshot fallback renders warning banner and passes verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-angelone-cache-test-'));
  const cachedFixture = path.join(tmpDir, 'cached_fixture.json');

  try {
    const raw = loadFixture();
    fs.writeFileSync(cachedFixture, JSON.stringify({
      ...raw,
      _is_cached: true,
      _cached_at: '2026-10-25T14:30:00.000Z'
    }, null, 2), 'utf8');

    const result = await main([
      '--out', tmpDir,
      '--mock-data', cachedFixture
    ]);

    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.jsonPath));
    assert.ok(fs.existsSync(result.htmlPath));

    const html = fs.readFileSync(result.htmlPath, 'utf8');
    assert.match(html, /class="cache-warning-banner"/);
    assert.match(html, /2026-10-25T14:30:00\.000Z/);
    assert.match(html, /\[WARNING\] Cached Snapshot Active:/);

    // Verify via artifact harness with strict 0 external network leaks
    const harnessRes = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'holdings'
    });
    assert.equal(harnessRes.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

