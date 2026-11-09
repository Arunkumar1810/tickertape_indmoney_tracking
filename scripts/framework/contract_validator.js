'use strict';

const fs = require('fs');
const path = require('path');

const VALID_MARKETS = new Set(['IN', 'US']);
const VALID_CURRENCIES = new Set(['INR', 'USD']);
const VALID_UNIT_SCALES = new Set(['ABSOLUTE', 'CRORES', 'MILLIONS', 'BILLIONS']);

const GATEKEEPER_PRINCIPLES = new Set(['forensic_governance']);
const VALUATION_PRINCIPLES = new Set([
  'graham',
  'lynch',
  'buffett_munger',
  'klarman_solvency'
]);
const ALL_PRINCIPLES = new Set([...GATEKEEPER_PRINCIPLES, ...VALUATION_PRINCIPLES]);

const GATEKEEPER_STANCES = new Set(['PASS', 'FLAG', 'VETO_DISQUALIFIED']);
const VALUATION_STANCES = new Set([
  'STRONG_BUY',
  'BUY',
  'HOLD',
  'REDUCE',
  'STRONG_SELL'
]);

const FINANCIALS_TOP_KEYS = new Set([
  'ticker',
  'name',
  'exchange',
  'market',
  'currency',
  'unit_scale',
  'sector',
  'industry',
  'timestamp',
  'is_index_etf',
  'source_provider',
  'market_data',
  'income_statement',
  'balance_sheet',
  'cash_flow',
  'forensics'
]);

const MARKET_DATA_KEYS = new Set([
  'cmp',
  'market_cap',
  'shares_outstanding',
  'eps_ttm',
  'bvps',
  'pe_ttm',
  'pb_ttm',
  'ev_ebitda',
  'dividend_yield_pct',
  'beta',
  'historical_pe_5y_median',
  'historical_pb_5y_median',
  'eps_growth_5y_cagr_pct',
  'revenue_growth_5y_cagr_pct'
]);

const INCOME_STATEMENT_KEYS = new Set([
  'revenue',
  'ebitda',
  'ebit',
  'interest_expense',
  'ebt',
  'tax_expense',
  'net_income',
  'eps'
]);

const BALANCE_SHEET_KEYS = new Set([
  'cash_and_equivalents',
  'accounts_receivable',
  'inventory',
  'total_current_assets',
  'goodwill',
  'intangible_assets',
  'total_assets',
  'short_term_debt',
  'long_term_debt',
  'total_debt',
  'debt_maturing_24m',
  'total_current_liabilities',
  'total_liabilities',
  'retained_earnings',
  'total_equity'
]);

const CASH_FLOW_KEYS = new Set([
  'operating_cash_flow',
  'capital_expenditure',
  'maintenance_capex',
  'free_cash_flow',
  'stock_based_compensation',
  'dividends_paid',
  'share_repurchases'
]);

const FORENSICS_NUMERIC_KEYS = new Set([
  'promoter_holding_pct',
  'promoter_pledge_pct',
  'promoter_holding_qoq_delta_pct',
  'related_party_transactions_pct',
  'beneish_m_score',
  'sloan_accrual_ratio',
  'dso_yoy_expansion_pct',
  'inventory_growth_vs_sales_delta_pct'
]);

const FORENSICS_BOOLEAN_KEYS = new Set([
  'auditor_resignation_flag',
  'qualified_opinion_flag'
]);

const FORENSICS_STRING_KEYS = new Set(['surveillance_stage']);

const FORENSICS_ALL_KEYS = new Set([
  ...FORENSICS_NUMERIC_KEYS,
  ...FORENSICS_BOOLEAN_KEYS,
  ...FORENSICS_STRING_KEYS
]);

const VERDICT_TOP_REQUIRED_KEYS = new Set([
  'principle',
  'ticker',
  'timestamp',
  'score',
  'stance',
  'is_veto',
  'metrics',
  'red_flags',
  'summary'
]);

const VERDICT_OPTIONAL_KEYS = new Set([
  'verdict',
  'audit',
  'positive',
  'negative',
  'observations',
  'warnings'
]);

const VERDICT_TOP_KEYS = new Set([
  ...VERDICT_TOP_REQUIRED_KEYS,
  ...VERDICT_OPTIONAL_KEYS
]);

const VERDICT_BATCH_TOP_KEYS = new Set(['principle', 'timestamp', 'verdicts']);

const HOLDINGS_SNAPSHOT_TOP_KEYS = new Set([
  'account_id',
  'broker',
  'currency',
  'timestamp',
  'summary',
  'margin',
  'holdings'
]);

const HOLDINGS_SUMMARY_REQUIRED_KEYS = new Set([
  'total_invested',
  'total_current_value',
  'unrealized_pnl',
  'unrealized_pnl_pct',
  'available_cash',
  'total_account_equity',
  'holdings_count'
]);

const HOLDINGS_MARGIN_REQUIRED_KEYS = new Set([
  'available_cash',
  'collateral',
  'utilised',
  'net_margin'
]);

const HOLDING_ITEM_REQUIRED_KEYS = new Set([
  'ticker',
  'name',
  'isin',
  'exchange',
  'quantity',
  'average_price',
  'cmp',
  'invested_value',
  'current_value',
  'unrealized_pnl',
  'unrealized_pnl_pct',
  'weight_pct'
]);

const HOLDING_ITEM_ALL_KEYS = new Set([
  ...HOLDING_ITEM_REQUIRED_KEYS,
  'fractional_shares',
  'buy_date'
]);

const BLENDED_HOLDINGS_TOP_KEYS = new Set([
  'strategy_id',
  'timestamp',
  'base_currency',
  'summary',
  'accounts_blended',
  'positions'
]);

const BLENDED_SUMMARY_REQUIRED_KEYS = new Set([
  'total_invested',
  'total_current_value',
  'unrealized_pnl',
  'unrealized_pnl_pct',
  'pooled_cash',
  'total_strategy_equity',
  'positions_count'
]);

const BLENDED_ACCOUNT_REQUIRED_KEYS = new Set([
  'account_id',
  'broker',
  'original_currency',
  'raw_cash',
  'fx_rate',
  'pooled_cash_contribution',
  'holdings_count'
]);

const BLENDED_POSITION_REQUIRED_KEYS = new Set([
  'ticker',
  'name',
  'isin',
  'exchange',
  'market',
  'quantity',
  'average_price',
  'cmp',
  'invested_value',
  'current_value',
  'unrealized_pnl',
  'unrealized_pnl_pct',
  'weight_pct',
  'attribution'
]);

const BLENDED_ATTRIBUTION_REQUIRED_KEYS = new Set([
  'account_id',
  'broker',
  'quantity',
  'average_price',
  'original_currency',
  'fx_rate',
  'cost_in_base_currency',
  'invested_value_base',
  'current_value_base',
  'weight_in_position_pct'
]);

const STRATEGY_XIRR_TOP_KEYS = new Set([
  'strategy_id',
  'timestamp',
  'base_currency',
  'eval_date',
  'xirr',
  'xirr_annualized',
  'absolute_return',
  'total_deposited',
  'total_withdrawn',
  'net_invested',
  'terminal_equity',
  'days_held',
  'is_sub_annual',
  'friction_breakdown',
  'account_cashflows_summary',
  'cashflows'
]);

const STRATEGY_XIRR_FRICTION_KEYS = new Set([
  'brokerage',
  'stt',
  'fx_drag',
  'taxes_and_charges',
  'total_friction',
  'friction_drag_pct'
]);

const STRATEGY_XIRR_ACCOUNT_SUMMARY_KEYS = new Set([
  'account_id',
  'broker',
  'original_currency',
  'fx_rate',
  'total_deposited_base',
  'total_withdrawn_base',
  'internal_transfers_netted_base',
  'friction_base'
]);

const STRATEGY_XIRR_CASHFLOW_REQUIRED_KEYS = new Set([
  'date',
  'amount',
  'category',
  'account_id',
  'description'
]);

const STRATEGY_XIRR_CASHFLOW_ALL_KEYS = new Set([
  'date',
  'amount',
  'category',
  'account_id',
  'description',
  'original_amount',
  'original_currency',
  'fx_rate'
]);

const STRATEGY_XIRR_CATEGORIES = new Set([
  'DEPOSIT',
  'WITHDRAWAL',
  'DIVIDEND',
  'TERMINAL_EQUITY',
  'INTERNAL_TRANSFER_NETTED',
  'FEE'
]);

const VERDICT_SYNTHESIS_TOP_KEYS = new Set([
  'strategy_id',
  'timestamp',
  'eval_date',
  'summary',
  'portfolio_verdicts',
  'allocations'
]);

const VERDICT_SYNTHESIS_SUMMARY_KEYS = new Set([
  'portfolio_health_score',
  'total_positions',
  'disqualified_count',
  'needs_review_count',
  'approved_count',
  'capital_at_risk'
]);

const SYNTHESIZED_STANCES = new Set([
  'STRONG_BUY',
  'BUY',
  'HOLD',
  'REDUCE',
  'STRONG_SELL',
  'DISQUALIFIED',
  'NEEDS_REVIEW'
]);

const ALLOCATION_ACTIONS = new Set([
  'MAINTAIN',
  'INCREASE',
  'TRIM',
  'LIQUIDATE_IMMEDIATELY',
  'MANUAL_REVIEW'
]);

const VERDICT_SYNTHESIS_ITEM_REQUIRED_KEYS = new Set([
  'ticker',
  'synthesized_score',
  'synthesized_stance',
  'is_disqualified',
  'guardrail_triggered',
  'gatekeeper_verdict',
  'pillar_verdicts',
  'notes',
  'recommended_allocation_pct'
]);

const VERDICT_SYNTHESIS_ITEM_ALL_KEYS = new Set([
  'ticker',
  'name',
  'market',
  'synthesized_score',
  'synthesized_stance',
  'is_disqualified',
  'guardrail_triggered',
  'gatekeeper_verdict',
  'pillar_verdicts',
  'notes',
  'recommended_allocation_pct'
]);

const VERDICT_SYNTHESIS_ALLOCATION_KEYS = new Set([
  'ticker',
  'current_weight_pct',
  'recommended_weight_pct',
  'action'
]);

const VERDICT_SYNTHESIS_GATEKEEPER_KEYS = new Set([
  'principle',
  'stance',
  'is_veto',
  'score',
  'red_flags'
]);

const VERDICT_SYNTHESIS_PILLAR_KEYS = new Set([
  'score',
  'stance',
  'weight',
  'weighted_score',
  'red_flags'
]);

const CONSOLIDATED_PORTFOLIO_TOP_KEYS = new Set([
  'strategy_id',
  'timestamp',
  'eval_date',
  'base_currency',
  'summary',
  'blended_holdings',
  'performance',
  'verdict_synthesis',
  'embedded_audits'
]);

const CONSOLIDATED_PORTFOLIO_SUMMARY_KEYS = new Set([
  'total_strategy_equity',
  'total_invested_capital',
  'unrealized_pnl',
  'unrealized_pnl_pct',
  'xirr',
  'portfolio_health_score',
  'total_positions',
  'disqualified_count',
  'needs_review_count',
  'approved_count',
  'capital_at_risk'
]);

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Load the JSON Schema object for NormalizedCompanyFinancials or UniformVerdictContract.
 * @param {'financials' | 'verdict'} schemaKind
 * @returns {object}
 */
function loadContractSchema(schemaKind) {
  let filename;
  if (schemaKind === 'financials') {
    filename = 'normalized-company-financials.schema.json';
  } else if (schemaKind === 'verdict') {
    filename = 'uniform-verdict.schema.json';
  } else if (schemaKind === 'holdings') {
    filename = 'account-holdings-snapshot.schema.json';
  } else if (schemaKind === 'blended-holdings') {
    filename = 'strategy-holdings-blended.schema.json';
  } else if (schemaKind === 'strategy-xirr') {
    filename = 'strategy-xirr.schema.json';
  } else if (schemaKind === 'verdict-synthesis' || schemaKind === 'strategy-verdict-synthesis') {
    filename = 'strategy-verdict-synthesis.schema.json';
  } else if (schemaKind === 'consolidated-portfolio' || schemaKind === 'strategy-consolidated-portfolio') {
    filename = 'strategy-consolidated-portfolio.schema.json';
  } else {
    throw new Error(`Unsupported schema kind: ${schemaKind}`);
  }
  const schemaPath = path.join(__dirname, 'schemas', filename);
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

function validateNumericSection(
  sectionObj,
  sectionName,
  allowedKeys,
  requiredNonNullKeys,
  addError
) {
  for (const key of Object.keys(sectionObj)) {
    if (!allowedKeys.has(key)) {
      addError(
        'ERR_UNKNOWN_FIELD',
        `${sectionName}.${key}`,
        `Unknown field "${key}" in ${sectionName}`
      );
      continue;
    }
    const val = sectionObj[key];
    if (val !== null && val !== undefined && !isFiniteNumber(val)) {
      addError(
        'ERR_TYPE_MISMATCH',
        `${sectionName}.${key}`,
        `Field "${sectionName}.${key}" must be a finite number or null`
      );
    }
  }

  for (const reqKey of requiredNonNullKeys) {
    if (!(reqKey in sectionObj) || sectionObj[reqKey] === undefined || sectionObj[reqKey] === null) {
      addError(
        'ERR_MISSING_REQUIRED_FIELD',
        `${sectionName}.${reqKey}`,
        `Required field "${sectionName}.${reqKey}" is missing or null`
      );
    }
  }
}

/**
 * Validate a NormalizedCompanyFinancials object against structural and domain constraints.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateNormalizedFinancials(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError(
      'ERR_SCHEMA_INVALID',
      '$',
      'NormalizedCompanyFinancials root must be a JSON object'
    );
    return { ok: false, errors, summary: {} };
  }

  for (const key of Object.keys(payload)) {
    if (!FINANCIALS_TOP_KEYS.has(key)) {
      addError('ERR_UNKNOWN_FIELD', key, `Unknown top-level field "${key}"`);
    }
  }

  // Required identity fields
  if (!isNonEmptyString(payload.ticker)) {
    addError(
      'ERR_MISSING_REQUIRED_FIELD',
      'ticker',
      'Field "ticker" is required and must be a non-empty string'
    );
  }
  if (!isNonEmptyString(payload.name)) {
    addError(
      'ERR_MISSING_REQUIRED_FIELD',
      'name',
      'Field "name" is required and must be a non-empty string'
    );
  }
  if (!VALID_MARKETS.has(payload.market)) {
    addError(
      'ERR_INVALID_ENUM',
      'market',
      `Field "market" must be one of [IN, US], got "${payload.market}"`
    );
  }
  if (!VALID_CURRENCIES.has(payload.currency)) {
    addError(
      'ERR_INVALID_ENUM',
      'currency',
      `Field "currency" must be one of [INR, USD], got "${payload.currency}"`
    );
  }
  if (!isNonEmptyString(payload.timestamp)) {
    addError(
      'ERR_MISSING_REQUIRED_FIELD',
      'timestamp',
      'Field "timestamp" is required and must be a non-empty ISO timestamp string'
    );
  }

  if (
    payload.unit_scale !== undefined &&
    !VALID_UNIT_SCALES.has(payload.unit_scale)
  ) {
    addError(
      'ERR_INVALID_ENUM',
      'unit_scale',
      `Field "unit_scale" must be one of [ABSOLUTE, CRORES, MILLIONS, BILLIONS]`
    );
  }

  if (
    payload.is_index_etf !== undefined &&
    typeof payload.is_index_etf !== 'boolean'
  ) {
    addError(
      'ERR_TYPE_MISMATCH',
      'is_index_etf',
      'Field "is_index_etf" must be a boolean when provided'
    );
  }

  const isEtf = payload.is_index_etf === true;

  // Validate market_data
  if (!isPlainObject(payload.market_data)) {
    addError(
      'ERR_MISSING_REQUIRED_SECTION',
      'market_data',
      'Required section "market_data" must be an object'
    );
  } else {
    const md = payload.market_data;
    validateNumericSection(
      md,
      'market_data',
      MARKET_DATA_KEYS,
      isEtf ? ['cmp'] : ['cmp', 'shares_outstanding'],
      addError
    );

    if (isFiniteNumber(md.cmp) && md.cmp <= 0) {
      addError(
        'ERR_NUMERIC_CONSTRAINT',
        'market_data.cmp',
        `Field "market_data.cmp" must be strictly positive (> 0), got ${md.cmp}`
      );
    }
    if (
      md.shares_outstanding !== undefined &&
      md.shares_outstanding !== null &&
      isFiniteNumber(md.shares_outstanding) &&
      md.shares_outstanding <= 0
    ) {
      addError(
        'ERR_NUMERIC_CONSTRAINT',
        'market_data.shares_outstanding',
        `Field "market_data.shares_outstanding" must be strictly positive (> 0), got ${md.shares_outstanding}`
      );
    }
    if (
      md.market_cap !== undefined &&
      md.market_cap !== null &&
      isFiniteNumber(md.market_cap) &&
      md.market_cap <= 0
    ) {
      addError(
        'ERR_NUMERIC_CONSTRAINT',
        'market_data.market_cap',
        `Field "market_data.market_cap" must be strictly positive (> 0), got ${md.market_cap}`
      );
    }
    if (
      md.dividend_yield_pct !== undefined &&
      md.dividend_yield_pct !== null &&
      isFiniteNumber(md.dividend_yield_pct) &&
      md.dividend_yield_pct < 0
    ) {
      addError(
        'ERR_NUMERIC_CONSTRAINT',
        'market_data.dividend_yield_pct',
        `Field "market_data.dividend_yield_pct" must be >= 0`
      );
    }
  }

  // Validate income_statement
  if (!isEtf && !isPlainObject(payload.income_statement)) {
    addError(
      'ERR_MISSING_REQUIRED_SECTION',
      'income_statement',
      'Non-ETF equity requires an "income_statement" object'
    );
  } else if (isPlainObject(payload.income_statement)) {
    validateNumericSection(
      payload.income_statement,
      'income_statement',
      INCOME_STATEMENT_KEYS,
      isEtf ? [] : ['revenue', 'net_income'],
      addError
    );
  } else if (
    payload.income_statement !== undefined &&
    payload.income_statement !== null
  ) {
    addError(
      'ERR_TYPE_MISMATCH',
      'income_statement',
      'Field "income_statement" must be an object or null'
    );
  }

  // Validate balance_sheet
  if (!isEtf && !isPlainObject(payload.balance_sheet)) {
    addError(
      'ERR_MISSING_REQUIRED_SECTION',
      'balance_sheet',
      'Non-ETF equity requires a "balance_sheet" object'
    );
  } else if (isPlainObject(payload.balance_sheet)) {
    validateNumericSection(
      payload.balance_sheet,
      'balance_sheet',
      BALANCE_SHEET_KEYS,
      isEtf ? [] : ['total_assets', 'total_liabilities', 'total_equity'],
      addError
    );
  } else if (
    payload.balance_sheet !== undefined &&
    payload.balance_sheet !== null
  ) {
    addError(
      'ERR_TYPE_MISMATCH',
      'balance_sheet',
      'Field "balance_sheet" must be an object or null'
    );
  }

  // Validate cash_flow
  if (!isEtf && !isPlainObject(payload.cash_flow)) {
    addError(
      'ERR_MISSING_REQUIRED_SECTION',
      'cash_flow',
      'Non-ETF equity requires a "cash_flow" object'
    );
  } else if (isPlainObject(payload.cash_flow)) {
    validateNumericSection(
      payload.cash_flow,
      'cash_flow',
      CASH_FLOW_KEYS,
      isEtf ? [] : ['operating_cash_flow'],
      addError
    );
  } else if (payload.cash_flow !== undefined && payload.cash_flow !== null) {
    addError(
      'ERR_TYPE_MISMATCH',
      'cash_flow',
      'Field "cash_flow" must be an object or null'
    );
  }

  // Validate forensics
  if (!isEtf && !isPlainObject(payload.forensics)) {
    addError(
      'ERR_MISSING_REQUIRED_SECTION',
      'forensics',
      'Non-ETF equity requires a "forensics" object'
    );
  } else if (isPlainObject(payload.forensics)) {
    const f = payload.forensics;
    for (const [k, v] of Object.entries(f)) {
      if (!FORENSICS_ALL_KEYS.has(k)) {
        addError('ERR_UNKNOWN_FIELD', `forensics.${k}`, `Unknown field "${k}" in forensics`);
        continue;
      }
      if (v === null || v === undefined) {
        continue;
      }
      if (FORENSICS_NUMERIC_KEYS.has(k)) {
        if (!isFiniteNumber(v)) {
          addError(
            'ERR_TYPE_MISMATCH',
            `forensics.${k}`,
            `Field "forensics.${k}" must be a finite number or null`
          );
        } else if (
          (k === 'promoter_holding_pct' || k === 'promoter_pledge_pct') &&
          (v < 0 || v > 100)
        ) {
          addError(
            'ERR_NUMERIC_CONSTRAINT',
            `forensics.${k}`,
            `Field "forensics.${k}" must be between 0 and 100, got ${v}`
          );
        } else if (k === 'related_party_transactions_pct' && v < 0) {
          addError(
            'ERR_NUMERIC_CONSTRAINT',
            `forensics.${k}`,
            `Field "forensics.${k}" must be >= 0, got ${v}`
          );
        }
      } else if (FORENSICS_BOOLEAN_KEYS.has(k) && typeof v !== 'boolean') {
        addError(
          'ERR_TYPE_MISMATCH',
          `forensics.${k}`,
          `Field "forensics.${k}" must be a boolean or null`
        );
      } else if (FORENSICS_STRING_KEYS.has(k) && typeof v !== 'string') {
        addError(
          'ERR_TYPE_MISMATCH',
          `forensics.${k}`,
          `Field "forensics.${k}" must be a string or null`
        );
      }
    }
  } else if (payload.forensics !== undefined && payload.forensics !== null) {
    addError(
      'ERR_TYPE_MISMATCH',
      'forensics',
      'Field "forensics" must be an object or null'
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      ticker: payload.ticker || null,
      market: payload.market || null,
      currency: payload.currency || null,
      is_index_etf: isEtf
    }
  };
}

/**
 * Validate a single UniformVerdictContract object against structural and semantic rules.
 * @param {object} payload
 * @param {string} [pathPrefix='$']
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateUniformVerdict(payload, pathPrefix = '') {
  const errors = [];
  const prefix = pathPrefix ? `${pathPrefix}.` : '';

  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath ? `${prefix}${fieldPath}` : pathPrefix || '$', message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_SCHEMA_INVALID', '', 'UniformVerdictContract must be a JSON object');
    return { ok: false, errors, summary: {} };
  }

  for (const key of Object.keys(payload)) {
    if (!VERDICT_TOP_KEYS.has(key)) {
      addError('ERR_UNKNOWN_FIELD', key, `Unknown field "${key}" in UniformVerdictContract`);
    }
  }

  for (const reqKey of VERDICT_TOP_REQUIRED_KEYS) {
    if (!(reqKey in payload)) {
      addError(
        'ERR_MISSING_REQUIRED_FIELD',
        reqKey,
        `Missing required field "${reqKey}"`
      );
    }
  }

  const {
    principle,
    ticker,
    timestamp,
    score,
    stance,
    is_veto,
    metrics,
    red_flags,
    summary
  } = payload;

  if (!ALL_PRINCIPLES.has(principle)) {
    addError(
      'ERR_INVALID_PRINCIPLE',
      'principle',
      `Invalid principle "${principle}". Expected one of [${[...ALL_PRINCIPLES].join(', ')}]`
    );
  }

  if (!isNonEmptyString(ticker)) {
    addError(
      'ERR_INVALID_FIELD',
      'ticker',
      'Field "ticker" must be a non-empty string'
    );
  }

  if (!isNonEmptyString(timestamp)) {
    addError(
      'ERR_INVALID_FIELD',
      'timestamp',
      'Field "timestamp" must be a non-empty ISO timestamp string'
    );
  }

  if (!isFiniteNumber(score) || score < 0.0 || score > 100.0) {
    addError(
      'ERR_SCORE_OUT_OF_RANGE',
      'score',
      `Field "score" must be a finite number in [0.0, 100.0], got ${score}`
    );
  }

  if (typeof is_veto !== 'boolean') {
    addError(
      'ERR_TYPE_MISMATCH',
      'is_veto',
      'Field "is_veto" must be a boolean'
    );
  }

  // Semantic consistency between principle, stance, and is_veto
  if (GATEKEEPER_PRINCIPLES.has(principle)) {
    if (!GATEKEEPER_STANCES.has(stance)) {
      addError(
        'ERR_INVALID_STANCE',
        'stance',
        `Gatekeeper principle "${principle}" must use stance in [PASS, FLAG, VETO_DISQUALIFIED], got "${stance}"`
      );
    } else if (typeof is_veto === 'boolean') {
      const expectedVeto = stance === 'VETO_DISQUALIFIED';
      if (is_veto !== expectedVeto) {
        addError(
          'ERR_STANCE_VETO_MISMATCH',
          'is_veto',
          `Gatekeeper verdict with stance "${stance}" must have is_veto=${expectedVeto}, got is_veto=${is_veto}`
        );
      }
    }
  } else if (VALUATION_PRINCIPLES.has(principle)) {
    if (!VALUATION_STANCES.has(stance)) {
      addError(
        'ERR_INVALID_STANCE',
        'stance',
        `Valuation principle "${principle}" must use stance in [STRONG_BUY, BUY, HOLD, REDUCE, STRONG_SELL], got "${stance}"`
      );
    }
    if (is_veto === true) {
      addError(
        'ERR_STANCE_VETO_MISMATCH',
        'is_veto',
        `Valuation principle "${principle}" cannot set is_veto=true (only gatekeepers can trigger a hard veto)`
      );
    }
  }

  if (!isPlainObject(metrics)) {
    addError(
      'ERR_TYPE_MISMATCH',
      'metrics',
      'Field "metrics" must be an object mapping metric names to numbers or null'
    );
  } else {
    for (const [mKey, mVal] of Object.entries(metrics)) {
      if (mVal !== null && !isFiniteNumber(mVal)) {
        addError(
          'ERR_TYPE_MISMATCH',
          `metrics.${mKey}`,
          `Metric "${mKey}" must be a finite number or null, got ${typeof mVal}`
        );
      }
    }
  }

  if (!Array.isArray(red_flags)) {
    addError(
      'ERR_TYPE_MISMATCH',
      'red_flags',
      'Field "red_flags" must be an array of strings'
    );
  } else {
    for (let i = 0; i < red_flags.length; i++) {
      if (!isNonEmptyString(red_flags[i])) {
        addError(
          'ERR_TYPE_MISMATCH',
          `red_flags[${i}]`,
          `Red flag entry at index ${i} must be a non-empty string`
        );
      }
    }
  }

  if (!isNonEmptyString(summary)) {
    addError(
      'ERR_INVALID_FIELD',
      'summary',
      'Field "summary" must be a non-empty narrative string'
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      principle: principle || null,
      ticker: ticker || null,
      score: isFiniteNumber(score) ? score : null,
      stance: stance || null,
      is_veto: typeof is_veto === 'boolean' ? is_veto : null
    }
  };
}

/**
 * Validate a consolidated Option C portfolio verdict batch object.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateUniformVerdictBatch(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError(
      'ERR_SCHEMA_INVALID',
      '$',
      'UniformVerdictBatch root must be a JSON object'
    );
    return { ok: false, errors, summary: {} };
  }

  for (const key of Object.keys(payload)) {
    if (!VERDICT_BATCH_TOP_KEYS.has(key)) {
      addError('ERR_UNKNOWN_FIELD', key, `Unknown field "${key}" in VerdictBatch`);
    }
  }

  const { principle, timestamp, verdicts } = payload;

  if (!ALL_PRINCIPLES.has(principle)) {
    addError(
      'ERR_INVALID_PRINCIPLE',
      'principle',
      `Invalid batch principle "${principle}". Expected one of [${[...ALL_PRINCIPLES].join(', ')}]`
    );
  }

  if (!isNonEmptyString(timestamp)) {
    addError(
      'ERR_INVALID_FIELD',
      'timestamp',
      'Field "timestamp" must be a non-empty ISO timestamp string'
    );
  }

  if (!Array.isArray(verdicts) || verdicts.length === 0) {
    addError(
      'ERR_EMPTY_VERDICTS',
      'verdicts',
      'Field "verdicts" must be a non-empty array of UniformVerdictContract objects'
    );
    return { ok: false, errors, summary: {} };
  }

  const seenTickers = new Set();

  for (let i = 0; i < verdicts.length; i++) {
    const item = verdicts[i];
    const itemPath = `verdicts[${i}]`;
    const itemResult = validateUniformVerdict(item, itemPath);

    for (const err of itemResult.errors) {
      errors.push(err);
    }

    if (isPlainObject(item)) {
      if (
        ALL_PRINCIPLES.has(principle) &&
        typeof item.principle === 'string' &&
        item.principle !== principle
      ) {
        addError(
          'ERR_BATCH_PRINCIPLE_MISMATCH',
          `${itemPath}.principle`,
          `Verdict at ${itemPath} has principle "${item.principle}" which does not match batch principle "${principle}"`
        );
      }

      if (isNonEmptyString(item.ticker)) {
        if (seenTickers.has(item.ticker)) {
          addError(
            'ERR_DUPLICATE_TICKER_IN_BATCH',
            `${itemPath}.ticker`,
            `Duplicate ticker "${item.ticker}" in verdict batch for principle "${principle}"`
          );
        } else {
          seenTickers.add(item.ticker);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      principle: principle || null,
      totalVerdicts: verdicts.length,
      uniqueTickers: seenTickers.size
    }
  };
}

/**
 * Validate an AccountHoldingsSnapshot object against structural and numeric constraints.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateAccountHoldingsSnapshot(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_SCHEMA_INVALID', '$', 'AccountHoldingsSnapshot root must be a JSON object');
    return { ok: false, errors, summary: {} };
  }

  for (const key of Object.keys(payload)) {
    if (!HOLDINGS_SNAPSHOT_TOP_KEYS.has(key)) {
      addError('ERR_UNKNOWN_FIELD', key, `Unknown top-level field "${key}" in AccountHoldingsSnapshot`);
    }
  }

  for (const reqKey of HOLDINGS_SNAPSHOT_TOP_KEYS) {
    if (!(reqKey in payload)) {
      addError('ERR_MISSING_REQUIRED_FIELD', reqKey, `Missing required top-level field "${reqKey}"`);
    }
  }

  const { account_id, broker, currency, timestamp, summary, margin, holdings } = payload;

  if (!isNonEmptyString(account_id)) {
    addError('ERR_INVALID_FIELD', 'account_id', 'Field "account_id" must be a non-empty string');
  }

  if (!isNonEmptyString(broker)) {
    addError('ERR_INVALID_FIELD', 'broker', 'Field "broker" must be a non-empty string');
  }

  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    addError('ERR_INVALID_CURRENCY', 'currency', `Field "currency" must be a 3-letter ISO code, got "${currency}"`);
  }

  if (!isNonEmptyString(timestamp)) {
    addError('ERR_INVALID_FIELD', 'timestamp', 'Field "timestamp" must be a non-empty ISO timestamp string');
  }

  // Validate summary
  if (!isPlainObject(summary)) {
    addError('ERR_TYPE_MISMATCH', 'summary', 'Field "summary" must be an object');
  } else {
    for (const key of Object.keys(summary)) {
      if (!HOLDINGS_SUMMARY_REQUIRED_KEYS.has(key)) {
        addError('ERR_UNKNOWN_FIELD', `summary.${key}`, `Unknown field "${key}" in summary`);
      }
    }
    for (const reqKey of HOLDINGS_SUMMARY_REQUIRED_KEYS) {
      if (!(reqKey in summary)) {
        addError('ERR_MISSING_REQUIRED_FIELD', `summary.${reqKey}`, `Missing required field "summary.${reqKey}"`);
      }
    }
    if (isFiniteNumber(summary.total_invested) && summary.total_invested < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'summary.total_invested', 'Field "summary.total_invested" must be >= 0');
    }
    if (isFiniteNumber(summary.total_current_value) && summary.total_current_value < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'summary.total_current_value', 'Field "summary.total_current_value" must be >= 0');
    }
    if (isFiniteNumber(summary.available_cash) && summary.available_cash < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'summary.available_cash', 'Field "summary.available_cash" must be >= 0');
    }
    if (summary.holdings_count !== undefined && (!Number.isInteger(summary.holdings_count) || summary.holdings_count < 0)) {
      addError('ERR_NUMERIC_CONSTRAINT', 'summary.holdings_count', 'Field "summary.holdings_count" must be an integer >= 0');
    }
  }

  // Validate margin
  if (!isPlainObject(margin)) {
    addError('ERR_TYPE_MISMATCH', 'margin', 'Field "margin" must be an object');
  } else {
    for (const key of Object.keys(margin)) {
      if (!HOLDINGS_MARGIN_REQUIRED_KEYS.has(key)) {
        addError('ERR_UNKNOWN_FIELD', `margin.${key}`, `Unknown field "${key}" in margin`);
      }
    }
    for (const reqKey of HOLDINGS_MARGIN_REQUIRED_KEYS) {
      if (!(reqKey in margin)) {
        addError('ERR_MISSING_REQUIRED_FIELD', `margin.${reqKey}`, `Missing required field "margin.${reqKey}"`);
      }
    }
    if (isFiniteNumber(margin.available_cash) && margin.available_cash < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'margin.available_cash', 'Field "margin.available_cash" must be >= 0');
    }
    if (isFiniteNumber(margin.collateral) && margin.collateral < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'margin.collateral', 'Field "margin.collateral" must be >= 0');
    }
    if (isFiniteNumber(margin.utilised) && margin.utilised < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'margin.utilised', 'Field "margin.utilised" must be >= 0');
    }
  }

  // Validate holdings
  if (!Array.isArray(holdings)) {
    addError('ERR_TYPE_MISMATCH', 'holdings', 'Field "holdings" must be an array');
  } else {
    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      const hPath = `holdings[${i}]`;
      if (!isPlainObject(h)) {
        addError('ERR_TYPE_MISMATCH', hPath, `Holding item at ${hPath} must be an object`);
        continue;
      }
      for (const key of Object.keys(h)) {
        if (!HOLDING_ITEM_ALL_KEYS.has(key)) {
          addError('ERR_UNKNOWN_FIELD', `${hPath}.${key}`, `Unknown field "${key}" in holding item`);
        }
      }
      for (const reqKey of HOLDING_ITEM_REQUIRED_KEYS) {
        if (!(reqKey in h)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `${hPath}.${reqKey}`, `Missing required field "${hPath}.${reqKey}"`);
        }
      }
      if (!isNonEmptyString(h.ticker)) {
        addError('ERR_INVALID_FIELD', `${hPath}.ticker`, `Field "${hPath}.ticker" must be a non-empty string`);
      }
      if (!isNonEmptyString(h.name)) {
        addError('ERR_INVALID_FIELD', `${hPath}.name`, `Field "${hPath}.name" must be a non-empty string`);
      }
      if (typeof h.isin !== 'string') {
        addError('ERR_INVALID_FIELD', `${hPath}.isin`, `Field "${hPath}.isin" must be a string`);
      }
      if (!isNonEmptyString(h.exchange)) {
        addError('ERR_INVALID_FIELD', `${hPath}.exchange`, `Field "${hPath}.exchange" must be a non-empty string`);
      }
      if (isFiniteNumber(h.quantity) && h.quantity <= 0) {
        addError('ERR_NUMERIC_CONSTRAINT', `${hPath}.quantity`, `Field "${hPath}.quantity" must be > 0`);
      }
      if (isFiniteNumber(h.average_price) && h.average_price <= 0) {
        addError('ERR_NUMERIC_CONSTRAINT', `${hPath}.average_price`, `Field "${hPath}.average_price" must be > 0`);
      }
      if (isFiniteNumber(h.cmp) && h.cmp <= 0) {
        addError('ERR_NUMERIC_CONSTRAINT', `${hPath}.cmp`, `Field "${hPath}.cmp" must be > 0`);
      }
      if (isFiniteNumber(h.weight_pct) && (h.weight_pct < 0 || h.weight_pct > 100)) {
        addError('ERR_NUMERIC_CONSTRAINT', `${hPath}.weight_pct`, `Field "${hPath}.weight_pct" must be between 0 and 100`);
      }
      if (h.fractional_shares !== undefined && typeof h.fractional_shares !== 'boolean') {
        addError('ERR_TYPE_MISMATCH', `${hPath}.fractional_shares`, `Field "${hPath}.fractional_shares" must be a boolean`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      account_id: account_id || null,
      broker: broker || null,
      currency: currency || null,
      holdingsCount: Array.isArray(holdings) ? holdings.length : 0
    }
  };
}

/**
 * Validate a StrategyHoldingsBlended object against structural and numeric constraints.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateBlendedHoldings(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_SCHEMA_INVALID', '$', 'StrategyHoldingsBlended root must be a JSON object');
    return { ok: false, errors, summary: {} };
  }

  for (const key of Object.keys(payload)) {
    if (!BLENDED_HOLDINGS_TOP_KEYS.has(key)) {
      addError('ERR_UNKNOWN_FIELD', key, `Unknown top-level field "${key}" in StrategyHoldingsBlended`);
    }
  }

  for (const reqKey of BLENDED_HOLDINGS_TOP_KEYS) {
    if (!(reqKey in payload)) {
      addError('ERR_MISSING_REQUIRED_FIELD', reqKey, `Missing required top-level field "${reqKey}"`);
    }
  }

  const { strategy_id, timestamp, base_currency, summary, accounts_blended, positions } = payload;

  if (strategy_id !== undefined && !isNonEmptyString(strategy_id)) {
    addError('ERR_INVALID_FIELD', 'strategy_id', 'strategy_id must be a non-empty string');
  }

  if (timestamp !== undefined && !isNonEmptyString(timestamp)) {
    addError('ERR_INVALID_FIELD', 'timestamp', 'timestamp must be a non-empty ISO 8601 string');
  }

  if (base_currency !== undefined && (typeof base_currency !== 'string' || !/^[A-Z]{3}$/.test(base_currency))) {
    addError('ERR_INVALID_CURRENCY', 'base_currency', `base_currency must be a 3-letter uppercase ISO currency code, got "${base_currency}"`);
  }

  // Summary
  if (summary !== undefined) {
    if (!isPlainObject(summary)) {
      addError('ERR_TYPE_MISMATCH', 'summary', 'Field "summary" must be an object');
    } else {
      for (const key of Object.keys(summary)) {
        if (!BLENDED_SUMMARY_REQUIRED_KEYS.has(key)) {
          addError('ERR_UNKNOWN_FIELD', `summary.${key}`, `Unknown field "summary.${key}"`);
        }
      }
      for (const reqKey of BLENDED_SUMMARY_REQUIRED_KEYS) {
        if (!(reqKey in summary)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `summary.${reqKey}`, `Missing required field "summary.${reqKey}"`);
        }
      }
      if (isFiniteNumber(summary.total_invested) && summary.total_invested < 0) {
        addError('ERR_NUMERIC_CONSTRAINT', 'summary.total_invested', 'Field "summary.total_invested" must be >= 0');
      }
      if (isFiniteNumber(summary.total_current_value) && summary.total_current_value < 0) {
        addError('ERR_NUMERIC_CONSTRAINT', 'summary.total_current_value', 'Field "summary.total_current_value" must be >= 0');
      }
      if (isFiniteNumber(summary.pooled_cash) && summary.pooled_cash < 0) {
        addError('ERR_NUMERIC_CONSTRAINT', 'summary.pooled_cash', 'Field "summary.pooled_cash" must be >= 0');
      }
      if (isFiniteNumber(summary.positions_count) && (summary.positions_count < 0 || !Number.isInteger(summary.positions_count))) {
        addError('ERR_NUMERIC_CONSTRAINT', 'summary.positions_count', 'Field "summary.positions_count" must be an integer >= 0');
      }
    }
  }

  // Accounts blended
  if (accounts_blended !== undefined) {
    if (!Array.isArray(accounts_blended)) {
      addError('ERR_TYPE_MISMATCH', 'accounts_blended', 'Field "accounts_blended" must be an array');
    } else {
      accounts_blended.forEach((acc, idx) => {
        const aPath = `accounts_blended[${idx}]`;
        if (!isPlainObject(acc)) {
          addError('ERR_TYPE_MISMATCH', aPath, `${aPath} must be an object`);
          return;
        }
        for (const k of Object.keys(acc)) {
          if (!BLENDED_ACCOUNT_REQUIRED_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${aPath}.${k}`, `Unknown field "${aPath}.${k}"`);
          }
        }
        for (const reqKey of BLENDED_ACCOUNT_REQUIRED_KEYS) {
          if (!(reqKey in acc)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${aPath}.${reqKey}`, `Missing required field "${aPath}.${reqKey}"`);
          }
        }
        if (!isNonEmptyString(acc.account_id)) {
          addError('ERR_INVALID_FIELD', `${aPath}.account_id`, `Field "${aPath}.account_id" must be a non-empty string`);
        }
        if (!isNonEmptyString(acc.broker)) {
          addError('ERR_INVALID_FIELD', `${aPath}.broker`, `Field "${aPath}.broker" must be a non-empty string`);
        }
        if (typeof acc.original_currency !== 'string' || !/^[A-Z]{3}$/.test(acc.original_currency)) {
          addError('ERR_INVALID_CURRENCY', `${aPath}.original_currency`, `Field "${aPath}.original_currency" must be a 3-letter currency code`);
        }
        if (isFiniteNumber(acc.raw_cash) && acc.raw_cash < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.raw_cash`, `Field "${aPath}.raw_cash" must be >= 0`);
        }
        if (isFiniteNumber(acc.fx_rate) && acc.fx_rate <= 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.fx_rate`, `Field "${aPath}.fx_rate" must be > 0`);
        }
        if (isFiniteNumber(acc.pooled_cash_contribution) && acc.pooled_cash_contribution < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.pooled_cash_contribution`, `Field "${aPath}.pooled_cash_contribution" must be >= 0`);
        }
        if (isFiniteNumber(acc.holdings_count) && (acc.holdings_count < 0 || !Number.isInteger(acc.holdings_count))) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.holdings_count`, `Field "${aPath}.holdings_count" must be an integer >= 0`);
        }
      });
    }
  }

  // Positions
  if (positions !== undefined) {
    if (!Array.isArray(positions)) {
      addError('ERR_TYPE_MISMATCH', 'positions', 'Field "positions" must be an array');
    } else {
      positions.forEach((pos, idx) => {
        const pPath = `positions[${idx}]`;
        if (!isPlainObject(pos)) {
          addError('ERR_TYPE_MISMATCH', pPath, `${pPath} must be an object`);
          return;
        }
        for (const k of Object.keys(pos)) {
          if (!BLENDED_POSITION_REQUIRED_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${pPath}.${k}`, `Unknown field "${pPath}.${k}"`);
          }
        }
        for (const reqKey of BLENDED_POSITION_REQUIRED_KEYS) {
          if (!(reqKey in pos)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${pPath}.${reqKey}`, `Missing required field "${pPath}.${reqKey}"`);
          }
        }
        if (!isNonEmptyString(pos.ticker)) {
          addError('ERR_INVALID_FIELD', `${pPath}.ticker`, `Field "${pPath}.ticker" must be a non-empty string`);
        }
        if (!isNonEmptyString(pos.name)) {
          addError('ERR_INVALID_FIELD', `${pPath}.name`, `Field "${pPath}.name" must be a non-empty string`);
        }
        if (typeof pos.isin !== 'string') {
          addError('ERR_INVALID_FIELD', `${pPath}.isin`, `Field "${pPath}.isin" must be a string`);
        }
        if (!isNonEmptyString(pos.exchange)) {
          addError('ERR_INVALID_FIELD', `${pPath}.exchange`, `Field "${pPath}.exchange" must be a non-empty string`);
        }
        if (pos.market !== undefined && pos.market !== 'IN' && pos.market !== 'US') {
          addError('ERR_INVALID_FIELD', `${pPath}.market`, `Field "${pPath}.market" must be IN or US, got "${pos.market}"`);
        }
        if (isFiniteNumber(pos.quantity) && pos.quantity <= 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.quantity`, `Field "${pPath}.quantity" must be > 0`);
        }
        if (isFiniteNumber(pos.average_price) && pos.average_price <= 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.average_price`, `Field "${pPath}.average_price" must be > 0`);
        }
        if (isFiniteNumber(pos.cmp) && pos.cmp <= 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.cmp`, `Field "${pPath}.cmp" must be > 0`);
        }
        if (isFiniteNumber(pos.weight_pct) && (pos.weight_pct < 0 || pos.weight_pct > 100)) {
          addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.weight_pct`, `Field "${pPath}.weight_pct" must be between 0 and 100`);
        }

        // Attribution
        if (pos.attribution !== undefined) {
          if (!Array.isArray(pos.attribution) || pos.attribution.length === 0) {
            addError('ERR_TYPE_MISMATCH', `${pPath}.attribution`, `Field "${pPath}.attribution" must be a non-empty array`);
          } else {
            pos.attribution.forEach((att, attIdx) => {
              const attPath = `${pPath}.attribution[${attIdx}]`;
              if (!isPlainObject(att)) {
                addError('ERR_TYPE_MISMATCH', attPath, `${attPath} must be an object`);
                return;
              }
              for (const ak of Object.keys(att)) {
                if (!BLENDED_ATTRIBUTION_REQUIRED_KEYS.has(ak)) {
                  addError('ERR_UNKNOWN_FIELD', `${attPath}.${ak}`, `Unknown field "${attPath}.${ak}"`);
                }
              }
              for (const reqKey of BLENDED_ATTRIBUTION_REQUIRED_KEYS) {
                if (!(reqKey in att)) {
                  addError('ERR_MISSING_REQUIRED_FIELD', `${attPath}.${reqKey}`, `Missing required field "${attPath}.${reqKey}"`);
                }
              }
              if (!isNonEmptyString(att.account_id)) {
                addError('ERR_INVALID_FIELD', `${attPath}.account_id`, `Field "${attPath}.account_id" must be a non-empty string`);
              }
              if (!isNonEmptyString(att.broker)) {
                addError('ERR_INVALID_FIELD', `${attPath}.broker`, `Field "${attPath}.broker" must be a non-empty string`);
              }
              if (isFiniteNumber(att.quantity) && att.quantity <= 0) {
                addError('ERR_NUMERIC_CONSTRAINT', `${attPath}.quantity`, `Field "${attPath}.quantity" must be > 0`);
              }
              if (isFiniteNumber(att.average_price) && att.average_price <= 0) {
                addError('ERR_NUMERIC_CONSTRAINT', `${attPath}.average_price`, `Field "${attPath}.average_price" must be > 0`);
              }
              if (typeof att.original_currency !== 'string' || !/^[A-Z]{3}$/.test(att.original_currency)) {
                addError('ERR_INVALID_CURRENCY', `${attPath}.original_currency`, `Field "${attPath}.original_currency" must be a 3-letter currency code`);
              }
              if (isFiniteNumber(att.fx_rate) && att.fx_rate <= 0) {
                addError('ERR_NUMERIC_CONSTRAINT', `${attPath}.fx_rate`, `Field "${attPath}.fx_rate" must be > 0`);
              }
              if (isFiniteNumber(att.cost_in_base_currency) && att.cost_in_base_currency <= 0) {
                addError('ERR_NUMERIC_CONSTRAINT', `${attPath}.cost_in_base_currency`, `Field "${attPath}.cost_in_base_currency" must be > 0`);
              }
              if (isFiniteNumber(att.weight_in_position_pct) && (att.weight_in_position_pct < 0 || att.weight_in_position_pct > 100)) {
                addError('ERR_NUMERIC_CONSTRAINT', `${attPath}.weight_in_position_pct`, `Field "${attPath}.weight_in_position_pct" must be between 0 and 100`);
              }
            });
          }
        }
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      strategy_id: strategy_id || null,
      base_currency: base_currency || null,
      positionsCount: Array.isArray(positions) ? positions.length : 0,
      accountsCount: Array.isArray(accounts_blended) ? accounts_blended.length : 0
    }
  };
}

/**
 * Validate a StrategyXirrReport object against canonical schema rules.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateStrategyXirr(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_TYPE_MISMATCH', '$', 'StrategyXirrReport payload must be an object');
    return { ok: false, errors, summary: {} };
  }

  for (const k of Object.keys(payload)) {
    if (!STRATEGY_XIRR_TOP_KEYS.has(k)) {
      addError('ERR_UNKNOWN_FIELD', k, `Unknown top-level field "${k}" in StrategyXirrReport`);
    }
  }

  for (const reqKey of STRATEGY_XIRR_TOP_KEYS) {
    if (!(reqKey in payload)) {
      addError('ERR_MISSING_REQUIRED_FIELD', reqKey, `Missing required top-level field "${reqKey}"`);
    }
  }

  const {
    strategy_id,
    timestamp,
    base_currency,
    eval_date,
    xirr,
    xirr_annualized,
    absolute_return,
    total_deposited,
    total_withdrawn,
    net_invested,
    terminal_equity,
    days_held,
    is_sub_annual,
    friction_breakdown,
    account_cashflows_summary,
    cashflows
  } = payload;

  if (strategy_id !== undefined && !isNonEmptyString(strategy_id)) {
    addError('ERR_INVALID_FIELD', 'strategy_id', 'Field "strategy_id" must be a non-empty string');
  }

  if (timestamp !== undefined && !isNonEmptyString(timestamp)) {
    addError('ERR_INVALID_FIELD', 'timestamp', 'Field "timestamp" must be a non-empty string');
  }

  if (base_currency !== undefined) {
    if (typeof base_currency !== 'string' || !/^[A-Z]{3}$/.test(base_currency)) {
      addError('ERR_INVALID_CURRENCY', 'base_currency', 'Field "base_currency" must be a 3-letter currency code (e.g. INR, USD)');
    }
  }

  if (eval_date !== undefined) {
    if (typeof eval_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eval_date)) {
      addError('ERR_INVALID_FIELD', 'eval_date', 'Field "eval_date" must be a valid YYYY-MM-DD date string');
    }
  }

  if (xirr !== undefined && xirr !== null && !isFiniteNumber(xirr)) {
    addError('ERR_TYPE_MISMATCH', 'xirr', 'Field "xirr" must be a number or null');
  }

  if (xirr_annualized !== undefined && xirr_annualized !== null && !isFiniteNumber(xirr_annualized)) {
    addError('ERR_TYPE_MISMATCH', 'xirr_annualized', 'Field "xirr_annualized" must be a number or null');
  }

  if (absolute_return !== undefined && !isFiniteNumber(absolute_return)) {
    addError('ERR_TYPE_MISMATCH', 'absolute_return', 'Field "absolute_return" must be a finite number');
  }

  if (total_deposited !== undefined) {
    if (!isFiniteNumber(total_deposited) || total_deposited < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'total_deposited', 'Field "total_deposited" must be a number >= 0');
    }
  }

  if (total_withdrawn !== undefined) {
    if (!isFiniteNumber(total_withdrawn) || total_withdrawn < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'total_withdrawn', 'Field "total_withdrawn" must be a number >= 0');
    }
  }

  if (net_invested !== undefined && !isFiniteNumber(net_invested)) {
    addError('ERR_TYPE_MISMATCH', 'net_invested', 'Field "net_invested" must be a finite number');
  }

  if (terminal_equity !== undefined) {
    if (!isFiniteNumber(terminal_equity) || terminal_equity < 0) {
      addError('ERR_NUMERIC_CONSTRAINT', 'terminal_equity', 'Field "terminal_equity" must be a number >= 0');
    }
  }

  if (days_held !== undefined) {
    if (!isFiniteNumber(days_held) || days_held < 0 || !Number.isInteger(days_held)) {
      addError('ERR_NUMERIC_CONSTRAINT', 'days_held', 'Field "days_held" must be an integer >= 0');
    }
  }

  if (is_sub_annual !== undefined && typeof is_sub_annual !== 'boolean') {
    addError('ERR_TYPE_MISMATCH', 'is_sub_annual', 'Field "is_sub_annual" must be a boolean');
  }

  // friction_breakdown
  if (friction_breakdown !== undefined) {
    if (!isPlainObject(friction_breakdown)) {
      addError('ERR_TYPE_MISMATCH', 'friction_breakdown', 'Field "friction_breakdown" must be an object');
    } else {
      for (const k of Object.keys(friction_breakdown)) {
        if (!STRATEGY_XIRR_FRICTION_KEYS.has(k)) {
          addError('ERR_UNKNOWN_FIELD', `friction_breakdown.${k}`, `Unknown field "friction_breakdown.${k}"`);
        }
      }
      for (const reqKey of STRATEGY_XIRR_FRICTION_KEYS) {
        if (!(reqKey in friction_breakdown)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `friction_breakdown.${reqKey}`, `Missing required field "friction_breakdown.${reqKey}"`);
        }
      }
      ['brokerage', 'stt', 'fx_drag', 'taxes_and_charges', 'total_friction'].forEach(fk => {
        const val = friction_breakdown[fk];
        if (val !== undefined && (!isFiniteNumber(val) || val < 0)) {
          addError('ERR_NUMERIC_CONSTRAINT', `friction_breakdown.${fk}`, `Field "friction_breakdown.${fk}" must be a number >= 0`);
        }
      });
      if (friction_breakdown.friction_drag_pct !== undefined && !isFiniteNumber(friction_breakdown.friction_drag_pct)) {
        addError('ERR_TYPE_MISMATCH', 'friction_breakdown.friction_drag_pct', 'Field "friction_breakdown.friction_drag_pct" must be a finite number');
      }
    }
  }

  // account_cashflows_summary
  if (account_cashflows_summary !== undefined) {
    if (!Array.isArray(account_cashflows_summary)) {
      addError('ERR_TYPE_MISMATCH', 'account_cashflows_summary', 'Field "account_cashflows_summary" must be an array');
    } else {
      account_cashflows_summary.forEach((acc, idx) => {
        const aPath = `account_cashflows_summary[${idx}]`;
        if (!isPlainObject(acc)) {
          addError('ERR_TYPE_MISMATCH', aPath, `${aPath} must be an object`);
          return;
        }
        for (const k of Object.keys(acc)) {
          if (!STRATEGY_XIRR_ACCOUNT_SUMMARY_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${aPath}.${k}`, `Unknown field "${aPath}.${k}"`);
          }
        }
        for (const reqKey of STRATEGY_XIRR_ACCOUNT_SUMMARY_KEYS) {
          if (!(reqKey in acc)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${aPath}.${reqKey}`, `Missing required field "${aPath}.${reqKey}"`);
          }
        }
        if (!isNonEmptyString(acc.account_id)) {
          addError('ERR_INVALID_FIELD', `${aPath}.account_id`, `Field "${aPath}.account_id" must be a non-empty string`);
        }
        if (!isNonEmptyString(acc.broker)) {
          addError('ERR_INVALID_FIELD', `${aPath}.broker`, `Field "${aPath}.broker" must be a non-empty string`);
        }
        if (typeof acc.original_currency !== 'string' || !/^[A-Z]{3}$/.test(acc.original_currency)) {
          addError('ERR_INVALID_CURRENCY', `${aPath}.original_currency`, `Field "${aPath}.original_currency" must be a 3-letter currency code`);
        }
        if (isFiniteNumber(acc.fx_rate) && acc.fx_rate <= 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.fx_rate`, `Field "${aPath}.fx_rate" must be > 0`);
        }
        if (isFiniteNumber(acc.total_deposited_base) && acc.total_deposited_base < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.total_deposited_base`, `Field "${aPath}.total_deposited_base" must be >= 0`);
        }
        if (isFiniteNumber(acc.total_withdrawn_base) && acc.total_withdrawn_base < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.total_withdrawn_base`, `Field "${aPath}.total_withdrawn_base" must be >= 0`);
        }
        if (acc.internal_transfers_netted_base !== undefined && !isFiniteNumber(acc.internal_transfers_netted_base)) {
          addError('ERR_TYPE_MISMATCH', `${aPath}.internal_transfers_netted_base`, `Field "${aPath}.internal_transfers_netted_base" must be a number`);
        }
        if (isFiniteNumber(acc.friction_base) && acc.friction_base < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.friction_base`, `Field "${aPath}.friction_base" must be >= 0`);
        }
      });
    }
  }

  // cashflows
  if (cashflows !== undefined) {
    if (!Array.isArray(cashflows)) {
      addError('ERR_TYPE_MISMATCH', 'cashflows', 'Field "cashflows" must be an array');
    } else {
      cashflows.forEach((cf, idx) => {
        const cPath = `cashflows[${idx}]`;
        if (!isPlainObject(cf)) {
          addError('ERR_TYPE_MISMATCH', cPath, `${cPath} must be an object`);
          return;
        }
        for (const k of Object.keys(cf)) {
          if (!STRATEGY_XIRR_CASHFLOW_ALL_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${cPath}.${k}`, `Unknown field "${cPath}.${k}"`);
          }
        }
        for (const reqKey of STRATEGY_XIRR_CASHFLOW_REQUIRED_KEYS) {
          if (!(reqKey in cf)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${cPath}.${reqKey}`, `Missing required field "${cPath}.${reqKey}"`);
          }
        }
        if (typeof cf.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cf.date)) {
          addError('ERR_INVALID_FIELD', `${cPath}.date`, `Field "${cPath}.date" must be a valid YYYY-MM-DD date string`);
        }
        if (cf.amount !== undefined && !isFiniteNumber(cf.amount)) {
          addError('ERR_TYPE_MISMATCH', `${cPath}.amount`, `Field "${cPath}.amount" must be a finite number`);
        }
        if (cf.category !== undefined && !STRATEGY_XIRR_CATEGORIES.has(cf.category)) {
          addError('ERR_INVALID_FIELD', `${cPath}.category`, `Field "${cPath}.category" must be one of [${[...STRATEGY_XIRR_CATEGORIES].join(', ')}]`);
        }
        if (!isNonEmptyString(cf.account_id)) {
          addError('ERR_INVALID_FIELD', `${cPath}.account_id`, `Field "${cPath}.account_id" must be a non-empty string`);
        }
        if (typeof cf.description !== 'string') {
          addError('ERR_TYPE_MISMATCH', `${cPath}.description`, `Field "${cPath}.description" must be a string`);
        }
        if (cf.original_amount !== undefined && !isFiniteNumber(cf.original_amount)) {
          addError('ERR_TYPE_MISMATCH', `${cPath}.original_amount`, `Field "${cPath}.original_amount" must be a finite number`);
        }
        if (cf.original_currency !== undefined && (typeof cf.original_currency !== 'string' || !/^[A-Z]{3}$/.test(cf.original_currency))) {
          addError('ERR_INVALID_CURRENCY', `${cPath}.original_currency`, `Field "${cPath}.original_currency" must be a 3-letter currency code`);
        }
        if (cf.fx_rate !== undefined && (!isFiniteNumber(cf.fx_rate) || cf.fx_rate <= 0)) {
          addError('ERR_NUMERIC_CONSTRAINT', `${cPath}.fx_rate`, `Field "${cPath}.fx_rate" must be > 0`);
        }
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      strategy_id: strategy_id || null,
      base_currency: base_currency || null,
      eval_date: eval_date || null,
      xirr: xirr !== undefined ? xirr : null,
      xirr_annualized: xirr_annualized !== undefined ? xirr_annualized : null,
      is_sub_annual: is_sub_annual === true,
      cashflowsCount: Array.isArray(cashflows) ? cashflows.length : 0,
      accountsCount: Array.isArray(account_cashflows_summary) ? account_cashflows_summary.length : 0
    }
  };
}

/**
 * Validate a StrategyVerdictSynthesis object against canonical schema rules.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateVerdictSynthesis(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_TYPE_MISMATCH', '$', 'StrategyVerdictSynthesis payload must be an object');
    return { ok: false, errors, summary: {} };
  }

  for (const k of Object.keys(payload)) {
    if (!VERDICT_SYNTHESIS_TOP_KEYS.has(k)) {
      addError('ERR_UNKNOWN_FIELD', k, `Unknown top-level field "${k}" in StrategyVerdictSynthesis`);
    }
  }

  for (const reqKey of VERDICT_SYNTHESIS_TOP_KEYS) {
    if (!(reqKey in payload)) {
      addError('ERR_MISSING_REQUIRED_FIELD', reqKey, `Missing required top-level field "${reqKey}"`);
    }
  }

  const {
    strategy_id,
    timestamp,
    eval_date,
    summary,
    portfolio_verdicts,
    allocations
  } = payload;

  if (strategy_id !== undefined && !isNonEmptyString(strategy_id)) {
    addError('ERR_INVALID_FIELD', 'strategy_id', 'Field "strategy_id" must be a non-empty string');
  }

  if (timestamp !== undefined && !isNonEmptyString(timestamp)) {
    addError('ERR_INVALID_FIELD', 'timestamp', 'Field "timestamp" must be a non-empty string');
  }

  if (eval_date !== undefined) {
    if (typeof eval_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eval_date)) {
      addError('ERR_INVALID_FIELD', 'eval_date', 'Field "eval_date" must be a valid YYYY-MM-DD date string');
    }
  }

  // summary validation
  if (summary !== undefined) {
    if (!isPlainObject(summary)) {
      addError('ERR_TYPE_MISMATCH', 'summary', 'Field "summary" must be an object');
    } else {
      for (const k of Object.keys(summary)) {
        if (!VERDICT_SYNTHESIS_SUMMARY_KEYS.has(k)) {
          addError('ERR_UNKNOWN_FIELD', `summary.${k}`, `Unknown field "summary.${k}"`);
        }
      }
      for (const reqKey of VERDICT_SYNTHESIS_SUMMARY_KEYS) {
        if (!(reqKey in summary)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `summary.${reqKey}`, `Missing required field "summary.${reqKey}"`);
        }
      }

      if (summary.portfolio_health_score !== undefined) {
        if (!isFiniteNumber(summary.portfolio_health_score) || summary.portfolio_health_score < 0 || summary.portfolio_health_score > 100) {
          addError('ERR_NUMERIC_CONSTRAINT', 'summary.portfolio_health_score', 'Field "summary.portfolio_health_score" must be a number between 0 and 100');
        }
      }

      ['total_positions', 'disqualified_count', 'needs_review_count', 'approved_count'].forEach(cntKey => {
        const val = summary[cntKey];
        if (val !== undefined && (!isFiniteNumber(val) || !Number.isInteger(val) || val < 0)) {
          addError('ERR_NUMERIC_CONSTRAINT', `summary.${cntKey}`, `Field "summary.${cntKey}" must be an integer >= 0`);
        }
      });

      if (summary.capital_at_risk !== undefined) {
        if (!isFiniteNumber(summary.capital_at_risk) || summary.capital_at_risk < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', 'summary.capital_at_risk', 'Field "summary.capital_at_risk" must be a number >= 0');
        }
      }
    }
  }

  // portfolio_verdicts validation
  if (portfolio_verdicts !== undefined) {
    if (!Array.isArray(portfolio_verdicts)) {
      addError('ERR_TYPE_MISMATCH', 'portfolio_verdicts', 'Field "portfolio_verdicts" must be an array');
    } else {
      portfolio_verdicts.forEach((pv, idx) => {
        const pPath = `portfolio_verdicts[${idx}]`;
        if (!isPlainObject(pv)) {
          addError('ERR_TYPE_MISMATCH', pPath, `${pPath} must be an object`);
          return;
        }

        for (const k of Object.keys(pv)) {
          if (!VERDICT_SYNTHESIS_ITEM_ALL_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${pPath}.${k}`, `Unknown field "${pPath}.${k}"`);
          }
        }

        for (const reqKey of VERDICT_SYNTHESIS_ITEM_REQUIRED_KEYS) {
          if (!(reqKey in pv)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${pPath}.${reqKey}`, `Missing required field "${pPath}.${reqKey}"`);
          }
        }

        if (pv.ticker !== undefined && !isNonEmptyString(pv.ticker)) {
          addError('ERR_INVALID_FIELD', `${pPath}.ticker`, `Field "${pPath}.ticker" must be a non-empty string`);
        }

        if (pv.name !== undefined && typeof pv.name !== 'string') {
          addError('ERR_TYPE_MISMATCH', `${pPath}.name`, `Field "${pPath}.name" must be a string`);
        }

        if (pv.market !== undefined && !VALID_MARKETS.has(pv.market)) {
          addError('ERR_INVALID_MARKET', `${pPath}.market`, `Field "${pPath}.market" must be one of: ${[...VALID_MARKETS].join(', ')}`);
        }

        if (pv.synthesized_score !== undefined) {
          if (!isFiniteNumber(pv.synthesized_score) || pv.synthesized_score < 0 || pv.synthesized_score > 100) {
            addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.synthesized_score`, `Field "${pPath}.synthesized_score" must be a number between 0 and 100`);
          }
        }

        if (pv.synthesized_stance !== undefined && !SYNTHESIZED_STANCES.has(pv.synthesized_stance)) {
          addError('ERR_INVALID_STANCE', `${pPath}.synthesized_stance`, `Field "${pPath}.synthesized_stance" must be one of: ${[...SYNTHESIZED_STANCES].join(', ')}`);
        }

        if (pv.is_disqualified !== undefined && typeof pv.is_disqualified !== 'boolean') {
          addError('ERR_TYPE_MISMATCH', `${pPath}.is_disqualified`, `Field "${pPath}.is_disqualified" must be a boolean`);
        }

        if (pv.guardrail_triggered !== undefined && typeof pv.guardrail_triggered !== 'boolean') {
          addError('ERR_TYPE_MISMATCH', `${pPath}.guardrail_triggered`, `Field "${pPath}.guardrail_triggered" must be a boolean`);
        }

        if (pv.recommended_allocation_pct !== undefined) {
          if (!isFiniteNumber(pv.recommended_allocation_pct) || pv.recommended_allocation_pct < 0 || pv.recommended_allocation_pct > 100) {
            addError('ERR_NUMERIC_CONSTRAINT', `${pPath}.recommended_allocation_pct`, `Field "${pPath}.recommended_allocation_pct" must be a number between 0 and 100`);
          }
        }

        if (pv.notes !== undefined) {
          if (!Array.isArray(pv.notes)) {
            addError('ERR_TYPE_MISMATCH', `${pPath}.notes`, `Field "${pPath}.notes" must be an array`);
          } else {
            pv.notes.forEach((note, nIdx) => {
              if (typeof note !== 'string') {
                addError('ERR_TYPE_MISMATCH', `${pPath}.notes[${nIdx}]`, `Note at index ${nIdx} must be a string`);
              }
            });
          }
        }

        // gatekeeper_verdict
        if (pv.gatekeeper_verdict !== undefined) {
          const gPath = `${pPath}.gatekeeper_verdict`;
          if (!isPlainObject(pv.gatekeeper_verdict)) {
            addError('ERR_TYPE_MISMATCH', gPath, `Field "${gPath}" must be an object`);
          } else {
            for (const k of Object.keys(pv.gatekeeper_verdict)) {
              if (!VERDICT_SYNTHESIS_GATEKEEPER_KEYS.has(k)) {
                addError('ERR_UNKNOWN_FIELD', `${gPath}.${k}`, `Unknown field "${gPath}.${k}"`);
              }
            }
            for (const reqKey of VERDICT_SYNTHESIS_GATEKEEPER_KEYS) {
              if (!(reqKey in pv.gatekeeper_verdict)) {
                addError('ERR_MISSING_REQUIRED_FIELD', `${gPath}.${reqKey}`, `Missing required field "${gPath}.${reqKey}"`);
              }
            }

            if (pv.gatekeeper_verdict.principle !== undefined && pv.gatekeeper_verdict.principle !== 'forensic_governance') {
              addError('ERR_INVALID_PRINCIPLE', `${gPath}.principle`, `Field "${gPath}.principle" must be "forensic_governance"`);
            }

            if (pv.gatekeeper_verdict.stance !== undefined && !GATEKEEPER_STANCES.has(pv.gatekeeper_verdict.stance)) {
              addError('ERR_INVALID_STANCE', `${gPath}.stance`, `Field "${gPath}.stance" must be one of: ${[...GATEKEEPER_STANCES].join(', ')}`);
            }

            if (pv.gatekeeper_verdict.is_veto !== undefined && typeof pv.gatekeeper_verdict.is_veto !== 'boolean') {
              addError('ERR_TYPE_MISMATCH', `${gPath}.is_veto`, `Field "${gPath}.is_veto" must be a boolean`);
            }

            if (pv.gatekeeper_verdict.score !== undefined) {
              if (!isFiniteNumber(pv.gatekeeper_verdict.score) || pv.gatekeeper_verdict.score < 0 || pv.gatekeeper_verdict.score > 100) {
                addError('ERR_NUMERIC_CONSTRAINT', `${gPath}.score`, `Field "${gPath}.score" must be a number between 0 and 100`);
              }
            }

            if (pv.gatekeeper_verdict.red_flags !== undefined) {
              if (!Array.isArray(pv.gatekeeper_verdict.red_flags)) {
                addError('ERR_TYPE_MISMATCH', `${gPath}.red_flags`, `Field "${gPath}.red_flags" must be an array`);
              } else {
                pv.gatekeeper_verdict.red_flags.forEach((rf, rfIdx) => {
                  if (typeof rf !== 'string') {
                    addError('ERR_TYPE_MISMATCH', `${gPath}.red_flags[${rfIdx}]`, `Red flag at index ${rfIdx} must be a string`);
                  }
                });
              }
            }
          }
        }

        // pillar_verdicts
        if (pv.pillar_verdicts !== undefined) {
          const pilPath = `${pPath}.pillar_verdicts`;
          if (!isPlainObject(pv.pillar_verdicts)) {
            addError('ERR_TYPE_MISMATCH', pilPath, `Field "${pilPath}" must be an object`);
          } else {
            for (const [pilName, pilData] of Object.entries(pv.pillar_verdicts)) {
              const subPath = `${pilPath}.${pilName}`;
              if (!isPlainObject(pilData)) {
                addError('ERR_TYPE_MISMATCH', subPath, `Field "${subPath}" must be an object`);
                continue;
              }

              for (const k of Object.keys(pilData)) {
                if (!VERDICT_SYNTHESIS_PILLAR_KEYS.has(k)) {
                  addError('ERR_UNKNOWN_FIELD', `${subPath}.${k}`, `Unknown field "${subPath}.${k}"`);
                }
              }

              for (const reqKey of VERDICT_SYNTHESIS_PILLAR_KEYS) {
                if (!(reqKey in pilData)) {
                  addError('ERR_MISSING_REQUIRED_FIELD', `${subPath}.${reqKey}`, `Missing required field "${subPath}.${reqKey}"`);
                }
              }

              if (pilData.score !== undefined) {
                if (!isFiniteNumber(pilData.score) || pilData.score < 0 || pilData.score > 100) {
                  addError('ERR_NUMERIC_CONSTRAINT', `${subPath}.score`, `Field "${subPath}.score" must be a number between 0 and 100`);
                }
              }

              if (pilData.stance !== undefined && !VALUATION_STANCES.has(pilData.stance)) {
                addError('ERR_INVALID_STANCE', `${subPath}.stance`, `Field "${subPath}.stance" must be one of: ${[...VALUATION_STANCES].join(', ')}`);
              }

              if (pilData.weight !== undefined) {
                if (!isFiniteNumber(pilData.weight) || pilData.weight < 0 || pilData.weight > 1) {
                  addError('ERR_NUMERIC_CONSTRAINT', `${subPath}.weight`, `Field "${subPath}.weight" must be a number between 0 and 1`);
                }
              }

              if (pilData.weighted_score !== undefined) {
                if (!isFiniteNumber(pilData.weighted_score) || pilData.weighted_score < 0 || pilData.weighted_score > 100) {
                  addError('ERR_NUMERIC_CONSTRAINT', `${subPath}.weighted_score`, `Field "${subPath}.weighted_score" must be a number between 0 and 100`);
                }
              }

              if (pilData.red_flags !== undefined) {
                if (!Array.isArray(pilData.red_flags)) {
                  addError('ERR_TYPE_MISMATCH', `${subPath}.red_flags`, `Field "${subPath}.red_flags" must be an array`);
                } else {
                  pilData.red_flags.forEach((rf, rfIdx) => {
                    if (typeof rf !== 'string') {
                      addError('ERR_TYPE_MISMATCH', `${subPath}.red_flags[${rfIdx}]`, `Red flag at index ${rfIdx} must be a string`);
                    }
                  });
                }
              }
            }
          }
        }
      });
    }
  }

  // allocations validation
  if (allocations !== undefined) {
    if (!Array.isArray(allocations)) {
      addError('ERR_TYPE_MISMATCH', 'allocations', 'Field "allocations" must be an array');
    } else {
      allocations.forEach((alloc, idx) => {
        const alPath = `allocations[${idx}]`;
        if (!isPlainObject(alloc)) {
          addError('ERR_TYPE_MISMATCH', alPath, `${alPath} must be an object`);
          return;
        }

        for (const k of Object.keys(alloc)) {
          if (!VERDICT_SYNTHESIS_ALLOCATION_KEYS.has(k)) {
            addError('ERR_UNKNOWN_FIELD', `${alPath}.${k}`, `Unknown field "${alPath}.${k}"`);
          }
        }

        for (const reqKey of VERDICT_SYNTHESIS_ALLOCATION_KEYS) {
          if (!(reqKey in alloc)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${alPath}.${reqKey}`, `Missing required field "${alPath}.${reqKey}"`);
          }
        }

        if (alloc.ticker !== undefined && !isNonEmptyString(alloc.ticker)) {
          addError('ERR_INVALID_FIELD', `${alPath}.ticker`, `Field "${alPath}.ticker" must be a non-empty string`);
        }

        if (alloc.current_weight_pct !== undefined) {
          if (!isFiniteNumber(alloc.current_weight_pct) || alloc.current_weight_pct < 0 || alloc.current_weight_pct > 100) {
            addError('ERR_NUMERIC_CONSTRAINT', `${alPath}.current_weight_pct`, `Field "${alPath}.current_weight_pct" must be a number between 0 and 100`);
          }
        }

        if (alloc.recommended_weight_pct !== undefined) {
          if (!isFiniteNumber(alloc.recommended_weight_pct) || alloc.recommended_weight_pct < 0 || alloc.recommended_weight_pct > 100) {
            addError('ERR_NUMERIC_CONSTRAINT', `${alPath}.recommended_weight_pct`, `Field "${alPath}.recommended_weight_pct" must be a number between 0 and 100`);
          }
        }

        if (alloc.action !== undefined && !ALLOCATION_ACTIONS.has(alloc.action)) {
          addError('ERR_INVALID_ACTION', `${alPath}.action`, `Field "${alPath}.action" must be one of: ${[...ALLOCATION_ACTIONS].join(', ')}`);
        }
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      strategy_id: strategy_id || null,
      eval_date: eval_date || null,
      portfolio_health_score: summary && isFiniteNumber(summary.portfolio_health_score) ? summary.portfolio_health_score : null,
      total_positions: summary && isFiniteNumber(summary.total_positions) ? summary.total_positions : 0,
      disqualified_count: summary && isFiniteNumber(summary.disqualified_count) ? summary.disqualified_count : 0,
      needs_review_count: summary && isFiniteNumber(summary.needs_review_count) ? summary.needs_review_count : 0,
      approved_count: summary && isFiniteNumber(summary.approved_count) ? summary.approved_count : 0,
      capital_at_risk: summary && isFiniteNumber(summary.capital_at_risk) ? summary.capital_at_risk : 0.0
    }
  };
}

/**
 * Validate a StrategyConsolidatedPortfolio object against canonical schema rules.
 * @param {object} payload
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateConsolidatedPortfolio(payload) {
  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(payload)) {
    addError('ERR_TYPE_MISMATCH', '$', 'StrategyConsolidatedPortfolio payload must be an object');
    return { ok: false, errors, summary: {} };
  }

  for (const k of Object.keys(payload)) {
    if (!CONSOLIDATED_PORTFOLIO_TOP_KEYS.has(k)) {
      addError('ERR_UNKNOWN_FIELD', k, `Unknown top-level field "${k}" in StrategyConsolidatedPortfolio`);
    }
  }

  for (const reqKey of CONSOLIDATED_PORTFOLIO_TOP_KEYS) {
    if (!(reqKey in payload)) {
      addError('ERR_MISSING_REQUIRED_FIELD', reqKey, `Missing required top-level field "${reqKey}"`);
    }
  }

  const {
    strategy_id,
    timestamp,
    eval_date,
    base_currency,
    summary,
    blended_holdings,
    performance,
    verdict_synthesis,
    embedded_audits
  } = payload;

  if (strategy_id !== undefined && !isNonEmptyString(strategy_id)) {
    addError('ERR_INVALID_FIELD', 'strategy_id', 'Field "strategy_id" must be a non-empty string');
  }

  if (timestamp !== undefined && !isNonEmptyString(timestamp)) {
    addError('ERR_INVALID_FIELD', 'timestamp', 'Field "timestamp" must be a non-empty string');
  }

  if (eval_date !== undefined) {
    if (typeof eval_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eval_date)) {
      addError('ERR_INVALID_FIELD', 'eval_date', 'Field "eval_date" must be a valid YYYY-MM-DD date string');
    }
  }

  if (base_currency !== undefined) {
    if (typeof base_currency !== 'string' || !/^[A-Z]{3}$/.test(base_currency)) {
      addError('ERR_INVALID_CURRENCY', 'base_currency', 'Field "base_currency" must be a 3-letter currency code (e.g. INR, USD)');
    }
  }

  // summary validation
  if (summary !== undefined) {
    if (!isPlainObject(summary)) {
      addError('ERR_TYPE_MISMATCH', 'summary', 'Field "summary" must be an object');
    } else {
      for (const k of Object.keys(summary)) {
        if (!CONSOLIDATED_PORTFOLIO_SUMMARY_KEYS.has(k)) {
          addError('ERR_UNKNOWN_FIELD', `summary.${k}`, `Unknown field "summary.${k}"`);
        }
      }
      for (const reqKey of CONSOLIDATED_PORTFOLIO_SUMMARY_KEYS) {
        if (!(reqKey in summary)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `summary.${reqKey}`, `Missing required field "summary.${reqKey}"`);
        }
      }

      ['total_strategy_equity', 'total_invested_capital'].forEach(eqKey => {
        const val = summary[eqKey];
        if (val !== undefined && (!isFiniteNumber(val) || val < 0)) {
          addError('ERR_NUMERIC_CONSTRAINT', `summary.${eqKey}`, `Field "summary.${eqKey}" must be a number >= 0`);
        }
      });

      ['unrealized_pnl', 'unrealized_pnl_pct'].forEach(pnlKey => {
        const val = summary[pnlKey];
        if (val !== undefined && !isFiniteNumber(val)) {
          addError('ERR_TYPE_MISMATCH', `summary.${pnlKey}`, `Field "summary.${pnlKey}" must be a number`);
        }
      });

      if (summary.xirr !== undefined && summary.xirr !== null && !isFiniteNumber(summary.xirr)) {
        addError('ERR_TYPE_MISMATCH', 'summary.xirr', 'Field "summary.xirr" must be a number or null');
      }

      if (summary.portfolio_health_score !== undefined) {
        if (!isFiniteNumber(summary.portfolio_health_score) || summary.portfolio_health_score < 0 || summary.portfolio_health_score > 100) {
          addError('ERR_NUMERIC_CONSTRAINT', 'summary.portfolio_health_score', 'Field "summary.portfolio_health_score" must be a number between 0 and 100');
        }
      }

      ['total_positions', 'disqualified_count', 'needs_review_count', 'approved_count'].forEach(cntKey => {
        const val = summary[cntKey];
        if (val !== undefined && (!isFiniteNumber(val) || !Number.isInteger(val) || val < 0)) {
          addError('ERR_NUMERIC_CONSTRAINT', `summary.${cntKey}`, `Field "summary.${cntKey}" must be an integer >= 0`);
        }
      });

      if (summary.capital_at_risk !== undefined) {
        if (!isFiniteNumber(summary.capital_at_risk) || summary.capital_at_risk < 0) {
          addError('ERR_NUMERIC_CONSTRAINT', 'summary.capital_at_risk', 'Field "summary.capital_at_risk" must be a number >= 0');
        }
      }
    }
  }

  // blended_holdings
  if (blended_holdings !== undefined) {
    if (!isPlainObject(blended_holdings)) {
      addError('ERR_TYPE_MISMATCH', 'blended_holdings', 'Field "blended_holdings" must be an object');
    } else {
      ['strategy_id', 'base_currency', 'eval_date', 'summary', 'positions', 'pooled_cash'].forEach(req => {
        if (!(req in blended_holdings)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `blended_holdings.${req}`, `Missing required field "blended_holdings.${req}"`);
        }
      });
    }
  }

  // performance
  if (performance !== undefined) {
    if (!isPlainObject(performance)) {
      addError('ERR_TYPE_MISMATCH', 'performance', 'Field "performance" must be an object');
    } else {
      ['strategy_id', 'base_currency', 'eval_date', 'xirr', 'absolute_return', 'friction_breakdown'].forEach(req => {
        if (!(req in performance)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `performance.${req}`, `Missing required field "performance.${req}"`);
        }
      });
    }
  }

  // verdict_synthesis
  if (verdict_synthesis !== undefined) {
    if (!isPlainObject(verdict_synthesis)) {
      addError('ERR_TYPE_MISMATCH', 'verdict_synthesis', 'Field "verdict_synthesis" must be an object');
    } else {
      ['strategy_id', 'eval_date', 'summary', 'portfolio_verdicts', 'allocations'].forEach(req => {
        if (!(req in verdict_synthesis)) {
          addError('ERR_MISSING_REQUIRED_FIELD', `verdict_synthesis.${req}`, `Missing required field "verdict_synthesis.${req}"`);
        }
      });
    }
  }

  // embedded_audits
  if (embedded_audits !== undefined) {
    if (!isPlainObject(embedded_audits)) {
      addError('ERR_TYPE_MISMATCH', 'embedded_audits', 'Field "embedded_audits" must be an object');
    } else {
      for (const [tickerKey, audit] of Object.entries(embedded_audits)) {
        const aPath = `embedded_audits.${tickerKey}`;
        if (!isPlainObject(audit)) {
          addError('ERR_TYPE_MISMATCH', aPath, `${aPath} must be an object`);
          continue;
        }
        ['ticker', 'synthesized_stance', 'synthesized_score', 'gatekeeper_verdict', 'pillar_verdicts'].forEach(req => {
          if (!(req in audit)) {
            addError('ERR_MISSING_REQUIRED_FIELD', `${aPath}.${req}`, `Missing required field "${aPath}.${req}"`);
          }
        });
        if (audit.synthesized_score !== undefined && (!isFiniteNumber(audit.synthesized_score) || audit.synthesized_score < 0 || audit.synthesized_score > 100)) {
          addError('ERR_NUMERIC_CONSTRAINT', `${aPath}.synthesized_score`, `Field "${aPath}.synthesized_score" must be a number between 0 and 100`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      strategy_id: strategy_id || null,
      base_currency: base_currency || null,
      eval_date: eval_date || null,
      total_strategy_equity: summary && isFiniteNumber(summary.total_strategy_equity) ? summary.total_strategy_equity : 0.0,
      portfolio_health_score: summary && isFiniteNumber(summary.portfolio_health_score) ? summary.portfolio_health_score : null,
      total_positions: summary && isFiniteNumber(summary.total_positions) ? summary.total_positions : 0,
      disqualified_count: summary && isFiniteNumber(summary.disqualified_count) ? summary.disqualified_count : 0,
      needs_review_count: summary && isFiniteNumber(summary.needs_review_count) ? summary.needs_review_count : 0,
      approved_count: summary && isFiniteNumber(summary.approved_count) ? summary.approved_count : 0,
      capital_at_risk: summary && isFiniteNumber(summary.capital_at_risk) ? summary.capital_at_risk : 0.0
    }
  };
}

/**
 * Validate a contract JSON file from disk.
 * @param {'financials' | 'verdict' | 'verdict-batch'} contractType
 * @param {string} filePath
 */
function validateContractFile(contractType, filePath) {
  const resolvedPath = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      contractType,
      filePath: resolvedPath,
      errors: [
        {
          code: 'ERR_FILE_NOT_FOUND',
          path: '$',
          message: `Contract file not found at ${resolvedPath}`
        }
      ],
      summary: {}
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      contractType,
      filePath: resolvedPath,
      errors: [
        {
          code: 'ERR_INVALID_JSON',
          path: '$',
          message: `Failed to parse JSON in ${resolvedPath}: ${err.message}`
        }
      ],
      summary: {}
    };
  }

  let result;
  if (contractType === 'financials') {
    result = validateNormalizedFinancials(parsed);
  } else if (contractType === 'verdict') {
    result = validateUniformVerdict(parsed);
  } else if (contractType === 'verdict-batch') {
    result = validateUniformVerdictBatch(parsed);
  } else if (contractType === 'holdings') {
    result = validateAccountHoldingsSnapshot(parsed);
  } else if (contractType === 'blended-holdings') {
    result = validateBlendedHoldings(parsed);
  } else if (contractType === 'strategy-xirr') {
    result = validateStrategyXirr(parsed);
  } else if (contractType === 'verdict-synthesis' || contractType === 'strategy-verdict-synthesis') {
    result = validateVerdictSynthesis(parsed);
  } else if (contractType === 'consolidated-portfolio' || contractType === 'strategy-consolidated-portfolio') {
    result = validateConsolidatedPortfolio(parsed);
  } else {
    return {
      ok: false,
      contractType,
      filePath: resolvedPath,
      errors: [
        {
          code: 'ERR_INVALID_CONTRACT_TYPE',
          path: '$',
          message: `Unsupported contract type "${contractType}". Expected financials, verdict, verdict-batch, holdings, blended-holdings, strategy-xirr, verdict-synthesis, or consolidated-portfolio.`
        }
      ],
      summary: {}
    };
  }

  return {
    ok: result.ok,
    contractType,
    filePath: resolvedPath,
    errors: result.errors,
    summary: result.summary
  };
}

/**
 * CLI execution entrypoint for contract_validator.js.
 * Usage: node contract_validator.js --type <financials|verdict|verdict-batch> --file <path> [--json]
 * @param {string[]} argv
 * @returns {number} exit code
 */
function runContractCli(argv = process.argv.slice(2)) {
  let contractType = null;
  let filePath = null;
  let jsonMode = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--type' && i + 1 < argv.length) {
      contractType = argv[++i];
    } else if (arg.startsWith('--type=')) {
      contractType = arg.slice('--type='.length);
    } else if (arg === '--file' && i + 1 < argv.length) {
      filePath = argv[++i];
    } else if (arg.startsWith('--file=')) {
      filePath = arg.slice('--file='.length);
    }
  }

  const result = validateContractFile(contractType, filePath);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(
      `[OK] Contract "${result.contractType}" valid (${result.filePath})\n`
    );
  } else {
    process.stderr.write(
      `[FAIL] Contract "${result.contractType}" validation failed (${result.filePath}):\n`
    );
    for (const err of result.errors) {
      process.stderr.write(`  - [${err.code}] (${err.path}): ${err.message}\n`);
    }
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  const exitCode = runContractCli();
  process.exit(exitCode);
}

module.exports = {
  loadContractSchema,
  validateNormalizedFinancials,
  validateUniformVerdict,
  validateUniformVerdictBatch,
  validateAccountHoldingsSnapshot,
  validateBlendedHoldings,
  validateStrategyXirr,
  validateVerdictSynthesis,
  validateConsolidatedPortfolio,
  validateContractFile,
  runContractCli
};

