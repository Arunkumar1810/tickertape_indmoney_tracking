'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateXirr,
  evalNpv,
  solveBisection,
  aggregateAccountLedgers,
  resolveFxRate,
  calculateFrictionBreakdown
} = require('../index');

test('1. framework xirr_math: Exact mathematical convergence with known cashflow stream', () => {
  const cashflows = [
    { date: '2024-01-01', amount: -100000.0 },
    { date: '2025-01-01', amount: 110000.0 }
  ];

  const result = calculateXirr(cashflows);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.is_sub_annual, false);
  assert.equal(result.days_held, 366);
  assert.equal(result.absolute_return, 10.0);
  assert.ok(result.xirr_annualized >= 9.9 && result.xirr_annualized <= 10.1);
});

test('2. framework xirr_math: Sub-90-day guardrail suppression', () => {
  const cashflows = [
    { date: '2025-01-01', amount: -100000.0 },
    { date: '2025-01-21', amount: 105000.0 }
  ];

  const result = calculateXirr(cashflows, { subAnnualDaysThreshold: 90 });
  assert.equal(result.status, 'SUB_ANNUAL');
  assert.equal(result.is_sub_annual, true);
  assert.equal(result.xirr, null);
  assert.equal(result.xirr_annualized, null);
  assert.equal(result.days_held, 20);
  assert.equal(result.absolute_return, 5.0);
});

test('3. framework ledger_aggregator: FX resolution and transfer netting', () => {
  assert.equal(resolveFxRate('INR', 'INR'), 1.0);
  assert.equal(resolveFxRate('USD', 'INR'), 87.2);

  const ledgers = [
    {
      account_id: 'acc_in',
      broker: 'angelone',
      currency: 'INR',
      transactions: [
        { date: '2025-01-01', amount: -50000, category: 'DEPOSIT' },
        { date: '2025-01-15', amount: 10000, category: 'INTERNAL_TRANSFER', transfer_id: 'TRF01' }
      ]
    },
    {
      account_id: 'acc_us',
      broker: 'indmoney',
      currency: 'INR',
      transactions: [
        { date: '2025-01-15', amount: -10000, category: 'INTERNAL_TRANSFER', transfer_id: 'TRF01' }
      ]
    }
  ];

  const agg = aggregateAccountLedgers(ledgers, {
    strategyId: 'test_strategy',
    baseCurrency: 'INR',
    terminalEquity: 60000
  });

  // Transfer should be netted out, only the -50000 deposit and +60000 terminal equity remain in cashflows
  assert.equal(agg.cashflows.length, 2);
  assert.equal(agg.total_deposited, 50000);
  assert.equal(agg.terminal_equity, 60000);
});

test('4. framework friction_tracker: Breakdown calculation', () => {
  const ledgers = [
    {
      account_id: 'acc_in',
      currency: 'INR',
      friction_summary: {
        brokerage: 100,
        stt: 50,
        fx_drag: 0,
        taxes_and_charges: 20,
        total_friction: 170
      }
    }
  ];

  const friction = calculateFrictionBreakdown(ledgers, {
    baseCurrency: 'INR',
    netInvested: 10000
  });

  assert.equal(friction.brokerage, 100);
  assert.equal(friction.stt, 50);
  assert.equal(friction.total_friction, 170);
  assert.equal(friction.friction_drag_pct, 1.7);
});

