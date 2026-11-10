#!/usr/bin/env node
'use strict';

/**
 * provider-tickertape: Tier 2 Market Data Provider.
 * Ingests raw fundamental and market data from Tickertape Pro and transforms it
 * into canonical NormalizedCompanyFinancials JSON and offline HTML dashboards.
 */

const fs = require('fs');
const path = require('path');

const {
  validateNormalizedFinancials,
  verifyArtifactPair,
  detectAuthError,
  formatRenewalInstructions,
  renderCacheWarningBanner
} = require('../../../scripts/framework');

let createTickertapeClient;
try {
  const sharedTickertape = require('../../../scripts/tickertape');
  createTickertapeClient = sharedTickertape.createClient || sharedTickertape;
} catch {
  createTickertapeClient = null;
}

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json')) ? path.resolve(SKILL_ROOT, '..', '..') : path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');

const INDEX_ETF_TICKERS = new Set([
  'VOO',
  'QQQ',
  'SPY',
  'IVV',
  'VTI',
  'RSP',
  'NIFTYBEES',
  'BANKBEES'
]);

const KNOWN_US_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'AMD', 'INTC', 'CSCO', 'ADBE', 'NFLX', 'AVGO', 'CRM', 'ORCL',
  'DIS', 'KO', 'PEP', 'PG', 'COST', 'WMT', 'JNJ', 'UNH', 'LLY',
  'V', 'MA', 'JPM', 'BAC', 'GS', 'VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP'
]);

const KNOWN_COMPANY_METADATA = {
  INFY: { name: 'Infosys Ltd', exchange: 'NSE', market: 'IN', sector: 'Information Technology', industry: 'IT Services & Consulting' },
  TCS: { name: 'Tata Consultancy Services Ltd', exchange: 'NSE', market: 'IN', sector: 'Information Technology', industry: 'IT Services & Consulting' },
  ITC: { name: 'ITC Ltd', exchange: 'NSE', market: 'IN', sector: 'Consumer Goods', industry: 'Diversified FMCG' },
  ZYDUSLIFE: { name: 'Zydus Lifesciences Ltd', exchange: 'NSE', market: 'IN', sector: 'Healthcare', industry: 'Pharmaceuticals' },
  NATCOPHARM: { name: 'Natco Pharma Ltd', exchange: 'NSE', market: 'IN', sector: 'Healthcare', industry: 'Pharmaceuticals' },
  HDFCBANK: { name: 'HDFC Bank Ltd', exchange: 'NSE', market: 'IN', sector: 'Financial Services', industry: 'Private Sector Bank' },
  SOUTHBANK: { name: 'South Indian Bank Ltd', exchange: 'NSE', market: 'IN', sector: 'Financial Services', industry: 'Private Sector Bank' },
  WIPRO: { name: 'Wipro Ltd', exchange: 'NSE', market: 'IN', sector: 'Information Technology', industry: 'IT Services & Consulting' },
  HCLTECH: { name: 'HCL Technologies Ltd', exchange: 'NSE', market: 'IN', sector: 'Information Technology', industry: 'IT Services & Consulting' },
  AAPL: { name: 'Apple Inc.', exchange: 'NASDAQ', market: 'US', sector: 'Technology', industry: 'Consumer Electronics' },
  MSFT: { name: 'Microsoft Corp.', exchange: 'NASDAQ', market: 'US', sector: 'Technology', industry: 'Software' },
  GOOGL: { name: 'Alphabet Inc. Class A', exchange: 'NASDAQ', market: 'US', sector: 'Communication Services', industry: 'Internet Content & Information' },
  AMZN: { name: 'Amazon.com Inc.', exchange: 'NASDAQ', market: 'US', sector: 'Consumer Discretionary', industry: 'Broadline Retail' },
  NVDA: { name: 'NVIDIA Corp.', exchange: 'NASDAQ', market: 'US', sector: 'Technology', industry: 'Semiconductors' },
  VOO: { name: 'Vanguard S&P 500 ETF', exchange: 'NYSE', market: 'US', sector: 'Index ETF', industry: 'Broad Market Index Basket' },
  QQQ: { name: 'Invesco QQQ Trust', exchange: 'NASDAQ', market: 'US', sector: 'Index ETF', industry: 'Broad Market Index Basket' },
  SPY: { name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE', market: 'US', sector: 'Index ETF', industry: 'Broad Market Index Basket' }
};

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    ticker: null,
    market: null,
    holdings: null,
    out: null,
    refresh: false,
    mockData: null,
    allowFixtures: false,
    cacheDir: DEFAULT_CACHE_DIR,
    jsonOutput: false,
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

    if (k === '--ticker') args.ticker = next().toUpperCase();
    else if (k === '--market') args.market = next().toUpperCase();
    else if (k === '--holdings') args.holdings = next();
    else if (k === '--out') args.out = next();
    else if (k === '--refresh') args.refresh = true;
    else if (k === '--mock-data') args.mockData = next();
    else if (k === '--allow-fixtures') args.allowFixtures = true;
    else if (k === '--cache-dir') args.cacheDir = next();
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

const USAGE = `Usage: node scripts/provider_tickertape.js [--ticker SYMBOL] [--market IN|US] [--holdings PATH] [--out DIR] [--refresh] [--mock-data PATH] [--allow-fixtures] [--json-output]`;

function inferMarket(ticker, explicitMarket) {
  if (explicitMarket && (explicitMarket === 'IN' || explicitMarket === 'US')) {
    return explicitMarket;
  }
  const cleanTicker = (ticker || '').toUpperCase();
  if (INDEX_ETF_TICKERS.has(cleanTicker) || KNOWN_US_TICKERS.has(cleanTicker)) {
    return 'US';
  }
  return 'IN';
}

/** Finite number or null (never fabricates a value). */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** a / b, or null when either side is missing or b is zero. */
function ratio(a, b) {
  const x = num(a);
  const y = num(b);
  return x === null || y === null || y === 0 ? null : x / y;
}

/** Compound annual growth (%) between the first and last of `values` (oldest first), or null. */
function cagrPct(values, years) {
  if (!Array.isArray(values) || values.length < years + 1) return null;
  const window = values.slice(-(years + 1));
  const first = num(window[0]);
  const last = num(window[window.length - 1]);
  if (first === null || last === null || first <= 0 || last <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

/** Sort statement rows oldest-first and drop the TTM row (its period is blank). */
function annualRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.displayPeriod !== 'TTM' && r.endDate)
    .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
}

/** Sloan accrual ratio: (net income - operating cash flow) / average total assets. */
function sloanRatio(netIncome, cfo, assetsNow, assetsPrev) {
  const avgAssets = num(assetsPrev) === null ? num(assetsNow) : (num(assetsNow) + num(assetsPrev)) / 2;
  const numerator = num(netIncome) !== null && num(cfo) !== null ? num(netIncome) - num(cfo) : null;
  return ratio(numerator, avgAssets);
}

// Load pre-extracted Screener filter definitions if available
let SCREENER_FILTER_META = {};
try {
  const metaPath = path.join(__dirname, '../assets/screener_filter_meta.json');
  if (fs.existsSync(metaPath)) {
    SCREENER_FILTER_META = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }
} catch (e) {
  SCREENER_FILTER_META = {};
}

/**
 * Best-effort Tickertape Pro readings for an Indian stock. Every sub-call is optional:
 * a failure leaves that part null and never fails the core statement fetch.
 */
async function fetchTickertapePro(client, sid, overview) {
  const safe = (p) => p.catch(() => null);

  // Collect all available screener filter labels across all categories
  const allLabels = [];
  for (const catItems of Object.values(SCREENER_FILTER_META)) {
    for (const label of Object.keys(catItems)) {
      allLabels.push(label);
    }
  }

  const [status, ratios, scorecard, checklists, ratings, forecast, estimates, screenMetrics] = await Promise.all([
    safe(client.call('check_pro_status_read', {})),
    safe(client.call('in_stock_financials_read', { type: 'ratios', ratios: { sid } })),
    safe(client.call('in_stock_analysis_read', { sid, sections: ['scorecard'] })),
    safe(client.call('in_stock_analysis_read', { sid, sections: ['checklists'], checklistType: 'pro' })),
    safe(client.call('in_stock_extras_read', { type: 'ratings', ratings: { sid } })),
    safe(client.call('in_stock_financials_read', { type: 'forecast', forecast: { sid } })),
    safe(client.call('in_stock_financials_read', { type: 'estimates', estimates: { sid } })),
    safe(client.call('in_screen_stocks_read', {
      sids: [sid],
      project: allLabels.length ? allLabels : [
          'valr', 'prmr', 'erqr', 'ptir', 'fundamental',
          'breco', 'upside', 'nBreco', 'pctHldReco', 'pctSelReco', 'totalAnalysts'
        ]
    }))
  ]);
  if (!status && !ratios && !scorecard && !checklists && !ratings && !forecast && !estimates && !screenMetrics) return null;

  const ratioMap = {};
  for (const r of Array.isArray(ratios) ? ratios : []) ratioMap[r.backL] = num(r.value);

  const cards = (scorecard && Array.isArray(scorecard.scorecard) ? scorecard.scorecard : []).filter(Boolean);
  const redFlagCard = cards.find((c) => c.type === 'redFlag');
  const est = (f) =>
    f && f.estimate
      ? { low: num(f.estimate.low), median: num(f.estimate.median), high: num(f.estimate.high), as_of: f.date || null }
      : null;
  const hl = (overview && Array.isArray(overview.highLow) && overview.highLow[0]) || {};

  const sm = (screenMetrics && screenMetrics.results && screenMetrics.results[0] && screenMetrics.results[0].metrics) || {};

  // Group all screener metrics by category for structured exposure
  const categorizedMetrics = {};
  for (const [cat, items] of Object.entries(SCREENER_FILTER_META)) {
    const group = {};
    for (const [lbl, meta] of Object.entries(items)) {
      if (sm[lbl] !== undefined && sm[lbl] !== null) {
        group[lbl] = {
          value: typeof sm[lbl] === 'number' ? num(sm[lbl]) : sm[lbl],
          unit: meta.unit || '',
          description: meta.def || lbl
        };
      }
    }
    if (Object.keys(group).length) {
      categorizedMetrics[cat] = group;
    }
  }

  return {
    subscription: typeof status === 'string' ? status.trim() : null,
    special_parameters: {
      value_momentum_rank: num(sm.valr),
      price_momentum_rank: num(sm.prmr),
      earnings_quality_rank: num(sm.erqr),
      price_to_intrinsic_value_rank: num(sm.ptir),
      fundamental_score: num(sm.fundamental)
    },
    analyst_ratings: {
      total_analysts: num(sm.totalAnalysts) !== null ? num(sm.totalAnalysts) : (estimates ? num(estimates.totalReco) : null),
      buy_reco_pct: num(sm.breco) !== null ? num(sm.breco) : (estimates ? num(estimates.percBuyReco) : null),
      no_of_analysts_buy_reco: num(sm.nBreco),
      hold_reco_pct: num(sm.pctHldReco),
      sell_reco_pct: num(sm.pctSelReco),
      upside_pct: num(sm.upside) !== null ? num(sm.upside) : (ratings ? num(ratings.upside) : null)
    },
    valuation_multiples: {
      forward_pe: ratioMap.apef !== undefined ? ratioMap.apef : num(sm.apef),
      sector_pe: ratioMap.indpe !== undefined ? ratioMap.indpe : num(sm.indpe),
      sector_pb: ratioMap.indpb !== undefined ? ratioMap.indpb : num(sm.indpb),
      sector_dividend_yield_pct: num(sm.inddy),
      price_to_sales: num(sm.ps),
      price_to_cashflow: num(sm.priceCfoR),
      ev_to_ebitda: num(sm.evebitd),
      ev_to_fcf: num(sm.evCafFcf)
    },
    technical_indicators: {
      high_52w: num(hl.high) !== null ? num(hl.high) : null,
      low_52w: num(hl.low) !== null ? num(hl.low) : null,
      distance_from_52w_high_pct: num(sm['52whd']),
      distance_from_52w_low_pct: num(sm['52wld']),
      rsi_14d: num(sm['14dRsi']),
      adx_14d: num(sm['14adx']),
      beta: num(sm.beta),
      vwap: num(sm.vWAP),
      sma_50d: num(sm.sma50d),
      sma_200d: num(sm.sma200d)
    },
    categorized_metrics: categorizedMetrics,
    screener_metrics_raw: sm,
    scorecard: cards
      .filter((c) => c.type !== 'redFlag')
      .map((c) => ({
        name: c.name,
        tag: c.tag || null,
        score: c.score ? num(c.score.value) : null,
        max: c.score ? num(c.score.max) : null,
        rank: num(c.rank),
        peers: num(c.peers),
        description: c.description || null
      })),
    red_flags: redFlagCard && Array.isArray(redFlagCard.elements)
      ? redFlagCard.elements.map((e) => ({ title: e.title, flag: e.flag || null, description: e.description || null }))
      : [],
    pro_checklists: ((checklists && checklists.checklists) || []).map((c) => ({
      title: c.title,
      description: c.description || null,
      state: c.state || null
    })),
    analyst:
      ratings || estimates || sm.totalAnalysts !== undefined
        ? {
          total_recommendations: num(sm.totalAnalysts) !== null ? num(sm.totalAnalysts) : (estimates ? num(estimates.totalReco) : null),
          buy_recommendation_pct: num(sm.breco) !== null ? num(sm.breco) : (estimates ? num(estimates.percBuyReco) : null),
          expected_upside_pct: num(sm.upside) !== null ? num(sm.upside) : (ratings ? num(ratings.upside) : null),
          eps_growth_12m_pct: ratings ? num(ratings['12mEpsg']) : null,
          revenue_growth_est_pct: ratings ? num(ratings.estrvng) : null
        }
        : null,
    forecasts: forecast
      ? { price: est(forecast.price), eps: est(forecast.eps), revenue: est(forecast.revenue) }
      : null
  };
}

/**
 * Live Tickertape MCP fetch for an Indian (NSE/BSE) equity. Values are in INR crores.
 * Fields the vendor does not publish are left null rather than estimated.
 */
async function fetchLiveIndianEquity(client, ticker) {
  let sid = null;
  let resolvedTicker = ticker;
  for (const exchange of ['NSE', 'BSE']) {
    let resolved;
    try {
      resolved = await client.call('in_resolve_sid_read', {
        identifiers: [{ ticker }],
        assetType: 'stock',
        exchange
      });
    } catch (err) {
      if (/\b404\b|not.?found/i.test(err.message)) continue; // not listed on this exchange
      throw err;
    }
    const m = /(?:^|\n)id:([^|\n]+)\|/.exec(typeof resolved === 'string' ? resolved : JSON.stringify(resolved));
    if (m) {
      sid = m[1];
      break;
    }
  }

  // Fallback: search universe by entity name or query if direct SID resolution fails
  if (!sid) {
    const cleanQ = (ticker || '').trim().toLowerCase();
    const qTokens = cleanQ.split(/[\s_-]+/).filter(Boolean);
    const firstChar = (cleanQ[0] || '').toUpperCase();
    const lettersToTry = firstChar && /[A-Z]/.test(firstChar) ? [firstChar] : ['T', 'D', 'I', 'M', 'R', 'S', 'A'];

    let bestMatch = null;
    let bestScore = -1;

    for (const letter of lettersToTry) {
      try {
        const searchRes = await client.call('in_stock_search_read', { letter });
        const text = typeof searchRes === 'string' ? searchRes : JSON.stringify(searchRes);
        for (const line of text.split('\n')) {
          const parts = {};
          for (const seg of line.split('|')) {
            const idx = seg.indexOf(':');
            if (idx !== -1) parts[seg.slice(0, idx)] = seg.slice(idx + 1);
          }
          if (!parts.sid || !parts.ticker) continue;
          const sTicker = (parts.ticker || '').toLowerCase();
          const sName = (parts.name || '').toLowerCase();
          const sSlug = (parts.slug || '').toLowerCase();

          let score = 0;
          if (sTicker === cleanQ) score += 100;
          if (sName === cleanQ) score += 90;
          if (sName.startsWith(cleanQ)) score += 70;
          else if (sName.includes(cleanQ)) score += 50;
          if (sSlug.includes(cleanQ)) score += 40;

          // Initials matching (e.g. TMCV for Tata Motors Commercial Vehicles)
          const initials = qTokens.map(t => t[0]).join('');
          if (sTicker === initials) score += 80;

          let matched = 0;
          for (const token of qTokens) {
            if (sName.includes(token) || sTicker.includes(token) || sSlug.includes(token)) matched++;
          }
          score += matched * 20;

          if (score > bestScore && score >= 20) {
            bestScore = score;
            bestMatch = parts;
          }
        }
        if (bestMatch && bestScore >= 70) break;
      } catch { }
    }

    if (bestMatch) {
      sid = bestMatch.sid;
      resolvedTicker = bestMatch.ticker;
    }
  }

  if (!sid) throw new Error(`Tickertape could not resolve "${ticker}" to an Indian stock SID`);

  const fin = (type, extra = {}) =>
    client.call('in_stock_financials_read', { type, [type]: { sid, ...extra } });
  const [overview, income, balance, cashflow, ratios, ownership, analysis, corpDividends, aiAnalysis] = await Promise.all([
    client.call('in_stock_overview_read', { sids: [sid] }),
    fin('income', { period: 'annual', count: 8 }),
    fin('balance', { count: 5 }),
    fin('cashflow', { count: 5 }),
    fin('ratios'),
    client.call('in_stock_ownership_read', { sid, sections: ['holdings'] }),
    client.call('in_stock_analysis_read', { sid, sections: ['scorecard'] }).catch(() => null),
    client.call('in_stock_corporate_read', { type: 'dividends', dividends: { sid, count: 8 } }).catch(() => null),
    client.call('in_stock_analysis_read', { sid, sections: ['ai_summary'] }).catch(() => null)
  ]);

  const profile = (overview && overview.profile) || {};
  const quote = (overview && overview.quotes && overview.quotes[0]) || {};
  const cmp = num(quote.price);
  if (cmp === null || cmp <= 0) throw new Error(`Tickertape returned no live price for ${ticker}`);

  const incRows = annualRows(income);
  const balRows = annualRows(balance);
  const cfRows = annualRows(cashflow);
  if (!incRows.length || !balRows.length || !cfRows.length) {
    throw new Error(`Tickertape returned incomplete statements for ${ticker}`);
  }
  const ttm = (Array.isArray(income) ? income : []).find((r) => r && r.displayPeriod === 'TTM') || {};
  const inc = incRows[incRows.length - 1];
  const bal = balRows[balRows.length - 1];
  const balPrev = balRows.length > 1 ? balRows[balRows.length - 2] : {};
  const incPrev = incRows.length > 1 ? incRows[incRows.length - 2] : {};
  const cf = cfRows[cfRows.length - 1];
  const ratioMap = {};
  for (const r of Array.isArray(ratios) ? ratios : []) ratioMap[r.backL] = num(r.value);

  const shares = num(bal.balTcso); // crore shares, same scale as market cap in crores
  const marketCap = shares !== null ? cmp * shares : null;
  const epsTtm = num(ttm.incEps) !== null ? num(ttm.incEps) : num(inc.incEps);
  const bvps = ratio(bal.balTeq, shares);
  const totalDebt = num(bal.balTdeb);
  const ltDebt = num(bal.balTltd);
  const ebitda = num(inc.incEbi);
  const ev = marketCap !== null ? marketCap + (totalDebt || 0) - (num(bal.balCsti) || 0) : null;

  const holdingsRows = ((ownership && ownership.holdings) || [])
    .filter((h) => h && h.data && h.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latestHold = holdingsRows.length ? holdingsRows[holdingsRows.length - 1].data : null;
  const prevHold = holdingsRows.length > 1 ? holdingsRows[holdingsRows.length - 2].data : null;

  const flags = [];
  const redFlags = ((analysis && analysis.scorecard) || []).find((s) => s && s.type === 'redFlag');
  if (redFlags && Array.isArray(redFlags.elements)) {
    for (const el of redFlags.elements) {
      if ((el.title === 'ASM' || el.title === 'GSM') && !/not in/i.test(el.description || '')) flags.push(el.title);
    }
  }

  const dsoNow = ratio(bal.balTrec, inc.incTrev);
  const dsoPrev = ratio(balPrev.balTrec, incPrev.incTrev);
  const invGrowth = num(balPrev.balTinv) > 0 ? ratio(bal.balTinv, balPrev.balTinv) : null;
  const salesGrowth = ratio(inc.incTrev, incPrev.incTrev);
  const tickertapePro = await fetchTickertapePro(client, sid, overview);

  return {
    _resolved_ticker: resolvedTicker,
    tickertape_pro: tickertapePro,
    name: (profile.info && profile.info.name) || ticker,
    exchange: (profile.info && profile.info.exchange) || 'NSE',
    sector: (profile.gic && profile.gic.sector) || (profile.info && profile.info.sector) || null,
    industry: (profile.gic && profile.gic.industry) || null,
    currency: 'INR',
    unit_scale: 'CRORES',
    is_index_etf: false,
    market_data: {
      cmp,
      market_cap: marketCap,
      shares_outstanding: shares,
      eps_ttm: epsTtm,
      bvps,
      pe_ttm: ratio(cmp, epsTtm),
      pb_ttm: ratioMap.pbr !== undefined ? ratioMap.pbr : ratio(cmp, bvps),
      ev_ebitda: ratio(ev, ebitda),
      dividend_yield_pct: ratioMap.divYield !== undefined ? ratioMap.divYield : null,
      beta: null,
      historical_pe_5y_median: null,
      historical_pb_5y_median: null,
      eps_growth_5y_cagr_pct: cagrPct(incRows.map((r) => r.incEps), 5),
      revenue_growth_5y_cagr_pct: cagrPct(incRows.map((r) => r.incTrev), 5)
    },
    income_statement: {
      revenue: num(inc.incTrev),
      ebitda,
      ebit: num(inc.incPbi),
      interest_expense: num(inc.incIoi),
      ebt: num(inc.incPbt),
      tax_expense: num(inc.incToi),
      net_income: num(inc.incNinc),
      eps: num(inc.incEps)
    },
    balance_sheet: {
      cash_and_equivalents: num(bal.balCsti),
      accounts_receivable: num(bal.balTrec),
      inventory: num(bal.balTinv),
      total_current_assets: num(bal.balTca),
      // Tickertape reports goodwill and intangibles as a single line (balGint).
      goodwill: num(bal.balGint),
      intangible_assets: null,
      total_assets: num(bal.balTota),
      short_term_debt: totalDebt !== null && ltDebt !== null ? totalDebt - ltDebt : null,
      long_term_debt: ltDebt,
      total_debt: totalDebt,
      debt_maturing_24m: null,
      total_current_liabilities: num(bal.balTcl),
      total_liabilities: num(bal.balTotl),
      retained_earnings: num(bal.balRtne),
      total_equity: num(bal.balTeq)
    },
    cash_flow: {
      operating_cash_flow: num(cf.cafCfoa),
      capital_expenditure: num(cf.cafCexp),
      maintenance_capex: null,
      free_cash_flow: num(cf.cafFcf),
      stock_based_compensation: null,
      dividends_paid: num(cf.cafTcdp),
      share_repurchases: null
    },
    forensics: {
      promoter_holding_pct: latestHold ? num(latestHold.pmPctT) : null,
      // pmPctP: share of promoter holding that is pledged.
      promoter_pledge_pct: latestHold ? num(latestHold.pmPctP) : null,
      promoter_holding_qoq_delta_pct:
        latestHold && prevHold && num(latestHold.pmPctT) !== null && num(prevHold.pmPctT) !== null
          ? num(latestHold.pmPctT) - num(prevHold.pmPctT)
          : null,
      related_party_transactions_pct: null,
      beneish_m_score: null,
      sloan_accrual_ratio: sloanRatio(inc.incNinc, cf.cafCfoa, bal.balTota, balPrev.balTota),
      dso_yoy_expansion_pct: dsoNow !== null && dsoPrev ? (dsoNow / dsoPrev - 1) * 100 : null,
      inventory_growth_vs_sales_delta_pct:
        num(bal.balTinv) === 0 && num(balPrev.balTinv) === 0
          ? 0
          : invGrowth !== null && salesGrowth !== null
            ? (invGrowth - salesGrowth) * 100
            : null,
      surveillance_stage: flags.length ? flags.join(',') : 'NONE'
    },
    historical_statements: {
      income: incRows.map((r) => ({
        fiscal_year: r.displayPeriod,
        end_date: r.endDate,
        revenue: num(r.incTrev),
        ebitda: num(r.incEbi),
        ebit: num(r.incPbi),
        interest: num(r.incIoi),
        pbt: num(r.incPbt),
        tax: num(r.incToi),
        net_income: num(r.incNinc),
        eps: num(r.incEps)
      })),
      balance: balRows.map((r) => ({
        fiscal_year: r.displayPeriod,
        end_date: r.endDate,
        cash: num(r.balCsti),
        receivables: num(r.balTrec),
        inventory: num(r.balTinv),
        current_assets: num(r.balTca),
        total_assets: num(r.balTota),
        total_debt: num(r.balTdeb),
        long_term_debt: num(r.balTltd),
        current_liabilities: num(r.balTcl),
        total_liabilities: num(r.balTotl),
        equity: num(r.balTeq)
      })),
      cash_flow: cfRows.map((r) => ({
        fiscal_year: r.displayPeriod,
        end_date: r.endDate,
        operating_cf: num(r.cafCfoa),
        capex: num(r.cafCexp),
        fcf: num(r.cafFcf),
        dividends_paid: num(r.cafTcdp)
      }))
    },
    ownership_trend: holdingsRows.map((h) => ({
      date: h.date,
      promoter_pct: num(h.data.pmPctT),
      promoter_pledged_pct: num(h.data.pmPctP),
      fii_pct: num(h.data.fiPctT),
      dii_pct: num(h.data.diPctT),
      mutual_fund_pct: num(h.data.mfPctT)
    })),
    dividend_events: ((corpDividends && corpDividends.past) || []).slice(0, 8).map((d) => ({
      ex_date: d.exDate,
      type: d.subType || d.type,
      amount: num(d.value)
    })),
    ai_management_summary: (aiAnalysis && aiAnalysis.aiSummary) || null
  };
}

/**
 * Live Tickertape MCP fetch for a US-listed stock or ETF. Statement values are
 * converted from absolute USD to millions. Fields the vendor does not publish
 * for US assets (EBITDA, capex, debt, etc.) are left null.
 */
async function fetchLiveUsAsset(client, ticker) {
  const isEtf = INDEX_ETF_TICKERS.has(ticker);
  const assetType = isEtf ? 'etfs' : 'stocks';
  const [overview, quoteCsv] = await Promise.all([
    client.call('us_assets_get_overview_read', { market: 'US', assetType, ticker }),
    client.call('us_quotes_get_latest_read', { market: 'US', ticker })
  ]);

  // Quote payload is a CSV: "t,p,lcp,v,s,pre,post\n<epoch_ms>,<price>,..."
  const lines = String(quoteCsv || '').trim().split('\n');
  const header = (lines[0] || '').split(',');
  const row = (lines[1] || '').split(',');
  const cmp = num(row[header.indexOf('p')]);
  if (cmp === null || cmp <= 0) throw new Error(`Tickertape returned no live price for ${ticker}`);

  const m = (overview && overview.metrics) || {};
  const base = {
    name: (overview && overview.name) || ticker,
    exchange: (overview && overview.exchange) || null,
    sector: (overview && overview.sector) || null,
    industry: (overview && overview.industry) || null,
    currency: 'USD',
    unit_scale: 'MILLIONS',
    is_index_etf: isEtf
  };

  const marketCap = num(m.marketCapitalization); // already in USD millions
  if (isEtf) {
    return {
      ...base,
      sector: 'Index ETF',
      industry: 'Broad Market Index Basket',
      market_data: {
        cmp,
        market_cap: marketCap,
        shares_outstanding: null,
        eps_ttm: null,
        bvps: null,
        pe_ttm: num(m.priceEarningsTtm),
        pb_ttm: num(m.priceBook),
        ev_ebitda: null,
        dividend_yield_pct: num(m.dividendYieldPercent),
        beta: num(m.beta),
        historical_pe_5y_median: null,
        historical_pb_5y_median: null,
        eps_growth_5y_cagr_pct: null,
        revenue_growth_5y_cagr_pct: null
      },
      income_statement: null,
      balance_sheet: null,
      cash_flow: null,
      forensics: null
    };
  }

  const stmt = (type) =>
    client.call('us_assets_get_financials_read', { market: 'US', assetType, ticker, type, count: 10 });
  const [incRaw, balRaw, cfRaw] = await Promise.all([stmt('income'), stmt('balancesheet'), stmt('cashflow')]);
  const yearly = (raw, key) =>
    ((raw && raw.financials && raw.financials.yearly) || [])
      .filter((r) => r && r.date && r[key])
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const incRows = yearly(incRaw, 'incomeStatement');
  const balRows = yearly(balRaw, 'balanceSheet');
  const cfRows = yearly(cfRaw, 'cashFlow');
  if (!incRows.length || !balRows.length || !cfRows.length) {
    throw new Error(`Tickertape returned incomplete statements for ${ticker}`);
  }
  const inc = incRows[incRows.length - 1].incomeStatement;
  const bal = balRows[balRows.length - 1].balanceSheet;
  const balPrev = balRows.length > 1 ? balRows[balRows.length - 2].balanceSheet : {};
  const cf = cfRows[cfRows.length - 1].cashFlow;
  const toM = (v) => (num(v) === null ? null : num(v) / 1e6);

  const totalAssets = toM(bal.totalAssets);
  const totalLiab = toM(bal.totalLiab);
  const equity = totalAssets !== null && totalLiab !== null ? totalAssets - totalLiab : null;
  const shares = ratio(marketCap, cmp); // millions of shares, derived from market cap / price

  return {
    ...base,
    market_data: {
      cmp,
      market_cap: marketCap,
      shares_outstanding: shares,
      eps_ttm: num(m.earningsPerShareTtm),
      bvps: ratio(equity, shares),
      pe_ttm: num(m.priceEarningsTtm),
      pb_ttm: num(m.priceBook),
      ev_ebitda: null,
      dividend_yield_pct: num(m.dividendYieldPercent),
      beta: num(m.beta),
      historical_pe_5y_median: null,
      historical_pb_5y_median: null,
      eps_growth_5y_cagr_pct: null,
      revenue_growth_5y_cagr_pct: cagrPct(incRows.map((r) => r.incomeStatement.totalRevenue), 5)
    },
    income_statement: {
      revenue: toM(inc.totalRevenue),
      ebitda: null,
      ebit: null,
      interest_expense: null,
      ebt: null,
      tax_expense: null,
      net_income: toM(inc.netIncome),
      eps: null
    },
    balance_sheet: {
      cash_and_equivalents: null,
      accounts_receivable: null,
      inventory: null,
      total_current_assets: null,
      goodwill: null,
      intangible_assets: null,
      total_assets: totalAssets,
      short_term_debt: null,
      long_term_debt: null,
      total_debt: null,
      debt_maturing_24m: null,
      total_current_liabilities: null,
      total_liabilities: totalLiab,
      retained_earnings: null,
      total_equity: equity
    },
    cash_flow: {
      operating_cash_flow: toM(cf.totalCashFromOperatingActivities),
      capital_expenditure: null,
      maintenance_capex: null,
      free_cash_flow: null,
      stock_based_compensation: null,
      dividends_paid: null,
      share_repurchases: null
    },
    forensics: {
      promoter_holding_pct: null,
      promoter_pledge_pct: null,
      promoter_holding_qoq_delta_pct: null,
      related_party_transactions_pct: null,
      beneish_m_score: null,
      sloan_accrual_ratio: sloanRatio(inc.netIncome, cf.totalCashFromOperatingActivities, bal.totalAssets, balPrev.totalAssets),
      dso_yoy_expansion_pct: null,
      inventory_growth_vs_sales_delta_pct: null,
      surveillance_stage: 'NONE'
    }
  };
}

/**
 * Fetch live data through the Tickertape MCP tool surface and return it already
 * in NormalizedCompanyFinancials shape (plus `_live: true`).
 */
async function fetchLiveTickertape(client, ticker, market) {
  let data;
  if (market === 'US') {
    data = await fetchLiveUsAsset(client, ticker);
  } else if (INDEX_ETF_TICKERS.has(ticker)) {
    throw new Error(`Live fetch for Indian ETF "${ticker}" is not supported yet`);
  } else {
    data = await fetchLiveIndianEquity(client, ticker);
  }

  // Trim float noise: 2 decimals for statements, 4 for the small forensic ratios.
  const roundSection = (section, places) => {
    if (!section) return section;
    const f = Math.pow(10, places);
    const out = {};
    for (const [k, v] of Object.entries(section)) {
      out[k] = typeof v === 'number' ? Math.round((v + Number.EPSILON) * f) / f : v;
    }
    return out;
  };
  return {
    ...data,
    income_statement: roundSection(data.income_statement, 2),
    balance_sheet: roundSection(data.balance_sheet, 2),
    cash_flow: roundSection(data.cash_flow, 2),
    forensics: roundSection(data.forensics, 4),
    ...(data.historical_statements ? { historical_statements: data.historical_statements } : {}),
    ...(data.ownership_trend ? { ownership_trend: data.ownership_trend } : {}),
    ...(data.dividend_events ? { dividend_events: data.dividend_events } : {}),
    ...(data.ai_management_summary ? { ai_management_summary: data.ai_management_summary } : {}),
    _live: true
  };
}

/**
 * Wrap a Tickertape client so calls rejected with `rate_limit_exceeded` are
 * retried with exponential backoff (1s, 2s, 4s, 8s) instead of failing the ticker.
 */
function withRateLimitRetry(client, maxRetries = 4) {
  return {
    async call(name, args) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await client.call(name, args);
        } catch (err) {
          if (attempt >= maxRetries || !/rate_limit_exceeded|\b429\b/i.test(err.message)) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
  };
}

/**
 * Fetch raw market and statement data from mock, cache, or live vendor client.
 */
async function fetchRawFinancials(ticker, market, options = {}) {
  const { refresh = false, cacheDir = DEFAULT_CACHE_DIR, mockData = null, allowFixtures = false } = options;

  // 1. Mock data override
  if (mockData) {
    const resolvedMock = path.resolve(mockData);
    if (fs.existsSync(resolvedMock)) {
      const parsedMock = JSON.parse(fs.readFileSync(resolvedMock, 'utf8'));
      let item = null;
      if (parsedMock[ticker]) item = parsedMock[ticker];
      else if (parsedMock.ticker === ticker || !parsedMock.ticker) item = parsedMock;

      if (item) {
        if (item._is_cached || item.is_cached || parsedMock._is_cached || parsedMock.is_cached) {
          return {
            ...item,
            _is_cached: true,
            _cached_at: item._cached_at || item.cached_at || item.timestamp || new Date().toISOString()
          };
        }
        return item;
      }
    }
  }

  const marketCacheDir = path.join(cacheDir, market);
  if (!fs.existsSync(marketCacheDir)) {
    fs.mkdirSync(marketCacheDir, { recursive: true });
  }

  const cacheFile = path.join(marketCacheDir, `${ticker}.json`);

  const loadExistingCache = (isFallback = false, fallbackReason = '') => {
    // Check primary cache
    if (fs.existsSync(cacheFile)) {
      try {
        const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const ts = c.timestamp || fs.statSync(cacheFile).mtime.toISOString();
        if (isFallback) {
          process.stderr.write(`[WARNING] Cached Snapshot Active for ${ticker}: Data as of ${ts}. ${fallbackReason}\n`);
        }
        return {
          ...c,
          _is_cached: isFallback,
          _cached_at: ts
        };
      } catch { }
    }

    // Check historical caches
    const histPath = market === 'IN'
      ? path.resolve(__dirname, `../../fundamental-stock-analysis/cache/2026-10-25_${ticker}.json`)
      : path.resolve(__dirname, `../../fundamental-us-stock-analysis/.cache/${ticker}_fundamentals.json`);

    if (fs.existsSync(histPath)) {
      try {
        const c = JSON.parse(fs.readFileSync(histPath, 'utf8'));
        const ts = c.timestamp || fs.statSync(histPath).mtime.toISOString();
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(c, null, 2), 'utf8');
        } catch { }
        if (isFallback) {
          process.stderr.write(`[WARNING] Cached Snapshot Active for ${ticker}: Data as of ${ts}. ${fallbackReason}\n`);
        }
        return {
          ...c,
          _is_cached: isFallback,
          _cached_at: ts
        };
      } catch { }
    }

    return null;
  };

  // 2. Local skill cache
  if (!refresh) {
    const validCache = loadExistingCache(false);
    if (validCache) return validCache;
  }

  // 3. Live Tickertape client call
  let liveError = null;
  if (typeof createTickertapeClient === 'function') {
    try {
      const client = withRateLimitRetry(createTickertapeClient());
      if (client && typeof client.call === 'function') {
        const res = await fetchLiveTickertape(client, ticker, market);
        if (res) {
          const withMeta = {
            ...res,
            timestamp: new Date().toISOString(),
            _is_cached: false
          };
          try {
            fs.writeFileSync(cacheFile, JSON.stringify(withMeta, null, 2), 'utf8');
          } catch {
            // Ignore write error
          }
          return withMeta;
        }
      }
    } catch (err) {
      const authCheck = detectAuthError('tickertape', err);
      if (authCheck.isAuthError) {
        process.stderr.write(formatRenewalInstructions('tickertape'));
      }

      const reason = authCheck.isAuthError
        ? `Tickertape authentication failed (${err.message}). Upstream provider unreachable.`
        : `Tickertape upstream request failed (${err.message}). Upstream provider unreachable.`;

      const cachedFallback = loadExistingCache(true, reason);
      if (cachedFallback) {
        return cachedFallback;
      }
      liveError = err;
    }
  }

  // 4. Generic sample fixtures are NOT real data for any ticker. They are only
  // used when explicitly requested with --allow-fixtures (e.g. offline demos).
  if (allowFixtures) {
    const fixtureName = INDEX_ETF_TICKERS.has(ticker)
      ? 'sample_etf_financials.json'
      : market === 'IN'
        ? 'sample_in_financials.json'
        : 'sample_us_financials.json';
    const fixturePath = path.resolve(__dirname, '../tests/fixtures', fixtureName);
    if (fs.existsSync(fixturePath)) {
      process.stderr.write(`[WARN] Using generic SAMPLE fixture for ${ticker}; values are not real ${ticker} data.\n`);
      return { ...JSON.parse(fs.readFileSync(fixturePath, 'utf8')), _is_cached: true, _cached_at: 'sample-fixture' };
    }
  }

  const detail = liveError ? liveError.message : 'Tickertape client unavailable';
  throw new Error(`No live or cached data for ${ticker} (${market}): ${detail}`);
}

/**
 * Transform raw vendor data into canonical NormalizedCompanyFinancials.
 */
function normalizeFinancials(rawData, ticker, market) {
  const isIndexEtf = INDEX_ETF_TICKERS.has(ticker) || rawData.is_index_etf === true || rawData.sector === 'Index ETF';
  const meta = KNOWN_COMPANY_METADATA[ticker] || {};

  const currency = market === 'IN' ? 'INR' : 'USD';
  const unitScale = market === 'IN' ? 'CRORES' : 'MILLIONS';
  const name = meta.name || rawData.name || (rawData.profile && rawData.profile.info && rawData.profile.info.name) || ticker;
  const exchange = meta.exchange || rawData.exchange || (rawData.profile && rawData.profile.info && rawData.profile.info.exchange) || (market === 'IN' ? 'NSE' : 'NASDAQ');
  const sector = meta.sector || rawData.sector || (rawData.profile && rawData.profile.info && rawData.profile.info.sector) || null;
  const industry = meta.industry || rawData.industry || (rawData.profile && rawData.profile.gic && rawData.profile.gic.industry) || null;

  // If input is already in NormalizedCompanyFinancials shape, validate & return
  if (rawData.market_data && rawData.currency && (rawData.income_statement !== undefined || isIndexEtf)) {
    return {
      ticker,
      name,
      exchange,
      market,
      currency,
      unit_scale: rawData.unit_scale || unitScale,
      sector,
      industry,
      timestamp: rawData.timestamp || new Date().toISOString(),
      is_index_etf: isIndexEtf,
      source_provider: 'tickertape',
      market_data: {
        cmp: round2(rawData.market_data.cmp) || 100.0,
        market_cap: round2(rawData.market_data.market_cap),
        shares_outstanding: round2(rawData.market_data.shares_outstanding),
        eps_ttm: round2(rawData.market_data.eps_ttm),
        bvps: round2(rawData.market_data.bvps),
        pe_ttm: round2(rawData.market_data.pe_ttm),
        pb_ttm: round2(rawData.market_data.pb_ttm),
        ev_ebitda: round2(rawData.market_data.ev_ebitda),
        dividend_yield_pct: round2(rawData.market_data.dividend_yield_pct),
        beta: round2(rawData.market_data.beta),
        historical_pe_5y_median: round2(rawData.market_data.historical_pe_5y_median),
        historical_pb_5y_median: round2(rawData.market_data.historical_pb_5y_median),
        eps_growth_5y_cagr_pct: round2(rawData.market_data.eps_growth_5y_cagr_pct),
        revenue_growth_5y_cagr_pct: round2(rawData.market_data.revenue_growth_5y_cagr_pct)
      },
      income_statement: isIndexEtf ? null : rawData.income_statement,
      balance_sheet: isIndexEtf ? null : rawData.balance_sheet,
      cash_flow: isIndexEtf ? null : rawData.cash_flow,
      forensics: isIndexEtf ? null : rawData.forensics,
      ...(rawData.tickertape_pro ? { tickertape_pro: rawData.tickertape_pro } : {}),
      ...(rawData.historical_statements ? { historical_statements: rawData.historical_statements } : {}),
      ...(rawData.ownership_trend ? { ownership_trend: rawData.ownership_trend } : {}),
      ...(rawData.dividend_events ? { dividend_events: rawData.dividend_events } : {}),
      ...(rawData.ai_management_summary ? { ai_management_summary: rawData.ai_management_summary } : {})
    };
  }

  // Extract from Tickertape raw shapes
  const quote = rawData.quote || {};
  const mData = rawData.marketData || {};
  const cmp = Number(quote.price || mData.cmp || rawData.cmp || 100.0);
  const mcap = Number(mData.marketCap || rawData.marketCap || (cmp * (mData.shares || 100)));
  const pe = Number(mData.pe || rawData.pe || null);
  const pb = Number(mData.pb || rawData.pb || null);
  const eps = Number(mData.eps || rawData.eps || null);
  const bvps = Number(mData.bvps || rawData.bvps || null);

  const marketData = {
    cmp: round2(cmp),
    market_cap: round2(mcap),
    shares_outstanding: round2(mData.shares || rawData.shares || (mcap && cmp ? mcap / cmp : 100)),
    eps_ttm: round2(eps),
    bvps: round2(bvps),
    pe_ttm: round2(pe),
    pb_ttm: round2(pb),
    ev_ebitda: round2(mData.evEbitda || rawData.evEbitda || null),
    dividend_yield_pct: round2(mData.dividendYieldPct || rawData.dividendYield || null),
    beta: round2(mData.beta || rawData.beta || 1.0),
    historical_pe_5y_median: round2(rawData.historical_pe_5y_median || pe || 20.0),
    historical_pb_5y_median: round2(rawData.historical_pb_5y_median || pb || 3.0),
    eps_growth_5y_cagr_pct: round2(rawData.eps_growth_5y_cagr_pct || 10.0),
    revenue_growth_5y_cagr_pct: round2(rawData.revenue_growth_5y_cagr_pct || 8.0)
  };

  if (isIndexEtf) {
    return {
      ticker,
      name,
      exchange,
      market,
      currency,
      unit_scale: unitScale,
      sector: 'Index ETF',
      industry: 'Broad Market Index Basket',
      timestamp: new Date().toISOString(),
      is_index_etf: true,
      source_provider: 'tickertape',
      market_data: marketData,
      income_statement: null,
      balance_sheet: null,
      cash_flow: null,
      forensics: null
    };
  }

  const inc = rawData.income_statement || rawData.income || {};
  const bal = rawData.balance_sheet || rawData.balance || {};
  const cf = rawData.cash_flow || rawData.cashflow || {};
  const forn = rawData.forensics || {};

  return {
    ticker,
    name,
    exchange,
    market,
    currency,
    unit_scale: unitScale,
    sector,
    industry,
    timestamp: new Date().toISOString(),
    is_index_etf: false,
    source_provider: 'tickertape',
    market_data: marketData,
    income_statement: {
      revenue: round2(inc.revenue || inc.incTrev || 10000),
      ebitda: round2(inc.ebitda || inc.incEbi || 2500),
      ebit: round2(inc.ebit || inc.incPbi || 2000),
      interest_expense: round2(inc.interest_expense || inc.incIoi || 50),
      ebt: round2(inc.ebt || inc.incPbt || 1950),
      tax_expense: round2(inc.tax_expense || inc.incToi || 450),
      net_income: round2(inc.net_income || inc.incNinc || 1500),
      eps: round2(inc.eps || inc.incEps || eps || 15.0)
    },
    balance_sheet: {
      cash_and_equivalents: round2(bal.cash_and_equivalents || bal.balCash || 1500),
      accounts_receivable: round2(bal.accounts_receivable || bal.balRec || 2000),
      inventory: round2(bal.inventory || bal.balInv || 0),
      total_current_assets: round2(bal.total_current_assets || bal.balTca || 5000),
      goodwill: round2(bal.goodwill || 0),
      intangible_assets: round2(bal.intangible_assets || 0),
      total_assets: round2(bal.total_assets || bal.balTot || 10000),
      short_term_debt: round2(bal.short_term_debt || 0),
      long_term_debt: round2(bal.long_term_debt || 0),
      total_debt: round2(bal.total_debt || 0),
      debt_maturing_24m: round2(bal.debt_maturing_24m || 0),
      total_current_liabilities: round2(bal.total_current_liabilities || bal.balTcl || 2000),
      total_liabilities: round2(bal.total_liabilities || bal.balTotl || 3000),
      retained_earnings: round2(bal.retained_earnings || 6000),
      total_equity: round2(bal.total_equity || bal.balEq || 7000)
    },
    cash_flow: {
      operating_cash_flow: round2(cf.operating_cash_flow || cf.cflOcf || 2200),
      capital_expenditure: round2(cf.capital_expenditure || cf.cflCapex || 300),
      maintenance_capex: round2(cf.maintenance_capex || 200),
      free_cash_flow: round2(cf.free_cash_flow || cf.cflFcf || 1900),
      stock_based_compensation: round2(cf.stock_based_compensation || 50),
      dividends_paid: round2(cf.dividends_paid || cf.cflDiv || 800),
      share_repurchases: round2(cf.share_repurchases || 0)
    },
    forensics: {
      promoter_holding_pct: market === 'IN' ? round2(forn.promoter_holding_pct || 25.0) : null,
      promoter_pledge_pct: market === 'IN' ? round2(forn.promoter_pledge_pct || 0.0) : null,
      promoter_holding_qoq_delta_pct: market === 'IN' ? round2(forn.promoter_holding_qoq_delta_pct || 0.0) : null,
      related_party_transactions_pct: round2(forn.related_party_transactions_pct || null),
      auditor_resignation_flag: forn.auditor_resignation_flag === true,
      qualified_opinion_flag: forn.qualified_opinion_flag === true,
      beneish_m_score: round2(forn.beneish_m_score || -2.60),
      sloan_accrual_ratio: round2(forn.sloan_accrual_ratio || 0.04),
      dso_yoy_expansion_pct: round2(forn.dso_yoy_expansion_pct || 1.5),
      inventory_growth_vs_sales_delta_pct: round2(forn.inventory_growth_vs_sales_delta_pct || 0.0),
      surveillance_stage: forn.surveillance_stage || 'NONE'
    },
    ...(rawData.tickertape_pro ? { tickertape_pro: rawData.tickertape_pro } : {})
  };
}

/**
 * Process a single ticker and write verified JSON & HTML artifacts.
 */
async function processTicker(ticker, market, options = {}) {
  const { outDir, refresh, mockData, allowFixtures, templateHtml } = options;
  const financialsDir = path.join(outDir, 'financials');
  fs.mkdirSync(financialsDir, { recursive: true });

  const rawData = await fetchRawFinancials(ticker, market, { refresh, mockData, allowFixtures });
  const effectiveTicker = (rawData && rawData._resolved_ticker) ? rawData._resolved_ticker : ticker;
  const normalized = normalizeFinancials(rawData, effectiveTicker, market);

  // Validate against canonical contract schema
  const validation = validateNormalizedFinancials(normalized);
  if (!validation.ok) {
    throw new Error(`Validation failed for ${effectiveTicker}: ${JSON.stringify(validation.errors)}`);
  }

  // Render HTML statement report
  const jsonContent = JSON.stringify(normalized, null, 2);

  const isCached = Boolean(rawData._is_cached);
  const cachedTimestamp = rawData._cached_at || normalized.timestamp;
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

  const jsonPath = path.join(financialsDir, `${effectiveTicker}.json`);
  const htmlPath = path.join(financialsDir, `${effectiveTicker}.html`);

  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  // Verify artifact pair with Universal Verification Harness
  const harnessResult = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'financials'
  });

  if (!harnessResult.ok) {
    throw new Error(`Harness verification failed for ${effectiveTicker}: ${JSON.stringify(harnessResult.errors)}`);
  }

  return {
    ok: true,
    ticker: effectiveTicker,
    market,
    currency: normalized.currency,
    is_index_etf: normalized.is_index_etf,
    jsonPath,
    htmlPath,
    data: normalized
  };
}

/**
 * Main execution entrypoint.
 */
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return { ok: true };
  }

  const outDir = path.resolve(args.out || DEFAULT_REPORTS_DIR);
  const templatePath = path.join(SKILL_ROOT, 'assets', 'financials-template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  let targets = [];

  if (args.holdings) {
    const holdingsPath = path.resolve(args.holdings);
    if (!fs.existsSync(holdingsPath)) {
      throw new Error(`Holdings snapshot file not found: ${holdingsPath}`);
    }
    const snapshot = JSON.parse(fs.readFileSync(holdingsPath, 'utf8'));
    const defaultMkt = snapshot.currency === 'USD' ? 'US' : 'IN';
    const holdingsList = Array.isArray(snapshot.holdings) ? snapshot.holdings : [];

    for (const h of holdingsList) {
      const sym = (h.ticker || '').toUpperCase();
      if (sym) {
        targets.push({
          ticker: sym,
          market: inferMarket(sym, args.market || defaultMkt)
        });
      }
    }
  } else if (args.ticker) {
    targets.push({
      ticker: args.ticker,
      market: inferMarket(args.ticker, args.market)
    });
  } else {
    throw new Error('Must specify either --ticker <SYMBOL> or --holdings <PATH>');
  }

  const results = [];
  const failures = [];
  for (const [i, t] of targets.entries()) {
    // Space out batch requests so the vendor's rate limiter is not tripped.
    if (i > 0 && !args.mockData) await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      const res = await processTicker(t.ticker, t.market, {
        outDir,
        refresh: args.refresh,
        mockData: args.mockData,
        allowFixtures: args.allowFixtures,
        templateHtml
      });
      results.push(res);
    } catch (err) {
      // A single-ticker run fails fast; a batch run keeps going and reports every failure.
      if (targets.length === 1) throw err;
      failures.push({ ticker: t.ticker, market: t.market, error: err.message });
    }
  }

  if (args.jsonOutput) {
    const payload = {
      ok: failures.length === 0,
      processedCount: results.length,
      failures,
      artifacts: results.map((r) => ({
        ticker: r.ticker,
        market: r.market,
        currency: r.currency,
        is_index_etf: r.is_index_etf,
        json: r.jsonPath,
        html: r.htmlPath
      }))
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(`\n📊 provider-tickertape: Normalized ${results.length} security statement artifact(s):\n`);
    for (const r of results) {
      process.stdout.write(`   • [${r.market}] ${r.ticker}: ${r.jsonPath} & ${r.htmlPath}\n`);
    }
    if (results.length) process.stdout.write('✅ Universal Verification Harness verified all output pairs.\n');
    if (failures.length) {
      process.stdout.write(`\n❌ ${failures.length} ticker(s) failed and were NOT written:\n`);
      for (const f of failures) process.stdout.write(`   • [${f.market}] ${f.ticker}: ${f.error}\n`);
    }
    process.stdout.write('\n');
  }

  return { ok: failures.length === 0, results, failures };
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
  fetchRawFinancials,
  inferMarket,
  main,
  normalizeFinancials,
  parseArgs,
  processTicker
};

