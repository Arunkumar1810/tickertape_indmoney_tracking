'use strict';
const fs = require('fs');
const path = require('path');

/** Run `worker(item)` over items with at most `limit` in flight. Preserves order. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
}

const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

function createCache(dir, date) {
  const day = path.join(dir, date || todayStr());
  const file = (sid) => path.join(day, `${String(sid).replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
  return {
    get(sid) {
      try {
        return JSON.parse(fs.readFileSync(file(sid), 'utf8'));
      } catch (e) {
        return null;
      }
    },
    set(sid, value) {
      fs.mkdirSync(day, { recursive: true });
      fs.writeFileSync(file(sid), JSON.stringify(value));
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, tries = 2, delayMs = 400) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const TICKERTAPE_SID_MAP = {
  INFY: 'INFY',
  ITC: 'ITC',
  ZYDUSLIFE: 'CADI',
  NATCOPHARM: 'NATP',
  HDFCBANK: 'HDBK',
  SOUTHBANK: 'SIBK',
  TCS: 'TCS',
  WIPRO: 'WIPR',
  HCLTECH: 'HCLT'
};

const COMPANY_NAMES = {
  INFY: 'Infosys Ltd',
  ITC: 'ITC Ltd',
  ZYDUSLIFE: 'Zydus Lifesciences Ltd',
  NATCOPHARM: 'Natco Pharma Ltd',
  HDFCBANK: 'HDFC Bank Ltd',
  SOUTHBANK: 'South Indian Bank Ltd',
  TCS: 'Tata Consultancy Services Ltd',
  WIPRO: 'WIPRO Ltd',
  HCLTECH: 'HCL Technologies Ltd'
};

const SECTOR_MAP = {
  INFY: 'Information Technology',
  TCS: 'Information Technology',
  WIPRO: 'Information Technology',
  HCLTECH: 'Information Technology',
  ITC: 'Consumer Staples',
  ZYDUSLIFE: 'Healthcare',
  NATCOPHARM: 'Healthcare',
  HDFCBANK: 'Financial Services',
  SOUTHBANK: 'Financial Services'
};

const SCREEN_FIELDS = ['ttmPe', 'apef', 'indpe', 'fundamental', 'erqr', 'ptir', 'upside', 'nBreco', 'breco', 'totalAnalysts'];

/** Fetch enrichment for one ticker. Each sub-call is independent so failures only degrade the card. */
async function enrichOne(client, sid) {
  const out = { metrics: {}, scorecard: [], checklists: [], warnings: [] };
  const attempt = async (label, fn) => {
    try {
      await withRetry(fn);
    } catch (e) {
      out.warnings.push(`${label} unavailable`);
    }
  };

  await attempt('Screener metrics', async () => {
    const r = await client.call('in_screen_stocks_read', { sids: [sid], project: SCREEN_FIELDS, limit: 1 });
    const row = ((r && r.results) || []).find((x) => x.sid === sid) || (r && r.results && r.results[0]);
    if (!row) throw new Error('no row');
    out.metrics = { ...(row.metrics || {}) };
    if (row.sector) out.screenerSector = row.sector;
  });

  await attempt('Scorecard', async () => {
    const r = await client.call('in_stock_analysis_read', { sid, sections: ['checklists', 'scorecard'], checklistType: 'basic' });
    out.scorecard = ((r && r.scorecard) || []).map((s) => ({
      name: s.name,
      tag: s.tag,
      value: s.score && num(s.score.value),
      colour: s.colour
    }));
    out.checklists = ((r && r.checklists) || []).map((c) => ({ icid: c.icid, title: c.title, state: c.state, description: c.description }));
    if (!out.scorecard.length && !out.checklists.length) throw new Error('empty');
  });

  await attempt('Quote and 52-week range', async () => {
    const r = await client.call('in_stock_overview_read', { sids: [sid] });
    const q = ((r && r.quotes) || []).find((x) => x.sid === sid) || (r && r.quotes && r.quotes[0]);
    const hl = ((r && r.highLow) || []).find((x) => x.sid === sid) || (r && r.highLow && r.highLow[0]);
    if (!q) throw new Error('no quote');
    out.price = num(q.price);
    out.close = num(q.close);
    out.change = num(q.change);
    out.quoteDate = q.date;
    if (hl) {
      out.high52 = num(hl.high);
      out.low52 = num(hl.low);
    }
  });

  await attempt('Peer valuation', async () => {
    const r = await client.call('in_stock_ownership_read', { sid, sections: ['peers'], peerType: 'valuation' });
    const valid = ((r && r.peers) || []).filter((p) => p.sid !== sid && p.ratios && p.ratios.ttmPe > 0);
    if (!valid.length) throw new Error('no peers');
    out.metrics.peerMeanPe = valid.reduce((a, p) => a + p.ratios.ttmPe, 0) / valid.length;
  });

  out.fetchedAt = new Date().toISOString();
  return out;
}

/** Enrich all holdings with cache, bounded concurrency, and fail-soft behaviour. */
async function enrichAll(client, records, { cache, refresh, concurrency = 3, onProgress = () => {} } = {}) {
  return pool(records, concurrency, async (rec) => {
    const sid = TICKERTAPE_SID_MAP[rec.ticker] || rec.sid || rec.ticker;
    let e = !refresh && cache ? cache.get(sid) : null;
    let fromCache = !!e;
    if (!e) {
      try {
        e = await enrichOne(client, sid);
      } catch (err) {
        e = { metrics: {}, scorecard: [], checklists: [], warnings: ['Enrichment failed'], fetchedAt: new Date().toISOString() };
      }
      if (cache && !e.warnings.length) cache.set(sid, e);
    }
    onProgress(rec.ticker, fromCache, e.warnings);
    const price = e.price ?? rec.last_price ?? rec.price ?? null;
    return {
      ...rec,
      sid,
      name: rec.name && rec.name !== rec.ticker ? rec.name : (COMPANY_NAMES[rec.ticker] || rec.name || rec.ticker),
      sector: rec.sector || e.screenerSector || SECTOR_MAP[rec.ticker] || 'Other',
      price,
      high52: e.high52 ?? null,
      low52: e.low52 ?? null,
      dayChange: e.change ?? null,
      dayChangePct: e.close ? ((e.change ?? 0) / e.close) * 100 : null,
      metrics: e.metrics || {},
      scorecard: e.scorecard || [],
      checklists: e.checklists || [],
      dataAsOf: e.quoteDate || e.fetchedAt,
      fromCache,
      partial: (e.warnings || []).length > 0,
      warnings: e.warnings || []
    };
  });
}

module.exports = {
  pool,
  createCache,
  withRetry,
  enrichOne,
  enrichAll,
  todayStr,
  TICKERTAPE_SID_MAP,
  COMPANY_NAMES,
  SECTOR_MAP
};
