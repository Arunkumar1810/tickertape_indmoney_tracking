'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  evaluateForensicGovernance,
  evaluateSchilitForensic,
  getSchilitDiagnostics,
  recordSchilitVerdict,
  analyzeStockWithSchilit,
  parseArgs,
  processDataFile,
  processHoldings
} = require('../scripts/orchestrate_schilit_analysis');

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../../scripts/framework');

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
  assert.ok(verdict.score <= 20.0, `Score should be <= 20.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('Promoter pledged shares at critical level') && f.includes('68.5%')));
  assert.ok(verdict.summary.includes('HARD VETO DISQUALIFIED'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('3. evaluateForensicGovernance: Auditor resignation hard veto', () => {
  const auditorData = loadFixture('auditor_resignation_veto.json');
  const verdict = evaluateForensicGovernance(auditorData);

  assert.equal(verdict.principle, 'forensic_governance');
  assert.equal(verdict.ticker, 'AUDITOR_VETO');
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0, `Score should be <= 20.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('auditor resignation')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('4. evaluateForensicGovernance: Earnings manipulation and accrual distortion hard veto', () => {
  const fraudData = loadFixture('earnings_manipulation_veto.json');
  const verdict = evaluateForensicGovernance(fraudData);

  assert.equal(verdict.principle, 'forensic_governance');
  assert.equal(verdict.ticker, 'MANIPULATION_VETO');
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.score <= 20.0, `Score should be <= 20.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('Beneish M-Score')));
  assert.ok(verdict.red_flags.some(f => f.includes('Sloan accrual ratio')));
  assert.ok(verdict.red_flags.some(f => f.includes('related-party transactions')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateForensicGovernance: Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateForensicGovernance(etfData);

  assert.equal(verdict.principle, 'forensic_governance');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.stance, 'PASS');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.red_flags.length, 0);
  assert.ok(verdict.summary.includes('Index ETF passive basket'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateForensicGovernance: Non-veto warning flag thresholding', () => {
  const warningData = loadFixture('clean_pass.json');
  const mod = JSON.parse(JSON.stringify(warningData));
  mod.forensics.promoter_pledge_pct = 15.0; // 10-25% triggers 15pt deduction
  mod.forensics.dso_yoy_expansion_pct = 25.0; // > 20% triggers 15pt deduction
  mod.forensics.surveillance_stage = 'STAGE_1'; // triggers 25pt deduction

  const verdict = evaluateForensicGovernance(mod);
  assert.equal(verdict.stance, 'FLAG');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score < 60.0, `Score should be < 60.0, got ${verdict.score}`);
  assert.equal(verdict.red_flags.length, 3);
  assert.ok(verdict.summary.includes('FLAG: Elevated forensic risk detected'));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. evaluateForensicGovernance: Surveillance stage 4 triggers hard veto', () => {
  const survData = loadFixture('clean_pass.json');
  const mod = JSON.parse(JSON.stringify(survData));
  mod.forensics.surveillance_stage = 'STAGE_4';

  const verdict = evaluateForensicGovernance(mod);
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.red_flags.some(f => f.includes('heightened regulatory surveillance')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('8. evaluateForensicGovernance: Stock-based compensation dilution > 10% triggers hard veto', () => {
  const sbcData = loadFixture('clean_pass.json');
  const mod = JSON.parse(JSON.stringify(sbcData));
  mod.forensics.sbc_dilution_pct = 12.5;

  const verdict = evaluateForensicGovernance(mod);
  assert.equal(verdict.stance, 'VETO_DISQUALIFIED');
  assert.equal(verdict.is_veto, true);
  assert.ok(verdict.red_flags.some(f => f.includes('stock-based compensation dilution')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('9. analyzeStockWithSchilit: Advisory speech & gatekeeper vetting', async () => {
  const cleanData = loadFixture('clean_pass.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schilit-speech-test-'));
  try {
    const filePath = path.join(tmpDir, 'INFY.json');
    fs.writeFileSync(filePath, JSON.stringify(cleanData, null, 2), 'utf8');

    const res = await analyzeStockWithSchilit('INFY', {
      data: filePath,
      noWrite: true
    });

    assert.equal(res.ok, true);
    assert.equal(res.ticker, 'INFY');
    assert.equal(res.stance, 'PASS');
    assert.equal(res.isVeto, false);
    assert.ok(res.speech.includes('HOWARD SCHILIT — FORENSIC ACCOUNTING AUDIT'));
    assert.ok(res.speech.includes('Spotless forensic audit trail verified'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('10. CLI parsing: parseArgs parses options accurately', () => {
  const args = parseArgs([
    '--data', 'custom/data.json',
    '--ticker', 'infy',
    '--market', 'in',
    '--holdings', 'portfolio.json',
    '--out', 'output_dir',
    '--refresh',
    '--json-output'
  ]);

  assert.equal(args.data, 'custom/data.json');
  assert.equal(args.ticker, 'INFY');
  assert.equal(args.market, 'IN');
  assert.equal(args.holdings, 'portfolio.json');
  assert.equal(args.out, 'output_dir');
  assert.equal(args.refresh, true);
  assert.equal(args.jsonOutput, true);
});

test('11. Pattern C: processDataFile creates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schilit-data-test-'));
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

test('12. Option C Portfolio Batch Mode: processHoldings generates verified VerdictBatch', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schilit-batch-test-'));
  try {
    const cleanData = loadFixture('clean_pass.json');
    const pledgeData = loadFixture('promoter_pledge_veto.json');
    const etfData = loadFixture('index_etf.json');

    const mockHoldingsSnapshot = {
      account_id: 'TEST_ACCT_01',
      broker: 'AngelOne',
      currency: 'INR',
      timestamp: new Date().toISOString(),
      summary: {
        total_invested: 100000.0,
        total_current_value: 120000.0,
        unrealized_pnl: 20000.0,
        unrealized_pnl_pct: 20.0,
        available_cash: 5000.0,
        total_account_equity: 125000.0,
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
          name: 'Infosys Limited',
          isin: 'INE009A01021',
          exchange: 'NSE',
          quantity: 50,
          average_price: 1500.0,
          cmp: 1600.0,
          invested_value: 75000.0,
          current_value: 80000.0,
          unrealized_pnl: 5000.0,
          unrealized_pnl_pct: 6.67,
          weight_pct: 66.67
        },
        {
          ticker: 'HIGH_PLEDGE',
          name: 'High Pledge Industries Ltd',
          isin: 'INE001A01011',
          exchange: 'NSE',
          quantity: 100,
          average_price: 200.0,
          cmp: 180.0,
          invested_value: 20000.0,
          current_value: 18000.0,
          unrealized_pnl: -2000.0,
          unrealized_pnl_pct: -10.0,
          weight_pct: 15.0
        },
        {
          ticker: 'VOO',
          name: 'Vanguard S&P 500 ETF',
          isin: 'US9229083632',
          exchange: 'NYSEARCA',
          quantity: 5,
          average_price: 500.0,
          cmp: 540.0,
          invested_value: 2500.0,
          current_value: 2700.0,
          unrealized_pnl: 200.0,
          unrealized_pnl_pct: 8.0,
          weight_pct: 18.33
        }
      ]
    };

    const finDir = path.join(tmpDir, 'financials');
    fs.mkdirSync(finDir, { recursive: true });
    fs.writeFileSync(path.join(finDir, 'INFY.json'), JSON.stringify(cleanData, null, 2), 'utf8');
    fs.writeFileSync(path.join(finDir, 'HIGH_PLEDGE.json'), JSON.stringify(pledgeData, null, 2), 'utf8');
    fs.writeFileSync(path.join(finDir, 'VOO.json'), JSON.stringify(etfData, null, 2), 'utf8');

    const holdingsPath = path.join(tmpDir, 'holdings_snapshot.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(mockHoldingsSnapshot, null, 2), 'utf8');

    const batchResult = await processHoldings(holdingsPath, { outDir: tmpDir });

    assert.equal(batchResult.ok, true);
    assert.equal(batchResult.batch.principle, 'forensic_governance');
    assert.equal(batchResult.batch.verdicts.length, 3);

    const validation = validateUniformVerdictBatch(batchResult.batch);
    assert.equal(validation.ok, true, `Batch validation failed: ${JSON.stringify(validation.errors)}`);

    const pairResult = verifyArtifactPair({
      jsonPath: batchResult.jsonPath,
      htmlPath: batchResult.htmlPath,
      schemaType: 'verdict-batch'
    });
    assert.equal(pairResult.ok, true, `Batch pair verification failed: ${JSON.stringify(pairResult.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('13. getSchilitDiagnostics returns decoupled forensic principle metrics and qualitative checks', async () => {
  const cleanData = loadFixture('clean_pass.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-schilit-diag-'));
  try {
    const dataPath = path.join(tmpDir, 'INFY.json');
    fs.writeFileSync(dataPath, JSON.stringify(cleanData, null, 2), 'utf8');

    const diag = await getSchilitDiagnostics('INFY', {
      data: dataPath,
      noPortfolio: true
    });

    assert.equal(diag.ticker, 'INFY');
    assert.ok(Array.isArray(diag.principles));
    assert.equal(diag.principles.length, 2);

    const acct = diag.principles.find(p => p.principle_id === 'accounting-integrity');
    assert.ok(acct);
    assert.ok(Array.isArray(acct.checks));
    acct.checks.forEach(c => {
      assert.ok(c.name);
      assert.ok(c.criterion);
      assert.ok(c.status);
      assert.equal(c.score, undefined, 'Check items must not have a score column');
    });

    const prom = diag.principles.find(p => p.principle_id === 'promoter-pledging');
    assert.ok(prom);
    assert.ok(Array.isArray(prom.checks));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('14. recordSchilitVerdict writes verified artifacts using AI reasoned inputs with fallback', async () => {
  const cleanData = loadFixture('clean_pass.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-schilit-rec-'));
  try {
    const dataPath = path.join(tmpDir, 'INFY.json');
    fs.writeFileSync(dataPath, JSON.stringify(cleanData, null, 2), 'utf8');

    const advisorVerdict = {
      canonical_stance: 'PASS',
      actionable_call: 'BUY',
      score: 95,
      call_reason: 'Impeccable accounting integrity with negative Beneish M-Score and zero promoter pledging.',
      folksy_verdict: '“Behind the numbers lie the people.” Pristine corporate governance and verified cash flow continuity.',
      positive: ['Beneish M-Score of -2.85 confirms zero probability of revenue distortion.'],
      negative: [],
      observations: ['Auditor tenure has been continuous and independent with clean opinions.']
    };

    const res = await recordSchilitVerdict('INFY', advisorVerdict, {
      data: dataPath,
      out: tmpDir
    });

    assert.equal(res.ticker, 'INFY');
    assert.equal(res.verdict.stance, 'PASS');
    assert.equal(res.verdict.score, 95);
    assert.equal(res.verdict.is_veto, false);
    assert.equal(res.verdict.positive[0], advisorVerdict.positive[0]);
    assert.ok(res.artifacts.json && fs.existsSync(res.artifacts.json));
    assert.ok(res.artifacts.html && fs.existsSync(res.artifacts.html));

    const verify = verifyArtifactPair({
      jsonPath: res.artifacts.json,
      htmlPath: res.artifacts.html,
      schemaType: 'verdict'
    });
    assert.equal(verify.ok, true, `Artifact verification failed: ${JSON.stringify(verify.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
