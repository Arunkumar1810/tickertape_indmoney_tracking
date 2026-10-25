'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  calculateGrahamNumber,
  calculateNNWC,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateLynchMetrics,
  calculateKlarmanSolvency
} = require('../calculate_valuation.js');

test('calculateGrahamNumber computes correct liquidating floor', () => {
  const graham = calculateGrahamNumber(60, 200);
  assert.ok(graham !== null);
  assert.strictEqual(Math.round(graham), 520);

  // Negative EPS or BVPS returns null
  assert.strictEqual(calculateGrahamNumber(-10, 100), null);
  assert.strictEqual(calculateGrahamNumber(10, -50), null);
  assert.strictEqual(calculateGrahamNumber(0, 100), null);
});

test('calculateNNWC computes net-net working capital correctly', () => {
  const nnwc = calculateNNWC(1000, 400, 200, 500);
  // 1000 + (0.75 * 400) + (0.50 * 200) - 500 = 1000 + 300 + 100 - 500 = 900
  assert.strictEqual(nnwc, 900);
});

test('calculateOwnerEarnings computes operating cash flow minus maintenance capex', () => {
  const ownerEarnings = calculateOwnerEarnings(5000, 1200);
  assert.strictEqual(ownerEarnings, 3800);
});

test('calculate5StepDuPont decomposes ROE correctly', () => {
  const dupont = calculate5StepDuPont({
    netIncome: 25000,
    ebt: 32000,
    ebit: 35000,
    revenue: 150000,
    totalAssets: 120000,
    totalEquity: 85000
  });

  assert.ok(dupont !== null);
  assert.strictEqual(dupont.taxBurden, 0.7813); // 25000 / 32000
  assert.strictEqual(dupont.interestBurden, 0.9143); // 32000 / 35000
  assert.strictEqual(dupont.operatingMargin, 23.33); // 35000 / 150000 * 100
  assert.strictEqual(dupont.assetTurnover, 1.25); // 150000 / 120000
  assert.strictEqual(dupont.financialLeverage, 1.41); // 120000 / 85000
  assert.strictEqual(dupont.calculatedRoePct, 29.41); // 25000 / 85000 * 100
});

test('calculateLynchMetrics computes PEG and inventory divergence correctly', () => {
  const normalCase = calculateLynchMetrics({
    pe: 25,
    epsGrowthRate: 15,
    revenueGrowthRate: 10,
    inventoryGrowthRate: 12
  });
  assert.strictEqual(normalCase.peg, 1.67);
  assert.strictEqual(normalCase.inventoryDivergencePct, 2.0);
  assert.strictEqual(normalCase.inventoryFlag, false);

  const divergenceCase = calculateLynchMetrics({
    pe: 20,
    epsGrowthRate: 10,
    revenueGrowthRate: 5,
    inventoryGrowthRate: 15
  });
  assert.strictEqual(divergenceCase.inventoryDivergencePct, 10.0);
  assert.strictEqual(divergenceCase.inventoryFlag, true);
});

test('calculateKlarmanSolvency verifies net debt and accrual quality', () => {
  const healthy = calculateKlarmanSolvency({
    totalDebt: 5000,
    cash: 8000,
    ebitda: 20000,
    ebit: 18000,
    interestExpense: 500,
    netIncome: 12000,
    operatingCashFlow: 14000
  });

  assert.strictEqual(healthy.netDebt, -3000); // Net cash
  assert.strictEqual(healthy.netDebtToEbitda, -0.15);
  assert.strictEqual(healthy.isNetDebtSafe, true);
  assert.strictEqual(healthy.interestCoverage, 36.0);
  assert.strictEqual(healthy.accrualQualityHealthy, true);

  const stressed = calculateKlarmanSolvency({
    totalDebt: 30000,
    cash: 2000,
    ebitda: 8000,
    ebit: 6000,
    interestExpense: 2000,
    netIncome: 3000,
    operatingCashFlow: 1500
  });

  assert.strictEqual(stressed.netDebt, 28000);
  assert.strictEqual(stressed.netDebtToEbitda, 3.5);
  assert.strictEqual(stressed.isNetDebtSafe, false); // Net Debt / EBITDA > 2.5
  assert.strictEqual(stressed.interestCoverage, 3.0);
  assert.strictEqual(stressed.accrualQualityHealthy, false); // CFO < Net Income
});
