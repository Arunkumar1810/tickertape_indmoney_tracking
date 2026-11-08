const test = require('node:test');
const assert = require('node:assert');
const FrictionEngine = require('../scripts/lib/friction_engine');

test('FrictionEngine calculates True Investor XIRR, Per-Stock XIRR, and Friction Drag', () => {
  const fundCashflows = [
    { date: '2024-01-01', amount: -200000, category: 'PAYIN' },
    { date: '2024-06-01', amount: -100000, category: 'PAYIN' },
    { date: '2024-11-01', amount: 30000, category: 'PAYOUT' }
  ];

  const holdings = [
    {
      tradingsymbol: 'TCS',
      isin: 'INE467B01029',
      quantity: 50,
      average_price: 3600,
      last_price: 4200,
      invested: 180000,
      current_value: 210000
    },
    {
      tradingsymbol: 'INFY',
      isin: 'INE009A01021',
      quantity: 40,
      average_price: 1500,
      last_price: 1800,
      invested: 60000,
      current_value: 72000
    }
  ];

  const margin = {
    available_cash: 50000,
    net_margin: 50000
  };

  const groupedTrades = {
    'INE467B01029': {
      symbol: 'TCS',
      trades: [
        { date: '2024-01-10', type: 'BUY', quantity: 50, price: 3600, amount: 180000 }
      ]
    },
    'INE009A01021': {
      symbol: 'INFY',
      trades: [
        { date: '2024-06-10', type: 'BUY', quantity: 40, price: 1500, amount: 60000 }
      ]
    }
  };

  const result = FrictionEngine.analyze({
    evalDate: '2025-01-01',
    fundCashflows,
    holdings,
    margin,
    groupedTrades,
    subAnnualDaysThreshold: 90
  });

  assert.strictEqual(result.summary.totalDeposited, 300000);
  assert.strictEqual(result.summary.totalWithdrawn, 30000);
  assert.strictEqual(result.summary.totalHoldingsMarketValue, 282000);
  assert.strictEqual(result.summary.availableCash, 50000);
  assert.strictEqual(result.summary.totalAccountEquity, 332000);

  // Profit = 332,000 + 30,000 - 300,000 = 62,000
  assert.strictEqual(result.summary.netProfit, 62000);

  // True Investor XIRR should be positive and converged
  assert.ok(result.summary.investorXirr !== null);
  assert.ok(result.summary.investorXirr > 0.15 && result.summary.investorXirr < 0.40);

  // Holdings matrix
  assert.strictEqual(result.holdings.length, 2);
  assert.strictEqual(result.holdings[0].symbol, 'TCS');
  assert.ok(result.holdings[0].xirr !== null);
  assert.ok(result.holdings[1].xirr !== null);
});
