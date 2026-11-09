'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  validateConsolidatedPortfolio,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../scripts/framework');

const {
  compileEmbeddedAudits,
  normalizePrincipleName
} = require('../scripts/lib/audit_embedder');

const {
  compileConsolidatedPortfolio
} = require('../scripts/lib/orchestrator');

const {
  renderHtml,
  writeArtifacts,
  processOfflineFiles,
  processStrategyWay,
  parseArgs
} = require('../scripts/way_long_term_strategy');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

test('1. compileEmbeddedAudits: Compiles Option C embedded audits across 5 principles', () => {
  const portfolioVerdicts = [
    {
      ticker: 'INFY',
      name: 'Infosys Limited',
      market: 'IN',
      synthesized_stance: 'STRONG_BUY',
      synthesized_score: 86.5,
      gatekeeper_verdict: {
        principle: 'forensic_governance',
        stance: 'PASS',
        is_veto: false,
        score: 92.0,
        red_flags: []
      },
      pillar_verdicts: {
        graham: { score: 75.0, stance: 'BUY', weight: 0.25, weighted_score: 18.75 },
        buffett_munger: { score: 88.0, stance: 'STRONG_BUY', weight: 0.35, weighted_score: 30.8 }
      },
      notes: ['Pristine forensic audit']
    }
  ];

  const rawVerdicts = {
    INFY: [
      {
        principle: 'forensic_governance',
        score: 92.0,
        stance: 'PASS',
        metrics: { promoter_pledge_pct: 0.0, beneish_m_score: -2.6 },
        summary: 'Zero promoter pledging'
      },
      {
        principle: 'analyze-graham',
        score: 75.0,
        stance: 'BUY',
        metrics: { graham_number_ratio: 1.15 },
        summary: 'Solid margin of safety'
      }
    ]
  };

  const audits = compileEmbeddedAudits(portfolioVerdicts, rawVerdicts);
  assert.ok(audits.INFY);
  assert.equal(audits.INFY.ticker, 'INFY');
  assert.equal(audits.INFY.synthesized_stance, 'STRONG_BUY');
  assert.equal(audits.INFY.gatekeeper_verdict.score, 92.0);
  assert.equal(audits.INFY.gatekeeper_verdict.metrics.promoter_pledge_pct, 0.0);
  assert.ok(audits.INFY.pillar_verdicts.graham);
  assert.equal(audits.INFY.pillar_verdicts.graham.metrics.graham_number_ratio, 1.15);
});

test('2. compileConsolidatedPortfolio: Assembles canonical contract and summary metrics', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'sample_consolidated_strategy.json'), 'utf8')
  );

  const portfolio = compileConsolidatedPortfolio({
    strategyId: fixture.strategy_id,
    baseCurrency: fixture.base_currency,
    evalDate: fixture.eval_date,
    blendedHoldings: fixture.blended_holdings,
    performance: fixture.performance,
    verdictSynthesis: fixture.verdict_synthesis,
    embeddedAudits: fixture.embedded_audits
  });

  const val = validateConsolidatedPortfolio(portfolio);
  assert.equal(val.ok, true, `Validation failed: ${JSON.stringify(val.errors)}`);
  assert.equal(portfolio.strategy_id, 'fundamental_lts');
  assert.equal(portfolio.summary.total_strategy_equity, 750000.0);
  assert.equal(portfolio.summary.total_invested_capital, 600000.0);
  assert.equal(portfolio.summary.xirr, 21.5);
  assert.equal(portfolio.summary.disqualified_count, 1);
  assert.equal(portfolio.summary.capital_at_risk, 100000.0);
});

test('3. writeArtifacts & renderHtml: Generates verified offline master HTML dashboard', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'sample_consolidated_strategy.json'), 'utf8')
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-dashboard-test-'));
  try {
    const artifacts = writeArtifacts(fixture, tempDir);
    assert.equal(artifacts.verified, true);
    assert.ok(fs.existsSync(artifacts.jsonPath));
    assert.ok(fs.existsSync(artifacts.htmlPath));

    const htmlContent = fs.readFileSync(artifacts.htmlPath, 'utf8');
    const htmlVerification = verifyHtmlSelfContainment(htmlContent);
    assert.equal(htmlVerification.ok, true, `HTML leaks: ${JSON.stringify(htmlVerification.errors)}`);

    const pairVerification = verifyArtifactPair({
      jsonPath: artifacts.jsonPath,
      htmlPath: artifacts.htmlPath,
      schemaType: 'consolidated-portfolio',
      allowExternalAssets: false
    });
    assert.equal(pairVerification.ok, true, `Pair validation failed: ${JSON.stringify(pairVerification.errors)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('4. parseArgs: Correctly parses CLI options', () => {
  const args = [
    '--way', 'fundamental_lts',
    '--manifest', 'config/ways.yaml',
    '--blended', 'blended.json',
    '--xirr', 'xirr.json',
    '--synthesis', 'synthesis.json',
    '--out', 'output_dir',
    '--json-output'
  ];

  const opts = parseArgs(args);
  assert.equal(opts.wayId, 'fundamental_lts');
  assert.equal(opts.manifestPath, 'config/ways.yaml');
  assert.equal(opts.blendedPath, 'blended.json');
  assert.equal(opts.xirrPath, 'xirr.json');
  assert.equal(opts.synthesisPath, 'synthesis.json');
  assert.equal(opts.outDir, 'output_dir');
  assert.equal(opts.jsonOutput, true);
});

test('5. processOfflineFiles: Executes offline mode and writes verified artifacts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-offline-test-'));
  try {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_consolidated_strategy.json');
    const res = processOfflineFiles(fixturePath, fixturePath, fixturePath, {
      outDir: tempDir
    });

    assert.equal(res.ok, true);
    assert.equal(res.portfolio.strategy_id, 'fundamental_lts');
    assert.ok(fs.existsSync(res.jsonPath));
    assert.ok(fs.existsSync(res.htmlPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('6. processStrategyWay: Executes autonomous strategy orchestration mode', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-way-test-'));
  try {
    const res = processStrategyWay('fundamental_lts', {
      outDir: tempDir
    });

    assert.equal(res.ok, true);
    assert.equal(res.portfolio.strategy_id, 'fundamental_lts');
    assert.ok(fs.existsSync(res.jsonPath));
    assert.ok(fs.existsSync(res.htmlPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('7. CLI Execution: Exits 0 and emits valid JSON in --json-output mode', () => {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'way_long_term_strategy.js');
  const fixturePath = path.join(FIXTURES_DIR, 'sample_consolidated_strategy.json');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-cli-test-'));

  try {
    const proc = spawnSync(process.execPath, [
      scriptPath,
      '--blended', fixturePath,
      '--out', tempDir,
      '--json-output'
    ], { encoding: 'utf8' });

    assert.equal(proc.status, 0, `Process failed: ${proc.stderr}`);
    const output = JSON.parse(proc.stdout);
    assert.equal(output.strategy_id, 'fundamental_lts');
    assert.equal(output.summary.total_positions, 3);
    assert.equal(output.summary.approved_count, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

