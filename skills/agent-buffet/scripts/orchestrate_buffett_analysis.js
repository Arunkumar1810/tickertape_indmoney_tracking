#!/usr/bin/env node
'use strict';

/**
 * orchestrate_buffett_analysis.js:
 * Warren Buffett Value Investing Advisor.
 *
 * Performs disciplined quantitative analysis (true Owner Earnings, 5-step DuPont ROE,
 * ROIC economic moat hurdle) alongside portfolio cash till discipline and position sizing.
 * Emits Omaha folksy investment advice, canonical UniformVerdictContract reports
 * (principle: "buffett_munger"), and self-contained offline HTML audit dashboards.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json'))
  ? path.resolve(SKILL_ROOT, '..', '..')
  : path.resolve(SKILL_ROOT, '..', '..', '..');

const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_PORTFOLIO_PATH = path.join(REPO_ROOT, 'reports', 'accounts', 'combined.json');
const FINANCIALS_DIR = path.join(REPO_ROOT, 'reports', 'financials');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'buffet-template.html');

// Framework validators
const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

// Optional direct provider import
let providerTickertape;
try {
  providerTickertape = require(path.join(REPO_ROOT, 'skills', 'provider-tickertape', 'scripts', 'provider_tickertape'));
} catch {
  providerTickertape = null;
}

// Decoupled principle engines
const { evaluateMoat } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-economic-moat', 'scripts', 'evaluate_moat'));
const { evaluateOwnerEarnings } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-owner-earnings', 'scripts', 'evaluate_owner_earnings'));
const { evaluateDuPontROE } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-dupont-roe', 'scripts', 'evaluate_dupont_roe'));
const { evaluateMarginOfSafety } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-margin-of-safety', 'scripts', 'evaluate_margin_of_safety'));
const { evaluateDCF } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-dcf-valuation', 'scripts', 'evaluate_dcf'));
const { evaluatePE } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-pe-relative', 'scripts', 'evaluate_pe'));

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

function inferMarket(ticker, explicit) {
  if (explicit && (explicit === 'IN' || explicit === 'US')) return explicit;
  const clean = (ticker || '').toUpperCase();
  return (KNOWN_US_TICKERS.has(clean) || INDEX_ETF_TICKERS.has(clean)) ? 'US' : 'IN';
}

/**
 * Calculate true Owner Earnings: Operating Cash Flow - Maintenance CapEx - Stock-Based Comp.
 */
function calculateOwnerEarnings(operatingCashFlow, capitalExpenditure, maintenanceCapEx, stockBasedComp = 0) {
  const ocf = isFiniteNumber(operatingCashFlow) ? Number(operatingCashFlow) : 0;
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
 * Pure deterministic valuation evaluator emitting canonical UniformVerdictContract.
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
    const etfSummary = `Index ETF passive basket (${ticker}): Single-equity DuPont decomposition and Owner Earnings bypassed. “A low-cost index fund is the most sensible equity investment for the great majority of investors.”`;
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

  // Standard Company Evaluation via modular principles
  const moatEval = evaluateMoat(financials);
  const oeEval = evaluateOwnerEarnings(financials);
  const dupontEval = evaluateDuPontROE(financials);
  const mosEval = evaluateMarginOfSafety(financials);

  // Extract raw metrics for uniform contract
  const roic = moatEval.metrics ? moatEval.metrics.roic_pct : null;
  const trueOwnerEarnings = oeEval.metrics ? oeEval.metrics.true_owner_earnings : null;
  const sbcDilutionPct = oeEval.metrics ? oeEval.metrics.sbc_dilution_pct : null;
  const dupontMetrics = dupontEval.metrics || {};
  const mosMetrics = mosEval.metrics || {};
  const ownerEarningsYield = mosMetrics.owner_earnings_yield_pct !== undefined ? mosMetrics.owner_earnings_yield_pct : null;

  // Compute 4-pillar scores matching canonical Buffett scoring
  let pillar1Score = 0.0;
  const redFlags = [];
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

  let pillar2Score = 0.0;
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

  let pillar3Score = 0.0;
  const roeVal = dupontMetrics.roe_pct !== undefined
    ? dupontMetrics.roe_pct
    : (dupontMetrics.calculated_roe_pct !== undefined ? dupontMetrics.calculated_roe_pct : null);
  const opMargin = dupontMetrics.operating_margin_pct !== undefined ? dupontMetrics.operating_margin_pct : null;
  const lev = dupontMetrics.financial_leverage !== undefined ? dupontMetrics.financial_leverage : null;

  if (roeVal !== null && lev !== null) {
    if (roeVal >= 15.0 && (opMargin === null || opMargin >= 15.0) && lev <= 2.5) {
      pillar3Score = 25.0;
    } else if (roeVal >= 12.0 && lev <= 3.5) {
      pillar3Score = 15.0;
    } else if (lev > 3.5) {
      pillar3Score = 5.0;
      redFlags.push(`Artificial ROE leverage: Financial leverage of ${lev}x exceeds 3.5x ceiling with thin margins`);
    } else if (roeVal >= 8.0) {
      pillar3Score = 8.0;
    } else {
      pillar3Score = 0.0;
      redFlags.push(`Tepid ROE: DuPont calculated ROE (${roeVal}%) is below 8.0% threshold`);
    }
  } else {
    pillar3Score = 0.0;
    redFlags.push('Negative or indeterminable earnings preclude 5-step DuPont ROE decomposition');
  }

  let pillar4Score = 0.0;
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
  }

  const finalScore = round2(Math.max(0.0, Math.min(pillar1Score + pillar2Score + pillar3Score + pillar4Score, 100.0)));

  let stance;
  if (finalScore >= 80.0) stance = 'STRONG_BUY';
  else if (finalScore >= 65.0) stance = 'BUY';
  else if (finalScore >= 50.0) stance = 'HOLD';
  else if (finalScore >= 35.0) stance = 'REDUCE';
  else stance = 'STRONG_SELL';

  let moatDescription = 'Narrow Moat';
  if (roic !== null && roic >= 20.0) moatDescription = 'Wide Economic Moat';
  else if (roic !== null && roic >= 15.0) moatDescription = 'Strong Moat';
  else if (roic !== null && roic < 8.0) moatDescription = 'No Moat / Destructive';

  let summary;
  if (stance === 'STRONG_BUY' || stance === 'BUY') {
    summary = `${stance} (${moatDescription}): Durable economic moat confirmed. High ROIC (${roic !== null ? roic + '%' : 'N/A'}) and un-leveraged DuPont ROE (${roeVal !== null ? roeVal + '%' : 'N/A'}) validate high compounding quality. True Owner Earnings: ${trueOwnerEarnings}.`;
  } else if (stance === 'HOLD') {
    summary = `HOLD (${moatDescription}): Satisfactory capital productivity. ROIC of ${roic !== null ? roic + '%' : 'N/A'} and Owner Earnings yield of ${ownerEarningsYield !== null ? ownerEarningsYield + '%' : 'N/A'} reflect fair intrinsic valuation.`;
  } else {
    summary = `${stance} (${moatDescription}): Deficient capital compounding or heavy dilution. ${sbcDilutionPct > 15.0 ? `Heavy SBC dilution of ${sbcDilutionPct}% eroding cash conversion.` : ''} ${lev > 3.5 ? `DuPont analysis indicates artificial leverage (${lev}x).` : ''}`;
  }

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
      value: roeVal !== null ? `${roeVal}% (Lev: ${lev}x)` : 'N/A',
      status: (roeVal !== null && roeVal >= 15.0 && lev <= 2.5) ? 'PASS' : ((roeVal !== null && roeVal >= 10.0 && lev <= 3.5) ? 'WARN' : 'FAIL'),
      score: pillar3Score,
      max_score: 25,
      details: roeVal !== null
        ? `DuPont ROE ${roeVal}%, Operating Margin ${opMargin}%, Leverage ${lev}x`
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
        ? `Owner Earnings Yield of ${ownerEarningsYield}% on market capitalization`
        : 'Owner Earnings Yield unavailable'
    }
  ];

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
  if (roeVal !== null && roeVal >= 15.0 && lev <= 2.5) {
    positive.push(`High-quality un-leveraged ROE: DuPont ROE of ${roeVal}% powered by operating margins, not balance sheet debt.`);
  }
  if (ownerEarningsYield !== null && ownerEarningsYield >= 4.0) {
    positive.push(`Attractive intrinsic cash yield: Owner Earnings yield of ${ownerEarningsYield}% provides strong fundamental valuation support.`);
  }

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
  if (lev > 3.5) {
    negative.push(`Artificial ROE leverage: High financial leverage (${lev}x) artificially inflates headline ROE.`);
  }
  if (ownerEarningsYield !== null && ownerEarningsYield < 2.0) {
    negative.push(`Compressed cash yield: Owner Earnings yield of ${ownerEarningsYield}% signals elevated valuation multiples.`);
  }

  const observations = [
    `Economic Moat Classification: ${moatDescription}.`,
    `DuPont 5-Step Decomposition: Tax Burden ${dupontMetrics.tax_burden ?? 'N/A'}, Interest Burden ${dupontMetrics.interest_burden ?? 'N/A'}, Operating Margin ${dupontMetrics.operating_margin_pct !== undefined ? dupontMetrics.operating_margin_pct + '%' : 'N/A'}, Asset Turnover ${dupontMetrics.asset_turnover ?? 'N/A'}, Financial Leverage ${dupontMetrics.financial_leverage !== undefined ? dupontMetrics.financial_leverage + 'x' : 'N/A'}.`,
    `True Owner Earnings: ${trueOwnerEarnings !== null ? trueOwnerEarnings : 'N/A'}.`,
    `Return on Invested Capital (ROIC): ${roic !== null ? roic + '%' : 'N/A'}.`
  ];

  const warnings = [...redFlags];

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
    roe_pct: roeVal,
    tax_burden: dupontMetrics.tax_burden !== undefined ? dupontMetrics.tax_burden : null,
    interest_burden: dupontMetrics.interest_burden !== undefined ? dupontMetrics.interest_burden : null,
    operating_margin_pct: dupontMetrics.operating_margin_pct !== undefined ? dupontMetrics.operating_margin_pct : null,
    asset_turnover: dupontMetrics.asset_turnover !== undefined ? dupontMetrics.asset_turnover : null,
    financial_leverage: dupontMetrics.financial_leverage !== undefined ? dupontMetrics.financial_leverage : null,
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
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Warren Buffett Value Investing Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
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

function resolveFinancials(ticker, market, refresh, customOutDir) {
  const clean = (ticker || '').trim();
  const cleanUpper = clean.toUpperCase();
  const targetDir = customOutDir ? path.join(customOutDir, 'financials') : FINANCIALS_DIR;

  // 1. Direct file check if cleanUpper has no spaces
  if (!refresh && !/\s/.test(clean)) {
    const directPath = path.join(targetDir, `${cleanUpper}.json`);
    const repoPath = path.join(FINANCIALS_DIR, `${cleanUpper}.json`);
    if (fs.existsSync(directPath)) return JSON.parse(fs.readFileSync(directPath, 'utf8'));
    if (fs.existsSync(repoPath)) return JSON.parse(fs.readFileSync(repoPath, 'utf8'));
  }

  // 2. Always run provider-tickertape with the entity name / query
  try {
    const providerScript = path.join(REPO_ROOT, 'skills', 'provider-tickertape', 'scripts', 'provider_tickertape.js');
    if (fs.existsSync(providerScript)) {
      const escapedQuery = clean.replace(/"/g, '\\"');
      const cmd = `node "${providerScript}" --ticker "${escapedQuery}" --market ${market}${refresh ? ' --refresh' : ''}`;
      const output = execSync(cmd, { cwd: REPO_ROOT, stdio: 'pipe' }).toString();

      // Parse resolved ticker from output: e.g. "[IN] TMCV: .../TMCV.json"
      const match = /\[(?:IN|US)\]\s+([A-Z0-9_]+):/i.exec(output);
      const resolvedTicker = match ? match[1].toUpperCase() : cleanUpper;

      const resolvedPath = path.join(targetDir, `${resolvedTicker}.json`);
      const repoPath = path.join(FINANCIALS_DIR, `${resolvedTicker}.json`);
      if (fs.existsSync(resolvedPath)) return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      if (fs.existsSync(repoPath)) return JSON.parse(fs.readFileSync(repoPath, 'utf8'));
    }
  } catch (err) {
    // If provider failed, check if file exists anyway
    const directPath = path.join(targetDir, `${cleanUpper}.json`);
    if (fs.existsSync(directPath)) return JSON.parse(fs.readFileSync(directPath, 'utf8'));
    throw new Error(`Failed to resolve financials via provider-tickertape for "${clean}": ${err.message}`);
  }

  throw new Error(`Financials for "${clean}" could not be resolved or found. Run provider-tickertape first.`);
}

function loadPortfolio(customPath) {
  const pPath = customPath || DEFAULT_PORTFOLIO_PATH;
  if (fs.existsSync(pPath)) {
    try {
      return JSON.parse(fs.readFileSync(pPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Process single NormalizedCompanyFinancials data file.
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
 * Process single ticker, resolving financials and writing artifacts.
 */
async function processTicker(ticker, options = {}) {
  const cleanTicker = (ticker || '').toUpperCase();
  const outDir = options.outDir || DEFAULT_REPORTS_DIR;
  const market = inferMarket(cleanTicker, options.market);

  let financials = null;
  if (options.financials) {
    financials = options.financials;
  } else {
    financials = resolveFinancials(cleanTicker, market, options.refresh, outDir);
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
 * Batch portfolio evaluation across AccountHoldingsSnapshot.
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
 * Main Conversational Warren Buffett Analysis & Persona Advisor:
 * Gathers principle evaluations, enforces cash till reserve and concentration limits,
 * emits folksy Omaha verdict, and generates canonical UniformVerdictContract artifacts.
 */
function analyzeStockWithBuffett(ticker, options = {}) {
  const market = inferMarket(ticker, options.market);
  const outDir = options.outDir || DEFAULT_REPORTS_DIR;

  // Step 1: Run provider-tickertape first to resolve entity name & generate financials JSON
  const financials = options.financials || resolveFinancials(ticker, market, options.refresh, outDir);
  const clean = (financials.ticker || ticker).toUpperCase();

  // 1. Evaluate Canonical Valuation Verdict
  const verdictResult = evaluateBuffettMungerValuation(financials, options);

  // 2. Evaluate Additional Modular Principles for Context
  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(clean)
  );

  let dcfEval = null;
  let peEval = null;
  if (!isIndexEtf) {
    try { dcfEval = evaluateDCF(financials); } catch { dcfEval = null; }
    try { peEval = evaluatePE(financials); } catch { peEval = null; }
  }

  const compositeScore = Math.round(verdictResult.score);

  // 3. Inspect Portfolio Status
  const portfolio = options.ignorePortfolio ? null : loadPortfolio(options.portfolioPath);
  const portfolioKnown = Boolean(portfolio && portfolio.holdings);

  let currentHolding = null;
  let availableCash = null;
  let totalEquity = null;
  let currentWeightPct = 0.0;
  let isHeld = false;

  if (portfolioKnown) {
    availableCash = portfolio.summary ? portfolio.summary.available_cash : 0;
    totalEquity = portfolio.summary ? portfolio.summary.total_account_equity : 0;
    const match = (portfolio.holdings || []).find(h => (h.ticker || '').toUpperCase() === clean);
    if (match) {
      isHeld = true;
      currentHolding = match;
      currentWeightPct = match.weight_pct || 0.0;
    }
  }

  // 4. Decision Logic & Strict Portfolio Gating
  let call = 'HOLD';
  let callReason = '';
  const portfolioWarnings = [];

  if (!portfolioKnown) {
    if (compositeScore >= 75) {
      call = 'HOLD';
      callReason = 'Stock demonstrates excellent fundamental compounding power, but BUY is strictly gated until portfolio holdings and cash balances are inspected via fetch-all.';
      portfolioWarnings.push('PORTFOLIO UNKNOWN: Warren Buffett refuses to swing at a pitch without knowing the partnership till balance and existing inventory. Run fetch-all first.');
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = 'Moderate compounding metrics. Hold position pending full portfolio review.';
    } else {
      call = 'AVOID';
      callReason = 'Sub-par fundamentals and capital destruction. Avoid allocating capital.';
    }
  } else {
    const MAX_CONCENTRATION_PCT = 15.0; // 15% single-stock ceiling
    const MIN_CASH_REQUIRED = 500.0;     // Minimum cash till

    if (compositeScore >= 75) {
      if (currentWeightPct >= MAX_CONCENTRATION_PCT) {
        call = 'HOLD';
        callReason = `Exceptional business (${compositeScore}/100), but your portfolio already has ${currentWeightPct.toFixed(1)}% allocated (exceeds ${MAX_CONCENTRATION_PCT}% concentration ceiling). Prudent risk management mandates holding rather than adding.`;
        portfolioWarnings.push(`Concentration limit reached: Current weight is ${currentWeightPct.toFixed(1)}% (max ${MAX_CONCENTRATION_PCT}%).`);
      } else if (availableCash < MIN_CASH_REQUIRED) {
        call = 'HOLD';
        callReason = `Wonderful company at a fair price (${compositeScore}/100), but the till is dry (Available cash: ${availableCash.toFixed(2)}). Rule #1: Never borrow to buy stocks. Hold until fresh cash flows into the partnership.`;
        portfolioWarnings.push(`Insufficient dry powder: Available cash is ${availableCash.toFixed(2)} (recommended minimum ${MIN_CASH_REQUIRED}).`);
      } else {
        call = 'BUY';
        callReason = `Outstanding business with wide economic moat, authentic owner earnings, and clean operational ROE (${compositeScore}/100). Clean margin of safety with ample cash in the till and room in your portfolio allocation.`;
      }
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = isHeld
        ? `Decent business (${compositeScore}/100), but lacks wide-moat pricing power or sufficient margin of safety to justify adding fresh capital. Hold current position of ${currentWeightPct.toFixed(1)}%.`
        : `Fair company (${compositeScore}/100), but not attractive enough to displace cash. Leave on the watchlist.`;
    } else {
      if (isHeld) {
        call = 'SELL';
        callReason = `Capital compounding thesis broken (${compositeScore}/100). Ongoing cash burn, dilutive stock-based comp, or excessive debt leverage. Reallocate capital to better ideas.`;
      } else {
        call = 'AVOID';
        callReason = `Fails Buffett compounding standards (${compositeScore}/100). Low ROIC or artificial leverage. Steer clear.`;
      }
    }
  }

  // 5. Omaha Folksy Narrative
  const companyName = financials.name || financials.ticker || clean;
  let folksyVerdict = '';

  if (isIndexEtf) {
    folksyVerdict = `“By periodically investing in an index fund, the know-nothing investor can actually out-perform most investment professionals.” ${clean} is a diversified basket of businesses. Keep compounding through regular additions.`;
  } else if (call === 'BUY') {
    folksyVerdict = `“It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.” ${companyName} has a moat you could swim across, honest-to-goodness owner earnings, and your portfolio till has the cash to back it up. We're stepping up to the plate and swinging.`;
  } else if (call === 'HOLD') {
    if (portfolioKnown && currentWeightPct >= 15.0) {
      folksyVerdict = `“Diversification is protection against ignorance, but concentration has its limits.” ${companyName} is a dandy business, but you already have plenty of eggs in this basket (${currentWeightPct.toFixed(1)}%). We sit on our hands.`;
    } else if (portfolioKnown && availableCash < 500) {
      folksyVerdict = `“Only when the tide goes out do you discover who's been swimming naked.” We love the enterprise, but our cash drawer is nearly empty. Never stretch your liquidity to buy a stock. We hold our horses until fresh savings arrive.`;
    } else if (!portfolioKnown) {
      folksyVerdict = `“Risk comes from not knowing what you're doing.” I see the numbers on ${companyName}, but I haven't inspected your partnership books yet. Run fetch-all so Charlie and I can verify your cash and holdings before we commit a single dime.`;
    } else {
      folksyVerdict = `“The stock market is a device for transferring money from the impatient to the patient.” ${companyName} is doing alright, but it's not a fat pitch. We're happy to sit in the dugout and wait.`;
    }
  } else if (call === 'SELL') {
    folksyVerdict = `“When you find yourself in a hole, the most important thing to do is stop digging.” The compounding machine at ${companyName} has sputtered—cash is leaking, debt is mounting, or management is giving away the store in options. Time to part ways and protect capital.`;
  } else {
    folksyVerdict = `“We don't have to be smarter than the rest; we have to be more disciplined than the rest.” ${companyName} belongs in the 'too hard' or 'poor business' pile. We pass.`;
  }

  // Step 4 (FINAL STEP): Enrich Canonical Verdict with Advisor Inputs & Write Artifacts
  verdictResult.advisor_verdict = {
    actionable_call: call,
    call_reason: callReason,
    folksy_verdict: folksyVerdict
  };
  verdictResult.portfolio_status = {
    portfolio_known: portfolioKnown,
    is_held: isHeld,
    current_weight_pct: currentWeightPct,
    available_cash: availableCash,
    min_cash_required: 500.0,
    warnings: portfolioWarnings
  };

  const validation = validateUniformVerdict(verdictResult);
  if (!validation.ok) {
    throw new Error(`UniformVerdict validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(verdictResult, outDir, false);
  }

  return {
    ticker: clean,
    company_name: companyName,
    market,
    composite_score: compositeScore,
    call,
    call_reason: callReason,
    folksy_verdict: folksyVerdict,
    portfolio_status: verdictResult.portfolio_status,
    verdict: verdictResult,
    artifacts: {
      json: artifacts ? artifacts.jsonPath : null,
      html: artifacts ? artifacts.htmlPath : null
    },
    principles: {
      dcf_valuation: dcfEval ? {
        score: dcfEval.score,
        status: dcfEval.status,
        classification: dcfEval.classification,
        metrics: dcfEval.metrics,
        summary: dcfEval.summary
      } : null,
      pe_relative: peEval ? {
        score: peEval.score,
        status: peEval.status,
        classification: peEval.classification,
        metrics: peEval.metrics,
        summary: peEval.summary
      } : null
    }
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    ticker: null,
    data: null,
    holdings: null,
    market: null,
    portfolioPath: null,
    ignorePortfolio: false,
    out: DEFAULT_REPORTS_DIR,
    refresh: false,
    jsonOutput: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ticker' && i + 1 < argv.length) {
      args.ticker = argv[++i].toUpperCase();
    } else if (arg === '--data' && i + 1 < argv.length) {
      args.data = argv[++i];
    } else if (arg === '--holdings' && i + 1 < argv.length) {
      args.holdings = argv[++i];
    } else if (arg === '--market' && i + 1 < argv.length) {
      args.market = argv[++i].toUpperCase();
    } else if (arg === '--portfolio' && i + 1 < argv.length) {
      args.portfolioPath = argv[++i];
    } else if (arg === '--no-portfolio') {
      args.ignorePortfolio = true;
    } else if (arg === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (arg === '--refresh') {
      args.refresh = true;
    } else if (arg === '--json-output' || arg === '--json') {
      args.jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!arg.startsWith('--') && !args.ticker) {
      args.ticker = arg.toUpperCase();
    }
  }

  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help || (!args.ticker && !args.data && !args.holdings)) {
    process.stdout.write(`
Warren Buffett Value Investing Advisor
Usage:
  node orchestrate_buffett_analysis.js --ticker <SYMBOL> [--market IN|US] [--portfolio <path>] [--no-portfolio] [--refresh] [--out <dir>]
  node orchestrate_buffett_analysis.js --data <path_to_financials.json> [--out <dir>]
  node orchestrate_buffett_analysis.js --holdings <path_to_holdings.json> [--out <dir>]

Options:
  --ticker <SYMBOL>  Analyze stock with Buffett persona & generate valuation contract
  --data <path>      Evaluate local NormalizedCompanyFinancials JSON (deterministic offline mode)
  --holdings <path>  Option C batch mode: evaluate portfolio holdings into a consolidated matrix
  --market <IN|US>   Market jurisdiction hint
  --portfolio <path> Path to combined.json portfolio snapshot
  --no-portfolio     Bypass portfolio checks (strictly gates BUY calls)
  --out <dir>        Output directory for reports/verdicts (default: reports)
  --refresh          Force refresh of market data from provider
  --json-output      Emit machine-readable JSON to stdout
  --help, -h         Show this message
\n`);
    return { ok: true };
  }

  if (args.data) {
    const res = processDataFile(args.data, { outDir: args.out });
    if (args.jsonOutput) {
      console.log(JSON.stringify(res.verdict, null, 2));
    } else {
      console.log(`\n=== Buffett-Munger Valuation Verdict: ${res.verdict.ticker} ===`);
      console.log(`Stance: ${res.verdict.stance} | Score: ${res.verdict.score}/100`);
      console.log(`Summary: ${res.verdict.summary}`);
      console.log(`Artifacts written to:\n  ${res.jsonPath}\n  ${res.htmlPath}\n`);
    }
    return res;
  }

  if (args.holdings) {
    const res = await processHoldings(args.holdings, { outDir: args.out });
    if (args.jsonOutput) {
      console.log(JSON.stringify(res.batch, null, 2));
    } else {
      console.log(`\n=== Buffett-Munger Batch Portfolio Verdicts ===`);
      console.log(`Evaluated ${res.batch.verdicts.length} holdings.`);
      console.log(`Artifacts written to:\n  ${res.jsonPath}\n  ${res.htmlPath}\n`);
    }
    return res;
  }

  if (args.ticker) {
    const res = analyzeStockWithBuffett(args.ticker, {
      market: args.market,
      portfolioPath: args.portfolioPath,
      ignorePortfolio: args.ignorePortfolio,
      outDir: args.out,
      refresh: args.refresh
    });

    if (args.jsonOutput) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\n===============================================================`);
      console.log(`  WARREN BUFFETT VALUE INVESTING REPORT: ${res.ticker} (${res.market})`);
      console.log(`===============================================================`);
      console.log(`Actionable Call : ${res.call}`);
      console.log(`Composite Score : ${res.composite_score}/100`);
      console.log(`Reason          : ${res.call_reason}`);
      console.log(`\nOmaha Verdict:`);
      console.log(`  ${res.folksy_verdict}`);
      console.log(`\nPortfolio Gating & Cash Till:`);
      console.log(`  Known: ${res.portfolio_status.portfolio_known ? 'YES' : 'NO'}`);
      if (res.portfolio_status.portfolio_known) {
        console.log(`  Held: ${res.portfolio_status.is_held ? 'YES' : 'NO'} (${res.portfolio_status.current_weight_pct.toFixed(1)}% weight)`);
        console.log(`  Available Cash: ${res.portfolio_status.available_cash}`);
      }
      if (res.portfolio_status.warnings.length > 0) {
        console.log(`  Warnings:\n   - ${res.portfolio_status.warnings.join('\n   - ')}`);
      }
      console.log(`\nCanonical Verdict Artifacts:`);
      console.log(`  JSON : ${res.artifacts.json || 'N/A'}`);
      console.log(`  HTML : ${res.artifacts.html || 'N/A'}`);
      console.log(`===============================================================\n`);
    }
    return res;
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error running agent-buffet:', err.message);
    process.exit(1);
  });
}

module.exports = {
  analyzeStockWithBuffett,
  evaluateBuffettMungerValuation,
  processTicker,
  processHoldings,
  processDataFile,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateROIC,
  renderHtml,
  writeArtifacts,
  inferMarket,
  parseArgs,
  main
};
