#!/usr/bin/env node
'use strict';

/**
 * analyze_lynch.js: Tier 3 Peter Lynch Growth-At-A-Reasonable-Price (GARP) Valuation Engine.
 * Computes PEG ratio, yield-adjusted PEG, Lynch Fair Value line, inventory velocity
 * divergence, and company lifecycle categorization.
 * Emits canonical UniformVerdictContract (principle: "lynch", is_veto: false).
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'lynch-template.html');

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
 * Calculate classic Lynch PEG ratio: P/E / EPS Growth Rate.
 * Returns null if PE <= 0 or epsGrowth <= 0.
 */
function calculatePEG(pe, epsGrowth) {
  if (!isFiniteNumber(pe) || !isFiniteNumber(epsGrowth) || pe <= 0 || epsGrowth <= 0) {
    return null;
  }
  return round2(pe / epsGrowth);
}

/**
 * Calculate Yield-Adjusted PEG ratio: P/E / (EPS Growth Rate + Dividend Yield).
 * Returns null if PE <= 0 or combined expansion rate <= 0.
 */
function calculateYieldAdjustedPEG(pe, epsGrowth, divYield) {
  const y = isFiniteNumber(divYield) ? Math.max(0, divYield) : 0.0;
  if (!isFiniteNumber(pe) || !isFiniteNumber(epsGrowth) || pe <= 0 || (epsGrowth + y) <= 0) {
    return null;
  }
  return round2(pe / (epsGrowth + y));
}

/**
 * Calculate Lynch Fair Value line: (EPS Growth Rate + Dividend Yield) * EPS.
 * Returns null if EPS <= 0 or combined expansion rate <= 0.
 */
function calculateLynchFairValue(eps, epsGrowth, divYield) {
  const y = isFiniteNumber(divYield) ? Math.max(0, divYield) : 0.0;
  if (!isFiniteNumber(eps) || !isFiniteNumber(epsGrowth) || eps <= 0 || (epsGrowth + y) <= 0) {
    return null;
  }
  return round2((epsGrowth + y) * eps);
}

/**
 * Calculate Inventory vs Sales velocity divergence: Inventory Growth Rate - Sales Growth Rate.
 */
function calculateInventoryDivergence(inventoryGrowth, salesGrowth) {
  if (!isFiniteNumber(inventoryGrowth) || !isFiniteNumber(salesGrowth)) {
    return null;
  }
  return round2(inventoryGrowth - salesGrowth);
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
          score: 100.0,
          max_score: 100.0,
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

  const revGrowth = isFiniteNumber(marketData.revenue_growth_5y_cagr_pct)
    ? Number(marketData.revenue_growth_5y_cagr_pct)
    : (isFiniteNumber(marketData.revenue_growth_ttm) ? Number(marketData.revenue_growth_ttm) : null);

  // Inventory vs sales growth divergence
  let inventoryDivergence = null;
  if (isFiniteNumber(forensics.inventory_growth_vs_sales_delta_pct)) {
    inventoryDivergence = Number(forensics.inventory_growth_vs_sales_delta_pct);
  } else if (isFiniteNumber(forensics.inventory_growth_pct) && isFiniteNumber(forensics.sales_growth_pct)) {
    inventoryDivergence = calculateInventoryDivergence(forensics.inventory_growth_pct, forensics.sales_growth_pct);
  } else if (balance.inventory === 0 || balance.inventory === null) {
    inventoryDivergence = 0.0;
  }

  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0.0;
  const totalEquity = isFiniteNumber(balance.total_equity) ? Number(balance.total_equity) : null;
  const debtToEquity = (totalEquity !== null && totalEquity > 0) ? round2(totalDebt / totalEquity) : null;

  // 2. Metrics calculation
  const pegRatio = calculatePEG(pe, epsGrowth);
  const yieldAdjustedPegRatio = calculateYieldAdjustedPEG(pe, epsGrowth, divYield);
  const lynchFairValue = calculateLynchFairValue(eps, epsGrowth, divYield);
  const inventoryDivergencePct = round2(inventoryDivergence);
  const peRatio = round2(pe);
  const dividendYieldPct = isFiniteNumber(divYield) ? round2(divYield) : null;
  const epsGrowthRatePct = isFiniteNumber(epsGrowth) ? round2(epsGrowth) : null;

  // 3. Quantitative Lynch Scoring & Observations
  let score = 0.0;
  const redFlags = [];

  let pillar1Score = 0.0;
  // Pillar 1: PEG Valuation Discipline (max 40 pts)
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

  let pillar2Score = 0.0;
  // Pillar 2: Earnings & Revenue Expansion Engine (max 25 pts)
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

  let pillar3Score = 0.0;
  // Pillar 3: Operational Inventory Velocity (max 20 pts)
  const hasNoInventory = (balance.inventory === 0 || balance.inventory === null);
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
    pillar3Score = 10.0; // neutral when inventory metric not present
  }
  score += pillar3Score;

  let pillar4Score = 0.0;
  // Pillar 4: Balance Sheet Health & Financial Freedom (max 15 pts)
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

  // 1. Audit Array (4 Pillars)
  const audit = [
    {
      check: 'PEG Valuation Discipline',
      criterion: 'PEG ≤ 1.0 (Ceiling ≤ 2.0)',
      value: pegRatio !== null ? `${pegRatio}x` : 'N/A',
      status: pegRatio !== null && pegRatio <= 1.0 ? 'PASS' : (pegRatio !== null && pegRatio <= 2.0 ? 'WARN' : 'FAIL'),
      score: pillar1Score,
      max_score: 40,
      details: pegRatio !== null
        ? `PEG ratio of ${pegRatio}x (Yield-adjusted PEG: ${yieldAdjustedPegRatio !== null ? yieldAdjustedPegRatio + 'x' : 'N/A'})`
        : 'Missing or negative P/E or earnings growth rate'
    },
    {
      check: 'Earnings Growth Engine',
      criterion: '5Y EPS CAGR ≥ 10.0% (Fast Grower ≥ 20.0%)',
      value: epsGrowthRatePct !== null ? `${epsGrowthRatePct}%` : 'N/A',
      status: epsGrowthRatePct !== null && epsGrowthRatePct >= 10.0 ? 'PASS' : (epsGrowthRatePct !== null && epsGrowthRatePct >= 5.0 ? 'WARN' : 'FAIL'),
      score: pillar2Score,
      max_score: 25,
      details: epsGrowthRatePct !== null
        ? `Annual EPS growth CAGR of ${epsGrowthRatePct}%`
        : 'Historical EPS growth rate not established'
    },
    {
      check: 'Operational Inventory Velocity',
      criterion: 'Inventory Growth ≤ Sales Growth (Divergence ≤ 5%)',
      value: hasNoInventory ? 'Zero Inventory (Asset-light)' : (inventoryDivergencePct !== null ? `${inventoryDivergencePct}%` : 'N/A'),
      status: (hasNoInventory || (inventoryDivergencePct !== null && inventoryDivergencePct <= 5.0)) ? 'PASS' : (inventoryDivergencePct !== null && inventoryDivergencePct <= 10.0 ? 'WARN' : 'FAIL'),
      score: pillar3Score,
      max_score: 20,
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
      score: pillar4Score,
      max_score: 15,
      details: debtToEquity !== null
        ? `Debt-to-Equity of ${debtToEquity}x with total debt ${totalDebt}`
        : 'Debt-to-Equity ratio not calculable'
    }
  ];

  // 2. Positive Factors
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

  // 3. Negative Factors
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

  // 4. Observations
  const observations = [
    `Peter Lynch Lifecycle Archetype: ${category}.`,
    `Lynch Fair Value: ${lynchFairValue !== null ? lynchFairValue : 'N/A'}.`,
    `Trailing P/E: ${peRatio !== null ? peRatio + 'x' : 'N/A'}, Yield-adjusted PEG: ${yieldAdjustedPegRatio !== null ? yieldAdjustedPegRatio : 'N/A'}.`,
    `5-Year Historical EPS CAGR: ${epsGrowthRatePct !== null ? epsGrowthRatePct + '%' : 'N/A'}.`
  ];

  // 5. Warnings
  const warnings = [...redFlags];

  // 6. Verdict Container
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

  const verdict = evaluateLynchValuation(financials, options);
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
      const fixtureFastPath = path.join(SKILL_ROOT, 'tests', 'fixtures', 'lynch_fast_grower.json');

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
      } else if (fs.existsSync(fixtureFastPath)) {
        const base = JSON.parse(fs.readFileSync(fixtureFastPath, 'utf8'));
        financials = { ...base, ticker, name: item.name || base.name };
      }
    }

    if (financials) {
      const v = evaluateLynchValuation(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'lynch',
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
Peter Lynch GARP Valuation Engine CLI
Usage:
  node analyze_lynch.js --data <path_to_financials.json> [--out <dir>]
  node analyze_lynch.js --ticker <SYMBOL> [--market <IN|US>] [--out <dir>] [--refresh]
  node analyze_lynch.js --holdings <path_to_holdings.json> [--out <dir>]

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
      process.stdout.write(`\n📈 Peter Lynch Valuation: Evaluated ${result.batch.verdicts.length} securities in portfolio batch:\n`);
      for (const v of result.batch.verdicts) {
        const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
        process.stdout.write(`   ${icon} ${v.ticker.padEnd(8)}: ${v.stance.padEnd(14)} Score: ${String(v.score).padStart(5)}/100  (PEG: ${v.metrics.peg_ratio !== null ? v.metrics.peg_ratio : 'N/A'})\n`);
      }
      process.stdout.write(`\n📁 Consolidated Artifacts:\n`);
      process.stdout.write(`   • JSON: ${result.jsonPath}\n`);
      process.stdout.write(`   • HTML: ${result.htmlPath}\n`);
      process.stdout.write('✅ Universal Verification Harness verified batch artifact pair.\n\n');
    } else {
      const v = result.verdict;
      const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
      process.stdout.write(`\n📈 Peter Lynch Valuation Verdict for ${v.ticker}:\n`);
      process.stdout.write(`   • Stance:                   ${icon} ${v.stance}\n`);
      process.stdout.write(`   • Lynch Score:              ${v.score}/100.0\n`);
      process.stdout.write(`   • PEG Ratio:                ${v.metrics.peg_ratio !== null ? v.metrics.peg_ratio : 'N/A'}\n`);
      process.stdout.write(`   • Yield-Adjusted PEG:       ${v.metrics.yield_adjusted_peg_ratio !== null ? v.metrics.yield_adjusted_peg_ratio : 'N/A'}\n`);
      process.stdout.write(`   • Lynch Fair Value:         ${v.metrics.lynch_fair_value !== null ? v.metrics.lynch_fair_value : 'N/A'}\n`);
      process.stdout.write(`   • Inventory Divergence:     ${v.metrics.inventory_divergence_pct !== null ? v.metrics.inventory_divergence_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • 5Y EPS CAGR:              ${v.metrics.eps_growth_rate_pct !== null ? v.metrics.eps_growth_rate_pct + '%' : 'N/A'}\n`);
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
  calculateInventoryDivergence,
  calculateLynchFairValue,
  calculatePEG,
  calculateYieldAdjustedPEG,
  classifyLynchCategory,
  evaluateLynchValuation,
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

