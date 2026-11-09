'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateAltmanZScore,
  evaluateKlarmanSolvency,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  writeArtifacts
} = require('../scripts/analyze_klarman_solvency');

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

test('1. calculateAltmanZScore mathematical fidelity, zone boundaries, and guards', () => {
  // Balanced sample:
  // Total Assets: 10000, Current Assets: 4000, Current Liabilities: 1000 -> WC = 3000 -> X1 = 0.3
  // Retained Earnings: 5000 -> X2 = 0.5
  // EBIT: 3000 -> X3 = 0.3
  // Market Cap: 30000, Total Liabilities: 3000 -> X4 = 10.0
  // Revenue: 12000 -> X5 = 1.2
  // Z = 1.2(0.3) + 1.4(0.5) + 3.3(0.3) + 0.6(10) + 0.999(1.2)
  //   = 0.36 + 0.70 + 0.99 + 6.00 + 1.1988 = 9.2488 -> 9.25
  const z = calculateAltmanZScore({
    totalAssets: 10000.0,
    totalCurrentAssets: 4000.0,
    totalCurrentLiabilities: 1000.0,
    retainedEarnings: 5000.0,
    ebit: 3000.0,
    marketCap: 30000.0,
    totalLiabilities: 3000.0,
    revenue: 12000.0
  });
  assert.equal(z, 9.25);

  // Guards against non-positive assets or liabilities or negative market cap
  assert.equal(calculateAltmanZScore({
    totalAssets: 0,
    totalCurrentAssets: 100,
    totalCurrentLiabilities: 50,
    retainedEarnings: 100,
    ebit: 50,
    marketCap: 1000,
    totalLiabilities: 500,
    revenue: 1000
  }), null);

  assert.equal(calculateAltmanZScore({
    totalAssets: 1000,
    totalCurrentAssets: 100,
    totalCurrentLiabilities: 50,
    retainedEarnings: 100,
    ebit: 50,
    marketCap: 1000,
    totalLiabilities: 0,
    revenue: 1000
  }), null);

  assert.equal(calculateAltmanZScore({
    totalAssets: 1000,
    totalCurrentAssets: 100,
    totalCurrentLiabilities: 50,
    retainedEarnings: 100,
    ebit: 50,
    marketCap: -100,
    totalLiabilities: 500,
    revenue: 1000
  }), null);
});

test('2. Fortress Balance Sheet fixture achieves 100/100 score and STRONG_BUY stance', () => {
  const data = loadFixture('klarman_fortress.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'FORTRESS_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'STRONG_BUY');

  // Metrics
  assert.equal(verdict.metrics.altman_z_score, 9.25);
  assert.equal(verdict.metrics.net_debt, -2000.0);
  assert.equal(verdict.metrics.net_debt_to_ebitda, -0.57);
  assert.equal(verdict.metrics.interest_coverage, 60.0);
  assert.equal(verdict.metrics.debt_maturing_24m, 100.0);
  assert.equal(verdict.metrics.cash_to_debt_maturing_ratio, 25.0);
  assert.equal(verdict.metrics.accrual_gap, 400.0);
  assert.equal(verdict.metrics.operating_cash_flow_to_debt, 5.6);

  assert.equal(verdict.red_flags.length, 0);
  assert.match(verdict.summary, /Fortress balance sheet/);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('3. Distressed Insolvency Cliff fixture triggers 0/100 score and STRONG_SELL with alerts', () => {
  const data = loadFixture('klarman_distress_cliff.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'DISTRESS_CORP');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 0.0);
  assert.equal(verdict.stance, 'STRONG_SELL');

  assert.equal(verdict.metrics.altman_z_score, 0.74);
  assert.equal(verdict.metrics.net_debt, 1920.0);
  assert.equal(verdict.metrics.net_debt_to_ebitda, 12.8);
  assert.equal(verdict.metrics.interest_coverage, 0.22);
  assert.equal(verdict.metrics.debt_maturing_24m, 850.0);
  assert.equal(verdict.metrics.cash_to_debt_maturing_ratio, 0.09);

  // 4 red flags for distress zone, excessive leverage, debt cliff, strained interest coverage
  assert.equal(verdict.red_flags.length, 4);
  assert.ok(verdict.red_flags.some(f => f.includes('Distress Zone')));
  assert.ok(verdict.red_flags.some(f => f.includes('Excessive Leverage')));
  assert.ok(verdict.red_flags.some(f => f.includes('Debt Maturity Cliff')));
  assert.ok(verdict.red_flags.some(f => f.includes('Strained Debt Service')));

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('4. Leveraged EBITDA fixture correctly docks leverage points and flags REDUCE stance', () => {
  const data = loadFixture('klarman_leveraged_ebitda.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'LEVERAGED_TEL');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 43.0);
  assert.equal(verdict.stance, 'REDUCE');

  assert.equal(verdict.metrics.altman_z_score, 1.89);
  assert.equal(verdict.metrics.net_debt_to_ebitda, 4.53);
  assert.equal(verdict.metrics.interest_coverage, 3.75);
  assert.equal(verdict.metrics.cash_to_debt_maturing_ratio, 0.33);

  // Red flags for grey zone and excessive leverage
  assert.ok(verdict.red_flags.some(f => f.includes('Grey Zone')));
  assert.ok(verdict.red_flags.some(f => f.includes('Excessive Leverage')));

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('5. Thin Interest Coverage fixture receives BUY stance with coverage warning', () => {
  const data = loadFixture('klarman_thin_interest_coverage.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'THIN_COV_CORP');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 73.0);
  assert.equal(verdict.stance, 'BUY');

  assert.equal(verdict.metrics.altman_z_score, 2.75);
  assert.equal(verdict.metrics.interest_coverage, 1.8);
  assert.equal(verdict.metrics.net_debt_to_ebitda, 2.14);

  assert.ok(verdict.red_flags.some(f => f.includes('Thin Interest Coverage')));

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('6. Passive Index ETF bypass assigns score 100.0, HOLD stance, and null metrics', () => {
  const data = loadFixture('index_etf.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.is_veto, false);

  assert.equal(verdict.metrics.altman_z_score, null);
  assert.equal(verdict.metrics.net_debt, null);
  assert.equal(verdict.metrics.net_debt_to_ebitda, null);
  assert.equal(verdict.metrics.interest_coverage, null);
  assert.equal(verdict.metrics.debt_maturing_24m, null);
  assert.equal(verdict.metrics.cash_to_debt_maturing_ratio, null);
  assert.equal(verdict.metrics.accrual_gap, null);
  assert.equal(verdict.metrics.operating_cash_flow_to_debt, null);

  assert.equal(verdict.red_flags.length, 0);
  assert.match(verdict.summary, /Index ETF passive basket/);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('7. Edge case: Zero total debt awards full safety points without error', () => {
  const zeroDebtData = {
    ticker: 'ZERO_DEBT_TECH',
    market_data: { cmp: 100.0, market_cap: 10000.0 },
    income_statement: {
      revenue: 5000.0,
      ebitda: 1500.0,
      ebit: 1400.0,
      interest_expense: 0.0,
      net_income: 1100.0
    },
    balance_sheet: {
      cash_and_equivalents: 2000.0,
      total_current_assets: 3000.0,
      total_assets: 8000.0,
      short_term_debt: 0.0,
      long_term_debt: 0.0,
      total_debt: 0.0,
      debt_maturing_24m: 0.0,
      total_current_liabilities: 500.0,
      total_liabilities: 1000.0,
      retained_earnings: 4000.0,
      total_equity: 7000.0
    },
    cash_flow: {
      operating_cash_flow: 1300.0
    }
  };

  const verdict = evaluateKlarmanSolvency(zeroDebtData);
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.equal(verdict.metrics.net_debt, -2000.0);
  assert.equal(verdict.metrics.interest_coverage, null);
  assert.equal(verdict.metrics.debt_maturing_24m, 0.0);
  assert.equal(verdict.metrics.cash_to_debt_maturing_ratio, null);
});

test('8. parseArgs CLI parameter parsing', () => {
  const args = parseArgs([
    '--data', 'sample/data.json',
    '--ticker', 'aapl',
    '--market', 'us',
    '--holdings', 'portfolio.json',
    '--out', 'custom_reports',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'sample/data.json');
  assert.equal(args.ticker, 'AAPL');
  assert.equal(args.market, 'US');
  assert.equal(args.holdings, 'portfolio.json');
  assert.equal(args.out, 'custom_reports');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('9. Pattern C: processDataFile generates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klarman-data-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'klarman_fortress.json');
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

test('10. Option C Portfolio Batch Mode: processHoldings generates verified VerdictBatch', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klarman-batch-test-'));
  try {
    const fortressData = loadFixture('klarman_fortress.json');
    const distressData = loadFixture('klarman_distress_cliff.json');
    const etfData = loadFixture('index_etf.json');

    const mockHoldingsSnapshot = {
      account_id: 'TEST_ACCT_KLARMAN',
      broker: 'AngelOne',
      currency: 'INR',
      timestamp: new Date().toISOString(),
      summary: {
        total_invested: 100000.0,
        total_current_value: 115000.0,
        unrealized_pnl: 15000.0,
        unrealized_pnl_pct: 15.0,
        available_cash: 5000.0,
        total_account_equity: 120000.0,
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
          ticker: 'FORTRESS_CO',
          name: 'Fortress Balance Holdings Inc',
          isin: 'US001K01011',
          exchange: 'NASDAQ',
          quantity: 100,
          average_price: 140.0,
          cmp: 150.0,
          invested_value: 14000.0,
          current_value: 15000.0,
          unrealized_pnl: 1000.0,
          unrealized_pnl_pct: 7.14,
          weight_pct: 13.04
        },
        {
          ticker: 'DISTRESS_CORP',
          name: 'Distressed Industrial Fabricators Inc',
          isin: 'US002K01012',
          exchange: 'NYSE',
          quantity: 200,
          average_price: 10.0,
          cmp: 4.5,
          invested_value: 2000.0,
          current_value: 900.0,
          unrealized_pnl: -1100.0,
          unrealized_pnl_pct: -55.0,
          weight_pct: 0.78
        },
        {
          ticker: 'VOO',
          name: 'Vanguard S&P 500 ETF',
          isin: 'US9229083632',
          exchange: 'NYSEARCA',
          quantity: 20,
          average_price: 520.0,
          cmp: 540.0,
          invested_value: 10400.0,
          current_value: 10800.0,
          unrealized_pnl: 400.0,
          unrealized_pnl_pct: 3.85,
          weight_pct: 9.39
        }
      ]
    };

    const holdingsPath = path.join(tmpDir, 'test_holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const result = await processHoldings(holdingsPath, {
      outDir: tmpDir,
      financialsMap: {
        FORTRESS_CO: fortressData,
        DISTRESS_CORP: distressData,
        VOO: etfData
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.batch.principle, 'klarman_solvency');
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

