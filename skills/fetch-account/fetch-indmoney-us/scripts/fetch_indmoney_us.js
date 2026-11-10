#!/usr/bin/env node
'use strict';

/**
 * fetch-indmoney-us: Tier 1 broker account fetcher for INDmoney / DriveWealth US Equities.
 * Retrieves US stock holdings, fractional shares, and USD cash balances, emitting
 * canonical AccountHoldingsSnapshot JSON and a self-contained offline HTML dashboard.
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

const {
  validateAccountHoldingsSnapshot,
  verifyArtifactPair,
  detectAuthError,
  formatRenewalInstructions,
  renderCacheWarningBanner
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

let createIndmoneyClient;
let performIndmoneyOAuthLogin;
try {
  const sharedIndmoney = require(path.join(REPO_ROOT, 'scripts', 'indmoney'));
  createIndmoneyClient = sharedIndmoney.createIndmoneyClient;
  performIndmoneyOAuthLogin = sharedIndmoney.performIndmoneyOAuthLogin;
} catch {
  createIndmoneyClient = null;
  performIndmoneyOAuthLogin = null;
}

const SKILL_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');

let calculateXirr;
try {
  const xirrModule = require(path.join(REPO_ROOT, 'skills', 'strategy-xirr', 'scripts', 'lib', 'xirr_math'));
  calculateXirr = xirrModule.calculateXirr;
} catch {
  calculateXirr = null;
}

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

function loadLedgerFromCacheOrExcel(cacheDir = DEFAULT_CACHE_DIR) {
  const ledgerCacheFile = path.join(cacheDir, 'indmoney_ledger.json');
  if (fs.existsSync(ledgerCacheFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerCacheFile, 'utf8'));
      if (parsed && Array.isArray(parsed.all_transactions) && parsed.all_transactions.length > 0) {
        return parsed.all_transactions.map(t => ({
          date: t.date,
          category: t.category,
          amount: Number(t.amount_usd !== undefined ? t.amount_usd : t.amount || 0),
          particulars: t.title || 'INDmoney Transaction',
          voucher: t.transaction_id || t.id || ''
        }));
      }
    } catch {}
  }

  // If cache file not found, try running parse_indmoney_ledger.py
  try {
    const parserScript = path.join(__dirname, 'parse_indmoney_ledger.py');
    if (fs.existsSync(parserScript)) {
      const res = require('child_process').spawnSync('python', [parserScript, '--cache-dir', cacheDir], { encoding: 'utf8' });
      if (res.status === 0 && fs.existsSync(ledgerCacheFile)) {
        const parsed = JSON.parse(fs.readFileSync(ledgerCacheFile, 'utf8'));
        if (parsed && Array.isArray(parsed.all_transactions)) {
          return parsed.all_transactions.map(t => ({
            date: t.date,
            category: t.category,
            amount: Number(t.amount_usd !== undefined ? t.amount_usd : t.amount || 0),
            particulars: t.title || 'INDmoney Transaction',
            voucher: t.transaction_id || t.id || ''
          }));
        }
      }
    }
  } catch {}

  return [];
}

const KNOWN_US_EXCHANGES = {
  AAPL: 'NASDAQ',
  MSFT: 'NASDAQ',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  AMZN: 'NASDAQ',
  NVDA: 'NASDAQ',
  META: 'NASDAQ',
  TSLA: 'NASDAQ',
  AMD: 'NASDAQ',
  INTC: 'NASDAQ',
  CSCO: 'NASDAQ',
  ADBE: 'NASDAQ',
  NFLX: 'NASDAQ',
  AVGO: 'NASDAQ',
  CRM: 'NYSE',
  ORCL: 'NYSE',
  DIS: 'NYSE',
  KO: 'NYSE',
  PEP: 'NASDAQ',
  PG: 'NYSE',
  COST: 'NASDAQ',
  WMT: 'NYSE',
  JNJ: 'NYSE',
  UNH: 'NYSE',
  LLY: 'NYSE',
  V: 'NYSE',
  MA: 'NYSE',
  JPM: 'NYSE',
  BAC: 'NYSE',
  GS: 'NYSE',
  VOO: 'NYSE',
  QQQ: 'NASDAQ',
  SPY: 'NYSE',
  IVV: 'NYSE',
  VTI: 'NYSE',
  RSP: 'NYSE'
};

const KNOWN_US_ISINS = {
  AAPL: 'US0378331005',
  MSFT: 'US5949181045',
  GOOGL: 'US02079K3059',
  GOOG: 'US02079K1079',
  AMZN: 'US0231351067',
  NVDA: 'US67066G1040',
  META: 'US30303M1027',
  TSLA: 'US88160R1014',
  AMD: 'US0079031078',
  INTC: 'US4581401001',
  VOO: 'US9229083632',
  QQQ: 'US46090E1038',
  SPY: 'US78462F1030',
  IVV: 'US4642872000'
};

const KNOWN_US_NAMES = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corp.',
  GOOGL: 'Alphabet Inc. Class A',
  GOOG: 'Alphabet Inc. Class C',
  AMZN: 'Amazon.com Inc.',
  NVDA: 'NVIDIA Corp.',
  META: 'Meta Platforms Inc.',
  TSLA: 'Tesla Inc.',
  AMD: 'Advanced Micro Devices Inc.',
  INTC: 'Intel Corp.',
  TSM: 'Taiwan Semiconductor Manufacturing Co.',
  KO: 'The Coca-Cola Company',
  JNJ: 'Johnson & Johnson',
  AMAT: 'Applied Materials Inc.',
  V: 'Visa Inc.',
  VOO: 'Vanguard S&P 500 ETF',
  QQQ: 'Invesco QQQ Trust',
  SPY: 'SPDR S&P 500 ETF Trust',
  IVV: 'iShares Core S&P 500 ETF',
  VTI: 'Vanguard Total Stock Market ETF',
  RSP: 'Invesco S&P 500 Equal Weight ETF'
};

const KNOWN_US_SECTORS = {
  AAPL: 'Information Technology',
  MSFT: 'Information Technology',
  GOOGL: 'Communication Services',
  GOOG: 'Communication Services',
  AMZN: 'Consumer Discretionary',
  NVDA: 'Information Technology',
  META: 'Communication Services',
  TSLA: 'Consumer Discretionary',
  AMD: 'Information Technology',
  INTC: 'Information Technology',
  CSCO: 'Information Technology',
  ADBE: 'Information Technology',
  NFLX: 'Communication Services',
  AVGO: 'Information Technology',
  CRM: 'Information Technology',
  ORCL: 'Information Technology',
  DIS: 'Communication Services',
  KO: 'Consumer Staples',
  PEP: 'Consumer Staples',
  PG: 'Consumer Staples',
  COST: 'Consumer Staples',
  WMT: 'Consumer Staples',
  JNJ: 'Healthcare',
  UNH: 'Healthcare',
  LLY: 'Healthcare',
  V: 'Financials',
  MA: 'Financials',
  JPM: 'Financials',
  BAC: 'Financials',
  GS: 'Financials',
  TSM: 'Information Technology',
  AMAT: 'Information Technology',
  VOO: 'Index ETF',
  QQQ: 'Index ETF',
  SPY: 'Index ETF',
  IVV: 'Index ETF',
  VTI: 'Index ETF',
  RSP: 'Index ETF'
};

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function round4(val) {
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    broker: 'indmoney',
    out: null,
    refresh: false,
    login: false,
    noBrowser: false,
    authOnly: false,
    only: null,
    jsonOutput: false,
    cacheDir: DEFAULT_CACHE_DIR,
    mockData: null,
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

    if (k === '--broker') args.broker = next().toLowerCase();
    else if (k === '--out') args.out = next();
    else if (k === '--only') args.only = next().toUpperCase();
    else if (k === '--refresh') args.refresh = true;
    else if (k === '--login' || k === '--auth') args.login = true;
    else if (k === '--no-browser') args.noBrowser = true;
    else if (k === '--auth-only') args.authOnly = true;
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '--cache-dir') args.cacheDir = next();
    else if (k === '--mock-data') args.mockData = next();
    else if (k === '-h' || k === '--help') args.help = true;
    else if (!k.startsWith('--') && !args.only) args.only = k.toUpperCase();
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

const USAGE = `Usage: node scripts/fetch_indmoney_us.js [--broker indmoney] [--out DIR] [--refresh] [--login] [--no-browser] [--auth-only] [--only TICKER] [--mock-data PATH] [--json-output]`;

/**
 * Fetch raw INDmoney US holdings, cash balance, and USD/INR rate from MCP, cache, or mock fixture.
 */
async function fetchRawData(options = {}) {
  const { refresh = false, cacheDir = DEFAULT_CACHE_DIR, mockData = null } = options;

  // 1. Mock data override
  if (mockData) {
    const resolvedMock = path.resolve(mockData);
    if (fs.existsSync(resolvedMock)) {
      const parsedMock = JSON.parse(fs.readFileSync(resolvedMock, 'utf8'));
      if (parsedMock._is_cached || parsedMock.is_cached) {
        return {
          ...parsedMock,
          _is_cached: true,
          _cached_at: parsedMock._cached_at || parsedMock.cached_at || parsedMock.timestamp || new Date().toISOString()
        };
      }
      return parsedMock;
    }
  }

  const cacheFile = path.join(cacheDir, 'us_stocks_cache.json');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const loadExistingCache = (isFallback = false, fallbackReason = '') => {
    const candidateFiles = [
      cacheFile,
      path.resolve(__dirname, '../../fetch-indmoney-us-stocks/.cache/us_stocks_cache.json')
    ];
    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        try {
          const cached = JSON.parse(fs.readFileSync(f, 'utf8'));
          if (cached && (Array.isArray(cached.holdings) || Array.isArray(cached.stocks))) {
            const cachedTimestamp = cached.timestamp || fs.statSync(f).mtime.toISOString();
            if (isFallback) {
              process.stderr.write(`[WARNING] Cached Snapshot Active: Data as of ${cachedTimestamp}. ${fallbackReason}\n`);
            }
            return {
              ...cached,
              _is_cached: isFallback,
              _cached_at: cachedTimestamp
            };
          }
        } catch {
          // Continue to next candidate
        }
      }
    }
    return null;
  };

  // 2. Use local cache if valid and refresh not forced
  if (!refresh) {
    const validCache = loadExistingCache(false);
    if (validCache) return validCache;
  }

  // 3. Live fetch via INDmoney MCP Client
  if (typeof createIndmoneyClient === 'function') {
    const client = createIndmoneyClient();
    try {
      const rawResult = await client.fetchAll();
      if (rawResult) {
        const withMeta = {
          ...rawResult,
          timestamp: new Date().toISOString(),
          _is_cached: false
        };
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(withMeta, null, 2), 'utf8');
        } catch {
          // Non-fatal cache write error
        }
        return withMeta;
      }
    } catch (err) {
      const authCheck = detectAuthError('indmoney', err);
      if (authCheck.isAuthError) {
        process.stderr.write(formatRenewalInstructions('indmoney'));
      }

      const reason = authCheck.isAuthError
        ? `INDmoney MCP session authentication failed (${err.message}). Upstream provider unreachable.`
        : `INDmoney MCP upstream request failed (${err.message}). Upstream provider unreachable.`;

      const cachedFallback = loadExistingCache(true, reason);
      if (cachedFallback) {
        return cachedFallback;
      }
      process.stderr.write(`[WARN] INDmoney live MCP fetch unavailable and no cached snapshot found (${err.message}). Checking fixture.\n`);
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close error
      }
    }
  }

  // 4. Fallback to static test fixture
  const fixtureFile = path.resolve(__dirname, '../tests/fixtures/sample_us_holdings.json');
  if (fs.existsSync(fixtureFile)) {
    return JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  }

  return { holdings: [], cash_balance: 0, usd_to_inr: 87.20 };
}

/**
 * Generate canonical AccountHoldingsSnapshot from raw INDmoney data.
 * @param {object} rawData
 * @param {object} [options]
 * @returns {{ snapshot: object, usdToInr: number }}
 */
function generateSnapshot(rawData, options = {}) {
  const onlyTicker = options.only ? options.only.toUpperCase() : null;

  const rawHoldings = Array.isArray(rawData.holdings)
    ? rawData.holdings
    : Array.isArray(rawData.stocks)
    ? rawData.stocks
    : Array.isArray(rawData.data)
    ? rawData.data
    : [];

  const rawSummary = rawData.summary || {};
  const fxRate = Number(rawData.usd_to_inr || rawData.fxRate || rawData.usdinrRate || 87.20);

  let availableCash = 0;
  if (rawData.cash_balance !== undefined) {
    availableCash = Number(rawData.cash_balance);
  } else if (rawSummary.availableCashUsd !== undefined) {
    availableCash = Number(rawSummary.availableCashUsd);
  } else if (rawData.available_cash !== undefined) {
    availableCash = Number(rawData.available_cash);
  } else if (rawData.margin && rawData.margin.available_cash !== undefined) {
    availableCash = Number(rawData.margin.available_cash);
  }
  availableCash = round2(availableCash);

  // Compute totals
  let totalInvested = 0;
  let totalCurrent = 0;

  for (const h of rawHoldings) {
    const qty = Number(h.quantity || h.shares || h.total_units || h.units || 0);
    const avg = Number(h.average_price || h.avgPriceUsd || h.avg_price || h.buy_price || 0);
    const cmp = Number(h.cmp || h.currentPriceUsd || h.last_price || h.price || avg || 0);
    const invested = Number(h.invested_value || h.investedValueUsd || qty * avg || 0);
    const current = Number(h.current_value || h.currentValueUsd || qty * cmp || 0);

    totalInvested += invested;
    totalCurrent += current;
  }

  let holdings = rawHoldings.map((h) => {
    const ticker = (h.ticker || h.symbol || h.investment_code || h.code || '')
      .toUpperCase()
      .trim();

    const quantity = round4(h.quantity || h.shares || h.total_units || h.units || 0);
    const average_price = round2(h.average_price || h.avgPriceUsd || h.avg_price || h.buy_price || 0);
    const cmp = round2(h.cmp || h.currentPriceUsd || h.last_price || h.price || average_price || 0);
    const invested_value = round2(h.invested_value || h.investedValueUsd || quantity * average_price);
    const current_value = round2(h.current_value || h.currentValueUsd || quantity * cmp);
    const unrealized_pnl = round2(
      h.unrealized_pnl !== undefined
        ? h.unrealized_pnl
        : h.unrealizedPnlUsd !== undefined
        ? h.unrealizedPnlUsd
        : current_value - invested_value
    );
    const unrealized_pnl_pct = invested_value > 0 ? round2((unrealized_pnl / invested_value) * 100) : 0;
    const weight_pct = totalCurrent > 0 ? round2((current_value / totalCurrent) * 100) : 0;

    const isFractional = !Number.isInteger(quantity) || h.fractional_shares === true;
    const exchange = h.exchange || KNOWN_US_EXCHANGES[ticker] || 'NASDAQ';
    const isin = h.isin || KNOWN_US_ISINS[ticker] || `US000000${ticker.padEnd(4, '0').slice(0, 4)}`;
    const name = KNOWN_US_NAMES[ticker] || h.name || h.companyName || h.investment || ticker;

    return {
      ticker,
      name,
      isin,
      exchange,
      quantity,
      average_price,
      cmp,
      invested_value,
      current_value,
      unrealized_pnl,
      unrealized_pnl_pct,
      weight_pct,
      fractional_shares: isFractional,
      buy_date: h.buy_date || h.buyDate || null,
      sector: (KNOWN_US_SECTORS[ticker] === 'Financial Services' || h.sector === 'Financial Services') ? 'Financials' : (KNOWN_US_SECTORS[ticker] || h.sector || 'Other')
    };
  });

  if (onlyTicker) {
    holdings = holdings.filter((h) => h.ticker === onlyTicker);
  }

  holdings.sort((a, b) => b.current_value - a.current_value);

  const totalPnl = round2(totalCurrent - totalInvested);
  const totalReturnPct = totalInvested > 0 ? round2((totalPnl / totalInvested) * 100) : 0;

  const rawLedger = loadLedgerFromCacheOrExcel(options.cacheDir || DEFAULT_CACHE_DIR);

  let totalPayin = 0;
  let totalPayout = 0;
  for (const item of rawLedger) {
    const cat = (item.category || '').toUpperCase();
    const amt = Number(item.amount || 0);
    if (cat === 'DEPOSIT' || cat === 'PAYIN') {
      totalPayin += Math.abs(amt);
    } else if (cat === 'WITHDRAWAL' || cat === 'PAYOUT') {
      totalPayout += Math.abs(amt);
    }
  }

  const netDeposits = totalPayin - totalPayout;
  const fundsInvested = rawLedger.length > 0 && totalPayin > 0 ? round2(netDeposits) : round2(totalInvested);

  let accountXirr = null;
  const terminalEquity = round2(totalCurrent + availableCash);
  const evalDate = (rawData.timestamp ? new Date(rawData.timestamp) : new Date()).toISOString().slice(0, 10);

  if (rawLedger.length > 0) {
    const xirrFlows = [];
    for (const item of rawLedger) {
      if (!item.date || item.amount === undefined || item.amount === null) continue;
      const cat = (item.category || '').toUpperCase();
      const amt = Number(item.amount);
      if (cat === 'DEPOSIT' || cat === 'PAYIN') {
        xirrFlows.push({
          date: String(item.date).slice(0, 10),
          amount: -Math.abs(amt)
        });
      } else if (cat === 'WITHDRAWAL' || cat === 'PAYOUT') {
        xirrFlows.push({
          date: String(item.date).slice(0, 10),
          amount: Math.abs(amt)
        });
      }
    }

    if (terminalEquity > 0) {
      xirrFlows.push({
        date: evalDate,
        amount: terminalEquity
      });
    }

    if (xirrFlows.length >= 2) {
      try {
        const xirrRes = computeXirr(xirrFlows);
        if (xirrRes && xirrRes.xirr !== null && !isNaN(xirrRes.xirr)) {
          accountXirr = round2(xirrRes.xirr * 100);
        }
      } catch {}
    }
  }

  const totalAccountEquity = round2(totalCurrent + availableCash);
  const accountGain = round2(totalAccountEquity - fundsInvested);
  const accountGainPct = fundsInvested > 0 ? round2((accountGain / fundsInvested) * 100) : 0;

  const snapshot = {
    account_id: 'indmoney_us',
    broker: 'indmoney',
    currency: 'USD',
    timestamp: new Date().toISOString(),
    summary: {
      total_invested: round2(totalInvested),
      total_current_value: round2(totalCurrent),
      unrealized_pnl: totalPnl,
      unrealized_pnl_pct: totalReturnPct,
      available_cash: availableCash,
      total_account_equity: totalAccountEquity,
      holdings_count: holdings.length,
      funds_invested: round2(fundsInvested),
      account_gain: accountGain,
      account_gain_pct: accountGainPct,
      account_xirr: accountXirr !== null ? round2(accountXirr) : null
    },
    margin: {
      available_cash: availableCash,
      collateral: 0,
      utilised: 0,
      net_margin: availableCash
    },
    holdings,
    ...(rawLedger.length > 0 ? { ledger: rawLedger } : {})
  };

  return { snapshot, usdToInr: fxRate };
}

/**
 * Main execution entrypoint for fetch-indmoney-us.
 */
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return { ok: true };
  }

  if (args.broker !== 'indmoney') {
    throw new Error(`Unsupported broker "${args.broker}". fetch-indmoney-us only supports "indmoney".`);
  }

  if (args.login) {
    if (typeof performIndmoneyOAuthLogin !== 'function') {
      throw new Error('INDmoney OAuth login helper is not available. Please ensure scripts/indmoney/oauth.js exists.');
    }
    const loginRes = await performIndmoneyOAuthLogin({
      openBrowser: !args.noBrowser
    });
    if (!loginRes || !loginRes.ok) {
      throw new Error('INDmoney OAuth authentication failed.');
    }
    if (args.authOnly) {
      if (args.jsonOutput) {
        process.stdout.write(JSON.stringify({ ok: true, access_token: loginRes.access_token, updatedFiles: loginRes.updatedFiles }, null, 2) + '\n');
      }
      return { ok: true, access_token: loginRes.access_token };
    }
    // Automatically force refresh so live holdings are fetched using the fresh token
    args.refresh = true;
  }

  const outDir = path.resolve(args.out || DEFAULT_REPORTS_DIR);
  const accountsDir = path.join(outDir, 'accounts');
  fs.mkdirSync(accountsDir, { recursive: true });

  const rawData = await fetchRawData({
    refresh: args.refresh,
    cacheDir: args.cacheDir,
    mockData: args.mockData
  });

  const { snapshot, usdToInr } = generateSnapshot(rawData, { only: args.only });

  if (args.only && snapshot.holdings.length === 0) {
    const errMsg = `No holding found in INDmoney US account matching ticker "${args.only}".`;
    if (args.jsonOutput) {
      process.stdout.write(JSON.stringify({ ok: false, error: errMsg }, null, 2) + '\n');
    } else {
      process.stderr.write(`[WARN] ${errMsg}\n`);
    }
    return { ok: false, error: errMsg };
  }

  // Validate against canonical contract
  const validationResult = validateAccountHoldingsSnapshot(snapshot);
  if (!validationResult.ok) {
    const msg = `AccountHoldingsSnapshot validation failed: ${JSON.stringify(validationResult.errors)}`;
    throw new Error(msg);
  }

  // Render HTML report with dual USD/INR currency data
  const templatePath = path.join(SKILL_ROOT, 'assets', 'report-template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  // In HTML payload, include usd_to_inr for the dual-currency toggle
  const htmlPayload = {
    ...snapshot,
    usd_to_inr: usdToInr
  };
  const jsonContent = JSON.stringify(snapshot, null, 2);

  const isCached = Boolean(rawData._is_cached);
  const cachedTimestamp = rawData._cached_at || snapshot.timestamp;
  const bannerHtml = isCached ? renderCacheWarningBanner(cachedTimestamp) : '';

  let htmlContent = templateHtml.replace('/*__DATA__*/null', () => JSON.stringify(htmlPayload, null, 2));
  if (isCached) {
    if (htmlContent.includes('<!--__CACHE_BANNER__-->')) {
      htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', bannerHtml);
    } else {
      htmlContent = htmlContent.replace('<div class="container">', `<div class="container">\n  ${bannerHtml}`);
    }
  } else {
    htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', '');
  }

  // Write outputs to accounts/indmoney_us.json and accounts/indmoney_us.html
  const jsonPath = path.join(accountsDir, 'indmoney_us.json');
  const htmlPath = path.join(accountsDir, 'indmoney_us.html');
  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  // Also write top-level in outDir for backwards compatibility
  fs.writeFileSync(path.join(outDir, 'indmoney_us.json'), jsonContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'indmoney_us.html'), htmlContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'indmoney-us-stocks.json'), jsonContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'indmoney-us-stocks.html'), htmlContent, 'utf8');

  // Verify artifact pair with Universal Verification Harness
  const harnessResult = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'holdings'
  });

  if (!harnessResult.ok) {
    throw new Error(`Artifact harness verification failed: ${JSON.stringify(harnessResult.errors)}`);
  }

  if (args.jsonOutput) {
    const payload = {
      ok: true,
      account_id: snapshot.account_id,
      broker: snapshot.broker,
      currency: snapshot.currency,
      timestamp: snapshot.timestamp,
      summary: snapshot.summary,
      usd_to_inr: usdToInr,
      artifacts: {
        json: jsonPath,
        html: htmlPath
      }
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    const s = snapshot.summary;
    process.stdout.write('\n📊 INDmoney US AccountHoldingsSnapshot Generated:\n');
    process.stdout.write(`   • Equity Value:         $${s.total_current_value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (≈ ₹${(s.total_current_value * usdToInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })})\n`);
    process.stdout.write(`   • Total Invested Cost:  $${s.total_invested.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`);
    if (s.funds_invested !== undefined) {
      process.stdout.write(`   • Funds Invested:       $${s.funds_invested.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`);
    }
    if (s.account_gain !== undefined) {
      process.stdout.write(`   • Account Gain:         ${s.account_gain >= 0 ? '+' : ''}$${s.account_gain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${s.account_gain_pct.toFixed(2)}%)\n`);
    }
    if (s.account_xirr !== undefined && s.account_xirr !== null) {
      process.stdout.write(`   • Account XIRR:         ${s.account_xirr >= 0 ? '+' : ''}${s.account_xirr.toFixed(2)}%\n`);
    }
    process.stdout.write(`   • Unrealized P&L:       ${s.unrealized_pnl >= 0 ? '+' : ''}$${s.unrealized_pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${s.unrealized_pnl_pct.toFixed(2)}%)\n`);
    process.stdout.write(`   • Available USD Cash:   $${s.available_cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`);
    process.stdout.write(`   • Portfolio Value:      $${s.total_account_equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`);
    process.stdout.write(`   • Holdings Count:       ${s.holdings_count}\n`);
    process.stdout.write(`   • FX Conversion Rate:   1 USD = ₹${usdToInr.toFixed(2)}\n\n`);
    process.stdout.write(`✅ Artifacts written and verified:\n`);
    process.stdout.write(`   • JSON Contract: ${jsonPath}\n`);
    process.stdout.write(`   • HTML Report:   ${htmlPath}\n\n`);
  }

  return { ok: true, snapshot, usdToInr, jsonPath, htmlPath };
}

if (require.main === module) {
  main()
    .then((res) => {
      process.exit(res && res.ok === false ? 1 : 0);
    })
    .catch((err) => {
      process.stderr.write(`[ERROR] ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  fetchRawData,
  generateSnapshot,
  main,
  parseArgs
};

