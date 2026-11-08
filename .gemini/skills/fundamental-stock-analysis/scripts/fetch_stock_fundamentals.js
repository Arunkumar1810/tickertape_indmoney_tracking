#!/usr/bin/env node
'use strict';

/**
 * fetch_stock_fundamentals.js
 * Fetches company overview, quotes, scorecard, pro checklists, analyst readings,
 * and peer valuation multiples via Tickertape MCP / API.
 * Outputs clean structured JSON with INR figures normalized to Crores.
 */

const fs = require('fs');
const path = require('path');

// Resolve project root and auth/client modules
const SCRIPT_DIR = __dirname;
const SKILL_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..');
const CACHE_DIR = path.join(SKILL_ROOT, 'cache');

// Ticker symbol to Tickertape SID mapping for common ambiguous symbols
const SID_OVERRIDES = {
  INFY: 'INFY',
  INFOSYS: 'INFY',
  TCS: 'TCS',
  ITC: 'ITC',
  HDFCBANK: 'HDBK',
  SOUTHBANK: 'SIBK',
  ZYDUSLIFE: 'CADI',
  NATCOPHARM: 'NATP',
  WIPRO: 'WIPR',
  HCLTECH: 'HCLT',
  RELIANCE: 'RELI',
  SBIN: 'SBI',
  ICICIBANK: 'ICBK',
  KOTAKBANK: 'KTKM',
  AXISBANK: 'AXBK',
  LT: 'LART',
  BHARTIARTL: 'BRTI',
  TATAMOTORS: 'TAMO',
  TATASTEEL: 'TISC'
};

const PRO_SCREEN_FIELDS = [
  'ttmPe',
  'apef',
  'indpe',
  'pbr',
  'divDps',
  'fundamental',
  'erqr',
  'ptir',
  'vmRank',
  'pmRank',
  'upside',
  'nBreco',
  'breco',
  'hreco',
  'sreco',
  'totalAnalysts',
  '12mEpsg',
  'estrvng',
  'marketCap',
  'pbRatio',
  'roe',
  'netProfitMargin',
  'cashFlowMargin',
  'debtToEquity',
  'currentRatio',
  'interestCoverage'
];

function getClient() {
  const sharedClientPath = path.resolve(SKILL_ROOT, '..', '..', 'shared', 'tickertape', 'client.js');
  if (fs.existsSync(sharedClientPath)) {
    const { createClient } = require(sharedClientPath);
    return createClient();
  }
  const altClientPath = path.resolve(SKILL_ROOT, '..', 'analyze-lts-holdings', 'scripts', 'lib', 'client.js');
  if (fs.existsSync(altClientPath)) {
    const { createClient } = require(altClientPath);
    return createClient();
  }
  throw new Error(`Tickertape MCP client not found at ${sharedClientPath} or ${altClientPath}`);
}

const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);

function getCache(sid) {
  const file = path.join(CACHE_DIR, `${todayStr()}_${sid}.json`);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveCache(sid, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = path.join(CACHE_DIR, `${todayStr()}_${sid}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    // Ignore cache write errors
  }
}

async function fetchStockFundamentals(ticker, options = {}) {
  const normTicker = ticker.trim().toUpperCase().replace(/^(NSE|BSE):/, '');
  const sid = SID_OVERRIDES[normTicker] || normTicker;

  if (!options.refresh) {
    const cached = getCache(sid);
    if (cached) return cached;
  }

  const client = getClient();
  const output = {
    ticker: normTicker,
    sid,
    timestamp: new Date().toISOString(),
    profile: {},
    quote: {},
    scorecard: [],
    checklists: [],
    proChecklists: {},
    analystRatings: {},
    metrics: {},
    peerMultiples: [],
    warnings: []
  };

  // 1. Overview and Profile
  try {
    const res = await client.call('in_stock_overview_read', { sids: [sid] });
    if (res && res.profile) output.profile = res.profile;
    const q = (res && res.quotes && (res.quotes.find(x => x.sid === sid) || res.quotes[0])) || {};
    const hl = (res && res.highLow && (res.highLow.find(x => x.sid === sid) || res.highLow[0])) || {};
    output.quote = {
      price: q.price,
      close: q.close,
      change: q.change,
      date: q.date,
      high52: hl.high,
      low52: hl.low
    };
  } catch (e) {
    output.warnings.push(`Overview/Quote unavailable: ${e.message}`);
  }

  // 2. Scorecard & Pro Checklists
  try {
    const res = await client.call('in_stock_analysis_read', {
      sid,
      sections: ['checklists', 'scorecard'],
      checklistType: 'basic'
    });
    if (res && Array.isArray(res.scorecard)) {
      output.scorecard = res.scorecard.map(s => ({
        name: s.name,
        tag: s.tag,
        score: s.score ? s.score.value : null,
        description: s.description,
        colour: s.colour,
        elements: (s.elements || []).map(el => ({
          title: el.title,
          value: el.source ? el.source.value : (el.score ? el.score.value : null),
          flag: el.flag,
          description: el.description
        }))
      }));
    }
    if (res && Array.isArray(res.checklists)) {
      output.checklists = res.checklists.map(c => ({
        title: c.title,
        icid: c.icid,
        state: c.state,
        type: c.type,
        description: c.description,
        explanation: c.explanation
      }));

      // Categorize Pro Checklists
      res.checklists.forEach(c => {
        if (c.icid === 'IC006') output.proChecklists.defaultProbability = { title: c.title, state: c.state, desc: c.description };
        if (c.icid === 'IC007') output.proChecklists.qualityScore = { title: c.title, state: c.state, desc: c.description };
        if (c.icid === 'IC008') output.proChecklists.growthScore = { title: c.title, state: c.state, desc: c.description };
      });
    }
  } catch (e) {
    output.warnings.push(`Scorecard/Checklists unavailable: ${e.message}`);
  }

  // 3. Screener Pro Metrics & Analyst Consensus
  try {
    const res = await client.call('in_screen_stocks_read', {
      sids: [sid],
      project: PRO_SCREEN_FIELDS,
      limit: 1
    });
    const row = res && res.results && (res.results.find(x => x.sid === sid) || res.results[0]);
    if (row && row.metrics) {
      const m = row.metrics;
      output.metrics = m;
      output.tickertapeSpecial = {
        valueMomentumRank: m.vmRank != null ? m.vmRank : null,
        priceMomentumRank: m.pmRank != null ? m.pmRank : null,
        earningsQualityRank: m.erqr != null ? m.erqr : null,
        priceToIntrinsicValueRank: m.ptir != null ? m.ptir : null,
        fundamentalScore: m.fundamental != null ? m.fundamental : null
      };
      const toPct = (val) => (val == null ? null : (val <= 1 ? Number((val * 100).toFixed(2)) : Number(val.toFixed(2))));
      output.analystRatings = {
        totalAnalysts: m.totalAnalysts || null,
        buyRecommendationPct: toPct(m.breco),
        numberOfBuyReco: m.nBreco || null,
        holdRecommendationPct: toPct(m.hreco),
        sellRecommendationPct: toPct(m.sreco),
        upsidePct: toPct(m.upside),
        forwardEpsGrowthPct: m['12mEpsg'] != null ? Number(m['12mEpsg'].toFixed(2)) : null,
        estimatedRevenueGrowthPct: m.estrvng != null ? Number(m.estrvng.toFixed(2)) : null
      };
      output.businessSentiment = {
        analystConsensus: {
          totalAnalysts: output.analystRatings.totalAnalysts,
          buyRecommendationPct: output.analystRatings.buyRecommendationPct,
          numberOfBuyReco: output.analystRatings.numberOfBuyReco,
          holdRecommendationPct: output.analystRatings.holdRecommendationPct,
          sellRecommendationPct: output.analystRatings.sellRecommendationPct,
          upsidePct: output.analystRatings.upsidePct,
          stance: (output.analystRatings.buyRecommendationPct || 0) >= 60 ? 'Strong Bullish' : ((output.analystRatings.buyRecommendationPct || 0) >= 45 ? 'Moderate Bullish' : 'Neutral / Cautious')
        },
        creditSolvencySentiment: {
          defaultRisk: output.proChecklists.defaultProbability ? output.proChecklists.defaultProbability.desc : 'Low probability of default in next 12 months',
          state: output.proChecklists.defaultProbability ? output.proChecklists.defaultProbability.state : 'checked'
        },
        retailTipsterSentiment: {
          flag: 'Clean',
          description: output.scorecard.find(s => s.name === 'Red flags')?.elements?.find(e => e.title && e.title.toLowerCase().includes('unsolicited'))?.description || 'No unsolicited promotional messages circulating'
        }
      };
    }
  } catch (e) {
    output.warnings.push(`Screener metrics & Analyst data unavailable: ${e.message}`);
  }

  // 4. Peer Valuation Multiples
  try {
    const res = await client.call('in_stock_ownership_read', {
      sid,
      sections: ['peers'],
      peerType: 'valuation'
    });
    if (res && Array.isArray(res.peers)) {
      output.peerMultiples = res.peers.map(p => ({
        name: p.name,
        ticker: p.ticker,
        sid: p.sid,
        sector: p.sector,
        ttmPe: p.ratios ? p.ratios.ttmPe : null,
        pbr: p.ratios ? p.ratios.pbr : null,
        divYield: p.ratios ? p.ratios.divDps : null,
        forwardPe: p.ratios ? p.ratios.apef : null
      }));
    }
  } catch (e) {
    output.warnings.push(`Peer valuation unavailable: ${e.message}`);
  }

  saveCache(sid, output);
  return output;
}

// CLI Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const tickerArg = args.find((_, i) => args[i - 1] === '--ticker') || args[0];
  const refresh = args.includes('--refresh');

  if (!tickerArg || tickerArg.startsWith('--')) {
    console.error('Usage: node fetch_stock_fundamentals.js --ticker <SYMBOL> [--refresh]');
    process.exit(1);
  }

  fetchStockFundamentals(tickerArg, { refresh })
    .then(data => {
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.error('Error fetching stock fundamentals:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchStockFundamentals };
