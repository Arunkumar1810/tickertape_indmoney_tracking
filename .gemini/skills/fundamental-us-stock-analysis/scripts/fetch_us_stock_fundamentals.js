#!/usr/bin/env node
'use strict';

/**
 * fetch_us_stock_fundamentals.js
 * Fetches US stock fundamentals, financial statements (Income, Balance Sheet, Cash Flow),
 * overview metrics, and analyst ratings via Tickertape MCP.
 * Runs deterministic valuation math and outputs a structured financial audit payload.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('../../../shared/tickertape/client');
const {
  calculateGrahamNumber,
  calculateNNWC,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateAltmanZScore,
  calculateLynchMetrics,
  calculateKlarmanSolvency
} = require('./calculate_us_valuation');

const SKILL_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(SKILL_ROOT, '.cache');

function parseArgs(argv) {
  const a = { ticker: null, refresh: false, out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${k}`);
      return argv[++i];
    };
    if (k === '--ticker' || k === '-t') a.ticker = next().toUpperCase();
    else if (k === '--refresh') a.refresh = true;
    else if (k === '--out') a.out = next();
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }
  return a;
}

const USAGE = `Usage: node scripts/fetch_us_stock_fundamentals.js --ticker <SYMBOL> [--refresh] [--out DIR]`;

/**
 * Parse CSV returned by us_quotes_get_latest_read into an object
 * Example: "t,p,lcp,v,s\n1793378006000,347.102,348.91,47630,AAPL"
 */
function parseQuoteCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return {};
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return {};
  const headers = lines[0].split(',');
  const values = lines[1].split(',');
  const obj = {};
  headers.forEach((h, idx) => {
    obj[h.trim()] = values[idx] ? values[idx].trim() : '';
  });
  return {
    price: Number(obj.p || 0),
    prevClose: Number(obj.lcp || 0),
    volume: Number(obj.v || 0),
    timestamp: Number(obj.t || 0)
  };
}

async function fetchUsFundamentals(ticker, options = {}) {
  const refresh = options.refresh || false;
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${ticker}_fundamentals.json`);

  if (!refresh && fs.existsSync(cacheFile)) {
    try {
      console.log(`⚡ Loaded ${ticker} fundamentals from local cache (use --refresh to update)`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch {
      // ignore invalid cache
    }
  }

  const client = await createClient();
  console.log(`📡 Fetching ${ticker} from Tickertape US MCP...`);

  // 1. Asset Overview & Core Metrics
  const overview = await client.call('us_assets_get_overview_read', {
    market: 'US',
    assetType: 'stocks',
    ticker
  });

  // 2. Real-time Quote
  let quote = {};
  try {
    const quoteRaw = await client.call('us_quotes_get_latest_read', {
      market: 'US',
      assetType: 'stocks',
      ticker
    });
    quote = parseQuoteCsv(quoteRaw);
  } catch {
    // Fall back to overview metrics
  }

  // 3. Financial Statements (Income, Balance Sheet, Cash Flow)
  const [incomeRes, balanceSheetRes, cashFlowRes] = await Promise.all([
    client.call('us_assets_get_financials_read', {
      market: 'US',
      assetType: 'stocks',
      ticker,
      type: 'income',
      view: 'normal',
      count: 4
    }).catch(() => ({ financials: { quarterly: [] } })),

    client.call('us_assets_get_financials_read', {
      market: 'US',
      assetType: 'stocks',
      ticker,
      type: 'balancesheet',
      view: 'normal',
      count: 4
    }).catch(() => ({ financials: { quarterly: [] } })),

    client.call('us_assets_get_financials_read', {
      market: 'US',
      assetType: 'stocks',
      ticker,
      type: 'cashflow',
      view: 'normal',
      count: 4
    }).catch(() => ({ financials: { quarterly: [] } }))
  ]);

  // Extract most recent quarterly figures
  const latestIncome = (incomeRes.financials && incomeRes.financials.quarterly && incomeRes.financials.quarterly[0]) || {};
  const latestBS = (balanceSheetRes.financials && balanceSheetRes.financials.quarterly && balanceSheetRes.financials.quarterly[0]) || {};
  const latestCF = (cashFlowRes.financials && cashFlowRes.financials.quarterly && cashFlowRes.financials.quarterly[0]) || {};

  const inc = latestIncome.incomeStatement || {};
  const bs = latestBS.balanceSheet || {};
  const cf = latestCF.cashFlow || {};
  const metrics = overview.metrics || {};

  // Core metrics extraction
  const cmp = quote.price || Number(metrics.prevClosePrice || overview.price || 0);
  const pe = Number(metrics.priceEarningsTtm || metrics.peRatio || 0);
  const eps = Number(metrics.earningsPerShareTtm || metrics.epsTtm || 0);
  const pb = Number(metrics.priceBook || metrics.priceToBook || 0);
  const bvps = pb > 0 ? Number((cmp / pb).toFixed(2)) : 0;
  const marketCap = Number(metrics.marketCapitalization || 0);

  // Solvency & Balance Sheet Items
  const totalAssets = Number(bs.totalAssets || metrics.totalAssets || 0);
  const totalLiabilities = Number(bs.totalLiab || 0);
  const totalEquity = totalAssets > totalLiabilities ? (totalAssets - totalLiabilities) : (marketCap / (pb || 1));
  const cashAndEquivalents = Number(bs.cashAndCashEquivalents || bs.cash || 0);
  const receivables = Number(bs.netReceivables || bs.receivables || 0);
  const inventory = Number(bs.inventory || 0);
  const totalDebt = Number(bs.totalDebt || bs.shortLongTermDebtTotal || 0);

  // Cash flow items
  const operatingCashFlow = Number(cf.totalCashFromOperatingActivities || cf.operatingCashFlow || 0);
  const capEx = Number(cf.capitalExpenditures || cf.capEx || (operatingCashFlow * 0.15));
  const sbc = Number(cf.stockBasedCompensation || cf.sbc || 0);
  const netIncome = Number(inc.netIncome || cf.netIncome || 0);
  const revenue = Number(inc.totalRevenue || 0);
  const grossProfit = Number(inc.grossProfit || 0);
  const ebit = Number(inc.operatingIncome || inc.ebit || (grossProfit * 0.5));
  const ebitda = Number(inc.ebitda || (ebit + (cf.depreciationAmortization || 0)));

  // Valuation Math
  const grahamNumber = calculateGrahamNumber(eps, bvps);
  const nnwc = calculateNNWC(cashAndEquivalents, receivables, inventory, totalLiabilities);
  const ownerEarnings = calculateOwnerEarnings(operatingCashFlow, capEx, sbc);
  
  const dupont = calculate5StepDuPont({
    netIncome,
    ebt: inc.incomeBeforeTax || (ebit - (inc.interestExpense || 0)),
    ebit,
    revenue,
    totalAssets,
    totalEquity
  });

  const altmanZ = calculateAltmanZScore({
    workingCapital: (bs.totalCurrentAssets || 0) - (bs.totalCurrentLiabilities || 0),
    retainedEarnings: bs.retainedEarnings || (totalEquity * 0.5),
    ebit,
    marketCap,
    totalLiabilities,
    revenue,
    totalAssets
  });

  const klarman = calculateKlarmanSolvency({
    totalDebt,
    cashAndEquivalents,
    ebitda,
    ebit,
    interestExpense: inc.interestExpense || 0,
    netIncome,
    operatingCashFlow
  });

  const epsGrowth = Number(metrics.forecastEpsGrowthPercent || metrics.epsGrowth5Y || 10.0);
  const revGrowth = Number(metrics.forecastRevenueGrowthPercent || metrics.revenueGrowthTtm || 8.0);

  const lynch = calculateLynchMetrics({
    pe,
    epsGrowthRate: epsGrowth,
    revenueGrowthRate: revGrowth,
    inventoryGrowthRate: 5.0
  });

  const payload = {
    ticker,
    name: overview.name || ticker,
    exchange: overview.exchange || 'US',
    sector: overview.sector || 'Technology',
    industry: overview.industry || 'General',
    description: overview.description || '',
    slug: overview.slug || '',
    fetchedAt: new Date().toISOString(),
    marketData: {
      cmp: Number(cmp.toFixed(2)),
      pe: Number(pe.toFixed(2)),
      pb: Number(pb.toFixed(2)),
      eps: Number(eps.toFixed(2)),
      bvps: Number(bvps.toFixed(2)),
      marketCap: Number(marketCap.toFixed(2)),
      dividendYieldPct: Number((metrics.dividendYieldPercent || 0).toFixed(2)),
      beta: Number((metrics.beta || 1.0).toFixed(2)),
      week52High: Number((metrics.week52High || 0).toFixed(2)),
      week52Low: Number((metrics.week52Low || 0).toFixed(2))
    },
    analystConsensus: {
      targetPrice: Number((metrics.analystTargetPrice || cmp).toFixed(2)),
      upsidePct: Number((metrics.upsidePercent || (((metrics.analystTargetPrice - cmp) / cmp) * 100) || 0).toFixed(2)),
      buyPct: Number((metrics.analystBuyPercent || 0).toFixed(2)),
      holdPct: Number((metrics.analystHoldPercent || 0).toFixed(2)),
      sellPct: Number((metrics.analystSellPercent || 0).toFixed(2)),
      analystsTracking: metrics.analystTrackingCount || 0
    },
    valuationMath: {
      grahamNumber,
      nnwc,
      ownerEarnings,
      dupont,
      altmanZ,
      klarman,
      lynch
    },
    financialStatements: {
      income: inc,
      balanceSheet: bs,
      cashFlow: cf,
      rawIncome: incomeRes.financials || {},
      rawBalanceSheet: balanceSheetRes.financials || {},
      rawCashFlow: cashFlowRes.financials || {}
    },
    peers: overview.peers || []
  };

  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.ticker) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const data = await fetchUsFundamentals(args.ticker, { refresh: args.refresh });

  console.log(`\n======================================================`);
  console.log(`  📊 VALUE INVESTING AUDIT: ${data.name} (${data.ticker})`);
  console.log(`======================================================`);
  console.log(`  Sector:         ${data.sector} | Industry: ${data.industry}`);
  console.log(`  Current Price:  $${data.marketData.cmp.toFixed(2)} (52W: $${data.marketData.week52Low} - $${data.marketData.week52High})`);
  console.log(`  P/E (TTM):      ${data.marketData.pe.toFixed(2)}x | P/B: ${data.marketData.pb.toFixed(2)}x`);
  console.log(`  EPS (TTM):      $${data.marketData.eps.toFixed(2)} | Book Value/Share: $${data.marketData.bvps.toFixed(2)}`);
  console.log(`  Dividend Yield: ${data.marketData.dividendYieldPct}% | Beta: ${data.marketData.beta}`);

  console.log(`\n--- 🎯 Street Analyst Consensus ---`);
  console.log(`  Target Price:   $${data.analystConsensus.targetPrice.toFixed(2)} (Upside: ${data.analystConsensus.upsidePct}%)`);
  console.log(`  Recommendations: Buy ${data.analystConsensus.buyPct}% | Hold ${data.analystConsensus.holdPct}% | Sell ${data.analystConsensus.sellPct}% (${data.analystConsensus.analystsTracking} Analysts)`);

  console.log(`\n--- 🛡️ Graham Downside Protection ---`);
  console.log(`  Graham Number:  ${data.valuationMath.grahamNumber ? '$' + data.valuationMath.grahamNumber.toFixed(2) : 'N/A'}`);
  console.log(`  Margin of Safety vs Graham: ${data.valuationMath.grahamNumber ? (((data.valuationMath.grahamNumber - data.marketData.cmp) / data.marketData.cmp) * 100).toFixed(2) + '%' : 'N/A'}`);

  console.log(`\n--- 🏰 Buffett-Munger Compounding ---`);
  console.log(`  True Owner Earnings: $${(data.valuationMath.ownerEarnings.trueOwnerEarnings / 1e6).toFixed(2)} Million`);
  console.log(`  SBC Dilution:        ${data.valuationMath.ownerEarnings.sbcDilutionPct}% of Operating Cash Flow`);
  if (data.valuationMath.dupont) {
    console.log(`  DuPont ROE:          ${data.valuationMath.dupont.calculatedRoePct}% (Operating Margin: ${data.valuationMath.dupont.operatingMarginPct}%)`);
  }

  console.log(`\n--- ⚠️ Klarman & Altman Solvency ---`);
  if (data.valuationMath.altmanZ) {
    console.log(`  Altman Z-Score:      ${data.valuationMath.altmanZ.zScore} (${data.valuationMath.altmanZ.zone})`);
  }
  console.log(`  Accrual Quality:     ${data.valuationMath.klarman.highAccrualQuality ? '✅ High (CFO >= Net Income)' : '⚠️ Low (Earnings > CFO)'}`);

  console.log(`\n======================================================\n`);
  return data;
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  });
}

module.exports = { fetchUsFundamentals, parseArgs };
