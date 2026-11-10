#!/usr/bin/env node
'use strict';

/**
 * evaluate_altman_z.js:
 * Seth Klarman Altman Z-Score & Bankruptcy Distress Engine.
 * Evaluates working capital, cumulative retained earnings, operational earning power,
 * equity capitalization, and asset asset turnover to detect bankruptcy vulnerability.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function calculateAltmanZScore({
  totalAssets,
  totalCurrentAssets,
  totalCurrentLiabilities,
  retainedEarnings,
  ebit,
  marketCap,
  totalLiabilities,
  revenue
}) {
  if (
    !isFiniteNumber(totalAssets) || totalAssets <= 0 ||
    !isFiniteNumber(totalLiabilities) || totalLiabilities <= 0 ||
    !isFiniteNumber(marketCap) || marketCap < 0
  ) {
    return null;
  }

  const workingCapital = (isFiniteNumber(totalCurrentAssets) ? Number(totalCurrentAssets) : 0) -
                         (isFiniteNumber(totalCurrentLiabilities) ? Number(totalCurrentLiabilities) : 0);
  const retEarn = isFiniteNumber(retainedEarnings) ? Number(retainedEarnings) : 0;
  const opEarn = isFiniteNumber(ebit) ? Number(ebit) : 0;
  const rev = isFiniteNumber(revenue) ? Number(revenue) : 0;

  const X1 = workingCapital / totalAssets;
  const X2 = retEarn / totalAssets;
  const X3 = opEarn / totalAssets;
  const X4 = marketCap / totalLiabilities;
  const X5 = rev / totalAssets;

  const Z = (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (0.999 * X5);
  return round2(Z);
}

function evaluateAltmanZ(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateAltmanZ requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'altman-z-score',
      name: 'Altman Z-Score & Bankruptcy Distress',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: { altman_z_score: null, zone: 'SAFE_ZONE' },
      observations: ['Passive index fund eliminates single-firm insolvency risk.'],
      summary: 'Index ETF passive basket: Corporate bankruptcy distress models bypassed.'
    };
  }

  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};
  const mkt = financials.market_data || {};
  const val = financials.valuation || {};

  const totalAssets = isFiniteNumber(bal.total_assets) ? Number(bal.total_assets) : 0;
  const totalLiab = isFiniteNumber(bal.total_liabilities) ? Number(bal.total_liabilities) : 0;
  const currentAssets = isFiniteNumber(bal.total_current_assets)
    ? Number(bal.total_current_assets)
    : (isFiniteNumber(bal.current_assets) ? Number(bal.current_assets) : 0);
  const currentLiab = isFiniteNumber(bal.total_current_liabilities)
    ? Number(bal.total_current_liabilities)
    : (isFiniteNumber(bal.current_liabilities) ? Number(bal.current_liabilities) : 0);
  const retainedEarnings = isFiniteNumber(bal.retained_earnings) ? Number(bal.retained_earnings) : 0;
  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : (isFiniteNumber(inc.operating_profit) ? Number(inc.operating_profit) : 0);
  const revenue = isFiniteNumber(inc.revenue) ? Number(inc.revenue) : (isFiniteNumber(inc.total_revenue) ? Number(inc.total_revenue) : 0);
  const mcap = isFiniteNumber(mkt.market_cap) ? Number(mkt.market_cap) : (isFiniteNumber(val.market_cap) ? Number(val.market_cap) : null);

  const z = calculateAltmanZScore({
    totalAssets,
    totalCurrentAssets: currentAssets,
    totalCurrentLiabilities: currentLiab,
    retainedEarnings,
    ebit,
    marketCap: mcap,
    totalLiabilities: totalLiab,
    revenue
  });

  let score = 0;
  let status = 'FAIL';
  let zone = 'DISTRESS_ZONE';
  let classification = 'Distress Zone (High Bankruptcy Probability)';
  const observations = [];

  if (z !== null) {
    if (z > 2.99) {
      score = 100;
      status = 'PASS';
      zone = 'SAFE_ZONE';
      classification = 'Safe Zone (Robust Insolvency Resistance)';
      observations.push(`Altman Z-Score of ${z} exceeds 2.99 safe threshold.`);
    } else if (z >= 2.50) {
      score = 75;
      status = 'PASS';
      zone = 'UPPER_GREY_ZONE';
      classification = 'Upper Grey Zone (Moderate Buffer)';
      observations.push(`Altman Z-Score of ${z} reflects acceptable solvency cushion.`);
    } else if (z >= 1.81) {
      score = 45;
      status = 'WARN';
      zone = 'LOWER_GREY_ZONE';
      classification = 'Lower Grey Zone (Vulnerable to Shocks)';
      observations.push(`Altman Z-Score of ${z} indicates heightened vulnerability to refinancing freezes.`);
    } else {
      score = 0;
      status = 'FAIL';
      zone = 'DISTRESS_ZONE';
      classification = 'Distress Zone (Acute Insolvency Hazard)';
      observations.push(`Distress Zone: Altman Z-Score of ${z} (< 1.81) signals severe bankruptcy probability.`);
    }
  } else {
    score = 0;
    status = 'WARN';
    zone = 'INSUFFICIENT_DATA';
    classification = 'Insufficient Balance Sheet Data';
    observations.push('Insufficient balance sheet parameters to compute Altman Z-Score.');
  }

  return {
    principle: 'altman-z-score',
    name: 'Altman Z-Score & Bankruptcy Distress',
    ticker,
    status,
    score,
    zone,
    classification,
    metrics: {
      altman_z_score: z,
      working_capital: currentAssets - currentLiab,
      total_assets: totalAssets,
      total_liabilities: totalLiab
    },
    observations,
    summary: `${status} (${classification}): Altman Z-Score is ${z !== null ? z : 'N/A'}.`
  };
}

module.exports = {
  calculateAltmanZScore,
  evaluateAltmanZ
};

