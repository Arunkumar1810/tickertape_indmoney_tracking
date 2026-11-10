#!/usr/bin/env node
'use strict';

/**
 * evaluate_debt_wall.js:
 * Seth Klarman Debt Maturity Wall, Net Debt to EBITDA, & Liquidity Cushion Engine.
 * Tests if cash reserves and operating cash flow adequately cover debt maturing within 24 months,
 * and checks whether leverage burdens exceed conservative Baupost stress tolerances.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function evaluateDebtWall(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateDebtWall requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'debt-maturity-wall',
      name: 'Debt Maturity Wall & Leverage Cushion',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        net_debt: null,
        net_debt_to_ebitda: null,
        debt_maturing_24m: 0,
        interest_coverage: null
      },
      observations: ['Passive ETF basket carries zero corporate debt maturity exposure.'],
      summary: 'Index ETF passive basket: Corporate debt wall and refinancing stress bypassed.'
    };
  }

  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};
  const cf = financials.cash_flow || {};

  const totalDebt = isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0;
  const cash = isFiniteNumber(bal.cash_and_equivalents) ? Number(bal.cash_and_equivalents) : 0;
  const netDebt = round2(totalDebt - cash);

  const ebitda = isFiniteNumber(inc.ebitda) ? Number(inc.ebitda) : null;
  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : (isFiniteNumber(inc.operating_profit) ? Number(inc.operating_profit) : 0);
  const interestExpense = isFiniteNumber(inc.interest_expense) ? Number(inc.interest_expense) : 0;
  const ocf = isFiniteNumber(cf.operating_cash_flow) ? Number(cf.operating_cash_flow) : 0;

  // Debt maturing within 24 months
  let debtMaturing24m = 0;
  if (isFiniteNumber(bal.debt_maturing_24m)) {
    debtMaturing24m = Math.max(0, Number(bal.debt_maturing_24m));
  } else if (isFiniteNumber(bal.short_term_debt)) {
    debtMaturing24m = Math.max(0, Number(bal.short_term_debt));
  }

  let netDebtToEbitda = null;
  if (ebitda !== null && ebitda > 0) {
    netDebtToEbitda = round2(netDebt / ebitda);
  } else if (ebitda !== null && ebitda < 0 && netDebt > 0) {
    netDebtToEbitda = round2(netDebt / ebitda);
  }

  let interestCoverage = null;
  if (interestExpense > 0) {
    interestCoverage = round2(ebit / interestExpense);
  }

  const totalLiquidCushion = cash + Math.max(0, ocf);
  const liquidityCoverageRatio = debtMaturing24m > 0 ? round2(totalLiquidCushion / debtMaturing24m) : null;

  const observations = [];
  const flags = [];

  // 1. Leverage Score (max 40 pts)
  let levScore = 0;
  if (netDebt <= 0) {
    levScore = 40;
    observations.push(`Fortress Net Cash: Cash exceeds debt by ${Math.abs(netDebt)}.`);
  } else if (ebitda !== null && ebitda > 0 && netDebtToEbitda !== null) {
    if (netDebtToEbitda <= 1.0) {
      levScore = 40;
      observations.push(`Conservative leverage: Net Debt / EBITDA is ${netDebtToEbitda}x.`);
    } else if (netDebtToEbitda <= 2.5) {
      levScore = 28;
      observations.push(`Moderate leverage: Net Debt / EBITDA is ${netDebtToEbitda}x.`);
    } else if (netDebtToEbitda <= 4.0) {
      levScore = 12;
      flags.push(`Elevated leverage: Net Debt / EBITDA of ${netDebtToEbitda}x exceeds 2.5x ceiling.`);
    } else {
      levScore = 0;
      flags.push(`Dangerous leverage: Net Debt / EBITDA of ${netDebtToEbitda}x (> 4.0x).`);
    }
  } else {
    levScore = 0;
    flags.push(`Distressed leverage: Positive net debt (${netDebt}) with non-positive EBITDA.`);
  }

  // 2. Debt Maturity Wall Score (max 40 pts)
  let wallScore = 0;
  if (debtMaturing24m <= 0) {
    wallScore = 40;
    observations.push('Zero near-term refinancing risk: No debt maturities in next 24 months.');
  } else if (cash >= debtMaturing24m) {
    wallScore = 40;
    observations.push(`Liquid cash (${cash}) completely covers 24M debt maturities (${debtMaturing24m}).`);
  } else if (totalLiquidCushion >= debtMaturing24m) {
    wallScore = 30;
    observations.push(`Cash + OCF (${round2(totalLiquidCushion)}) covers 24M maturities (${debtMaturing24m}).`);
  } else if (liquidityCoverageRatio !== null && liquidityCoverageRatio >= 0.5) {
    wallScore = 12;
    flags.push(`Refinancing vulnerability: Liquid cushion covers only ${round2(liquidityCoverageRatio * 100)}% of 24M debt wall.`);
  } else {
    wallScore = 0;
    flags.push(`Debt maturity cliff: Imminent debt maturities (${debtMaturing24m}) severely exceed liquidity (${round2(totalLiquidCushion)}).`);
  }

  // 3. Interest Coverage Score (max 20 pts)
  let intScore = 0;
  if (totalDebt <= 0 || interestExpense <= 0) {
    intScore = 20;
    observations.push('Debt-free operations: Zero interest servicing burden.');
  } else if (interestCoverage !== null) {
    if (interestCoverage >= 5.0) {
      intScore = 20;
      observations.push(`Robust interest coverage: EBIT covers interest by ${interestCoverage}x.`);
    } else if (interestCoverage >= 3.0) {
      intScore = 14;
      observations.push(`Acceptable interest coverage: ${interestCoverage}x.`);
    } else if (interestCoverage >= 1.5) {
      intScore = 6;
      flags.push(`Thin interest coverage: ${interestCoverage}x is below 3.0x safe buffer.`);
    } else {
      intScore = 0;
      flags.push(`Constrained debt service: Interest coverage is ${interestCoverage}x (< 1.5x).`);
    }
  } else {
    intScore = 0;
    flags.push('Negative operating earnings with active interest charges.');
  }

  const score = levScore + wallScore + intScore;
  let status = 'PASS';
  let classification = 'Fortress Balance Sheet & Pristine Liquidity';
  if (score >= 80) {
    status = 'PASS';
    classification = 'Fortress Balance Sheet & Pristine Liquidity';
  } else if (score >= 65) {
    status = 'PASS';
    classification = 'Manageable Debt Profile';
  } else if (score >= 45) {
    status = 'WARN';
    classification = 'Moderate Solvency Vulnerability';
  } else {
    status = 'FAIL';
    classification = 'Acute Refinancing & Leverage Distress';
  }

  return {
    principle: 'debt-maturity-wall',
    name: 'Debt Maturity Wall & Leverage Cushion',
    ticker,
    status,
    score,
    classification,
    metrics: {
      total_debt: totalDebt,
      cash_and_equivalents: cash,
      net_debt: netDebt,
      net_debt_to_ebitda: netDebtToEbitda,
      debt_maturing_24m: debtMaturing24m,
      interest_coverage: interestCoverage,
      liquidity_coverage_ratio: liquidityCoverageRatio
    },
    flags,
    observations,
    summary: `${status} (${classification}): Net Debt / EBITDA is ${netDebtToEbitda !== null ? netDebtToEbitda + 'x' : (netDebt <= 0 ? 'Net Cash' : 'N/A')}, 24M Debt Wall: ${debtMaturing24m}, Interest Cover: ${interestCoverage !== null ? interestCoverage + 'x' : 'N/A'}.`
  };
}

module.exports = {
  evaluateDebtWall
};

