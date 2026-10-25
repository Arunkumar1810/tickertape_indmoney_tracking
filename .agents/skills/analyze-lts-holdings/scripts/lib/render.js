'use strict';
const fs = require('fs');
const path = require('path');

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Whitelisted per-holding fields: nothing else (tokens, broker user ids, raw payloads) can reach the output. */
const HOLDING_FIELDS = [
  'ticker', 'name', 'sector', 'subSector', 'marketCap', 'quantity', 'averagePrice', 'investedValue', 'currentValue',
  'pnl', 'returnPct', 'weight', 'price', 'high52', 'low52', 'dayChange', 'dayChangePct', 'dataAsOf', 'partial',
  'warnings', 'scores', 'overall', 'verdict', 'reason', 'triggers', 'confidence', 'flags', 'concentration',
  'taxNote', 'grade', 'wouldBuyToday'
];

function pickHolding(h) {
  const out = {};
  for (const k of HOLDING_FIELDS) out[k] = h[k] === undefined ? null : h[k];
  out.metrics = {};
  for (const k of ['ttmPe', 'indpe', 'peerMeanPe', 'erqr', 'upside', 'breco', 'nBreco', 'totalAnalysts', 'fundamental']) {
    if (isNum((h.metrics || {})[k])) out.metrics[k] = h.metrics[k];
  }
  out.scorecard = (h.scorecard || []).map((s) => ({ name: s.name, tag: s.tag, value: s.value, colour: s.colour }));
  out.flags = (h.flags || []).map((f) => ({ type: f.type, label: f.label }));
  return out;
}

function buildReport(holdings, cfg, { summary, broker = 'angelone', now = new Date() } = {}) {
  const hs = holdings.map(pickHolding);
  const invested = hs.reduce((a, h) => a + (isNum(h.investedValue) ? h.investedValue : 0), 0);
  const current = hs.reduce((a, h) => a + (isNum(h.currentValue) ? h.currentValue : 0), 0);
  const pnl = current - invested;
  const dayChange = hs.some((h) => isNum(h.dayChange)) ? hs.reduce((a, h) => a + (isNum(h.dayChange) ? h.dayChange * h.quantity : 0), 0) : null;

  const secMap = {};
  for (const h of hs) {
    const s = h.sector || 'Unknown';
    secMap[s] = (secMap[s] || 0) + (isNum(h.currentValue) ? h.currentValue : 0);
  }
  const sectors = Object.entries(secMap)
    .map(([sector, value]) => ({ sector, value, weight: current > 0 ? (value / current) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
    .map((s) => ({ ...s, overCap: s.weight > cfg.caps.sectorWeightPct }));

  let hn = 0;
  let hd = 0;
  for (const h of hs) {
    if (isNum(h.overall)) {
      const w = isNum(h.weight) ? h.weight : 1;
      hn += h.overall * w;
      hd += w;
    }
  }
  const dates = hs.map((h) => h.dataAsOf).filter(Boolean).sort();

  return {
    meta: {
      generatedAt: now.toISOString(),
      broker,
      partialCount: hs.filter((h) => h.partial).length,
      disclaimer: 'Informational only; not investment advice.'
    },
    summary: {
      invested,
      current,
      pnl,
      returnPct: invested > 0 ? (pnl / invested) * 100 : null,
      dayChange,
      health: hd > 0 ? Math.round(hn / hd) : null,
      dataAsOf: dates.length ? dates[dates.length - 1] : null,
      brokerSummary: summary || null
    },
    sectors,
    queue: hs.filter((h) => h.verdict !== 'Hold' && h.verdict !== 'Accumulate').slice(0, 5).map((h) => ({ ticker: h.ticker, verdict: h.verdict, reason: h.reason })),
    holdings: hs,
    config: { weights: cfg.weights, thresholds: cfg.thresholds, caps: cfg.caps }
  };
}

function renderHtml(report, templatePath) {
  const tpl = fs.readFileSync(templatePath || path.join(__dirname, '..', '..', 'assets', 'report-template.html'), 'utf8');
  if (!tpl.includes('/*__DATA__*/null')) throw new Error('Template is missing the data placeholder');
  // Escape characters that could close the script block or break parsing.
  const json = JSON.stringify(report).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return tpl.replace('/*__DATA__*/null', () => json);
}

/** Return the secret values (>= 8 chars) found in the given text, so callers can refuse to write. */
function findLeaks(text, secrets) {
  return (secrets || []).filter((s) => typeof s === 'string' && s.length >= 8 && text.includes(s));
}

function writeReport(report, outDir, { templatePath, secrets = [], date } = {}) {
  const stamp = date || report.meta.generatedAt.slice(0, 10);
  const html = renderHtml(report, templatePath);
  const json = JSON.stringify(report, null, 2);
  const leaks = findLeaks(html, secrets).concat(findLeaks(json, secrets));
  if (leaks.length) throw new Error('Refusing to write report: credential values were found in the output.');
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'analyze-lts-holdings.html');
  const jsonPath = path.join(outDir, 'analyze-lts-holdings.json');
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(jsonPath, json);
  // Also write dated copy for history/hysteresis
  fs.writeFileSync(path.join(outDir, `analyze-lts-holdings-${stamp}.html`), html);
  fs.writeFileSync(path.join(outDir, `analyze-lts-holdings-${stamp}.json`), json);
  return { htmlPath, jsonPath };
}

/** Load verdict/overall from the most recent earlier report JSON in outDir (for hysteresis). */
function loadPrevious(outDir, beforeStamp) {
  try {
    const files = fs.readdirSync(outDir).filter((f) => /^(analyze-lts-holdings|fetch-lts)-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const prior = files.filter((f) => f.replace(/\.json$/, '').slice(-10) < beforeStamp).pop() || files.filter((f) => f.replace(/\.json$/, '').slice(-10) !== beforeStamp).pop();
    if (!prior) return {};
    const data = JSON.parse(fs.readFileSync(path.join(outDir, prior), 'utf8'));
    const map = {};
    for (const h of data.holdings || []) map[h.ticker] = { verdict: h.verdict, overall: h.overall };
    return map;
  } catch (e) {
    return {};
  }
}

module.exports = { buildReport, renderHtml, writeReport, findLeaks, loadPrevious, pickHolding, HOLDING_FIELDS };
