'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, SKILL_ROOT } = require('../scripts/lib/config');
const { scorePortfolio } = require('../scripts/lib/score');
const { buildReport, renderHtml, writeReport, findLeaks, loadPrevious } = require('../scripts/lib/render');
const { parseArgs } = require('../scripts/analyze_lts_holdings');

const cfg = loadConfig(path.join(SKILL_ROOT, 'config', 'lts.config.json'));
const TOKEN = 'tok_SuperSecretAccessToken123';

function sample() {
  const rec = (t, sector, w, ret) => ({
    sid: t, ticker: t, name: t + ' </script><b>x</b> Ltd', sector, quantity: 2, averagePrice: 100, investedValue: 200, currentValue: 250, pnl: 50, returnPct: ret, weight: w,
    price: 125, high52: 150, low52: 90, dayChange: 1, dayChangePct: 0.8, dataAsOf: '2026-10-19', partial: t === 'B', warnings: t === 'B' ? ['Scorecard unavailable'] : [],
    metrics: { ttmPe: 20, indpe: 25, erqr: 70, upside: 10, breco: 60 },
    scorecard: [{ name: 'Valuation', tag: 'Fair', value: 6, colour: 'yellow' }], checklists: [],
    // fields that must never reach the output:
    access_token: TOKEN, brokerUserId: 'AABY455797', raw: { token: TOKEN }
  });
  return scorePortfolio([rec('A', 'IT', 10, 25), rec('B', 'Health', 20, -5)], cfg);
}

test('report contains hero data, sectors, holdings and a disclaimer', () => {
  const r = buildReport(sample(), cfg);
  assert.strictEqual(r.holdings.length, 2);
  assert.ok(r.summary.invested > 0 && r.summary.dataAsOf);
  assert.ok(r.sectors.length === 2);
  assert.ok(/not investment advice/i.test(r.meta.disclaimer));
  assert.strictEqual(r.meta.partialCount, 1);
});

test('no unlisted fields (tokens, broker ids) are embedded', () => {
  const r = buildReport(sample(), cfg);
  const s = JSON.stringify(r);
  assert.ok(!s.includes(TOKEN));
  assert.ok(!s.includes('AABY455797'));
});

test('html is self-contained: no external resources, escaped data, methodology and disclaimer', () => {
  const html = renderHtml(buildReport(sample(), cfg));
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html));
  assert.ok(/not investment advice/i.test(html));
  assert.ok(/Methodology/i.test(html));
  assert.ok(html.includes('data-theme="dark"'));
  assert.ok(html.includes('@media print'));
  // a "</script>" inside holding names must not terminate the script block
  assert.ok(!html.includes('</script><b>x'));
  assert.ok(!html.includes('/*__DATA__*/null'));
});

test('writeReport writes html and json side by side and refuses to leak credentials', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lts-out-'));
  const r = buildReport(sample(), cfg);
  const { htmlPath, jsonPath } = writeReport(r, dir, { secrets: [TOKEN], date: '2026-10-20' });
  assert.ok(path.basename(htmlPath) === 'analyze-lts-holdings.html');
  assert.ok(path.basename(jsonPath) === 'analyze-lts-holdings.json');
  assert.ok(fs.existsSync(htmlPath) && fs.existsSync(jsonPath));
  assert.ok(findLeaks(fs.readFileSync(htmlPath, 'utf8') + fs.readFileSync(jsonPath, 'utf8'), [TOKEN, 'AABY455797']).length === 0);
  // a leak is detected
  const bad = { ...r, meta: { ...r.meta, note: TOKEN } };
  assert.throws(() => writeReport(bad, dir, { secrets: [TOKEN], date: '2026-10-21' }), /credential/i);
});

test('loadPrevious reads the latest earlier report for hysteresis', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lts-prev-'));
  const r = buildReport(sample(), cfg);
  writeReport(r, dir, { date: '2026-10-19' });
  const prev = loadPrevious(dir, '2026-10-20');
  assert.ok(prev.A && prev.A.verdict);
});

test('CLI argument parsing and unsupported broker flags', () => {
  const a = parseArgs(['--broker', 'angelone', '--out', 'reports/', '--refresh', '--only', 'infy', '--skip-reports']);
  assert.deepStrictEqual([a.broker, a.out, a.refresh, a.only, a.skipReports], ['angelone', 'reports/', true, 'INFY', true]);
  assert.strictEqual(parseArgs(['--broker', 'kite']).broker, 'kite');
  assert.throws(() => parseArgs(['--nope']));
});

test('fundamentalReport field is preserved in report and rendered in html', () => {
  const hList = sample();
  hList[0].fundamentalReport = {
    relativeHtmlPath: 'fundamentals/A.html',
    relativeMdPath: 'fundamentals/A.md',
    valuation: { ownerEarnings: 1500, roe: 28.5, grahamNumber: 350.2, netDebtToEbitda: -0.5 }
  };
  const rep = buildReport(hList, cfg);
  assert.ok(rep.holdings[0].fundamentalReport);
  assert.strictEqual(rep.holdings[0].fundamentalReport.relativeHtmlPath, 'fundamentals/A.html');
  const html = renderHtml(rep);
  assert.ok(html.includes('fundamentals/A.html'));
  assert.ok(html.includes('Fundamental Valuation Audit'));
});

