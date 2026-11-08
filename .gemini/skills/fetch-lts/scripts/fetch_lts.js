#!/usr/bin/env node
'use strict';
/**
 * fetch-lts: Fetches live Angel One Demat holdings and margin via Angel One MCP.
 * Pure holdings display without complex scoring or metrics.
 * Acts as the source of truth for analyze-lts-holdings and fetch-lts-xirr.
 */
const fs = require('fs');
const path = require('path');
const { createAngelOneClient } = require('../../../shared/angelone');

const SKILL_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const REPORTS_DIR = path.join(SKILL_ROOT, 'reports');

const COMPANY_NAMES = {
  INFY: 'Infosys Ltd',
  ITC: 'ITC Ltd',
  ZYDUSLIFE: 'Zydus Lifesciences Ltd',
  NATCOPHARM: 'Natco Pharma Ltd',
  HDFCBANK: 'HDFC Bank Ltd',
  SOUTHBANK: 'South Indian Bank Ltd',
  TCS: 'Tata Consultancy Services Ltd',
  WIPRO: 'Wipro Ltd',
  HCLTECH: 'HCL Technologies Ltd'
};

function parseArgs(argv) {
  const a = { broker: 'angelone', out: null, refresh: false, only: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${k}`);
      return argv[++i];
    };
    if (k === '--broker') a.broker = next().toLowerCase();
    else if (k === '--out') a.out = next();
    else if (k === '--only') a.only = next().toUpperCase();
    else if (k === '--refresh') a.refresh = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }
  return a;
}

const USAGE = `Usage: node scripts/fetch_lts.js [--broker angelone] [--out DIR] [--refresh] [--only TICKER]`;

/**
 * Fetch Angel One holdings, cash margin, and acquisition trade dates via Angel One MCP.
 */
async function fetchHoldings(options = {}) {
  const refresh = options.refresh || false;
  const cacheFile = path.join(CACHE_DIR, 'holdings_cache.json');

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Use local cache if valid and refresh not requested
  if (!refresh && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && Array.isArray(cached.holdings) && cached.holdings.length > 0) {
        return cached;
      }
    } catch {
      // Fall through to live fetch
    }
  }

  const client = createAngelOneClient();
  try {
    const rawHoldings = await client.getHoldings();
    let margin = { available_cash: 0, net_margin: 0 };
    try {
      margin = await client.getMargins();
    } catch (e) {
      console.warn(`Margin fetch note: ${e.message}`);
    }

    let trades = [];
    try {
      trades = await client.getHistoricalTrades();
    } catch {
      // Ignore tradebook errors
    }

    // Map earliest buy date per symbol
    const buyDateMap = {};
    for (const t of (trades || [])) {
      if (t.type === 'BUY' && t.symbol && t.date) {
        const sym = t.symbol.toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, '');
        if (!buyDateMap[sym] || new Date(t.date) < new Date(buyDateMap[sym])) {
          buyDateMap[sym] = t.date;
        }
      }
    }

    const totalInvested = (rawHoldings || []).reduce((sum, h) => sum + Number(h.invested || (h.quantity * h.average_price) || 0), 0);
    const totalCurrent = (rawHoldings || []).reduce((sum, h) => sum + Number(h.current_value || (h.quantity * h.last_price) || 0), 0);
    const totalPnl = totalCurrent - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const availableCash = Number(margin.available_cash || margin.net_margin || 0);

    const holdings = (rawHoldings || []).map(h => {
      const ticker = (h.tradingsymbol || h.symbol || '').toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, '');
      const invested = Number(h.invested || (h.quantity * h.average_price) || 0);
      const current = Number(h.current_value || (h.quantity * h.last_price) || 0);
      const pnl = Number(h.pnl || (current - invested));
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const weight = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0;

      return {
        tradingsymbol: ticker,
        ticker,
        symbol: ticker,
        name: COMPANY_NAMES[ticker] || ticker,
        isin: h.isin || '',
        quantity: h.quantity,
        average_price: h.average_price,
        averagePrice: h.average_price,
        last_price: h.last_price,
        price: h.last_price,
        invested,
        investedValue: invested,
        current_value: current,
        currentValue: current,
        pnl,
        returnPct,
        weight,
        buyDate: buyDateMap[ticker] || null
      };
    }).sort((a, b) => b.current_value - a.current_value);

    const result = {
      evalDate: new Date().toISOString().split('T')[0],
      broker: 'angelone',
      summary: {
        totalInvested,
        totalCurrent,
        totalPnl,
        totalReturnPct,
        availableCash,
        totalAccountEquity: totalCurrent + availableCash,
        holdingsCount: holdings.length
      },
      margin,
      holdings
    };

    // Cache result
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), 'utf8');
    return result;
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close error
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const outDir = args.out ? path.resolve(args.out) : REPORTS_DIR;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('📡 Fetching Angel One holdings via local MCP server...');
  const data = await fetchHoldings({ refresh: args.refresh });

  let displayHoldings = data.holdings;
  if (args.only) {
    displayHoldings = data.holdings.filter(h => h.ticker === args.only);
    if (!displayHoldings.length) {
      console.error(`No holding matches --only ${args.only}.`);
      process.exit(2);
    }
  }

  const reportPayload = {
    ...data,
    holdings: displayHoldings
  };

  // Render HTML Report
  const templatePath = path.join(SKILL_ROOT, 'assets/report-template.html');
  const tpl = fs.readFileSync(templatePath, 'utf8');
  const jsonString = JSON.stringify(reportPayload, null, 2);
  const html = tpl.replace('/*__DATA__*/null', () => jsonString);

  // Write outputs
  const htmlPath = path.join(outDir, 'fetch-lts.html');
  const jsonPath = path.join(outDir, 'fetch-lts.json');

  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(jsonPath, jsonString, 'utf8');

  const s = data.summary;
  console.log('\n📊 Angel One Holdings Summary:');
  console.log(`   • Total Market Value:      ₹${s.totalCurrent.toLocaleString('en-IN')}`);
  console.log(`   • Total Invested Cost:     ₹${s.totalInvested.toLocaleString('en-IN')}`);
  console.log(`   • Total Unrealized P&L:    ${s.totalPnl >= 0 ? '+' : ''}₹${s.totalPnl.toLocaleString('en-IN')} (${s.totalReturnPct.toFixed(2)}%)`);
  console.log(`   • Free Cash Margin:        ₹${s.availableCash.toLocaleString('en-IN')}`);
  console.log(`   • Total Account Equity:    ₹${s.totalAccountEquity.toLocaleString('en-IN')}`);
  console.log(`   • Active Positions:        ${displayHoldings.length}`);

  console.log('\n✅ Outputs written:');
  console.log(`   • HTML Report: ${htmlPath}`);
  console.log(`   • JSON Sidecar: ${jsonPath}\n`);

  return { htmlPath, jsonPath, data: reportPayload };
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error('Error:', e.message);
      process.exit(1);
    }
  );
}

module.exports = { fetchHoldings, main, parseArgs };
