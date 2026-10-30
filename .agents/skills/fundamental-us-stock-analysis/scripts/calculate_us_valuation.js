#!/usr/bin/env node
'use strict';

/**
 * calculate_us_valuation.js
 * Deterministic financial calculator for US stock value investing audit:
 * - Graham Liquidating Floor, Net-Net Working Capital (NNWC) & Graham Number
 * - Buffett-Munger Owner Earnings (CFO - CapEx - SBC) & 5-Step DuPont Decomposition
 * - Altman Z-Score Solvency Model
 * - Peter Lynch PEG & Operational Divergence Checks
 * - Seth Klarman Solvency & Cash Flow Accrual Quality
 */

function calculateGrahamNumber(eps, bvps) {
  if (eps <= 0 || bvps <= 0) return null;
  return Number(Math.sqrt(22.5 * eps * bvps).toFixed(2));
}

function calculateNNWC(cashAndEquivalents, receivables, inventory, totalLiabilities) {
  const nnwc = (cashAndEquivalents || 0) + (0.75 * (receivables || 0)) + (0.50 * (inventory || 0)) - (totalLiabilities || 0);
  return Number(nnwc.toFixed(2));
}

function calculateOwnerEarnings(operatingCashFlow, capitalExpenditures, stockBasedComp = 0) {
  // If CapEx is entered as negative in cash flow statements, take absolute value
  const capEx = Math.abs(capitalExpenditures || 0);
  const sbc = Math.abs(stockBasedComp || 0);
  const oe = (operatingCashFlow || 0) - capEx - sbc;
  return {
    rawOwnerEarnings: Number(((operatingCashFlow || 0) - capEx).toFixed(2)),
    trueOwnerEarnings: Number(oe.toFixed(2)),
    sbcDilutionPct: operatingCashFlow > 0 ? Number(((sbc / operatingCashFlow) * 100).toFixed(2)) : 0
  };
}

function calculate5StepDuPont({ netIncome, ebt, ebit, revenue, totalAssets, totalEquity }) {
  if (!ebt || !ebit || !revenue || !totalAssets || !totalEquity || totalEquity <= 0) return null;

  const taxBurden = netIncome / ebt;
  const interestBurden = ebt / ebit;
  const operatingMargin = ebit / revenue;
  const assetTurnover = revenue / totalAssets;
  const financialLeverage = totalAssets / totalEquity;
  const roe = taxBurden * interestBurden * operatingMargin * assetTurnover * financialLeverage;

  return {
    taxBurden: Number(taxBurden.toFixed(4)),
    interestBurden: Number(interestBurden.toFixed(4)),
    operatingMarginPct: Number((operatingMargin * 100).toFixed(2)),
    assetTurnover: Number(assetTurnover.toFixed(3)),
    financialLeverage: Number(financialLeverage.toFixed(2)),
    calculatedRoePct: Number((roe * 100).toFixed(2))
  };
}

function calculateAltmanZScore({ workingCapital, retainedEarnings, ebit, marketCap, totalLiabilities, revenue, totalAssets }) {
  if (!totalAssets || totalAssets <= 0 || !totalLiabilities || totalLiabilities <= 0) return null;

  const x1 = (workingCapital || 0) / totalAssets;
  const x2 = (retainedEarnings || 0) / totalAssets;
  const x3 = (ebit || 0) / totalAssets;
  const x4 = (marketCap || 0) / totalLiabilities;
  const x5 = (revenue || 0) / totalAssets;

  const zScore = (1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (0.999 * x5);
  const zone = zScore > 2.99 ? 'Safe Zone' : (zScore >= 1.81 ? 'Grey Zone' : 'Distress Zone');

  return {
    zScore: Number(zScore.toFixed(2)),
    zone,
    isSafe: zScore > 2.99
  };
}

function calculateLynchMetrics({ pe, epsGrowthRate, revenueGrowthRate, inventoryGrowthRate, receivablesGrowthRate }) {
  const peg = (epsGrowthRate && epsGrowthRate > 0) ? (pe / epsGrowthRate) : null;
  const invDivergence = (inventoryGrowthRate != null && revenueGrowthRate != null)
    ? (inventoryGrowthRate - revenueGrowthRate)
    : null;
  const arDivergence = (receivablesGrowthRate != null && revenueGrowthRate != null)
    ? (receivablesGrowthRate - revenueGrowthRate)
    : null;

  return {
    peg: peg ? Number(peg.toFixed(2)) : null,
    inventoryDivergencePct: invDivergence != null ? Number(invDivergence.toFixed(2)) : null,
    inventoryFlag: invDivergence != null && invDivergence > 5.0,
    receivablesDivergencePct: arDivergence != null ? Number(arDivergence.toFixed(2)) : null,
    receivablesFlag: arDivergence != null && arDivergence > 10.0
  };
}

function calculateKlarmanSolvency({ totalDebt, cashAndEquivalents, ebitda, ebit, interestExpense, netIncome, operatingCashFlow }) {
  const netDebt = (totalDebt || 0) - (cashAndEquivalents || 0);
  const netDebtToEbitda = (ebitda && ebitda > 0) ? (netDebt / ebitda) : null;
  const interestCoverage = (interestExpense && interestExpense > 0) ? ((ebit || 0) / interestExpense) : null;
  const accrualGap = (operatingCashFlow || 0) - (netIncome || 0);

  return {
    netDebt: Number(netDebt.toFixed(2)),
    netDebtToEbitda: netDebtToEbitda != null ? Number(netDebtToEbitda.toFixed(2)) : null,
    isNetDebtSafe: netDebtToEbitda != null ? netDebtToEbitda < 2.5 : (netDebt <= 0),
    interestCoverage: interestCoverage != null ? Number(interestCoverage.toFixed(2)) : null,
    isInterestCoverageSafe: interestCoverage != null ? interestCoverage >= 4.0 : true,
    accrualGap: Number(accrualGap.toFixed(2)),
    highAccrualQuality: accrualGap >= 0
  };
}

module.exports = {
  calculateGrahamNumber,
  calculateNNWC,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateAltmanZScore,
  calculateLynchMetrics,
  calculateKlarmanSolvency
};
