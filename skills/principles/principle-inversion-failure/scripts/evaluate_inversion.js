#!/usr/bin/env node
'use strict';

/**
 * evaluate_inversion.js:
 * Charlie Munger Inversion & Terminal Failure Mode Evaluation Engine.
 * Tests how a business model could fail over a 10-year horizon.
 */

const fs = require('fs');
const path = require('path');

const INDEX_ETF_TICKERS = new Set(['VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM']);

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function evaluateInversionFailure(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateInversionFailure requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'inversion-failure',
      name: 'Inversion & Failure Mode Analysis',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Diversified Broad Market (Terminal Failure Protected)',
      metrics: {
        debt_to_equity: 0,
        operating_margin_pct: null,
        interest_coverage: null
      },
      failure_modes: [],
      summary: `Broad market ETF (${ticker}): Inherent constituent diversification eliminates single-company insolvency failure modes.`
    };
  }

  const inc = financials.income_statement || {};
  const bal = financials.balance_sheet || {};
  const cf = financials.cash_flow || {};

  const totalDebt = isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0;
  const equity = isFiniteNumber(bal.total_equity) && bal.total_equity > 0 ? Number(bal.total_equity) : 0;
  const cash = isFiniteNumber(bal.cash_and_equivalents) ? Number(bal.cash_and_equivalents) : 0;
  const netDebt = Math.max(0, totalDebt - cash);

  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : (isFiniteNumber(inc.operating_income) ? Number(inc.operating_income) : 0);
  const interest = isFiniteNumber(inc.interest_expense) ? Math.abs(Number(inc.interest_expense)) : 0;
  const revenue = isFiniteNumber(inc.revenue) ? Number(inc.revenue) : (isFiniteNumber(inc.total_revenue) ? Number(inc.total_revenue) : 0);
  const opMargin = revenue > 0 ? (ebit / revenue) * 100 : 0;
  const deRatio = equity > 0 ? totalDebt / equity : 0;
  const interestCoverage = interest > 0 ? ebit / interest : 999.0;

  const failureModes = [];
  let score = 100;

  // 1. Solvency & Debt Wall Stress
  if (deRatio > 2.0 || (ebit > 0 && netDebt / ebit > 4.0)) {
    score -= 40;
    failureModes.push(`Balance Sheet Fragility: High debt load (D/E ${deRatio.toFixed(2)}x) exposes company to credit freeze or debt rollover failure.`);
  } else if (deRatio > 1.2 || (ebit > 0 && netDebt / ebit > 2.5)) {
    score -= 20;
    failureModes.push(`Moderate Leverage Exposure: D/E ratio of ${deRatio.toFixed(2)}x reduces margin for operational error.`);
  }

  // 2. Interest Coverage Buffer
  if (interestCoverage < 2.0) {
    score -= 30;
    failureModes.push(`Debt Servicing Squeeze: Interest coverage of only ${interestCoverage.toFixed(1)}x; vulnerable during economic downturn.`);
  } else if (interestCoverage < 4.0) {
    score -= 15;
    failureModes.push(`Thin Interest Buffer: Interest coverage of ${interestCoverage.toFixed(1)}x leaves modest cushion.`);
  }

  // 3. Margin Compression & Fixed Cost Burden
  if (opMargin < 5.0) {
    score -= 30;
    failureModes.push(`Price-Taker Margin Vulnerability: Razor-thin operating margin (${opMargin.toFixed(1)}%) vulnerable to input cost inflation.`);
  } else if (opMargin < 12.0) {
    score -= 10;
    failureModes.push(`Modest Operating Buffer: Operating margin of ${opMargin.toFixed(1)}% vulnerable to aggressive price wars.`);
  }

  // 4. Free Cash Flow Burn
  const ocf = isFiniteNumber(cf.operating_cash_flow) ? Number(cf.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cf.capital_expenditure) ? Math.abs(Number(cf.capital_expenditure)) : 0;
  const fcf = ocf - capex;
  if (fcf < 0) {
    score -= 20;
    failureModes.push(`Capital Bleed: Negative free cash flow (${fcf}) requires continuous external financing or dilution.`);
  }

  score = Math.max(0, Math.min(100, score));

  let status = 'PASS';
  let classification = 'Resilient Fortress (Low 10-Year Failure Risk)';
  if (score < 50) {
    status = 'FAIL';
    classification = 'Terminal Failure Fragility (High Insolvency / Squeeze Risk)';
  } else if (score < 75) {
    status = 'WARN';
    classification = 'Vulnerable Operating Buffer (Watch Debt & Margin Drag)';
  }

  return {
    principle: 'inversion-failure',
    name: 'Inversion & Failure Mode Analysis',
    ticker,
    status,
    score,
    classification,
    metrics: {
      debt_to_equity: round2(deRatio),
      interest_coverage: round2(interestCoverage),
      operating_margin_pct: round2(opMargin),
      net_debt: round2(netDebt),
      free_cash_flow: round2(fcf)
    },
    failure_modes: failureModes,
    summary: `${status} (${classification}): Inversion score of ${score}/100 with ${failureModes.length} identified structural vulnerabilities.`
  };
}

module.exports = { evaluateInversionFailure };

if (require.main === module) {
  const argv = process.argv.slice(2);
  let ticker = null;
  let dataPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticker' && argv[i + 1]) ticker = argv[++i];
    else if (argv[i] === '--data' && argv[i + 1]) dataPath = argv[++i];
  }
  const file = dataPath || (ticker ? path.resolve(process.cwd(), 'reports', 'financials', `${ticker.toUpperCase()}.json`) : null);
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node evaluate_inversion.js --ticker <TICKER> or --data <PATH>');
    process.exit(1);
  }
  const fin = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(evaluateInversionFailure(fin), null, 2));
}
