#!/usr/bin/env node
'use strict';

/**
 * evaluate_incentives.js:
 * Charlie Munger Incentive Alignment & Governance Analysis Engine.
 * Audits executive compensation, dilution drag, and capital allocation sanity.
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

function evaluateIncentiveBias(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateIncentiveBias requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'incentive-bias',
      name: 'Incentive Alignment & Governance',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Fiduciary Vehicle',
      metrics: { sbc_dilution_pct: 0, goodwill_asset_pct: 0 },
      incentive_flags: [],
      summary: `Broad market ETF (${ticker}): Passive statutory index management carries no corporate executive option extraction risk.`
    };
  }

  const cf = financials.cash_flow || {};
  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};

  const ocf = isFiniteNumber(cf.operating_cash_flow) ? Number(cf.operating_cash_flow) : 0;
  const sbc = isFiniteNumber(cf.stock_based_compensation) ? Math.abs(Number(cf.stock_based_compensation)) : 0;
  const sbcPct = ocf > 0 ? (sbc / ocf) * 100 : 0;

  const totalAssets = isFiniteNumber(bal.total_assets) && bal.total_assets > 0 ? Number(bal.total_assets) : 0;
  const goodwill = isFiniteNumber(bal.goodwill_intangibles) ? Number(bal.goodwill_intangibles) : 0;
  const goodwillPct = totalAssets > 0 ? (goodwill / totalAssets) * 100 : 0;

  const shares = isFiniteNumber(bal.shares_outstanding) ? Number(bal.shares_outstanding) : null;
  const incentiveFlags = [];
  let score = 100;

  // 1. Stock-Based Compensation Dilution Drag
  if (sbcPct > 25.0) {
    score -= 40;
    incentiveFlags.push(`Perverse Option Compensation: SBC consumes ${sbcPct.toFixed(1)}% of operating cash flow. Management is enriching itself at shareholder expense.`);
  } else if (sbcPct > 15.0) {
    score -= 20;
    incentiveFlags.push(`Elevated Dilution Drag: SBC absorbs ${sbcPct.toFixed(1)}% of operating cash flow; creates continuous per-share drag.`);
  } else if (sbcPct > 5.0) {
    score -= 10;
    incentiveFlags.push(`Modest Option Dilution: SBC represents ${sbcPct.toFixed(1)}% of operating cash flow.`);
  }

  // 2. Empire-Building M&A & Goodwill Bloat
  if (goodwillPct > 35.0) {
    score -= 30;
    incentiveFlags.push(`Acquisitive Empire-Building: Goodwill & intangibles represent ${goodwillPct.toFixed(1)}% of total assets, indicating premium-price acquisitions and write-down risks.`);
  } else if (goodwillPct > 20.0) {
    score -= 15;
    incentiveFlags.push(`Substantial Goodwill Burden: ${goodwillPct.toFixed(1)}% of assets tied to acquired goodwill.`);
  }

  // 3. Shareholder Capital Return Integrity
  const dividendsPaid = isFiniteNumber(cf.dividends_paid) ? Math.abs(Number(cf.dividends_paid)) : 0;
  const netIncome = isFiniteNumber(inc.net_income) ? Number(inc.net_income) : 0;
  if (netIncome > 0 && dividendsPaid > netIncome * 1.1) {
    score -= 15;
    incentiveFlags.push(`Unsustainable Payout Ratio: Dividends paid exceed net income (${((dividendsPaid / netIncome) * 100).toFixed(0)}%); potentially cannibalizing balance sheet.`);
  }

  score = Math.max(0, Math.min(100, score));

  let status = 'PASS';
  let classification = 'Prudent Capital Stewards (Aligned Incentives)';
  if (score < 50) {
    status = 'FAIL';
    classification = 'Severe Incentive Misalignment (Extraction & Empire Building)';
  } else if (score < 75) {
    status = 'WARN';
    classification = 'Moderate Dilution or M&A Drag';
  }

  return {
    principle: 'incentive-bias',
    name: 'Incentive Alignment & Governance',
    ticker,
    status,
    score,
    classification,
    metrics: {
      sbc_dilution_pct: round2(sbcPct),
      goodwill_asset_pct: round2(goodwillPct),
      sbc_used: round2(sbc),
      operating_cash_flow: round2(ocf)
    },
    incentive_flags: incentiveFlags,
    summary: `${status} (${classification}): Incentive score of ${score}/100 with ${incentiveFlags.length} governance observations.`
  };
}

module.exports = { evaluateIncentiveBias };

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
    console.error('Usage: node evaluate_incentives.js --ticker <TICKER> or --data <PATH>');
    process.exit(1);
  }
  const fin = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(evaluateIncentiveBias(fin), null, 2));
}
