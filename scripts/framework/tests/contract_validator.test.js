'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  loadContractSchema,
  validateNormalizedFinancials,
  validateUniformVerdict,
  validateUniformVerdictBatch,
  validateAccountHoldingsSnapshot,
  validateBlendedHoldings,
  validateStrategyXirr,
  validateVerdictSynthesis,
  validateConsolidatedPortfolio
} = require('../index');

function createValidEquityFinancials(overrides = {}) {
  return {
    ticker: 'INFY',
    name: 'Infosys Limited',
    exchange: 'NSE',
    market: 'IN',
    currency: 'INR',
    unit_scale: 'CRORES',
    sector: 'Information Technology',
    industry: 'IT Services & Consulting',
    timestamp: '2026-11-07T10:00:00.000Z',
    is_index_etf: false,
    source_provider: 'tickertape',
    market_data: {
      cmp: 1850.5,
      market_cap: 768000,
      shares_outstanding: 415,
      eps_ttm: 64.2,
      bvps: 215.4,
      pe_ttm: 28.82,
      pb_ttm: 8.59,
      ev_ebitda: 19.4,
      dividend_yield_pct: 2.1,
      beta: 0.78,
      historical_pe_5y_median: 26.5,
      historical_pb_5y_median: 7.9,
      eps_growth_5y_cagr_pct: 11.4,
      revenue_growth_5y_cagr_pct: 12.1
    },
    income_statement: {
      revenue: 153670,
      ebitda: 36420,
      ebit: 31800,
      interest_expense: 470,
      ebt: 35900,
      tax_expense: 9650,
      net_income: 26250,
      eps: 63.25
    },
    balance_sheet: {
      cash_and_equivalents: 38500,
      accounts_receivable: 30100,
      inventory: 0,
      total_current_assets: 89200,
      goodwill: 7300,
      intangible_assets: 1950,
      total_assets: 137800,
      short_term_debt: 1800,
      long_term_debt: 6500,
      total_debt: 8300,
      debt_maturing_24m: 2400,
      total_current_liabilities: 38900,
      total_liabilities: 48400,
      retained_earnings: 76500,
      total_equity: 89400
    },
    cash_flow: {
      operating_cash_flow: 28900,
      capital_expenditure: 2450,
      maintenance_capex: 1800,
      free_cash_flow: 26450,
      stock_based_compensation: 620,
      dividends_paid: 14800,
      share_repurchases: 0
    },
    forensics: {
      promoter_holding_pct: 14.78,
      promoter_pledge_pct: 0.0,
      promoter_holding_qoq_delta_pct: -0.1,
      related_party_transactions_pct: 1.2,
      auditor_resignation_flag: false,
      qualified_opinion_flag: false,
      beneish_m_score: -2.48,
      sloan_accrual_ratio: -0.02,
      dso_yoy_expansion_pct: 1.5,
      inventory_growth_vs_sales_delta_pct: 0.0,
      surveillance_stage: 'NONE'
    },
    ...overrides
  };
}

function createValidVerdict(overrides = {}) {
  return {
    principle: 'graham',
    ticker: 'INFY',
    timestamp: '2026-11-07T10:05:00.000Z',
    score: 78.5,
    stance: 'BUY',
    is_veto: false,
    metrics: {
      graham_number: 1762.4,
      margin_of_safety_pct: 12.5,
      ncav_per_share: 98.2
    },
    red_flags: [],
    summary: 'Trading near intrinsic floor with clean balance sheet.',
    ...overrides
  };
}

test('JSON Schema files load and parse cleanly', () => {
  const finSchema = loadContractSchema('financials');
  const verdictSchema = loadContractSchema('verdict');
  const blendedSchema = loadContractSchema('blended-holdings');
  const xirrSchema = loadContractSchema('strategy-xirr');
  assert.equal(finSchema.title, 'NormalizedCompanyFinancials');
  assert.equal(verdictSchema.title, 'UniformVerdictContract');
  assert.equal(blendedSchema.title, 'StrategyHoldingsBlended');
  assert.equal(xirrSchema.title, 'StrategyXirrReport');
});

test('Scenario: Valid Indian and US equity financial payloads pass validation', () => {
  const inPayload = createValidEquityFinancials();
  const inRes = validateNormalizedFinancials(inPayload);
  assert.equal(inRes.ok, true);
  assert.equal(inRes.errors.length, 0);

  const usPayload = createValidEquityFinancials({
    ticker: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    market: 'US',
    currency: 'USD',
    unit_scale: 'MILLIONS',
    forensics: {
      promoter_holding_pct: null,
      promoter_pledge_pct: null,
      auditor_resignation_flag: false,
      qualified_opinion_flag: false,
      beneish_m_score: -2.61,
      sloan_accrual_ratio: -0.04
    }
  });
  const usRes = validateNormalizedFinancials(usPayload);
  assert.equal(usRes.ok, true);
  assert.equal(usRes.errors.length, 0);
});

test('Scenario: Missing required financial statement section fails for non-ETF equity', () => {
  const payload = createValidEquityFinancials();
  delete payload.balance_sheet;
  delete payload.cash_flow;

  const res = validateNormalizedFinancials(payload);
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some(
      (e) => e.code === 'ERR_MISSING_REQUIRED_SECTION' && e.path === 'balance_sheet'
    )
  );
  assert.ok(
    res.errors.some(
      (e) => e.code === 'ERR_MISSING_REQUIRED_SECTION' && e.path === 'cash_flow'
    )
  );
});

test('Scenario: Invalid market price or share count fails numeric constraints', () => {
  const payload = createValidEquityFinancials({
    market_data: {
      cmp: 0,
      shares_outstanding: -10
    }
  });

  const res = validateNormalizedFinancials(payload);
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some(
      (e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'market_data.cmp'
    )
  );
  assert.ok(
    res.errors.some(
      (e) =>
        e.code === 'ERR_NUMERIC_CONSTRAINT' &&
        e.path === 'market_data.shares_outstanding'
    )
  );
});

test('Scenario: Valid index ETF payload passes without single-company GAAP statements', () => {
  const etfPayload = {
    ticker: 'NIFTYBEES',
    name: 'Nippon India ETF Nifty 50 BeES',
    exchange: 'NSE',
    market: 'IN',
    currency: 'INR',
    timestamp: '2026-11-07T10:00:00.000Z',
    is_index_etf: true,
    market_data: {
      cmp: 274.35,
      pe_ttm: 22.4,
      pb_ttm: 3.5
    },
    income_statement: null,
    balance_sheet: null,
    cash_flow: null,
    forensics: null
  };

  const res = validateNormalizedFinancials(etfPayload);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.is_index_etf, true);
});

test('Scenario: Valid valuation principle verdict passes validation', () => {
  const verdict = createValidVerdict();
  const res = validateUniformVerdict(verdict);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
});

test('Scenario: Score out of range fails UniformVerdictContract validation', () => {
  const highRes = validateUniformVerdict(createValidVerdict({ score: 105 }));
  assert.equal(highRes.ok, false);
  assert.ok(highRes.errors.some((e) => e.code === 'ERR_SCORE_OUT_OF_RANGE'));

  const lowRes = validateUniformVerdict(createValidVerdict({ score: -5 }));
  assert.equal(lowRes.ok, false);
  assert.ok(lowRes.errors.some((e) => e.code === 'ERR_SCORE_OUT_OF_RANGE'));
});

test('Scenario: Forensic governance veto verdict and stance-veto consistency checks', () => {
  // Valid VETO_DISQUALIFIED with is_veto: true
  const validVeto = createValidVerdict({
    principle: 'forensic_governance',
    score: 10,
    stance: 'VETO_DISQUALIFIED',
    is_veto: true,
    red_flags: ['Promoter pledge > 50%', 'Mid-term auditor resignation']
  });
  assert.equal(validateUniformVerdict(validVeto).ok, true);

  // Inconsistent: VETO_DISQUALIFIED with is_veto: false
  const badVetoFalse = createValidVerdict({
    principle: 'forensic_governance',
    score: 10,
    stance: 'VETO_DISQUALIFIED',
    is_veto: false
  });
  const res1 = validateUniformVerdict(badVetoFalse);
  assert.equal(res1.ok, false);
  assert.ok(res1.errors.some((e) => e.code === 'ERR_STANCE_VETO_MISMATCH'));

  // Inconsistent: PASS with is_veto: true
  const badPassVeto = createValidVerdict({
    principle: 'forensic_governance',
    score: 95,
    stance: 'PASS',
    is_veto: true
  });
  const res2 = validateUniformVerdict(badPassVeto);
  assert.equal(res2.ok, false);
  assert.ok(res2.errors.some((e) => e.code === 'ERR_STANCE_VETO_MISMATCH'));
});

test('Scenario: Valuation pillar attempting to set veto flag or use gatekeeper stance fails', () => {
  const grahamVeto = createValidVerdict({
    principle: 'graham',
    stance: 'STRONG_SELL',
    is_veto: true
  });
  const res1 = validateUniformVerdict(grahamVeto);
  assert.equal(res1.ok, false);
  assert.ok(res1.errors.some((e) => e.code === 'ERR_STANCE_VETO_MISMATCH'));

  const lynchPass = createValidVerdict({
    principle: 'lynch',
    stance: 'PASS',
    is_veto: false
  });
  const res2 = validateUniformVerdict(lynchPass);
  assert.equal(res2.ok, false);
  assert.ok(res2.errors.some((e) => e.code === 'ERR_INVALID_STANCE'));
});

test('Scenario: Consolidated portfolio verdict batch validation (valid + duplicate ticker + principle mismatch)', () => {
  const validBatch = {
    principle: 'lynch',
    timestamp: '2026-11-07T10:15:00.000Z',
    verdicts: [
      createValidVerdict({ principle: 'lynch', ticker: 'INFY', stance: 'BUY' }),
      createValidVerdict({ principle: 'lynch', ticker: 'TCS', stance: 'HOLD' })
    ]
  };
  const okRes = validateUniformVerdictBatch(validBatch);
  assert.equal(okRes.ok, true);
  assert.equal(okRes.summary.uniqueTickers, 2);

  const badBatch = {
    principle: 'lynch',
    timestamp: '2026-11-07T10:15:00.000Z',
    verdicts: [
      createValidVerdict({ principle: 'lynch', ticker: 'INFY', stance: 'BUY' }),
      createValidVerdict({ principle: 'graham', ticker: 'INFY', stance: 'HOLD' })
    ]
  };
  const badRes = validateUniformVerdictBatch(badBatch);
  assert.equal(badRes.ok, false);
  assert.ok(badRes.errors.some((e) => e.code === 'ERR_DUPLICATE_TICKER_IN_BATCH'));
  assert.ok(badRes.errors.some((e) => e.code === 'ERR_BATCH_PRINCIPLE_MISMATCH'));
});

test('Scenario: CLI contract validation interface in JSON mode returns exit 0 for valid and exit 1 for invalid', () => {
  const cliScript = path.join(__dirname, '..', 'contract_validator.js');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-validator-test-'));

  try {
    const validFile = path.join(tmpDir, 'valid-verdict.json');
    fs.writeFileSync(validFile, JSON.stringify(createValidVerdict()), 'utf8');

    const okProc = spawnSync(
      process.execPath,
      [cliScript, '--type', 'verdict', '--file', validFile, '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(okProc.status, 0);
    const okOut = JSON.parse(okProc.stdout);
    assert.equal(okOut.ok, true);

    const invalidFile = path.join(tmpDir, 'invalid-verdict.json');
    fs.writeFileSync(
      invalidFile,
      JSON.stringify(createValidVerdict({ score: 150, is_veto: true })),
      'utf8'
    );

    const failProc = spawnSync(
      process.execPath,
      [cliScript, '--type', 'verdict', '--file', invalidFile, '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(failProc.status, 1);
    const failOut = JSON.parse(failProc.stdout);
    assert.equal(failOut.ok, false);
    assert.ok(Array.isArray(failOut.errors) && failOut.errors.length >= 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Scenario: Valid AccountHoldingsSnapshot passes validation for IN and US accounts', () => {
  const inSnapshot = {
    account_id: 'angelone',
    broker: 'angelone',
    currency: 'INR',
    timestamp: '2026-11-07T10:00:00.000Z',
    summary: {
      total_invested: 5214.95,
      total_current_value: 5769.0,
      unrealized_pnl: 554.05,
      unrealized_pnl_pct: 10.62,
      available_cash: 1500.0,
      total_account_equity: 7269.0,
      holdings_count: 1
    },
    margin: {
      available_cash: 1500.0,
      collateral: 0,
      utilised: 0,
      net_margin: 1500.0
    },
    holdings: [
      {
        ticker: 'INFY',
        name: 'Infosys Ltd',
        isin: 'INE009A01021',
        exchange: 'NSE',
        quantity: 5,
        average_price: 1042.99,
        cmp: 1153.8,
        invested_value: 5214.95,
        current_value: 5769.0,
        unrealized_pnl: 554.05,
        unrealized_pnl_pct: 10.62,
        weight_pct: 100.0
      }
    ]
  };

  const inRes = validateAccountHoldingsSnapshot(inSnapshot);
  assert.equal(inRes.ok, true);
  assert.equal(inRes.errors.length, 0);

  const usSnapshot = {
    account_id: 'indmoney_us',
    broker: 'indmoney',
    currency: 'USD',
    timestamp: '2026-11-07T10:00:00.000Z',
    summary: {
      total_invested: 150.25,
      total_current_value: 175.5,
      unrealized_pnl: 25.25,
      unrealized_pnl_pct: 16.8,
      available_cash: 50.0,
      total_account_equity: 225.5,
      holdings_count: 1
    },
    margin: {
      available_cash: 50.0,
      collateral: 0,
      utilised: 0,
      net_margin: 50.0
    },
    holdings: [
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        isin: 'US0378331005',
        exchange: 'NASDAQ',
        quantity: 0.75,
        average_price: 200.33,
        cmp: 234.0,
        invested_value: 150.25,
        current_value: 175.5,
        unrealized_pnl: 25.25,
        unrealized_pnl_pct: 16.8,
        weight_pct: 100.0,
        fractional_shares: true
      }
    ]
  };

  const usRes = validateAccountHoldingsSnapshot(usSnapshot);
  assert.equal(usRes.ok, true);
  assert.equal(usRes.errors.length, 0);
});

test('Scenario: Invalid AccountHoldingsSnapshot fails validation', () => {
  const badSnapshot = {
    account_id: 'angelone',
    broker: 'angelone',
    currency: 'INDIAN_RUPEE', // invalid currency code (not 3-letter)
    timestamp: '2026-11-07T10:00:00.000Z',
    summary: {
      total_invested: -100 // invalid negative
    },
    margin: null, // missing required object
    holdings: [
      {
        ticker: 'INFY',
        quantity: 0 // invalid non-positive
      }
    ]
  };

  const res = validateAccountHoldingsSnapshot(badSnapshot);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_CURRENCY'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'margin'));
});

test('Scenario: Valid StrategyHoldingsBlended passes validation', () => {
  const validBlended = {
    strategy_id: 'fundamental_lts',
    timestamp: '2026-11-08T12:00:00.000Z',
    base_currency: 'INR',
    summary: {
      total_invested: 250000.0,
      total_current_value: 295000.0,
      unrealized_pnl: 45000.0,
      unrealized_pnl_pct: 18.0,
      pooled_cash: 35000.0,
      total_strategy_equity: 330000.0,
      positions_count: 2
    },
    accounts_blended: [
      {
        account_id: 'angelone',
        broker: 'angelone',
        original_currency: 'INR',
        raw_cash: 20000.0,
        fx_rate: 1.0,
        pooled_cash_contribution: 20000.0,
        holdings_count: 1
      },
      {
        account_id: 'indmoney_us',
        broker: 'indmoney',
        original_currency: 'USD',
        raw_cash: 172.02,
        fx_rate: 87.2,
        pooled_cash_contribution: 15000.0,
        holdings_count: 1
      }
    ],
    positions: [
      {
        ticker: 'INFY',
        name: 'Infosys Limited',
        isin: 'INE009A01021',
        exchange: 'NSE',
        market: 'IN',
        quantity: 100,
        average_price: 1500.0,
        cmp: 1800.0,
        invested_value: 150000.0,
        current_value: 180000.0,
        unrealized_pnl: 30000.0,
        unrealized_pnl_pct: 20.0,
        weight_pct: 61.02,
        attribution: [
          {
            account_id: 'angelone',
            broker: 'angelone',
            quantity: 100,
            average_price: 1500.0,
            original_currency: 'INR',
            fx_rate: 1.0,
            cost_in_base_currency: 1500.0,
            invested_value_base: 150000.0,
            current_value_base: 180000.0,
            weight_in_position_pct: 100.0
          }
        ]
      },
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        isin: 'US0378331005',
        exchange: 'NASDAQ',
        market: 'US',
        quantity: 5.5,
        average_price: 18181.82,
        cmp: 20909.09,
        invested_value: 100000.0,
        current_value: 115000.0,
        unrealized_pnl: 15000.0,
        unrealized_pnl_pct: 15.0,
        weight_pct: 38.98,
        attribution: [
          {
            account_id: 'indmoney_us',
            broker: 'indmoney',
            quantity: 5.5,
            average_price: 208.51,
            original_currency: 'USD',
            fx_rate: 87.2,
            cost_in_base_currency: 18181.82,
            invested_value_base: 100000.0,
            current_value_base: 115000.0,
            weight_in_position_pct: 100.0
          }
        ]
      }
    ]
  };

  const res = validateBlendedHoldings(validBlended);
  assert.equal(res.ok, true, `Validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.positionsCount, 2);
  assert.equal(res.summary.accountsCount, 2);
});

test('Scenario: Invalid StrategyHoldingsBlended fails validation', () => {
  const badBlended = {
    strategy_id: '', // empty
    timestamp: '2026-11-08T12:00:00.000Z',
    base_currency: 'RUPEES', // invalid
    summary: {
      total_invested: -500 // invalid negative
    },
    accounts_blended: 'not-an-array',
    positions: [
      {
        ticker: 'INFY',
        quantity: -10, // negative quantity
        attribution: [] // empty attribution
      }
    ]
  };

  const res = validateBlendedHoldings(badBlended);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'strategy_id'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_CURRENCY'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'summary.total_invested'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'accounts_blended'));
});

test('Scenario: Valid StrategyXirrReport passes validation', () => {
  const validReport = {
    strategy_id: 'fundamental_lts',
    timestamp: '2026-11-08T12:00:00.000Z',
    base_currency: 'INR',
    eval_date: '2026-11-08',
    xirr: 0.185,
    xirr_annualized: 18.5,
    absolute_return: 22.4,
    total_deposited: 500000.0,
    total_withdrawn: 50000.0,
    net_invested: 450000.0,
    terminal_equity: 550800.0,
    days_held: 365,
    is_sub_annual: false,
    friction_breakdown: {
      brokerage: 1250.0,
      stt: 980.0,
      fx_drag: 1450.0,
      taxes_and_charges: 620.0,
      total_friction: 4300.0,
      friction_drag_pct: 0.85
    },
    account_cashflows_summary: [
      {
        account_id: 'angelone_demat',
        broker: 'Angel One',
        original_currency: 'INR',
        fx_rate: 1.0,
        total_deposited_base: 300000.0,
        total_withdrawn_base: 50000.0,
        internal_transfers_netted_base: 0.0,
        friction_base: 2200.0
      },
      {
        account_id: 'indmoney_us',
        broker: 'INDmoney / DriveWealth',
        original_currency: 'USD',
        fx_rate: 87.2,
        total_deposited_base: 200000.0,
        total_withdrawn_base: 0.0,
        internal_transfers_netted_base: 0.0,
        friction_base: 2100.0
      }
    ],
    cashflows: [
      {
        date: '2025-11-08',
        amount: -300000.0,
        category: 'DEPOSIT',
        account_id: 'angelone_demat',
        description: 'Bank Deposit to Angel One Demat',
        original_amount: -300000.0,
        original_currency: 'INR',
        fx_rate: 1.0
      },
      {
        date: '2025-12-01',
        amount: -200000.0,
        category: 'DEPOSIT',
        account_id: 'indmoney_us',
        description: 'LRS Transfer to US Brokerage',
        original_amount: -2293.58,
        original_currency: 'USD',
        fx_rate: 87.2
      },
      {
        date: '2026-06-15',
        amount: 50000.0,
        category: 'WITHDRAWAL',
        account_id: 'angelone_demat',
        description: 'Payout to Investor Bank',
        original_amount: 50000.0,
        original_currency: 'INR',
        fx_rate: 1.0
      },
      {
        date: '2026-11-08',
        amount: 550800.0,
        category: 'TERMINAL_EQUITY',
        account_id: 'fundamental_lts',
        description: 'Terminal Portfolio Valuation (Equity + Pooled Cash)'
      }
    ]
  };

  const res = validateStrategyXirr(validReport);
  assert.equal(res.ok, true, `Validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.strategy_id, 'fundamental_lts');
  assert.equal(res.summary.cashflowsCount, 4);
  assert.equal(res.summary.accountsCount, 2);
});

test('Scenario: Invalid StrategyXirrReport fails validation', () => {
  const badReport = {
    strategy_id: '', // empty
    timestamp: '2026-11-08T12:00:00.000Z',
    base_currency: 'RUPEES', // invalid currency
    eval_date: 'invalid-date', // invalid date
    xirr: 'not-a-number', // string instead of number or null
    xirr_annualized: -10,
    absolute_return: 20,
    total_deposited: -100, // negative deposited
    total_withdrawn: 0,
    net_invested: 0,
    terminal_equity: -50, // negative terminal equity
    days_held: -5, // negative days
    is_sub_annual: 'yes', // not a boolean
    friction_breakdown: 'not-an-object',
    account_cashflows_summary: 'not-an-array',
    cashflows: [
      {
        date: '2026-11-08',
        amount: 'bad-amount',
        category: 'INVALID_CATEGORY',
        account_id: '',
        description: 123
      }
    ]
  };

  const res = validateStrategyXirr(badReport);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'strategy_id'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_CURRENCY' && e.path === 'base_currency'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'eval_date'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'xirr'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'total_deposited'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'terminal_equity'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'is_sub_annual'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'friction_breakdown'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'account_cashflows_summary'));
});

test('Scenario: Valid StrategyVerdictSynthesis passes validation', () => {
  const validSynthesis = {
    strategy_id: 'fundamental_lts',
    timestamp: '2026-11-08T12:00:00.000Z',
    eval_date: '2026-11-08',
    summary: {
      portfolio_health_score: 78.5,
      total_positions: 2,
      disqualified_count: 0,
      needs_review_count: 0,
      approved_count: 2,
      capital_at_risk: 0.0
    },
    portfolio_verdicts: [
      {
        ticker: 'INFY',
        name: 'Infosys Limited',
        market: 'IN',
        synthesized_score: 82.5,
        synthesized_stance: 'STRONG_BUY',
        is_disqualified: false,
        guardrail_triggered: false,
        gatekeeper_verdict: {
          principle: 'forensic_governance',
          stance: 'PASS',
          is_veto: false,
          score: 88.0,
          red_flags: []
        },
        pillar_verdicts: {
          graham: {
            score: 75.0,
            stance: 'BUY',
            weight: 0.25,
            weighted_score: 18.75,
            red_flags: []
          },
          buffett_munger: {
            score: 85.0,
            stance: 'STRONG_BUY',
            weight: 0.75,
            weighted_score: 63.75,
            red_flags: []
          }
        },
        notes: ['Clean forensic pass', 'Solid compounding fundamentals'],
        recommended_allocation_pct: 60.0
      },
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        market: 'US',
        synthesized_score: 72.0,
        synthesized_stance: 'BUY',
        is_disqualified: false,
        guardrail_triggered: false,
        gatekeeper_verdict: {
          principle: 'forensic_governance',
          stance: 'PASS',
          is_veto: false,
          score: 92.0,
          red_flags: []
        },
        pillar_verdicts: {
          buffett_munger: {
            score: 80.0,
            stance: 'BUY',
            weight: 1.0,
            weighted_score: 80.0,
            red_flags: []
          }
        },
        notes: ['High capital allocation quality'],
        recommended_allocation_pct: 40.0
      }
    ],
    allocations: [
      {
        ticker: 'INFY',
        current_weight_pct: 55.0,
        recommended_weight_pct: 60.0,
        action: 'INCREASE'
      },
      {
        ticker: 'AAPL',
        current_weight_pct: 45.0,
        recommended_weight_pct: 40.0,
        action: 'TRIM'
      }
    ]
  };

  const res = validateVerdictSynthesis(validSynthesis);
  assert.equal(res.ok, true, `Validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.strategy_id, 'fundamental_lts');
  assert.equal(res.summary.total_positions, 2);
  assert.equal(res.summary.disqualified_count, 0);
  assert.equal(res.summary.approved_count, 2);
});

test('Scenario: Invalid StrategyVerdictSynthesis fails validation with specific error codes', () => {
  const badSynthesis = {
    strategy_id: '',
    timestamp: 'invalid-date',
    eval_date: 'bad-eval-date',
    summary: {
      portfolio_health_score: 150.0, // > 100
      total_positions: -1, // < 0
      disqualified_count: 'none', // not an integer
      needs_review_count: 1.5, // not an integer
      approved_count: -3, // < 0
      capital_at_risk: -100 // < 0
    },
    portfolio_verdicts: [
      {
        ticker: '',
        name: 123, // not a string
        market: 'INVALID',
        synthesized_score: -5,
        synthesized_stance: 'INVALID_STANCE',
        is_disqualified: 'no',
        guardrail_triggered: 0,
        recommended_allocation_pct: 200,
        notes: 'not-an-array',
        gatekeeper_verdict: {
          principle: 'unknown_principle',
          stance: 'UNKNOWN',
          is_veto: 'false',
          score: 110,
          red_flags: 'bad-flags'
        },
        pillar_verdicts: {
          graham: {
            score: -10,
            stance: 'NOT_A_STANCE',
            weight: 2.5,
            weighted_score: -25,
            red_flags: 123
          }
        }
      }
    ],
    allocations: [
      {
        ticker: '',
        current_weight_pct: -5,
        recommended_weight_pct: 120,
        action: 'INVALID_ACTION'
      }
    ]
  };

  const res = validateVerdictSynthesis(badSynthesis);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'strategy_id'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'eval_date'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'summary.portfolio_health_score'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'summary.total_positions'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_MARKET'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_STANCE'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_PRINCIPLE'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_ACTION'));
});

test('Scenario: Valid StrategyConsolidatedPortfolio passes validation', () => {
  const validPortfolio = {
    strategy_id: 'fundamental_lts',
    timestamp: '2026-11-08T12:00:00.000Z',
    eval_date: '2026-11-08',
    base_currency: 'INR',
    summary: {
      total_strategy_equity: 550000.0,
      total_invested_capital: 450000.0,
      unrealized_pnl: 100000.0,
      unrealized_pnl_pct: 22.22,
      xirr: 18.5,
      portfolio_health_score: 82.5,
      total_positions: 2,
      disqualified_count: 0,
      needs_review_count: 0,
      approved_count: 2,
      capital_at_risk: 0.0
    },
    blended_holdings: {
      strategy_id: 'fundamental_lts',
      base_currency: 'INR',
      eval_date: '2026-11-08',
      summary: {},
      positions: [],
      pooled_cash: []
    },
    performance: {
      strategy_id: 'fundamental_lts',
      base_currency: 'INR',
      eval_date: '2026-11-08',
      xirr: 18.5,
      absolute_return: 22.2,
      friction_breakdown: {}
    },
    verdict_synthesis: {
      strategy_id: 'fundamental_lts',
      eval_date: '2026-11-08',
      summary: {},
      portfolio_verdicts: [],
      allocations: []
    },
    embedded_audits: {
      INFY: {
        ticker: 'INFY',
        name: 'Infosys Limited',
        market: 'IN',
        synthesized_stance: 'STRONG_BUY',
        synthesized_score: 85.0,
        gatekeeper_verdict: {
          principle: 'forensic_governance',
          stance: 'PASS',
          is_veto: false,
          score: 92.0
        },
        pillar_verdicts: {
          graham: { score: 75.0, stance: 'BUY' }
        },
        notes: ['Pristine fundamentals']
      }
    }
  };

  const res = validateConsolidatedPortfolio(validPortfolio);
  assert.equal(res.ok, true, `Validation failed: ${JSON.stringify(res.errors)}`);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.strategy_id, 'fundamental_lts');
  assert.equal(res.summary.total_strategy_equity, 550000.0);
  assert.equal(res.summary.approved_count, 2);
});

test('Scenario: Invalid StrategyConsolidatedPortfolio fails validation with specific error codes', () => {
  const badPortfolio = {
    strategy_id: '',
    timestamp: 'bad-timestamp',
    eval_date: 'invalid-date',
    base_currency: 'RUPEES',
    summary: {
      total_strategy_equity: -100,
      total_invested_capital: -50,
      unrealized_pnl: 'none',
      unrealized_pnl_pct: 'none',
      xirr: 'invalid',
      portfolio_health_score: 120,
      total_positions: -1,
      disqualified_count: 1.5,
      needs_review_count: -2,
      approved_count: 'bad',
      capital_at_risk: -500
    },
    blended_holdings: 'not-an-object',
    performance: 'not-an-object',
    verdict_synthesis: 'not-an-object',
    embedded_audits: {
      INFY: {
        ticker: '',
        synthesized_score: -5
      }
    }
  };

  const res = validateConsolidatedPortfolio(badPortfolio);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'strategy_id'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_FIELD' && e.path === 'eval_date'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_INVALID_CURRENCY' && e.path === 'base_currency'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'summary.total_strategy_equity'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_NUMERIC_CONSTRAINT' && e.path === 'summary.portfolio_health_score'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'blended_holdings'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'performance'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_TYPE_MISMATCH' && e.path === 'verdict_synthesis'));
});


