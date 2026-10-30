'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  calculateGrahamNumber,
  calculateNNWC,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateAltmanZScore,
  calculateLynchMetrics,
  calculateKlarmanSolvency
} = require('../scripts/calculate_us_valuation');

test('calculateGrahamNumber computes correct floor', () => {
  // eps = 8, bvps = 50 -> sqrt(22.5 * 8 * 50) = sqrt(9000) = 94.87
  const val = calculateGrahamNumber(8, 50);
  assert.strictEqual(val, 94.87);
  // negative eps returns null
  assert.strictEqual(calculateGrahamNumber(-2, 50), null);
});

test('calculateNNWC computes liquidating value correctly', () => {
  // cash=100, receivables=40, inventory=20, liabilities=80
  // 100 + (0.75 * 40) + (0.5 * 20) - 80 = 100 + 30 + 10 - 80 = 60
  const nnwc = calculateNNWC(100, 40, 20, 80);
  assert.strictEqual(nnwc, 60);
});

test('calculateOwnerEarnings deducts CapEx and SBC', () => {
  // CFO=500, CapEx=100, SBC=50
  const oe = calculateOwnerEarnings(500, 100, 50);
  assert.strictEqual(oe.rawOwnerEarnings, 400);
  assert.strictEqual(oe.trueOwnerEarnings, 350);
  assert.strictEqual(oe.sbcDilutionPct, 10);
});

test('calculate5StepDuPont computes product of 5 elements', () => {
  const input = {
    netIncome: 200,
    ebt: 250,
    ebit: 300,
    revenue: 1000,
    totalAssets: 2000,
    totalEquity: 800
  };
  const res = calculate5StepDuPont(input);
  assert.ok(res);
  assert.strictEqual(res.taxBurden, 0.8);
  assert.strictEqual(res.interestBurden, 0.8333);
  assert.strictEqual(res.operatingMarginPct, 30);
  assert.strictEqual(res.assetTurnover, 0.5);
  assert.strictEqual(res.financialLeverage, 2.5);
  assert.strictEqual(res.calculatedRoePct, 25);
});

test('calculateAltmanZScore detects safe vs distress', () => {
  const safe = calculateAltmanZScore({
    workingCapital: 500,
    retainedEarnings: 1000,
    ebit: 400,
    marketCap: 5000,
    totalLiabilities: 800,
    revenue: 2000,
    totalAssets: 2500
  });
  assert.ok(safe);
  assert.strictEqual(safe.zone, 'Safe Zone');
  assert.strictEqual(safe.isSafe, true);
});

test('calculateKlarmanSolvency detects safe leverage & accrual quality', () => {
  const res = calculateKlarmanSolvency({
    totalDebt: 300,
    cashAndEquivalents: 100,
    ebitda: 200,
    ebit: 150,
    interestExpense: 25,
    netIncome: 100,
    operatingCashFlow: 140
  });
  assert.ok(res);
  assert.strictEqual(res.netDebt, 200);
  assert.strictEqual(res.netDebtToEbitda, 1);
  assert.strictEqual(res.isNetDebtSafe, true);
  assert.strictEqual(res.interestCoverage, 6);
  assert.strictEqual(res.highAccrualQuality, true);
});
