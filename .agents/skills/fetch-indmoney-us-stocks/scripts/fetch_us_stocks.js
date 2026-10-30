#!/usr/bin/env node
'use strict';
/**
 * fetch-indmoney-us-stocks: Fetches live US stock holdings and valuations from INDmoney MCP.
 * Pure holdings and balances extraction producing a clean offline HTML dashboard and JSON contract.
 */
const fs = require('fs');
const path = require('path');
const { createIndmoneyClient } = require('../../../shared/indmoney');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..', '..');
const CACHE_DIR = path.join(SKILL_ROOT, '.cache');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');

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
        return cached;
      }
    } catch {
      // ignore invalid cache
    }
  }

  const client = createIndmoneyClient();

  if (options.mock) {
    console.log('🧪 Using mock US stocks dataset for testing (--mock specified)');
    const mock = getMockData();
    return client.normalizeUsStocks(mock, { selectedTool: 'mock-fixture' });
  }

  try {
    console.log(`📡 Connecting to INDmoney MCP server (${client.endpoint})...`);
    const data = await client.getUsStocks();
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    return data;
  } catch (err) {
    if (fs.existsSync(cacheFile)) {
      console.warn(`⚠️ MCP fetch failed: ${err.message}`);
      console.warn('⚡ Falling back to cached snapshot.');
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
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
  console.log('\n📊 INDmoney US Stocks Summary:');
  console.log(`   • Total Market Value:      $${s.totalCurrentUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (₹${s.totalCurrentInr.toLocaleString('en-IN')})`);
  console.log(`   • Total Invested Cost:     $${s.totalInvestedUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (₹${s.totalInvestedInr.toLocaleString('en-IN')})`);
  console.log(`   • Total Unrealized Return: ${s.totalPnlUsd >= 0 ? '+' : ''}$${s.totalPnlUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${s.totalReturnPct.toFixed(2)}%)`);
  console.log(`   • Available US Cash:       $${s.availableCashUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   • Total Account Equity:    $${s.totalAccountValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
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

module.exports = { fetchUsStocks, main, parseArgs };
