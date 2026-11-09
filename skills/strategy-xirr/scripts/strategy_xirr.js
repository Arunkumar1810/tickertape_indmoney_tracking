#!/usr/bin/env node
'use strict';

/**
 * strategy_xirr.js: Tier 4 Pooled True Strategy XIRR Calculator & Friction Tracker.
 * Aggregates multi-account external bank cash deposits, withdrawals, and dividends,
 * nets internal transfers, normalizes multi-currency flows to base currency,
 * applies high-precision Newton-Raphson solving with sub-90-day guardrails,
 * and audits itemized friction drag.
 */

const fs = require('fs');
const path = require('path');

const {
  validateStrategyXirr,
  verifyArtifactPair,
  verifyHtmlSelfContainment,
  loadManifestFile
} = require('../../../scripts/framework');

const { calculateXirr, round2, round4 } = require('./lib/xirr_math');
const { aggregateAccountLedgers, resolveFxRate } = require('./lib/ledger_aggregator');
const { calculateFrictionBreakdown } = require('./lib/friction_tracker');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json')) ? path.resolve(SKILL_ROOT, '..', '..') : path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'investment_ways.yaml');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'strategy-xirr-template.html');

/**
 * Calculate consolidated True Strategy XIRR from account ledgers and terminal valuation.
 * @param {Array<object>} accountLedgers
 * @param {object} options
 * @param {string} [options.strategyId='fundamental_lts']
 * @param {string} [options.baseCurrency='INR']
 * @param {number} [options.terminalEquity=0]
 * @param {string} [options.evalDate]
 * @param {object} [options.fxRates={}]
 * @param {string} [options.timestamp]
 * @param {number} [options.subAnnualDaysThreshold=90]
 * @returns {object} Canonical StrategyXirrReport object
 */
function calculateStrategyXirr(accountLedgers, options = {}) {
  if (!Array.isArray(accountLedgers) || accountLedgers.length === 0) {
    throw new Error('calculateStrategyXirr requires a non-empty array of account ledger objects');
  }

  const strategyId = options.strategyId || 'fundamental_lts';
  const baseCurrency = (options.baseCurrency || 'INR').toUpperCase();
  const terminalEquity = typeof options.terminalEquity === 'number' ? options.terminalEquity : 0;
  const timestamp = options.timestamp || new Date().toISOString();
  const customFxRates = options.fxRates || {};
  const subAnnualDaysThreshold = options.subAnnualDaysThreshold || 90;

  // 1. Aggregate account ledgers and net internal transfers
  const aggResult = aggregateAccountLedgers(accountLedgers, {
    strategyId,
    baseCurrency,
    terminalEquity,
    evalDate: options.evalDate,
    customFxRates
  });

  // 2. Solve XIRR polynomial using aggregated cashflows
  const solverResult = calculateXirr(aggResult.cashflows, {
    subAnnualDaysThreshold,
    evalDate: aggResult.eval_date
  });

  // 3. Compute itemized friction breakdown
  const frictionBreakdown = calculateFrictionBreakdown(accountLedgers, {
    baseCurrency,
    customFxRates,
    netInvested: aggResult.net_invested,
    terminalEquity: aggResult.terminal_equity
  });

  // 4. Construct canonical StrategyXirrReport
  const report = {
    strategy_id: strategyId,
    timestamp,
    base_currency: baseCurrency,
    eval_date: aggResult.eval_date,
    xirr: solverResult.xirr,
    xirr_annualized: solverResult.xirr_annualized,
    absolute_return: solverResult.absolute_return,
    total_deposited: aggResult.total_deposited,
    total_withdrawn: aggResult.total_withdrawn,
    net_invested: aggResult.net_invested,
    terminal_equity: aggResult.terminal_equity,
    days_held: solverResult.days_held,
    is_sub_annual: solverResult.is_sub_annual,
    friction_breakdown: frictionBreakdown,
    account_cashflows_summary: aggResult.account_cashflows_summary,
    cashflows: aggResult.cashflows
  };

  const validation = validateStrategyXirr(report);
  if (!validation.ok) {
    throw new Error(`Strategy XIRR report schema validation failed: ${JSON.stringify(validation.errors)}`);
  }

  return report;
}

/**
 * Render self-contained offline HTML audit dashboard.
 * @param {object} report - Canonical StrategyXirrReport
 * @returns {string} Fully rendered HTML string
 */
function renderHtml(report) {
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Sub-annual banner
  let subAnnualBanner = '';
  if (report.is_sub_annual) {
    subAnnualBanner = `
    <div style="background: rgba(251, 191, 36, 0.15); border: 1px solid var(--accent-amber); border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; color: var(--accent-amber);">
      <strong>⚠️ Sub-90-Day Guardrail Active:</strong> Investment duration (${report.days_held} days) is under the 90-day threshold. Annualized XIRR is suppressed to prevent extreme compounding distortion. Absolute return (${report.absolute_return}%) is displayed.
    </div>`;
  }

  // XIRR display and color class
  let xirrDisplay = 'N/A';
  let xirrClass = 'val-amber';

  if (!report.is_sub_annual && report.xirr_annualized !== null) {
    xirrDisplay = `${report.xirr_annualized > 0 ? '+' : ''}${report.xirr_annualized}%`;
    xirrClass = report.xirr_annualized >= 0 ? 'val-positive' : 'val-negative';
  } else if (report.is_sub_annual) {
    xirrDisplay = 'Sub-Annual';
    xirrClass = 'val-amber';
  }

  // Account rows HTML
  const accountRows = report.account_cashflows_summary.map(acc => `
    <tr>
      <td><strong>${acc.account_id}</strong></td>
      <td>${acc.broker}</td>
      <td><span class="badge badge-purple">${acc.original_currency}</span></td>
      <td class="text-right">${acc.fx_rate}</td>
      <td class="text-right">${acc.total_deposited_base.toLocaleString()}</td>
      <td class="text-right">${acc.total_withdrawn_base.toLocaleString()}</td>
      <td class="text-right">${acc.internal_transfers_netted_base.toLocaleString()}</td>
      <td class="text-right">${acc.friction_base.toLocaleString()}</td>
    </tr>
  `).join('\n');

  // Cashflow rows HTML
  const cashflowRows = report.cashflows.map(cf => {
    let catBadge = 'badge-blue';
    if (cf.category === 'DEPOSIT') catBadge = 'badge-red';
    if (cf.category === 'WITHDRAWAL' || cf.category === 'DIVIDEND') catBadge = 'badge-green';
    if (cf.category === 'TERMINAL_EQUITY') catBadge = 'badge-purple';
    if (cf.category === 'INTERNAL_TRANSFER_NETTED') catBadge = 'badge-amber';

    const amtDisplay = (cf.amount > 0 ? '+' : '') + cf.amount.toLocaleString();
    const amtClass = cf.amount >= 0 ? 'val-positive' : 'val-negative';

    const origDisplay = cf.original_amount !== undefined
      ? `${cf.original_amount.toLocaleString()} ${cf.original_currency || ''}`
      : '-';

    return `
    <tr>
      <td>${cf.date}</td>
      <td><span class="badge ${catBadge}">${cf.category}</span></td>
      <td>${cf.account_id}</td>
      <td>${cf.description}</td>
      <td class="text-right">${origDisplay}</td>
      <td class="text-right">${cf.fx_rate || 1.0}</td>
      <td class="text-right ${amtClass}"><strong>${amtDisplay}</strong></td>
    </tr>`;
  }).join('\n');

  const replacements = {
    '{{STRATEGY_ID}}': report.strategy_id,
    '{{BASE_CURRENCY}}': report.base_currency,
    '{{TIMESTAMP}}': report.timestamp,
    '{{EVAL_DATE}}': report.eval_date,
    '{{XIRR_DISPLAY}}': xirrDisplay,
    '{{XIRR_CLASS}}': xirrClass,
    '{{ABSOLUTE_RETURN}}': (report.absolute_return > 0 ? '+' : '') + report.absolute_return,
    '{{TOTAL_DEPOSITED}}': report.total_deposited.toLocaleString(),
    '{{TOTAL_WITHDRAWN}}': report.total_withdrawn.toLocaleString(),
    '{{NET_INVESTED}}': report.net_invested.toLocaleString(),
    '{{TERMINAL_EQUITY}}': report.terminal_equity.toLocaleString(),
    '{{DAYS_HELD}}': report.days_held,
    '{{SUB_ANNUAL_BANNER}}': subAnnualBanner,
    '{{FRICTION_BROKERAGE}}': report.friction_breakdown.brokerage.toLocaleString(),
    '{{FRICTION_STT}}': report.friction_breakdown.stt.toLocaleString(),
    '{{FRICTION_FX_DRAG}}': report.friction_breakdown.fx_drag.toLocaleString(),
    '{{FRICTION_TAXES}}': report.friction_breakdown.taxes_and_charges.toLocaleString(),
    '{{FRICTION_TOTAL}}': report.friction_breakdown.total_friction.toLocaleString(),
    '{{FRICTION_DRAG_PCT}}': report.friction_breakdown.friction_drag_pct,
    '{{ACCOUNT_ROWS}}': accountRows,
    '{{CASHFLOW_ROWS}}': cashflowRows
  };

  for (const [placeholder, val] of Object.entries(replacements)) {
    template = template.split(placeholder).join(String(val));
  }

  return template;
}

/**
 * Write JSON and HTML artifacts to target directory and verify with artifact harness.
 * @param {object} report - Canonical StrategyXirrReport
 * @param {string} outDir - Directory path
 * @returns {{ jsonPath: string, htmlPath: string, verified: boolean }}
 */
function writeArtifacts(report, outDir) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const jsonFilename = 'strategy_xirr.json';
  const htmlFilename = 'strategy_xirr.html';

  const jsonPath = path.join(outDir, jsonFilename);
  const htmlPath = path.join(outDir, htmlFilename);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const renderedHtml = renderHtml(report);
  fs.writeFileSync(htmlPath, renderedHtml, 'utf8');

  // Universal verification
  const verification = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'strategy-xirr',
    allowExternalAssets: false
  });

  if (!verification.ok) {
    throw new Error(`Strategy XIRR artifact verification failed: ${JSON.stringify(verification.errors)}`);
  }

  return {
    jsonPath,
    htmlPath,
    verified: true
  };
}

/**
 * Process offline ledger files and blended holdings.
 * @param {Array<string>} ledgerPaths
 * @param {string} blendedPath
 * @param {object} options
 */
function processLedgers(ledgerPaths, blendedPath, options = {}) {
  const ledgers = ledgerPaths.map(p => {
    const absPath = path.resolve(p);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Account ledger file not found at: ${absPath}`);
    }
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  });

  let terminalEquity = 0;
  let strategyId = options.strategyId || 'fundamental_lts';
  let baseCurrency = options.baseCurrency || 'INR';

  if (blendedPath) {
    const absBlendedPath = path.resolve(blendedPath);
    if (!fs.existsSync(absBlendedPath)) {
      throw new Error(`Blended holdings file not found at: ${absBlendedPath}`);
    }
    const blended = JSON.parse(fs.readFileSync(absBlendedPath, 'utf8'));
    terminalEquity = blended.summary ? blended.summary.total_strategy_equity : 0;
    if (blended.strategy_id) strategyId = blended.strategy_id;
    if (blended.base_currency) baseCurrency = blended.base_currency;
  } else if (typeof options.terminalEquity === 'number') {
    terminalEquity = options.terminalEquity;
  }

  const calcOpts = {
    strategyId,
    baseCurrency,
    terminalEquity,
    evalDate: options.evalDate,
    fxRates: options.fxRates,
    timestamp: options.timestamp,
    subAnnualDaysThreshold: options.subAnnualDaysThreshold
  };

  const report = calculateStrategyXirr(ledgers, calcOpts);

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(report, options.outDir || DEFAULT_REPORTS_DIR);
  }

  return {
    ok: true,
    report,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Autonomous strategy way processor via investment_ways.yaml manifest.
 * @param {string} wayId
 * @param {object} options
 */
async function processStrategyWay(wayId, options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = loadManifestFile(manifestPath);

  const way = (manifest.investment_ways || []).find(w => w.id === wayId);
  if (!way) {
    throw new Error(`Investment Way "${wayId}" not found in manifest at ${manifestPath}`);
  }

  const baseCurrency = (way.base_currency || options.baseCurrency || 'INR').toUpperCase();
  const assignedAccounts = way.accounts || [];

  if (assignedAccounts.length === 0) {
    throw new Error(`Investment Way "${wayId}" has no assigned broker accounts`);
  }

  // Look for ledger files
  const ledgerPaths = [];
  for (const accId of assignedAccounts) {
    const candidates = [
      path.join(REPO_ROOT, 'accounts', `${accId}_ledger.json`),
      path.join(REPO_ROOT, '.cache', `${accId}_ledger.json`),
      path.join(REPO_ROOT, 'reports', `${accId}_ledger.json`),
      path.join(SKILL_ROOT, 'tests', 'fixtures', `sample_${accId}_ledger.json`),
      path.join(SKILL_ROOT, 'tests', 'fixtures', `${accId}_ledger.json`)
    ];

    let found = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        found = c;
        break;
      }
    }

    if (!found) {
      throw new Error(`Could not find ledger snapshot for account "${accId}". Searched candidates: ${candidates.join(', ')}`);
    }

    ledgerPaths.push(found);
  }

  // Look for blended holdings
  const blendedCandidates = [
    path.join(REPO_ROOT, 'strategies', wayId, 'holdings_blended.json'),
    path.join(REPO_ROOT, 'reports', 'strategy_holdings_blended.json'),
    path.join(SKILL_ROOT, 'tests', 'fixtures', 'sample_blended_holdings.json')
  ];

  let blendedPath = null;
  for (const bc of blendedCandidates) {
    if (fs.existsSync(bc)) {
      blendedPath = bc;
      break;
    }
  }

  const outDir = options.outDir || path.join(REPO_ROOT, 'strategies', wayId);

  return processLedgers(ledgerPaths, blendedPath, {
    strategyId: wayId,
    baseCurrency,
    fxRates: options.fxRates,
    outDir,
    timestamp: options.timestamp
  });
}

/**
 * Parse CLI flags.
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    ledgers: [],
    blended: null,
    terminalEquity: null,
    way: null,
    manifest: DEFAULT_MANIFEST_PATH,
    baseCurrency: 'INR',
    fxRates: {},
    out: DEFAULT_REPORTS_DIR,
    jsonOutput: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ledgers') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args.ledgers.push(argv[++i]);
      }
    } else if (arg === '--blended' && i + 1 < argv.length) {
      args.blended = argv[++i];
    } else if (arg === '--terminal-equity' && i + 1 < argv.length) {
      args.terminalEquity = parseFloat(argv[++i]);
    } else if (arg === '--way' && i + 1 < argv.length) {
      args.way = argv[++i];
    } else if (arg === '--manifest' && i + 1 < argv.length) {
      args.manifest = argv[++i];
    } else if (arg === '--base-currency' && i + 1 < argv.length) {
      args.baseCurrency = argv[++i].toUpperCase();
    } else if (arg === '--fx' && i + 1 < argv.length) {
      const pairVal = argv[++i];
      const [pair, rateStr] = pairVal.split('=');
      if (pair && rateStr) {
        args.fxRates[pair.toUpperCase()] = parseFloat(rateStr);
      }
    } else if (arg === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (arg === '--json-output' || arg === '--json') {
      args.jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

/**
 * Main CLI runner.
 */
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(`
Pooled True Strategy XIRR Calculator & Friction Tracker CLI
Usage:
  node strategy_xirr.js --ledgers <path1> <path2>... [--blended <path>] [--base-currency <INR|USD>] [--fx <PAIR>=<RATE>] [--out <dir>]
  node strategy_xirr.js --way <way_id> [--manifest <path>] [--fx <PAIR>=<RATE>] [--out <dir>]

Options:
  --ledgers <paths...>    Paths to account ledger JSON files
  --blended <path>        Path to StrategyHoldingsBlended JSON file
  --terminal-equity <num> Explicit terminal equity valuation
  --way <way_id>          Strategy ID from investment_ways.yaml
  --manifest <path>       Path to investment_ways.yaml (default: config/investment_ways.yaml)
  --base-currency <CURR>  Strategy base currency (default: INR)
  --fx <PAIR>=<RATE>      Explicit exchange rate (e.g. USDINR=87.20)
  --out <dir>             Output directory for reports (default: reports)
  --json-output           Output machine-readable JSON to stdout
  --help, -h              Show this help text
\n`);
    return { ok: true };
  }

  let result;
  if (args.ledgers && args.ledgers.length > 0) {
    result = processLedgers(args.ledgers, args.blended, {
      strategyId: args.way || 'custom_strategy',
      baseCurrency: args.baseCurrency,
      terminalEquity: args.terminalEquity,
      fxRates: args.fxRates,
      outDir: args.out
    });
  } else if (args.way) {
    result = await processStrategyWay(args.way, {
      manifestPath: args.manifest,
      fxRates: args.fxRates,
      outDir: args.out
    });
  } else {
    process.stderr.write('[ERROR] Please specify --ledgers <paths...> or --way <way_id>.\n');
    return { ok: false, error: 'MISSING_COMMAND' };
  }

  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const r = result.report;
    process.stdout.write(`\n📈 True Strategy XIRR Report for ${r.strategy_id} (${r.base_currency}):\n`);
    if (r.is_sub_annual) {
      process.stdout.write(`   • True Strategy XIRR:       Sub-Annual Guardrail Active (N/A)\n`);
    } else {
      process.stdout.write(`   • True Strategy XIRR:       ${r.xirr_annualized > 0 ? '+' : ''}${r.xirr_annualized}%\n`);
    }
    process.stdout.write(`   • Absolute Return:          ${r.absolute_return > 0 ? '+' : ''}${r.absolute_return}%\n`);
    process.stdout.write(`   • Net Committed Capital:    ${r.net_invested.toLocaleString()} ${r.base_currency}\n`);
    process.stdout.write(`   • Total Cash Deposited:     ${r.total_deposited.toLocaleString()} ${r.base_currency}\n`);
    process.stdout.write(`   • Total Cash Withdrawn:     ${r.total_withdrawn.toLocaleString()} ${r.base_currency}\n`);
    process.stdout.write(`   • Terminal Portfolio Equity: ${r.terminal_equity.toLocaleString()} ${r.base_currency}\n`);
    process.stdout.write(`   • Holding Duration:         ${r.days_held} Days\n`);
    process.stdout.write(`   • Total Friction Drag:      ${r.friction_breakdown.total_friction.toLocaleString()} ${r.base_currency} (${r.friction_breakdown.friction_drag_pct}% return drag)\n`);
    process.stdout.write(`\n📁 Strategy Artifacts:\n`);
    process.stdout.write(`   • JSON Contract: ${result.jsonPath}\n`);
    process.stdout.write(`   • HTML Audit:    ${result.htmlPath}\n`);
    process.stdout.write('✅ Universal Verification Harness verified strategy XIRR pair.\n\n');
  }

  return result;
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[FATAL] ${err.message}\n${err.stack}\n`);
    process.exit(1);
  });
}

module.exports = {
  calculateStrategyXirr,
  renderHtml,
  writeArtifacts,
  processLedgers,
  processStrategyWay,
  parseArgs,
  main
};
