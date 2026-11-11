#!/usr/bin/env node
'use strict';

/**
 * evaluate_margin_of_safety.js: Evaluates Warren Buffett's Margin of Safety & Owner Earnings Yield.
 * Formula: Owner Earnings Yield = (True Owner Earnings / Market Cap) * 100.
 * Completely independent evaluation engine. Emits standard JSON evaluation.
 */

const fs = require('fs');
const path = require('path');

const INDEX_ETF_TICKERS = new Set(['VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM']);
const KNOWN_US_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'AMD', 'INTC', 'CSCO', 'ADBE', 'NFLX', 'AVGO', 'CRM', 'ORCL',
  'DIS', 'KO', 'PEP', 'PG', 'COST', 'WMT', 'JNJ', 'UNH', 'LLY',
  'V', 'MA', 'JPM', 'BAC', 'GS', 'VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP'
]);

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function calculateOwnerEarnings(operatingCashFlow, capitalExpenditure, maintenanceCapEx, stockBasedComp = 0) {
  const ocf = isFiniteNumber(operatingCashFlow) ? Number(operatingCashFlow) : 0;
  const capex = (isFiniteNumber(maintenanceCapEx) && maintenanceCapEx > 0)
    ? Number(maintenanceCapEx)
    : Math.abs(isFiniteNumber(capitalExpenditure) ? Number(capitalExpenditure) : 0);
  const sbc = Math.abs(isFiniteNumber(stockBasedComp) ? Number(stockBasedComp) : 0);

  return round2(ocf - capex - sbc);
}

function evaluateMarginOfSafety(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateMarginOfSafety requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'margin-of-safety',
      name: 'Margin of Safety & Valuation Yield',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        market_cap: null,
        true_owner_earnings: null,
        owner_earnings_yield_pct: null
      },
      checks: [
        {
          name: 'Broad-Market Valuation Multiple',
          criterion: 'Passive Index Basket',
          actual: 'Full Basket',
          status: 'PASS',
          details: 'Passive ETF automatically diversifies across constituent holdings'
        }
      ],
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-company valuation multiple hurdles.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const marketData = financials.market_data || {};
  const cashFlow = financials.cash_flow || {};

  const marketCap = isFiniteNumber(marketData.market_cap) ? Number(marketData.market_cap) : null;
  const ocf = isFiniteNumber(cashFlow.operating_cash_flow) ? Number(cashFlow.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cashFlow.capital_expenditure) ? Number(cashFlow.capital_expenditure) : 0;
  const maintCapex = isFiniteNumber(cashFlow.maintenance_capex) ? Number(cashFlow.maintenance_capex) : null;
  const sbc = isFiniteNumber(cashFlow.stock_based_compensation) ? Number(cashFlow.stock_based_compensation) : 0;

  const trueOE = calculateOwnerEarnings(ocf, capex, maintCapex, sbc);

  let yieldPct = null;
  if (marketCap && marketCap > 0 && isFiniteNumber(trueOE)) {
    yieldPct = round2((trueOE / marketCap) * 100);
  }

  let score = 0;
  let status = 'FAIL';
  let classification = 'Negative or Indeterminable Cash Yield';
  const observations = [];

  if (yieldPct !== null) {
    if (yieldPct >= 6.0) {
      score = 100;
      status = 'PASS';
      classification = 'Wide Margin of Safety';
      observations.push(`Wide margin of safety: Owner Earnings Yield of ${yieldPct}% exceeds the 6.0% hurdle rate comfortably.`);
    } else if (yieldPct >= 4.0) {
      score = 65;
      status = 'PASS';
      classification = 'Fair Value / Adequate Margin';
      observations.push(`Adequate margin of safety: Owner Earnings Yield of ${yieldPct}% clears the 4.0% benchmark.`);
    } else if (yieldPct >= 2.0) {
      score = 35;
      status = 'WARN';
      classification = 'Narrow Margin of Safety';
      observations.push(`Compressed Owner Earnings Yield (${yieldPct}% < 4.0%) reflects a premium valuation multiple with limited downside buffer.`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Stretched Valuation Multiple';
      observations.push(`Stretched valuation: Owner Earnings Yield of ${yieldPct}% is below 2.0%, leaving no margin of safety for operational hiccups.`);
    }
  } else {
    observations.push('Zero, negative, or indeterminable Owner Earnings Yield precludes valuation multiple support.');
  }

  const checks = [
    {
      name: 'Valuation & Owner Earnings Yield',
      criterion: 'Owner Earnings Yield >= 4.0% (Strong >= 6.0%)',
      actual: yieldPct !== null ? `${yieldPct}%` : 'N/A',
      status,
      details: yieldPct !== null
        ? `Owner Earnings Yield of ${yieldPct}% on market capitalization`
        : 'Owner Earnings Yield unavailable'
    }
  ];

  return {
    principle: 'margin-of-safety',
    name: 'Margin of Safety & Valuation Yield',
    ticker,
    status,
    score,
    classification,
    metrics: {
      market_cap: marketCap,
      true_owner_earnings: trueOE,
      owner_earnings_yield_pct: yieldPct
    },
    checks,
    summary: `${status} (${classification}): Owner Earnings Yield of ${yieldPct !== null ? yieldPct + '%' : 'N/A'}.`,
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
    const evaluation = evaluateMarginOfSafety(fin);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating margin of safety:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluateMarginOfSafety, calculateOwnerEarnings };

