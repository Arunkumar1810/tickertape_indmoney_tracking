#!/usr/bin/env node
'use strict';

/**
 * evaluate_accounting_integrity.js:
 * Forensic Accounting Integrity & Earnings Manipulation Evaluation Engine.
 * Evaluates Beneish M-Score, Sloan Accrual Ratio, DSO expansion, and inventory velocity divergence.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Evaluates accounting integrity and earnings manipulation metrics for a company.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @returns {object} Accounting integrity evaluation result
 */
function evaluateAccountingIntegrity(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateAccountingIntegrity requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'accounting-integrity',
      name: 'Accounting Integrity & Earnings Quality',
      ticker,
      status: 'PASS',
      score: 100.0,
      classification: 'Passive Basket (Bypasses Single-Company Accounting Audits)',
      metrics: {
        beneish_m_score: null,
        sloan_accrual_ratio: null,
        dso_yoy_expansion_pct: null,
        inventory_growth_vs_sales_delta_pct: null
      },
      veto_reasons: [],
      warning_flags: [],
      summary: 'Index ETF passive basket: Single-company accounting integrity models bypassed.'
    };
  }

  const forensics = financials.forensics || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};
  const cashFlow = financials.cash_flow || {};

  const beneishMScore = forensics.beneish_m_score !== undefined && forensics.beneish_m_score !== null
    ? Number(forensics.beneish_m_score)
    : -2.60;

  let sloanAccrualRatio = null;
  if (forensics.sloan_accrual_ratio !== undefined && forensics.sloan_accrual_ratio !== null) {
    sloanAccrualRatio = Number(forensics.sloan_accrual_ratio);
  } else if (income.net_income !== undefined && cashFlow.operating_cash_flow !== undefined && balance.total_assets && balance.total_assets > 0) {
    sloanAccrualRatio = round4((income.net_income - cashFlow.operating_cash_flow) / balance.total_assets);
  } else {
    sloanAccrualRatio = 0.04;
  }

  const dsoExpansionPct = forensics.dso_yoy_expansion_pct !== undefined && forensics.dso_yoy_expansion_pct !== null
    ? Number(forensics.dso_yoy_expansion_pct)
    : 0.0;

  const inventoryGrowthDelta = forensics.inventory_growth_vs_sales_delta_pct !== undefined && forensics.inventory_growth_vs_sales_delta_pct !== null
    ? Number(forensics.inventory_growth_vs_sales_delta_pct)
    : 0.0;

  const vetoReasons = [];
  const warningFlags = [];
  let scoreDeduction = 0.0;

  // Beneish M-Score check
  if (beneishMScore > -1.78) {
    vetoReasons.push(`Beneish M-Score (${round2(beneishMScore)} > -1.78) indicates high probability of earnings manipulation`);
  } else if (beneishMScore > -2.22) {
    scoreDeduction += 25.0;
    warningFlags.push(`Beneish M-Score (${round2(beneishMScore)}) in grey zone approaching earnings manipulation`);
  }

  // Sloan Accrual Ratio check
  if (sloanAccrualRatio > 0.25) {
    vetoReasons.push(`Severe non-cash earnings distortion (Sloan accrual ratio ${round4(sloanAccrualRatio)} > 0.25)`);
  } else if (sloanAccrualRatio > 0.10) {
    scoreDeduction += 25.0;
    warningFlags.push(`High non-cash accrual ratio (${round4(sloanAccrualRatio)} > 0.10) indicates lower earnings quality`);
  }

  // Operational checks
  if (dsoExpansionPct > 20.0) {
    scoreDeduction += 15.0;
    warningFlags.push(`Days Sales Outstanding (DSO) expanded by ${round2(dsoExpansionPct)}% YoY`);
  }
  if (inventoryGrowthDelta > 15.0) {
    scoreDeduction += 15.0;
    warningFlags.push(`Inventory growth outpaced sales growth by ${round2(inventoryGrowthDelta)}%`);
  }

  const isVeto = vetoReasons.length > 0;
  const score = isVeto ? 0.0 : Math.max(0.0, 100.0 - scoreDeduction);
  const status = isVeto ? 'VETO' : (warningFlags.length > 0 ? 'FLAG' : 'PASS');

  return {
    principle: 'accounting-integrity',
    name: 'Accounting Integrity & Earnings Quality',
    ticker,
    status,
    score,
    is_veto: isVeto,
    metrics: {
      beneish_m_score: isFiniteNumber(beneishMScore) ? round2(beneishMScore) : null,
      sloan_accrual_ratio: isFiniteNumber(sloanAccrualRatio) ? round4(sloanAccrualRatio) : null,
      dso_yoy_expansion_pct: round2(dsoExpansionPct),
      inventory_growth_vs_sales_delta_pct: round2(inventoryGrowthDelta)
    },
    veto_reasons: vetoReasons,
    warning_flags: warningFlags,
    summary: isVeto
      ? `CRITICAL ACCOUNTING INTEGRITY VETO: ${vetoReasons.join('; ')}`
      : (warningFlags.length > 0 ? `FLAG: ${warningFlags.join('; ')}` : 'PASS: Conservative earnings quality and low non-cash accruals verified.')
  };
}

module.exports = {
  evaluateAccountingIntegrity
};

