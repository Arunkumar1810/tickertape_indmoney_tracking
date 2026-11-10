#!/usr/bin/env node
'use strict';

/**
 * evaluate_dupont_roe.js: Evaluates Warren Buffett & Charlie Munger 5-Step DuPont ROE Decomposition.
 * Checks for operational profitability vs. artificial debt leverage.
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

function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function calculate5StepDuPont({ netIncome, ebt, ebit, revenue, totalAssets, totalEquity }) {
  if (
    !isFiniteNumber(netIncome) ||
    !isFiniteNumber(ebt) ||
    !isFiniteNumber(ebit) ||
    !isFiniteNumber(revenue) ||
    !isFiniteNumber(totalAssets) ||
    !isFiniteNumber(totalEquity) ||
    totalEquity <= 0 ||
    totalAssets <= 0 ||
    revenue <= 0 ||
    ebit <= 0 ||
    ebt <= 0
  ) {
    return null;
  }

  const taxBurden = round4(netIncome / ebt);
  const interestBurden = round4(ebt / ebit);
  const operatingMargin = round4(ebit / revenue);
  const assetTurnover = round4(revenue / totalAssets);
  const financialLeverage = round2(totalAssets / totalEquity);
  const roe = round2((netIncome / totalEquity) * 100);

  return {
    taxBurden,
    interestBurden,
    operatingMarginPct: round2(operatingMargin * 100),
    assetTurnover,
    financialLeverage,
    calculatedRoePct: roe
  };
}

function evaluateDuPontROE(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateDuPontROE requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'dupont-roe',
      name: '5-Step DuPont ROE Quality & Financial Leverage',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        roe_pct: null,
        tax_burden: null,
        interest_burden: null,
        operating_margin_pct: null,
        asset_turnover: null,
        financial_leverage: null
      },
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-company DuPont decomposition.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};

  const revenue = isFiniteNumber(income.revenue) ? Number(income.revenue) : 0;
  const ebit = isFiniteNumber(income.ebit) ? Number(income.ebit) : 0;
  const ebt = isFiniteNumber(income.ebt) ? Number(income.ebt) : 0;
  const netIncome = isFiniteNumber(income.net_income) ? Number(income.net_income) : 0;

  const totalAssets = isFiniteNumber(balance.total_assets) ? Number(balance.total_assets) : 0;
  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : 0;

  const dupont = calculate5StepDuPont({
    netIncome,
    ebt,
    ebit,
    revenue,
    totalAssets,
    totalEquity
  });

  let score = 0;
  let status = 'FAIL';
  let classification = 'Negative or Indeterminable Earnings';
  const observations = [];

  if (dupont !== null) {
    if (dupont.calculatedRoePct >= 15.0 && dupont.operatingMarginPct >= 15.0 && dupont.financialLeverage <= 2.5) {
      score = 100;
      status = 'PASS';
      classification = 'Pristine Compounding Quality';
      observations.push(`High ROE quality: ${dupont.calculatedRoePct}% ROE driven by wide operating margin (${dupont.operatingMarginPct}%) with low financial leverage (${dupont.financialLeverage}x <= 2.5x).`);
    } else if (dupont.calculatedRoePct >= 12.0 && dupont.financialLeverage <= 3.5) {
      score = 60;
      status = 'PASS';
      classification = 'Sound Operational ROE';
      observations.push(`Solid operational ROE: ${dupont.calculatedRoePct}% with moderate financial leverage (${dupont.financialLeverage}x <= 3.5x).`);
    } else if (dupont.financialLeverage > 3.5) {
      score = 20;
      status = 'WARN';
      classification = 'Artificial Leverage Risk';
      observations.push(`Artificial ROE leverage: Financial leverage of ${dupont.financialLeverage}x exceeds 3.5x ceiling with thin margins.`);
    } else if (dupont.calculatedRoePct >= 8.0) {
      score = 30;
      status = 'WARN';
      classification = 'Tepid ROE Compounding';
      observations.push(`Tepid ROE: DuPont calculated ROE (${dupont.calculatedRoePct}%) is below 12.0% threshold.`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Sub-par Capital Efficiency';
      observations.push(`Weak ROE: DuPont calculated ROE (${dupont.calculatedRoePct}%) is below 8.0% threshold.`);
    }
  } else {
    observations.push('Negative or indeterminable earnings preclude 5-step DuPont ROE decomposition.');
  }

  return {
    principle: 'dupont-roe',
    name: '5-Step DuPont ROE Quality & Financial Leverage',
    ticker,
    status,
    score,
    classification,
    metrics: dupont ? {
      roe_pct: dupont.calculatedRoePct,
      tax_burden: dupont.taxBurden,
      interest_burden: dupont.interestBurden,
      operating_margin_pct: dupont.operatingMarginPct,
      asset_turnover: dupont.assetTurnover,
      financial_leverage: dupont.financialLeverage
    } : null,
    summary: `${status} (${classification}): DuPont ROE of ${dupont ? dupont.calculatedRoePct + '%' : 'N/A'} (Leverage: ${dupont ? dupont.financialLeverage + 'x' : 'N/A'}).`,
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
    const evaluation = evaluateDuPontROE(fin);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating DuPont ROE:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluateDuPontROE, calculate5StepDuPont };

