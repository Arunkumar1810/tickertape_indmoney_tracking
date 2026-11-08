'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateInventoryDivergence,
  calculateLynchFairValue,
  calculatePEG,
  calculateYieldAdjustedPEG,
  classifyLynchCategory,
  evaluateLynchValuation,
  inferMarket,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts
} = require('../scripts/analyze_lynch');

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../shared/framework');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. calculatePEG, calculateYieldAdjustedPEG & calculateLynchFairValue math and guards', () => {
  // Traditional PEG: PE = 18.0, EPS Growth = 28.0% -> 18.0 / 28.0 = 0.6428... -> 0.64
  const peg = calculatePEG(18.0, 28.0);
  assert.equal(peg, 0.64);

  // Guards against negative or zero values
  assert.equal(calculatePEG(-10.0, 25.0), null);
  assert.equal(calculatePEG(20.0, 0.0), null);
  assert.equal(calculatePEG(20.0, -5.0), null);
  assert.equal(calculatePEG(null, 25.0), null);

  // Yield-adjusted PEG: PE = 18.0, Growth = 28.0, Yield = 1.2 -> 18 / 29.2 = 0.6164... -> 0.62
  const yieldPeg = calculateYieldAdjustedPEG(18.0, 28.0, 1.2);
  assert.equal(yieldPeg, 0.62);
  assert.equal(calculateYieldAdjustedPEG(20.0, 0.0, 0.0), null);

  // Lynch Fair Value line: (Growth + Yield) * EPS
  // (28.0 + 1.2) * 6.94 = 29.2 * 6.94 = 202.648 -> 202.65
  const fairValue = calculateLynchFairValue(6.94, 28.0, 1.2);
  assert.equal(fairValue, 202.65);
  assert.equal(calculateLynchFairValue(-5.0, 20.0, 1.0), null);
  assert.equal(calculateLynchFairValue(5.0, -10.0, 0.0), null);
});

test('2. calculateInventoryDivergence math & guard checks', () => {
  // Inventory growth 16.5% vs sales growth 0.0% -> delta 16.5%
  assert.equal(calculateInventoryDivergence(16.5, 0.0), 16.5);

  // Inventory growth 5.0% vs sales growth 12.0% -> delta -7.0%
  assert.equal(calculateInventoryDivergence(5.0, 12.0), -7.0);

  // Non-finite guards
  assert.equal(calculateInventoryDivergence(null, 10.0), null);
  assert.equal(calculateInventoryDivergence(10.0, NaN), null);
});

test('3. classifyLynchCategory lifecycle classification archetypes', () => {
  // Fast Grower: >= 20%
  assert.equal(classifyLynchCategory({
    market_data: { eps_growth_5y_cagr_pct: 25.0, dividend_yield_pct: 0.5 }
  }), 'Fast Grower');

  // Stalwart: 10% - 20%
  assert.equal(classifyLynchCategory({
    market_data: { eps_growth_5y_cagr_pct: 15.0, dividend_yield_pct: 1.5 }
  }), 'Stalwart');

  // Slow Grower: 2% - 10% with yield >= 2.5%
  assert.equal(classifyLynchCategory({
    market_data: { eps_growth_5y_cagr_pct: 4.0, dividend_yield_pct: 3.5 }
  }), 'Slow Grower');

  // Cyclical: by sector
  assert.equal(classifyLynchCategory({
    sector: 'Automobiles',
    market_data: { eps_growth_5y_cagr_pct: 18.0 }
  }), 'Cyclical');

  // Turnaround: explicit flag
  assert.equal(classifyLynchCategory({
    is_turnaround: true,
    market_data: { eps_growth_5y_cagr_pct: 50.0 }
  }), 'Turnaround');

  // Asset Play: explicit flag or cash > 50% market cap
  assert.equal(classifyLynchCategory({
    is_asset_play: true
  }), 'Asset Play');
  assert.equal(classifyLynchCategory({
    market_data: { market_cap: 1000.0, eps_growth_5y_cagr_pct: 8.0 },
    balance_sheet: { cash_and_equivalents: 650.0 }
  }), 'Asset Play');
});

test('4. evaluateLynchValuation: High growth at reasonable price (Fast Grower)', () => {
  const fastData = loadFixture('lynch_fast_grower.json');
  const verdict = evaluateLynchValuation(fastData);

  assert.equal(verdict.principle, 'lynch');
  assert.equal(verdict.ticker, 'FAST_GROWER_CO');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 80.0, `Score should be >= 80.0, got ${verdict.score}`);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.equal(verdict.metrics.peg_ratio, 0.64);
  assert.equal(verdict.metrics.yield_adjusted_peg_ratio, 0.62);
  assert.equal(verdict.metrics.lynch_fair_value, 202.65);
  assert.equal(verdict.metrics.inventory_divergence_pct, -2.0);
  assert.equal(verdict.metrics.debt_to_equity, 0.23);
  assert.ok(verdict.summary.includes('Fast Grower'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateLynchValuation: Steady stalwart with dividend capital return', () => {
  const stalwartData = loadFixture('lynch_stalwart.json');
  const verdict = evaluateLynchValuation(stalwartData);

  assert.equal(verdict.principle, 'lynch');
  assert.equal(verdict.ticker, 'STALWART_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'BUY');
  assert.ok(verdict.score >= 65.0 && verdict.score < 80.0, `Score must be in BUY range [65, 80), got ${verdict.score}`);
  assert.equal(verdict.metrics.peg_ratio, 1.04);
  assert.equal(verdict.metrics.yield_adjusted_peg_ratio, 0.86);
  assert.equal(verdict.metrics.lynch_fair_value, 672.0);
  assert.equal(verdict.metrics.inventory_divergence_pct, 0.5);
  assert.ok(verdict.summary.includes('Stalwart'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateLynchValuation: Severe inventory divergence and channel-stuffing trap', () => {
  const glutData = loadFixture('lynch_inventory_glut.json');
  const verdict = evaluateLynchValuation(glutData);

  assert.equal(verdict.principle, 'lynch');
  assert.equal(verdict.ticker, 'INVENTORY_GLUT_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_SELL');
  assert.ok(verdict.score < 35.0, `Score must be < 35.0 for STRONG_SELL, got ${verdict.score}`);
  assert.equal(verdict.metrics.inventory_divergence_pct, 16.5);
  assert.ok(verdict.red_flags.some(f => f.includes('Severe inventory bloat') && f.includes('16.5%')));
  assert.ok(verdict.red_flags.some(f => f.includes('exceeds Peter Lynch 2.0 ceiling')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. evaluateLynchValuation: Overvalued growth with excessive multiple stretch', () => {
  const expData = loadFixture('lynch_overvalued_growth.json');
  const verdict = evaluateLynchValuation(expData);

  assert.equal(verdict.principle, 'lynch');
  assert.equal(verdict.ticker, 'EXPENSIVE_GROWTH');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'REDUCE');
  assert.equal(verdict.metrics.peg_ratio, 4.33);
  assert.equal(verdict.metrics.pe_ratio, 65.0);
  assert.equal(verdict.metrics.debt_to_equity, 1.5);
  assert.ok(verdict.red_flags.some(f => f.includes('Elevated P/E multiple')));
  assert.ok(verdict.red_flags.some(f => f.includes('Elevated financial leverage')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('8. evaluateLynchValuation: Exceptional PEG growth bargain (< 0.50)', () => {
  const base = loadFixture('lynch_fast_grower.json');
  const bargain = JSON.parse(JSON.stringify(base));
  // PE = 12.0, EPS growth = 30.0% -> PEG = 0.40 <= 0.50
  bargain.ticker = 'BARGAIN_CO';
  bargain.market_data.pe_ttm = 12.0;
  bargain.market_data.eps_growth_5y_cagr_pct = 30.0;

  const verdict = evaluateLynchValuation(bargain);
  assert.equal(verdict.metrics.peg_ratio, 0.40);
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.ok(verdict.red_flags.some(f => f.includes('Exceptional growth bargain')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('9. evaluateLynchValuation: Zero or negative EPS growth handling', () => {
  const base = loadFixture('lynch_fast_grower.json');
  const noGrowth = JSON.parse(JSON.stringify(base));
  noGrowth.ticker = 'NO_GROWTH_CO';
  noGrowth.market_data.eps_growth_5y_cagr_pct = -4.5;

  const verdict = evaluateLynchValuation(noGrowth);
  assert.equal(verdict.metrics.peg_ratio, null);
  assert.equal(verdict.metrics.lynch_fair_value, null);
  assert.ok(verdict.red_flags.some(f => f.includes('Zero or negative EPS growth rate')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('10. evaluateLynchValuation: Broad market Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateLynchValuation(etfData);

  assert.equal(verdict.principle, 'lynch');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.metrics.peg_ratio, null);
  assert.equal(verdict.metrics.yield_adjusted_peg_ratio, null);
  assert.equal(verdict.metrics.inventory_divergence_pct, null);
  assert.equal(verdict.red_flags.length, 0);
  assert.ok(verdict.summary.includes('Index ETF passive basket'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('11. CLI parsing: parseArgs options and flags', () => {
  const args = parseArgs([
    '--data', 'custom/report.json',
    '--ticker', 'nvda',
    '--market', 'us',
    '--holdings', 'portfolio.json',
    '--out', 'custom_reports',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'custom/report.json');
  assert.equal(args.ticker, 'NVDA');
  assert.equal(args.market, 'US');
  assert.equal(args.holdings, 'portfolio.json');
  assert.equal(args.out, 'custom_reports');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('12. Pattern C: processDataFile creates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynch-data-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'lynch_fast_grower.json');
    const result = processDataFile(fixturePath, { outDir: tmpDir });

    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.jsonPath), `JSON file not found: ${result.jsonPath}`);
    assert.ok(fs.existsSync(result.htmlPath), `HTML file not found: ${result.htmlPath}`);

    const htmlContent = fs.readFileSync(result.htmlPath, 'utf8');
    const containment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(containment.ok, true, `HTML containment failed: ${JSON.stringify(containment.errors)}`);
    assert.equal(containment.summary.externalLeaksCount, 0);

    const pairResult = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'verdict'
    });
    assert.equal(pairResult.ok, true, `Pair verification failed: ${JSON.stringify(pairResult.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('13. Option C Portfolio Batch Mode: processHoldings generates verified VerdictBatch', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynch-batch-test-'));
  try {
    const fastData = loadFixture('lynch_fast_grower.json');
    const stalwartData = loadFixture('lynch_stalwart.json');
    const etfData = loadFixture('index_etf.json');

    const mockHoldingsSnapshot = {
      account_id: 'TEST_ACCT_03',
      broker: 'AngelOne',
      currency: 'INR',
      timestamp: new Date().toISOString(),
      summary: {
        total_invested: 75000.0,
        total_current_value: 92000.0,
        unrealized_pnl: 17000.0,
        unrealized_pnl_pct: 22.67,
        available_cash: 3000.0,
        total_account_equity: 95000.0,
        holdings_count: 3
      },
      margin: {
        available_cash: 3000.0,
        collateral: 0.0,
        utilised: 0.0,
        net_margin: 3000.0
      },
      holdings: [
        {
          ticker: 'FAST_GROWER_CO',
          name: 'Rapid Scale Technologies Inc',
          isin: 'US003C01013',
          exchange: 'NASDAQ',
          quantity: 50,
          average_price: 110.0,
          cmp: 125.0,
          invested_value: 5500.0,
          current_value: 6250.0,
          unrealized_pnl: 750.0,
          unrealized_pnl_pct: 13.64,
          weight_pct: 25.0
        },
        {
          ticker: 'STALWART_CO',
          name: 'Reliable Consumer Products Ltd',
          isin: 'INE004D01014',
          exchange: 'NSE',
          quantity: 100,
          average_price: 520.0,
          cmp: 580.0,
          invested_value: 52000.0,
          current_value: 58000.0,
          unrealized_pnl: 6000.0,
          unrealized_pnl_pct: 11.54,
          weight_pct: 60.0
        },
        {
          ticker: 'VOO',
          name: 'Vanguard S&P 500 ETF',
          isin: 'US9229083632',
          exchange: 'NYSEARCA',
          quantity: 5,
          average_price: 500.0,
          cmp: 542.80,
          invested_value: 2500.0,
          current_value: 2714.0,
          unrealized_pnl: 214.0,
          unrealized_pnl_pct: 8.56,
          weight_pct: 15.0
        }
      ]
    };

    const holdingsPath = path.join(tmpDir, 'test_holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const result = await processHoldings(holdingsPath, {
      outDir: tmpDir,
      financialsMap: {
        FAST_GROWER_CO: fastData,
        STALWART_CO: stalwartData,
        VOO: etfData
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.batch.principle, 'lynch');
    assert.equal(result.batch.verdicts.length, 3);

    const validation = validateUniformVerdictBatch(result.batch);
    assert.equal(validation.ok, true, `Batch validation failed: ${JSON.stringify(validation.errors)}`);

    assert.ok(fs.existsSync(result.jsonPath), `Batch JSON not found at ${result.jsonPath}`);
    assert.ok(fs.existsSync(result.htmlPath), `Batch HTML not found at ${result.htmlPath}`);

    const htmlContent = fs.readFileSync(result.htmlPath, 'utf8');
    const containment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(containment.ok, true, `Batch HTML containment failed: ${JSON.stringify(containment.errors)}`);
    assert.equal(containment.summary.externalLeaksCount, 0);

    const pairResult = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'verdict-batch'
    });
    assert.equal(pairResult.ok, true, `Batch pair verification failed: ${JSON.stringify(pairResult.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

