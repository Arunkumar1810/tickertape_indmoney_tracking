'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  evaluateMungerValuation,
  analyzeStockWithMunger
} = require('../scripts/orchestrate_munger_analysis');

const SAMPLE_INFY = {
  ticker: 'INFY',
  name: 'Infosys Ltd',
  market: 'IN',
  currency: 'INR',
  unit_scale: 'CRORES',
  income_statement: {
    revenue: 182972,
    ebit: 40411,
    interest_expense: 416,
    net_income: 29440
  },
  balance_sheet: {
    total_assets: 145000,
    total_equity: 85000,
    total_debt: 8500,
    cash_and_equivalents: 15000,
    goodwill_intangibles: 0
  },
  cash_flow: {
    operating_cash_flow: 33986,
    capital_expenditure: 2694,
    stock_based_compensation: 0
  },
  valuation: {
    pe_ratio: 24.5,
    market_cap: 620000
  }
};

const VALUE_TRAP_COMPANY = {
  ticker: 'TRAP',
  name: 'Cigar Butt Corp',
  market: 'US',
  currency: 'USD',
  unit_scale: 'MILLIONS',
  income_statement: {
    revenue: 1000,
    ebit: 20,
    interest_expense: 15,
    net_income: 4
  },
  balance_sheet: {
    total_assets: 2000,
    total_equity: 500,
    total_debt: 1200,
    cash_and_equivalents: 20,
    goodwill_intangibles: 600
  },
  cash_flow: {
    operating_cash_flow: 15,
    capital_expenditure: 30,
    stock_based_compensation: 10
  },
  valuation: {
    pe_ratio: 6.0,
    market_cap: 300
  }
};

test('1. evaluateMungerValuation evaluates high-quality compounder with STRONG_BUY', () => {
  const result = evaluateMungerValuation(SAMPLE_INFY);
  assert.equal(result.principle, 'munger');
  assert.equal(result.ticker, 'INFY');
  assert.ok(result.score >= 80, `Expected high score, got ${result.score}`);
  assert.equal(result.stance, 'STRONG_BUY');
  assert.equal(result.is_veto, false);
  assert.equal(result.audit.length, 4);
});

test('2. evaluateMungerValuation rejects value trap / cigar butt with STRONG_SELL / REDUCE', () => {
  const result = evaluateMungerValuation(VALUE_TRAP_COMPANY);
  assert.equal(result.principle, 'munger');
  assert.ok(result.score < 50, `Expected low score on value trap, got ${result.score}`);
  assert.ok(result.stance === 'STRONG_SELL' || result.stance === 'REDUCE');
  assert.ok(result.red_flags.length > 0);
});

test('3. Index ETF bypasses corporate single-stock failure modes', () => {
  const etf = { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', is_index_etf: true };
  const result = evaluateMungerValuation(etf);
  assert.equal(result.score, 100);
  assert.equal(result.stance, 'HOLD');
  assert.equal(result.red_flags.length, 0);
});

test('4. analyzeStockWithMunger generates Pasadena wisdom and valid artifacts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'munger-test-'));
  const res = await analyzeStockWithMunger('INFY', {
    out: tmpDir,
    noPortfolio: true
  });
  assert.equal(res.ticker, 'INFY');
  assert.ok(res.folksy_verdict.includes('“'));
  assert.ok(fs.existsSync(res.artifacts.json));
  assert.ok(fs.existsSync(res.artifacts.html));
});
