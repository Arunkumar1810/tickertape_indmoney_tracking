'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  calculateGrahamNumber,
  evaluateGrahamValuation,
  analyzeStockWithGraham,
  processHoldings
} = require('../scripts/orchestrate_graham_analysis');

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

test('1. calculateGrahamNumber & liquidating floor math', () => {
  const gn = calculateGrahamNumber(20.0, 120.0);
  assert.equal(gn, 232.38);

  // Guards against negative or zero values
  assert.equal(calculateGrahamNumber(-5.0, 100.0), null);
  assert.equal(calculateGrahamNumber(10.0, -20.0), null);
  assert.equal(calculateGrahamNumber(0.0, 50.0), null);
});

test('2. evaluateGrahamValuation: Classic deep value discount', () => {
  const valueData = loadFixture('graham_deep_value.json');
  const verdict = evaluateGrahamValuation(valueData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'VALUE_CO');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score >= 70.0, `Score should be >= 70.0, got ${verdict.score}`);
  assert.ok(verdict.stance === 'STRONG_BUY' || verdict.stance === 'BUY');
  assert.equal(verdict.metrics.graham_number, 232.38);
  assert.ok(verdict.metrics.margin_of_safety_pct > 30.0);
  assert.ok(verdict.metrics.current_ratio >= 2.0);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('3. evaluateGrahamValuation: Net-Net bargain floor bonus', () => {
  const netNetData = loadFixture('graham_net_net.json');
  const verdict = evaluateGrahamValuation(netNetData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'NET_NET_CO');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.stance, 'STRONG_BUY');
  assert.ok(verdict.score >= 90.0, `Net-Net bargain must score >= 90.0, got ${verdict.score}`);
  assert.ok(verdict.red_flags.some(f => f.includes('GRAHAM NET-NET BARGAIN')));

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('4. evaluateGrahamValuation: Growth stock overvaluation and multiple stretch', () => {
  const expData = loadFixture('graham_overvalued.json');
  const verdict = evaluateGrahamValuation(expData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'EXPENSIVE_TECH');
  assert.equal(verdict.is_veto, false);
  assert.ok(verdict.score <= 45.0, `Overvalued stock score should be <= 45.0, got ${verdict.score}`);
  assert.ok(verdict.stance === 'REDUCE' || verdict.stance === 'STRONG_SELL');
  assert.ok(verdict.metrics.margin_of_safety_pct < 0);
  assert.ok(verdict.red_flags.length > 0);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('5. evaluateGrahamValuation: Negative EPS handling', () => {
  const negData = loadFixture('graham_negative_eps.json');
  const verdict = evaluateGrahamValuation(negData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'UNPROFITABLE_CO');
  assert.equal(verdict.metrics.graham_number, null);
  assert.equal(verdict.metrics.margin_of_safety_pct, null);
  assert.ok(verdict.score <= 40.0);
  assert.ok(verdict.stance === 'REDUCE' || verdict.stance === 'STRONG_SELL');

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('6. evaluateGrahamValuation: Index ETF passive bypass', () => {
  const etfData = loadFixture('index_etf.json');
  const verdict = evaluateGrahamValuation(etfData);

  assert.equal(verdict.principle, 'graham');
  assert.equal(verdict.ticker, 'VOO');
  assert.equal(verdict.score, 100.0);
  assert.equal(verdict.stance, 'HOLD');
  assert.equal(verdict.is_veto, false);
  assert.equal(verdict.red_flags.length, 0);

  const validation = validateUniformVerdict(verdict);
  assert.equal(validation.ok, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
});

test('7. analyzeStockWithGraham generates Dean of Wall Street wisdom and artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-graham-test-'));
  try {
    const valueData = loadFixture('graham_deep_value.json');
    const dataPath = path.join(tmpDir, 'VALUE_CO.json');
    fs.writeFileSync(dataPath, JSON.stringify(valueData, null, 2), 'utf8');

    const res = await analyzeStockWithGraham('VALUE_CO', {
      data: dataPath,
      out: tmpDir,
      noPortfolio: true
    });

    assert.equal(res.ticker, 'VALUE_CO');
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-graham-batch-'));
  try {
    const holdingsSnapshot = {
      account_id: 'TEST_ACCT',
      as_of: new Date().toISOString(),
      holdings: [
        { ticker: 'VALUE_CO', name: 'Value Co', current_price: 100.0 },
        { ticker: 'NET_NET_CO', name: 'Net Net Co', current_price: 40.0 }
      ]
    };
    const holdingsPath = path.join(tmpDir, 'holdings.json');
    fs.writeFileSync(holdingsPath, JSON.stringify(holdingsSnapshot, null, 2), 'utf8');

    const financialsMap = {
      VALUE_CO: loadFixture('graham_deep_value.json'),
      NET_NET_CO: loadFixture('graham_net_net.json')
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
