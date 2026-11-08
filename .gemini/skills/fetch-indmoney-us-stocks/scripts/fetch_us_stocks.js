#!/usr/bin/env node
'use strict';
/**
 * fetch-indmoney-us-stocks: Fetches live US stock holdings and valuations from INDmoney MCP,
 * enriches each holding with US GAAP & value-investing fundamental audits from
 * fundamental-us-stock-analysis (Graham, Buffett-Munger, Lynch, Klarman), and outputs
 * a self-contained offline HTML dashboard and JSON contract.
 */
const fs = require('fs');
const path = require('path');
const { createIndmoneyClient } = require('../../../shared/indmoney');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..', '..');
const CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const FUNDAMENTAL_SKILL_DIR = path.join(REPO_ROOT, '.agents', 'skills', 'fundamental-us-stock-analysis');
const FUNDAMENTAL_CACHE_DIR = path.join(FUNDAMENTAL_SKILL_DIR, '.cache');

const INDEX_ETF_TICKERS = new Set(['VOO', 'QQQ', 'RSP', 'SPY', 'IVV', 'VTI']);

function parseArgs(argv) {
  const a = { out: null, refresh: false, only: null, mock: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${k}`);
      return argv[++i];
    };
    if (k === '--out') a.out = next();
    else if (k === '--only') a.only = next().toUpperCase();
    else if (k === '--refresh') a.refresh = true;
    else if (k === '--mock' || k === '--offline') a.mock = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }
  return a;
}

const USAGE = `Usage: node scripts/fetch_us_stocks.js [--out DIR] [--refresh] [--only TICKER] [--mock]`;

/**
 * Mock data fixture for offline testing when token is not yet provided.
 */
function getMockData() {
  return {
    stocks: [
      { ticker: 'AAPL', name: 'Apple Inc.', shares: 12.5, avg_price: 182.40, cmp: 235.10 },
      { ticker: 'MSFT', name: 'Microsoft Corp.', shares: 8.0, avg_price: 340.20, cmp: 428.60 },
      { ticker: 'GOOGL', name: 'Alphabet Inc.', shares: 15.0, avg_price: 135.00, cmp: 178.50 },
      { ticker: 'NVDA', name: 'NVIDIA Corp.', shares: 25.0, avg_price: 88.00, cmp: 141.20 },
      { ticker: 'AMZN', name: 'Amazon.com Inc.', shares: 14.0, avg_price: 145.50, cmp: 186.40 }
    ],
    cash_balance: 320.50,
    usd_to_inr: 87.20
  };
}

/**
 * Compute deterministic Investment Committee Verdict and Devil's Advocate risk bullets
 * from fundamental-us-stock-analysis metrics.
 */
function buildFundamentalAudit(holding, rawFund) {
  const ticker = holding.ticker;
  const isEtf = INDEX_ETF_TICKERS.has(ticker) || holding.sector === 'Index ETF';

  if (isEtf) {
    return {
      isEtf: true,
      verdict: 'ETF',
      verdictLabel: '■ CORE INDEX ETF',
      verdictSub: 'Passive Index Anchor',
      industry: 'Broad Market Index Basket',
      exchange: 'US ETF',
      pe: null,
      pb: null,
      eps: null,
      bvps: null,
      peg: null,
      grahamNumber: null,
      grahamGapPct: null,
      nnwcM: null,
      ownerEarningsM: null,
      rawOwnerEarningsM: null,
      sbcDilutionPct: null,
      dupont: null,
      roePct: null,
      operatingMarginPct: null,
      altmanZ: null,
      altmanZone: null,
      klarman: null,
      analystTarget: null,
      analystUpsidePct: null,
      analystBuyPct: null,
      analystHoldPct: null,
      analystSellPct: null,
      analystsTracking: null,
      forensicNote: 'Single-company GAAP 10-K forensics (Graham Number, Altman Z-Score, 5-Step DuPont ROE, and Owner Earnings) do not apply to diversified index ETF baskets.',
      devilsAdvocate: [
        'Index Concentration: Track underlying S&P 500 / Nasdaq-100 mega-cap overlap against direct single-stock technology positions.'
      ]
    };
  }

  if (!rawFund || !rawFund.marketData || !rawFund.valuationMath) {
    return {
      isEtf: false,
      verdict: 'MONITOR',
      verdictLabel: '▲ HOLD / MONITOR',
      verdictSub: 'Filing Pending',
      industry: holding.sector || 'US Equity',
      exchange: 'US',
      pe: null,
      pb: null,
      eps: null,
      bvps: null,
      peg: null,
      grahamNumber: null,
      grahamGapPct: null,
      nnwcM: null,
      ownerEarningsM: null,
      rawOwnerEarningsM: null,
      sbcDilutionPct: null,
      dupont: null,
      roePct: null,
      operatingMarginPct: null,
      altmanZ: null,
      altmanZone: null,
      klarman: null,
      analystTarget: null,
      analystUpsidePct: null,
      analystBuyPct: null,
      analystHoldPct: null,
      analystSellPct: null,
      analystsTracking: null,
      forensicNote: '10-K / Tickertape US fundamental metrics pending synchronization.',
      devilsAdvocate: ['Run fundamental-us-stock-analysis with --refresh to populate 10-K metrics.']
    };
  }

  const m = rawFund.marketData || {};
  const v = rawFund.valuationMath || {};
  const a = rawFund.analystConsensus || {};
  const bs = (rawFund.financialStatements && rawFund.financialStatements.balanceSheet) || {};
  const cf = (rawFund.financialStatements && rawFund.financialStatements.cashFlow) || {};
  const inc = (rawFund.financialStatements && rawFund.financialStatements.income) || {};

  const cmp = holding.currentPriceUsd || m.cmp || 0;
  const pe = m.pe || null;
  const pb = m.pb || null;
  const eps = m.eps || null;
  const bvps = m.bvps || null;
  const peg = v.lynch && v.lynch.peg != null ? v.lynch.peg : null;
  const grahamNumber = v.grahamNumber != null ? v.grahamNumber : null;
  const grahamGapPct = (grahamNumber != null && cmp > 0)
    ? Number((((grahamNumber - cmp) / cmp) * 100).toFixed(2))
    : null;
  const nnwcM = v.nnwc != null ? Number((v.nnwc / 1e6).toFixed(2)) : null;

  const oeObj = v.ownerEarnings || {};
  const ownerEarningsM = oeObj.trueOwnerEarnings != null ? Number((oeObj.trueOwnerEarnings / 1e6).toFixed(2)) : null;
  const rawOwnerEarningsM = oeObj.rawOwnerEarnings != null ? Number((oeObj.rawOwnerEarnings / 1e6).toFixed(2)) : null;
  const sbcDilutionPct = oeObj.sbcDilutionPct != null ? oeObj.sbcDilutionPct : 0;

  const dupont = v.dupont || null;
  const roePct = dupont && dupont.calculatedRoePct != null ? dupont.calculatedRoePct : null;
  const operatingMarginPct = dupont && dupont.operatingMarginPct != null ? dupont.operatingMarginPct : null;

  const altmanZ = v.altmanZ && v.altmanZ.zScore != null ? v.altmanZ.zScore : null;
  const altmanZone = v.altmanZ && v.altmanZ.zone ? v.altmanZ.zone : 'Grey Zone';
  const klarman = v.klarman || {};

  const analystTarget = a.targetPrice || null;
  const analystUpsidePct = a.upsidePct != null ? a.upsidePct : null;
  const analystBuyPct = a.buyPct != null ? a.buyPct : null;
  const analystHoldPct = a.holdPct != null ? a.holdPct : null;
  const analystSellPct = a.sellPct != null ? a.sellPct : null;
  const analystsTracking = a.analystsTracking || 0;

  // Deterministic IC Verdict Classification
  let verdict = 'MONITOR';
  let verdictLabel = '▲ HOLD / MONITOR';
  let verdictSub = 'Fairly Priced Compounder';

  const isGarpInvest = (peg != null && peg > 0 && peg <= 1.0 && analystUpsidePct != null && analystUpsidePct >= 15);
  const isQualityValueInvest = (pe != null && pe > 0 && pe <= 22 && analystUpsidePct != null && analystUpsidePct >= 25 && (operatingMarginPct || 0) >= 25);
  const isTrim = (analystUpsidePct != null && analystUpsidePct < 0) ||
                 (peg != null && peg > 5.0 && (analystUpsidePct || 0) < 5) ||
                 (pe != null && pe > 40 && (analystUpsidePct || 0) < 3);

  if (isGarpInvest || isQualityValueInvest) {
    verdict = 'INVEST';
    verdictLabel = '● INVEST / ACCUMULATE';
    verdictSub = peg != null ? `PEG ${peg.toFixed(2)} · +${analystUpsidePct.toFixed(1)}% Target` : `${pe.toFixed(1)}x P/E · +${analystUpsidePct.toFixed(1)}% Target`;
  } else if (isTrim) {
    verdict = 'TRIM';
    verdictLabel = '◆ PASS / TRIM';
    verdictSub = analystUpsidePct < 0
      ? `Negative Target (${analystUpsidePct.toFixed(1)}%)`
      : `Stretched PEG ${peg ? peg.toFixed(1) : 'N/A'} (+${(analystUpsidePct || 0).toFixed(1)}%)`;
  } else {
    verdict = 'MONITOR';
    verdictLabel = '▲ HOLD / MONITOR';
    verdictSub = pe > 60
      ? `${pe.toFixed(1)}x P/E · Speculative MoS`
      : `PEG ${peg ? peg.toFixed(2) : 'N/A'} · +${(analystUpsidePct || 0).toFixed(1)}% Target`;
  }

  // Build forensic note & Devil's Advocate critique bullets grounded in the company's actual metrics
  const cfoGreaterNi = (cf.totalCashFromOperatingActivities || 0) >= (inc.netIncome || 0);
  const leverage = dupont ? dupont.financialLeverage : null;
  const forensicNote = cfoGreaterNi
    ? `High Cash Accrual Quality: Operating Cash Flow ($${((cf.totalCashFromOperatingActivities || 0) / 1e6).toFixed(0)}M) exceeds GAAP Net Income ($${((inc.netIncome || 0) / 1e6).toFixed(0)}M). ${altmanZ != null && altmanZ < 1.81 ? 'Low quarterly Altman Z-Score reflects single-quarter revenue/asset scaling rather than liquidity distress.' : ''}`
    : `Accrual Watch: Operating Cash Flow ($${((cf.totalCashFromOperatingActivities || 0) / 1e6).toFixed(0)}M) trails GAAP Net Income ($${((inc.netIncome || 0) / 1e6).toFixed(0)}M); monitor working capital and receivables conversion.`;

  const devilsAdvocate = [];
  if (pe && pe > 35) {
    devilsAdvocate.push(`Multiple Compression Risk: Trading at ${pe.toFixed(1)}x TTM P/E (${grahamGapPct}% vs Graham Floor $${grahamNumber}), leaving minimal margin of safety if earnings growth decelerates.`);
  } else if (peg && peg > 1.8) {
    devilsAdvocate.push(`Growth-Adjusted Premium: Lynch PEG of ${peg.toFixed(2)}x (>1.0 fair value threshold) indicates near-term compounding is already priced into the multiple.`);
  } else {
    devilsAdvocate.push(`Macro & CapEx Cycle Risk: Even with attractive GARP valuation (${pe ? pe.toFixed(1) + 'x P/E' : 'N/A'}${peg ? ', PEG ' + peg.toFixed(2) : ''}), monitor hyperscaler CapEx digestion and regulatory headwinds.`);
  }

  if (analystUpsidePct != null && analystUpsidePct < 5) {
    devilsAdvocate.push(`Limited Street Catalyst: Consensus 12M target ($${analystTarget}) implies ${analystUpsidePct >= 0 ? '+' : ''}${analystUpsidePct.toFixed(2)}% return from current levels.`);
  } else if (holding.portfolioPct >= 8.5) {
    devilsAdvocate.push(`Portfolio Concentration: Represents ${holding.portfolioPct.toFixed(2)}% of US equity portfolio (#${holding.portfolioPct > 10 ? '1–2' : 'Top'} weight); enforce disciplined position sizing.`);
  } else if (leverage && leverage > 2.5) {
    devilsAdvocate.push(`Balance Sheet Leverage: DuPont equity multiplier is ${leverage.toFixed(2)}x; monitor refinancing sensitivity in higher-for-longer rate environments.`);
  } else {
    devilsAdvocate.push(`Valuation Floor Gap: Graham liquidating floor is $${grahamNumber || 'N/A'} (${grahamGapPct != null ? grahamGapPct.toFixed(1) + '%' : 'N/A'} vs CMP), typical for asset-light IP/software compounders.`);
  }

  return {
    isEtf: false,
    verdict,
    verdictLabel,
    verdictSub,
    industry: rawFund.industry || holding.sector || 'Technology',
    exchange: rawFund.exchange || 'NASDAQ/NYSE',
    pe,
    pb,
    eps,
    bvps,
    peg,
    grahamNumber,
    grahamGapPct,
    nnwcM,
    ownerEarningsM,
    rawOwnerEarningsM,
    sbcDilutionPct,
    dupont,
    roePct,
    operatingMarginPct,
    altmanZ,
    altmanZone,
    klarman: {
      isNetDebtSafe: klarman.isNetDebtSafe !== false,
      highAccrualQuality: cfoGreaterNi,
      accrualGapM: klarman.accrualGap != null ? Number((klarman.accrualGap / 1e6).toFixed(2)) : 0
    },
    analystTarget,
    analystUpsidePct,
    analystBuyPct,
    analystHoldPct,
    analystSellPct,
    analystsTracking,
    forensicNote,
    devilsAdvocate
  };
}

/**
 * Enrich normalized holdings with cached or live Tickertape US fundamental audits.
 */
async function enrichHoldingsWithFundamentals(data, options = {}) {
  let fetchUsFundamentals = null;
  const fundScriptPath = path.join(FUNDAMENTAL_SKILL_DIR, 'scripts', 'fetch_us_stock_fundamentals.js');
  if (fs.existsSync(fundScriptPath)) {
    try {
      ({ fetchUsFundamentals } = require(fundScriptPath));
    } catch {
      // fallback to cache files directly
    }
  }

  const enrichedHoldings = [];
  let investCount = 0;
  let monitorCount = 0;
  let trimCount = 0;
  let etfCount = 0;
  let etfWeightPct = 0;
  let upsideSum = 0;
  let upsideCount = 0;

  for (const h of data.holdings || []) {
    const isEtf = INDEX_ETF_TICKERS.has(h.ticker) || h.sector === 'Index ETF';
    let rawFund = null;

    if (!isEtf) {
      const cacheFile = path.join(FUNDAMENTAL_CACHE_DIR, `${h.ticker}_fundamentals.json`);
      if (!options.refresh && fs.existsSync(cacheFile)) {
        try {
          rawFund = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        } catch {
          rawFund = null;
        }
      } else if (!options.mock && fetchUsFundamentals) {
        try {
          rawFund = await fetchUsFundamentals(h.ticker, { refresh: options.refresh });
        } catch (err) {
          console.warn(`⚠️ Fundamental fetch skipped for ${h.ticker}: ${err.message}`);
        }
      }
    }

    const fundamentals = buildFundamentalAudit(h, rawFund);
    if (fundamentals.verdict === 'INVEST') investCount++;
    else if (fundamentals.verdict === 'MONITOR') monitorCount++;
    else if (fundamentals.verdict === 'TRIM') trimCount++;
    else if (fundamentals.verdict === 'ETF') {
      etfCount++;
      etfWeightPct += (h.portfolioPct || 0);
    }

    if (fundamentals.analystUpsidePct != null) {
      upsideSum += fundamentals.analystUpsidePct;
      upsideCount++;
    }

    enrichedHoldings.push({
      ...h,
      fundamentals
    });
  }

  return {
    ...data,
    summary: {
      ...data.summary,
      fundamentalSummary: {
        investCount,
        monitorCount,
        trimCount,
        etfCount,
        etfWeightPct: Number(etfWeightPct.toFixed(2)),
        avgAnalystUpsidePct: upsideCount > 0 ? Number((upsideSum / upsideCount).toFixed(2)) : 0
      }
    },
    holdings: enrichedHoldings
  };
}

/**
 * Fetch US stock holdings and balances via INDmoney MCP or local cache.
 */
async function fetchUsStocks(options = {}) {
  const refresh = options.refresh || false;
  const cacheFile = path.join(CACHE_DIR, 'us_stocks_cache.json');

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Use local cache if valid and refresh not requested
  if (!refresh && !options.mock && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && cached.holdings && cached.summary) {
        console.log('⚡ Loaded US stock holdings from cache (use --refresh to update)');
        return enrichHoldingsWithFundamentals(cached, options);
      }
    } catch {
      // ignore invalid cache
    }
  }

  const client = createIndmoneyClient();

  if (options.mock) {
    console.log('🧪 Using mock US stocks dataset for testing (--mock specified)');
    const mock = getMockData();
    const normalized = client.normalizeUsStocks(mock, { selectedTool: 'mock-fixture' });
    return enrichHoldingsWithFundamentals(normalized, options);
  }

  try {
    console.log(`📡 Connecting to INDmoney MCP server (${client.endpoint})...`);
    const data = await client.getUsStocks();
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    return enrichHoldingsWithFundamentals(data, options);
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      console.warn(`⚠️ MCP fetch failed: ${err.message}`);
      console.warn('⚡ Falling back to cached snapshot.');
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return enrichHoldingsWithFundamentals(cached, options);
    }
    throw err;
  } finally {
    await client.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const outDir = args.out ? path.resolve(args.out) : DEFAULT_REPORTS_DIR;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const data = await fetchUsStocks({ refresh: args.refresh, mock: args.mock });

  let displayHoldings = data.holdings;
  if (args.only) {
    displayHoldings = data.holdings.filter(h => h.ticker === args.only);
    if (!displayHoldings.length) {
      console.error(`No US equity holding matches --only ${args.only}.`);
      process.exit(2);
    }
  }

  const reportPayload = {
    ...data,
    holdings: displayHoldings
  };

  // Render HTML Report
  const templatePath = path.join(SKILL_ROOT, 'assets', 'report-template.html');
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const jsonString = JSON.stringify(reportPayload, null, 2);
  const html = tpl.replace('/*__DATA__*/null', () => jsonString);

  // Write outputs
  const htmlPath = path.join(outDir, 'indmoney-us-stocks.html');
  const jsonPath = path.join(outDir, 'indmoney-us-stocks.json');

  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(jsonPath, jsonString, 'utf8');

  const s = data.summary;
  const fsSum = s.fundamentalSummary || {};
  console.log('\n📊 INDmoney US Stocks & Fundamental Audit Summary:');
  console.log(`   • Total Market Value:      $${s.totalCurrentUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (₹${s.totalCurrentInr.toLocaleString('en-IN')})`);
  console.log(`   • Total Invested Cost:     $${s.totalInvestedUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (₹${s.totalInvestedInr.toLocaleString('en-IN')})`);
  console.log(`   • Total Unrealized Return: ${s.totalPnlUsd >= 0 ? '+' : ''}$${s.totalPnlUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${s.totalReturnPct.toFixed(2)}%)`);
  console.log(`   • Available US Cash:       $${s.availableCashUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   • IC Verdict Breakdown:    ${fsSum.investCount || 0} Invest · ${fsSum.monitorCount || 0} Monitor · ${fsSum.trimCount || 0} Trim · ${fsSum.etfCount || 0} Index ETFs`);
  console.log(`   • Active Positions:        ${displayHoldings.length}`);

  console.log('\n✅ Outputs written:');
  console.log(`   • HTML Report:  ${htmlPath}`);
  console.log(`   • JSON Sidecar: ${jsonPath}\n`);

  return { htmlPath, jsonPath, data: reportPayload };
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error('\n❌ Error:', e.message);
      if (e.message.includes('INDMONEY_MCP_TOKEN') || e.message.includes('401')) {
        console.error('\n👉 To authenticate:');
        console.error('   1. Obtain your session token from your INDmoney account / browser session.');
        console.error('   2. Add INDMONEY_MCP_TOKEN=<your-token> into the repo root .env file.');
        console.error('   3. Re-run: node .agents/skills/fetch-indmoney-us-stocks/scripts/fetch_us_stocks.js');
        console.error('   (Or run with --mock to test with mock data)\n');
      }
      process.exit(1);
    }
  );
}

module.exports = { fetchUsStocks, enrichHoldingsWithFundamentals, buildFundamentalAudit, main, parseArgs };
