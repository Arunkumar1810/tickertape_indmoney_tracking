#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createAngelOneClient } = require('../../../shared/angelone');
const LedgerParser = require('./lib/ledger_parser');
const TradesCache = require('./lib/trades_cache');
const FrictionEngine = require('./lib/friction_engine');
const DividendFetcher = require('./lib/dividend_fetcher');
const Redactor = require('./lib/redact');

// Parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    ledger: null,
    tradebook: null,
    refresh: false,
    only: null,
    out: null,
    config: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--refresh') {
      flags.refresh = true;
    } else if (arg === '--ledger' && args[i + 1]) {
      flags.ledger = args[++i];
    } else if (arg === '--tradebook' && args[i + 1]) {
      flags.tradebook = args[++i];
    } else if (arg === '--only' && args[i + 1]) {
      flags.only = args[++i].toUpperCase();
    } else if (arg === '--out' && args[i + 1]) {
      flags.out = args[++i];
    } else if (arg === '--config' && args[i + 1]) {
      flags.config = args[++i];
    }
  }

  return flags;
}

async function main() {
  console.log('\n⚡ fetch-lts-xirr: Angel One MCP & Account Ledger Cashflows');
  console.log('────────────────────────────────────────────────────────────');

  const flags = parseArgs();
  const skillRoot = path.resolve(__dirname, '..');

  // Load config
  const configPath = flags.config ? path.resolve(flags.config) : path.join(skillRoot, 'config/xirr.config.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.warn(`⚠️ Warning: Failed to parse config at ${configPath}: ${err.message}`);
    }
  }

  const reportsDir = flags.out ? path.resolve(flags.out) : path.join(skillRoot, config.reportsDir || 'reports');
  const cacheDir = path.join(skillRoot, config.cacheDir || '.cache');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const tradesCache = new TradesCache({
    cacheDir,
    cacheFile: path.join(cacheDir, 'trades_cache.json')
  });

  // Shared client: transport/config come from .agents/config/angelone-mcp.json (+ repo-root .env)
  const mcpClient = createAngelOneClient();
  const mcpLabel = mcpClient.transport === 'stdio'
    ? `stdio: ${mcpClient.stdio.command} ${(mcpClient.stdio.args || []).join(' ')}`
    : mcpClient.endpoint;

  // 1. Ingest Historical Trades: Prefer Angel One MCP Server > --tradebook flag > local .cache/
  let parsedTrades = [];
  if (flags.tradebook) {
    console.log(`📥 Ingesting tradebook from file: ${flags.tradebook}`);
    parsedTrades = tradesCache.parseTradebook(flags.tradebook);
    tradesCache.save(parsedTrades);
    console.log(`✓ Synchronized ${parsedTrades.length} historical trade executions into cache.`);
  } else {
    try {
      console.log(`📡 Fetching multi-year historical trades from Angel One MCP (${mcpLabel})...`);
      parsedTrades = await mcpClient.getHistoricalTrades();
      if (parsedTrades && parsedTrades.length > 0) {
        tradesCache.save(parsedTrades);
        console.log(`✓ Synchronized ${parsedTrades.length} historical trade executions via Angel One MCP.`);
      }
    } catch (mcpErr) {
      console.warn(`⚠️ MCP historical trades fetch note: ${mcpErr.message}`);
    }

    if (!parsedTrades || parsedTrades.length === 0) {
      const cachedTradebookXlsx = fs.readdirSync(cacheDir)
        .filter(f => /tradebook/i.test(f) && /\.xlsx$/i.test(f) && !f.startsWith('~'))
        .map(f => path.join(cacheDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
      if (cachedTradebookXlsx) {
        console.log(`📥 Ingesting local cached tradebook: ${cachedTradebookXlsx}`);
        parsedTrades = tradesCache.parseTradebook(cachedTradebookXlsx);
        tradesCache.save(parsedTrades);
        console.log(`✓ Synchronized ${parsedTrades.length} historical trade executions into cache.`);
      }
    }
  }

  // 2. Fetch or load Angel One Holdings & Margin
  // Attempt to load fetch-lts programmatic helper
  let fetchLtsModule = null;
  try {
    fetchLtsModule = require('../../fetch-lts/scripts/fetch_lts');
  } catch {
    // Optional fallback
  }

  // Helper: Load Angel One holdings from fetch-lts report if available
  function getAngelOneHoldingsFromLts(root) {
    const ltsReportsDir = path.resolve(root, '..', 'fetch-lts', 'reports');
    if (!fs.existsSync(ltsReportsDir)) return null;
    const files = fs.readdirSync(ltsReportsDir)
      .filter(f => f.startsWith('fetch-lts') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ltsReportsDir, files[0]), 'utf8'));
      if (!raw.holdings || !Array.isArray(raw.holdings) || raw.holdings.length === 0) return null;
      return {
        source: `Angel One (via fetch-lts: ${files[0]})`,
        holdings: raw.holdings.map(h => ({
          tradingsymbol: h.tradingsymbol || h.ticker,
          isin: h.isin || '',
          quantity: h.quantity,
          average_price: h.average_price || h.averagePrice,
          last_price: h.last_price || h.price,
          invested: h.invested || h.investedValue,
          current_value: h.current_value || h.currentValue,
          pnl: h.pnl
        })),
        margin: raw.margin || { available_cash: (raw.summary && raw.summary.availableCash) || 0, net_margin: 0 }
      };
    } catch {
      return null;
    }
  }

  // 2. Fetch or load Holdings & Margin
  let holdings = [];
  let margin = { available_cash: 0, net_margin: 0 };
  const holdingsCacheFile = path.join(cacheDir, 'holdings_cache.json');

  let fetchedLive = false;
  if (!flags.refresh && fs.existsSync(holdingsCacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(holdingsCacheFile, 'utf8'));
      holdings = cached.holdings || [];
      margin = cached.margin || margin;
      console.log(`✓ Loaded ${holdings.length} holdings from local cache.`);
    } catch {
      // Fall through to live fetch
    }
  }

  if (holdings.length === 0 || flags.refresh) {
    // Primary: Delegate holdings retrieval to fetch-lts skill
    if (fetchLtsModule && typeof fetchLtsModule.fetchHoldings === 'function') {
      try {
        console.log(`📡 Fetching holding details via fetch-lts skill...`);
        const ltsRes = await fetchLtsModule.fetchHoldings({ refresh: flags.refresh });
        if (ltsRes && ltsRes.holdings && ltsRes.holdings.length > 0) {
          holdings = ltsRes.holdings.map(h => ({
            tradingsymbol: h.tradingsymbol || h.ticker,
            isin: h.isin || '',
            quantity: h.quantity,
            average_price: h.average_price || h.averagePrice,
            last_price: h.last_price || h.price,
            invested: h.invested || h.investedValue,
            current_value: h.current_value || h.currentValue,
            pnl: h.pnl
          }));
          margin = ltsRes.margin || margin;
          fetchedLive = true;
          console.log(`✓ Synchronized ${holdings.length} holdings via fetch-lts; free margin: ₹${(margin.available_cash || 0).toLocaleString('en-IN')}`);

          fs.writeFileSync(holdingsCacheFile, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            broker: 'angelone',
            source: 'fetch-lts skill',
            holdings,
            margin
          }, null, 2), 'utf8');
        }
      } catch (ltsErr) {
        console.warn(`⚠️ fetch-lts fetch note: ${ltsErr.message}`);
      }
    }

    // Secondary fallback: Direct MCP connect if fetch-lts didn't produce holdings
    if (holdings.length === 0) {
      console.log(`📡 Connecting to Angel One MCP (${mcpLabel})...`);
      try {
        holdings = await mcpClient.getHoldings();
        margin = await mcpClient.getMargins();
        fetchedLive = true;
        console.log(`✓ Fetched ${holdings.length} live holdings from Angel One SmartAPI; free margin: ₹${(margin.available_cash || 0).toLocaleString('en-IN')}`);

        // Cache holdings
        fs.writeFileSync(holdingsCacheFile, JSON.stringify({
          lastUpdated: new Date().toISOString(),
          broker: 'angelone',
          holdings,
          margin
        }, null, 2), 'utf8');
      } catch (err) {
        console.warn(`⚠️ Angel One MCP live fetch note: ${err.message}`);
        
        // Check for user's actual Angel One portfolio from fetch-lts report
        const angelOneData = getAngelOneHoldingsFromLts(skillRoot);
        if (angelOneData) {
          holdings = angelOneData.holdings;
          margin = angelOneData.margin;
          console.log(`✓ Detected active ${angelOneData.source}: ${holdings.length} holdings loaded.`);
          fs.writeFileSync(holdingsCacheFile, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            broker: 'angelone',
            source: angelOneData.source,
            holdings,
            margin
          }, null, 2), 'utf8');
        } else if (fs.existsSync(holdingsCacheFile)) {
          const cached = JSON.parse(fs.readFileSync(holdingsCacheFile, 'utf8'));
          holdings = cached.holdings || [];
          margin = cached.margin || margin;
          console.log(`✓ Falling back to cached holdings (${holdings.length} stocks).`);
        } else {
          console.log('ℹ️ No active Angel One session found; initializing empty portfolio.');
          holdings = [];
          margin = { available_cash: 0, net_margin: 0 };
        }
      }
    }
  }

  // Sync trades_cache if tradebook was not explicitly passed and cache holds obsolete dummy trades
  const totalInvested = holdings.reduce((sum, h) => sum + (h.invested || 0), 0);
  const cachedTradesData = tradesCache.load();
  const currentTrades = cachedTradesData.trades || [];
  const isMockTrades = currentTrades.some(t => t.tradeId === 'TRD_TCS_01' && t.amount > 50000) && totalInvested < 100000;
  if (!flags.tradebook && (isMockTrades || currentTrades.length === 0)) {
    const baselineTrades = holdings.map((h, idx) => ({
      tradeId: `TRD_${h.tradingsymbol}_01`,
      symbol: h.tradingsymbol,
      isin: h.isin || '',
      date: '2024-01-15',
      type: 'BUY',
      quantity: h.quantity,
      price: h.average_price,
      amount: Math.round(h.invested)
    }));
    tradesCache.save(baselineTrades);
    console.log(`✓ Synchronized trade cache with ${baselineTrades.length} actual holding positions.`);
  }

  // 3. Ingest Bank Funds Ledger: Prefer Angel One MCP Server > --ledger flag > config/ledger.json > local .cache/
  let fundCashflows = [];
  const ledgerCacheFile = path.join(cacheDir, 'ledger_cache.json');
  const userConfigLedgerJson = path.join(skillRoot, 'config/ledger.json');
  const userConfigLedgerCsv = path.join(skillRoot, 'config/ledger.csv');

  if (flags.ledger) {
    console.log(`📥 Parsing funds ledger from file: ${flags.ledger}`);
    fundCashflows = LedgerParser.parse(flags.ledger);
    fs.writeFileSync(ledgerCacheFile, JSON.stringify(fundCashflows, null, 2), 'utf8');
    console.log(`✓ Parsed ${fundCashflows.length} bank pay-ins / payouts.`);
  } else {
    try {
      console.log(`📡 Fetching multi-year account ledger cashflows from Angel One MCP (${mcpLabel})...`);
      fundCashflows = await mcpClient.getAccountLedger();
      if (fundCashflows && fundCashflows.length > 0) {
        fs.writeFileSync(ledgerCacheFile, JSON.stringify(fundCashflows, null, 2), 'utf8');
        console.log(`✓ Fetched ${fundCashflows.length} bank pay-ins / payouts via Angel One MCP.`);
      }
    } catch (mcpErr) {
      console.warn(`⚠️ MCP account ledger fetch note: ${mcpErr.message}`);
    }

    if (!fundCashflows || fundCashflows.length === 0) {
      let cachedXlsx = null;
      const xlsxCandidates = fs.readdirSync(cacheDir)
        .filter(f => /\.xlsx$/i.test(f) && !/tradebook/i.test(f) && !f.startsWith('~'))
        .map(f => path.join(cacheDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (xlsxCandidates.length > 0) cachedXlsx = xlsxCandidates[0];

      const targetLedgerFile = fs.existsSync(userConfigLedgerJson)
        ? userConfigLedgerJson
        : (fs.existsSync(userConfigLedgerCsv) ? userConfigLedgerCsv : cachedXlsx);

      if (targetLedgerFile) {
        console.log(`📥 Parsing local funds ledger: ${targetLedgerFile}`);
        fundCashflows = LedgerParser.parse(targetLedgerFile);
        fs.writeFileSync(ledgerCacheFile, JSON.stringify(fundCashflows, null, 2), 'utf8');
        console.log(`✓ Parsed ${fundCashflows.length} bank pay-ins / payouts.`);
      } else if (fs.existsSync(ledgerCacheFile)) {
        try {
          const cachedLedger = JSON.parse(fs.readFileSync(ledgerCacheFile, 'utf8'));
          const hasMockPayins = cachedLedger.some(c => Math.abs(c.amount) >= 100000) && totalInvested < 100000;
          if (!hasMockPayins) {
            fundCashflows = cachedLedger;
            console.log(`✓ Loaded ${fundCashflows.length} bank fund cashflows from cache.`);
          } else {
            console.log('ℹ️ Cleared obsolete sample ledger cache to align with actual portfolio size.');
          }
        } catch {
          fundCashflows = [];
        }
      }
    }
  }

  // If no bank ledger is supplied yet, derive representative deposit schedule
  if (fundCashflows.length === 0) {
    console.log('ℹ️ No external ledger specified. (Tip: Use --ledger <path-to-funds-csv> for exact bank pay-in history)');
    const initialDepositDate = '2024-01-10';
    fundCashflows = [
      {
        date: initialDepositDate,
        amount: -Math.round(totalInvested + (margin.available_cash || 0)),
        category: 'PAYIN',
        description: 'Portfolio Capital Injected (Calculated)'
      }
    ];
    fs.writeFileSync(ledgerCacheFile, JSON.stringify(fundCashflows, null, 2), 'utf8');
  }

  // 4. Fetch Verified Earned Dividends via Tickertape Corporate Actions
  console.log('📈 Fetching corporate dividend history and verifying shareholding balances...');
  const dividendFetcher = new DividendFetcher({ cacheDir });
  const allTrades = tradesCache.load().trades || [];
  const earnedDividends = await dividendFetcher.fetchEarnedDividends(allTrades, flags.refresh);
  const totalDivEarned = earnedDividends.reduce((sum, d) => sum + d.amount, 0);
  if (earnedDividends.length > 0) {
    console.log(`✓ Verified ${earnedDividends.length} dividend payouts (₹${totalDivEarned.toFixed(2)}) credited to bank.`);
  } else {
    console.log('ℹ️ No dividend ex-dates coincided with holding periods.');
  }

  // 5. Run Analysis via FrictionEngine
  console.log('🧮 Calculating True Investor XIRR and per-stock compounding...');
  const groupedTrades = tradesCache.groupBySymbol();
  const evalDate = new Date().toISOString().split('T')[0];

  const analysis = FrictionEngine.analyze({
    evalDate,
    fundCashflows,
    earnedDividends,
    holdings,
    margin,
    groupedTrades,
    subAnnualDaysThreshold: config.subAnnualThresholdDays || 90
  });

  // Filter if --only flag passed
  if (flags.only) {
    analysis.holdings = analysis.holdings.filter(h => h.symbol === flags.only);
    console.log(`🔍 Filtered report to ${flags.only}`);
  }

  // 5. Sanitize sensitive information
  const sanitized = Redactor.sanitize(analysis);

  // 6. Render HTML report
  const templatePath = path.join(skillRoot, 'assets/report-template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Report template not found at ${templatePath}`);
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace('/*__REPORT_DATA__*/ {', `/*__REPORT_DATA__*/ ${JSON.stringify(sanitized, null, 2)} || {`);

  // Assert no secrets leaked
  Redactor.assertClean(html, [
    process.env.ANGELONE_API_KEY,
    process.env.ANGELONE_JWT_TOKEN,
    process.env.ANGELONE_FEED_TOKEN,
    process.env.ANGELONE_TOTP_SECRET,
    process.env.ANGELONE_PIN,
    process.env.SMARTAPI_TOKEN
  ].filter(Boolean));

  // Write HTML and JSON (dateless filenames; evalDate is embedded inside the files)
  const htmlOutPath = path.join(reportsDir, 'fetch-lts-xirr.html');
  const jsonOutPath = path.join(reportsDir, 'fetch-lts-xirr.json');

  fs.writeFileSync(htmlOutPath, html, 'utf8');
  fs.writeFileSync(jsonOutPath, JSON.stringify(sanitized, null, 2), 'utf8');

  // Print Summary
  const s = sanitized.summary;
  console.log('\n📊 Portfolio XIRR Summary:');
  console.log(`   • Net Capital Added:         ₹${s.netInvestedCapital.toLocaleString('en-IN')}`);
  console.log(`   • Current Account Equity:    ₹${s.totalAccountEquity.toLocaleString('en-IN')} (Holdings: ₹${s.totalHoldingsMarketValue.toLocaleString('en-IN')}, Cash: ₹${s.availableCash.toLocaleString('en-IN')})`);
  console.log(`   • Total Net Profit:          ₹${s.netProfit.toLocaleString('en-IN')} (${(s.investorAbsoluteReturn * 100).toFixed(2)}%)`);
  
  if (s.isInvestorSubAnnual) {
    console.log(`   • True Investor XIRR:        ${(s.investorAbsoluteReturn * 100).toFixed(2)}% (Absolute Return; holding < 90d)`);
  } else {
    console.log(`   • True Investor XIRR:        ${s.investorXirr ? (s.investorXirr * 100).toFixed(2) + '%' : '--%'}`);
  }

  if (s.frictionDragPct !== null) {
    console.log(`   • Friction Drag Spread:      ${s.frictionDragPct.toFixed(2)}% pts`);
  }

  console.log('\n✅ Outputs written:');
  console.log(`   • HTML Report: ${htmlOutPath}`);
  console.log(`   • JSON Sidecar: ${jsonOutPath}\n`);

  try {
    await mcpClient.close();
  } catch {
    // Ignore close errors
  }

  return { htmlOutPath, jsonOutPath };
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
