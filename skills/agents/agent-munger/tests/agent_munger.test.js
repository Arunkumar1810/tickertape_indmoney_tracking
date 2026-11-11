'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  evaluateMungerValuation,
  analyzeStockWithMunger,
  getMungerDiagnostics,
  recordMungerVerdict
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
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('5. getMungerDiagnostics emits raw metrics and checks without closed verdict', async () => {
  const diag = await getMungerDiagnostics('INFY', {
    financials: SAMPLE_INFY,
    noPortfolio: true
  });

  assert.equal(diag.ticker, 'INFY');
  assert.ok(Array.isArray(diag.principles));
  assert.equal(diag.principles.length, 4);

  const inv = diag.principles.find(p => p.principle_id === 'inversion-failure');
  assert.ok(inv);
  assert.ok(Array.isArray(inv.checks));
  assert.equal(inv.checks[0].status, 'PASS');

  assert.equal(diag.verdict, undefined);
  assert.equal(diag.composite_score, undefined);
  assert.equal(diag.stance, undefined);
});

test('6. recordMungerVerdict accepts reasoned AI verdict and writes validated UniformVerdictContract', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'munger-record-test-'));
  const reasonedInput = {
    canonical_stance: 'STRONG_BUY',
    actionable_call: 'BUY',
    score: 90.0,
    call_reason: 'Unmatched 44% ROIC moat, zero debt distress, and un-diluted managerial incentives.',
    folksy_verdict: '“It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid.”',
    summary: 'STRONG_BUY: Unmatched 44% ROIC moat, zero debt distress, and un-diluted managerial incentives.',
    positive: ['Pristine fortress balance sheet with net cash.', 'Entrenched pricing power across enterprise relationships.'],
    negative: ['Global discretionary IT services spending pauses during recessions.'],
    observations: ['Excellent capital allocation track record and shareholder alignment.']
  };

  const res = await recordMungerVerdict('INFY', reasonedInput, {
    financials: SAMPLE_INFY,
    out: tmpDir,
    noPortfolio: true
  });

  assert.equal(res.ticker, 'INFY');
  assert.equal(res.verdict.stance, 'STRONG_BUY');
  assert.equal(res.verdict.score, 90.0);
  assert.equal(res.verdict.positive.length, 2);
  assert.equal(res.verdict.negative.length, 1);
  assert.equal(res.verdict.observations.length, 1);

  assert.ok(fs.existsSync(res.artifacts.json));
  assert.ok(fs.existsSync(res.artifacts.html));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

