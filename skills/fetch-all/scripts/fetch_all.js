#!/usr/bin/env node
'use strict';

/**
 * fetch-all: Tier 1 multi-broker account orchestrator and portfolio consolidator.
 * Sequentially invokes fetch-angelone and fetch-indmoney-us, normalizes currencies
 * using live USD/INR exchange rates, recalculates portfolio weights, and emits a
 * combined AccountHoldingsSnapshot JSON contract and offline HTML dashboard.
 */

const fs = require('fs');
const path = require('path');

const {
  validateAccountHoldingsSnapshot,
  verifyArtifactPair,
  renderCacheWarningBanner
} = require('../../../scripts/framework');

const fetchAngelOneModule = require('../../fetch-angelone/scripts/fetch_angelone');
const fetchIndmoneyModule = require('../../fetch-indmoney-us/scripts/fetch_indmoney_us');

const SKILL_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORTS_DIR = path.resolve(__dirname, '../../../reports');

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: null,
    refresh: false,
    only: null,
    jsonOutput: false,
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
    else if (k === '--mock-data') args.mockData = next();
    else if (k === '-h' || k === '--help') args.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

const USAGE = `Usage: node skills/fetch-all/scripts/fetch_all.js [--out DIR] [--refresh] [--only TICKER] [--json-output] [--mock-data PATH]`;

/**
 * Combine Angel One and INDmoney US snapshots into a unified AccountHoldingsSnapshot.
 * @param {object} angelOneSnapshot
 * @param {object} indmoneySnapshot
 * @param {object} [options]
 * @returns {object} Combined AccountHoldingsSnapshot
 */
function combineSnapshots(angelOneSnapshot, indmoneySnapshot, options = {}) {
  const onlyTicker = options.only ? options.only.toUpperCase() : null;
  const sIn = (angelOneSnapshot && angelOneSnapshot.summary) || {};
  const sUs = (indmoneySnapshot && indmoneySnapshot.summary) || {};

  const fxRate = (indmoneySnapshot && (indmoneySnapshot.usd_to_inr || indmoneySnapshot.fx_rate)) || 93.91;

  // 1. Process Indian holdings (Angel One)
  const inHoldings = Array.isArray(angelOneSnapshot && angelOneSnapshot.holdings)
    ? angelOneSnapshot.holdings.map(h => ({
        ticker: h.ticker,
        name: h.name || h.ticker,
        isin: h.isin || '',
        exchange: h.exchange || 'NSE',
        quantity: h.quantity,
        average_price: h.average_price,
        cmp: h.cmp,
        invested_value: h.invested_value,
        current_value: h.current_value,
        unrealized_pnl: h.unrealized_pnl,
        unrealized_pnl_pct: h.unrealized_pnl_pct,
        weight_pct: h.weight_pct || 0,
        fractional_shares: Boolean(h.fractional_shares),
        buy_date: h.buy_date || null,
        sector: h.sector || 'Other'
      }))
    : [];

  // 2. Process US holdings (INDmoney), converting USD values to base currency INR
  const usHoldings = Array.isArray(indmoneySnapshot && indmoneySnapshot.holdings)
    ? indmoneySnapshot.holdings.map(h => {
        const investedINR = round2((h.invested_value || 0) * fxRate);
        const currentINR = round2((h.current_value || 0) * fxRate);
        const pnlINR = round2(currentINR - investedINR);
        const pnlPct = investedINR > 0 ? round2((pnlINR / investedINR) * 100) : 0;
        const avgPriceINR = round2((h.average_price || 0) * fxRate);
        const cmpINR = round2((h.cmp || 0) * fxRate);

        return {
          ticker: h.ticker,
          name: h.name || h.ticker,
          isin: h.isin || 'US000000000',
          exchange: h.exchange || 'NASDAQ',
          quantity: h.quantity,
          average_price: avgPriceINR,
          cmp: cmpINR,
          invested_value: investedINR,
          current_value: currentINR,
          unrealized_pnl: pnlINR,
          unrealized_pnl_pct: pnlPct,
          weight_pct: 0,
          fractional_shares: Boolean(h.fractional_shares),
          buy_date: h.buy_date || null,
          sector: h.sector || 'Other'
        };
      })
    : [];

  // 3. Merge holdings map (combining positions if identical ticker and ISIN exist)
  const holdingsMap = new Map();

  for (const h of [...inHoldings, ...usHoldings]) {
    const key = `${h.ticker}::${h.isin}`;
    if (!holdingsMap.has(key)) {
      holdingsMap.set(key, { ...h });
    } else {
      const existing = holdingsMap.get(key);
      const combinedQty = Number(existing.quantity || 0) + Number(h.quantity || 0);
      const combinedInvested = round2(existing.invested_value + h.invested_value);
      const combinedCurrent = round2(existing.current_value + h.current_value);
      const combinedPnl = round2(combinedCurrent - combinedInvested);
      const combinedPnlPct = combinedInvested > 0 ? round2((combinedPnl / combinedInvested) * 100) : 0;
      const combinedAvg = combinedQty > 0 ? round2(combinedInvested / combinedQty) : existing.average_price;

      holdingsMap.set(key, {
        ...existing,
        quantity: combinedQty,
        average_price: combinedAvg,
        invested_value: combinedInvested,
        current_value: combinedCurrent,
        unrealized_pnl: combinedPnl,
        unrealized_pnl_pct: combinedPnlPct,
        fractional_shares: existing.fractional_shares || h.fractional_shares
      });
    }
  }

  let mergedHoldings = Array.from(holdingsMap.values());

  if (onlyTicker) {
    mergedHoldings = mergedHoldings.filter(h => h.ticker === onlyTicker);
  }

  // 4. Calculate total portfolio metrics
  const totalCurrentVal = round2(mergedHoldings.reduce((sum, h) => sum + (h.current_value || 0), 0));
  const totalInvestedVal = round2(
    (sIn.total_invested || 0) + ((sUs.total_invested || 0) * fxRate)
  );
  const totalPnl = round2(totalCurrentVal - totalInvestedVal);
  const totalReturnPct = totalInvestedVal > 0 ? round2((totalPnl / totalInvestedVal) * 100) : 0;

  // 5. Recalculate weights based on blended current values
  for (const h of mergedHoldings) {
    h.weight_pct = totalCurrentVal > 0 ? round2((h.current_value / totalCurrentVal) * 100) : 0;
  }

  mergedHoldings.sort((a, b) => b.current_value - a.current_value);

  // 6. Pool liquid cash margins
  const inCash = Number((angelOneSnapshot && angelOneSnapshot.margin && angelOneSnapshot.margin.available_cash) || sIn.available_cash || 0);
  const usCash = Number((indmoneySnapshot && indmoneySnapshot.margin && indmoneySnapshot.margin.available_cash) || sUs.available_cash || 0);
  const pooledCash = round2(inCash + (usCash * fxRate));

  const snapshot = {
    account_id: 'combined',
    broker: 'combined',
    currency: 'INR',
    timestamp: new Date().toISOString(),
    summary: {
      total_invested: totalInvestedVal,
      total_current_value: totalCurrentVal,
      unrealized_pnl: totalPnl,
      unrealized_pnl_pct: totalReturnPct,
      available_cash: pooledCash,
      total_account_equity: round2(totalCurrentVal + pooledCash),
      holdings_count: mergedHoldings.length
    },
    margin: {
      available_cash: pooledCash,
      collateral: 0,
      utilised: 0,
      net_margin: pooledCash
    },
    holdings: mergedHoldings
  };

  return { snapshot, fxRate };
}

/**
 * Main execution entrypoint for fetch-all.
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

  let angelOneSnapshot;
  let indmoneySnapshot;
  let isCached = false;
  let cachedTimestamp = null;

  if (args.mockData) {
    const rawMock = JSON.parse(fs.readFileSync(path.resolve(args.mockData), 'utf8'));
    if (rawMock.angelone && rawMock.indmoney) {
      angelOneSnapshot = rawMock.angelone;
      indmoneySnapshot = rawMock.indmoney;
    } else {
      angelOneSnapshot = rawMock;
      indmoneySnapshot = rawMock;
    }
  } else {
    // 1. Invoke fetch-angelone
    const angelOneArgs = ['--out', outDir];
    if (args.refresh) angelOneArgs.push('--refresh');
    if (args.only) angelOneArgs.push('--only', args.only);

    const angelOneResult = await fetchAngelOneModule.main(angelOneArgs);
    angelOneSnapshot = angelOneResult.snapshot;

    // 2. Invoke fetch-indmoney-us
    const indmoneyArgs = ['--out', outDir];
    if (args.refresh) indmoneyArgs.push('--refresh');
    if (args.only) indmoneyArgs.push('--only', args.only);

    const indmoneyResult = await fetchIndmoneyModule.main(indmoneyArgs);
    indmoneySnapshot = indmoneyResult.snapshot;
  }

  // 3. Combine snapshots into unified portfolio
  const { snapshot, fxRate } = combineSnapshots(angelOneSnapshot, indmoneySnapshot, { only: args.only });

  if (args.only && snapshot.holdings.length === 0) {
    const errMsg = `No holding found across any account matching ticker "${args.only}".`;
    if (args.jsonOutput) {
      process.stdout.write(JSON.stringify({ ok: false, error: errMsg }, null, 2) + '\n');
    } else {
      process.stderr.write(`[WARN] ${errMsg}\n`);
    }
    return { ok: false, error: errMsg };
  }

  // 4. Validate against canonical AccountHoldingsSnapshot contract
  const validationResult = validateAccountHoldingsSnapshot(snapshot);
  if (!validationResult.ok) {
    const msg = `AccountHoldingsSnapshot validation failed: ${JSON.stringify(validationResult.errors)}`;
    throw new Error(msg);
  }

  // 5. Render self-contained offline HTML report
  const templatePath = path.join(SKILL_ROOT, 'assets', 'report-template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  const htmlPayload = {
    ...snapshot,
    usd_to_inr: fxRate,
    holdings: snapshot.holdings.map(h => ({
      ...h,
      broker: (h.exchange === 'NSE' || h.exchange === 'BSE' || (h.isin && h.isin.startsWith('INE')))
        ? 'angelone'
        : 'indmoney'
    }))
  };

  const jsonContent = JSON.stringify(snapshot, null, 2);
  let htmlContent = templateHtml.replace('/*__DATA__*/null', () => JSON.stringify(htmlPayload, null, 2));

  if (isCached) {
    const bannerHtml = renderCacheWarningBanner(cachedTimestamp || snapshot.timestamp);
    htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', bannerHtml);
  } else {
    htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', '');
  }

  // Write outputs to accounts/combined.json & accounts/combined.html
  const jsonPath = path.join(accountsDir, 'combined.json');
  const htmlPath = path.join(accountsDir, 'combined.html');
  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  // Also write top-level in outDir for convenience
  fs.writeFileSync(path.join(outDir, 'combined.json'), jsonContent, 'utf8');
  fs.writeFileSync(path.join(outDir, 'combined.html'), htmlContent, 'utf8');

  // 6. Verify artifact pair with Universal Verification Harness
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
    process.stdout.write('\n📊 Combined Portfolio AccountHoldingsSnapshot Generated:\n');
    process.stdout.write(`   • Total Market Value:   ₹${s.total_current_value.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Total Invested Cost:  ₹${s.total_invested.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Unrealized P&L:       ${s.unrealized_pnl >= 0 ? '+' : ''}₹${s.unrealized_pnl.toLocaleString('en-IN')} (${s.unrealized_pnl_pct.toFixed(2)}%)\n`);
    process.stdout.write(`   • Pooled Cash:          ₹${s.available_cash.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Total Account Equity: ₹${s.total_account_equity.toLocaleString('en-IN')}\n`);
    process.stdout.write(`   • Total Holdings Count: ${s.holdings_count}\n`);
    process.stdout.write(`   • FX Conversion Rate:   1 USD = ₹${fxRate.toFixed(2)}\n\n`);
    process.stdout.write(`✅ Combined Artifacts written and verified:\n`);
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
  combineSnapshots,
  main,
  parseArgs
};
