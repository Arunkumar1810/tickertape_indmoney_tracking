'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculate5StepDuPont,
  calculateOwnerEarnings,
  calculateROIC,
  evaluateBuffettMungerValuation,
  analyzeStockWithBuffett,
  getBuffettDiagnostics,
  recordBuffettVerdict,
  inferMarket,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts
} = require('../scripts/orchestrate_buffett_analysis');

function findRepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) return curr;
    curr = path.dirname(curr);
  }
  return path.resolve(startDir, '../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. calculateOwnerEarnings math, maintenance CapEx priority, and SBC dilution', () => {
  const res1 = calculateOwnerEarnings(5000, 1200, 600, 400);
  assert.equal(res1.trueOwnerEarnings, 4000.0);
  assert.equal(res1.sbcDilutionPct, 8.0);
  assert.equal(res1.capexUsed, 600.0);

  const res2 = calculateOwnerEarnings(5000, 1200, null, 250);
  assert.equal(res2.trueOwnerEarnings, 3550.0);
  assert.equal(res2.sbcDilutionPct, 5.0);
  assert.equal(res2.capexUsed, 1200.0);

  const res3 = calculateOwnerEarnings(0, 500, null, 100);
  assert.equal(res3.trueOwnerEarnings, -600.0);
  assert.equal(res3.sbcDilutionPct, 0.0);
});

test('2. calculate5StepDuPont ROE decomposition mathematical fidelity', () => {
  const params = {
    netIncome: 1200,
    ebt: 1500,
    ebit: 2000,
    revenue: 10000,
    totalAssets: 16000,
    totalEquity: 8000
  };

  const dupont = calculate5StepDuPont(params);
  assert.ok(dupont);
  assert.equal(dupont.taxBurden, 0.8);
  assert.equal(dupont.interestBurden, 0.75);
  assert.equal(dupont.operatingMarginPct, 20.0);
  assert.equal(dupont.assetTurnover, 0.625);
  assert.equal(dupont.financialLeverage, 2.0);
  assert.equal(dupont.calculatedRoePct, 15.0);

  const product = dupont.taxBurden * dupont.interestBurden * (dupont.operatingMarginPct / 100) * dupont.assetTurnover * dupont.financialLeverage * 100;
  assert.ok(Math.abs(product - dupont.calculatedRoePct) < 0.01);
});

test('3. calculateROIC NOPAT / Invested Capital math', () => {
  const roic = calculateROIC({
    ebit: 2000,
    taxExpense: 400,
    ebt: 1600,
    totalEquity: 6000,
    totalDebt: 3000,
    cashAndEquivalents: 1000
  });

  assert.ok(roic !== null);
  assert.ok(roic > 15.0 && roic < 25.0);
});

test('4. Wide moat fixture evaluation produces STRONG_BUY canonical verdict', () => {
  const financials = loadFixture('buffett_wide_moat.json');
  const verdict = evaluateBuffettMungerValuation(financials, {
    timestamp: '2026-11-07T12:00:00.000Z'
  });

  assert.equal(verdict.principle, 'buffet');
  assert.equal(verdict.ticker, 'WIDE_MOAT_CO');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 80.0, `Expected score >= 80.0, got ${verdict.score}`);
  assert.equal(verdict.stance, 'STRONG_BUY');

  const valRes = validateUniformVerdict(verdict);
  assert.equal(valRes.ok, true, `Validation failed: ${JSON.stringify(valRes.errors)}`);
});

test('5. Index ETF passive bypass assigns 100.0 score and HOLD stance', () => {
  const etfFinancials = {
    ticker: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    market: 'US',
    currency: 'USD',
    timestamp: '2026-11-07T12:00:00.000Z',
    is_index_etf: true,
    sector: 'Index ETF',
    market_data: { cmp: 520.0, market_cap: 500000.0 }
  };

  const verdict = evaluateBuffettMungerValuation(etfFinancials);
  assert.equal(verdict.principle, 'buffet');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.summary.includes('Index ETF'));

  const valRes = validateUniformVerdict(verdict);
  assert.equal(valRes.ok, true, `Validation failed: ${JSON.stringify(valRes.errors)}`);
});

test('6. Conversational persona: analyzeStockWithBuffett generates Omaha advice & canonical verdict', () => {
  const financials = loadFixture('buffett_wide_moat.json');
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'buffett-test-'));

  const result = analyzeStockWithBuffett('WIDE_MOAT_CO', {
    financials,
    ignorePortfolio: true,
    outDir: tmpOut
  });

  assert.equal(result.ticker, 'WIDE_MOAT_CO');
  assert.ok(result.folksy_verdict.includes('Risk comes from not knowing') || result.folksy_verdict.includes('partnership books'));
  assert.equal(result.call, 'HOLD'); // strictly gated because portfolio unknown
  assert.ok(result.verdict);
  assert.equal(result.verdict.principle, 'buffet');

  const valRes = validateUniformVerdict(result.verdict);
  assert.equal(valRes.ok, true);

  // Check artifacts written
  assert.ok(fs.existsSync(result.artifacts.json));
  assert.ok(fs.existsSync(result.artifacts.html));

  // Verify pair using Universal Verification Harness
  const pairCheck = verifyArtifactPair({
    jsonPath: result.artifacts.json,
    htmlPath: result.artifacts.html,
    schemaType: 'verdict'
  });
  assert.equal(pairCheck.ok, true);

  fs.rmSync(tmpOut, { recursive: true, force: true });
});

test('7. Batch portfolio evaluation: processHoldings generates valid UniformVerdictBatch', async () => {
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'buffett-batch-test-'));
  const holdingsFile = path.join(tmpOut, 'holdings_snapshot.json');

  const snapshot = {
    account_id: 'TEST_DEMAT',
    broker: 'ANGEL_ONE',
    currency: 'INR',
    timestamp: '2026-11-07T12:00:00.000Z',
    summary: { total_holdings_count: 2 },
    margin: { total_margin: 50000 },
    holdings: [
      { ticker: 'WIDE_MOAT_CO', name: 'Wide Moat Co', quantity: 10, cmp: 250 },
      { ticker: 'VOO', name: 'Vanguard 500 ETF', quantity: 5, cmp: 520 }
    ]
  };

  fs.writeFileSync(holdingsFile, JSON.stringify(snapshot, null, 2), 'utf8');

  const batchRes = await processHoldings(holdingsFile, {
    outDir: tmpOut,
    financialsMap: {
      WIDE_MOAT_CO: loadFixture('buffett_wide_moat.json')
    }
  });

  assert.equal(batchRes.ok, true);
  assert.equal(batchRes.batch.principle, 'buffet');
  assert.equal(batchRes.batch.verdicts.length, 2);

  const valRes = validateUniformVerdictBatch(batchRes.batch);
  assert.equal(valRes.ok, true);

  assert.ok(fs.existsSync(batchRes.jsonPath));
  assert.ok(fs.existsSync(batchRes.htmlPath));

  const pairCheck = verifyArtifactPair({
    jsonPath: batchRes.jsonPath,
    htmlPath: batchRes.htmlPath,
    schemaType: 'verdict-batch'
  });
  assert.equal(pairCheck.ok, true);

  fs.rmSync(tmpOut, { recursive: true, force: true });
});

test('8. getBuffettDiagnostics emits raw metrics and checks without closed verdict', () => {
  const financials = loadFixture('buffett_wide_moat.json');
  const diag = getBuffettDiagnostics('WIDE_MOAT_CO', {
    financials,
    ignorePortfolio: true
  });

  assert.equal(diag.ticker, 'WIDE_MOAT_CO');
  assert.ok(Array.isArray(diag.principles));
  assert.equal(diag.principles.length, 4);

  // Verify principle metrics and checks exist
  const moat = diag.principles.find(p => p.principle_id === 'economic-moat');
  assert.ok(moat);
  assert.ok(moat.metrics.roic_pct > 20.0);
  assert.ok(Array.isArray(moat.checks));
  assert.equal(moat.checks[0].status, 'PASS');

  // Verify no closed final verdict exists in the diagnostics packet
  assert.equal(diag.verdict, undefined);
  assert.equal(diag.composite_score, undefined);
  assert.equal(diag.stance, undefined);
});

test('9. recordBuffettVerdict accepts reasoned AI verdict and writes validated UniformVerdictContract', () => {
  const financials = loadFixture('buffett_wide_moat.json');
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'buffett-record-test-'));

  const reasonedInput = {
    canonical_stance: 'STRONG_BUY',
    actionable_call: 'BUY',
    score: 88.0,
    call_reason: 'Unusually durable economic moat in enterprise software with negligible debt and expanding owner cash.',
    folksy_verdict: '“When we see an extraordinary moat and disciplined capital allocators, we do not wait. We step up and swing.”',
    summary: 'STRONG_BUY: Unusually durable economic moat in enterprise software with negligible debt and expanding owner cash.'
  };

  const res = recordBuffettVerdict('WIDE_MOAT_CO', reasonedInput, {
    financials,
    outDir: tmpOut,
    ignorePortfolio: true
  });

  assert.equal(res.ticker, 'WIDE_MOAT_CO');
  assert.equal(res.verdict.stance, 'STRONG_BUY');
  assert.equal(res.verdict.score, 88.0);
  assert.equal(res.folksy_verdict, reasonedInput.folksy_verdict);
  assert.equal(res.call_reason, reasonedInput.call_reason);

  const valRes = validateUniformVerdict(res.verdict);
  assert.equal(valRes.ok, true, `Validation failed: ${JSON.stringify(valRes.errors)}`);

  assert.ok(fs.existsSync(res.artifacts.json));
  assert.ok(fs.existsSync(res.artifacts.html));

  const pairCheck = verifyArtifactPair({
    jsonPath: res.artifacts.json,
    htmlPath: res.artifacts.html,
    schemaType: 'verdict'
  });
  assert.equal(pairCheck.ok, true);

  fs.rmSync(tmpOut, { recursive: true, force: true });
});
