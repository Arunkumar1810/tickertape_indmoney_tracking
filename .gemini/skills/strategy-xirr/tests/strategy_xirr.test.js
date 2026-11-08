'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateStrategyXirr,
  renderHtml,
  writeArtifacts,
  processLedgers,
  processStrategyWay,
  parseArgs
} = require('../scripts/strategy_xirr');

const { calculateXirr, evalNpv, solveBisection } = require('../scripts/lib/xirr_math');
const { aggregateAccountLedgers, resolveFxRate } = require('../scripts/lib/ledger_aggregator');
const { calculateFrictionBreakdown } = require('../scripts/lib/friction_tracker');

const {
  validateStrategyXirr,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../shared/framework');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. xirr_math: Exact mathematical convergence with known cashflow stream', () => {
  // Test case: -100,000 on 2024-01-01, +110,000 on 2025-01-01 (exactly 366 days, ~10% annual return)
  const cashflows = [
    { date: '2024-01-01', amount: -100000.0 },
    { date: '2025-01-01', amount: 110000.0 }
  ];

  const result = calculateXirr(cashflows);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.is_sub_annual, false);
  assert.equal(result.days_held, 366);
  assert.equal(result.absolute_return, 10.0);
  assert.ok(result.xirr_annualized >= 9.9 && result.xirr_annualized <= 10.1);
});

test('2. xirr_math: Sub-90-day guardrail suppression', () => {
  // Test case: -100,000 on 2025-01-01, +105,000 on 2025-01-21 (20 days)
  const cashflows = [
    { date: '2025-01-01', amount: -100000.0 },
    { date: '2025-01-21', amount: 105000.0 }
  ];

  const result = calculateXirr(cashflows, { subAnnualDaysThreshold: 90 });
  assert.equal(result.status, 'SUB_ANNUAL');
  assert.equal(result.is_sub_annual, true);
  assert.equal(result.xirr, null);
  assert.equal(result.xirr_annualized, null);
  assert.equal(result.days_held, 20);
  assert.equal(result.absolute_return, 5.0);
});

test('3. xirr_math: Edge cases (single sign, insufficient data)', () => {
  // All deposits
  const allNeg = [
    { date: '2025-01-01', amount: -10000 },
    { date: '2025-02-01', amount: -20000 }
  ];
  const resNeg = calculateXirr(allNeg);
  assert.equal(resNeg.status, 'INVALID_SIGNS');

  // Insufficient items
  const single = [{ date: '2025-01-01', amount: -10000 }];
  const resSingle = calculateXirr(single);
  assert.equal(resSingle.status, 'INSUFFICIENT_DATA');
});

test('4. ledger_aggregator: FX resolution and inverse lookup', () => {
  assert.equal(resolveFxRate('INR', 'INR'), 1.0);
  assert.equal(resolveFxRate('USD', 'USD'), 1.0);
  assert.equal(resolveFxRate('USD', 'INR', { 'USD/INR': 87.2 }), 87.2);
  const inv = resolveFxRate('INR', 'USD', { 'USD/INR': 87.2 });
  assert.equal(inv, 0.0115);
});

test('5. ledger_aggregator: Internal transfer cancellation and multi-currency normalization', () => {
  const angelone = loadFixture('sample_angelone_ledger.json');
  const indmoney = loadFixture('sample_indmoney_ledger.json');

  const agg = aggregateAccountLedgers([angelone, indmoney], {
    strategyId: 'fundamental_lts',
    baseCurrency: 'INR',
    terminalEquity: 345000.0,
    evalDate: '2025-09-15',
    customFxRates: { 'USD/INR': 87.2 }
  });

  // Verify internal transfer cancellation: 50,000 INR transfer was netted out on both accounts
  const angelSummary = agg.account_cashflows_summary.find(s => s.account_id === 'angelone_demat');
  const indSummary = agg.account_cashflows_summary.find(s => s.account_id === 'indmoney_us');
  assert.ok(angelSummary && indSummary);
  assert.equal(angelSummary.internal_transfers_netted_base, 50000.0);
  assert.equal(indSummary.internal_transfers_netted_base, 50000.0);

  // Verify external cashflows do not contain the canceled transfer
  const trfEntries = agg.cashflows.filter(c => c.category === 'INTERNAL_TRANSFER');
  assert.equal(trfEntries.length, 0);

  // Terminal equity injected
  const terminalCf = agg.cashflows.find(c => c.category === 'TERMINAL_EQUITY');
  assert.ok(terminalCf);
  assert.equal(terminalCf.amount, 345000.0);
  assert.equal(terminalCf.date, '2025-09-15');
});

test('6. friction_tracker: Itemized friction and return drag percentage', () => {
  const angelone = loadFixture('sample_angelone_ledger.json');
  const indmoney = loadFixture('sample_indmoney_ledger.json');

  const friction = calculateFrictionBreakdown([angelone, indmoney], {
    baseCurrency: 'INR',
    customFxRates: { 'USD/INR': 87.2 },
    netInvested: 243276.0
  });

  // Brokerage: 1200 + 15 * 87.2 = 1200 + 1308 = 2508
  assert.equal(friction.brokerage, 2508.0);
  // STT: 850
  assert.equal(friction.stt, 850.0);
  // FX drag: 0 + 25 * 87.2 = 2180
  assert.equal(friction.fx_drag, 2180.0);
  // Taxes: 550 + 5 * 87.2 = 986
  assert.equal(friction.taxes_and_charges, 986.0);
  // Total friction: 2508 + 850 + 2180 + 986 = 6524
  assert.equal(friction.total_friction, 6524.0);
  // Friction drag pct: (6524 / 243276) * 100 = 2.68%
  assert.equal(friction.friction_drag_pct, 2.68);
});

test('7. calculateStrategyXirr: Full contract generation and schema validation', () => {
  const angelone = loadFixture('sample_angelone_ledger.json');
  const indmoney = loadFixture('sample_indmoney_ledger.json');

  const report = calculateStrategyXirr([angelone, indmoney], {
    strategyId: 'fundamental_lts',
    baseCurrency: 'INR',
    terminalEquity: 345000.0,
    evalDate: '2025-09-15',
    fxRates: { 'USD/INR': 87.2 }
  });

  const validation = validateStrategyXirr(report);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
  assert.equal(report.strategy_id, 'fundamental_lts');
  assert.equal(report.base_currency, 'INR');
  assert.equal(report.days_held, 243);
  assert.equal(report.is_sub_annual, false);
  assert.equal(report.xirr_annualized, 62.88);
  assert.equal(report.absolute_return, 35.42);
});

test('8. renderHtml and writeArtifacts: Self-contained offline dashboard verification', () => {
  const angelone = loadFixture('sample_angelone_ledger.json');
  const indmoney = loadFixture('sample_indmoney_ledger.json');

  const report = calculateStrategyXirr([angelone, indmoney], {
    strategyId: 'fundamental_lts',
    baseCurrency: 'INR',
    terminalEquity: 345000.0,
    evalDate: '2025-09-15',
    fxRates: { 'USD/INR': 87.2 }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-xirr-test-'));
  const artifacts = writeArtifacts(report, tempDir);

  assert.equal(artifacts.verified, true);
  assert.ok(fs.existsSync(artifacts.jsonPath));
  assert.ok(fs.existsSync(artifacts.htmlPath));

  // Verify HTML has zero external leaks
  const htmlContent = fs.readFileSync(artifacts.htmlPath, 'utf8');
  const htmlRes = verifyHtmlSelfContainment(htmlContent);
  assert.equal(htmlRes.ok, true);
  assert.equal(htmlRes.summary.externalLeaksCount, 0);

  // Clean up temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('9. parseArgs: CLI parameter parsing', () => {
  const argv = [
    '--ledgers', 'acc1.json', 'acc2.json',
    '--blended', 'blended.json',
    '--base-currency', 'usd',
    '--fx', 'USDINR=87.20',
    '--out', 'output_dir',
    '--json-output'
  ];

  const parsed = parseArgs(argv);
  assert.deepEqual(parsed.ledgers, ['acc1.json', 'acc2.json']);
  assert.equal(parsed.blended, 'blended.json');
  assert.equal(parsed.baseCurrency, 'USD');
  assert.equal(parsed.fxRates['USDINR'], 87.20);
  assert.equal(parsed.out, 'output_dir');
  assert.equal(parsed.jsonOutput, true);
});

test('10. Pattern C: processLedgers generates verified JSON and HTML artifacts', () => {
  const ledger1 = path.join(FIXTURES_DIR, 'sample_angelone_ledger.json');
  const ledger2 = path.join(FIXTURES_DIR, 'sample_indmoney_ledger.json');
  const blended = path.join(FIXTURES_DIR, 'sample_blended_holdings.json');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-xirr-cli-test-'));
  const res = processLedgers([ledger1, ledger2], blended, {
    baseCurrency: 'INR',
    outDir: tempDir
  });

  assert.equal(res.ok, true);
  assert.ok(res.jsonPath);
  assert.ok(res.htmlPath);

  const pairRes = verifyArtifactPair({
    jsonPath: res.jsonPath,
    htmlPath: res.htmlPath,
    schemaType: 'strategy-xirr'
  });
  assert.equal(pairRes.ok, true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

