#!/usr/bin/env node
'use strict';

/**
 * fetch-angelone: Tier 1 broker account fetcher for Angel One.
 * Retrieves Demat equity positions and cash margins, emitting canonical
 * AccountHoldingsSnapshot JSON and a self-contained offline HTML dashboard.
 */

const fs = require('fs');
const path = require('path');

const {
  validateAccountHoldingsSnapshot,
  verifyArtifactPair,
  detectAuthError,
  formatRenewalInstructions,
  renderCacheWarningBanner
} = require('../../../scripts/framework');

let createAngelOneClient;
try {
  const sharedAngelOne = require('../../../scripts/angelone');
  createAngelOneClient = sharedAngelOne.createAngelOneClient;
} catch {
  createAngelOneClient = null;
}

let calculateXirr;
try {
  const xirrModule = require('../../strategy-xirr/scripts/lib/xirr_math');
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

const SKILL_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const DEFAULT_REPORTS_DIR = path.join(SKILL_ROOT, 'reports');
const COMPANIES_FILE = path.join(SKILL_ROOT, 'assets', 'companies.json');

function loadCompanies() {
  if (fs.existsSync(COMPANIES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(COMPANIES_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

const COMPANIES = loadCompanies();

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    broker: 'angelone',
    out: null,
    refresh: false,
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

    if (k === '--out') args.out = next();
    else if (k === '--only') args.only = next().toUpperCase();
    else if (k === '--refresh') args.refresh = true;
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '--cache-dir') args.cacheDir = next();
    else if (k === '--mock-data') args.mockData = next();
    else if (k === '-h' || k === '--help') args.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

const USAGE = `Usage: node scripts/fetch_angelone.js [--out DIR] [--refresh] [--only TICKER] [--json-output]`;

/**
 * Load bank transactions ledger from local JSON cache or Excel export (Transaction_2026.xlsx).
 */
function loadLedgerFromCacheOrExcel(cacheDir = DEFAULT_CACHE_DIR) {
  const ledgerCacheFile = path.join(cacheDir, 'ledger_cache.json');
  if (fs.existsSync(ledgerCacheFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerCacheFile, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }

  // Check for Excel transaction files in cacheDir or DEFAULT_CACHE_DIR
  const candidateExcels = [
    path.join(cacheDir, 'Transaction_2026.xlsx'),
    path.join(cacheDir, 'Transaction.xlsx'),
    path.join(DEFAULT_CACHE_DIR, 'Transaction_2026.xlsx'),
    path.join(DEFAULT_CACHE_DIR, 'Transaction.xlsx')
  ];

  for (const excelPath of candidateExcels) {
    if (fs.existsSync(excelPath)) {
      try {
        const parserScript = path.join(__dirname, 'parse_angelone_ledger.py');
        if (fs.existsSync(parserScript)) {
          const res = require('child_process').spawnSync('python', [parserScript, excelPath], { encoding: 'utf8' });
          if (res.status === 0 && res.stdout) {
            const parsed = JSON.parse(res.stdout);
            if (Array.isArray(parsed) && parsed.length > 0) {
              try {
                fs.writeFileSync(ledgerCacheFile, JSON.stringify(parsed, null, 2), 'utf8');
              } catch {}
              return parsed;
            }
          }
        }
      } catch {}
    }
  }
  return [];
}

/**
 * Fetch raw Angel One holdings and cash margins from live MCP/API, cache, or mock.
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

  const cacheFile = path.join(cacheDir, 'holdings_cache.json');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const loadExistingCache = (isFallback = false, fallbackReason = '') => {
    const candidateFiles = [
      cacheFile,
      path.resolve(__dirname, '../../fetch-lts/.cache/holdings_cache.json')
    ];
    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        try {
          const cached = JSON.parse(fs.readFileSync(f, 'utf8'));
          if (cached && Array.isArray(cached.holdings)) {
            if (!cached.ledger || cached.ledger.length === 0) {
              cached.ledger = loadLedgerFromCacheOrExcel(cacheDir);
            }
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

  // 3. Live fetch via Angel One Client
  if (typeof createAngelOneClient === 'function') {
    const client = createAngelOneClient();
    try {
      const rawHoldings = await client.getHoldings();
      let margin = { available_cash: 0, net_margin: 0 };
      try {
        margin = await client.getMargins();
      } catch (err) {
        // Warning noted, continue with zero margin
      }

      let trades = [];
      try {
        trades = await client.getHistoricalTrades();
      } catch {
        // Trade history optional
      }

      let ledger = [];
      try {
        ledger = await client.getAccountLedger();
      } catch {
        // Ledger optional
      }

      const rawResult = {
        holdings: rawHoldings || [],
        margin: margin || { available_cash: 0, net_margin: 0 },
        trades: trades || [],
        ledger: ledger || [],
        timestamp: new Date().toISOString(),
        _is_cached: false
      };

      try {
        fs.writeFileSync(cacheFile, JSON.stringify(rawResult, null, 2), 'utf8');
      } catch {
        // Non-fatal cache write error
      }

      return rawResult;
    } catch (err) {
      const authCheck = detectAuthError('angelone', err);
      if (authCheck.isAuthError) {
        process.stderr.write(formatRenewalInstructions('angelone'));
      }

      const reason = authCheck.isAuthError
        ? `Angel One SmartAPI authentication failed (${err.message}). Upstream provider unreachable.`
        : `Angel One upstream request failed (${err.message}). Upstream provider unreachable.`;

      const cachedFallback = loadExistingCache(true, reason);
      if (cachedFallback) {
        return cachedFallback;
      }
      process.stderr.write(`[WARN] Angel One live fetch failed and no cached snapshot found (${err.message}). Checking fixture.\n`);
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore close error
      }
    }
  }

  // 4. If client unavailable and no cache, check for fixture
  const fixtureFile = path.resolve(__dirname, '../tests/fixtures/sample_holdings.json');
  if (fs.existsSync(fixtureFile)) {
    return JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  }

  return { holdings: [], margin: { available_cash: 0, net_margin: 0 }, trades: [], ledger: [] };
}

/**
 * Generate canonical AccountHoldingsSnapshot from raw holdings and margin data.
 * @param {object} rawData
 * @param {object} [options]
 * @returns {object} Canonical AccountHoldingsSnapshot
 */
function generateSnapshot(rawData, options = {}) {
  const onlyTicker = options.only ? options.only.toUpperCase() : null;
  const rawHoldings = Array.isArray(rawData.holdings) ? rawData.holdings : [];
  const rawMargin = rawData.margin || {};
  const trades = Array.isArray(rawData.trades) ? rawData.trades : [];

  // Map earliest buy date per symbol
  const buyDateMap = {};
  for (const t of trades) {
    if (t.type === 'BUY' && t.symbol && t.date) {
      const sym = t.symbol.toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, '');
      if (!buyDateMap[sym] || new Date(t.date) < new Date(buyDateMap[sym])) {
        buyDateMap[sym] = t.date;
      }
    }
  }

  let totalInvested = 0;
  let totalCurrent = 0;

  for (const h of rawHoldings) {
    const qty = Number(h.quantity || 0);
    const avg = Number(h.average_price || h.averagePrice || 0);
    const cmp = Number(h.last_price || h.cmp || h.price || avg || 0);
    const invested = Number(h.invested || h.investedValue || qty * avg || 0);
    const current = Number(h.current_value || h.currentValue || qty * cmp || 0);

    totalInvested += invested;
    totalCurrent += current;
  }

  let holdings = rawHoldings.map((h) => {
    const ticker = (h.tradingsymbol || h.symbol || h.ticker || '')
      .toUpperCase()
      .replace(/-EQ$/i, '')
      .replace(/-BE$/i, '');
    const quantity = Number(h.quantity || 0);
    const average_price = Number(h.average_price || h.averagePrice || 0);
    const cmp = Number(h.last_price || h.cmp || h.price || average_price || 0);
    const invested_value = round2(h.invested || h.investedValue || quantity * average_price);
    const current_value = round2(h.current_value || h.currentValue || quantity * cmp);
    const unrealized_pnl = round2(h.pnl !== undefined && h.pnl !== null ? h.pnl : current_value - invested_value);
    const unrealized_pnl_pct = invested_value > 0 ? round2((unrealized_pnl / invested_value) * 100) : 0;
    const weight_pct = totalCurrent > 0 ? round2((current_value / totalCurrent) * 100) : 0;

    const meta = COMPANIES[ticker] || {};
    return {
      ticker,
      name: meta.name || h.name || ticker,
      isin: h.isin || 'INE000000000',
      exchange: h.exchange || 'NSE',
      quantity,
      average_price,
      cmp,
      invested_value,
      current_value,
      unrealized_pnl,
      unrealized_pnl_pct,
      weight_pct,
      fractional_shares: false,
      buy_date: h.buyDate || buyDateMap[ticker] || null,
      sector: meta.sector || h.sector || 'Other'
    };
  });

  if (onlyTicker) {
    holdings = holdings.filter((h) => h.ticker === onlyTicker);
  }

  holdings.sort((a, b) => b.current_value - a.current_value);

  const availableCash = round2(rawMargin.available_cash || rawMargin.availableCash || rawMargin.net_margin || 0);
  const collateral = round2(rawMargin.collateral || 0);
  const utilised = round2(rawMargin.utilised || 0);
  const netMargin = round2(rawMargin.net_margin || availableCash);

  const totalPnl = round2(totalCurrent - totalInvested);
  const totalReturnPct = totalInvested > 0 ? round2((totalPnl / totalInvested) * 100) : 0;

  const rawLedger = Array.isArray(rawData.ledger) ? rawData.ledger : [];

  let totalPayin = 0;
  let totalPayout = 0;
  for (const item of rawLedger) {
    const amt = Number(item.amount || 0);
    const cat = (item.category || '').toUpperCase();
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
      } else if (cat === 'WITHDRAWAL' || cat === 'PAYOUT' || cat === 'DIVIDEND') {
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
      } catch {
        accountXirr = null;
      }
    }
  }

  const snapshot = {
    account_id: 'angelone',
    broker: 'angelone',
    currency: 'INR',
    timestamp: new Date().toISOString(),
    summary: {
      total_invested: round2(totalInvested),
      total_current_value: round2(totalCurrent),
      unrealized_pnl: totalPnl,
      unrealized_pnl_pct: totalReturnPct,
      available_cash: availableCash,
      total_account_equity: round2(totalCurrent + availableCash),
      holdings_count: holdings.length,
      funds_invested: fundsInvested,
      account_xirr: accountXirr
    },
    margin: {
      available_cash: availableCash,
      collateral,
      utilised,
      net_margin: netMargin
    },
    holdings,
    ledger: rawLedger
  };

  return snapshot;
}

/**
 * Main execution entrypoint for fetch-angelone.
 */
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return { ok: true };
  }

  const outDir = path.resolve(args.out || DEFAULT_REPORTS_DIR);
  const accountsDir = path.join(outDir, 'accounts');
  fs.mkdirSync(accountsDir, { recursive: true });

  const rawData = await fetchRawData({
    refresh: args.refresh,
    cacheDir: args.cacheDir,
    mockData: args.mockData
  });

  const snapshot = generateSnapshot(rawData, { only: args.only });

  if (args.only && snapshot.holdings.length === 0) {
    const errMsg = `No holding found in Angel One account matching ticker "${args.only}".`;
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

  // Render HTML report
  const templatePath = path.join(SKILL_ROOT, 'assets', 'report-template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const jsonContent = JSON.stringify(snapshot, null, 2);

  const isCached = Boolean(rawData._is_cached);
  const cachedTimestamp = rawData._cached_at || snapshot.timestamp;
  const bannerHtml = isCached ? renderCacheWarningBanner(cachedTimestamp) : '';

  let htmlContent = templateHtml.replace('/*__DATA__*/null', () => jsonContent);
  if (isCached) {
    if (htmlContent.includes('<!--__CACHE_BANNER__-->')) {
      htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', bannerHtml);
    } else {
      htmlContent = htmlContent.replace('<div class="container">', `<div class="container">\n  ${bannerHtml}`);
    }
  } else {
    htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', '');
  }

  // Write outputs to accounts/angelone.json and accounts/angelone.html
  const jsonPath = path.join(accountsDir, 'angelone.json');
  const htmlPath = path.join(accountsDir, 'angelone.html');
  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  // Also write top-level in outDir for backwards compatibility
  fs.writeFileSync(path.join(outDir, 'angelone.json'), jsonContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'angelone.html'), htmlContent, 'utf8');

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
      artifacts: {
        json: jsonPath,
        html: htmlPath
      }
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    const s = snapshot.summary;
    process.stdout.write('\n📊 Angel One AccountHoldingsSnapshot Generated:\n');
    process.stdout.write(`   • Equity Value:         ₹${s.total_current_value.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Total Invested Cost:  ₹${s.total_invested.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Funds Invested:       ₹${s.funds_invested.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Account XIRR:         ${s.account_xirr !== null ? (s.account_xirr >= 0 ? '+' : '') + s.account_xirr.toFixed(2) + '%' : 'N/A'}\n`);
    process.stdout.write(`   • Unrealized P&L:       ${s.unrealized_pnl >= 0 ? '+' : ''}₹${s.unrealized_pnl.toLocaleString('en-IN')} (${s.unrealized_pnl_pct.toFixed(2)}%)\n`);
    process.stdout.write(`   • Available Cash:       ₹${s.available_cash.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Portfolio Value:      ₹${s.total_account_equity.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Holdings Count:       ${s.holdings_count}\n\n`);
    process.stdout.write(`✅ Artifacts written and verified:\n`);
    process.stdout.write(`   • JSON Contract: ${jsonPath}\n`);
    process.stdout.write(`   • HTML Report:   ${htmlPath}\n\n`);
  }

  return { ok: true, snapshot, jsonPath, htmlPath };
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
  parseArgs,
  loadCompanies
};
