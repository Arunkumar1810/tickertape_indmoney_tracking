#!/usr/bin/env node
'use strict';

/**
 * guardrail_engine.js: Tier 4 Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine.
 * Evaluates multi-pillar valuation verdicts and forensic gatekeeper audits, short-circuiting
 * vetoed securities to DISQUALIFIED with 0.0% capital allocation, enforcing the Asymmetric Downside
 * Guardrail (NEEDS_REVIEW on any STRONG_SELL), synthesizing weighted principle scores with REDUCE
 * ceiling capping, and auditing portfolio risk posture.
 */

const fs = require('fs');
const path = require('path');

const {
  validateVerdictSynthesis,
  verifyArtifactPair,
  verifyHtmlSelfContainment,
  loadManifestFile
} = require('../../../shared/framework');

const {
  synthesizeSecurityVerdicts,
  synthesizePortfolio,
  normalizePrincipleName
} = require('./lib/verdict_synthesizer');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'investment_ways.yaml');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'guardrail-engine-template.html');

/**
 * Render the offline self-contained HTML audit dashboard.
 * @param {object} synthesis - Canonical StrategyVerdictSynthesis object
 * @returns {string} Fully rendered HTML string
 */
function renderHtml(synthesis) {
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Disqualified banner / section
  let disqualifiedSection = '';
  const disqList = synthesis.portfolio_verdicts.filter(pv => pv.is_disqualified);
  if (disqList.length > 0) {
    const cards = disqList.map(item => `
      <div class="flagged-item-card">
        <div class="flagged-header">
          <span class="ticker-symbol">${item.ticker}</span>
          <span class="badge badge-disqualified">DISQUALIFIED (0.0% Allocation)</span>
        </div>
        <div style="font-size: 0.85rem; color: #fca5a5; margin-bottom: 6px;">
          ${item.name || item.ticker} &bull; Forensic Gatekeeper Veto Triggered
        </div>
        <ul style="padding-left: 20px; font-size: 0.8rem; color: var(--text-muted);">
          ${item.notes.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>
    `).join('\n');

    disqualifiedSection = `
    <div class="alert-banner alert-banner-danger">
      <h3>🚨 Forensic Gatekeeper Hard Veto Activated (${disqList.length} Security)</h3>
      <p style="font-size: 0.85rem; margin-bottom: 8px;">
        The following assets failed forensic governance screening (promoter pledge &gt; 50%, auditor irregularities, or severe accrual distortion).
        Automated capital allocation is strictly disqualified (0.0%).
      </p>
      <div class="warning-grid">
        ${cards}
      </div>
    </div>`;
  }

  // Guardrail review banner / section
  let guardrailSection = '';
  const reviewList = synthesis.portfolio_verdicts.filter(pv => pv.guardrail_triggered && !pv.is_disqualified);
  if (reviewList.length > 0) {
    const cards = reviewList.map(item => `
      <div class="flagged-item-card">
        <div class="flagged-header">
          <span class="ticker-symbol">${item.ticker}</span>
          <span class="badge badge-review">NEEDS REVIEW (Strong Sell Signal)</span>
        </div>
        <div style="font-size: 0.85rem; color: #fde68a; margin-bottom: 6px;">
          ${item.name || item.ticker} &bull; Downside Guardrail Intercepted
        </div>
        <ul style="padding-left: 20px; font-size: 0.8rem; color: var(--text-muted);">
          ${item.notes.map(n => `<li>${n}</li>`).join('')}
        </ul>
      </div>
    `).join('\n');

    guardrailSection = `
    <div class="alert-banner alert-banner-warning">
      <h3>⚠️ Asymmetric Downside Guardrail Warning (${reviewList.length} Security)</h3>
      <p style="font-size: 0.85rem; margin-bottom: 8px;">
        An active valuation principle signaled STRONG_SELL on these assets. Under value-investing doctrine, catastrophic downside risk
        takes precedence over prospective upside. Automated BUY clearance is suppressed pending investment committee review.
      </p>
      <div class="warning-grid">
        ${cards}
      </div>
    </div>`;
  }

  // Verdict rows HTML
  const verdictRows = synthesis.portfolio_verdicts.map(pv => {
    let stanceBadge = 'badge-hold';
    if (pv.synthesized_stance === 'STRONG_BUY') stanceBadge = 'badge-strong-buy';
    else if (pv.synthesized_stance === 'BUY') stanceBadge = 'badge-buy';
    else if (pv.synthesized_stance === 'HOLD') stanceBadge = 'badge-hold';
    else if (pv.synthesized_stance === 'REDUCE') stanceBadge = 'badge-reduce';
    else if (pv.synthesized_stance === 'STRONG_SELL') stanceBadge = 'badge-strong-sell';
    else if (pv.synthesized_stance === 'DISQUALIFIED') stanceBadge = 'badge-disqualified';
    else if (pv.synthesized_stance === 'NEEDS_REVIEW') stanceBadge = 'badge-review';

    let gatekeeperBadge = 'badge-pass';
    if (pv.gatekeeper_verdict.stance === 'FLAG') gatekeeperBadge = 'badge-flag';
    else if (pv.gatekeeper_verdict.is_veto) gatekeeperBadge = 'badge-disqualified';

    const pPillars = pv.pillar_verdicts || {};
    const grahamScore = pPillars.graham ? `${pPillars.graham.score}` : '-';
    const lynchScore = pPillars.lynch ? `${pPillars.lynch.score}` : '-';
    const buffettScore = pPillars.buffett_munger ? `${pPillars.buffett_munger.score}` : '-';
    const klarmanScore = pPillars.klarman_solvency ? `${pPillars.klarman_solvency.score}` : '-';

    const notesList = (pv.notes || []).map(n => {
      let cls = 'note-item';
      if (n.includes('VETO')) cls += ' veto';
      else if (n.includes('GUARDRAIL') || n.includes('CEILING')) cls += ' guardrail';
      return `<div class="${cls}">&bull; ${n}</div>`;
    }).join('');

    return `
    <tr>
      <td>
        <span class="ticker-symbol">${pv.ticker}</span>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${pv.name || ''}</div>
        <details>
          <summary>Audit Notes &amp; Rationale</summary>
          <div class="drawer-content">
            ${notesList || '<div class="note-item">No red flags or guardrail restrictions triggered.</div>'}
          </div>
        </details>
      </td>
      <td class="text-center"><span class="badge ${pv.market === 'US' ? 'badge-hold' : 'badge-pass'}">${pv.market || 'IN'}</span></td>
      <td class="text-center"><span class="badge ${gatekeeperBadge}">${pv.gatekeeper_verdict.stance}</span></td>
      <td class="text-center">${grahamScore}</td>
      <td class="text-center">${lynchScore}</td>
      <td class="text-center">${buffettScore}</td>
      <td class="text-center">${klarmanScore}</td>
      <td class="text-right"><strong>${pv.synthesized_score.toFixed(1)}</strong></td>
      <td class="text-center"><span class="badge ${stanceBadge}">${pv.synthesized_stance}</span></td>
      <td class="text-right"><strong>${pv.recommended_allocation_pct.toFixed(1)}%</strong></td>
    </tr>`;
  }).join('\n');

  // Allocation rows HTML
  const allocationRows = synthesis.allocations.map(al => {
    let actBadge = 'badge-hold';
    if (al.action === 'LIQUIDATE_IMMEDIATELY') actBadge = 'badge-disqualified';
    else if (al.action === 'MANUAL_REVIEW') actBadge = 'badge-review';
    else if (al.action === 'INCREASE') actBadge = 'badge-strong-buy';
    else if (al.action === 'TRIM') actBadge = 'badge-reduce';
    else if (al.action === 'MAINTAIN') actBadge = 'badge-pass';

    const delta = Number((al.recommended_weight_pct - al.current_weight_pct).toFixed(2));
    const deltaDisplay = (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
    const deltaColor = delta > 0 ? '#34d399' : (delta < 0 ? '#f87171' : 'var(--text-muted)');

    return `
    <tr>
      <td><span class="ticker-symbol">${al.ticker}</span></td>
      <td class="text-right">${al.current_weight_pct.toFixed(1)}%</td>
      <td class="text-right"><strong>${al.recommended_weight_pct.toFixed(1)}%</strong></td>
      <td class="text-right" style="color: ${deltaColor}; font-weight: 600;">${deltaDisplay}</td>
      <td class="text-center"><span class="badge ${actBadge}">${al.action}</span></td>
    </tr>`;
  }).join('\n');

  const replacements = {
    '{{STRATEGY_ID}}': synthesis.strategy_id,
    '{{EVAL_DATE}}': synthesis.eval_date,
    '{{TIMESTAMP}}': synthesis.timestamp,
    '{{PORTFOLIO_HEALTH_SCORE}}': synthesis.summary.portfolio_health_score.toFixed(1),
    '{{TOTAL_POSITIONS}}': synthesis.summary.total_positions,
    '{{DISQUALIFIED_COUNT}}': synthesis.summary.disqualified_count,
    '{{NEEDS_REVIEW_COUNT}}': synthesis.summary.needs_review_count,
    '{{APPROVED_COUNT}}': synthesis.summary.approved_count,
    '{{CAPITAL_AT_RISK}}': synthesis.summary.capital_at_risk.toLocaleString(),
    '{{DISQUALIFIED_SECTION}}': disqualifiedSection,
    '{{GUARDRAIL_SECTION}}': guardrailSection,
    '{{VERDICT_ROWS}}': verdictRows,
    '{{ALLOCATION_ROWS}}': allocationRows
  };

  for (const [placeholder, val] of Object.entries(replacements)) {
    template = template.split(placeholder).join(String(val));
  }

  return template;
}

/**
 * Write JSON and HTML artifacts to target directory and verify with artifact harness.
 * @param {object} synthesis - Canonical StrategyVerdictSynthesis object
 * @param {string} outDir - Directory path
 * @returns {{ jsonPath: string, htmlPath: string, verified: boolean }}
 */
function writeArtifacts(synthesis, outDir) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const jsonFilename = 'strategy_verdict_synthesis.json';
  const htmlFilename = 'strategy_verdict_synthesis.html';

  const jsonPath = path.join(outDir, jsonFilename);
  const htmlPath = path.join(outDir, htmlFilename);

  fs.writeFileSync(jsonPath, JSON.stringify(synthesis, null, 2), 'utf8');

  const renderedHtml = renderHtml(synthesis);
  fs.writeFileSync(htmlPath, renderedHtml, 'utf8');

  // Universal verification
  const verification = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'verdict-synthesis',
    allowExternalAssets: false
  });

  if (!verification.ok) {
    throw new Error(`Strategy verdict synthesis artifact verification failed: ${JSON.stringify(verification.errors)}`);
  }

  return {
    jsonPath,
    htmlPath,
    verified: true
  };
}

/**
 * Process offline verdict files and optional blended holdings.
 * @param {Array<string>} verdictPaths
 * @param {string} [blendedPath]
 * @param {object} [options]
 */
function processVerdicts(verdictPaths, blendedPath, options = {}) {
  const stocksMap = new Map();
  let strategyId = options.strategyId || 'fundamental_lts';
  let evalDate = options.evalDate || new Date().toISOString().slice(0, 10);

  // If blended holdings provided, read position values
  const blendedPositions = new Map();
  if (blendedPath) {
    const absBlended = path.resolve(blendedPath);
    if (fs.existsSync(absBlended)) {
      const blendedData = JSON.parse(fs.readFileSync(absBlended, 'utf8'));
      if (blendedData.strategy_id) strategyId = blendedData.strategy_id;
      if (blendedData.eval_date) evalDate = blendedData.eval_date;
      const positions = blendedData.positions || [];
      for (const pos of positions) {
        blendedPositions.set(pos.ticker, pos.current_value_base || 0);
      }
    }
  }

  // Load each verdict file
  for (const vPath of verdictPaths) {
    const absPath = path.resolve(vPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Verdict file not found at: ${absPath}`);
    }

    const data = JSON.parse(fs.readFileSync(absPath, 'utf8'));

    // Check if it's already a portfolio-level collection
    if (Array.isArray(data.stocks)) {
      if (data.strategy_id) strategyId = data.strategy_id;
      if (data.eval_date) evalDate = data.eval_date;
      for (const st of data.stocks) {
        stocksMap.set(st.ticker, {
          ticker: st.ticker,
          name: st.name || st.ticker,
          market: st.market || 'IN',
          current_value: st.current_value !== undefined ? st.current_value : (blendedPositions.get(st.ticker) || 0),
          verdicts: st.verdicts || []
        });
      }
      continue;
    }

    // Check if it's a VerdictBatch
    if (data.principle && Array.isArray(data.verdicts)) {
      for (const singleV of data.verdicts) {
        const t = singleV.ticker;
        if (!stocksMap.has(t)) {
          stocksMap.set(t, {
            ticker: t,
            name: t,
            market: 'IN',
            current_value: blendedPositions.get(t) || 0,
            verdicts: []
          });
        }
        stocksMap.get(t).verdicts.push(singleV);
      }
      continue;
    }

    // Check if it's a SingleVerdict
    if (data.principle && data.ticker) {
      const t = data.ticker;
      if (!stocksMap.has(t)) {
        stocksMap.set(t, {
          ticker: t,
          name: t,
          market: 'IN',
          current_value: blendedPositions.get(t) || 0,
          verdicts: []
        });
      }
      stocksMap.get(t).verdicts.push(data);
      continue;
    }

    // Check if it's a single stock container with multiple verdicts
    if (data.ticker && Array.isArray(data.verdicts)) {
      stocksMap.set(data.ticker, {
        ticker: data.ticker,
        name: data.name || data.ticker,
        market: data.market || 'IN',
        current_value: data.current_value !== undefined ? data.current_value : (blendedPositions.get(data.ticker) || 0),
        verdicts: data.verdicts
      });
      continue;
    }
  }

  const stocks = Array.from(stocksMap.values());
  const synthesis = synthesizePortfolio({
    strategy_id: strategyId,
    eval_date: evalDate,
    stocks,
    manifestWeights: options.manifestWeights || {}
  });

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(synthesis, options.outDir || DEFAULT_REPORTS_DIR);
  }

  return {
    ok: true,
    synthesis,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Autonomous strategy way execution.
 * Resolves principles, weights, and blended holdings via investment_ways.yaml.
 * @param {string} wayId
 * @param {object} [options]
 */
function processStrategyWay(wayId, options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = loadManifestFile(manifestPath);

  const way = (manifest.investment_ways || []).find(w => w.id === wayId);
  if (!way) {
    throw new Error(`Investment Way "${wayId}" not found in manifest at ${manifestPath}`);
  }

  const manifestWeights = way.weights || {};

  // Find blended holdings
  const blendedCandidates = [
    path.join(REPO_ROOT, 'strategies', wayId, 'holdings_blended.json'),
    path.join(REPO_ROOT, 'reports', 'strategy_holdings_blended.json'),
    path.join(REPO_ROOT, 'reports', 'holdings_blended.json'),
    path.join(SKILL_ROOT, 'tests', 'fixtures', 'sample_portfolio_verdicts.json')
  ];

  let blendedPath = null;
  for (const c of blendedCandidates) {
    if (fs.existsSync(c)) {
      blendedPath = c;
      break;
    }
  }

  // Find verdict candidates
  const verdictCandidates = [
    path.join(REPO_ROOT, 'reports', `${wayId}_verdicts.json`),
    path.join(REPO_ROOT, 'verdicts', `${wayId}_verdicts.json`),
    path.join(SKILL_ROOT, 'tests', 'fixtures', 'sample_portfolio_verdicts.json')
  ];

  let verdictPath = null;
  for (const c of verdictCandidates) {
    if (fs.existsSync(c)) {
      verdictPath = c;
      break;
    }
  }

  if (!verdictPath) {
    throw new Error(`Could not find portfolio verdicts for Investment Way "${wayId}".`);
  }

  return processVerdicts([verdictPath], blendedPath, {
    strategyId: wayId,
    manifestWeights,
    outDir: options.outDir || DEFAULT_REPORTS_DIR,
    noWrite: options.noWrite
  });
}

/**
 * Parse CLI arguments.
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    verdictPaths: [],
    blendedPath: null,
    wayId: null,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outDir: DEFAULT_REPORTS_DIR,
    jsonOutput: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json' || arg === '--json-output') {
      options.jsonOutput = true;
    } else if (arg === '--way' && i + 1 < argv.length) {
      options.wayId = argv[++i];
    } else if (arg.startsWith('--way=')) {
      options.wayId = arg.slice('--way='.length);
    } else if (arg === '--blended' && i + 1 < argv.length) {
      options.blendedPath = argv[++i];
    } else if (arg.startsWith('--blended=')) {
      options.blendedPath = arg.slice('--blended='.length);
    } else if (arg === '--manifest' && i + 1 < argv.length) {
      options.manifestPath = argv[++i];
    } else if (arg.startsWith('--manifest=')) {
      options.manifestPath = arg.slice('--manifest='.length);
    } else if (arg === '--out' && i + 1 < argv.length) {
      options.outDir = argv[++i];
    } else if (arg.startsWith('--out=')) {
      options.outDir = arg.slice('--out='.length);
    } else if (arg === '--verdicts') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options.verdictPaths.push(argv[++i]);
      }
    }
  }

  return options;
}

/**
 * CLI execution entrypoint.
 * @param {string[]} argv
 * @returns {number} exit code
 */
function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  try {
    let result;
    if (options.wayId) {
      result = processStrategyWay(options.wayId, {
        manifestPath: options.manifestPath,
        outDir: options.outDir
      });
    } else if (options.verdictPaths.length > 0) {
      result = processVerdicts(options.verdictPaths, options.blendedPath, {
        outDir: options.outDir
      });
    } else {
      process.stderr.write('Error: Must specify either --way <way_id> or --verdicts <path...>\n');
      return 1;
    }

    if (options.jsonOutput) {
      process.stdout.write(JSON.stringify(result.synthesis, null, 2) + '\n');
    } else {
      process.stdout.write(`\n🛡️ Strategy Verdict Synthesis: ${result.synthesis.strategy_id} (${result.synthesis.eval_date})\n`);
      process.stdout.write(`   Portfolio Health Score: ${result.synthesis.summary.portfolio_health_score} / 100\n`);
      process.stdout.write(`   Positions: ${result.synthesis.summary.total_positions} (Disqualified: ${result.synthesis.summary.disqualified_count}, Review: ${result.synthesis.summary.needs_review_count}, Approved: ${result.synthesis.summary.approved_count})\n`);
      process.stdout.write(`   Capital at Risk: ${result.synthesis.summary.capital_at_risk.toLocaleString()}\n`);
      process.stdout.write(`   JSON Artifact: ${result.jsonPath}\n`);
      process.stdout.write(`   HTML Dashboard: ${result.htmlPath}\n`);
      process.stdout.write('   ✅ Universal Verification Harness Passed (Zero External Leaks)\n\n');
    }

    return 0;
  } catch (err) {
    if (options.jsonOutput) {
      process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2) + '\n');
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
    }
    return 1;
  }
}

if (require.main === module) {
  const exitCode = runCli();
  process.exit(exitCode);
}

module.exports = {
  renderHtml,
  writeArtifacts,
  processVerdicts,
  processStrategyWay,
  parseArgs,
  runCli
};

