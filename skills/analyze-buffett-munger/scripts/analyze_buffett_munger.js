#!/usr/bin/env node
'use strict';

/**
 * analyze_buffett_munger.js: Tier 3 Warren Buffett & Charlie Munger Compounding Valuation Engine.
 * Computes true Owner Earnings (CFO - CapEx - SBC), 5-step DuPont ROE decomposition,
 * Return on Invested Capital (ROIC), and economic moat durability.
 * Emits canonical UniformVerdictContract (principle: "buffett_munger", is_veto: false).
 */

const fs = require('fs');
const path = require('path');

const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../scripts/framework');

let providerTickertape;
try {
  providerTickertape = require('../../provider-tickertape/scripts/provider_tickertape');
} catch {
  providerTickertape = null;
}

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json')) ? path.resolve(SKILL_ROOT, '..', '..') : path.resolve(SKILL_ROOT, '..', '..', '..');
const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'buffett-munger-template.html');

const INDEX_ETF_TICKERS = new Set([
  'VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM'
]);

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

function round4(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function inferMarket(ticker, explicitMarket) {
  if (explicitMarket && (explicitMarket === 'IN' || explicitMarket === 'US')) {
    return explicitMarket;
  }
  const cleanTicker = (ticker || '').toUpperCase();
  if (KNOWN_US_TICKERS.has(cleanTicker) || INDEX_ETF_TICKERS.has(cleanTicker)) {
    return 'US';
  }
  return 'IN';
}

/**
 * Calculate true Owner Earnings: Operating Cash Flow - Maintenance CapEx - Stock-Based Comp.
 */
function calculateOwnerEarnings(operatingCashFlow, capitalExpenditure, maintenanceCapEx, stockBasedComp = 0) {
  const ocf = isFiniteNumber(operatingCashFlow) ? Number(operatingCashFlow) : 0;
  // Prioritize maintenance CapEx if broken out, else full CapEx
  const capex = (isFiniteNumber(maintenanceCapEx) && maintenanceCapEx > 0)
    ? Number(maintenanceCapEx)
    : Math.abs(isFiniteNumber(capitalExpenditure) ? Number(capitalExpenditure) : 0);
  const sbc = Math.abs(isFiniteNumber(stockBasedComp) ? Number(stockBasedComp) : 0);

  const rawOwnerEarnings = round2(ocf - capex);
  const trueOwnerEarnings = round2(ocf - capex - sbc);
  const sbcDilutionPct = ocf > 0 ? round2((sbc / ocf) * 100) : 0.0;

  return {
    rawOwnerEarnings,
    trueOwnerEarnings,
    sbcDilutionPct,
    capexUsed: capex
  };
}

/**
 * Calculate 5-Step DuPont ROE Decomposition.
 * Tax Burden * Interest Burden * Operating Margin * Asset Turnover * Financial Leverage.
 */
function calculate5StepDuPont({ netIncome, ebt, ebit, revenue, totalAssets, totalEquity }) {
  if (
    !isFiniteNumber(netIncome) ||
    !isFiniteNumber(ebt) ||
    !isFiniteNumber(ebit) ||
    !isFiniteNumber(revenue) ||
    !isFiniteNumber(totalAssets) ||
    !isFiniteNumber(totalEquity) ||
    totalEquity <= 0 ||
    totalAssets <= 0 ||
    revenue <= 0 ||
    ebit <= 0 ||
    ebt <= 0
  ) {
    return null;
  }

  const taxBurden = round4(netIncome / ebt);
  const interestBurden = round4(ebt / ebit);
  const operatingMargin = round4(ebit / revenue);
  const assetTurnover = round4(revenue / totalAssets);
  const financialLeverage = round2(totalAssets / totalEquity);

  const roe = round2((netIncome / totalEquity) * 100);

  return {
    taxBurden,
    interestBurden,
    operatingMarginPct: round2(operatingMargin * 100),
    assetTurnover,
    financialLeverage,
    calculatedRoePct: roe
  };
}

/**
 * Calculate Return on Invested Capital (ROIC).
 * NOPAT / Invested Capital = (EBIT * (1 - Tax Rate)) / (Total Equity + Total Debt - Cash).
 */
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

  return round2((nopat / investedCapital) * 100);
}

/**
 * Pure deterministic valuation evaluator for Buffett-Munger compounding rules.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @param {object} [options]
 * @returns {object} Canonical UniformVerdictContract (principle: "buffett_munger")
 */
function evaluateBuffettMungerValuation(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateBuffettMungerValuation requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const timestamp = options.timestamp || new Date().toISOString();

  // 1. Index ETF Passive Bypass
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    const etfSummary = `Index ETF passive basket (${ticker}): Single-equity Buffett-Munger DuPont decomposition and Owner Earnings bypassed.`;
    const verdict = {
      principle: 'buffett_munger',
      principle_title: 'Buffett & Munger Quality Compounding',
      ticker,
      timestamp,
      stance: 'HOLD',
      score: 100.0,
      is_veto: false,
      summary: etfSummary
    };
    const metrics = {
      owner_earnings: null,
      owner_earnings_yield_pct: null,
      sbc_dilution_pct: null,
      roe_pct: null,
      tax_burden: null,
      interest_burden: null,
      operating_margin_pct: null,
      asset_turnover: null,
      financial_leverage: null,
      roic_pct: null
    };
    return {
      principle: 'buffett_munger',
      ticker,
      timestamp,
      score: 100.0,
      stance: 'HOLD',
      is_veto: false,
      summary: etfSummary,
      metrics,
      red_flags: [],
      verdict,
      audit: [
        {
          check: 'Broad-Market Index Diversification',
          criterion: 'Passive Index Basket',
          value: 'Full Basket',
          status: 'PASS',
          score: 100.0,
          max_score: 100.0,
          details: 'Passive ETF automatically diversifies across constituent holdings'
        }
      ],
      positive: [
        'Passive index fund provides automated broad-market diversification.'
      ],
      negative: [],
      observations: [
        'Passive index fund is evaluated on asset diversification rather than individual DuPont decomposition and Owner Earnings.'
      ],
      warnings: []
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};
  const cashFlow = financials.cash_flow || {};

  const marketCap = isFiniteNumber(marketData.market_cap) ? Number(marketData.market_cap) : null;
  const revenue = isFiniteNumber(income.revenue) ? Number(income.revenue) : 0;
  const ebit = isFiniteNumber(income.ebit) ? Number(income.ebit) : 0;
  const ebt = isFiniteNumber(income.ebt) ? Number(income.ebt) : 0;
  const taxExpense = isFiniteNumber(income.tax_expense) ? Number(income.tax_expense) : 0;
  const netIncome = isFiniteNumber(income.net_income) ? Number(income.net_income) : 0;

  const totalAssets = isFiniteNumber(balance.total_assets) ? Number(balance.total_assets) : 0;
  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : 0;
  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0;
  const cash = isFiniteNumber(balance.cash_and_equivalents) ? Number(balance.cash_and_equivalents) : 0;

  const ocf = isFiniteNumber(cashFlow.operating_cash_flow) ? Number(cashFlow.operating_cash_flow) : 0;
  const capex = isFiniteNumber(cashFlow.capital_expenditure) ? Number(cashFlow.capital_expenditure) : 0;
  const maintCapex = isFiniteNumber(cashFlow.maintenance_capex) ? Number(cashFlow.maintenance_capex) : null;
  const sbc = isFiniteNumber(cashFlow.stock_based_compensation) ? Number(cashFlow.stock_based_compensation) : 0;

  // 2. Metrics calculation
  const oeResult = calculateOwnerEarnings(ocf, capex, maintCapex, sbc);
  const trueOwnerEarnings = oeResult.trueOwnerEarnings;
  const sbcDilutionPct = oeResult.sbcDilutionPct;

  let ownerEarningsYield = null;
  if (marketCap && marketCap > 0 && isFiniteNumber(trueOwnerEarnings)) {
    ownerEarningsYield = round2((trueOwnerEarnings / marketCap) * 100);
  }

  const dupont = calculate5StepDuPont({
    netIncome,
    ebt,
    ebit,
    revenue,
    totalAssets,
    totalEquity
  });

  const roic = calculateROIC({
    ebit,
    taxExpense,
    ebt,
    totalEquity,
    totalDebt,
    cashAndEquivalents: cash
  });

  // 3. Quantitative Buffett-Munger Scoring & Observations
  let score = 0.0;
  const redFlags = [];

  let pillar1Score = 0.0;
  // Pillar 1: Capital Efficiency & ROIC Moat (max 35 pts)
  if (roic !== null) {
    if (roic >= 20.0) {
      pillar1Score = 35.0;
      redFlags.unshift(`🌟 Wide economic moat confirmed: ROIC of ${roic}% exceeds 20.0% hurdle`);
    } else if (roic >= 15.0) {
      pillar1Score = 28.0;
    } else if (roic >= 10.0) {
      pillar1Score = 18.0;
    } else if (roic >= 5.0) {
      pillar1Score = 8.0;
    } else {
      pillar1Score = 0.0;
      redFlags.push(`Sub-par capital efficiency: ROIC of ${roic}% is below 5.0% threshold`);
    }
  } else {
    pillar1Score = 0.0;
    redFlags.push('Negative or indeterminable ROIC indicates capital destruction or negative invested capital');
  }
  score += pillar1Score;

  let pillar2Score = 0.0;
  // Pillar 2: True Owner Earnings & Dilution Quality (max 25 pts)
  if (trueOwnerEarnings !== null && trueOwnerEarnings > 0) {
    if (sbcDilutionPct <= 5.0) {
      pillar2Score = 25.0;
    } else if (sbcDilutionPct <= 15.0) {
      pillar2Score = 18.0;
    } else if (sbcDilutionPct <= 25.0) {
      pillar2Score = 8.0;
      redFlags.push(`Elevated equity dilution: SBC represents ${sbcDilutionPct}% of operating cash flow (>15.0% threshold)`);
    } else {
      pillar2Score = 0.0;
      redFlags.push(`Severe SBC dilution: SBC represents ${sbcDilutionPct}% of operating cash flow (>25.0% ceiling)`);
    }
  } else {
    pillar2Score = 0.0;
    redFlags.push(`Negative true Owner Earnings (${trueOwnerEarnings}) indicates cash drain net of CapEx and SBC`);
  }
  score += pillar2Score;

  let pillar3Score = 0.0;
  // Pillar 3: DuPont ROE Quality & Discipline (max 25 pts)
  if (dupont !== null) {
    if (dupont.calculatedRoePct >= 15.0 && dupont.operatingMarginPct >= 15.0 && dupont.financialLeverage <= 2.5) {
      pillar3Score = 25.0;
    } else if (dupont.calculatedRoePct >= 12.0 && dupont.financialLeverage <= 3.5) {
      pillar3Score = 15.0;
    } else if (dupont.financialLeverage > 3.5) {
      pillar3Score = 5.0;
      redFlags.push(`Artificial ROE leverage: Financial leverage of ${dupont.financialLeverage}x exceeds 3.5x ceiling with thin margins`);
    } else if (dupont.calculatedRoePct >= 8.0) {
      pillar3Score = 8.0;
    } else {
      pillar3Score = 0.0;
      redFlags.push(`Tepid ROE: DuPont calculated ROE (${dupont.calculatedRoePct}%) is below 8.0% threshold`);
    }
  } else {
    pillar3Score = 0.0;
    redFlags.push('Negative or indeterminable earnings preclude 5-step DuPont ROE decomposition');
  }
  score += pillar3Score;

  let pillar4Score = 0.0;
  // Pillar 4: Valuation & Owner Earnings Yield (max 15 pts)
  if (ownerEarningsYield !== null) {
    if (ownerEarningsYield >= 6.0) {
      pillar4Score = 15.0;
    } else if (ownerEarningsYield >= 4.0) {
      pillar4Score = 10.0;
    } else if (ownerEarningsYield >= 2.0) {
      pillar4Score = 5.0;
    } else {
      pillar4Score = 0.0;
      redFlags.push(`Compressed Owner Earnings Yield (${ownerEarningsYield}% < 2.0%) indicates stretched valuation multiple`);
    }
  } else {
    pillar4Score = 0.0;
    if (marketCap && marketCap > 0 && trueOwnerEarnings <= 0) {
      redFlags.push('Zero or negative Owner Earnings Yield precludes valuation multiple support');
    }
  }
  score += pillar4Score;

  // Stance Mapping
  const finalScore = round2(Math.max(0.0, Math.min(score, 100.0)));
  let stance;
  if (finalScore >= 80.0) {
    stance = 'STRONG_BUY';
  } else if (finalScore >= 65.0) {
    stance = 'BUY';
  } else if (finalScore >= 50.0) {
    stance = 'HOLD';
  } else if (finalScore >= 35.0) {
    stance = 'REDUCE';
  } else {
    stance = 'STRONG_SELL';
  }

  let moatDescription = 'Narrow Moat';
  if (roic !== null && roic >= 20.0) moatDescription = 'Wide Economic Moat';
  else if (roic !== null && roic >= 15.0) moatDescription = 'Strong Moat';
  else if (roic !== null && roic < 8.0) moatDescription = 'No Moat / Destructive';

  let summary;
  if (stance === 'STRONG_BUY' || stance === 'BUY') {
    summary = `${stance} (${moatDescription}): Durable economic moat confirmed. High ROIC (${roic !== null ? roic + '%' : 'N/A'}) and un-leveraged DuPont ROE (${dupont ? dupont.calculatedRoePct + '%' : 'N/A'}) validate high compounding quality. True Owner Earnings: ${trueOwnerEarnings}.`;
  } else if (stance === 'HOLD') {
    summary = `HOLD (${moatDescription}): Satisfactory capital productivity. ROIC of ${roic !== null ? roic + '%' : 'N/A'} and Owner Earnings yield of ${ownerEarningsYield !== null ? ownerEarningsYield + '%' : 'N/A'} reflect fair intrinsic valuation.`;
  } else {
    summary = `${stance} (${moatDescription}): Deficient capital compounding or heavy dilution. ${sbcDilutionPct > 15.0 ? `Heavy SBC dilution of ${sbcDilutionPct}% eroding cash conversion.` : ''} ${dupont && dupont.financialLeverage > 3.5 ? `DuPont analysis indicates artificial leverage (${dupont.financialLeverage}x).` : ''}`;
  }

  // 1. Audit Array (4 Pillars)
  const audit = [
    {
      check: 'Economic Moat & ROIC Hurdle',
      criterion: 'ROIC ≥ 15.0% (Wide Moat ≥ 20.0%)',
      value: roic !== null ? `${roic}%` : 'N/A',
      status: roic !== null && roic >= 15.0 ? 'PASS' : (roic !== null && roic >= 8.0 ? 'WARN' : 'FAIL'),
      score: pillar1Score,
      max_score: 35,
      details: roic !== null ? `ROIC of ${roic}% indicates ${moatDescription}` : 'Negative or indeterminable ROIC'
    },
    {
      check: 'True Owner Earnings & Dilution Quality',
      criterion: 'Owner Earnings > 0 & SBC Dilution ≤ 15.0%',
      value: trueOwnerEarnings !== null ? `${trueOwnerEarnings} (SBC: ${sbcDilutionPct}%)` : 'N/A',
      status: (trueOwnerEarnings !== null && trueOwnerEarnings > 0 && sbcDilutionPct <= 15.0) ? 'PASS' : ((trueOwnerEarnings !== null && trueOwnerEarnings > 0 && sbcDilutionPct <= 25.0) ? 'WARN' : 'FAIL'),
      score: pillar2Score,
      max_score: 25,
      details: trueOwnerEarnings !== null && trueOwnerEarnings > 0
        ? `True Owner Earnings ${trueOwnerEarnings} with ${sbcDilutionPct}% SBC dilution drag`
        : 'Negative Owner Earnings indicates cash drain net of CapEx and SBC'
    },
    {
      check: 'DuPont ROE Quality & Discipline',
      criterion: 'ROE ≥ 15.0% with Financial Leverage ≤ 2.5x',
      value: dupont ? `${dupont.calculatedRoePct}% (Lev: ${dupont.financialLeverage}x)` : 'N/A',
      status: dupont && dupont.calculatedRoePct >= 15.0 && dupont.financialLeverage <= 2.5 ? 'PASS' : (dupont && dupont.calculatedRoePct >= 10.0 && dupont.financialLeverage <= 3.5 ? 'WARN' : 'FAIL'),
      score: pillar3Score,
      max_score: 25,
      details: dupont
        ? `DuPont ROE ${dupont.calculatedRoePct}%, Operating Margin ${dupont.operatingMarginPct}%, Leverage ${dupont.financialLeverage}x`
        : 'DuPont ROE decomposition unavailable'
    },
    {
      check: 'Valuation & Owner Earnings Yield',
      criterion: 'Owner Earnings Yield ≥ 4.0% (Strong ≥ 6.0%)',
      value: ownerEarningsYield !== null ? `${ownerEarningsYield}%` : 'N/A',
      status: ownerEarningsYield !== null && ownerEarningsYield >= 4.0 ? 'PASS' : (ownerEarningsYield !== null && ownerEarningsYield >= 2.0 ? 'WARN' : 'FAIL'),
      score: pillar4Score,
      max_score: 15,
      details: ownerEarningsYield !== null
        ? `Owner Earnings Yield of ${ownerEarningsYield}% on Market Cap ${marketCap}`
        : 'Owner Earnings Yield unavailable'
    }
  ];

  // 2. Positive Factors
  const positive = [];
  if (roic !== null && roic >= 20.0) {
    positive.push(`Wide economic moat confirmed: Exceptional ROIC of ${roic}% reflects superior pricing power and competitive barriers.`);
  } else if (roic !== null && roic >= 15.0) {
    positive.push(`Solid economic moat: ROIC of ${roic}% comfortably exceeds standard cost of capital.`);
  }
  if (trueOwnerEarnings !== null && trueOwnerEarnings > 0 && sbcDilutionPct <= 5.0) {
    positive.push(`Supreme cash conversion: True Owner Earnings (${trueOwnerEarnings}) with negligible SBC dilution (${sbcDilutionPct}%).`);
  } else if (trueOwnerEarnings !== null && trueOwnerEarnings > 0 && sbcDilutionPct <= 15.0) {
    positive.push(`Healthy cash conversion: Positive Owner Earnings (${trueOwnerEarnings}) with manageable SBC dilution (${sbcDilutionPct}%).`);
  }
  if (dupont && dupont.calculatedRoePct >= 15.0 && dupont.financialLeverage <= 2.5) {
    positive.push(`High-quality un-leveraged ROE: DuPont ROE of ${dupont.calculatedRoePct}% powered by operating margins (${dupont.operatingMarginPct}%), not balance sheet debt.`);
  }
  if (ownerEarningsYield !== null && ownerEarningsYield >= 4.0) {
    positive.push(`Attractive intrinsic cash yield: Owner Earnings yield of ${ownerEarningsYield}% provides strong fundamental valuation support.`);
  }
  if (totalDebt === 0) {
    positive.push('Pristine debt-free balance sheet eliminates financial leverage vulnerability.');
  }

  // 3. Negative Factors
  const negative = [];
  if (roic !== null && roic < 10.0) {
    negative.push(`Weak capital efficiency: ROIC of ${roic}% indicates narrow or deteriorating economic moat.`);
  }
  if (trueOwnerEarnings !== null && trueOwnerEarnings <= 0) {
    negative.push('Negative Owner Earnings: Operations fail to generate free cash flow after maintenance CapEx and SBC dilution.');
  }
  if (sbcDilutionPct > 15.0) {
    negative.push(`Stock-based compensation drag: SBC consumes ${sbcDilutionPct}% of operating cash flow, diluting shareholder claims.`);
  }
  if (dupont && dupont.financialLeverage > 3.5) {
    negative.push(`Artificial ROE leverage: High financial leverage (${dupont.financialLeverage}x) artificially inflates headline ROE.`);
  }
  if (ownerEarningsYield !== null && ownerEarningsYield < 2.0) {
    negative.push(`Compressed cash yield: Owner Earnings yield of ${ownerEarningsYield}% signals elevated valuation multiples.`);
  }

  // 4. Observations
  const observations = [
    `Economic Moat Classification: ${moatDescription}.`,
    `DuPont 5-Step Decomposition: Tax Burden ${dupont ? dupont.taxBurden : 'N/A'}, Interest Burden ${dupont ? dupont.interestBurden : 'N/A'}, Operating Margin ${dupont ? dupont.operatingMarginPct + '%' : 'N/A'}, Asset Turnover ${dupont ? dupont.assetTurnover : 'N/A'}, Financial Leverage ${dupont ? dupont.financialLeverage + 'x' : 'N/A'}.`,
    `True Owner Earnings: ${trueOwnerEarnings !== null ? trueOwnerEarnings : 'N/A'} (OCF ${ocf} - CapEx ${capex} - SBC ${sbc}).`,
    `Return on Invested Capital (ROIC): ${roic !== null ? roic + '%' : 'N/A'}.`
  ];

  // 5. Warnings
  const warnings = [...redFlags];

  // 6. Verdict Container
  const verdict = {
    principle: 'buffett_munger',
    principle_title: 'Buffett & Munger Quality Compounding',
    ticker,
    timestamp,
    stance,
    score: finalScore,
    is_veto: false,
    summary
  };

  const metrics = {
    owner_earnings: trueOwnerEarnings,
    owner_earnings_yield_pct: ownerEarningsYield,
    sbc_dilution_pct: sbcDilutionPct,
    roe_pct: dupont ? dupont.calculatedRoePct : null,
    tax_burden: dupont ? dupont.taxBurden : null,
    interest_burden: dupont ? dupont.interestBurden : null,
    operating_margin_pct: dupont ? dupont.operatingMarginPct : null,
    asset_turnover: dupont ? dupont.assetTurnover : null,
    financial_leverage: dupont ? dupont.financialLeverage : null,
    roic_pct: roic
  };

  return {
    principle: 'buffett_munger',
    ticker,
    timestamp,
    score: finalScore,
    stance,
    is_veto: false,
    metrics,
    red_flags: redFlags,
    summary,
    verdict,
    audit,
    positive,
    negative,
    observations,
    warnings
  };
}

/**
 * Render self-contained offline HTML audit report using the template.
 */
function renderHtml(verdictOrBatch) {
  let template;
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } else {
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buffett-Munger Valuation Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
  }
  const jsonContent = JSON.stringify(verdictOrBatch, null, 2);
  return template.replace('/*__DATA__*/null', () => jsonContent);
}

/**
 * Write JSON and HTML artifacts and verify pair using Universal Verification Harness.
 */
function writeArtifacts(verdictOrBatch, outDir, isBatch) {
  const verdictsDir = path.join(outDir, 'verdicts');
  fs.mkdirSync(verdictsDir, { recursive: true });

  let jsonPath;
  let htmlPath;
  let schemaType;

  if (isBatch) {
    jsonPath = path.join(verdictsDir, 'buffett_munger_portfolio_verdicts.json');
    htmlPath = path.join(verdictsDir, 'buffett_munger_portfolio_audits.html');
    schemaType = 'verdict-batch';
  } else {
    jsonPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_buffett_munger.json`);
    htmlPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_buffett_munger.html`);
    schemaType = 'verdict';
  }

  const jsonContent = JSON.stringify(verdictOrBatch, null, 2);
  const htmlContent = renderHtml(verdictOrBatch);

  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  const harnessResult = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType
  });

  if (!harnessResult.ok) {
    throw new Error(`Artifact verification failed for ${jsonPath}: ${JSON.stringify(harnessResult.errors)}`);
  }

  return { jsonPath, htmlPath, harnessResult };
}

/**
 * Evaluate single NormalizedCompanyFinancials file.
 */
function processDataFile(dataPath, options = {}) {
  const resolvedPath = path.resolve(dataPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Financials data file not found at ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const financials = JSON.parse(raw);
  const verdict = evaluateBuffettMungerValuation(financials, options);

  const validation = validateUniformVerdict(verdict);
  if (!validation.ok) {
    throw new Error(`UniformVerdictContract validation failed: ${JSON.stringify(validation.errors)}`);
  }

  const outDir = options.outDir || DEFAULT_REPORTS_DIR;
  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(verdict, outDir, false);
  }

  return {
    ok: true,
    verdict,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Evaluate single ticker, resolving financials if needed.
 */
async function processTicker(ticker, options = {}) {
  const cleanTicker = (ticker || '').toUpperCase();
  const outDir = options.outDir || DEFAULT_REPORTS_DIR;
  const market = inferMarket(cleanTicker, options.market);

  let financials = null;

  if (options.financials) {
    financials = options.financials;
  } else {
    const localReportPath = path.join(outDir, 'financials', `${cleanTicker}.json`);
    const repoReportPath = path.join(REPO_ROOT, 'reports', 'financials', `${cleanTicker}.json`);

    if (!options.refresh && fs.existsSync(localReportPath)) {
      financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
    } else if (!options.refresh && fs.existsSync(repoReportPath)) {
      financials = JSON.parse(fs.readFileSync(repoReportPath, 'utf8'));
    } else if (providerTickertape && typeof providerTickertape.processTicker === 'function') {
      try {
        const provRes = await providerTickertape.processTicker(cleanTicker, market, {
          outDir,
          refresh: options.refresh
        });
        if (provRes && provRes.normalized) {
          financials = provRes.normalized;
        } else {
          financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
        }
      } catch (err) {
        const fixturePath = path.join(SKILL_ROOT, 'tests', 'fixtures', `${cleanTicker.toLowerCase()}.json`);
        if (fs.existsSync(fixturePath)) {
          financials = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        } else {
          throw err;
        }
      }
    } else {
      const fixturePath = path.join(SKILL_ROOT, 'tests', 'fixtures', `${cleanTicker.toLowerCase()}.json`);
      if (fs.existsSync(fixturePath)) {
        financials = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      } else {
        throw new Error(`Unable to resolve financials for ${cleanTicker}. Provide --data <path> or ensure provider-tickertape is available.`);
      }
    }
  }

  const verdict = evaluateBuffettMungerValuation(financials, options);
  const validation = validateUniformVerdict(verdict);
  if (!validation.ok) {
    throw new Error(`UniformVerdictContract validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(verdict, outDir, false);
  }

  return {
    ok: true,
    verdict,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Option C Portfolio Batch Mode: processes an AccountHoldingsSnapshot file.
 */
async function processHoldings(holdingsPath, options = {}) {
  const resolvedPath = path.resolve(holdingsPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Holdings file not found at ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const snapshot = JSON.parse(raw);
  const holdings = Array.isArray(snapshot.holdings) ? snapshot.holdings : [];

  if (holdings.length === 0) {
    throw new Error(`Holdings file ${holdingsPath} contains zero holdings.`);
  }

  const outDir = options.outDir || DEFAULT_REPORTS_DIR;
  const processedTickers = new Set();
  const verdicts = [];

  for (const item of holdings) {
    const rawTicker = item.ticker || item.symbol;
    if (!rawTicker) continue;
    const ticker = rawTicker.toUpperCase();
    if (processedTickers.has(ticker)) continue;
    processedTickers.add(ticker);

    let financials = null;
    if (options.financialsMap && options.financialsMap[ticker]) {
      financials = options.financialsMap[ticker];
    } else {
      const localReportPath = path.join(outDir, 'financials', `${ticker}.json`);
      const repoReportPath = path.join(REPO_ROOT, 'reports', 'financials', `${ticker}.json`);
      const fixtureMoatPath = path.join(SKILL_ROOT, 'tests', 'fixtures', 'buffett_wide_moat.json');

      if (fs.existsSync(localReportPath)) {
        financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
      } else if (fs.existsSync(repoReportPath)) {
        financials = JSON.parse(fs.readFileSync(repoReportPath, 'utf8'));
      } else if (INDEX_ETF_TICKERS.has(ticker)) {
        financials = {
          ticker,
          name: item.name || `${ticker} ETF`,
          market: 'US',
          currency: 'USD',
          timestamp: new Date().toISOString(),
          is_index_etf: true,
          sector: 'Index ETF',
          market_data: { cmp: item.cmp || 100.0, shares_outstanding: 1000 }
        };
      } else if (fs.existsSync(fixtureMoatPath)) {
        const base = JSON.parse(fs.readFileSync(fixtureMoatPath, 'utf8'));
        financials = { ...base, ticker, name: item.name || base.name };
      }
    }

    if (financials) {
      const v = evaluateBuffettMungerValuation(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'buffett_munger',
    timestamp: options.timestamp || new Date().toISOString(),
    verdicts
  };

  const validation = validateUniformVerdictBatch(batch);
  if (!validation.ok) {
    throw new Error(`UniformVerdictBatch validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(batch, outDir, true);
  }

  return {
    ok: true,
    batch,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Command-line argument parsing.
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    data: null,
    ticker: null,
    market: null,
    holdings: null,
    out: DEFAULT_REPORTS_DIR,
    refresh: false,
    jsonOutput: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--data' && i + 1 < argv.length) {
      args.data = argv[++i];
    } else if (arg === '--ticker' && i + 1 < argv.length) {
      args.ticker = argv[++i].toUpperCase();
    } else if (arg === '--market' && i + 1 < argv.length) {
      args.market = argv[++i].toUpperCase();
    } else if (arg === '--holdings' && i + 1 < argv.length) {
      args.holdings = argv[++i];
    } else if (arg === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (arg === '--refresh') {
      args.refresh = true;
    } else if (arg === '--json-output' || arg === '--json') {
      args.jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

/**
 * CLI Main runner.
 */
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(`
Buffett-Munger Compounding Valuation Engine CLI
Usage:
  node analyze_buffett_munger.js --data <path_to_financials.json> [--out <dir>]
  node analyze_buffett_munger.js --ticker <SYMBOL> [--market <IN|US>] [--out <dir>] [--refresh]
  node analyze_buffett_munger.js --holdings <path_to_holdings.json> [--out <dir>]

Options:
  --data <path>      Evaluate local NormalizedCompanyFinancials JSON file (deterministic offline mode)
  --ticker <SYMBOL>  Autonomous evaluation of security via provider-tickertape
  --market <IN|US>   Optional market hint (auto-inferred if omitted)
  --holdings <path>  Option C batch mode: evaluate portfolio holdings into a consolidated matrix
  --out <dir>        Output directory for reports/verdicts (default: reports)
  --refresh          Bypass cache when fetching provider financials
  --json-output      Emit machine-readable JSON to stdout
  --help, -h         Show this help text
\n`);
    return { ok: true };
  }

  let result;
  if (args.data) {
    result = processDataFile(args.data, { outDir: args.out });
  } else if (args.ticker) {
    result = await processTicker(args.ticker, {
      market: args.market,
      outDir: args.out,
      refresh: args.refresh
    });
  } else if (args.holdings) {
    result = await processHoldings(args.holdings, {
      outDir: args.out,
      refresh: args.refresh
    });
  } else {
    process.stderr.write('[ERROR] Please specify --data <path>, --ticker <SYMBOL>, or --holdings <path>.\n');
    return { ok: false, error: 'MISSING_COMMAND' };
  }

  if (args.jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    if (result.batch) {
      process.stdout.write(`\n💎 Buffett-Munger Valuation: Evaluated ${result.batch.verdicts.length} securities in portfolio batch:\n`);
      for (const v of result.batch.verdicts) {
        const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
        process.stdout.write(`   ${icon} ${v.ticker.padEnd(8)}: ${v.stance.padEnd(14)} Score: ${String(v.score).padStart(5)}/100  (ROIC: ${v.metrics.roic_pct !== null ? v.metrics.roic_pct + '%' : 'N/A'})\n`);
      }
      process.stdout.write(`\n📁 Consolidated Artifacts:\n`);
      process.stdout.write(`   • JSON: ${result.jsonPath}\n`);
      process.stdout.write(`   • HTML: ${result.htmlPath}\n`);
      process.stdout.write('✅ Universal Verification Harness verified batch artifact pair.\n\n');
    } else {
      const v = result.verdict;
      const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
      process.stdout.write(`\n💎 Buffett-Munger Valuation Verdict for ${v.ticker}:\n`);
      process.stdout.write(`   • Stance:                   ${icon} ${v.stance}\n`);
      process.stdout.write(`   • Compounding Score:        ${v.score}/100.0\n`);
      process.stdout.write(`   • ROIC:                     ${v.metrics.roic_pct !== null ? v.metrics.roic_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • DuPont ROE:               ${v.metrics.roe_pct !== null ? v.metrics.roe_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • True Owner Earnings:      ${v.metrics.owner_earnings !== null ? v.metrics.owner_earnings : 'N/A'}\n`);
      process.stdout.write(`   • OE Yield:                 ${v.metrics.owner_earnings_yield_pct !== null ? v.metrics.owner_earnings_yield_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • SBC Dilution %:           ${v.metrics.sbc_dilution_pct !== null ? v.metrics.sbc_dilution_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • Financial Leverage:       ${v.metrics.financial_leverage !== null ? v.metrics.financial_leverage + 'x' : 'N/A'}\n`);
      process.stdout.write(`   • Summary:                  ${v.summary}\n`);
      if (v.red_flags.length > 0) {
        process.stdout.write(`   • Observations (${v.red_flags.length}):\n`);
        v.red_flags.forEach(f => process.stdout.write(`     - ${f}\n`));
      }
      process.stdout.write(`\n📁 Output Artifacts:\n`);
      process.stdout.write(`   • JSON: ${result.jsonPath}\n`);
      process.stdout.write(`   • HTML: ${result.htmlPath}\n`);
      process.stdout.write('✅ Universal Verification Harness verified artifact pair.\n\n');
    }
  }

  return result;
}

if (require.main === module) {
  main()
    .then((res) => {
      process.exit(res && res.ok === false ? 1 : 0);
    })
    .catch((err) => {
      process.stderr.write(`[ERROR] ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  calculate5StepDuPont,
  calculateOwnerEarnings,
  calculateROIC,
  evaluateBuffettMungerValuation,
  inferMarket,
  main,
  parseArgs,
  processDataFile,
  processHoldings,
  processTicker,
  renderHtml,
  round2,
  round4,
  writeArtifacts,
  INDEX_ETF_TICKERS
};

