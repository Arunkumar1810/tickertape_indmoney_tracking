#!/usr/bin/env node
'use strict';

/**
 * fetch_strategy_stocks.js: Tier 1 Strategy Holdings & Multi-Account Blender.
 * Resolves assigned accounts for an investment way from config/investment_ways.yaml,
 * invokes their respective fetch- skills dynamically, reconciles positions into a unified
 * strategy portfolio with Weighted Average Cost (WAC), pools multi-currency cash balances,
 * preserves lot-level attribution tranches, and emits canonical AccountHoldingsSnapshot
 * twin artifacts (JSON contract and offline self-contained HTML dashboard).
 */

const fs = require('fs');
const path = require('path');

function findRepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) return curr;
    curr = path.dirname(curr);
  }
  return path.resolve(startDir, '../../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);
const SKILL_ROOT = path.resolve(__dirname, '..');

const {
  validateAccountHoldingsSnapshot,
  validateBlendedHoldings,
  verifyArtifactPair,
  verifyHtmlSelfContainment,
  loadManifestFile,
  renderCacheWarningBanner,
  calculateXirr
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'investment_ways.yaml');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'report-template.html');

function computeXirr(cashflows) {
  if (typeof calculateXirr === 'function') {
    return calculateXirr(cashflows);
  }
  if (!Array.isArray(cashflows) || cashflows.length < 2) return { xirr: null };
  const d0 = new Date(cashflows[0].date);
  let rate = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (const c of cashflows) {
      const years = (new Date(c.date) - d0) / (365.25 * 86400000);
      const disc = Math.pow(1 + rate, years);
      npv += c.amount / disc;
      dnpv -= years * c.amount / (disc * (1 + rate));
    }
    if (Math.abs(npv) < 1e-6) return { xirr: rate };
    if (Math.abs(dnpv) < 1e-9) break;
    rate -= npv / dnpv;
  }
  return { xirr: null };
}

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
 * Currency exchange rate calculation.
 */
function getFxRate(fromCurr, toCurr, customFxRates = {}) {
  const from = (fromCurr || '').toUpperCase();
  const to = (toCurr || '').toUpperCase();
  if (!from || !to || from === to) return 1.0;

  const custom = customFxRates || {};
  const directPair = `${from}${to}`;
  const inversePair = `${to}${from}`;

  if (isFiniteNumber(custom[directPair])) return round4(Number(custom[directPair]));
  if (isFiniteNumber(custom[inversePair]) && Number(custom[inversePair]) > 0) {
    return round4(1.0 / Number(custom[inversePair]));
  }
  if (isFiniteNumber(custom[from])) return round4(Number(custom[from]));

  if (isFiniteNumber(DEFAULT_FX_RATES[directPair])) return round4(Number(DEFAULT_FX_RATES[directPair]));
  if (isFiniteNumber(DEFAULT_FX_RATES[inversePair]) && Number(DEFAULT_FX_RATES[inversePair]) > 0) {
    return round4(1.0 / Number(DEFAULT_FX_RATES[inversePair]));
  }

  return 1.0;
}

/**
 * Pure deterministic multi-account holding blender.
 * Emits canonical AccountHoldingsSnapshot.
 * @param {Array<object>} snapshots - Array of AccountHoldingsSnapshot objects
 * @param {object} [options]
 * @returns {object} Canonical AccountHoldingsSnapshot
 */
function blendSnapshots(snapshots, options = {}) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error('blendSnapshots requires a non-empty array of AccountHoldingsSnapshot objects');
  }

  const strategyId = options.strategyId || 'fundamental_lts';
  const strategyTitle = options.strategyTitle || options.wayTitle || strategyId;
  const baseCurrency = (options.baseCurrency || 'INR').toUpperCase();
  const timestamp = options.timestamp || new Date().toISOString();
  const fxRates = options.fxRates || {};

  const accountsBlended = [];
  let totalPooledCash = 0.0;
  let totalFundsInvested = 0.0;
  const combinedLedger = [];

  const positionMap = new Map();

  for (const snap of snapshots) {
    if (!snap || typeof snap !== 'object') continue;
    const accountId = snap.account_id || 'unknown_account';
    const broker = snap.broker || accountId;
    const accCurrency = (snap.currency || baseCurrency).toUpperCase();
    const fxRate = getFxRate(accCurrency, baseCurrency, fxRates);

    const rawCash = snap.summary && isFiniteNumber(snap.summary.available_cash)
      ? Number(snap.summary.available_cash)
      : (snap.margin && isFiniteNumber(snap.margin.available_cash) ? Number(snap.margin.available_cash) : 0.0);

    const cashContribution = round2(rawCash * fxRate);
    totalPooledCash += cashContribution;

    if (snap.summary && isFiniteNumber(snap.summary.funds_invested)) {
      totalFundsInvested += round2(Number(snap.summary.funds_invested) * fxRate);
    }

    if (Array.isArray(snap.ledger)) {
      snap.ledger.forEach(entry => {
        combinedLedger.push({
          ...entry,
          amount: round2(entry.amount * fxRate),
          account_id: accountId
        });
      });
    }

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
        weight_in_position_pct: 0.0
      };

      if (!positionMap.has(ticker)) {
        let market = 'IN';
        if (
          accCurrency === 'USD' ||
          (h.exchange && ['NASDAQ', 'NYSE', 'AMEX', 'NYSEARCA'].includes(h.exchange.toUpperCase())) ||
          (h.isin && h.isin.startsWith('US')) ||
          h.market === 'US'
        ) {
          market = 'US';
        }

        positionMap.set(ticker, {
          ticker,
          name: h.name || ticker,
          isin: h.isin || `${market}_${ticker}`,
          exchange: h.exchange || (market === 'US' ? 'NASDAQ' : 'NSE'),
          market,
          sector: h.sector || 'Unclassified',
          fractional_shares: Boolean(h.fractional_shares || (qty % 1 !== 0)),
          buy_date: h.buy_date || null,
          lots: [lot]
        });
      } else {
        const existing = positionMap.get(ticker);
        existing.lots.push(lot);
        if (h.name && h.name.length > existing.name.length) existing.name = h.name;
        if (h.isin && !existing.isin.includes('_')) existing.isin = h.isin;
        if (h.sector && existing.sector === 'Unclassified') existing.sector = h.sector;
        if (h.fractional_shares || (qty % 1 !== 0)) existing.fractional_shares = true;
      }
    }
  }

  // Aggregate positions
  const holdings = [];
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

    const attribution = item.lots.map(lot => ({
      ...lot,
      weight_in_position_pct: blendedQty > 0 ? round2((lot.quantity / blendedQty) * 100) : 0.0
    }));

    totalConsolidatedInvested += blendedInvested;
    totalConsolidatedCurrent += blendedCurrent;

    holdings.push({
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
      weight_pct: 0.0,
      fractional_shares: item.fractional_shares,
      buy_date: item.buy_date,
      sector: item.sector,
      attribution
    });
  }

  totalConsolidatedInvested = round2(totalConsolidatedInvested);
  totalConsolidatedCurrent = round2(totalConsolidatedCurrent);
  totalPooledCash = round2(totalPooledCash);

  for (const pos of holdings) {
    pos.weight_pct = totalConsolidatedCurrent > 0 ? round2((pos.current_value / totalConsolidatedCurrent) * 100) : 0.0;
  }
  holdings.sort((a, b) => b.current_value - a.current_value);

  const totalUnrealizedPnl = round2(totalConsolidatedCurrent - totalConsolidatedInvested);
  const totalUnrealizedPnlPct = totalConsolidatedInvested > 0
    ? round2((totalUnrealizedPnl / totalConsolidatedInvested) * 100)
    : 0.0;

  const totalStrategyEquity = round2(totalConsolidatedCurrent + totalPooledCash);
  totalFundsInvested = round2(totalFundsInvested);
  const accountGain = totalFundsInvested > 0 ? round2(totalStrategyEquity - totalFundsInvested) : totalUnrealizedPnl;
  const accountGainPct = totalFundsInvested > 0 ? round2((accountGain / totalFundsInvested) * 100) : totalUnrealizedPnlPct;

  let accountXirr = null;
  if (snapshots.length === 1 && snapshots[0].summary && isFiniteNumber(snapshots[0].summary.account_xirr)) {
    accountXirr = snapshots[0].summary.account_xirr;
  } else if (combinedLedger.length > 0) {
    const xirrFlows = [];
    for (const item of combinedLedger) {
      if (!item.date || item.amount === undefined || item.amount === null) continue;
      const cat = (item.category || '').toUpperCase();
      const amt = Number(item.amount);
      if (cat === 'DEPOSIT' || cat === 'PAYIN') {
        xirrFlows.push({
          date: String(item.date).slice(0, 10),
          amount: -Math.abs(amt)
        });
      } else if (cat === 'WITHDRAWAL' || cat === 'PAYOUT' || cat === 'DIVIDEND') {
        xirrFlows.push({
          date: String(item.date).slice(0, 10),
          amount: Math.abs(amt)
        });
      }
    }

    if (totalStrategyEquity > 0) {
      xirrFlows.push({
        date: new Date().toISOString().slice(0, 10),
        amount: totalStrategyEquity
      });
    }

    if (xirrFlows.length >= 2) {
      try {
        const xirrRes = computeXirr(xirrFlows);
        if (xirrRes && xirrRes.xirr !== null && !isNaN(xirrRes.xirr)) {
          accountXirr = round2(xirrRes.xirr * 100);
        }
      } catch {
        accountXirr = null;
      }
    }
  }

  const snapshot = {
    account_id: strategyId,
    broker: `Strategy: ${strategyTitle}`,
    currency: baseCurrency,
    timestamp,
    summary: {
      total_invested: totalConsolidatedInvested,
      total_current_value: totalConsolidatedCurrent,
      unrealized_pnl: totalUnrealizedPnl,
      unrealized_pnl_pct: totalUnrealizedPnlPct,
      available_cash: totalPooledCash,
      total_account_equity: totalStrategyEquity,
      holdings_count: holdings.length,
      ...(totalFundsInvested > 0 ? {
        funds_invested: totalFundsInvested,
        account_gain: accountGain,
        account_gain_pct: accountGainPct
      } : {}),
      account_xirr: accountXirr
    },
    margin: {
      available_cash: totalPooledCash,
      collateral: 0,
      utilised: 0,
      net_margin: totalPooledCash
    },
    holdings,
    accounts_blended: accountsBlended,
    strategy_id: strategyId,
    base_currency: baseCurrency
  };

  if (combinedLedger.length > 0) {
    snapshot.ledger = combinedLedger;
  }

  return snapshot;
}

/**
 * Converts AccountHoldingsSnapshot to legacy StrategyHoldingsBlended for downstream compatibility.
 */
function toBlendedHoldingsContract(snapshot) {
  return {
    strategy_id: snapshot.account_id || snapshot.strategy_id || 'fundamental_lts',
    timestamp: snapshot.timestamp,
    base_currency: snapshot.currency || snapshot.base_currency || 'INR',
    summary: {
      total_invested: snapshot.summary.total_invested,
      total_current_value: snapshot.summary.total_current_value,
      unrealized_pnl: snapshot.summary.unrealized_pnl,
      unrealized_pnl_pct: snapshot.summary.unrealized_pnl_pct,
      pooled_cash: snapshot.summary.available_cash,
      total_strategy_equity: snapshot.summary.total_account_equity,
      positions_count: snapshot.summary.holdings_count
    },
    accounts_blended: snapshot.accounts_blended || [],
    positions: snapshot.holdings
  };
}

/**
 * Resolve skill entry script for an account.
 */
function resolveAccountSkillScript(skillName) {
  const candidates = [
    path.join(REPO_ROOT, 'skills', 'fetch-account', skillName, 'scripts', `${skillName.replace(/-/g, '_')}.js`),
    path.join(REPO_ROOT, 'skills', 'fetch-account', skillName, 'scripts', `${skillName}.js`),
    path.join(REPO_ROOT, 'skills', skillName, 'scripts', `${skillName.replace(/-/g, '_')}.js`),
    path.join(REPO_ROOT, 'skills', skillName, 'scripts', `${skillName}.js`)
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Dynamically fetch or load an account's holdings snapshot.
 */
async function loadOrFetchAccount(accountId, accountConfig, options = {}) {
  const reportsDir = options.reportsDir || DEFAULT_REPORTS_DIR;
  const accountsDir = path.join(reportsDir, 'accounts');
  const cachedJsonPath = path.join(accountsDir, `${accountId}.json`);

  const refresh = Boolean(options.refresh);

  if (!refresh && fs.existsSync(cachedJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(cachedJsonPath, 'utf8'));
      if (data && data.account_id && Array.isArray(data.holdings)) {
        return { ok: true, snapshot: data, fromCache: true };
      }
    } catch {
      // Fallback to fetch on parse error
    }
  }

  // Invoke fetcher skill
  const skillName = (accountConfig && accountConfig.skill) || `fetch-${accountId}`;
  const scriptPath = resolveAccountSkillScript(skillName);

  if (!scriptPath) {
    // If cached file exists as fallback
    if (fs.existsSync(cachedJsonPath)) {
      const data = JSON.parse(fs.readFileSync(cachedJsonPath, 'utf8'));
      return { ok: true, snapshot: data, fromCache: true };
    }
    throw new Error(`Cannot locate fetch skill script for account "${accountId}" (skill "${skillName}")`);
  }

  try {
    const fetchModule = require(scriptPath);
    if (typeof fetchModule.main === 'function') {
      const args = ['--out', reportsDir];
      if (refresh) args.push('--refresh');
      if (options.only) args.push('--only', options.only);
      const res = await fetchModule.main(args);
      if (res && res.snapshot) {
        return { ok: true, snapshot: res.snapshot, fromCache: false };
      }
    }
  } catch (err) {
    // If execution fails but cached file is present, fallback gracefully
    if (fs.existsSync(cachedJsonPath)) {
      const data = JSON.parse(fs.readFileSync(cachedJsonPath, 'utf8'));
      return { ok: true, snapshot: data, fromCache: true, warning: err.message };
    }
    throw err;
  }

  if (fs.existsSync(cachedJsonPath)) {
    const data = JSON.parse(fs.readFileSync(cachedJsonPath, 'utf8'));
    return { ok: true, snapshot: data, fromCache: true };
  }

  throw new Error(`Failed to obtain snapshot for account "${accountId}"`);
}

/**
 * Render self-contained offline HTML dashboard.
 */
function renderHtml(snapshot, options = {}) {
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const usdToInr = options.usdToInr || (options.fxRates && options.fxRates.USDINR) || DEFAULT_FX_RATES.USDINR;
  const payload = {
    ...snapshot,
    usd_to_inr: usdToInr
  };

  let rendered = template.replace('/*__DATA__*/null', () => JSON.stringify(payload, null, 2));

  if (options.isCached) {
    const banner = renderCacheWarningBanner(snapshot.timestamp);
    rendered = rendered.replace('<!--__CACHE_BANNER__-->', banner);
  } else {
    rendered = rendered.replace('<!--__CACHE_BANNER__-->', '');
  }

  return rendered;
}

/**
 * Write outputs and verify with Universal Verification Harness.
 */
function writeArtifacts(snapshot, options = {}) {
  const outDir = options.outDir || DEFAULT_REPORTS_DIR;
  const strategiesDir = path.join(outDir, 'strategies');
  const accountsDir = path.join(outDir, 'accounts');

  fs.mkdirSync(strategiesDir, { recursive: true });
  fs.mkdirSync(accountsDir, { recursive: true });

  const strategyId = snapshot.account_id || snapshot.strategy_id || 'fundamental_lts';

  const jsonContent = JSON.stringify(snapshot, null, 2);
  const htmlContent = renderHtml(snapshot, options);

  const stratJson = path.join(strategiesDir, `${strategyId}_holdings.json`);
  const stratHtml = path.join(strategiesDir, `${strategyId}_holdings.html`);

  fs.writeFileSync(stratJson, jsonContent, 'utf8');
  fs.writeFileSync(stratHtml, htmlContent, 'utf8');

  // Also write to accounts/ directory for fetch skill convention matching
  const accJson = path.join(accountsDir, `${strategyId}.json`);
  const accHtml = path.join(accountsDir, `${strategyId}.html`);
  fs.writeFileSync(accJson, jsonContent, 'utf8');
  fs.writeFileSync(accHtml, htmlContent, 'utf8');

  // Universal Verification Harness
  const verification = verifyArtifactPair({
    jsonPath: stratJson,
    htmlPath: stratHtml,
    schemaType: 'holdings'
  });

  if (!verification.ok) {
    throw new Error(`Artifact harness verification failed: ${JSON.stringify(verification.errors)}`);
  }

  return {
    stratJson,
    stratHtml,
    accJson,
    accHtml
  };
}

/**
 * Orchestrate strategy stock holdings fetching.
 * @param {string} strategyId
 * @param {object} [options]
 */
async function processStrategy(strategyId, options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = loadManifestFile(manifestPath);

  const ways = (manifest && manifest.investment_ways) || {};
  let resolvedId = strategyId;
  let way = ways[resolvedId] || (Array.isArray(ways) ? ways.find(w => w.id === resolvedId) : null);

  if (!way) {
    // Support common aliases and bidirectional substring matching (e.g. 'lts' <-> 'fundamental_lts', 'foreign' <-> 'lts_foreign')
    const sId = strategyId.toLowerCase();
    const keyMatch = Object.keys(ways).find(k => {
      const kl = k.toLowerCase();
      return kl === sId ||
        kl.endsWith('_' + sId) ||
        kl.includes(sId) ||
        sId.endsWith('_' + kl) ||
        sId.includes(kl);
    });
    if (keyMatch) {
      resolvedId = keyMatch;
      way = ways[keyMatch];
    }
  }

  if (!way) {
    const available = Object.keys(ways).join(', ');
    throw new Error(`Strategy "${strategyId}" not found in manifest at ${manifestPath}. Available strategies: [${available}]`);
  }

  const baseCurrency = (way.base_currency || 'INR').toUpperCase();
  const rawAccounts = Array.isArray(way.accounts) ? way.accounts : (typeof way.accounts === 'string' ? [way.accounts] : []);
  const accountsList = [];
  for (const item of rawAccounts) {
    if (typeof item === 'string') {
      item.split(',').map(s => s.trim()).filter(Boolean).forEach(a => accountsList.push(a));
    }
  }

  if (accountsList.length === 0) {
    throw new Error(`Strategy "${resolvedId}" has no assigned accounts in ${manifestPath}`);
  }

  const snapshots = [];
  let anyFromCache = false;

  for (const accId of accountsList) {
    const accConfig = manifest.accounts ? manifest.accounts[accId] : null;
    const fetchRes = await loadOrFetchAccount(accId, accConfig, {
      ...options,
      reportsDir: options.outDir || DEFAULT_REPORTS_DIR
    });
    if (fetchRes.fromCache) anyFromCache = true;
    snapshots.push(fetchRes.snapshot);
  }

  const fxRates = options.fxRates || DEFAULT_FX_RATES;
  const snapshot = blendSnapshots(snapshots, {
    strategyId: resolvedId,
    strategyTitle: way.title || resolvedId,
    baseCurrency,
    fxRates
  });

  // Filter by single ticker if requested
  if (options.only) {
    const targetTicker = options.only.toUpperCase();
    snapshot.holdings = snapshot.holdings.filter(h => h.ticker.toUpperCase() === targetTicker);
    snapshot.summary.holdings_count = snapshot.holdings.length;
  }

  // Validate contract
  const validation = validateAccountHoldingsSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`AccountHoldingsSnapshot validation failed: ${JSON.stringify(validation.errors)}`);
  }

  const artifacts = writeArtifacts(snapshot, {
    ...options,
    isCached: anyFromCache,
    fxRates
  });

  return {
    ok: true,
    snapshot,
    artifacts
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    strategy: null,
    out: null,
    refresh: false,
    list: false,
    only: null,
    jsonOutput: false,
    mockData: null,
    manifest: null,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error(`Missing value for ${k}`);
      }
      return argv[++i];
    };

    if (k === '--strategy' || k === '--way') args.strategy = next();
    else if (k === '--out') args.out = next();
    else if (k === '--manifest') args.manifest = next();
    else if (k === '--only') args.only = next().toUpperCase();
    else if (k === '--mock-data') args.mockData = next();
    else if (k === '--refresh') args.refresh = true;
    else if (k === '--list') args.list = true;
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else if (!k.startsWith('--') && !args.strategy) {
      args.strategy = k;
    } else {
      throw new Error(`Unknown option: ${k}`);
    }
  }

  return args;
}

const USAGE = `
fetch-strategy-stocks: Fetch and blend account holdings for a target strategy way.

Usage:
  node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js [OPTIONS]

Options:
  --strategy, --way <ID>    Strategy way ID from config/investment_ways.yaml (default: fundamental_lts)
  --list                    List available strategies from manifest and exit
  --refresh                 Force refresh of underlying account holdings
  --only <TICKER>           Filter holdings to a single ticker
  --out <DIR>               Output reports directory (default: reports)
  --manifest <PATH>         Custom investment_ways.yaml manifest path
  --mock-data <PATH>        Load mock account snapshots JSON for testing
  --json, --json-output     Output JSON payload to stdout
  -h, --help                Show this help message
`;

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return { ok: true };
  }

  const manifestPath = args.manifest || DEFAULT_MANIFEST_PATH;

  if (args.list) {
    const manifest = loadManifestFile(manifestPath);
    const ways = (manifest && manifest.investment_ways) || {};
    const list = Object.entries(ways).map(([id, w]) => ({
      id,
      title: w.title || id,
      base_currency: w.base_currency || 'INR',
      accounts: w.accounts || []
    }));

    if (args.jsonOutput) {
      process.stdout.write(JSON.stringify(list, null, 2) + '\n');
    } else {
      process.stdout.write('\nAvailable Investment Strategies:\n');
      list.forEach(w => {
        process.stdout.write(`  • ${w.id.padEnd(22)}: ${w.title} [${w.base_currency}] (Accounts: ${w.accounts.join(', ')})\n`);
      });
      process.stdout.write('\n');
    }
    return { ok: true, list };
  }

  const strategyId = args.strategy || 'fundamental_lts';
  const outDir = path.resolve(args.out || DEFAULT_REPORTS_DIR);

  if (args.mockData) {
    const rawMock = JSON.parse(fs.readFileSync(path.resolve(args.mockData), 'utf8'));
    const snapshots = Array.isArray(rawMock) ? rawMock : (rawMock.snapshots || [rawMock]);
    const snapshot = blendSnapshots(snapshots, {
      strategyId,
      baseCurrency: 'INR'
    });

    const validation = validateAccountHoldingsSnapshot(snapshot);
    if (!validation.ok) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
    }

    const artifacts = writeArtifacts(snapshot, { outDir });
    if (args.jsonOutput) {
      process.stdout.write(JSON.stringify({ ok: true, snapshot, artifacts }, null, 2) + '\n');
    } else {
      process.stdout.write(`[SUCCESS] Blended mock holdings for strategy "${strategyId}".\n`);
    }
    return { ok: true, snapshot, artifacts };
  }

  const result = await processStrategy(strategyId, {
    outDir,
    refresh: args.refresh,
    only: args.only,
    manifestPath
  });

  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify({
      ok: true,
      strategy_id: strategyId,
      currency: result.snapshot.currency,
      summary: result.snapshot.summary,
      artifacts: result.artifacts
    }, null, 2) + '\n');
  } else {
    process.stdout.write(`[SUCCESS] Strategy "${strategyId}" holdings snapshot generated.\n`);
    process.stdout.write(`  JSON: ${result.artifacts.stratJson}\n`);
    process.stdout.write(`  HTML: ${result.artifacts.stratHtml}\n`);
  }

  return result;
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[ERROR] ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  findRepoRoot,
  getFxRate,
  blendSnapshots,
  toBlendedHoldingsContract,
  loadOrFetchAccount,
  renderHtml,
  writeArtifacts,
  processStrategy,
  parseArgs,
  main
};

