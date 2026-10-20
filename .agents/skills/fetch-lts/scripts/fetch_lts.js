#!/usr/bin/env node
'use strict';
/**
 * fetch-lts: Angel One holdings + Tickertape data + auditable rationale -> offline HTML report.
 *   node scripts/fetch_lts.js --broker angelone --out reports/ [--refresh] [--only TICKER] [--config file]
 */
const fs = require('fs');
const path = require('path');
const { loadConfig, SKILL_ROOT } = require('./lib/config');
const { TOKENS_FILE, CREDENTIALS_FILE } = require('./lib/auth');
const { createClient } = require('./lib/client');
const { createCache, fetchHoldings, enrichAll, todayStr } = require('./lib/fetch');
const { scorePortfolio } = require('./lib/score');
const { buildReport, writeReport, loadPrevious } = require('./lib/render');

const SUPPORTED_BROKERS = ['angelone'];

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

const USAGE = `Usage: node scripts/fetch_lts.js [--broker angelone] [--out DIR (default: <skill>/reports)] [--refresh] [--only TICKER] [--config FILE]`;

/** Credential values that must never appear in outputs. */
function collectSecrets() {
  const vals = [];
  for (const f of [TOKENS_FILE, CREDENTIALS_FILE]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const k of ['access_token', 'refresh_token', 'client_secret', 'client_id']) if (typeof j[k] === 'string') vals.push(j[k]);
    } catch (e) {
      /* file may not exist */
    }
  }
  return vals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!SUPPORTED_BROKERS.includes(args.broker)) {
    console.error(`Broker "${args.broker}" is not supported in this version. Supported: ${SUPPORTED_BROKERS.join(', ')}.`);
    process.exit(2);
  }
  const cfg = loadConfig(args.config ? path.resolve(args.config) : undefined);
  const outDir = args.out ? path.resolve(args.out) : path.join(SKILL_ROOT, 'reports');
  const client = createClient();

  console.log('Fetching Angel One holdings...');
  const { records: all, summary } = await fetchHoldings(client);
  let records = all;
  if (args.only) {
    records = all.filter((r) => r.ticker.toUpperCase() === args.only || r.sid.toUpperCase() === args.only);
    if (!records.length) {
      console.error(`No holding matches --only ${args.only}.`);
      process.exit(2);
    }
  }
  console.log(`Enriching ${records.length} holding(s) (concurrency ${cfg.concurrency})${args.refresh ? ', cache bypassed' : ''}...`);
  const cache = createCache(path.join(SKILL_ROOT, '.cache'));
  const enriched = await enrichAll(client, records, {
    cache,
    refresh: args.refresh,
    concurrency: cfg.concurrency,
    onProgress: (t, fromCache, warns) => console.log(`  ${t.padEnd(12)} ${fromCache ? '(cache)' : '(live) '} ${warns.length ? 'WARN: ' + warns.join(', ') : 'ok'}`)
  });

  const stamp = todayStr();
  const scored = scorePortfolio(enriched, cfg, { previous: loadPrevious(outDir, stamp), universe: all });
  const report = buildReport(scored, cfg, { summary: args.only ? null : summary, broker: args.broker });
  const { htmlPath, jsonPath } = writeReport(report, outDir, { secrets: collectSecrets(), date: stamp });
  console.log(`\nReport: ${htmlPath}\nData:   ${jsonPath}`);
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

module.exports = { parseArgs, collectSecrets };
