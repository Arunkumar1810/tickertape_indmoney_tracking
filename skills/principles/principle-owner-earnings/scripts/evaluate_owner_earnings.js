#!/usr/bin/env node
'use strict';

/**
 * evaluate_owner_earnings.js: Evaluates Warren Buffett's True Owner Earnings & Dilution Quality.
 * Formula: Operating Cash Flow - Maintenance CapEx - Stock Based Compensation.
 * Completely independent evaluation engine. Emits standard JSON evaluation.
 */

const fs = require('fs');
const path = require('path');

const INDEX_ETF_TICKERS = new Set(['VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM']);
const KNOWN_US_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA',
  'AMD', 'INTC', 'CSCO', 'ADBE', 'NFLX', 'AVGO', 'CRM', 'ORCL',
  'DIS', 'KO', 'PEP', 'PG', 'COST', 'WMT', 'JNJ', 'UNH', 'LLY',
  'V', 'MA', 'JPM', 'BAC', 'GS', 'VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP'
]);

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function calculateOwnerEarnings(operatingCashFlow, capitalExpenditure, maintenanceCapEx, stockBasedComp = 0, depreciation = null) {
  const ocf = isFiniteNumber(operatingCashFlow) ? Number(operatingCashFlow) : 0;
  const rawCapex = Math.abs(isFiniteNumber(capitalExpenditure) ? Number(capitalExpenditure) : 0);
  const sbc = Math.abs(isFiniteNumber(stockBasedComp) ? Number(stockBasedComp) : 0);
  const da = isFiniteNumber(depreciation) ? Number(depreciation) : null;

  let capex = rawCapex;
  let capexSource = 'TOTAL_CAPEX_CONSERVATIVE';

  if (isFiniteNumber(maintenanceCapEx) && maintenanceCapEx > 0) {
    capex = Number(maintenanceCapEx);
    capexSource = 'DISCLOSED_MAINTENANCE';
  } else if (da !== null && da > 0 && rawCapex > da) {
    // If total capex significantly exceeds D&A and no explicit split exists, D&A acts as standard maintenance proxy
    capex = da;
    capexSource = 'DEPRECIATION_PROXY';
  } else if (rawCapex > 0) {
    capex = rawCapex;
    capexSource = 'TOTAL_CAPEX_CONSERVATIVE';
  } else {
    capex = 0;
    capexSource = 'ZERO_CAPEX';
  }

  const rawOwnerEarnings = round2(ocf - capex);
  const trueOwnerEarnings = round2(ocf - capex - sbc);
  const sbcDilutionPct = ocf > 0 ? round2((sbc / ocf) * 100) : 0.0;

  return {
    rawOwnerEarnings,
    trueOwnerEarnings,
    sbcDilutionPct,
    capexUsed: capex,
    capexSource,
    rawCapex,
    sbcUsed: sbc,
    operatingCashFlow: ocf
  };
}

function evaluateOwnerEarnings(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateOwnerEarnings requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'owner-earnings',
      name: 'True Owner Earnings & Dilution Quality',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: {
        raw_owner_earnings: null,
        true_owner_earnings: null,
        sbc_dilution_pct: null
      },
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-company cash flow calculations.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const cashFlow = financials.cash_flow || {};
  const incomeStmt = financials.income_statement || {};
  const ocf = isFiniteNumber(cashFlow.operating_cash_flow) ? Number(cashFlow.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cashFlow.capital_expenditure) ? Number(cashFlow.capital_expenditure) : 0;
  const maintCapex = isFiniteNumber(cashFlow.maintenance_capex) ? Number(cashFlow.maintenance_capex) : null;
  const sbc = isFiniteNumber(cashFlow.stock_based_compensation) ? Number(cashFlow.stock_based_compensation) : 0;
  const da = isFiniteNumber(cashFlow.depreciation_amortization)
    ? Number(cashFlow.depreciation_amortization)
    : (isFiniteNumber(incomeStmt.depreciation_amortization) ? Number(incomeStmt.depreciation_amortization) : null);

  const res = calculateOwnerEarnings(ocf, capex, maintCapex, sbc, da);
  const trueOE = res.trueOwnerEarnings;
  const sbcPct = res.sbcDilutionPct;

  let score = 0;
  let status = 'FAIL';
  let classification = 'Negative Owner Earnings / Cash Drain';
  const observations = [];

  // Note the CapEx source transparently
  if (res.capexSource === 'DISCLOSED_MAINTENANCE') {
    observations.push(`Disclosed Maintenance CapEx: Directly parsed ${res.capexUsed} from disclosure.`);
  } else if (res.capexSource === 'DEPRECIATION_PROXY') {
    observations.push(`CapEx Split: Total CapEx (${res.rawCapex}) exceeds D&A (${res.capexUsed}); D&A used as conservative maintenance CapEx baseline.`);
  } else {
    observations.push(`Conservative CapEx: Full capital expenditure (${res.capexUsed}) treated as maintenance baseline.`);
  }

  if (trueOE !== null && trueOE > 0) {
    if (sbcPct <= 5.0) {
      score = 100;
      status = 'PASS';
      classification = 'Pristine Cash Conversion';
      observations.push(`High cash conversion: SBC represents only ${sbcPct}% of operating cash flow (well below 5% hurdle).`);
    } else if (sbcPct <= 15.0) {
      score = 75;
      status = 'PASS';
      classification = 'Acceptable Dilution';
      observations.push(`Satisfactory owner earnings conversion: SBC dilution of ${sbcPct}% is within acceptable 15% range.`);
    } else if (sbcPct <= 25.0) {
      score = 35;
      status = 'WARN';
      classification = 'Elevated Dilution Drag';
      observations.push(`Elevated equity dilution: SBC represents ${sbcPct}% of operating cash flow (>15.0% threshold).`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Severe SBC Dilution';
      observations.push(`Severe SBC dilution: SBC represents ${sbcPct}% of operating cash flow, significantly impairing cash return to shareholders.`);
    }
  } else {
    observations.push(`Negative true Owner Earnings (${trueOE}) indicates ongoing cash burn net of CapEx and SBC.`);
  }

  return {
    principle: 'owner-earnings',
    name: 'True Owner Earnings & Dilution Quality',
    ticker,
    status,
    score,
    classification,
    metrics: {
      raw_owner_earnings: res.rawOwnerEarnings,
      true_owner_earnings: trueOE,
      sbc_dilution_pct: sbcPct,
      operating_cash_flow: res.operatingCashFlow,
      capex_used: res.capexUsed,
      capex_source: res.capexSource,
      raw_capex: res.rawCapex,
      sbc_used: res.sbcUsed
    },
    summary: `${status} (${classification}): True Owner Earnings of ${trueOE} (SBC dilution: ${sbcPct}%).`,
    observations
  };
}

function resolveFinancials(options) {
  if (options.data && fs.existsSync(options.data)) {
    return JSON.parse(fs.readFileSync(options.data, 'utf8'));
  }
  if (options.ticker) {
    const clean = options.ticker.toUpperCase();
    const reportsDir = path.resolve(process.cwd(), 'reports', 'financials');
    const cand = path.join(reportsDir, `${clean}.json`);
    if (fs.existsSync(cand)) {
      return JSON.parse(fs.readFileSync(cand, 'utf8'));
    }
  }
  throw new Error('Please provide --data <path-to-financials.json> or an existing --ticker <TICKER>');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) options.data = args[++i];
    else if (args[i] === '--ticker' && args[i + 1]) options.ticker = args[++i];
  }

  try {
    const fin = resolveFinancials(options);
    const evaluation = evaluateOwnerEarnings(fin);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating owner earnings:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluateOwnerEarnings, calculateOwnerEarnings };

