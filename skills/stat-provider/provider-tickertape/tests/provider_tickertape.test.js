'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  validateNormalizedFinancials,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../../scripts/framework');

const {
  inferMarket,
  main,
  normalizeFinancials,
  parseArgs,
  processTicker
} = require('../scripts/provider_tickertape');

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const FIXTURE_IN = path.join(FIXTURES_DIR, 'sample_in_financials.json');
const FIXTURE_US = path.join(FIXTURES_DIR, 'sample_us_financials.json');
const FIXTURE_ETF = path.join(FIXTURES_DIR, 'sample_etf_financials.json');
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/provider_tickertape.js');
const TEMPLATE_PATH = path.resolve(__dirname, '../assets/financials-template.html');

test('provider_tickertape: parseArgs flags and defaults', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.ticker, null);
  assert.equal(defaults.market, null);
  assert.equal(defaults.holdings, null);
  assert.equal(defaults.refresh, false);
  assert.equal(defaults.jsonOutput, false);

  const custom = parseArgs([
    '--ticker', 'infy',
    '--market', 'in',
    '--out', './custom_out',
    '--refresh',
    '--mock-data', './fixture.json',
    '--json-output'
  ]);
  assert.equal(custom.ticker, 'INFY');
  assert.equal(custom.market, 'IN');
  assert.equal(custom.out, './custom_out');
  assert.equal(custom.refresh, true);
  assert.equal(custom.mockData, './fixture.json');
  assert.equal(custom.jsonOutput, true);
});

test('provider_tickertape: inferMarket distinguishes domestic vs foreign vs ETF', () => {
  assert.equal(inferMarket('INFY'), 'IN');
  assert.equal(inferMarket('TCS'), 'IN');
  assert.equal(inferMarket('AAPL'), 'US');
  assert.equal(inferMarket('MSFT'), 'US');
  assert.equal(inferMarket('VOO'), 'US');
  assert.equal(inferMarket('QQQ'), 'US');
  assert.equal(inferMarket('ANYTHING', 'US'), 'US');
  assert.equal(inferMarket('ANYTHING', 'IN'), 'IN');
});

test('provider_tickertape: normalizeFinancials Indian equity (IN/INR/CRORES)', () => {
  const rawData = JSON.parse(fs.readFileSync(FIXTURE_IN, 'utf8'));
  const normalized = normalizeFinancials(rawData, 'INFY', 'IN');

  assert.equal(normalized.ticker, 'INFY');
  assert.equal(normalized.market, 'IN');
  assert.equal(normalized.currency, 'INR');
  assert.equal(normalized.unit_scale, 'CRORES');
  assert.equal(normalized.is_index_etf, false);
  assert.equal(normalized.source_provider, 'tickertape');

  assert.ok(normalized.market_data.cmp > 0);
  assert.ok(normalized.income_statement.revenue > 0);
  assert.ok(normalized.balance_sheet.total_assets > 0);
  assert.ok(normalized.cash_flow.operating_cash_flow > 0);
  assert.equal(normalized.forensics.promoter_holding_pct, 14.8);

  const validation = validateNormalizedFinancials(normalized);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
});

test('provider_tickertape: normalizeFinancials US equity (US/USD/MILLIONS)', () => {
  const rawData = JSON.parse(fs.readFileSync(FIXTURE_US, 'utf8'));
  const normalized = normalizeFinancials(rawData, 'AAPL', 'US');

  assert.equal(normalized.ticker, 'AAPL');
  assert.equal(normalized.market, 'US');
  assert.equal(normalized.currency, 'USD');
  assert.equal(normalized.unit_scale, 'MILLIONS');
  assert.equal(normalized.is_index_etf, false);

  assert.ok(normalized.market_data.cmp > 0);
  assert.ok(normalized.income_statement.net_income > 0);
  assert.ok(normalized.balance_sheet.cash_and_equivalents > 0);
  assert.ok(normalized.cash_flow.free_cash_flow > 0);

  const validation = validateNormalizedFinancials(normalized);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
});

test('provider_tickertape: normalizeFinancials Index ETF bypasses statement constraints', () => {
  const rawData = JSON.parse(fs.readFileSync(FIXTURE_ETF, 'utf8'));
  const normalized = normalizeFinancials(rawData, 'VOO', 'US');

  assert.equal(normalized.ticker, 'VOO');
  assert.equal(normalized.market, 'US');
  assert.equal(normalized.currency, 'USD');
  assert.equal(normalized.is_index_etf, true);

  assert.equal(normalized.income_statement, null);
  assert.equal(normalized.balance_sheet, null);
  assert.equal(normalized.cash_flow, null);
  assert.equal(normalized.forensics, null);

  const validation = validateNormalizedFinancials(normalized);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
});

test('provider_tickertape: processTicker writes verified JSON & offline HTML artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-tickertape-test-'));
  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  try {
    const res = await processTicker('INFY', 'IN', {
      outDir: tmpDir,
      mockData: FIXTURE_IN,
      templateHtml
    });

    assert.equal(res.ok, true);
    assert.equal(res.ticker, 'INFY');

    const jsonPath = path.join(tmpDir, 'financials', 'INFY.json');
    const htmlPath = path.join(tmpDir, 'financials', 'INFY.html');

    assert.ok(fs.existsSync(jsonPath), 'financials/INFY.json must exist');
    assert.ok(fs.existsSync(htmlPath), 'financials/INFY.html must exist');

    // Verification harness check
    const harnessResult = verifyArtifactPair({
      jsonPath,
      htmlPath,
      schemaType: 'financials'
    });
    assert.equal(harnessResult.ok, true, `Harness errors: ${JSON.stringify(harnessResult.errors)}`);

    // Invariant 2: 100% offline self-containment check
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const selfContainment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(selfContainment.ok, true, `Errors found: ${JSON.stringify(selfContainment.errors)}`);
    assert.equal(selfContainment.errors.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('provider_tickertape: CLI execution single ticker with --json-output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-cli-test-'));

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--ticker', 'AAPL',
        '--market', 'US',
        '--out', tmpDir,
        '--mock-data', FIXTURE_US,
        '--json-output'
      ],
      { encoding: 'utf8' }
    );

    assert.equal(res.status, 0, `CLI failed with stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.processedCount, 1);
    assert.equal(parsed.artifacts[0].ticker, 'AAPL');
    assert.equal(parsed.artifacts[0].market, 'US');
    assert.ok(fs.existsSync(parsed.artifacts[0].json));
    assert.ok(fs.existsSync(parsed.artifacts[0].html));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('provider_tickertape: CLI batch ingestion from --holdings snapshot', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-holdings-test-'));

  // Create temporary holdings snapshot
  const mockSnapshot = {
    account_id: 'angelone',
    broker: 'angelone',
    currency: 'INR',
    timestamp: '2026-11-07T12:00:00.000Z',
    summary: {
      total_invested: 10000,
      total_current_value: 11000,
      unrealized_pnl: 1000,
      unrealized_pnl_pct: 10,
      available_cash: 500,
      total_account_equity: 11500,
      holdings_count: 2
    },
    margin: {
      available_cash: 500,
      collateral: 0,
      utilised: 0,
      net_margin: 500
    },
    holdings: [
      {
        ticker: 'INFY',
        name: 'Infosys Ltd',
        isin: 'INE009A01021',
        exchange: 'NSE',
        quantity: 10,
        average_price: 1000,
        cmp: 1100,
        invested_value: 10000,
        current_value: 11000,
        unrealized_pnl: 1000,
        unrealized_pnl_pct: 10,
        weight_pct: 100
      }
    ]
  };

  const holdingsPath = path.join(tmpDir, 'mock_holdings.json');
  fs.writeFileSync(holdingsPath, JSON.stringify(mockSnapshot, null, 2), 'utf8');

  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--holdings', holdingsPath,
        '--out', tmpDir,
        '--mock-data', FIXTURE_IN,
        '--json-output'
      ],
      { encoding: 'utf8' }
    );

    assert.equal(res.status, 0, `CLI failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.processedCount, 1);
    assert.equal(parsed.artifacts[0].ticker, 'INFY');
    assert.ok(fs.existsSync(path.join(tmpDir, 'financials', 'INFY.json')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('provider_tickertape: CLI fails without --ticker or --holdings', () => {
  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--market', 'IN'],
    { encoding: 'utf8' }
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Must specify either --ticker/);
});

test('provider_tickertape: cached snapshot fallback renders warning banner and passes verification', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-cache-test-'));
  const cachedFixture = path.join(tmpDir, 'cached_financials.json');

  try {
    const raw = JSON.parse(fs.readFileSync(FIXTURE_IN, 'utf8'));
    fs.writeFileSync(cachedFixture, JSON.stringify({
      ...raw,
      _is_cached: true,
      _cached_at: '2026-10-25T11:00:00.000Z'
    }, null, 2), 'utf8');

    const result = await main([
      '--ticker', 'INFY',
      '--market', 'IN',
      '--out', tmpDir,
      '--mock-data', cachedFixture
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    const item = result.results[0];
    assert.ok(fs.existsSync(item.jsonPath));
    assert.ok(fs.existsSync(item.htmlPath));

    const html = fs.readFileSync(item.htmlPath, 'utf8');
    assert.match(html, /class="cache-warning-banner"/);
    assert.match(html, /2026-10-25T11:00:00\.000Z/);
    assert.match(html, /\[WARNING\] Cached Snapshot Active:/);

    // Verify via artifact harness with strict 0 external network leaks
    const harnessRes = verifyArtifactPair({
      jsonPath: item.jsonPath,
      htmlPath: item.htmlPath,
      schemaType: 'financials'
    });
    assert.equal(harnessRes.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});


