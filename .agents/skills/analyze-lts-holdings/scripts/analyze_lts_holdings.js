#!/usr/bin/env node
'use strict';
/**
 * analyze-lts-holdings: Deep analysis and rule-based scoring of long-term holdings.
 * Consumes holdings from fetch-lts, enriches via Tickertape MCP, and produces
 * an offline HTML rationale review and JSON sidecar.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig, SKILL_ROOT } = require('./lib/config');
const { TOKENS_FILE, CREDENTIALS_FILE } = require('./lib/auth');
const { createClient } = require('./lib/client');
const { createCache, enrichAll, todayStr } = require('./lib/enricher');
const { scorePortfolio } = require('./lib/score');
const { buildReport, writeReport, loadPrevious } = require('./lib/render');

// Import fetchHoldings from fetch-lts skill
let fetchLtsModule = null;
try {
  fetchLtsModule = require('../../fetch-lts/scripts/fetch_lts');
} catch {
  // Fallback to reading fetch-lts reports
}

function parseArgs(argv) {
  const a = { broker: 'angelone', out: null, refresh: false, only: null, config: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${k}`);
      return argv[++i];
    };
    if (k === '--broker') a.broker = next().toLowerCase();
    else if (k === '--out') a.out = next();
    else if (k === '--only') a.only = next().toUpperCase();
    else if (k === '--config') a.config = next();
    else if (k === '--refresh') a.refresh = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }
  return a;
}

const USAGE = `Usage: node scripts/analyze_lts_holdings.js [--out DIR] [--refresh] [--only TICKER] [--config FILE]`;

/** Credential values that must never appear in outputs. */
function collectSecrets() {
  const vals = [];
  for (const f of [TOKENS_FILE, CREDENTIALS_FILE]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const k of ['access_token', 'refresh_token', 'client_secret', 'client_id']) {
        if (typeof j[k] === 'string') vals.push(j[k]);
      }
    } catch {
      /* ignore */
    }
  }
  return vals;
}

async function getHoldingsFromFetchLts(flags = {}) {
  // 1. Try programmatic fetch from fetch-lts module
  if (fetchLtsModule && typeof fetchLtsModule.fetchHoldings === 'function') {
    try {
      console.log('📡 Fetching holdings via fetch-lts skill...');
      const res = await fetchLtsModule.fetchHoldings({ refresh: flags.refresh });
      if (res && res.holdings && res.holdings.length > 0) {
        return {
          records: res.holdings.map(h => ({
            ticker: h.tradingsymbol || h.ticker || h.symbol,
            sid: h.sid || h.tradingsymbol || h.ticker,
            isin: h.isin || '',
            name: h.name || h.tradingsymbol || h.ticker,
            quantity: h.quantity,
            averagePrice: h.average_price || h.averagePrice,
            investedValue: h.invested || h.investedValue || (h.quantity * (h.average_price || h.averagePrice)),
            currentValue: h.current_value || h.currentValue || (h.quantity * (h.last_price || h.price)),
            pnl: h.pnl,
            returnPct: h.returnPct,
            weight: h.weight,
            buyDate: h.buyDate || null
          })),
          summary: res.summary || null
        };
      }
    } catch (err) {
      console.warn(`⚠️ fetch-lts module call note: ${err.message}`);
    }
  }

  // 2. Fallback: Read latest fetch-lts report
  const fetchLtsDir = path.resolve(__dirname, '../../fetch-lts/reports');
  if (fs.existsSync(fetchLtsDir)) {
    const reportFiles = fs.readdirSync(fetchLtsDir)
      .filter(f => f.startsWith('fetch-lts') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (reportFiles.length > 0) {
      const raw = JSON.parse(fs.readFileSync(path.join(fetchLtsDir, reportFiles[0]), 'utf8'));
      console.log(`✓ Loaded holdings from fetch-lts report: ${reportFiles[0]}`);
      const hList = raw.holdings || [];
      return {
        records: hList.map(h => ({
          ticker: h.tradingsymbol || h.ticker || h.symbol,
          sid: h.sid || h.tradingsymbol || h.ticker,
          isin: h.isin || '',
          name: h.name || h.tradingsymbol || h.ticker,
          quantity: h.quantity,
          averagePrice: h.average_price || h.averagePrice,
          investedValue: h.invested || h.investedValue || (h.quantity * (h.average_price || h.averagePrice)),
          currentValue: h.current_value || h.currentValue || (h.quantity * (h.last_price || h.price)),
          pnl: h.pnl,
          returnPct: h.returnPct,
          weight: h.weight,
          buyDate: h.buyDate || null
        })),
        summary: raw.summary || null
      };
    }
  }

  throw new Error('No holdings data available from fetch-lts. Please run fetch-lts first.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const cfg = loadConfig(args.config ? path.resolve(args.config) : undefined);
  const outDir = args.out ? path.resolve(args.out) : path.join(SKILL_ROOT, 'reports');
  const client = createClient();

  const { records: all, summary } = await getHoldingsFromFetchLts(args);
  let records = all;
  if (args.only) {
    records = all.filter((r) => r.ticker.toUpperCase() === args.only || (r.sid && r.sid.toUpperCase() === args.only));
    if (!records.length) {
      console.error(`No holding matches --only ${args.only}.`);
      process.exit(2);
    }
  }

  console.log(`Enriching ${records.length} holding(s) via Tickertape MCP (concurrency ${cfg.concurrency})${args.refresh ? ', cache bypassed' : ''}...`);
  const cache = createCache(path.join(SKILL_ROOT, '.cache'));
  const enriched = await enrichAll(client, records, {
    cache,
    refresh: args.refresh,
    concurrency: cfg.concurrency,
    onProgress: (t, fromCache, warns) => console.log(`  ${t.padEnd(12)} ${fromCache ? '(cache)' : '(live) '} ${warns.length ? 'WARN: ' + warns.join(', ') : 'ok'}`)
  });

  const stamp = todayStr();
  const scored = scorePortfolio(enriched, cfg, { previous: loadPrevious(outDir, stamp), universe: all });
  const report = buildReport(scored, cfg, { summary: args.only ? null : summary, broker: 'angelone' });
  
  const { htmlPath, jsonPath } = writeReport(report, outDir, { secrets: collectSecrets(), date: stamp });
  console.log(`\n✅ Analysis Complete:`);
  console.log(`   • HTML Report: ${htmlPath}`);
  console.log(`   • JSON Sidecar: ${jsonPath}\n`);

  return { htmlPath, jsonPath, report };
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

module.exports = { main, parseArgs, getHoldingsFromFetchLts, collectSecrets };
