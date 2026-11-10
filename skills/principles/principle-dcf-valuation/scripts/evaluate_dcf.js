#!/usr/bin/env node
'use strict';

/**
 * evaluate_dcf.js: Evaluates Gordon Growth / DCF Intrinsic Value and Margin of Safety.
 * Formula based on Digital Buffett financial tools (simple_gordon_dcf & calculate_margin_of_safety).
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

function calculateGordonDCF(fcf0, growthRate = 0.025, discountRate = 0.10) {
  if (!isFiniteNumber(fcf0) || fcf0 <= 0) return null;
  if (discountRate <= growthRate) return null;

  const fcf1 = fcf0 * (1 + growthRate);
  const intrinsicValue = fcf1 / (discountRate - growthRate);

  return {
    fcf0: round2(fcf0),
    fcf1: round2(fcf1),
    growthRate,
    discountRate,
    intrinsicValue: round2(intrinsicValue)
  };
}

function evaluateDCF(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateDCF requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'dcf-valuation',
      name: 'Gordon Growth DCF Intrinsic Valuation',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        fcf0: null,
        fcf1: null,
        intrinsic_value: null,
        market_cap: null,
        margin_of_safety_pct: null
      },
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-company DCF modeling.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const cashFlow = financials.cash_flow || {};
  const marketData = financials.market_data || {};

  const ocf = isFiniteNumber(cashFlow.operating_cash_flow) ? Number(cashFlow.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cashFlow.capital_expenditure) ? Number(cashFlow.capital_expenditure) : 0;
  const maintCapex = isFiniteNumber(cashFlow.maintenance_capex) ? Number(cashFlow.maintenance_capex) : null;
  const sbc = isFiniteNumber(cashFlow.stock_based_compensation) ? Number(cashFlow.stock_based_compensation) : 0;

  const capexUsed = (maintCapex && maintCapex > 0) ? maintCapex : Math.abs(capex);
  const trueOwnerEarnings = ocf - capexUsed - Math.abs(sbc);

  const growthRate = options.growthRate || 0.025; // 2.5% terminal growth
  const discountRate = options.discountRate || 0.10; // 10.0% Buffett hurdle rate

  const dcf = calculateGordonDCF(trueOwnerEarnings, growthRate, discountRate);
  const marketCap = isFiniteNumber(marketData.market_cap) ? Number(marketData.market_cap) : null;

  let marginOfSafetyPct = null;
  let priceToValueRatio = null;
  let upsidePotentialPct = null;

  if (dcf && marketCap && marketCap > 0) {
    marginOfSafetyPct = round2(((dcf.intrinsicValue - marketCap) / dcf.intrinsicValue) * 100);
    priceToValueRatio = round2(marketCap / dcf.intrinsicValue);
    upsidePotentialPct = round2(((dcf.intrinsicValue / marketCap) - 1) * 100);
  }

  let score = 0;
  let status = 'FAIL';
  let classification = 'Overvalued / Dangerous';
  const observations = [];

  if (marginOfSafetyPct !== null) {
    if (marginOfSafetyPct >= 20.0) {
      score = 100;
      status = 'PASS';
      classification = 'Substantial Margin of Safety (Safe)';
      observations.push(`Significant discount: Market cap is ${marginOfSafetyPct}% below Gordon DCF intrinsic value (>= 20% hurdle).`);
    } else if (marginOfSafetyPct >= 10.0) {
      score = 75;
      status = 'PASS';
      classification = 'Moderate Margin of Safety (Consider)';
      observations.push(`Moderate discount: Market cap offers a ${marginOfSafetyPct}% margin of safety against intrinsic value.`);
    } else if (marginOfSafetyPct >= 0.0) {
      score = 50;
      status = 'WARN';
      classification = 'Minimal Margin of Safety (Hold)';
      observations.push(`Fairly priced: Market cap trades at approximately intrinsic value (Margin: ${marginOfSafetyPct}%).`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Premium Multiple / Dangerous';
      observations.push(`Overpriced: Market cap exceeds Gordon DCF intrinsic value by ${Math.abs(marginOfSafetyPct)}%.`);
    }
  } else {
    observations.push('Negative or indeterminable cash flows preclude Gordon DCF valuation.');
  }

  return {
    principle: 'dcf-valuation',
    name: 'Gordon Growth DCF Intrinsic Valuation',
    ticker,
    status,
    score,
    classification,
    metrics: {
      fcf0: dcf ? dcf.fcf0 : null,
      fcf1: dcf ? dcf.fcf1 : null,
      growth_rate: growthRate,
      discount_rate: discountRate,
      intrinsic_value: dcf ? dcf.intrinsicValue : null,
      market_cap: marketCap,
      margin_of_safety_pct: marginOfSafetyPct,
      price_to_value_ratio: priceToValueRatio,
      upside_potential_pct: upsidePotentialPct
    },
    summary: `${status} (${classification}): Margin of Safety of ${marginOfSafetyPct !== null ? marginOfSafetyPct + '%' : 'N/A'} (Price/Value: ${priceToValueRatio || 'N/A'}).`,
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
    else if (args[i] === '--growth-rate' && args[i + 1]) options.growthRate = Number(args[++i]);
    else if (args[i] === '--discount-rate' && args[i + 1]) options.discountRate = Number(args[++i]);
  }

  try {
    const fin = resolveFinancials(options);
    const evaluation = evaluateDCF(fin, options);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating DCF valuation:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluateDCF, calculateGordonDCF };

