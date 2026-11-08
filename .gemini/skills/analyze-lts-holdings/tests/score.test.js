'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadConfig, SKILL_ROOT } = require('../scripts/lib/config');
const { scorePortfolio, flagsFor, confidence } = require('../scripts/lib/score');

const cfg = loadConfig(path.join(SKILL_ROOT, 'config', 'lts.config.json'));

function parseTool(r) {
  return JSON.parse(r.content[0].text);
}

/** Build an enriched record for INFY from the repo's test_infy.json fixture. */
function infyRecord(over = {}) {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'test_infy.json'), 'utf8'));
  const a = parseTool(fx.analysis);
  const o = parseTool(fx.overview);
  const x = parseTool(fx.extras);
  return {
    sid: 'INFY', ticker: 'INFY', name: 'Infosys Limited', sector: 'Information Technology', quantity: 5, averagePrice: 1042.99,
    investedValue: 5214.95, currentValue: 5640, pnl: 425, returnPct: 8.15, weight: 10,
    price: o.quotes[0].price, high52: o.highLow[0].high, low52: o.highLow[0].low,
    metrics: { ttmPe: 15.5, indpe: 22, erqr: 60, upside: x.upside, breco: 50 },
    scorecard: a.scorecard.map((s) => ({ name: s.name, tag: s.tag, value: s.score && s.score.value, colour: s.colour })),
    checklists: (a.checklists || []).map((c) => ({ icid: c.icid, title: c.title, state: c.state, description: c.description })),
    ...over
  };
}

const strong = (over = {}) => ({
  sid: 'GOOD', ticker: 'GOOD', name: 'Good Co', sector: 'Tech', quantity: 1, averagePrice: 100, investedValue: 100, currentValue: 150, returnPct: 50, weight: 5,
  price: 150, high52: 200, low52: 100,
  metrics: { ttmPe: 15, indpe: 25, erqr: 90, upside: 25, breco: 90 },
  scorecard: ['Profitability', 'Growth', 'Valuation', 'Performance', 'Entry point'].map((n) => ({ name: n, tag: 'High', value: 8.5, colour: 'green' }))
    .concat([{ name: 'Red flags', tag: 'Low', value: 8, colour: 'green' }]),
  checklists: [{ icid: 'IC001', title: 'Intrinsic value', state: 'checked' }],
  ...over
});

test('scores are produced for each dimension from the INFY fixture', () => {
  const [h] = scorePortfolio([infyRecord()], cfg);
  for (const k of ['quality', 'valuation', 'momentum', 'analyst', 'risk']) assert.ok(typeof h.scores[k] === 'number', k);
  assert.ok(['Accumulate', 'Hold', 'Trim', 'Review', 'Exit'].includes(h.verdict));
  assert.ok(h.reason.length > 5);
});

test('every verdict lists 1-3 triggering metrics with values', () => {
  const [h] = scorePortfolio([infyRecord()], cfg);
  assert.ok(h.triggers.length >= 1 && h.triggers.length <= 3);
  h.triggers.forEach((t) => assert.ok(t.label && t.value !== undefined));
});

test('strong cheap stock is Accumulate', () => {
  const [h] = scorePortfolio([strong()], cfg);
  assert.strictEqual(h.verdict, 'Accumulate');
});

test('missing metrics are unavailable and reduce confidence', () => {
  const [full] = scorePortfolio([strong()], cfg);
  const [half] = scorePortfolio([strong({ metrics: {}, scorecard: [], checklists: [], high52: null, low52: null })], cfg);
  assert.strictEqual(half.scores.quality, null);
  assert.ok(half.confidence < full.confidence);
  assert.ok(half.confidence <= 15);
  assert.strictEqual(half.verdict, 'Review');
});

test('confidence approximates share of available metrics', () => {
  const c = confidence(strong({ scorecard: strong().scorecard.slice(0, 3) }));
  assert.ok(c > 0.5 && c < 1);
});

test('red flag detected from promoter + debt + margin checklist failures', () => {
  const rec = strong({
    checklists: [
      { title: 'Promoter holding', state: 'unchecked' },
      { title: 'Debt to equity', state: 'unchecked' },
      { title: 'Profit margin trend', state: 'unchecked' }
    ]
  });
  assert.ok(flagsFor(rec).some((f) => f.type === 'red'));
  const [h] = scorePortfolio([rec], cfg);
  assert.ok(h.flags.some((f) => f.type === 'red'));
  assert.notStrictEqual(h.verdict, 'Accumulate');
});

test('green flag detected', () => {
  const rec = strong({ checklists: [{ title: 'ROCE improving', state: 'checked' }, { title: 'Free cash flow positive', state: 'checked' }, { title: 'Debt is low', state: 'checked' }] });
  assert.ok(flagsFor(rec).some((f) => f.type === 'green'));
});

test('concentration warning when a stock is over the cap (18% > 15%)', () => {
  const [h] = scorePortfolio([strong({ weight: 18 })], cfg);
  assert.ok(h.concentration.some((c) => /18/.test(c)));
});

test('custom cap from config changes warnings', () => {
  const c2 = { ...cfg, caps: { ...cfg.caps, stockWeightPct: 10 } };
  const [a] = scorePortfolio([strong({ weight: 12 })], cfg);
  const [b] = scorePortfolio([strong({ weight: 12 })], c2);
  assert.strictEqual(a.concentration.filter((c) => /Position/.test(c)).length, 0);
  assert.strictEqual(b.concentration.filter((c) => /Position/.test(c)).length, 1);
});

test('Trim near one-year mark adds a tax-aware note', () => {
  const now = Date.parse('2026-10-20');
  const buyDate = '2025-11-20'; // ~334 days held -> ~31 days to LTCG
  const [h] = scorePortfolio([strong({ weight: 20, buyDate, metrics: { ttmPe: 20, indpe: 25, erqr: 40, upside: 0, breco: 40 }, scorecard: strong().scorecard.map((s) => ({ ...s, value: 5.5, colour: 'yellow' })) })], cfg, { now });
  assert.strictEqual(h.verdict, 'Trim');
  assert.ok(/long-term/i.test(h.reason));
  assert.ok(h.taxNote);
});

test('hysteresis keeps the previous verdict on small score moves', () => {
  const [base] = scorePortfolio([strong()], cfg);
  const [h] = scorePortfolio([strong()], cfg, { previous: { GOOD: { verdict: 'Hold', overall: base.overall - 2 } } });
  assert.strictEqual(h.verdict, 'Hold');
  assert.ok(/previous verdict/i.test(h.reason));
});

test('portfolio is sorted by action needed first', () => {
  const list = scorePortfolio([strong(), strong({ ticker: 'BAD', sid: 'BAD', metrics: {}, scorecard: [], checklists: [], high52: null, low52: null })], cfg);
  assert.strictEqual(list[0].ticker, 'BAD');
});
