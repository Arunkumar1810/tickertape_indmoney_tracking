'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pool, createCache, enrichAll, fetchHoldings, withRetry } = require('../scripts/lib/fetch');
const { createClient, AuthError } = require('../scripts/lib/client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('pool never exceeds concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  await pool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(10);
    active--;
  });
  assert.strictEqual(peak, 3);
});

function fakeClient(counts, { failSid } = {}) {
  return {
    async call(name, args) {
      counts[name] = (counts[name] || 0) + 1;
      const sid = args.sid || (args.sids && args.sids[0]);
      if (failSid && sid === failSid) throw new Error('boom');
      switch (name) {
        case 'in_screen_stocks_read': return { results: [{ sid, metrics: { ttmPe: 20, indpe: 25 } }] };
        case 'in_stock_analysis_read': return { scorecard: [{ name: 'Valuation', tag: 'Fair', score: { value: 6 }, colour: 'yellow' }], checklists: [] };
        case 'in_stock_overview_read': return { quotes: [{ sid, price: 100, close: 98, change: 2, date: '2026-10-19' }], highLow: [{ sid, high: 120, low: 80 }] };
        case 'in_stock_ownership_read': return { peers: [{ sid: 'X', ratios: { ttmPe: 18 } }] };
        default: throw new Error('unexpected ' + name);
      }
    }
  };
}

const recs = [{ sid: 'A', ticker: 'A' }, { sid: 'B', ticker: 'B' }];

test('same-day rerun makes no enrichment calls; --refresh refetches', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lts-cache-'));
  const cache = createCache(dir, '2026-10-20');
  const c1 = {};
  await enrichAll(fakeClient(c1), recs, { cache, concurrency: 3 });
  assert.ok(Object.values(c1).reduce((a, b) => a + b, 0) > 0);
  const c2 = {};
  const out = await enrichAll(fakeClient(c2), recs, { cache, concurrency: 3 });
  assert.deepStrictEqual(c2, {});
  assert.ok(out.every((r) => r.fromCache));
  const c3 = {};
  await enrichAll(fakeClient(c3), recs, { cache, refresh: true, concurrency: 3 });
  assert.ok(Object.values(c3).reduce((a, b) => a + b, 0) > 0);
});

test('a failing ticker yields a partial record and the run continues', async () => {
  const out = await enrichAll(fakeClient({}, { failSid: 'A' }), recs, { concurrency: 3 });
  const a = out.find((r) => r.sid === 'A');
  const b = out.find((r) => r.sid === 'B');
  assert.strictEqual(a.partial, true);
  assert.ok(a.warnings.length > 0);
  assert.strictEqual(b.partial, false);
  assert.strictEqual(b.price, 100);
});

test('partial results are not cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lts-cache-'));
  const cache = createCache(dir, '2026-10-20');
  await enrichAll(fakeClient({}, { failSid: 'A' }), recs, { cache });
  assert.strictEqual(cache.get('A'), null);
  assert.ok(cache.get('B'));
});

test('fetchHoldings filters to the Angel One broker only', async () => {
  const seen = [];
  const client = {
    async call(name, args) {
      seen.push([name, args]);
      if (name === 'pf_user_brokers_read') return { stockBrokers: [{ id: 'k1', brokerName: 'kite' }, { id: 'a1', brokerName: 'angelbroking', brokerUserId: 'SECRETID' }] };
      if (name === 'pf_stocks_holdings_read') return { securities: [{ sid: 'INFY', ticker: 'INFY', name: 'Infosys', sector: 'IT', quantity: 5, averagePrice: 100 }] };
      if (name === 'pf_stocks_performance_detail_read') return { securities: [{ sid: 'INFY', investedValue: 500, currentValue: 600, pnl: 100, returnPct: 20, weight: 100 }] };
      return { totalInvested: 500, totalCurrent: 600, totalPnl: 100, totalReturnPct: 20 };
    }
  };
  const { records } = await fetchHoldings(client);
  assert.strictEqual(records.length, 1);
  assert.ok(seen.filter(([n]) => n.startsWith('pf_stocks')).every(([, a]) => a.gatewayId === 'a1'));
  assert.ok(!JSON.stringify(records).includes('SECRETID'));
});

test('withRetry retries then succeeds', async () => {
  let n = 0;
  const v = await withRetry(async () => { if (++n < 2) throw new Error('x'); return 'ok'; }, 2, 1);
  assert.strictEqual(v, 'ok');
});

test('client refreshes once on 401 then retries', async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url, init) => {
    calls++;
    const auth = init.headers.Authorization;
    if (auth === 'Bearer old') return { status: 401, text: async () => '' };
    return { status: 200, text: async () => 'data: ' + JSON.stringify({ result: { content: [{ type: 'text', text: '{"ok":true}' }] } }) };
  };
  let refreshed = 0;
  const svc = {
    getValidToken: async () => ({ creds: {}, token: 'old' }),
    loadTokens: () => ({ refresh_token: 'r' }),
    refreshToken: async () => { refreshed++; return { access_token: 'new' }; },
    performOAuthLogin: async () => { throw new Error('should not login'); }
  };
  try {
    const c = createClient({ service: svc });
    const r = await c.call('t', {});
    assert.deepStrictEqual(r, { ok: true });
    assert.strictEqual(refreshed, 1);
    assert.strictEqual(calls, 2);
  } finally {
    global.fetch = realFetch;
  }
});

test('client falls back to login when refresh fails', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url, init) => init.headers.Authorization === 'Bearer old'
    ? { status: 401, text: async () => '' }
    : { status: 200, text: async () => JSON.stringify({ result: { content: [{ type: 'text', text: '{"ok":1}' }] } }) };
  let loggedIn = 0;
  const svc = {
    getValidToken: async () => ({ creds: {}, token: 'old' }),
    loadTokens: () => null,
    refreshToken: async () => null,
    performOAuthLogin: async () => { loggedIn++; return { access_token: 'fresh' }; }
  };
  try {
    const r = await createClient({ service: svc }).call('t', {});
    assert.deepStrictEqual(r, { ok: 1 });
    assert.strictEqual(loggedIn, 1);
  } finally {
    global.fetch = realFetch;
  }
});
