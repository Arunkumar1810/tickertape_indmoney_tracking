'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getFxRate,
  blendSnapshots,
  toBlendedHoldingsContract,
  renderHtml,
  writeArtifacts,
  processStrategy,
  parseArgs
} = require('../scripts/fetch_strategy_stocks');

const {
  validateAccountHoldingsSnapshot,
  validateBlendedHoldings,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../../scripts/framework');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. parseArgs argument parsing', () => {
  const a1 = parseArgs(['--strategy', 'fundamental_foreign', '--refresh']);
  assert.equal(a1.strategy, 'fundamental_foreign');
  assert.equal(a1.refresh, true);

  const a2 = parseArgs(['--way', 'fundamental_lts', '--out', 'custom_reports']);
  assert.equal(a2.strategy, 'fundamental_lts');
  assert.equal(a2.out, 'custom_reports');

  const a3 = parseArgs(['fundamental_lts']);
  assert.equal(a3.strategy, 'fundamental_lts');

  const a4 = parseArgs(['--list']);
  assert.equal(a4.list, true);
});

test('2. getFxRate currency resolution and inverse pair calculation', () => {
  assert.equal(getFxRate('INR', 'INR'), 1.0);
  assert.equal(getFxRate('USD', 'USD'), 1.0);
  assert.equal(getFxRate('USD', 'INR', { USDINR: 87.20 }), 87.20);
  assert.equal(getFxRate('INR', 'USD', { USDINR: 87.20 }), 0.0115);
  assert.equal(getFxRate('USD', 'INR', { USDINR: 90.0 }), 90.0);
});

test('3. blendSnapshots multi-account consolidation, WAC calculation, and cash pooling', () => {
  const angelone = loadFixture('sample_angelone_holdings.json');
  const indmoney = loadFixture('sample_indmoney_holdings.json');

  const snapshot = blendSnapshots([angelone, indmoney], {
    strategyId: 'fundamental_lts',
    strategyTitle: 'Fundamental Long-Term Stocks (India)',
    baseCurrency: 'INR',
    fxRates: { USDINR: 87.20 }
  });

  assert.equal(snapshot.account_id, 'fundamental_lts');
  assert.equal(snapshot.broker, 'Strategy: Fundamental Long-Term Stocks (India)');
  assert.equal(snapshot.currency, 'INR');

  // Summary checks
  // Pooled cash: 25000 (Angel One) + 400 * 87.20 (INDmoney) = 25000 + 34880 = 59880
  assert.equal(snapshot.summary.available_cash, 59880.0);
  assert.equal(snapshot.summary.holdings_count, 3); // INFY, AAPL, TCS
  assert.equal(snapshot.margin.available_cash, 59880.0);
  assert.equal(snapshot.margin.net_margin, 59880.0);

  // Position aggregation & WAC check for INFY
  const infy = snapshot.holdings.find(p => p.ticker === 'INFY');
  assert.ok(infy, 'INFY holding must exist');
  assert.equal(infy.quantity, 125.0);
  assert.equal(infy.invested_value, 189240.0);
  assert.equal(infy.average_price, 1513.92);
  assert.equal(infy.cmp, 1806.24);
  assert.equal(infy.current_value, 225780.0);
  assert.equal(infy.unrealized_pnl, 36540.0);
  assert.equal(infy.unrealized_pnl_pct, 19.31);

  // Attribution tranches for INFY
  assert.equal(infy.attribution.length, 2);
  const angelLot = infy.attribution.find(a => a.account_id === 'angelone');
  const indLot = infy.attribution.find(a => a.account_id === 'indmoney_us');
  assert.ok(angelLot && indLot);
  assert.equal(angelLot.quantity, 100);
  assert.equal(angelLot.weight_in_position_pct, 80.0);
  assert.equal(indLot.quantity, 25);
  assert.equal(indLot.weight_in_position_pct, 20.0);

  // Canonical AccountHoldingsSnapshot contract validation
  const validation = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(validation.ok, true, `AccountHoldingsSnapshot validation failed: ${JSON.stringify(validation.errors)}`);

  // Downstream blended holdings contract validation
  const blendedContract = toBlendedHoldingsContract(snapshot);
  const blendedValidation = validateBlendedHoldings(blendedContract);
  assert.equal(blendedValidation.ok, true, `validateBlendedHoldings failed: ${JSON.stringify(blendedValidation.errors)}`);
});

test('4. renderHtml and self-containment check', () => {
  const angelone = loadFixture('sample_angelone_holdings.json');
  const snapshot = blendSnapshots([angelone], {
    strategyId: 'fundamental_lts',
    baseCurrency: 'INR'
  });

  const html = renderHtml(snapshot);
  assert.ok(html.includes('Strategy Holdings · fetch-strategy-stocks'), 'Must contain header title');
  assert.ok(!html.includes('/*__DATA__*/null'), 'Placeholder must be populated');

  const containment = verifyHtmlSelfContainment(html);
  assert.equal(containment.ok, true, `HTML self containment failed: ${JSON.stringify(containment.errors)}`);
});

test('5. writeArtifacts emits valid twin artifacts and passes universal verification harness', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch_strat_test_'));
  const angelone = loadFixture('sample_angelone_holdings.json');
  const snapshot = blendSnapshots([angelone], {
    strategyId: 'test_strategy',
    baseCurrency: 'INR'
  });

  const artifacts = writeArtifacts(snapshot, { outDir: tmpDir });
  assert.ok(fs.existsSync(artifacts.stratJson), 'Strategy JSON must exist');
  assert.ok(fs.existsSync(artifacts.stratHtml), 'Strategy HTML must exist');
  assert.ok(fs.existsSync(artifacts.accJson), 'Account JSON mirror must exist');
  assert.ok(fs.existsSync(artifacts.accHtml), 'Account HTML mirror must exist');

  const verifyRes = verifyArtifactPair({
    jsonPath: artifacts.stratJson,
    htmlPath: artifacts.stratHtml,
    schemaType: 'holdings'
  });
  assert.equal(verifyRes.ok, true, `Artifact verification failed: ${JSON.stringify(verifyRes.errors)}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('6. processStrategy executes strategy using manifest and existing account snapshots', async () => {
  const res = await processStrategy('lts');
  assert.equal(res.ok, true);
  assert.equal(res.snapshot.account_id, 'lts');
  assert.equal(res.snapshot.currency, 'INR');
  assert.ok(res.snapshot.holdings.length > 0, 'Must contain holdings for lts');
  assert.ok(fs.existsSync(res.artifacts.stratJson));
  assert.ok(fs.existsSync(res.artifacts.stratHtml));

  const validation = validateAccountHoldingsSnapshot(res.snapshot);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
});

