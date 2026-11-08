'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  evaluateForensicGovernance,
  inferMarket,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts
} = require('../scripts/forensic_governance');

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

test('1. evaluateForensicGovernance: Clean pass company evaluation', () => {
  const cleanData = loadFixture('clean_pass.json');
  const verdict = evaluateForensicGovernance(cleanData);

  assert.equal(verdict.principle, 'forensic_governance');
  assert.equal(verdict.ticker, 'INFY');
  assert.equal(verdict.stance, 'PASS');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 60.0, `Score should be >= 60.0, got ${verdict.score}`);
  assert.equal(verdict.red_flags.length, 0);
  assert.equal(verdict.metrics.promoter_pledging_pct, 0.0);
  assert.equal(verdict.metrics.beneish_m_score, -2.85);
  assert.equal(verdict.metrics.sloan_accrual_ratio, 0.035);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('2. evaluateForensicGovernance: Promoter Pledging > 50% hard veto', () => {
  const pledgeData = loadFixture('promoter_pledge_veto.json');
  const verdict = evaluateForensicGovernance(pledgeData);

  assert.equal(verdict.principle, 'forensic_governance');
  assert.equal(verdict.ticker, 'HIGH_PLEDGE');
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0, `Score must be <= 20.0 on hard veto, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('Promoter pledged shares at critical level')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('3. evaluateForensicGovernance: Auditor resignation hard veto', () => {
  const auditorData = loadFixture('auditor_resignation_veto.json');
  const verdict = evaluateForensicGovernance(auditorData);

  assert.equal(verdict.ticker, 'AUDITOR_VETO');
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0, `Score must be <= 20.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('auditor resignation')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('4. evaluateForensicGovernance: Earnings manipulation and accrual distortion hard veto', () => {
  const manipData = loadFixture('earnings_manipulation_veto.json');
  const verdict = evaluateForensicGovernance(manipData);

  assert.equal(verdict.ticker, 'MANIPULATION_VETO');
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0, `Score must be <= 20.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('Beneish M-Score')));
  assert.ok(verdict.red_flags.some(f => f.includes('Sloan accrual ratio')));
  assert.ok(verdict.red_flags.some(f => f.includes('related-party transactions')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateForensicGovernance: Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateForensicGovernance(etfData);

  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.stance, 'PASS');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.red_flags.length, 0);
  assert.ok(verdict.summary.includes('Index ETF passive basket'));
  assert.equal(verdict.metrics.promoter_pledging_pct, null);
  assert.equal(verdict.metrics.beneish_m_score, null);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateForensicGovernance: Non-veto warning flag thresholding', () => {
  const baseData = loadFixture('clean_pass.json');
  const warningData = JSON.parse(JSON.stringify(baseData));
  warningData.ticker = 'WARNING_CO';
  // Moderate pledging (30%) + elevated DSO expansion (25%) -> warning flags
  warningData.forensics.promoter_pledge_pct = 30.0;
  warningData.forensics.dso_yoy_expansion_pct = 25.0;

  const verdict = evaluateForensicGovernance(warningData);

  assert.equal(verdict.ticker, 'WARNING_CO');
  assert.equal(verdict.stance, 'FLAG');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 20.0 && verdict.score < 60.0, `Score should be in [20, 59.9], got ${verdict.score}`);
  assert.ok(verdict.red_flags.length >= 2);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. evaluateForensicGovernance: Surveillance stage 4 triggers hard veto', () => {
  const baseData = loadFixture('clean_pass.json');
  const survData = JSON.parse(JSON.stringify(baseData));
  survData.ticker = 'SURV_CO';
  survData.forensics.surveillance_stage = 'STAGE_4';

  const verdict = evaluateForensicGovernance(survData);
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0);
  assert.ok(verdict.red_flags.some(f => f.includes('heightened regulatory surveillance')));
});

test('8. evaluateForensicGovernance: Stock-based compensation dilution > 10% triggers hard veto', () => {
  const baseData = loadFixture('clean_pass.json');
  const dilutionData = JSON.parse(JSON.stringify(baseData));
  dilutionData.ticker = 'DILUTE_CO';
  dilutionData.cash_flow.stock_based_compensation = 25000.0; // 25,000 / 158,381 = 15.8% of revenue

  const verdict = evaluateForensicGovernance(dilutionData);
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.red_flags.some(f => f.includes('stock-based compensation dilution')));
});

test('9. CLI parsing: parseArgs parses options accurately', () => {
  const args = parseArgs([
    '--data', 'custom/data.json',
    '--ticker', 'aapl',
    '--market', 'us',
    '--holdings', 'accounts/my_holdings.json',
    '--out', 'output_dir',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'custom/data.json');
  assert.equal(args.ticker, 'AAPL');
  assert.equal(args.market, 'US');
  assert.equal(args.holdings, 'accounts/my_holdings.json');
  assert.equal(args.out, 'output_dir');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('10. Pattern C: processDataFile creates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-data-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'clean_pass.json');
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-batch-test-'));
  try {
    const cleanData = loadFixture('clean_pass.json');
    const pledgeData = loadFixture('promoter_pledge_veto.json');
    const etfData = loadFixture('index_etf.json');

    // Create a mock holdings snapshot
    const mockHoldingsSnapshot = {
      account_id: 'TEST_DEMAT_01',
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
          ticker: 'INFY',
          name: 'Infosys Ltd',
          isin: 'INE009A01021',
          exchange: 'NSE',
          quantity: 20,
          average_price: 1500.0,
          cmp: 1850.5,
          invested_value: 30000.0,
          current_value: 37010.0,
          unrealized_pnl: 7010.0,
          unrealized_pnl_pct: 23.37,
          weight_pct: 29.6
        },
        {
          ticker: 'HIGH_PLEDGE',
          name: 'High Pledge Infrastructure Ltd',
          isin: 'INE123B01019',
          exchange: 'NSE',
          quantity: 500,
          average_price: 55.0,
          cmp: 45.2,
          invested_value: 27500.0,
          current_value: 22600.0,
          unrealized_pnl: -4900.0,
          unrealized_pnl_pct: -17.82,
          weight_pct: 18.08
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
          weight_pct: 4.34
        }
      ]
    };

    const holdingsFilePath = path.join(tmpDir, 'mock_holdings.json');
    fs.writeFileSync(holdingsFilePath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const result = await processHoldings(holdingsFilePath, {
      outDir: tmpDir,
      financialsMap: {
        INFY: cleanData,
        HIGH_PLEDGE: pledgeData,
        VOO: etfData
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.batch.principle, 'forensic_governance');
    assert.equal(result.batch.verdicts.length, 3);

    const infyV = result.batch.verdicts.find(v => v.ticker === 'INFY');
    const pledgeV = result.batch.verdicts.find(v => v.ticker === 'HIGH_PLEDGE');
    const vooV = result.batch.verdicts.find(v => v.ticker === 'VOO');

    assert.equal(infyV.stance, 'PASS');
    assert.equal(pledgeV.stance, 'VETO_DISQUALIFIED');
    assert.equal(pledgeV.is_veto, true);
    assert.equal(vooV.stance, 'PASS');

    // Schema Validation
    const batchValidation = validateUniformVerdictBatch(result.batch);
    assert.equal(batchValidation.ok, true, `Batch validation failed: ${JSON.stringify(batchValidation.errors)}`);

    // Files existence
    assert.ok(fs.existsSync(result.jsonPath), `Batch JSON missing: ${result.jsonPath}`);
    assert.ok(fs.existsSync(result.htmlPath), `Batch HTML missing: ${result.htmlPath}`);

    // Self-containment
    const htmlContent = fs.readFileSync(result.htmlPath, 'utf8');
    const containment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(containment.ok, true, `HTML containment failed: ${JSON.stringify(containment.errors)}`);
    assert.equal(containment.summary.externalLeaksCount, 0);

    // Pair verification
    const pairResult = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'verdict-batch'
    });
    assert.equal(pairResult.ok, true, `Batch artifact pair verification failed: ${JSON.stringify(pairResult.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

