#!/usr/bin/env node
'use strict';

/**
 * evaluate_pe.js: Evaluates P/E Multiple vs. Industry Average, Historical Range, and PEG Ratio.
 * Formula based on Digital Buffett financial tools (analyze_pe_ratio).
 * Completely independent evaluation engine. Emits standard JSON evaluation.
 */

const fs = require('fs');
const path = require('path');

const INDEX_ETF_TICKERS = new Set(['VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM']);

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function analyzePERatio(currentPe, industryAvgPe, historicalPeRange, earningsGrowthRate) {
  if (!isFiniteNumber(currentPe) || currentPe <= 0) return null;

  const range = (Array.isArray(historicalPeRange) && historicalPeRange.length >= 2)
    ? historicalPeRange
    : [15, 25];

  const historicalMin = Math.min(...range);
  const historicalMax = Math.max(...range);
  const historicalAvg = round2((historicalMin + historicalMax) / 2);

  const indPe = isFiniteNumber(industryAvgPe) && industryAvgPe > 0 ? industryAvgPe : historicalAvg;

  let pegRatio = null;
  if (isFiniteNumber(earningsGrowthRate) && earningsGrowthRate > 0) {
    pegRatio = round2(currentPe / (earningsGrowthRate * 100));
  }

  let valuationSignal = 'NEUTRAL';
  let score = 50;
  let status = 'WARN';

  if (currentPe < historicalMin * 0.8) {
    valuationSignal = 'UNDERVALUED';
    score = 100;
    status = 'PASS';
  } else if (currentPe > historicalMax * 1.2) {
    valuationSignal = 'OVERVALUED';
    score = 0;
    status = 'FAIL';
  } else if (currentPe < indPe * 0.9) {
    valuationSignal = 'ATTRACTIVE';
    score = 80;
    status = 'PASS';
  } else if (currentPe > indPe * 1.1) {
    valuationSignal = 'EXPENSIVE';
    score = 30;
    status = 'WARN';
  } else {
    valuationSignal = 'NEUTRAL';
    score = 50;
    status = 'PASS';
  }

  const relativeToIndustry = round2(((currentPe / indPe) - 1) * 100);
  const relativeToHistory = round2(((currentPe / historicalAvg) - 1) * 100);

  return {
    currentPe: round2(currentPe),
    industryAvgPe: round2(indPe),
    historicalMin,
    historicalMax,
    historicalAvg,
    pegRatio,
    valuationSignal,
    score,
    status,
    relativeToIndustry,
    relativeToHistory
  };
}

function evaluatePE(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluatePE requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'pe-relative',
      name: 'P/E Multiple Relative Valuation & PEG',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        current_pe: null,
        industry_avg_pe: null,
        peg_ratio: null,
        relative_to_industry_pct: null
      },
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-stock P/E multiple screening.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};

  const currentPe = isFiniteNumber(marketData.pe_ttm)
    ? Number(marketData.pe_ttm)
    : (isFiniteNumber(marketData.pe) ? Number(marketData.pe) : (isFiniteNumber(marketData.pe_ratio) ? Number(marketData.pe_ratio) : null));

  const industryAvgPe = isFiniteNumber(marketData.sector_pe)
    ? Number(marketData.sector_pe)
    : (isFiniteNumber(marketData.industry_pe) ? Number(marketData.industry_pe) : 24.0);

  const historicalPeRange = marketData.historical_pe_range || [18, 30];

  let growthRate = 0.10;
  if (isFiniteNumber(marketData.eps_growth_5y_cagr_pct) && marketData.eps_growth_5y_cagr_pct > 0) {
    growthRate = marketData.eps_growth_5y_cagr_pct / 100;
  } else if (financials.growth_metrics && isFiniteNumber(financials.growth_metrics.net_income_growth)) {
    growthRate = financials.growth_metrics.net_income_growth;
  }

  const res = analyzePERatio(currentPe, industryAvgPe, historicalPeRange, growthRate);

  const observations = [];
  if (res) {
    if (res.valuationSignal === 'UNDERVALUED' || res.valuationSignal === 'ATTRACTIVE') {
      observations.push(`Favorable multiple: P/E of ${res.currentPe} is ${Math.abs(res.relativeToIndustry)}% below industry average (${res.industryAvgPe}x).`);
    } else if (res.valuationSignal === 'EXPENSIVE' || res.valuationSignal === 'OVERVALUED') {
      observations.push(`Stretched multiple: P/E of ${res.currentPe} trades at a ${res.relativeToIndustry}% premium to industry peers.`);
    } else {
      observations.push(`Fair multiple: P/E of ${res.currentPe} is in line with historical norms and industry average.`);
    }

    if (res.pegRatio !== null) {
      if (res.pegRatio < 1.0) {
        observations.push(`Attractive PEG ratio of ${res.pegRatio} indicates earnings growth outpaces valuation multiple.`);
      } else if (res.pegRatio > 2.0) {
        observations.push(`Elevated PEG ratio of ${res.pegRatio} indicates high multiple relative to expected growth.`);
      }
    }
  } else {
    observations.push('Zero, negative, or missing P/E ratio precludes relative valuation analysis.');
  }

  return {
    principle: 'pe-relative',
    name: 'P/E Multiple Relative Valuation & PEG',
    ticker,
    status: res ? res.status : 'FAIL',
    score: res ? res.score : 0,
    classification: res ? res.valuationSignal : 'Indeterminable P/E',
    metrics: res ? {
      current_pe: res.currentPe,
      industry_avg_pe: res.industryAvgPe,
      historical_min: res.historicalMin,
      historical_max: res.historicalMax,
      historical_avg: res.historicalAvg,
      peg_ratio: res.pegRatio,
      relative_to_industry_pct: res.relativeToIndustry,
      relative_to_history_pct: res.relativeToHistory
    } : null,
    summary: res ? `${res.status} (${res.valuationSignal}): P/E of ${res.currentPe}x vs Industry ${res.industryAvgPe}x (PEG: ${res.pegRatio || 'N/A'}).` : 'P/E ratio unavailable',
    observations
  };
}

function resolveFinancials(options) {
  if (options.data && fs.existsSync(options.data)) {
    return JSON.parse(fs.readFileSync(options.data, 'utf8'));
  }
  if (options.ticker) {
    const clean = options.ticker.toUpperCase();
    const reportsDir = path.resolve(process.cwd(), 'reports', 'financials');
    const cand = path.join(reportsDir, `${clean}.json`);
    if (fs.existsSync(cand)) {
      return JSON.parse(fs.readFileSync(cand, 'utf8'));
    }
  }
  throw new Error('Please provide --data <path-to-financials.json> or an existing --ticker <TICKER>');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) options.data = args[++i];
    else if (args[i] === '--ticker' && args[i + 1]) options.ticker = args[++i];
  }

  try {
    const fin = resolveFinancials(options);
    const evaluation = evaluatePE(fin);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating P/E ratio:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluatePE, analyzePERatio };
