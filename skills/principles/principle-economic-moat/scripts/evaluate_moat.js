#!/usr/bin/env node
'use strict';

/**
 * evaluate_moat.js: Evaluates Warren Buffett's Economic Moat & Capital Efficiency (ROIC).
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

function inferMarket(ticker, explicitMarket) {
  if (explicitMarket && (explicitMarket === 'IN' || explicitMarket === 'US')) return explicitMarket;
  const clean = (ticker || '').toUpperCase();
  return (KNOWN_US_TICKERS.has(clean) || INDEX_ETF_TICKERS.has(clean)) ? 'US' : 'IN';
}

function calculateROIC({ ebit, taxExpense, ebt, totalEquity, totalDebt, cashAndEquivalents }) {
  if (!isFiniteNumber(ebit) || ebit <= 0) return null;
  const tExp = isFiniteNumber(taxExpense) ? Number(taxExpense) : 0;
  const ebtVal = isFiniteNumber(ebt) ? Number(ebt) : ebit;
  const effectiveTaxRate = (ebtVal > 0 && tExp >= 0) ? Math.min(0.40, Math.max(0, tExp / ebtVal)) : 0.25;
  const nopat = ebit * (1 - effectiveTaxRate);
  const eq = isFiniteNumber(totalEquity) ? Number(totalEquity) : 0;
  const debt = isFiniteNumber(totalDebt) ? Number(totalDebt) : 0;
  const cash = isFiniteNumber(cashAndEquivalents) ? Number(cashAndEquivalents) : 0;
  const investedCapital = eq + debt - cash;
  if (investedCapital <= 0) return null;
  return {
    roic: round2((nopat / investedCapital) * 100),
    nopat: round2(nopat),
    investedCapital: round2(investedCapital)
  };
}

function evaluateMoat(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateMoat requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'economic-moat',
      name: 'Economic Moat & Capital Efficiency',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Broad-Market Basket',
      metrics: { roic_pct: null, nopat: null, invested_capital: null },
      checks: [
        {
          name: 'Broad-Market Index Diversification',
          criterion: 'Passive Index Basket',
          actual: 'Full Basket',
          status: 'PASS',
          details: 'Passive ETF automatically diversifies across constituent holdings'
        }
      ],
      summary: `Index ETF passive basket (${ticker}): Broad-market diversification automatically bypasses single-company ROIC hurdle.`,
      observations: ['Passive index fund automatically diversifies across constituent holdings.']
    };
  }

  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};

  const ebit = isFiniteNumber(income.ebit) ? Number(income.ebit) : 0;
  const ebt = isFiniteNumber(income.ebt) ? Number(income.ebt) : 0;
  const taxExpense = isFiniteNumber(income.tax_expense) ? Number(income.tax_expense) : 0;

  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : 0;
  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0;
  const cash = isFiniteNumber(balance.cash_and_equivalents) ? Number(balance.cash_and_equivalents) : 0;

  const res = calculateROIC({ ebit, taxExpense, ebt, totalEquity, totalDebt, cashAndEquivalents: cash });
  const roic = res ? res.roic : null;

  let score = 0;
  let status = 'FAIL';
  let classification = 'No Moat / Capital Destructive';
  const observations = [];

  if (roic !== null) {
    if (roic >= 20.0) {
      score = 100;
      status = 'PASS';
      classification = 'Wide Economic Moat';
      observations.push(`Wide economic moat confirmed: ROIC of ${roic}% substantially exceeds 20.0% hurdle.`);
    } else if (roic >= 15.0) {
      score = 80;
      status = 'PASS';
      classification = 'Strong Economic Moat';
      observations.push(`Solid economic moat: ROIC of ${roic}% comfortably clears the 15.0% hurdle.`);
    } else if (roic >= 10.0) {
      score = 50;
      status = 'WARN';
      classification = 'Moderate Economic Moat';
      observations.push(`Moderate capital productivity: ROIC of ${roic}% meets cost of capital but lacks wide moat pricing power.`);
    } else if (roic >= 5.0) {
      score = 25;
      status = 'WARN';
      classification = 'Narrow Moat';
      observations.push(`Narrow moat: ROIC of ${roic}% is marginal (< 10.0%).`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'No Moat / Capital Destructive';
      observations.push(`Sub-par capital efficiency: ROIC of ${roic}% indicates capital destruction.`);
    }
  } else {
    observations.push('Negative or indeterminable ROIC indicates capital destruction or negative invested capital.');
  }

  const checks = [
    {
      name: 'Economic Moat & ROIC Hurdle',
      criterion: 'ROIC >= 15.0% (Wide Moat >= 20.0%)',
      actual: roic !== null ? `${roic}%` : 'N/A',
      status,
      details: roic !== null ? `ROIC of ${roic}% indicates ${classification}` : 'Negative or indeterminable ROIC'
    }
  ];

  return {
    principle: 'economic-moat',
    name: 'Economic Moat & Capital Efficiency',
    ticker,
    status,
    score,
    classification,
    metrics: {
      roic_pct: roic,
      nopat: res ? res.nopat : null,
      invested_capital: res ? res.investedCapital : null
    },
    checks,
    summary: `${status} (${classification}): ROIC of ${roic !== null ? roic + '%' : 'N/A'}.`,
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
    else if (args[i] === '--market' && args[i + 1]) options.market = args[++i];
  }

  try {
    const fin = resolveFinancials(options);
    const evaluation = evaluateMoat(fin);
    console.log(JSON.stringify(evaluation, null, 2));
  } catch (err) {
    console.error('Error evaluating economic moat:', err.message);
    process.exit(1);
  }
}

module.exports = { evaluateMoat, calculateROIC };

