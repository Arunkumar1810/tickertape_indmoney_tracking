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
} = require('../scripts/fetch_indmoney_us');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'sample_us_holdings.json');
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/fetch_indmoney_us.js');

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

test('fetch_indmoney_us: parseArgs defaults and CLI options', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.broker, 'indmoney');
  assert.equal(defaults.refresh, false);
  assert.equal(defaults.login, false);
  assert.equal(defaults.noBrowser, false);
  assert.equal(defaults.authOnly, false);
  assert.equal(defaults.only, null);
  assert.equal(defaults.jsonOutput, false);

  const custom = parseArgs([
    '--broker', 'indmoney',
    '--out', './tmp_reports',
    '--only', 'aapl',
    '--refresh',
    '--login',
    '--no-browser',
    '--auth-only',
    '--mock-data', './mock.json',
    '--json-output'
  ]);
  assert.equal(custom.broker, 'indmoney');
  assert.equal(custom.out, './tmp_reports');
  assert.equal(custom.only, 'AAPL');
  assert.equal(custom.refresh, true);
  assert.equal(custom.login, true);
  assert.equal(custom.noBrowser, true);
  assert.equal(custom.authOnly, true);
  assert.equal(custom.mockData, './mock.json');
  assert.equal(custom.jsonOutput, true);
});

test('fetch_indmoney_us: generateSnapshot creates canonical AccountHoldingsSnapshot with fractional shares', () => {
  const rawData = loadFixture();
  const { snapshot, usdToInr } = generateSnapshot(rawData);

  assert.equal(snapshot.account_id, 'indmoney_us');
  assert.equal(snapshot.broker, 'indmoney');
  assert.equal(snapshot.currency, 'USD');
  assert.ok(snapshot.timestamp);
  assert.equal(usdToInr, 87.20);
  assert.equal(snapshot.holdings.length, 3);

  // Summary checks
  const s = snapshot.summary;
  assert.equal(s.holdings_count, 3);
  assert.equal(s.available_cash, 320.50);
  // Invested: 2280.00 + 2721.60 + 2400.00 = 7401.60
  assert.equal(s.total_invested, 7401.60);
  // Current: 2938.75 + 3428.80 + 2650.00 = 9017.55
  assert.equal(s.total_current_value, 9017.55);
  assert.equal(s.unrealized_pnl, 1615.95);
  assert.equal(s.total_account_equity, 9338.05);

  // Margin checks
  const m = snapshot.margin;
  assert.equal(m.available_cash, 320.50);
  assert.equal(m.collateral, 0);
  assert.equal(m.utilised, 0);
  assert.equal(m.net_margin, 320.50);

  // Sorted descending by current value (MSFT: 3428.80, AAPL: 2938.75, VOO: 2650.00)
  assert.equal(snapshot.holdings[0].ticker, 'MSFT');
  assert.equal(snapshot.holdings[0].fractional_shares, false);

  assert.equal(snapshot.holdings[1].ticker, 'AAPL');
  assert.equal(snapshot.holdings[1].quantity, 12.5);
  assert.equal(snapshot.holdings[1].fractional_shares, true);
  assert.equal(snapshot.holdings[1].exchange, 'NASDAQ');

  assert.equal(snapshot.holdings[2].ticker, 'VOO');
  assert.equal(snapshot.holdings[2].exchange, 'NYSE');

  // Verify against canonical JSON schema
  const validation = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
  assert.equal(validation.errors.length, 0);
});

test('fetch_indmoney_us: generateSnapshot supports --only <ticker> filtering', () => {
  const rawData = loadFixture();
  const { snapshot } = generateSnapshot(rawData, { only: 'AAPL' });

  assert.equal(snapshot.holdings.length, 1);
  assert.equal(snapshot.holdings[0].ticker, 'AAPL');
  assert.equal(snapshot.holdings[0].quantity, 12.5);
  assert.equal(snapshot.summary.holdings_count, 1);

  const validation = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(validation.ok, true);
});

test('fetch_indmoney_us: main() writes accounts/indmoney_us.json and accounts/indmoney_us.html passing verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-indmoney-test-'));

  try {
    const res = await main([
      '--broker', 'indmoney',
      '--out', tmpDir,
      '--mock-data', FIXTURE_PATH,
      '--json-output'
    ]);

    assert.equal(res.ok, true);

    const jsonPath = path.join(tmpDir, 'accounts', 'indmoney_us.json');
    const htmlPath = path.join(tmpDir, 'accounts', 'indmoney_us.html');

    assert.ok(fs.existsSync(jsonPath), 'accounts/indmoney_us.json must exist');
    assert.ok(fs.existsSync(htmlPath), 'accounts/indmoney_us.html must exist');

    // Compatibility files
    assert.ok(fs.existsSync(path.join(tmpDir, 'indmoney_us.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'indmoney_us.html')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'indmoney-us-stocks.json')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'indmoney-us-stocks.html')));

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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_indmoney_us: CLI process execution with --json-output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-indmoney-cli-test-'));

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--broker', 'indmoney',
        '--out', tmpDir,
        '--mock-data', FIXTURE_PATH,
        '--json-output'
      ],
      { encoding: 'utf8' }
    );

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.account_id, 'indmoney_us');
    assert.equal(parsed.broker, 'indmoney');
    assert.equal(parsed.currency, 'USD');
    assert.equal(parsed.summary.holdings_count, 3);
    assert.equal(parsed.usd_to_inr, 87.20);
    assert.ok(fs.existsSync(parsed.artifacts.json));
    assert.ok(fs.existsSync(parsed.artifacts.html));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_indmoney_us: CLI execution handles --only filter with no match', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-indmoney-cli-nomatch-'));

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--broker', 'indmoney',
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

test('fetch_indmoney_us: rejects unsupported broker', () => {
  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--broker', 'zerodha'],
    { encoding: 'utf8' }
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Unsupported broker "zerodha"/);
});

test('fetch_indmoney_us: cached snapshot fallback renders warning banner and passes verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-indmoney-cache-test-'));
  const cachedFixture = path.join(tmpDir, 'cached_us_fixture.json');

  try {
    const raw = loadFixture();
    fs.writeFileSync(cachedFixture, JSON.stringify({
      ...raw,
      _is_cached: true,
      _cached_at: '2026-10-25T16:00:00.000Z'
    }, null, 2), 'utf8');

    const result = await main([
      '--broker', 'indmoney',
      '--out', tmpDir,
      '--mock-data', cachedFixture
    ]);

    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.jsonPath));
    assert.ok(fs.existsSync(result.htmlPath));

    const html = fs.readFileSync(result.htmlPath, 'utf8');
    assert.match(html, /class="cache-warning-banner"/);
    assert.match(html, /2026-10-25T16:00:00\.000Z/);
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


