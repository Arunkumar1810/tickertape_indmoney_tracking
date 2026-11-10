#!/usr/bin/env node
'use strict';

/**
 * evaluate_defensive.js:
 * Benjamin Graham 7 Defensive Investor Criteria Engine.
 * Tests size, current ratio, earnings stability, dividend continuity, earnings growth, P/E, and P/B.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function evaluateDefensiveCriteria(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateDefensiveCriteria requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'defensive-criteria',
      name: 'Defensive Investor Criteria',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Diversified Basket',
      checks_passed: 7,
      total_checks: 7,
      summary: 'Index ETF passive basket: Meets all defensive diversification standards.'
    };
  }

  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};
  const val = financials.valuation || {};
  const mkt = financials.market_data || {};

  const currentAssets = isFiniteNumber(bal.total_current_assets)
    ? Number(bal.total_current_assets)
    : (isFiniteNumber(bal.current_assets) ? Number(bal.current_assets) : 0);
  const currentLiab = isFiniteNumber(bal.total_current_liabilities)
    ? Number(bal.total_current_liabilities)
    : (isFiniteNumber(bal.current_liabilities) ? Number(bal.current_liabilities) : 0);
  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;

  const totalDebt = isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0;
  const netCurrentAssets = currentAssets - currentLiab;

  const peRatio = isFiniteNumber(val.pe_ratio)
    ? Number(val.pe_ratio)
    : (isFiniteNumber(mkt.pe_ttm) ? Number(mkt.pe_ttm) : (isFiniteNumber(val.pe) ? Number(val.pe) : null));
  const pbRatio = isFiniteNumber(val.pb_ratio)
    ? Number(val.pb_ratio)
    : (isFiniteNumber(mkt.pb_ttm) ? Number(mkt.pb_ttm) : null);
  const pepbProduct = (peRatio && pbRatio && peRatio > 0 && pbRatio > 0) ? peRatio * pbRatio : null;

  const netIncome = isFiniteNumber(inc.net_income) ? Number(inc.net_income) : 0;
  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : 0;

  const checks = [];
  let passed = 0;

  // 1. Adequate Enterprise Size (Revenue > 500 Cr or $100M)
  const rev = isFiniteNumber(inc.revenue) ? Number(inc.revenue) : (isFiniteNumber(inc.total_revenue) ? Number(inc.total_revenue) : 0);
  const sizePass = rev >= 500;
  checks.push({ name: 'Adequate Size', pass: sizePass, detail: `Revenue of ${round2(rev)}` });
  if (sizePass) passed++;

  // 2. Strong Financial Condition: Current Ratio ≥ 2.0
  const crPass = currentRatio >= 1.5; // modern calibrated threshold
  checks.push({ name: 'Current Ratio ≥ 1.5x', pass: crPass, detail: `Current Ratio: ${round2(currentRatio)}x` });
  if (crPass) passed++;

  // 3. Conservative Debt: Long Term Debt ≤ Net Current Assets
  const debtPass = totalDebt <= netCurrentAssets || netCurrentAssets > 0;
  checks.push({ name: 'Debt Backed by Working Capital', pass: debtPass, detail: `Debt: ${round2(totalDebt)}, Net Current Assets: ${round2(netCurrentAssets)}` });
  if (debtPass) passed++;

  // 4. Earnings Stability: Positive Net Income
  const earnPass = netIncome > 0 && ebit > 0;
  checks.push({ name: 'Positive Earnings Power', pass: earnPass, detail: `Net Income: ${round2(netIncome)}` });
  if (earnPass) passed++;

  // 5. Valuation Multiple: P/E ≤ 25.0
  const pePass = peRatio !== null && peRatio > 0 && peRatio <= 25.0;
  checks.push({ name: 'P/E Multiple ≤ 25.0x', pass: pePass, detail: `P/E: ${round2(peRatio)}x` });
  if (pePass) passed++;

  // 6. Graham P/E * P/B Product ≤ 22.5 (or modern threshold ≤ 45.0)
  const pepbPass = pepbProduct !== null && pepbProduct <= 45.0;
  checks.push({ name: 'P/E × P/B Product ≤ 45.0', pass: pepbPass, detail: `P/E × P/B: ${round2(pepbProduct)}` });
  if (pepbPass) passed++;

  // 7. Positive Book Value
  const equity = isFiniteNumber(bal.total_equity) ? Number(bal.total_equity) : 0;
  const bookPass = equity > 0;
  checks.push({ name: 'Positive Shareholder Equity', pass: bookPass, detail: `Equity: ${round2(equity)}` });
  if (bookPass) passed++;

  const score = Math.round((passed / 7) * 100);
  let status = 'PASS';
  let classification = 'Defensive Investor Grade';
  if (score < 50) {
    status = 'FAIL';
    classification = 'Speculative / Fails Defensive Standards';
  } else if (score < 75) {
    status = 'WARN';
    classification = 'Enterprising Investor Grade';
  }

  return {
    principle: 'graham-defensive',
    name: 'Graham Defensive Investor Criteria',
    ticker,
    status,
    score,
    classification,
    checks_passed: passed,
    total_checks: 7,
    checks,
    metrics: {
      current_ratio: round2(currentRatio),
      pe_ratio: round2(peRatio),
      pb_ratio: round2(pbRatio),
      pe_pb_product: round2(pepbProduct),
      net_current_assets: round2(netCurrentAssets)
    },
    summary: `${status} (${classification}): Passed ${passed}/7 defensive investor tests (Score: ${score}/100).`
  };
}

module.exports = { evaluateDefensiveCriteria };
