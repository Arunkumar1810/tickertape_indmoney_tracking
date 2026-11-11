'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateAltmanZScore,
  evaluateKlarmanSolvency,
  analyzeStockWithKlarman,
  getKlarmanDiagnostics,
  recordKlarmanVerdict,
  processHoldings
} = require('../scripts/orchestrate_klarman_analysis');

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair
} = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'framework'));

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. calculateAltmanZScore computes accurate classical multivariate values', () => {
  const sample = {
    totalAssets: 1000.0,
    totalCurrentAssets: 400.0,
    totalCurrentLiabilities: 200.0,
    retainedEarnings: 300.0,
    ebit: 150.0,
    marketCap: 1200.0,
    totalLiabilities: 400.0,
    revenue: 1200.0
  };
  // X1 = 200/1000 = 0.20 -> 1.2 * 0.20 = 0.24
  // X2 = 300/1000 = 0.30 -> 1.4 * 0.30 = 0.42
  // X3 = 150/1000 = 0.15 -> 3.3 * 0.15 = 0.495
  // X4 = 1200/400 = 3.00 -> 0.6 * 3.00 = 1.80
  // X5 = 1200/1000 = 1.20 -> 0.999 * 1.20 = 1.1988
  // Z = 0.24 + 0.42 + 0.495 + 1.80 + 1.1988 = 4.1538 -> 4.15
  const z = calculateAltmanZScore(sample);
  assert.equal(z, 4.15);

  // Guards against non-positive assets or liabilities
  assert.equal(calculateAltmanZScore({ ...sample, totalAssets: 0 }), null);
  assert.equal(calculateAltmanZScore({ ...sample, totalLiabilities: -10 }), null);
});

test('2. evaluateKlarmanSolvency: Fortress net cash balance sheet scores STRONG_BUY', () => {
  const data = loadFixture('klarman_fortress.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'FORTRESS_CO');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 85.0, `Expected score >= 85.0, got ${verdict.score}`);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.ok(verdict.metrics.altman_z_score > 2.99);
  assert.ok(verdict.metrics.net_debt <= 0);
  assert.equal(verdict.metrics.debt_maturing_24m, 100.0);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('3. evaluateKlarmanSolvency: Debt maturity cliff and distress zone scores REDUCE or STRONG_SELL', () => {
  const data = loadFixture('klarman_distress_cliff.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'DISTRESS_CORP');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score <= 45.0, `Expected low score on distress cliff, got ${verdict.score}`);
  assert.ok(verdict.stance === 'REDUCE' || verdict.stance === 'STRONG_SELL');
  assert.ok(verdict.red_flags.length > 0);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('4. evaluateKlarmanSolvency: Elevated Net Debt to EBITDA is flagged', () => {
  const data = loadFixture('klarman_leveraged_ebitda.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'LEVERAGED_TEL');
  assert.ok(verdict.metrics.net_debt_to_ebitda > 2.5);
  assert.ok(verdict.score < 80.0);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('5. evaluateKlarmanSolvency: Thin interest coverage triggers risk observation', () => {
  const data = loadFixture('klarman_thin_interest_coverage.json');
  const verdict = evaluateKlarmanSolvency(data);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'THIN_COV_CORP');
  assert.ok(verdict.metrics.interest_coverage < 3.0);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('6. evaluateKlarmanSolvency: Index ETF passive bypass assigns 100 score', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateKlarmanSolvency(etfData);

  assert.equal(verdict.principle, 'klarman_solvency');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.red_flags.length, 0);

  const val = validateUniformVerdict(verdict);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
});

test('7. analyzeStockWithKlarman generates Baupost wisdom and verified artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-klarman-test-'));
  try {
    const fortressData = loadFixture('klarman_fortress.json');
    const dataPath = path.join(tmpDir, 'FORTRESS_CO.json');
    fs.writeFileSync(dataPath, JSON.stringify(fortressData, null, 2), 'utf8');

    const res = await analyzeStockWithKlarman('FORTRESS_CO', {
      data: dataPath,
      out: tmpDir,
      noPortfolio: true
    });

    assert.equal(res.ticker, 'FORTRESS_CO');
    assert.ok(res.folksy_verdict.length > 20);
    assert.ok(res.artifacts.json && fs.existsSync(res.artifacts.json));
    assert.ok(res.artifacts.html && fs.existsSync(res.artifacts.html));

    const verifyRes = verifyArtifactPair({
      jsonPath: res.artifacts.json,
      htmlPath: res.artifacts.html,
      schemaType: 'verdict'
    });
    assert.equal(verifyRes.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('8. processHoldings generates batch report and valid batch schema', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-klarman-batch-'));
  try {
    const holdingsSnapshot = {
      account_id: 'TEST_ACCT_KLARMAN',
      as_of: new Date().toISOString(),
      holdings: [
        { ticker: 'FORTRESS_CO', name: 'Fortress Co', current_price: 150.0 },
        { ticker: 'DISTRESS_CORP', name: 'Distress Corp', current_price: 25.0 }
      ]
    };
    const holdingsPath = path.join(tmpDir, 'holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(holdingsSnapshot, null, 2), 'utf8');

    const financialsMap = {
      FORTRESS_CO: loadFixture('klarman_fortress.json'),
      DISTRESS_CORP: loadFixture('klarman_distress_cliff.json')
    };

    const batchRes = await processHoldings(holdingsPath, {
      outDir: tmpDir,
      financialsMap
    });

    assert.equal(batchRes.ok, true);
    assert.equal(batchRes.batch.verdicts.length, 2);
    assert.ok(batchRes.jsonPath && fs.existsSync(batchRes.jsonPath));
    assert.ok(batchRes.htmlPath && fs.existsSync(batchRes.htmlPath));

    const batchVal = validateUniformVerdictBatch(batchRes.batch);
    assert.equal(batchVal.ok, true, `Batch validation failed: ${JSON.stringify(batchVal.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('9. getKlarmanDiagnostics returns decoupled principle metrics and checks without forced verdict', async () => {
  const fortressData = loadFixture('klarman_fortress.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-klarman-diag-'));
  try {
    const dataPath = path.join(tmpDir, 'FORTRESS_CO.json');
    fs.writeFileSync(dataPath, JSON.stringify(fortressData, null, 2), 'utf8');

    const diag = await getKlarmanDiagnostics('FORTRESS_CO', {
      data: dataPath,
      noPortfolio: true
    });

    assert.equal(diag.ticker, 'FORTRESS_CO');
    assert.ok(Array.isArray(diag.principles));
    assert.equal(diag.principles.length, 2);

    const altman = diag.principles.find(p => p.principle_id === 'altman-z-score');
    assert.ok(altman);
    assert.ok(altman.metrics.altman_z_score > 2.99);
    assert.ok(Array.isArray(altman.checks));

    const debtWall = diag.principles.find(p => p.principle_id === 'debt-maturity-wall');
    assert.ok(debtWall);
    assert.ok(debtWall.metrics.net_debt <= 0);
    assert.ok(Array.isArray(debtWall.checks));
    debtWall.checks.forEach(c => {
      assert.ok(c.name);
      assert.ok(c.criterion);
      assert.ok(c.status);
      assert.equal(c.score, undefined, 'Check items should not contain score');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('10. recordKlarmanVerdict writes verified artifacts using AI reasoned inputs with fallback', async () => {
  const fortressData = loadFixture('klarman_fortress.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-klarman-rec-'));
  try {
    const dataPath = path.join(tmpDir, 'FORTRESS_CO.json');
    fs.writeFileSync(dataPath, JSON.stringify(fortressData, null, 2), 'utf8');

    const advisorVerdict = {
      canonical_stance: 'BUY',
      actionable_call: 'BUY',
      score: 88,
      call_reason: 'Balance sheet shows pristine net cash position with fortress liquidity margin.',
      folksy_verdict: '“There are no called strikes in investing.” A pristine balance sheet allows us to wait for pitch-perfect opportunities.',
      positive: ['Immense net cash reserves eliminate debt wall vulnerability.'],
      negative: [],
      observations: ['Strong Altman Z-Score cushion protects against macro credit contraction.']
    };

    const res = await recordKlarmanVerdict('FORTRESS_CO', advisorVerdict, {
      data: dataPath,
      out: tmpDir,
      noPortfolio: true
    });

    assert.equal(res.ticker, 'FORTRESS_CO');
    assert.equal(res.verdict.stance, 'BUY');
    assert.equal(res.verdict.score, 88);
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
