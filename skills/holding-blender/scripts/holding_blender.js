#!/usr/bin/env node
'use strict';

/**
 * holding_blender.js: Tier 4 Multi-Account Holding Blender & Attribution Drawer.
 * Reconciles duplicate positions across assigned accounts into a unified strategy portfolio,
 * computing Weighted Average Cost (WAC), pooling multi-currency cash balances with FX conversion,
 * and preserving immutable lot-level account attribution tranches.
 */

const fs = require('fs');
const path = require('path');

const {
  validateBlendedHoldings,
  verifyArtifactPair,
  verifyHtmlSelfContainment,
  loadManifestFile
} = require('../../../scripts/framework');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json')) ? path.resolve(SKILL_ROOT, '..', '..') : path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'investment_ways.yaml');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'holding-blender-template.html');

const DEFAULT_FX_RATES = {
  USDINR: 87.20,
  INRUSD: 0.0115
};

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Determine the exchange rate from fromCurr to toCurr.
 */
function getFxRate(fromCurr, toCurr, customFxRates = {}) {
  const from = (fromCurr || '').toUpperCase();
  const to = (toCurr || '').toUpperCase();
  if (!from || !to || from === to) {
    return 1.0;
  }

  const custom = customFxRates || {};
  const directPair = `${from}${to}`;
  const inversePair = `${to}${from}`;

  // 1. Check custom direct pair
  if (isFiniteNumber(custom[directPair])) {
    return round4(Number(custom[directPair]));
  }
  // 2. Check custom inverse pair
  if (isFiniteNumber(custom[inversePair]) && Number(custom[inversePair]) > 0) {
    return round4(1.0 / Number(custom[inversePair]));
  }
  // 3. Check custom single currency
  if (isFiniteNumber(custom[from])) {
    return round4(Number(custom[from]));
  }

  // 4. Fallback to default direct pair
  if (isFiniteNumber(DEFAULT_FX_RATES[directPair])) {
    return round4(Number(DEFAULT_FX_RATES[directPair]));
  }
  // 5. Fallback to default inverse pair
  if (isFiniteNumber(DEFAULT_FX_RATES[inversePair]) && Number(DEFAULT_FX_RATES[inversePair]) > 0) {
    return round4(1.0 / Number(DEFAULT_FX_RATES[inversePair]));
  }

  return 1.0;
}

/**
 * Pure deterministic multi-account holding blender.
 * @param {Array<object>} snapshots - Array of AccountHoldingsSnapshot objects
 * @param {object} [options]
 * @param {string} [options.strategyId='fundamental_lts']
 * @param {string} [options.baseCurrency='INR']
 * @param {string} [options.timestamp]
 * @param {object} [options.fxRates]
 * @returns {object} Canonical StrategyHoldingsBlended object
 */
function blendHoldings(snapshots, options = {}) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error('blendHoldings requires a non-empty array of AccountHoldingsSnapshot objects');
  }

  const strategyId = options.strategyId || 'fundamental_lts';
  const baseCurrency = (options.baseCurrency || 'INR').toUpperCase();
  const timestamp = options.timestamp || new Date().toISOString();
  const fxRates = options.fxRates || {};

  const accountsBlended = [];
  let totalPooledCash = 0.0;

  // Keyed by uppercase canonical ticker
  const positionMap = new Map();

  for (const snap of snapshots) {
    if (!snap || typeof snap !== 'object') continue;
    const accountId = snap.account_id || 'unknown_account';
    const broker = snap.broker || 'unknown_broker';
    const accCurrency = (snap.currency || baseCurrency).toUpperCase();
    const fxRate = getFxRate(accCurrency, baseCurrency, fxRates);

    const rawCash = snap.summary && isFiniteNumber(snap.summary.available_cash)
      ? Number(snap.summary.available_cash)
      : (snap.margin && isFiniteNumber(snap.margin.available_cash) ? Number(snap.margin.available_cash) : 0.0);

    const cashContribution = round2(rawCash * fxRate);
    totalPooledCash += cashContribution;

    const holdingsList = Array.isArray(snap.holdings) ? snap.holdings : [];

    accountsBlended.push({
      account_id: accountId,
      broker,
      original_currency: accCurrency,
      raw_cash: round2(rawCash),
      fx_rate: fxRate,
      pooled_cash_contribution: cashContribution,
      holdings_count: holdingsList.length
    });

    for (const h of holdingsList) {
      if (!h || !h.ticker) continue;
      const ticker = String(h.ticker).trim().toUpperCase();
      const qty = isFiniteNumber(h.quantity) ? Number(h.quantity) : 0.0;
      if (qty <= 0) continue;

      const avgPrice = isFiniteNumber(h.average_price) ? Number(h.average_price) : 0.0;
      const cmp = isFiniteNumber(h.cmp) ? Number(h.cmp) : avgPrice;

      const costInBase = round4(avgPrice * fxRate);
      const investedValueBase = round2(qty * avgPrice * fxRate);
      const currentValueBase = round2(qty * cmp * fxRate);

      const lot = {
        account_id: accountId,
        broker,
        quantity: round4(qty),
        average_price: round2(avgPrice),
        original_currency: accCurrency,
        fx_rate: fxRate,
        cost_in_base_currency: costInBase,
        invested_value_base: investedValueBase,
        current_value_base: currentValueBase,
        weight_in_position_pct: 0.0 // updated after aggregation
      };

      if (!positionMap.has(ticker)) {
        let market = 'IN';
        if (
          accCurrency === 'USD' ||
          (h.exchange && ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA'].includes(h.exchange.toUpperCase())) ||
          (h.isin && h.isin.startsWith('US'))
        ) {
          market = 'US';
        }

        positionMap.set(ticker, {
          ticker,
          name: h.name || ticker,
          isin: h.isin || `${market}_${ticker}`,
          exchange: h.exchange || (market === 'US' ? 'NASDAQ' : 'NSE'),
          market,
          lots: [lot]
        });
      } else {
        const existing = positionMap.get(ticker);
        existing.lots.push(lot);
        // If one lot has richer name/exchange/isin, retain
        if (h.name && h.name.length > existing.name.length) existing.name = h.name;
        if (h.isin && !existing.isin.includes('_')) existing.isin = h.isin;
      }
    }
  }

  // Synthesize consolidated positions
  const positions = [];
  let totalConsolidatedInvested = 0.0;
  let totalConsolidatedCurrent = 0.0;

  for (const [ticker, item] of positionMap.entries()) {
    let blendedQty = 0.0;
    let blendedInvested = 0.0;
    let blendedCurrent = 0.0;

    for (const lot of item.lots) {
      blendedQty += lot.quantity;
      blendedInvested += lot.invested_value_base;
      blendedCurrent += lot.current_value_base;
    }

    blendedQty = round4(blendedQty);
    blendedInvested = round2(blendedInvested);
    blendedCurrent = round2(blendedCurrent);

    const wac = blendedQty > 0 ? round2(blendedInvested / blendedQty) : 0.0;
    const cmpBase = blendedQty > 0 ? round2(blendedCurrent / blendedQty) : 0.0;
    const unrealizedPnl = round2(blendedCurrent - blendedInvested);
    const unrealizedPnlPct = blendedInvested > 0 ? round2((unrealizedPnl / blendedInvested) * 100) : 0.0;

    // Calculate lot weights in this position
    const attribution = item.lots.map(lot => ({
      ...lot,
      weight_in_position_pct: blendedQty > 0 ? round2((lot.quantity / blendedQty) * 100) : 0.0
    }));

    totalConsolidatedInvested += blendedInvested;
    totalConsolidatedCurrent += blendedCurrent;

    positions.push({
      ticker,
      name: item.name,
      isin: item.isin,
      exchange: item.exchange,
      market: item.market,
      quantity: blendedQty,
      average_price: wac,
      cmp: cmpBase,
      invested_value: blendedInvested,
      current_value: blendedCurrent,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: unrealizedPnlPct,
      weight_pct: 0.0, // calculated below relative to total portfolio
      attribution
    });
  }

  totalConsolidatedInvested = round2(totalConsolidatedInvested);
  totalConsolidatedCurrent = round2(totalConsolidatedCurrent);
  totalPooledCash = round2(totalPooledCash);

  // Compute portfolio concentration weights and sort by current value descending
  for (const pos of positions) {
    pos.weight_pct = totalConsolidatedCurrent > 0 ? round2((pos.current_value / totalConsolidatedCurrent) * 100) : 0.0;
  }
  positions.sort((a, b) => b.current_value - a.current_value);

  const totalUnrealizedPnl = round2(totalConsolidatedCurrent - totalConsolidatedInvested);
  const totalUnrealizedPnlPct = totalConsolidatedInvested > 0
    ? round2((totalUnrealizedPnl / totalConsolidatedInvested) * 100)
    : 0.0;

  const totalStrategyEquity = round2(totalConsolidatedCurrent + totalPooledCash);

  return {
    strategy_id: strategyId,
    timestamp,
    base_currency: baseCurrency,
    summary: {
      total_invested: totalConsolidatedInvested,
      total_current_value: totalConsolidatedCurrent,
      unrealized_pnl: totalUnrealizedPnl,
      unrealized_pnl_pct: totalUnrealizedPnlPct,
      pooled_cash: totalPooledCash,
      total_strategy_equity: totalStrategyEquity,
      positions_count: positions.length
    },
    accounts_blended: accountsBlended,
    positions
  };
}

/**
 * Render self-contained HTML dashboard from template.
 */
function renderHtml(blendedHoldings) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found at ${TEMPLATE_PATH}`);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const serialized = JSON.stringify(blendedHoldings);
  return template.replace('/*__DATA__*/null;', `const DATA = ${serialized};`);
}

/**
 * Write blended holdings JSON and HTML artifacts, verifying with artifact harness.
 */
function writeArtifacts(blendedHoldings, outDir = DEFAULT_REPORTS_DIR) {
  const strategiesDir = path.join(outDir, 'strategies');
  fs.mkdirSync(strategiesDir, { recursive: true });

  const wayId = blendedHoldings.strategy_id || 'strategy';
  const jsonPath = path.join(strategiesDir, `${wayId}_blended_holdings.json`);
  const htmlPath = path.join(strategiesDir, `${wayId}_blended_holdings.html`);

  const jsonContent = JSON.stringify(blendedHoldings, null, 2);
  const htmlContent = renderHtml(blendedHoldings);

  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  const harnessResult = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'blended-holdings'
  });

  if (!harnessResult.ok) {
    throw new Error(`Artifact verification failed for ${jsonPath}: ${JSON.stringify(harnessResult.errors)}`);
  }

  return { jsonPath, htmlPath, harnessResult };
}

/**
 * Process a list of AccountHoldingsSnapshot files.
 */
function processSnapshots(snapshotPaths, options = {}) {
  const loadedSnapshots = [];
  for (const sp of snapshotPaths) {
    const resolvedPath = path.resolve(sp);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Snapshot file not found: ${resolvedPath}`);
    }
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    loadedSnapshots.push(JSON.parse(raw));
  }

  const blended = blendHoldings(loadedSnapshots, options);
  const validation = validateBlendedHoldings(blended);
  if (!validation.ok) {
    throw new Error(`Blended holdings schema validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(blended, options.outDir || DEFAULT_REPORTS_DIR);
  }

  return {
    ok: true,
    blended,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Process an Investment Way defined in config/investment_ways.yaml.
 */
async function processStrategyWay(wayId, options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = loadManifestFile(manifestPath);

  if (!manifest || !manifest.investment_ways || !manifest.investment_ways[wayId]) {
    throw new Error(`Strategy "${wayId}" not declared in manifest ${manifestPath}`);
  }

  const way = manifest.investment_ways[wayId];
  const assignedAccounts = way.accounts || [];
  const baseCurrency = way.base_currency || 'INR';

  const snapshots = [];
  for (const accountId of assignedAccounts) {
    let snapshot = null;

    // Check custom map if passed in tests
    if (options.snapshotsMap && options.snapshotsMap[accountId]) {
      snapshot = options.snapshotsMap[accountId];
    } else {
      const candidates = [
        path.join(REPO_ROOT, 'accounts', `${accountId}.json`),
        path.join(options.outDir || DEFAULT_REPORTS_DIR, 'accounts', `${accountId}.json`),
        path.join(SKILL_ROOT, 'tests', 'fixtures', `sample_${accountId}_holdings.json`)
      ];

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          snapshot = JSON.parse(fs.readFileSync(cand, 'utf8'));
          break;
        }
      }
    }

    if (!snapshot) {
      throw new Error(`Could not find snapshot for account "${accountId}". Run broker fetchers first.`);
    }
    snapshots.push(snapshot);
  }

  const blendOpts = {
    strategyId: wayId,
    baseCurrency,
    fxRates: options.fxRates,
    timestamp: options.timestamp,
    outDir: options.outDir
  };

  const blended = blendHoldings(snapshots, blendOpts);
  const validation = validateBlendedHoldings(blended);
  if (!validation.ok) {
    throw new Error(`Blended holdings schema validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(blended, options.outDir || DEFAULT_REPORTS_DIR);
  }

  return {
    ok: true,
    blended,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Parse CLI flags.
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    snapshots: [],
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
    if (arg === '--snapshots') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args.snapshots.push(argv[++i]);
      }
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
Multi-Account Holding Blender & Attribution Drawer CLI
Usage:
  node holding_blender.js --snapshots <path1> <path2>... [--base-currency <INR|USD>] [--fx <PAIR>=<RATE>] [--out <dir>]
  node holding_blender.js --way <way_id> [--manifest <path>] [--fx <PAIR>=<RATE>] [--out <dir>]

Options:
  --snapshots <paths...>  Paths to AccountHoldingsSnapshot JSON files
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
  if (args.snapshots && args.snapshots.length > 0) {
    result = processSnapshots(args.snapshots, {
      strategyId: args.way || 'custom_strategy',
      baseCurrency: args.baseCurrency,
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
    process.stderr.write('[ERROR] Please specify --snapshots <paths...> or --way <way_id>.\n');
    return { ok: false, error: 'MISSING_COMMAND' };
  }

  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const b = result.blended;
    process.stdout.write(`\n🥞 Multi-Account Holdings Blended for ${b.strategy_id} (${b.base_currency}):\n`);
    process.stdout.write(`   • Consolidated Equity:      ${b.summary.total_strategy_equity}\n`);
    process.stdout.write(`   • Total Equities Value:     ${b.summary.total_current_value}\n`);
    process.stdout.write(`   • Total Invested Cost:      ${b.summary.total_invested}\n`);
    process.stdout.write(`   • Unrealized P&L:           ${b.summary.unrealized_pnl} (${b.summary.unrealized_pnl_pct}%)\n`);
    process.stdout.write(`   • Pooled Cash:              ${b.summary.pooled_cash}\n`);
    process.stdout.write(`   • Positions Count:          ${b.summary.positions_count}\n`);
    process.stdout.write(`   • Accounts Blended (${b.accounts_blended.length}):\n`);
    for (const acc of b.accounts_blended) {
      process.stdout.write(`     - ${acc.account_id} (${acc.broker}): ${acc.raw_cash} ${acc.original_currency} (FX: ${acc.fx_rate}) -> ${acc.pooled_cash_contribution} ${b.base_currency}\n`);
    }
    process.stdout.write(`\n📁 Consolidated Artifacts:\n`);
    process.stdout.write(`   • JSON Contract: ${result.jsonPath}\n`);
    process.stdout.write(`   • HTML Drawer:   ${result.htmlPath}\n`);
    process.stdout.write('✅ Universal Verification Harness verified blended holdings pair.\n\n');
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
  getFxRate,
  blendHoldings,
  renderHtml,
  writeArtifacts,
  processSnapshots,
  processStrategyWay,
  parseArgs,
  main
};
