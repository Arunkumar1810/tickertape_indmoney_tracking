const test = require('node:test');
const assert = require('node:assert');
const XirrSolver = require('../scripts/lib/xirr_solver');

test('XirrSolver calculates exact 10% return over 1 year', () => {
  const cashflows = [
    { date: '2024-01-01', amount: -100000 },
    { date: '2025-01-01', amount: 110000 }
  ];

  const result = XirrSolver.calculate(cashflows);
  assert.strictEqual(result.status, 'CONVERGED');
  assert.strictEqual(result.isSubAnnual, false);
  assert.ok(Math.abs(result.xirr - 0.10) < 0.001, `Expected ~0.10, got ${result.xirr}`);
  assert.ok(Math.abs(result.absoluteReturn - 0.10) < 0.001);
});

test('XirrSolver correctly solves multi-tranche cashflows with positive dividends', () => {
  const cashflows = [
    { date: '2023-01-15', amount: -100000 },
    { date: '2023-07-20', amount: -50000 },
    { date: '2023-12-10', amount: 3000 },   // Dividend
    { date: '2024-05-15', amount: 180000 }  // Final liquidation
  ];

  const result = XirrSolver.calculate(cashflows);
  assert.strictEqual(result.status, 'CONVERGED');
  assert.ok(result.xirr > 0.15 && result.xirr < 0.35, `Expected 15-35%, got ${result.xirr}`);
});

test('XirrSolver triggers sub-90-day guardrail on short-duration investments', () => {
  const shortCashflows = [
    { date: '2024-01-01', amount: -100000 },
    { date: '2024-01-25', amount: 105000 } // 24 days
  ];

  const result = XirrSolver.calculate(shortCashflows, { subAnnualDaysThreshold: 90 });
  assert.strictEqual(result.status, 'SUB_ANNUAL');
  assert.strictEqual(result.isSubAnnual, true);
  assert.strictEqual(result.xirr, null);
  assert.ok(Math.abs(result.absoluteReturn - 0.05) < 1e-4);
});

test('XirrSolver rejects one-sided cash flows without crashing', () => {
  const onlyOutflows = [
    { date: '2024-01-01', amount: -100000 },
    { date: '2024-06-01', amount: -50000 }
  ];

  const result = XirrSolver.calculate(onlyOutflows);
  assert.strictEqual(result.status, 'INVALID_SIGNS');
  assert.strictEqual(result.xirr, null);
});
