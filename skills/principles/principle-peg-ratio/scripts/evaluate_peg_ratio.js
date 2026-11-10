#!/usr/bin/env node
'use strict';

/**
 * evaluate_peg_ratio.js:
 * Growth-At-A-Reasonable-Price (GARP) PEG Ratio & Multiple Expansion Valuation Engine.
 * Evaluates Price-to-Earnings against EPS expansion rate and dividend capital returns.
 */

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

/**
 * Calculate classic PEG ratio: P/E / EPS Growth Rate.
 * Returns null if PE <= 0 or epsGrowth <= 0.
 */
function calculatePEG(pe, epsGrowth) {
  if (!isFiniteNumber(pe) || !isFiniteNumber(epsGrowth) || pe <= 0 || epsGrowth <= 0) {
    return null;
  }
  return round2(pe / epsGrowth);
}

/**
 * Calculate Yield-Adjusted PEG ratio: P/E / (EPS Growth Rate + Dividend Yield).
 * Returns null if PE <= 0 or combined expansion rate <= 0.
 */
function calculateYieldAdjustedPEG(pe, epsGrowth, divYield) {
  const y = isFiniteNumber(divYield) ? Math.max(0, divYield) : 0.0;
  if (!isFiniteNumber(pe) || !isFiniteNumber(epsGrowth) || pe <= 0 || (epsGrowth + y) <= 0) {
    return null;
  }
  return round2(pe / (epsGrowth + y));
}

/**
 * Calculate Fair Value Line: (EPS Growth Rate + Dividend Yield) * EPS.
 * Returns null if EPS <= 0 or combined expansion rate <= 0.
 */
function calculateFairValueLine(eps, epsGrowth, divYield) {
  const y = isFiniteNumber(divYield) ? Math.max(0, divYield) : 0.0;
  if (!isFiniteNumber(eps) || !isFiniteNumber(epsGrowth) || eps <= 0 || (epsGrowth + y) <= 0) {
    return null;
  }
  return round2((epsGrowth + y) * eps);
}

// Backward-compatible alias
const calculateLynchFairValue = calculateFairValueLine;

/**
 * Evaluates PEG ratio and growth valuation metrics for an equity.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @returns {object} Evaluation result object
 */
function evaluatePEGRatio(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluatePEGRatio requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'peg-ratio',
      name: 'PEG Ratio & Expansion Valuation',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Basket (Bypasses Single-Equity PEG)',
      metrics: {
        peg_ratio: null,
        yield_adjusted_peg_ratio: null,
        pe_ratio: null,
        eps_growth_rate_pct: null,
        dividend_yield_pct: null,
        fair_value_line: null
      },
      observations: ['Passive index fund provides broad-market diversification without single-stock PEG constraints.'],
      summary: 'Index ETF passive basket: PEG ratio valuation constraints bypassed.'
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};

  const pe = isFiniteNumber(marketData.pe_ttm) ? Number(marketData.pe_ttm) : null;
  const eps = marketData.eps_ttm !== undefined && isFiniteNumber(marketData.eps_ttm)
    ? Number(marketData.eps_ttm)
    : (income.eps !== undefined && isFiniteNumber(income.eps) ? Number(income.eps) : null);
  const divYield = isFiniteNumber(marketData.dividend_yield_pct) ? Number(marketData.dividend_yield_pct) : 0.0;

  const epsGrowth = isFiniteNumber(marketData.eps_growth_5y_cagr_pct)
    ? Number(marketData.eps_growth_5y_cagr_pct)
    : (isFiniteNumber(marketData.eps_growth_ttm) ? Number(marketData.eps_growth_ttm) : null);

  const pegRatio = calculatePEG(pe, epsGrowth);
  const yieldAdjustedPegRatio = calculateYieldAdjustedPEG(pe, epsGrowth, divYield);
  const fairValueLine = calculateFairValueLine(eps, epsGrowth, divYield);

  let score = 0;
  let status = 'FAIL';
  let classification = 'Unfavorable PEG Multiple Stretch';
  const observations = [];
  const redFlags = [];

  if (pegRatio !== null) {
    if (pegRatio <= 0.50) {
      score = 100;
      status = 'PASS';
      classification = 'Exceptional Growth Bargain (PEG <= 0.50)';
      observations.push(`Exceptional growth bargain: PEG ratio of ${pegRatio} is at or below 0.50 screaming buy threshold.`);
    } else if (pegRatio <= 1.0) {
      score = 80;
      status = 'PASS';
      classification = 'Attractive GARP (PEG <= 1.0)';
      observations.push(`Attractive valuation: PEG ratio of ${pegRatio} confirms growth at a reasonable price.`);
    } else if (pegRatio <= 1.5) {
      score = 50;
      status = 'PASS';
      classification = 'Fair Value (PEG 1.0 - 1.5)';
      observations.push(`Fair valuation: PEG ratio of ${pegRatio} is within acceptable bounds.`);
    } else if (pegRatio <= 2.0) {
      score = 25;
      status = 'FLAG';
      classification = 'Valuation Multiple Stretch (PEG 1.5 - 2.0)';
      redFlags.push(`Moderate valuation stretch: PEG ratio of ${pegRatio} is between 1.5 and 2.0.`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Excessive Premium (PEG > 2.0)';
      redFlags.push(`Unfavorable growth valuation: PEG ratio of ${pegRatio} exceeds 2.0 ceiling.`);
    }
  } else {
    score = 0;
    status = 'FAIL';
    classification = 'Undetermined / Non-Positive Earnings Growth';
    if (!isFiniteNumber(epsGrowth) || epsGrowth <= 0) {
      redFlags.push(`Zero or negative EPS growth rate (${epsGrowth !== null ? epsGrowth + '%' : 'missing'}) precludes PEG calculation.`);
    }
    if (!isFiniteNumber(pe) || pe <= 0) {
      redFlags.push('Negative or zero P/E multiple precludes PEG calculation.');
    }
  }

  if (pe !== null && pe > 50.0) {
    redFlags.push(`Elevated P/E multiple (${pe} > 50.0) represents excessive market expectations.`);
  }

  const summary = `PEG Ratio: ${pegRatio !== null ? pegRatio : 'N/A'} (Score: ${score}/100) — ${classification}. Fair Value Line: ${fairValueLine !== null ? fairValueLine : 'N/A'}.`;

  return {
    principle: 'peg-ratio',
    name: 'PEG Ratio & Expansion Valuation',
    ticker,
    status,
    score,
    classification,
    metrics: {
      peg_ratio: pegRatio,
      yield_adjusted_peg_ratio: yieldAdjustedPegRatio,
      pe_ratio: round2(pe),
      eps_growth_rate_pct: isFiniteNumber(epsGrowth) ? round2(epsGrowth) : null,
      dividend_yield_pct: isFiniteNumber(divYield) ? round2(divYield) : null,
      fair_value_line: fairValueLine
    },
    observations,
    red_flags: redFlags,
    summary
  };
}

module.exports = {
  calculatePEG,
  calculateYieldAdjustedPEG,
  calculateFairValueLine,
  calculateLynchFairValue,
  evaluatePEGRatio
};

