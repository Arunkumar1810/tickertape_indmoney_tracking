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
  inferMarket,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts
} = require('../scripts/analyze_buffett_munger');

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../scripts/framework');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. calculateOwnerEarnings math, maintenance CapEx priority, and SBC dilution', () => {
  // CFO: 5000, Total CapEx: 1200, Maintenance CapEx: 600, SBC: 400
  // True Owner Earnings = 5000 - 600 - 400 = 4000
  // SBC dilution % = (400 / 5000) * 100 = 8.0%
  const res1 = calculateOwnerEarnings(5000, 1200, 600, 400);
  assert.equal(res1.trueOwnerEarnings, 4000.0);
  assert.equal(res1.sbcDilutionPct, 8.0);
  assert.equal(res1.capexUsed, 600.0);

  // Fallback to full CapEx if maintenance CapEx not broken out
  const res2 = calculateOwnerEarnings(5000, 1200, null, 250);
  assert.equal(res2.trueOwnerEarnings, 3550.0);
  assert.equal(res2.sbcDilutionPct, 5.0);
  assert.equal(res2.capexUsed, 1200.0);

  // Zero CFO handles dilution without division by zero
  const res3 = calculateOwnerEarnings(0, 500, null, 100);
  assert.equal(res3.trueOwnerEarnings, -600.0);
  assert.equal(res3.sbcDilutionPct, 0.0);
});

test('2. calculate5StepDuPont ROE decomposition mathematical fidelity', () => {
  // Net Income: 5000, EBT: 6350, EBIT: 6500, Revenue: 25000, Assets: 22000, Equity: 14000
  const dupont = calculate5StepDuPont({
    netIncome: 5000.0,
    ebt: 6350.0,
    ebit: 6500.0,
    revenue: 25000.0,
    totalAssets: 22000.0,
    totalEquity: 14000.0
  });

  assert.ok(dupont !== null);
  assert.equal(dupont.taxBurden, 0.7874);
  assert.equal(dupont.interestBurden, 0.9769);
  assert.equal(dupont.operatingMarginPct, 26.0);
  assert.equal(dupont.assetTurnover, 1.1364);
  assert.equal(dupont.financialLeverage, 1.57);
  assert.equal(dupont.calculatedRoePct, 35.71);

  // Guards against non-positive equity or zero revenue
  assert.equal(calculate5StepDuPont({
    netIncome: 100, ebt: 120, ebit: 150, revenue: 0, totalAssets: 1000, totalEquity: 500
  }), null);
  assert.equal(calculate5StepDuPont({
    netIncome: 100, ebt: 120, ebit: 150, revenue: 1000, totalAssets: 1000, totalEquity: -200
  }), null);
});

test('3. calculateROIC return on invested capital math & capital structure guards', () => {
  // EBIT: 6500, Tax Expense: 1350, EBT: 6350, Equity: 14000, Debt: 1200, Cash: 3000
  // Effective Tax Rate = 1350 / 6350 = 21.26%
  // NOPAT = 6500 * (1 - 0.2126) = 5118.11
  // Invested Capital = 14000 + 1200 - 3000 = 12200
  // ROIC = (5118.11 / 12200) * 100 = 41.95%
  const roic = calculateROIC({
    ebit: 6500.0,
    taxExpense: 1350.0,
    ebt: 6350.0,
    totalEquity: 14000.0,
    totalDebt: 1200.0,
    cashAndEquivalents: 3000.0
  });

  assert.equal(roic, 41.95);

  // Zero or negative EBIT guard
  assert.equal(calculateROIC({
    ebit: 0, taxExpense: 0, ebt: 0, totalEquity: 1000, totalDebt: 0, cashAndEquivalents: 100
  }), null);
});

test('4. evaluateBuffettMungerValuation: Wide economic moat and un-leveraged compounding', () => {
  const wideMoatData = loadFixture('buffett_wide_moat.json');
  const verdict = evaluateBuffettMungerValuation(wideMoatData);

  assert.equal(verdict.principle, 'buffett_munger');
  assert.equal(verdict.ticker, 'WIDE_MOAT_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.metrics.roic_pct, 41.95);
  assert.equal(verdict.metrics.owner_earnings, 5250.0);
  assert.equal(verdict.metrics.owner_earnings_yield_pct, 10.5);
  assert.equal(verdict.metrics.roe_pct, 35.71);
  assert.equal(verdict.metrics.financial_leverage, 1.57);
  assert.ok(verdict.red_flags.some(f => f.includes('Wide economic moat confirmed')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateBuffettMungerValuation: Excessive stock-based compensation dilution', () => {
  const dilutedData = loadFixture('buffett_sbc_dilution.json');
  const verdict = evaluateBuffettMungerValuation(dilutedData);

  assert.equal(verdict.principle, 'buffett_munger');
  assert.equal(verdict.ticker, 'DILUTED_GROWTH_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_SELL');
  assert.ok(verdict.score < 35.0, `Score must be < 35.0, got ${verdict.score}`);
  assert.equal(verdict.metrics.sbc_dilution_pct, 35.0);
  assert.ok(verdict.red_flags.some(f => f.includes('Severe SBC dilution')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateBuffettMungerValuation: Artificial ROE generated by excessive debt leverage', () => {
  const leveragedData = loadFixture('buffett_leveraged_roe.json');
  const verdict = evaluateBuffettMungerValuation(leveragedData);

  assert.equal(verdict.principle, 'buffett_munger');
  assert.equal(verdict.ticker, 'LEVERAGED_FIN_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'REDUCE');
  assert.equal(verdict.metrics.financial_leverage, 6.0);
  assert.ok(verdict.red_flags.some(f => f.includes('Artificial ROE leverage')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. evaluateBuffettMungerValuation: Capital destructive company with negative Owner Earnings', () => {
  const destData = loadFixture('buffett_capital_destructive.json');
  const verdict = evaluateBuffettMungerValuation(destData);

  assert.equal(verdict.principle, 'buffett_munger');
  assert.equal(verdict.ticker, 'VALUE_DESTROYER_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_SELL');
  assert.ok(verdict.score <= 10.0, `Score should be <= 10.0, got ${verdict.score}`);
  assert.ok(verdict.metrics.owner_earnings < 0);
  assert.ok(verdict.red_flags.some(f => f.includes('Negative true Owner Earnings')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('8. evaluateBuffettMungerValuation: Broad market Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateBuffettMungerValuation(etfData);

  assert.equal(verdict.principle, 'buffett_munger');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.metrics.owner_earnings, null);
  assert.equal(verdict.metrics.roic_pct, null);
  assert.equal(verdict.red_flags.length, 0);
  assert.ok(verdict.summary.includes('Index ETF passive basket'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('9. CLI parsing: parseArgs options and flags', () => {
  const args = parseArgs([
    '--data', 'custom/report.json',
    '--ticker', 'aapl',
    '--market', 'us',
    '--holdings', 'portfolio.json',
    '--out', 'custom_reports',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'custom/report.json');
  assert.equal(args.ticker, 'AAPL');
  assert.equal(args.market, 'US');
  assert.equal(args.holdings, 'portfolio.json');
  assert.equal(args.out, 'custom_reports');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('10. Pattern C: processDataFile creates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buffett-data-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'buffett_wide_moat.json');
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

test('11. Option C Portfolio Batch Mode: processHoldings generates verified VerdictBatch', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buffett-batch-test-'));
  try {
    const wideMoatData = loadFixture('buffett_wide_moat.json');
    const dilutedData = loadFixture('buffett_sbc_dilution.json');
    const etfData = loadFixture('index_etf.json');

    const mockHoldingsSnapshot = {
      account_id: 'TEST_ACCT_04',
      broker: 'AngelOne',
      currency: 'INR',
      timestamp: new Date().toISOString(),
      summary: {
        total_invested: 100000.0,
        total_current_value: 125000.0,
        unrealized_pnl: 25000.0,
        unrealized_pnl_pct: 25.0,
        available_cash: 5000.0,
        total_account_equity: 130000.0,
        holdings_count: 3
      },
      margin: {
        available_cash: 5000.0,
        collateral: 0.0,
        utilised: 0.0,
        net_margin: 5000.0
      },
      holdings: [
        {
          ticker: 'WIDE_MOAT_CO',
          name: 'Durable Monopoly Brands Inc',
          isin: 'US005E01015',
          exchange: 'NASDAQ',
          quantity: 100,
          average_price: 220.0,
          cmp: 250.0,
          invested_value: 22000.0,
          current_value: 25000.0,
          unrealized_pnl: 3000.0,
          unrealized_pnl_pct: 13.64,
          weight_pct: 20.0
        },
        {
          ticker: 'DILUTED_GROWTH_CO',
          name: 'Dilutive Cloud SaaS Inc',
          isin: 'US006F01016',
          exchange: 'NASDAQ',
          quantity: 80,
          average_price: 160.0,
          cmp: 150.0,
          invested_value: 12800.0,
          current_value: 12000.0,
          unrealized_pnl: -800.0,
          unrealized_pnl_pct: -6.25,
          weight_pct: 9.6
        },
        {
          ticker: 'VOO',
          name: 'Vanguard S&P 500 ETF',
          isin: 'US9229083632',
          exchange: 'NYSEARCA',
          quantity: 15,
          average_price: 520.0,
          cmp: 542.80,
          invested_value: 7800.0,
          current_value: 8142.0,
          unrealized_pnl: 342.0,
          unrealized_pnl_pct: 4.38,
          weight_pct: 6.51
        }
      ]
    };

    const holdingsPath = path.join(tmpDir, 'test_holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const result = await processHoldings(holdingsPath, {
      outDir: tmpDir,
      financialsMap: {
        WIDE_MOAT_CO: wideMoatData,
        DILUTED_GROWTH_CO: dilutedData,
        VOO: etfData
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.batch.principle, 'buffett_munger');
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

