'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  validateVerdictSynthesis,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../scripts/framework');

const {
  evaluateGatekeeperShortCircuit
} = require('../scripts/lib/gatekeeper_short_circuit');
const {
  evaluateDownsideGuardrail
} = require('../scripts/lib/downside_guardrail');
const {
  synthesizeSecurityVerdicts,
  synthesizePortfolio,
  scoreToBaselineStance,
  normalizePrincipleName
} = require('../scripts/lib/verdict_synthesizer');
const {
  renderHtml,
  writeArtifacts,
  processVerdicts,
  processStrategyWay,
  parseArgs
} = require('../scripts/guardrail_engine');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test('1. evaluateGatekeeperShortCircuit: Veto trigger and clean pass behavior', () => {
  // Hard veto by is_veto
  const veto1 = evaluateGatekeeperShortCircuit({
    principle: 'forensic_governance',
    stance: 'VETO_DISQUALIFIED',
    is_veto: true,
    score: 20.0,
    red_flags: ['Promoter pledge 55%']
  });
  assert.equal(veto1.short_circuited, true);
  assert.equal(veto1.is_disqualified, true);
  assert.equal(veto1.synthesized_stance, 'DISQUALIFIED');
  assert.equal(veto1.synthesized_score, 0.0);
  assert.equal(veto1.recommended_allocation_pct, 0.0);
  assert.ok(veto1.notes.some(n => n.includes('GATEKEEPER VETO')));

  // Clean pass
  const pass = evaluateGatekeeperShortCircuit({
    principle: 'forensic_governance',
    stance: 'PASS',
    is_veto: false,
    score: 95.0,
    red_flags: []
  });
  assert.equal(pass.short_circuited, false);
  assert.equal(pass.is_disqualified, false);
  assert.equal(pass.gatekeeper_clean, true);

  // Non-fatal flag
  const flag = evaluateGatekeeperShortCircuit({
    principle: 'forensic_governance',
    stance: 'FLAG',
    is_veto: false,
    score: 65.0,
    red_flags: ['Minor audit delay']
  });
  assert.equal(flag.short_circuited, false);
  assert.equal(flag.is_disqualified, false);
  assert.equal(flag.gatekeeper_clean, false);
  assert.ok(flag.notes.some(n => n.includes('Gatekeeper Notice')));
});

test('2. evaluateDownsideGuardrail: Intercepts STRONG_SELL and passes other stances', () => {
  // Strong Sell from Lynch
  const res1 = evaluateDownsideGuardrail({
    graham: { principle: 'graham', score: 85.0, stance: 'BUY' },
    lynch: { principle: 'lynch', score: 20.0, stance: 'STRONG_SELL', red_flags: ['Extreme PEG bubble'] }
  });
  assert.equal(res1.guardrail_triggered, true);
  assert.equal(res1.synthesized_stance, 'NEEDS_REVIEW');
  assert.deepEqual(res1.offending_principles, ['lynch']);
  assert.ok(res1.notes.some(n => n.includes('DOWNSIDE GUARDRAIL TRIGGERED')));

  // All non-strong sell
  const res2 = evaluateDownsideGuardrail({
    graham: { principle: 'graham', score: 75.0, stance: 'BUY' },
    buffett_munger: { principle: 'buffett_munger', score: 85.0, stance: 'STRONG_BUY' },
    klarman: { principle: 'klarman_solvency', score: 45.0, stance: 'REDUCE' }
  });
  assert.equal(res2.guardrail_triggered, false);
  assert.equal(res2.synthesized_stance, undefined);
  assert.equal(res2.offending_principles.length, 0);
});

test('3. synthesizeSecurityVerdicts: Evaluates fixtures accurately', () => {
  // 1. Disqualified fixture
  const disqFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample_disqualified_stock.json'), 'utf8'));
  const disqRes = synthesizeSecurityVerdicts(disqFixture);
  assert.equal(disqRes.ticker, 'BADCORP');
  assert.equal(disqRes.is_disqualified, true);
  assert.equal(disqRes.synthesized_stance, 'DISQUALIFIED');
  assert.equal(disqRes.synthesized_score, 0.0);
  assert.equal(disqRes.recommended_allocation_pct, 0.0);

  // 2. Guardrail review fixture (Lynch STRONG_SELL)
  const reviewFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample_guardrail_review_stock.json'), 'utf8'));
  const reviewRes = synthesizeSecurityVerdicts(reviewFixture);
  assert.equal(reviewRes.ticker, 'RISKYTECH');
  assert.equal(reviewRes.is_disqualified, false);
  assert.equal(reviewRes.guardrail_triggered, true);
  assert.equal(reviewRes.synthesized_stance, 'NEEDS_REVIEW');
  assert.ok(reviewRes.synthesized_score > 60.0); // High score despite review

  // 3. Approved fixture (INFY)
  const appFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample_approved_stock.json'), 'utf8'));
  const appRes = synthesizeSecurityVerdicts(appFixture, {
    'analyze-graham': 0.25,
    'analyze-lynch': 0.25,
    'agent-buffet': 0.30,
    'analyze-klarman-solvency': 0.20
  });
  assert.equal(appRes.ticker, 'INFY');
  assert.equal(appRes.is_disqualified, false);
  assert.equal(appRes.guardrail_triggered, false);
  assert.equal(appRes.synthesized_stance, 'STRONG_BUY');
  assert.ok(appRes.synthesized_score >= 80.0);
});

test('4. REDUCE Ceiling Rule: Capped at HOLD when any principle signals REDUCE', () => {
  const stockWithReduce = {
    ticker: 'LEVCORP',
    verdicts: [
      { principle: 'forensic_governance', score: 90.0, stance: 'PASS', is_veto: false, red_flags: [] },
      { principle: 'graham', score: 85.0, stance: 'STRONG_BUY', is_veto: false, red_flags: [] },
      { principle: 'buffett_munger', score: 85.0, stance: 'STRONG_BUY', is_veto: false, red_flags: [] },
      { principle: 'klarman_solvency', score: 40.0, stance: 'REDUCE', is_veto: false, red_flags: ['Debt wall'] }
    ]
  };

  const res = synthesizeSecurityVerdicts(stockWithReduce, {
    graham: 0.35,
    buffett_munger: 0.35,
    klarman_solvency: 0.30
  });

  // Composite score: 85*0.35 + 85*0.35 + 40*0.30 = 29.75 + 29.75 + 12 = 71.5 (Normally BUY)
  assert.ok(res.synthesized_score >= 65.0, `Expected score >= 65, got ${res.synthesized_score}`);
  assert.equal(res.synthesized_stance, 'HOLD');
  assert.ok(res.notes.some(n => n.includes('CEILING RULE: Synthesized stance capped at HOLD')));
});

test('5. synthesizePortfolio: Multi-stock portfolio posture and allocation rebalancing', () => {
  const portfolioFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample_portfolio_verdicts.json'), 'utf8'));
  const portfolio = synthesizePortfolio({
    strategy_id: portfolioFixture.strategy_id,
    eval_date: portfolioFixture.eval_date,
    stocks: portfolioFixture.stocks,
    manifestWeights: {
      'analyze-graham': 0.25,
      'analyze-lynch': 0.25,
      'agent-buffet': 0.30,
      'analyze-klarman-solvency': 0.20
    }
  });

  // Validate Contract
  const val = validateVerdictSynthesis(portfolio);
  assert.equal(val.ok, true, `Contract invalid: ${JSON.stringify(val.errors)}`);

  // Assert counts
  assert.equal(portfolio.summary.total_positions, 4);
  assert.equal(portfolio.summary.disqualified_count, 1); // BADCORP
  assert.equal(portfolio.summary.needs_review_count, 1); // RISKYTECH
  assert.equal(portfolio.summary.approved_count, 2); // INFY, LEVCORP

  // Assert capital at risk (BADCORP 100,000 + RISKYTECH 150,000 = 250,000)
  assert.equal(portfolio.summary.capital_at_risk, 250000.0);

  // Assert allocations
  const badAlloc = portfolio.allocations.find(a => a.ticker === 'BADCORP');
  assert.equal(badAlloc.recommended_weight_pct, 0.0);
  assert.equal(badAlloc.action, 'LIQUIDATE_IMMEDIATELY');

  const reviewAlloc = portfolio.allocations.find(a => a.ticker === 'RISKYTECH');
  assert.equal(reviewAlloc.action, 'MANUAL_REVIEW');

  const infyAlloc = portfolio.allocations.find(a => a.ticker === 'INFY');
  assert.ok(infyAlloc.recommended_weight_pct > 0.0);
});

test('6. writeArtifacts & renderHtml: Verifies companion JSON and HTML report', () => {
  const portfolioFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'sample_portfolio_verdicts.json'), 'utf8'));
  const portfolio = synthesizePortfolio({
    strategy_id: 'fundamental_lts',
    eval_date: '2026-11-08',
    stocks: portfolioFixture.stocks
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-test-'));
  try {
    const artifacts = writeArtifacts(portfolio, tempDir);
    assert.equal(artifacts.verified, true);
    assert.ok(fs.existsSync(artifacts.jsonPath));
    assert.ok(fs.existsSync(artifacts.htmlPath));

    const htmlContent = fs.readFileSync(artifacts.htmlPath, 'utf8');
    const htmlVerification = verifyHtmlSelfContainment(htmlContent);
    assert.equal(htmlVerification.ok, true);

    const pairVerification = verifyArtifactPair({
      jsonPath: artifacts.jsonPath,
      htmlPath: artifacts.htmlPath,
      schemaType: 'verdict-synthesis',
      allowExternalAssets: false
    });
    assert.equal(pairVerification.ok, true, `Pair verification failed: ${JSON.stringify(pairVerification.errors)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('7. parseArgs: Correctly parses CLI options', () => {
  const args = [
    '--verdicts', 'file1.json', 'file2.json',
    '--blended', 'blended.json',
    '--way', 'fundamental_lts',
    '--manifest', 'config/ways.yaml',
    '--out', 'out_dir',
    '--json-output'
  ];

  const opts = parseArgs(args);
  assert.deepEqual(opts.verdictPaths, ['file1.json', 'file2.json']);
  assert.equal(opts.blendedPath, 'blended.json');
  assert.equal(opts.wayId, 'fundamental_lts');
  assert.equal(opts.manifestPath, 'config/ways.yaml');
  assert.equal(opts.outDir, 'out_dir');
  assert.equal(opts.jsonOutput, true);
});

test('8. processVerdicts: Offline execution produces verified contract and dashboard', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-cli-test-'));
  try {
    const res = processVerdicts([path.join(FIXTURES_DIR, 'sample_portfolio_verdicts.json')], null, {
      outDir: tempDir
    });

    assert.equal(res.ok, true);
    assert.equal(res.synthesis.summary.total_positions, 4);
    assert.ok(fs.existsSync(res.jsonPath));
    assert.ok(fs.existsSync(res.htmlPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('9. CLI Execution: Exits 0 and outputs valid JSON in --json-output mode', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'guardrail_engine.js');
  const fixturePath = path.join(FIXTURES_DIR, 'sample_portfolio_verdicts.json');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardrail-proc-test-'));

  try {
    const proc = spawnSync(process.execPath, [
      scriptPath,
      '--verdicts', fixturePath,
      '--out', tempDir,
      '--json-output'
    ], { encoding: 'utf8' });

    assert.equal(proc.status, 0, `Process failed: ${proc.stderr}`);
    const output = JSON.parse(proc.stdout);
    assert.equal(output.strategy_id, 'fundamental_lts');
    assert.equal(output.summary.total_positions, 4);
    assert.equal(output.summary.disqualified_count, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

