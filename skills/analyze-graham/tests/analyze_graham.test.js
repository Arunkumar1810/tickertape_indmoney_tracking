'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateGrahamNumber,
  calculateNCAV,
  calculateNNWC,
  evaluateGrahamValuation,
  inferMarket,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts
} = require('../scripts/analyze_graham');

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

test('1. calculateGrahamNumber & liquidating floor math', () => {
  const gn = calculateGrahamNumber(20.0, 120.0);
  assert.equal(gn, 232.38);

  // Guards against negative or zero values
  assert.equal(calculateGrahamNumber(-5.0, 100.0), null);
  assert.equal(calculateGrahamNumber(10.0, -20.0), null);
  assert.equal(calculateGrahamNumber(0.0, 50.0), null);
});

test('2. calculateNNWC and calculateNCAV formulas', () => {
  // Cash: 180, Receivables: 80, Inventory: 60, Total Liab: 40
  // NNWC = 180 + (0.75 * 80) + (0.50 * 60) - 40 = 180 + 60 + 30 - 40 = 230
  const nnwc = calculateNNWC(180, 80, 60, 40);
  assert.equal(nnwc, 230.0);

  // NCAV = Current Assets (320) - Total Liab (40) = 280
  const ncav = calculateNCAV(320, 40);
  assert.equal(ncav, 280.0);
});

test('3. evaluateGrahamValuation: Classic deep value discount', () => {
  const valueData = loadFixture('graham_deep_value.json');
  const verdict = evaluateGrahamValuation(valueData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'VALUE_CO');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 80.0, `Score should be >= 80.0, got ${verdict.score}`);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.equal(verdict.metrics.graham_number, 232.38);
  assert.ok(verdict.metrics.margin_of_safety_pct > 30.0);
  assert.ok(verdict.metrics.current_ratio >= 2.0);
  assert.ok(verdict.metrics.pe_x_pb <= 22.5);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('4. evaluateGrahamValuation: Net-Net bargain floor bonus', () => {
  const netNetData = loadFixture('graham_net_net.json');
  const verdict = evaluateGrahamValuation(netNetData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'NET_NET_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.ok(verdict.score >= 90.0, `Net-Net bargain must score >= 90.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('GRAHAM NET-NET BARGAIN')));
  assert.ok(verdict.metrics.nnwc_per_share >= netNetData.market_data.cmp);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateGrahamValuation: Growth stock overvaluation and multiple stretch', () => {
  const expData = loadFixture('graham_overvalued.json');
  const verdict = evaluateGrahamValuation(expData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'EXPENSIVE_TECH');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score < 35.0, `Overvalued stock score must be < 35.0, got ${verdict.score}`);
  assert.ok(['REDUCE', 'STRONG_SELL'].includes(verdict.stance));
  assert.ok(verdict.metrics.margin_of_safety_pct < 0);
  assert.ok(verdict.red_flags.some(f => f.includes('Graham ceiling') || f.includes('valuation')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateGrahamValuation: Negative EPS handles null Graham Number safely', () => {
  const negData = loadFixture('graham_negative_eps.json');
  const verdict = evaluateGrahamValuation(negData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'UNPROFITABLE_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.metrics.graham_number, null);
  assert.equal(verdict.metrics.margin_of_safety_pct, null);
  assert.ok(verdict.score < 50.0);
  assert.ok(verdict.red_flags.some(f => f.includes('Negative or zero EPS')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. evaluateGrahamValuation: Broad market Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateGrahamValuation(etfData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.metrics.graham_number, null);
  assert.equal(verdict.red_flags.length, 0);
  assert.ok(verdict.summary.includes('Index ETF passive basket'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('8. CLI parsing: parseArgs options and flags', () => {
  const args = parseArgs([
    '--data', 'custom/report.json',
    '--ticker', 'msft',
    '--market', 'us',
    '--holdings', 'portfolio.json',
    '--out', 'custom_reports',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'custom/report.json');
  assert.equal(args.ticker, 'MSFT');
  assert.equal(args.market, 'US');
  assert.equal(args.holdings, 'portfolio.json');
  assert.equal(args.out, 'custom_reports');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('9. Pattern C: processDataFile creates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graham-data-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'graham_deep_value.json');
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graham-batch-test-'));
  try {
    const valueData = loadFixture('graham_deep_value.json');
    const netNetData = loadFixture('graham_net_net.json');
    const etfData = loadFixture('index_etf.json');

    const mockHoldingsSnapshot = {
      account_id: 'TEST_ACCT_02',
      broker: 'AngelOne',
      currency: 'INR',
      timestamp: new Date().toISOString(),
      summary: {
        total_invested: 50000.0,
        total_current_value: 65000.0,
        unrealized_pnl: 15000.0,
        unrealized_pnl_pct: 30.0,
        available_cash: 2000.0,
        total_account_equity: 67000.0,
        holdings_count: 3
      },
      margin: {
        available_cash: 2000.0,
        collateral: 0.0,
        utilised: 0.0,
        net_margin: 2000.0
      },
      holdings: [
        {
          ticker: 'VALUE_CO',
          name: 'Classic Value Manufacturing Ltd',
          isin: 'INE001A01011',
          exchange: 'NSE',
          quantity: 100,
          average_price: 130.0,
          cmp: 150.0,
          invested_value: 13000.0,
          current_value: 15000.0,
          unrealized_pnl: 2000.0,
          unrealized_pnl_pct: 15.38,
          weight_pct: 23.08
        },
        {
          ticker: 'NET_NET_CO',
          name: 'Liquidating Asset Holdings Corp',
          isin: 'US002B01012',
          exchange: 'NASDAQ',
          quantity: 200,
          average_price: 18.0,
          cmp: 20.0,
          invested_value: 3600.0,
          current_value: 4000.0,
          unrealized_pnl: 400.0,
          unrealized_pnl_pct: 11.11,
          weight_pct: 6.15
        },
        {
          ticker: 'VOO',
          name: 'Vanguard S&P 500 ETF',
          isin: 'US9229083632',
          exchange: 'NYSEARCA',
          quantity: 10,
          average_price: 500.0,
          cmp: 542.8,
          invested_value: 5000.0,
          current_value: 5428.0,
          unrealized_pnl: 428.0,
          unrealized_pnl_pct: 8.56,
          weight_pct: 8.35
        }
      ]
    };

    const holdingsPath = path.join(tmpDir, 'mock_holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const result = await processHoldings(holdingsPath, {
      outDir: tmpDir,
      financialsMap: {
        VALUE_CO: valueData,
        NET_NET_CO: netNetData,
        VOO: etfData
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.batch.principle, 'graham');
    assert.equal(result.batch.verdicts.length, 3);

    const valV = result.batch.verdicts.find(v => v.ticker === 'VALUE_CO');
    const netV = result.batch.verdicts.find(v => v.ticker === 'NET_NET_CO');
    const vooV = result.batch.verdicts.find(v => v.ticker === 'VOO');

    assert.equal(valV.stance, 'STRONG_BUY');
    assert.equal(netV.stance, 'STRONG_BUY');
    assert.equal(vooV.stance, 'HOLD');

    // Batch Schema Validation
    const batchValidation = validateUniformVerdictBatch(result.batch);
    assert.equal(batchValidation.ok, true, `Batch validation failed: ${JSON.stringify(batchValidation.errors)}`);

    // File existence & self-containment
    assert.ok(fs.existsSync(result.jsonPath), `Batch JSON missing: ${result.jsonPath}`);
    assert.ok(fs.existsSync(result.htmlPath), `Batch HTML missing: ${result.htmlPath}`);

    const htmlContent = fs.readFileSync(result.htmlPath, 'utf8');
    const containment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(containment.ok, true, `Batch HTML containment failed: ${JSON.stringify(containment.errors)}`);
    assert.equal(containment.summary.externalLeaksCount, 0);

    // Pair verification
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

