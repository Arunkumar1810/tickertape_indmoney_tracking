#!/usr/bin/env node
'use strict';

/**
 * evaluate_quality.js:
 * Charlie Munger Quality Business at a Fair Price Evaluation Engine.
 * Rejects statistical cheapness on bad businesses; demands high ROIC at fair multiples.
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

function evaluateQualityAtFairPrice(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateQualityAtFairPrice requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'quality-at-fair-price',
      name: 'Quality at a Fair Price',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Compounder Basket',
      metrics: { roic_pct: null, pe_ratio: null, quality_grade: 'A+' },
      observations: ['Passive market-wide index combines quality compounding with market pricing.'],
      summary: `Broad market ETF (${ticker}): Market-cap weighted compounding basket automatically filters for surviving winners.`
    };
  }

  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};
  const val = financials.valuation || {};
  const cf = financials.cash_flow || {};

  const totalDebt = isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0;
  const equity = isFiniteNumber(bal.total_equity) && bal.total_equity > 0 ? Number(bal.total_equity) : 0;
  const cash = isFiniteNumber(bal.cash_and_equivalents) ? Number(bal.cash_and_equivalents) : 0;
  const investedCapital = Math.max(1, (equity + totalDebt) - cash);

  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : (isFiniteNumber(inc.operating_income) ? Number(inc.operating_income) : 0);
  const taxRate = isFiniteNumber(inc.effective_tax_rate) ? Number(inc.effective_tax_rate) : 0.25;
  const nopat = ebit * (1 - Math.min(0.4, Math.max(0, taxRate)));
  const roic = investedCapital > 0 ? (nopat / investedCapital) * 100 : 0;

  const peRatio = isFiniteNumber(val.pe_ratio) ? Number(val.pe_ratio) : (isFiniteNumber(val.pe) ? Number(val.pe) : null);
  const pbRatio = isFiniteNumber(val.pb_ratio) ? Number(val.pb_ratio) : null;
  const mcap = isFiniteNumber(val.market_cap) ? Number(val.market_cap) : null;

  const ocf = isFiniteNumber(cf.operating_cash_flow) ? Number(cf.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cf.capital_expenditure) ? Math.abs(Number(cf.capital_expenditure)) : 0;
  const ownerEarnings = ocf - capex;
  const oeYield = (mcap && mcap > 0 && ownerEarnings > 0) ? (ownerEarnings / mcap) * 100 : null;

  const observations = [];
  let score = 100;
  let classification = 'Wonderful Company at a Fair Price';

  // 1. Quality Hurdle (ROIC must be pristine)
  if (roic >= 20.0) {
    observations.push(`Stellar Capital Efficiency: ROIC of ${roic.toFixed(1)}% confirms a top-tier compounding engine.`);
  } else if (roic >= 15.0) {
    observations.push(`Solid Capital Efficiency: ROIC of ${roic.toFixed(1)}% meets Munger quality threshold.`);
    score -= 10;
  } else if (roic >= 10.0) {
    observations.push(`Mediocre Capital Efficiency: ROIC of ${roic.toFixed(1)}% is mediocre; requires a deeply discounted price.`);
    score -= 30;
  } else {
    // Value trap detection: If ROIC < 10%, even if cheap P/E, Munger refuses cigar butts!
    observations.push(`Value Trap Alert: ROIC of ${roic.toFixed(1)}% indicates poor business economics. Munger rejects cigar butts.`);
    score -= 60;
  }

  // 2. Valuation multiple sanity
  if (peRatio !== null) {
    if (peRatio <= 0) {
      observations.push(`Negative P/E multiple (${peRatio}) reflects unprofitability.`);
      score -= 50;
    } else if (peRatio > 45.0) {
      observations.push(`Euphoric Multiple: P/E of ${peRatio.toFixed(1)}x leaves zero margin of safety, requiring flawless execution.`);
      score -= 35;
    } else if (peRatio > 30.0) {
      if (roic < 20.0) {
        observations.push(`Expensive for Quality: P/E of ${peRatio.toFixed(1)}x with sub-20% ROIC (${roic.toFixed(1)}%).`);
        score -= 25;
      } else {
        observations.push(`Premium Multiple on Wonderful Business: P/E of ${peRatio.toFixed(1)}x is justified by elite ${roic.toFixed(1)}% ROIC.`);
        score -= 10;
      }
    } else if (peRatio <= 22.0 && roic >= 15.0) {
      observations.push(`Ideal Munger Setup: P/E of ${peRatio.toFixed(1)}x on a high-ROIC (${roic.toFixed(1)}%) franchise.`);
    }
  }

  // 3. Owner Earnings Yield
  if (oeYield !== null) {
    if (oeYield >= 6.0) {
      observations.push(`Generous Cash Yield: Owner earnings yield of ${oeYield.toFixed(1)}% provides strong margin of safety.`);
    } else if (oeYield < 3.0) {
      observations.push(`Tight Cash Yield: Owner earnings yield of ${oeYield.toFixed(1)}% provides modest cash return.`);
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let status = 'PASS';
  if (score < 50) {
    status = 'FAIL';
    classification = roic < 10 ? 'Cigar Butt / Value Trap (Rejected)' : 'Grossly Overvalued';
  } else if (score < 75) {
    status = 'WARN';
    classification = 'Fair Company at Full Price';
  }

  return {
    principle: 'quality-at-fair-price',
    name: 'Quality Business at a Fair Price',
    ticker,
    status,
    score,
    classification,
    metrics: {
      roic_pct: round2(roic),
      pe_ratio: round2(peRatio),
      pb_ratio: round2(pbRatio),
      owner_earnings_yield_pct: round2(oeYield)
    },
    observations,
    summary: `${status} (${classification}): Score ${score}/100 with ROIC of ${roic.toFixed(1)}% and P/E of ${peRatio ? peRatio.toFixed(1) : 'N/A'}x.`
  };
}

module.exports = { evaluateQualityAtFairPrice };

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
    console.error('Usage: node evaluate_quality.js --ticker <TICKER> or --data <PATH>');
    process.exit(1);
  }
  const fin = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(evaluateQualityAtFairPrice(fin), null, 2));
}

