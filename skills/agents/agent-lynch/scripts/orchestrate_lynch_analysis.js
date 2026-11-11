#!/usr/bin/env node
'use strict';

/**
 * orchestrate_lynch_analysis.js:
 * Peter Lynch Value Investing Advisor & Growth-At-A-Reasonable-Price (GARP) Engine.
 *
 * Evaluates securities across 4 quantitative Lynch pillars:
 * 1. PEG Valuation Discipline (principle-peg-ratio) [40 pts]
 * 2. Earnings Expansion Engine & Lifecycle Categorization [25 pts]
 * 3. Operational Inventory Velocity (principle-inventory-sales-velocity) [20 pts]
 * 4. Financial Solvency & Circle of Competence (principle-circle-of-competence) [15 pts]
 * alongside portfolio cash till discipline and conservative position sizing.
 *
 * Emits legendary Magellan Fund wisdom, canonical UniformVerdictContract reports
 * (principle: "lynch"), and self-contained offline HTML audit dashboards.
 */

const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json'))
  ? path.resolve(SKILL_ROOT, '..', '..')
  : path.resolve(SKILL_ROOT, '..', '..', '..');

const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const DEFAULT_PORTFOLIO_PATH = path.join(REPO_ROOT, 'reports', 'accounts', 'combined.json');
const FINANCIALS_DIR = path.join(REPO_ROOT, 'reports', 'financials');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'lynch-template.html');

// Framework validators & liquidity helpers
const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment,
  loadBankBalance,
  getLiquidCashSummary
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

// Optional direct provider import
let providerTickertape;
try {
  providerTickertape = require(path.join(REPO_ROOT, 'skills', 'stat-provider', 'provider-tickertape', 'scripts', 'provider_tickertape'));
} catch {
  try {
    providerTickertape = require(path.join(REPO_ROOT, 'skills', 'provider-tickertape', 'scripts', 'provider_tickertape'));
  } catch {
    providerTickertape = null;
  }
}

// Decoupled principle engines
const {
  calculatePEG,
  calculateYieldAdjustedPEG,
  calculateFairValueLine,
  calculateLynchFairValue,
  evaluatePEGRatio
} = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-peg-ratio', 'scripts', 'evaluate_peg_ratio'));

const {
  calculateInventoryDivergence,
  evaluateInventorySalesVelocity
} = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-inventory-sales-velocity', 'scripts', 'evaluate_inventory_sales_velocity'));

const {
  evaluateCircleOfCompetence
} = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-circle-of-competence', 'scripts', 'evaluate_competence'));

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

function inferMarket(ticker, explicitMarket = null) {
  if (explicitMarket) {
    const norm = String(explicitMarket).trim().toUpperCase();
    if (norm === 'IN' || norm === 'US') return norm;
  }
  const clean = String(ticker || '').trim().toUpperCase();
  if (KNOWN_US_TICKERS.has(clean) || INDEX_ETF_TICKERS.has(clean)) return 'US';
  return 'IN';
}

/**
 * Classify company into canonical Peter Lynch lifecycle archetypes:
 * Fast Grower, Stalwart, Slow Grower, Cyclical, Turnaround, or Asset Play.
 */
function classifyLynchCategory(financials) {
  if (!financials) return 'Stalwart';
  if (financials.is_turnaround === true) return 'Turnaround';
  if (financials.is_asset_play === true) return 'Asset Play';

  const marketData = financials.market_data || {};
  const balance = financials.balance_sheet || {};
  const cash = isFiniteNumber(balance.cash_and_equivalents) ? Number(balance.cash_and_equivalents) : 0;
  const marketCap = isFiniteNumber(marketData.market_cap) ? Number(marketData.market_cap) : null;
  if (marketCap && marketCap > 0 && (cash / marketCap) > 0.50) {
    return 'Asset Play';
  }

  const sector = (financials.sector || '').toLowerCase();
  const industry = (financials.industry || '').toLowerCase();
  const cyclicalSectors = [
    'automobiles', 'auto components', 'metals', 'mining', 'energy',
    'oil & gas', 'construction', 'capital goods', 'chemicals', 'basic materials'
  ];
  if (financials.is_cyclical === true || cyclicalSectors.some(s => sector.includes(s) || industry.includes(s))) {
    return 'Cyclical';
  }

  const epsGrowth = isFiniteNumber(marketData.eps_growth_5y_cagr_pct)
    ? Number(marketData.eps_growth_5y_cagr_pct)
    : (isFiniteNumber(marketData.eps_growth_ttm) ? Number(marketData.eps_growth_ttm) : null);
  const divYield = isFiniteNumber(marketData.dividend_yield_pct) ? Number(marketData.dividend_yield_pct) : 0;

  if (epsGrowth !== null) {
    if (epsGrowth >= 20.0) {
      return 'Fast Grower';
    }
    if (epsGrowth >= 10.0) {
      return 'Stalwart';
    }
    if (epsGrowth >= 2.0) {
      return divYield >= 2.5 ? 'Slow Grower' : 'Stalwart';
    }
    return 'Slow Grower';
  }

  return 'Stalwart';
}

/**
 * Pure deterministic valuation evaluator for Peter Lynch GARP rules.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @param {object} [options]
 * @returns {object} Canonical UniformVerdictContract (principle: "lynch")
 */
function evaluateLynchValuation(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateLynchValuation requires a valid NormalizedCompanyFinancials object');
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
    const etfSummary = `Index ETF passive basket (${ticker}): Single-equity Peter Lynch PEG valuation and inventory divergence bypassed.`;
    const verdict = {
      principle: 'lynch',
      principle_title: 'Peter Lynch GARP Valuation',
      ticker,
      timestamp,
      stance: 'HOLD',
      score: 100.0,
      is_veto: false,
      summary: etfSummary
    };
    const metrics = {
      peg_ratio: null,
      yield_adjusted_peg_ratio: null,
      eps_growth_rate_pct: null,
      dividend_yield_pct: null,
      pe_ratio: null,
      lynch_fair_value: null,
      inventory_divergence_pct: null,
      debt_to_equity: null
    };
    return {
      principle: 'lynch',
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
          details: 'Broad-market ETF bypasses single-company PEG and inventory divergence constraints'
        }
      ],
      positive: [
        'Passive index fund provides automated sector and company diversification.'
      ],
      negative: [],
      observations: [
        'Passive index fund is evaluated on asset diversification rather than individual company GARP expansion.'
      ],
      warnings: []
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};
  const forensics = financials.forensics || {};

  const cmp = isFiniteNumber(marketData.cmp) ? Number(marketData.cmp) : null;
  const eps = marketData.eps_ttm !== undefined && isFiniteNumber(marketData.eps_ttm)
    ? Number(marketData.eps_ttm)
    : (income.eps !== undefined && isFiniteNumber(income.eps) ? Number(income.eps) : null);
  const pe = isFiniteNumber(marketData.pe_ttm) ? Number(marketData.pe_ttm) : null;
  const divYield = isFiniteNumber(marketData.dividend_yield_pct) ? Number(marketData.dividend_yield_pct) : 0.0;

  const epsGrowth = isFiniteNumber(marketData.eps_growth_5y_cagr_pct)
    ? Number(marketData.eps_growth_5y_cagr_pct)
    : (isFiniteNumber(marketData.eps_growth_ttm) ? Number(marketData.eps_growth_ttm) : null);

  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0.0;
  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : null;
  const debtToEquity = (totalEquity !== null && totalEquity > 0) ? round2(totalDebt / totalEquity) : null;

  // Evaluate via decoupled principles
  const pegEval = evaluatePEGRatio(financials);
  const invEval = evaluateInventorySalesVelocity(financials);

  const pegRatio = pegEval.metrics.peg_ratio;
  const yieldAdjustedPegRatio = pegEval.metrics.yield_adjusted_peg_ratio;
  const lynchFairValue = pegEval.metrics.fair_value_line;
  const peRatio = pegEval.metrics.pe_ratio;
  const dividendYieldPct = pegEval.metrics.dividend_yield_pct;
  const epsGrowthRatePct = pegEval.metrics.eps_growth_rate_pct;

  const inventoryDivergencePct = invEval.metrics.inventory_divergence_pct;
  const hasNoInventory = !invEval.metrics.has_inventory;

  // 4-Pillar Quantitative Lynch Scoring
  let score = 0.0;
  const redFlags = [];

  // Pillar 1: PEG Valuation Discipline (max 40 pts)
  let pillar1Score = 0.0;
  if (pegRatio !== null) {
    if (pegRatio <= 0.50) {
      pillar1Score = 40.0;
      redFlags.unshift(`🌟 Exceptional growth bargain: PEG ratio of ${pegRatio} is at or below 0.50 screaming buy threshold`);
    } else if (pegRatio <= 1.0) {
      pillar1Score = 32.0;
    } else if (pegRatio <= 1.5) {
      pillar1Score = 20.0;
    } else if (pegRatio <= 2.0) {
      pillar1Score = 10.0;
      redFlags.push(`Moderate valuation stretch: PEG ratio of ${pegRatio} is between 1.5 and 2.0`);
    } else {
      pillar1Score = 0.0;
      redFlags.push(`Unfavorable growth valuation: PEG ratio of ${pegRatio} exceeds Peter Lynch 2.0 ceiling`);
    }
  } else {
    pillar1Score = 0.0;
    if (!isFiniteNumber(epsGrowth) || epsGrowth <= 0) {
      redFlags.push(`Zero or negative EPS growth rate (${epsGrowth !== null ? epsGrowth + '%' : 'missing'}) precludes PEG calculation`);
    }
    if (!isFiniteNumber(pe) || pe <= 0) {
      redFlags.push('Negative or zero P/E multiple precludes PEG calculation');
    }
  }
  score += pillar1Score;

  if (pe !== null && pe > 50.0) {
    redFlags.push(`Elevated P/E multiple (${pe} > 50.0) represents excessive market expectations`);
  }

  // Pillar 2: Earnings & Revenue Expansion Engine (max 25 pts)
  let pillar2Score = 0.0;
  if (epsGrowthRatePct !== null) {
    if (epsGrowthRatePct >= 20.0) {
      pillar2Score = 25.0;
    } else if (epsGrowthRatePct >= 10.0) {
      pillar2Score = 18.0;
    } else if (epsGrowthRatePct >= 5.0) {
      pillar2Score = 10.0;
    } else {
      pillar2Score = 0.0;
      redFlags.push(`Sluggish earnings expansion: 5-year EPS CAGR (${epsGrowthRatePct}%) is below 5.0% threshold`);
    }
  } else {
    pillar2Score = 0.0;
    redFlags.push('Missing or unestablished historical EPS growth rate');
  }
  score += pillar2Score;

  // Pillar 3: Operational Inventory Velocity (max 20 pts)
  let pillar3Score = 0.0;
  if (hasNoInventory) {
    pillar3Score = 20.0;
  } else if (inventoryDivergencePct !== null) {
    if (inventoryDivergencePct <= 0.0) {
      pillar3Score = 20.0;
    } else if (inventoryDivergencePct <= 5.0) {
      pillar3Score = 14.0;
    } else if (inventoryDivergencePct <= 10.0) {
      pillar3Score = 6.0;
      redFlags.push(`Inventory divergence warning: Inventory growth outpaces sales growth by ${inventoryDivergencePct}% (>5.0% threshold)`);
    } else {
      pillar3Score = 0.0;
      redFlags.push(`Severe inventory bloat: Inventory growth outpaces sales growth by ${inventoryDivergencePct}% (>10.0% ceiling)`);
    }
  } else {
    pillar3Score = 10.0;
  }
  score += pillar3Score;

  // Pillar 4: Balance Sheet Health & Financial Freedom (max 15 pts)
  let pillar4Score = 0.0;
  if (debtToEquity !== null) {
    if (debtToEquity <= 0.50) {
      pillar4Score = 15.0;
    } else if (debtToEquity <= 1.0) {
      pillar4Score = 10.0;
    } else {
      pillar4Score = 0.0;
      redFlags.push(`Elevated financial leverage: Debt-to-Equity (${debtToEquity}) exceeds 1.0 ceiling`);
    }
  } else {
    pillar4Score = 0.0;
    redFlags.push('Negative or missing equity precludes Debt-to-Equity calculation');
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

  const category = classifyLynchCategory(financials);

  // Narrative summary
  let summary;
  if (stance === 'STRONG_BUY' || stance === 'BUY') {
    summary = `${stance} (${category}): Attractive GARP profile confirmed. PEG ratio (${pegRatio !== null ? pegRatio : 'N/A'}) and earnings growth (${epsGrowthRatePct !== null ? epsGrowthRatePct + '%' : 'N/A'}) demonstrate disciplined valuation. Lynch Fair Value: ${lynchFairValue !== null ? lynchFairValue : 'N/A'}.`;
  } else if (stance === 'HOLD') {
    summary = `HOLD (${category}): Fairly valued growth. PEG ratio (${pegRatio !== null ? pegRatio : 'N/A'}) aligns with underlying expansion. Balance sheet and inventory velocity remain sound.`;
  } else {
    summary = `${stance} (${category}): Valuation multiple stretch or operational friction. PEG ratio (${pegRatio !== null ? pegRatio : 'N/A'}) exceeds reasonable bounds.${inventoryDivergencePct !== null && inventoryDivergencePct > 5.0 ? ` Inventory divergence of ${inventoryDivergencePct}% signals channel risk.` : ''}`;
  }

  // Audit Array (4 Pillars)
  const audit = [
    {
      check: 'PEG Valuation Discipline',
      criterion: 'PEG ≤ 1.0 (Ceiling ≤ 2.0)',
      value: pegRatio !== null ? `${pegRatio}x` : 'N/A',
      status: pegRatio !== null && pegRatio <= 1.0 ? 'PASS' : (pegRatio !== null && pegRatio <= 2.0 ? 'WARN' : 'FAIL'),
      details: pegRatio !== null
        ? `PEG ratio of ${pegRatio}x (Yield-adjusted PEG: ${yieldAdjustedPegRatio !== null ? yieldAdjustedPegRatio + 'x' : 'N/A'})`
        : 'Missing or negative P/E or earnings growth rate'
    },
    {
      check: 'Earnings Growth Engine',
      criterion: '5Y EPS CAGR ≥ 10.0% (Fast Grower ≥ 20.0%)',
      value: epsGrowthRatePct !== null ? `${epsGrowthRatePct}%` : 'N/A',
      status: epsGrowthRatePct !== null && epsGrowthRatePct >= 10.0 ? 'PASS' : (epsGrowthRatePct !== null && epsGrowthRatePct >= 5.0 ? 'WARN' : 'FAIL'),
      details: epsGrowthRatePct !== null
        ? `Annual EPS growth CAGR of ${epsGrowthRatePct}%`
        : 'Historical EPS growth rate not established'
    },
    {
      check: 'Operational Inventory Velocity',
      criterion: 'Inventory Growth ≤ Sales Growth (Divergence ≤ 5%)',
      value: hasNoInventory ? 'Zero Inventory (Asset-light)' : (inventoryDivergencePct !== null ? `${inventoryDivergencePct}%` : 'N/A'),
      status: (hasNoInventory || (inventoryDivergencePct !== null && inventoryDivergencePct <= 5.0)) ? 'PASS' : (inventoryDivergencePct !== null && inventoryDivergencePct <= 10.0 ? 'WARN' : 'FAIL'),
      details: hasNoInventory
        ? 'Asset-light business model eliminates inventory channel-stuffing risk'
        : (inventoryDivergencePct !== null
          ? `Inventory vs sales growth divergence is ${inventoryDivergencePct}%`
          : 'Inventory divergence metric unavailable')
    },
    {
      check: 'Financial Leverage & Solvency',
      criterion: 'Debt-to-Equity ≤ 0.50 (Max 1.0)',
      value: debtToEquity !== null ? `${debtToEquity}x` : (totalDebt === 0 ? '0.00x' : 'N/A'),
      status: debtToEquity !== null && debtToEquity <= 0.50 ? 'PASS' : (debtToEquity !== null && debtToEquity <= 1.0 ? 'WARN' : 'FAIL'),
      details: debtToEquity !== null
        ? `Debt-to-Equity of ${debtToEquity}x with total debt ${totalDebt}`
        : 'Debt-to-Equity ratio not calculable'
    }
  ];

  // Positive Factors
  const positive = [];
  if (pegRatio !== null && pegRatio <= 0.50) {
    positive.push(`Exceptional growth bargain: PEG ratio (${pegRatio}) is at screaming buy threshold (≤ 0.50).`);
  } else if (pegRatio !== null && pegRatio <= 1.0) {
    positive.push(`Attractive GARP valuation: PEG ratio of ${pegRatio} offers Growth at a Reasonable Price (≤ 1.0).`);
  }
  if (epsGrowthRatePct !== null && epsGrowthRatePct >= 20.0) {
    positive.push(`High-growth compounder: 5-year EPS CAGR of ${epsGrowthRatePct}% qualifies as a classic Fast Grower.`);
  } else if (epsGrowthRatePct !== null && epsGrowthRatePct >= 10.0) {
    positive.push(`Solid earnings expansion: 5-year EPS CAGR of ${epsGrowthRatePct}% reflects dependable Stalwart growth.`);
  }
  if (hasNoInventory) {
    positive.push('Asset-light operations: Zero inventory eliminates inventory obsolescence and channel-stuffing risks.');
  } else if (inventoryDivergencePct !== null && inventoryDivergencePct <= 0.0) {
    positive.push(`Healthy inventory velocity: Sales growth outpaces inventory accumulation by ${Math.abs(inventoryDivergencePct)}%.`);
  }
  if (debtToEquity !== null && debtToEquity <= 0.50) {
    positive.push(`Conservative balance sheet: Low Debt-to-Equity ratio of ${debtToEquity}x.`);
  } else if (totalDebt === 0) {
    positive.push('Zero-debt balance sheet: Unencumbered operational balance sheet.');
  }
  if (dividendYieldPct !== null && dividendYieldPct > 0) {
    positive.push(`Defensive capital return: Dividend yield of ${dividendYieldPct}% boosts yield-adjusted PEG.`);
  }

  // Negative Factors
  const negative = [];
  if (pegRatio !== null && pegRatio > 2.0) {
    negative.push(`Severe valuation multiple stretch: PEG ratio (${pegRatio}) significantly exceeds Peter Lynch 2.0 ceiling.`);
  } else if (pegRatio !== null && pegRatio > 1.5) {
    negative.push(`Moderate valuation stretch: PEG ratio (${pegRatio}) is above the 1.5 fair-value boundary.`);
  }
  if (pe !== null && pe > 50.0) {
    negative.push(`Elevated P/E multiple: P/E of ${peRatio}x embeds steep market growth expectations.`);
  }
  if (epsGrowthRatePct !== null && epsGrowthRatePct < 5.0) {
    negative.push(`Sluggish earnings expansion: 5-year EPS CAGR (${epsGrowthRatePct}%) lags Lynch minimum 5.0% threshold.`);
  }
  if (inventoryDivergencePct !== null && inventoryDivergencePct > 5.0) {
    negative.push(`Inventory buildup risk: Inventory growth exceeds sales growth by ${inventoryDivergencePct}%.`);
  }
  if (debtToEquity !== null && debtToEquity > 1.0) {
    negative.push(`Excessive financial leverage: Debt-to-Equity (${debtToEquity}x) exceeds conservative 1.0 ceiling.`);
  }

  // Observations
  const observations = [
    `Peter Lynch Lifecycle Archetype: ${category}.`,
    `Lynch Fair Value: ${lynchFairValue !== null ? lynchFairValue : 'N/A'}.`,
    `Trailing P/E: ${peRatio !== null ? peRatio + 'x' : 'N/A'}, Yield-adjusted PEG: ${yieldAdjustedPegRatio !== null ? yieldAdjustedPegRatio : 'N/A'}.`,
    `5-Year Historical EPS CAGR: ${epsGrowthRatePct !== null ? epsGrowthRatePct + '%' : 'N/A'}.`
  ];

  // Warnings
  const warnings = [...redFlags];

  // Verdict Container
  const verdict = {
    principle: 'lynch',
    principle_title: 'Peter Lynch GARP Valuation',
    ticker,
    timestamp,
    stance,
    score: finalScore,
    is_veto: false,
    summary
  };

  const metrics = {
    peg_ratio: pegRatio,
    yield_adjusted_peg_ratio: yieldAdjustedPegRatio,
    eps_growth_rate_pct: epsGrowthRatePct,
    dividend_yield_pct: dividendYieldPct,
    pe_ratio: peRatio,
    lynch_fair_value: lynchFairValue,
    inventory_divergence_pct: inventoryDivergencePct,
    debt_to_equity: debtToEquity
  };

  return {
    principle: 'lynch',
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
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Peter Lynch Valuation Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
  }
  const jsonContent = JSON.stringify(verdictOrBatch, null, 2);
  return template.replace('/*__DATA__*/null', () => jsonContent);
}

const renderLynchDashboardHtml = renderHtml;

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
    jsonPath = path.join(verdictsDir, 'lynch_portfolio_verdicts.json');
    htmlPath = path.join(verdictsDir, 'lynch_portfolio_audits.html');
    schemaType = 'verdict-batch';
  } else {
    jsonPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_lynch.json`);
    htmlPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_lynch.html`);
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
  const verdict = evaluateLynchValuation(financials, options);

  const validation = validateUniformVerdict(verdict);
  if (!validation.ok) {
    throw new Error(`UniformVerdictContract validation failed: ${JSON.stringify(validation.errors)}`);
  }

  const outDir = options.outDir || options.out || DEFAULT_REPORTS_DIR;
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
 * Format Peter Lynch advisory speech with classic Magellan Fund common sense.
 */
function formatLynchSpeech({
  clean,
  companyName,
  category,
  compositeScore,
  stance,
  call,
  callReason,
  metrics,
  audit,
  positive,
  negative,
  portfolioWarnings,
  currentWeightPct,
  isHeld,
  availableCash,
  jsonPath,
  htmlPath
}) {
  const lines = [];
  lines.push('================================================================================');
  lines.push(`🏛️  PETER LYNCH — VALUE INVESTING ADVISOR & GARP EVALUATION: ${clean}`);
  lines.push('================================================================================\n');

  lines.push(`Company: ${companyName} (${clean})`);
  lines.push(`Lifecycle Archetype: ${category}`);
  lines.push(`Composite GARP Score: ${compositeScore}/100 [Stance: ${stance}]`);
  lines.push(`Advisor Recommendation: ${call}`);
  lines.push(`Call Rational: ${callReason}\n`);

  lines.push('--- PETER LYNCH\'S FIELD OBSERVATIONS ---');
  if (stance === 'STRONG_BUY' || stance === 'BUY') {
    lines.push(`“Now this is what I call Growth at a Reasonable Price! We\'ve got a solid ${category} expanding its earnings while Mr. Market has completely overlooked the PEG ratio.`);
    if (metrics.peg_ratio !== null && metrics.peg_ratio <= 0.50) {
      lines.push(`A PEG ratio of ${metrics.peg_ratio}x is a screaming bargain. In my 13 years running Magellan, finding companies growing faster than their multiple was the secret to every 10-bagger.”`);
    } else {
      lines.push(`At a PEG of ${metrics.peg_ratio !== null ? metrics.peg_ratio + 'x' : 'N/A'}, you\'re getting earnings power without overpaying for glamorous hype.”`);
    }
  } else if (stance === 'HOLD') {
    lines.push(`“This ${category} is doing fine, but it\'s priced about where it belongs. P/E matches its growth rate.`);
    lines.push('There\'s no reason to rush in and dump all your cash here today. Keep it on your radar or hold what you have, and wait for a pullback or an earnings acceleration.”');
  } else {
    lines.push(`“Watch out here! This stock represents exactly what I warn people about in 'One Up on Wall Street'.`);
    if (metrics.peg_ratio !== null && metrics.peg_ratio > 2.0) {
      lines.push(`A PEG of ${metrics.peg_ratio}x means you are paying through the nose for future expectations that may never materialize.`);
    }
    if (metrics.inventory_divergence_pct !== null && metrics.inventory_divergence_pct > 5.0) {
      lines.push(`Even worse, inventories are piling up ${metrics.inventory_divergence_pct}% faster than sales! When inventories outpace shipments, markdowns and margin pain follow.”`);
    }
    lines.push('Never fall in love with a stock that doesn\'t love your wallet back.”');
  }

  lines.push('\n--- QUANTITATIVE 4-PILLAR BREAKDOWN ---');
  for (const item of audit) {
    const mark = item.status === 'PASS' ? '✅' : (item.status === 'WARN' ? '⚠️' : '❌');
    const scoreStr = item.score !== undefined ? ` [${item.score}/${item.max_score || item.score} pts]` : '';
    lines.push(`  ${mark} ${item.check.padEnd(35)} : ${String(item.value).padEnd(20)}${scoreStr}`);
    lines.push(`     ${item.details}`);
  }

  if (positive.length > 0) {
    lines.push('\n--- POSITIVE FACTORS ---');
    positive.forEach(p => lines.push(`  + ${p}`));
  }

  if (negative.length > 0) {
    lines.push('\n--- RISK FACTORS & FRICTION ---');
    negative.forEach(n => lines.push(`  - ${n}`));
  }

  if (portfolioWarnings.length > 0) {
    lines.push('\n--- PORTFOLIO & LIQUIDITY GATING ---');
    portfolioWarnings.forEach(w => lines.push(`  ⚠️  ${w}`));
  }

  lines.push(`\nPortfolio Status: ${isHeld ? `HELD (${currentWeightPct.toFixed(1)}% weight)` : 'NOT HELD'}`);
  lines.push(`Available Cash Till: ${availableCash.toFixed(2)}`);
  if (jsonPath) lines.push(`Data Contract: ${jsonPath}`);
  if (htmlPath) lines.push(`Audit Dashboard: ${htmlPath}`);

  return lines.join('\n');
}

/**
 * Gather pure quantitative diagnostics across Peter Lynch GARP principles.
 * Principles return metrics and qualitative checks without prescribing the final stance.
 */
async function getLynchDiagnostics(ticker, options = {}) {
  const clean = String(ticker || '').trim().toUpperCase();
  if (!clean) throw new Error('A ticker symbol is required.');

  const outDir = options.out || options.outDir || DEFAULT_REPORTS_DIR;
  const market = inferMarket(clean, options.market);

  // 1. Resolve Financials
  let financials = null;
  if (options.data) {
    const dataPath = path.resolve(options.data);
    if (!fs.existsSync(dataPath)) throw new Error(`Data file not found at ${dataPath}`);
    financials = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } else {
    const localReportPath = path.join(outDir, 'financials', `${clean}.json`);
    const repoReportPath = path.join(REPO_ROOT, 'reports', 'financials', `${clean}.json`);

    if (!options.refresh && fs.existsSync(localReportPath)) {
      financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
    } else if (!options.refresh && fs.existsSync(repoReportPath)) {
      financials = JSON.parse(fs.readFileSync(repoReportPath, 'utf8'));
    } else {
      if (!providerTickertape || typeof providerTickertape.fetchAndNormalizeTicker !== 'function') {
        throw new Error(`No local financials for ${clean} and provider_tickertape is unavailable.`);
      }
      financials = await providerTickertape.fetchAndNormalizeTicker(clean, {
        market,
        out: outDir,
        refresh: Boolean(options.refresh)
      });
    }
  }

  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(clean)
  );

  const category = classifyLynchCategory(financials);
  const companyName = financials.name || financials.ticker || clean;

  const pegEval = evaluatePEGRatio(financials);
  const invEval = evaluateInventorySalesVelocity(financials);

  const balance = financials.balance_sheet || {};
  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0.0;
  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : null;
  const debtToEquity = (totalEquity !== null && totalEquity > 0) ? round2(totalDebt / totalEquity) : null;

  const pegRatio = pegEval.metrics.peg_ratio;
  const yieldAdjustedPegRatio = pegEval.metrics.yield_adjusted_peg_ratio;
  const lynchFairValue = pegEval.metrics.fair_value_line;
  const epsGrowthRatePct = pegEval.metrics.eps_growth_rate_pct;

  const inventoryDivergencePct = invEval.metrics.inventory_divergence_pct;
  const hasNoInventory = !invEval.metrics.has_inventory;

  const principles = isIndexEtf ? [
    {
      principle_id: 'broad-market-index',
      name: 'Broad-Market Index Diversification',
      metrics: { is_index_etf: true },
      checks: [
        {
          name: 'Broad-Market Index Diversification',
          criterion: 'Passive Index Basket',
          actual: 'Full Basket',
          status: 'PASS',
          details: 'Broad-market ETF bypasses single-company PEG and inventory divergence constraints'
        }
      ],
      observations: ['Passive index fund provides automated sector and company diversification.']
    }
  ] : [
    {
      principle_id: 'peg-ratio',
      name: 'PEG Ratio & Expansion Valuation',
      metrics: pegEval.metrics,
      checks: [
        {
          name: 'PEG Valuation Discipline',
          criterion: 'PEG ≤ 1.0 (Ceiling ≤ 2.0)',
          actual: pegRatio !== null ? `${pegRatio}x` : 'N/A',
          status: pegRatio !== null && pegRatio <= 1.0 ? 'PASS' : (pegRatio !== null && pegRatio <= 2.0 ? 'WARN' : 'FAIL'),
          details: pegRatio !== null
            ? `PEG ratio of ${pegRatio}x (Yield-adjusted PEG: ${yieldAdjustedPegRatio !== null ? yieldAdjustedPegRatio + 'x' : 'N/A'}, Fair Value Line: ${lynchFairValue !== null ? lynchFairValue : 'N/A'})`
            : 'Missing or negative P/E or earnings growth rate'
        },
        {
          name: 'Earnings Growth Engine',
          criterion: '5Y EPS CAGR ≥ 10.0% (Fast Grower ≥ 20.0%)',
          actual: epsGrowthRatePct !== null ? `${epsGrowthRatePct}%` : 'N/A',
          status: epsGrowthRatePct !== null && epsGrowthRatePct >= 10.0 ? 'PASS' : (epsGrowthRatePct !== null && epsGrowthRatePct >= 5.0 ? 'WARN' : 'FAIL'),
          details: epsGrowthRatePct !== null
            ? `Annual EPS growth CAGR of ${epsGrowthRatePct}% (${category})`
            : 'Historical EPS growth rate not established'
        }
      ],
      observations: pegEval.observations
    },
    {
      principle_id: 'inventory-sales-velocity',
      name: 'Inventory vs Sales Velocity Divergence',
      metrics: invEval.metrics,
      checks: [
        {
          name: 'Operational Inventory Velocity',
          criterion: 'Inventory Growth ≤ Sales Growth (Divergence ≤ 5%)',
          actual: hasNoInventory ? 'Zero Inventory (Asset-light)' : (inventoryDivergencePct !== null ? `${inventoryDivergencePct}%` : 'N/A'),
          status: (hasNoInventory || (inventoryDivergencePct !== null && inventoryDivergencePct <= 5.0)) ? 'PASS' : (inventoryDivergencePct !== null && inventoryDivergencePct <= 10.0 ? 'WARN' : 'FAIL'),
          details: hasNoInventory
            ? 'Asset-light business model eliminates inventory channel-stuffing risk'
            : (inventoryDivergencePct !== null
              ? `Inventory vs sales growth divergence is ${inventoryDivergencePct}%`
              : 'Inventory divergence metric unavailable')
        }
      ],
      observations: invEval.observations
    },
    {
      principle_id: 'leverage-solvency',
      name: 'Financial Leverage & Solvency',
      metrics: {
        total_debt: totalDebt,
        total_equity: totalEquity,
        debt_to_equity: debtToEquity
      },
      checks: [
        {
          name: 'Financial Leverage & Solvency',
          criterion: 'Debt-to-Equity ≤ 0.50 (Max 1.0)',
          actual: debtToEquity !== null ? `${debtToEquity}x` : (totalDebt === 0 ? '0.00x' : 'N/A'),
          status: debtToEquity !== null && debtToEquity <= 0.50 ? 'PASS' : (debtToEquity !== null && debtToEquity <= 1.0 ? 'WARN' : 'FAIL'),
          details: debtToEquity !== null
            ? `Debt-to-Equity of ${debtToEquity}x with total debt ${totalDebt}`
            : 'Debt-to-Equity ratio not calculable'
        }
      ],
      observations: [debtToEquity !== null ? `Debt-to-Equity is ${debtToEquity}x.` : 'Debt-to-Equity not calculable.']
    }
  ];

  // Portfolio & Liquidity Gating
  const portfolioPath = options.portfolio ? path.resolve(options.portfolio) : DEFAULT_PORTFOLIO_PATH;
  let portfolioKnown = false;
  let isHeld = false;
  let currentWeightPct = 0.0;
  let liquidCash = { total_liquid_cash: 0.0, broker_cash: 0.0, bank_balance: 0.0 };
  let availableCash = 0.0;

  if (!options.noPortfolio && fs.existsSync(portfolioPath)) {
    try {
      const pRaw = fs.readFileSync(portfolioPath, 'utf8');
      const pData = JSON.parse(pRaw);
      portfolioKnown = true;
      const holdings = Array.isArray(pData.holdings) ? pData.holdings : [];
      const match = holdings.find(h => String(h.ticker || '').toUpperCase() === clean);
      if (match) {
        isHeld = true;
        currentWeightPct = Number(match.allocation_pct || match.weight_pct || 0);
      }
      const bankBal = loadBankBalance(path.join(REPO_ROOT, 'config', 'bank_balance.json'));
      liquidCash = getLiquidCashSummary(pData, bankBal);
      availableCash = liquidCash.total_liquid_cash || 0.0;
    } catch {
      portfolioKnown = false;
    }
  }

  const competenceEval = isIndexEtf
    ? { in_circle: true, status: 'IN_CIRCLE', max_position_weight_pct: 15.0, score: 100 }
    : evaluateCircleOfCompetence(clean);

  return {
    ticker: clean,
    market,
    company_name: companyName,
    category,
    is_index_etf: isIndexEtf,
    financials,
    principles,
    circle_of_competence: competenceEval,
    portfolio_status: {
      portfolio_known: portfolioKnown,
      is_held: isHeld,
      current_weight_pct: currentWeightPct,
      broker_cash: round2(liquidCash.broker_cash),
      bank_balance: round2(liquidCash.bank_balance),
      total_liquid_cash: round2(availableCash),
      available_cash: round2(availableCash),
      min_cash_required: 500.0,
      warnings: []
    }
  };
}

/**
 * Record Peter Lynch Reasoned Verdict into Canonical UniformVerdictContract Artifacts.
 */
async function recordLynchVerdict(ticker, advisorVerdict, options = {}) {
  const diag = await getLynchDiagnostics(ticker, options);
  const clean = diag.ticker;
  const outDir = options.out || options.outDir || DEFAULT_REPORTS_DIR;
  const timestamp = options.timestamp || new Date().toISOString();

  const stance = advisorVerdict.canonical_stance || advisorVerdict.stance || 'HOLD';
  const score = round2(advisorVerdict.score !== undefined ? advisorVerdict.score : (advisorVerdict.composite_score !== undefined ? advisorVerdict.composite_score : 50.0));
  const call = advisorVerdict.actionable_call || advisorVerdict.call || (stance === 'STRONG_BUY' || stance === 'BUY' ? 'BUY' : (stance === 'STRONG_SELL' || stance === 'REDUCE' ? 'SELL' : 'HOLD'));
  const callReason = advisorVerdict.call_reason || advisorVerdict.reason || 'Reasoned evaluation by Peter Lynch persona.';
  const folksyVerdict = advisorVerdict.folksy_verdict || advisorVerdict.speech || advisorVerdict.verdict_text || 'Know what you own, and know why you own it.';
  const summary = advisorVerdict.summary || `${stance}: ${callReason}`;

  const audit = [];
  const redFlags = [];
  for (const p of diag.principles) {
    for (const c of p.checks) {
      audit.push({
        check: `${p.name}: ${c.name}`,
        criterion: c.criterion,
        value: c.actual || c.value || 'N/A',
        status: c.status || 'WARN',
        details: c.details || ''
      });
      if (c.status === 'FAIL') {
        redFlags.push(`${c.name} failed: ${c.details}`);
      }
    }
  }

  const defaultObservations = diag.principles.flatMap(p => p.observations || []);
  const defaultPositives = diag.principles.flatMap(p => (p.checks || []).filter(c => c.status === 'PASS').map(c => `${c.name}: ${c.details || c.actual}`));
  const defaultNegatives = diag.principles.flatMap(p => (p.checks || []).filter(c => c.status === 'FAIL' || c.status === 'WARN').map(c => `${c.name}: ${c.details || c.actual}`));

  const positive = (Array.isArray(advisorVerdict.positive) && advisorVerdict.positive.length > 0)
    ? advisorVerdict.positive
    : defaultPositives;

  const negative = (Array.isArray(advisorVerdict.negative) && advisorVerdict.negative.length > 0)
    ? advisorVerdict.negative
    : defaultNegatives;

  const observations = (Array.isArray(advisorVerdict.observations) && advisorVerdict.observations.length > 0)
    ? advisorVerdict.observations
    : defaultObservations;

  const pegMetrics = (diag.principles.find(p => p.principle_id === 'peg-ratio') || {}).metrics || {};
  const invMetrics = (diag.principles.find(p => p.principle_id === 'inventory-sales-velocity') || {}).metrics || {};
  const levMetrics = (diag.principles.find(p => p.principle_id === 'leverage-solvency') || {}).metrics || {};

  const metrics = {
    peg_ratio: pegMetrics.peg_ratio ?? null,
    yield_adjusted_peg_ratio: pegMetrics.yield_adjusted_peg_ratio ?? null,
    eps_growth_rate_pct: pegMetrics.eps_growth_rate_pct ?? null,
    dividend_yield_pct: pegMetrics.dividend_yield_pct ?? null,
    pe_ratio: pegMetrics.pe_ratio ?? null,
    lynch_fair_value: pegMetrics.fair_value_line ?? null,
    inventory_divergence_pct: invMetrics.inventory_divergence_pct ?? null,
    debt_to_equity: levMetrics.debt_to_equity ?? null
  };

  const verdict = {
    principle: 'lynch',
    principle_title: 'Peter Lynch GARP Valuation',
    ticker: clean,
    timestamp,
    stance,
    score,
    is_veto: false,
    summary
  };

  const uniformPayload = {
    principle: 'lynch',
    ticker: clean,
    timestamp,
    score,
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
    warnings: [...redFlags, ...(diag.portfolio_status.warnings || [])],
    advisor_verdict: {
      actionable_call: call,
      call_reason: callReason,
      folksy_verdict: folksyVerdict
    },
    portfolio_status: diag.portfolio_status
  };

  const validation = validateUniformVerdict(uniformPayload);
  if (!validation.ok) {
    throw new Error(`UniformVerdict validation failed: ${JSON.stringify(validation.errors)}`);
  }

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(uniformPayload, outDir, false);
  }

  return {
    ok: true,
    ticker: clean,
    companyName: diag.company_name,
    category: diag.category,
    score,
    composite_score: score,
    stance,
    call,
    callReason,
    folksy_verdict: folksyVerdict,
    verdict: uniformPayload,
    portfolio_status: uniformPayload.portfolio_status,
    artifacts: {
      json: artifacts ? artifacts.jsonPath : null,
      html: artifacts ? artifacts.htmlPath : null
    },
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * High-level Peter Lynch advisory workflow.
 * Analyzes stock fundamentals, enforces Circle of Competence & portfolio cash till gating,
 * and emits actionable advisory recommendations.
 */
async function analyzeStockWithLynch(ticker, options = {}) {
  const clean = String(ticker || '').trim().toUpperCase();
  if (!clean) throw new Error('A ticker symbol is required.');

  const outDir = options.out || options.outDir || DEFAULT_REPORTS_DIR;
  const market = inferMarket(clean, options.market);

  // 1. Resolve Financials
  let financials = null;
  if (options.data) {
    const dataPath = path.resolve(options.data);
    if (!fs.existsSync(dataPath)) throw new Error(`Data file not found at ${dataPath}`);
    financials = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } else {
    const localReportPath = path.join(outDir, 'financials', `${clean}.json`);
    const repoReportPath = path.join(REPO_ROOT, 'reports', 'financials', `${clean}.json`);

    if (!options.refresh && fs.existsSync(localReportPath)) {
      financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
    } else if (!options.refresh && fs.existsSync(repoReportPath)) {
      financials = JSON.parse(fs.readFileSync(repoReportPath, 'utf8'));
    } else {
      if (!providerTickertape || typeof providerTickertape.fetchAndNormalizeTicker !== 'function') {
        throw new Error(`No local financials for ${clean} and provider_tickertape is unavailable.`);
      }
      financials = await providerTickertape.fetchAndNormalizeTicker(clean, {
        market,
        out: outDir,
        refresh: Boolean(options.refresh)
      });
    }
  }

  // 2. Evaluate Pure Quantitative Lynch Valuation
  const verdictResult = evaluateLynchValuation(financials, options);
  const compositeScore = verdictResult.score;

  // 3. Portfolio & Liquidity Cash Till Gating
  const portfolioPath = options.portfolio ? path.resolve(options.portfolio) : DEFAULT_PORTFOLIO_PATH;
  let portfolioKnown = false;
  let isHeld = false;
  let currentWeightPct = 0.0;
  let liquidCash = { total_liquid_cash: 0.0, broker_cash: 0.0, bank_balance: 0.0 };
  let availableCash = 0.0;

  if (!options.noPortfolio && fs.existsSync(portfolioPath)) {
    try {
      const pRaw = fs.readFileSync(portfolioPath, 'utf8');
      const pData = JSON.parse(pRaw);
      portfolioKnown = true;
      const holdings = Array.isArray(pData.holdings) ? pData.holdings : [];
      const match = holdings.find(h => String(h.ticker || '').toUpperCase() === clean);
      if (match) {
        isHeld = true;
        currentWeightPct = Number(match.allocation_pct || match.weight_pct || 0);
      }
      const bankBal = loadBankBalance(path.join(REPO_ROOT, 'config', 'bank_balance.json'));
      liquidCash = getLiquidCashSummary(pData, bankBal);
      availableCash = liquidCash.total_liquid_cash || 0.0;
    } catch {
      portfolioKnown = false;
    }
  }

  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(clean)
  );

  // Circle of Competence Diagnostic Evaluation
  const competenceEval = isIndexEtf
    ? { in_circle: true, status: 'IN_CIRCLE', max_position_weight_pct: 15.0, score: 100 }
    : evaluateCircleOfCompetence(clean);
  const competenceStatus = competenceEval.status || 'NEEDS_ASSESSMENT';
  const competenceScore = competenceEval.score || 0;
  const competenceMaxWeight = competenceEval.max_position_weight_pct !== undefined ? competenceEval.max_position_weight_pct : 15.0;

  let call = 'HOLD';
  let callReason = '';
  const portfolioWarnings = [];

  if (competenceStatus === 'NEEDS_ASSESSMENT') {
    portfolioWarnings.push(`CIRCLE OF COMPETENCE UNASSESSED: You have not evaluated Peter Lynch's fundamental understanding questionnaire for ${clean}. "Never invest in any idea you can't illustrate with a crayon."`);
  } else if (competenceStatus === 'OUTSIDE_CIRCLE') {
    portfolioWarnings.push(`OUTSIDE CIRCLE OF COMPETENCE: Comprehension score ${competenceScore}/100 indicates high business ambiguity. Position capped at HOLD.`);
  }

  if (!portfolioKnown) {
    if (compositeScore >= 65) {
      call = 'HOLD';
      callReason = 'Strong quantitative GARP fundamentals, but BUY is strictly gated until portfolio holdings and cash till are verified via fetch-all.';
      portfolioWarnings.push('PORTFOLIO UNKNOWN: Peter Lynch requires verification of liquidity till balance before committing capital. Run fetch-all.');
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = 'Fairly valued growth candidate. Hold position pending portfolio review.';
    } else {
      call = 'AVOID';
      callReason = 'Valuation multiple stretch or inventory accumulation. Steer clear.';
    }
  } else {
    const MAX_CONCENTRATION_PCT = Math.min(15.0, competenceMaxWeight);
    const MIN_CASH_REQUIRED = 500.0;

    if (compositeScore >= 65) {
      if (competenceStatus === 'NEEDS_ASSESSMENT' || competenceStatus === 'OUTSIDE_CIRCLE') {
        call = 'HOLD';
        callReason = `Attractive GARP fundamentals (${compositeScore}/100), but currently outside your evaluated circle of competence. “Know what you own, and know why you own it.” Complete the questionnaire first.`;
      } else if (currentWeightPct >= MAX_CONCENTRATION_PCT) {
        call = 'HOLD';
        callReason = `Sound GARP investment (${compositeScore}/100), but position already sits at ${currentWeightPct.toFixed(1)}% (exceeds ${MAX_CONCENTRATION_PCT}% ceiling). Discipline limits further exposure.`;
        portfolioWarnings.push(`Concentration ceiling reached: Current weight is ${currentWeightPct.toFixed(1)}% (max ${MAX_CONCENTRATION_PCT}%).`);
      } else if (availableCash < MIN_CASH_REQUIRED) {
        call = 'HOLD';
        callReason = `Compelling GARP profile (${compositeScore}/100), but cash reserves are inadequate (${availableCash.toFixed(2)}). Never borrow or stretch liquidity.`;
        portfolioWarnings.push(`Insufficient cash till: Available cash is ${availableCash.toFixed(2)}.`);
      } else {
        call = 'BUY';
        callReason = `Attractive GARP profile verified (${compositeScore}/100). Healthy PEG multiple, clean inventory velocity, and ample till reserves.`;
      }
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = isHeld
        ? `Fairly valued candidate (${compositeScore}/100). Maintain current ${currentWeightPct.toFixed(1)}% allocation while watching for better entry points.`
        : `Fairly valued candidate (${compositeScore}/100), but expansion margin is insufficient to warrant fresh capital commitment. Place on watchlist.`;
    } else {
      if (isHeld) {
        call = 'SELL';
        callReason = `Growth multiple overextended or inventory bloat detected (${compositeScore}/100). Trim or liquidate to protect capital.`;
      } else {
        call = 'AVOID';
        callReason = `Speculative valuation multiple stretch or inventory channel risk (${compositeScore}/100). Fails Peter Lynch GARP standards.`;
      }
    }
  }

  const companyName = financials.name || financials.ticker || clean;
  const category = classifyLynchCategory(financials);

  // 4. Write verified artifact pair
  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(verdictResult, outDir, false);
  }

  const speech = formatLynchSpeech({
    clean,
    companyName,
    category,
    compositeScore,
    stance: verdictResult.stance,
    call,
    callReason,
    metrics: verdictResult.metrics,
    audit: verdictResult.audit,
    positive: verdictResult.positive,
    negative: verdictResult.negative,
    portfolioWarnings,
    currentWeightPct,
    isHeld,
    availableCash,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  });

  return {
    ok: true,
    ticker: clean,
    companyName,
    category,
    score: compositeScore,
    stance: verdictResult.stance,
    call,
    callReason,
    verdict: verdictResult,
    speech,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  };
}

/**
 * Option C Portfolio Batch Mode: evaluate all holdings in an account snapshot.
 */
async function processHoldings(holdingsPath, options = {}) {
  const resolved = path.resolve(holdingsPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Holdings snapshot file not found at ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const snapshot = JSON.parse(raw);
  const holdings = Array.isArray(snapshot.holdings) ? snapshot.holdings : [];

  const outDir = options.out || options.outDir || DEFAULT_REPORTS_DIR;
  const verdicts = [];
  const failures = [];

  for (const h of holdings) {
    const ticker = (h.ticker || '').toUpperCase();
    if (!ticker) continue;

    try {
      const res = await analyzeStockWithLynch(ticker, {
        ...options,
        noWrite: true
      });
      verdicts.push(res.verdict);
    } catch (err) {
      failures.push({ ticker, error: err.message });
    }
  }

  const batch = {
    principle: 'lynch',
    timestamp: options.timestamp || new Date().toISOString(),
    verdicts
  };

  const validation = validateUniformVerdictBatch(batch);
  if (!validation.ok) {
    throw new Error(`VerdictBatch validation failed: ${JSON.stringify(validation.errors)}`);
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    ticker: null,
    market: null,
    data: null,
    holdings: null,
    portfolio: null,
    noPortfolio: false,
    out: null,
    refresh: false,
    diagnostics: false,
    recordVerdict: null,
    jsonOutput: false,
    noWrite: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker' && i + 1 < argv.length) {
      args.ticker = argv[++i];
    } else if (a === '--market' && i + 1 < argv.length) {
      args.market = argv[++i];
    } else if (a === '--data' && i + 1 < argv.length) {
      args.data = argv[++i];
    } else if (a === '--holdings' && i + 1 < argv.length) {
      args.holdings = argv[++i];
    } else if (a === '--portfolio' && i + 1 < argv.length) {
      args.portfolio = argv[++i];
    } else if (a === '--no-portfolio') {
      args.noPortfolio = true;
    } else if (a === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (a === '--refresh') {
      args.refresh = true;
    } else if (a === '--diagnostics') {
      args.diagnostics = true;
    } else if (a === '--record-verdict' && i + 1 < argv.length) {
      args.recordVerdict = argv[++i];
    } else if (a === '--json-output' || a === '--json') {
      args.jsonOutput = true;
    } else if (a === '--no-write') {
      args.noWrite = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    if (args.ticker && args.diagnostics) {
      const diag = await getLynchDiagnostics(args.ticker, args);
      console.log(JSON.stringify(diag, null, 2));
      return;
    }

    if (args.ticker && args.recordVerdict) {
      let payload;
      try {
        if (fs.existsSync(args.recordVerdict)) {
          payload = JSON.parse(fs.readFileSync(args.recordVerdict, 'utf8'));
        } else {
          let raw = args.recordVerdict.trim();
          try {
            payload = JSON.parse(raw);
          } catch {
            if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
              raw = raw.slice(1, -1).trim();
            }
            raw = raw.replace(/\\"/g, '"');
            payload = JSON.parse(raw);
          }
        }
      } catch (e) {
        throw new Error(`Failed to parse --record-verdict payload: ${e.message}`);
      }
      const res = await recordLynchVerdict(args.ticker, payload, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`\n=== Peter Lynch Reasoned Verdict Recorded: ${res.ticker} ===`);
        console.log(`Stance          : ${res.verdict.stance} | Score: ${res.score}/100`);
        console.log(`Actionable Call : ${res.call}`);
        console.log(`Reason          : ${res.callReason}`);
        console.log(`Magellan Advice : ${res.folksy_verdict}`);
        console.log(`Artifacts written to:\n  ${res.artifacts.json}\n  ${res.artifacts.html}\n`);
      }
      return;
    }

    if (args.holdings) {
      const res = await processHoldings(args.holdings, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res.batch, null, 2));
      } else {
        console.log(`Evaluated ${res.batch.evaluated_holdings}/${res.batch.total_holdings} holdings with Peter Lynch GARP standards.`);
        if (res.jsonPath) console.log(`Batch JSON: ${res.jsonPath}`);
        if (res.htmlPath) console.log(`Batch HTML: ${res.htmlPath}`);
      }
      return;
    }

    if (args.data) {
      const res = processDataFile(args.data, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res.verdict, null, 2));
      } else {
        console.log(`Successfully evaluated ${args.data} with Peter Lynch GARP.`);
        if (res.jsonPath) console.log(`JSON: ${res.jsonPath}`);
        if (res.htmlPath) console.log(`HTML: ${res.htmlPath}`);
      }
      return;
    }

    if (args.ticker) {
      const res = await analyzeStockWithLynch(args.ticker, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res.verdict, null, 2));
      } else {
        console.log(res.speech);
      }
      return;
    }

    console.error('Usage:');
    console.error('  node orchestrate_lynch_analysis.js --ticker <TICKER> [--market IN|US] [--json-output]');
    console.error('  node orchestrate_lynch_analysis.js --ticker <TICKER> --diagnostics');
    console.error('  node orchestrate_lynch_analysis.js --ticker <TICKER> --record-verdict <JSON|FILE>');
    console.error('  node orchestrate_lynch_analysis.js --data <PATH_TO_NORMALIZED_FINANCIALS>');
    console.error('  node orchestrate_lynch_analysis.js --holdings <PATH_TO_HOLDINGS_SNAPSHOT>');
    process.exit(1);
  } catch (err) {
    console.error('Error executing Peter Lynch analysis:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  calculatePEG,
  calculateYieldAdjustedPEG,
  calculateFairValueLine,
  calculateLynchFairValue,
  calculateInventoryDivergence,
  classifyLynchCategory,
  evaluateLynchValuation,
  evaluateLynch: evaluateLynchValuation,
  getLynchDiagnostics,
  recordLynchVerdict,
  renderHtml,
  renderLynchDashboardHtml,
  writeArtifacts,
  processDataFile,
  analyzeStockWithLynch,
  processHoldings,
  parseArgs,
  main
};
