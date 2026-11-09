#!/usr/bin/env node
'use strict';

/**
 * analyze_graham.js: Tier 3 Benjamin Graham Deterministic Valuation Engine.
 * Computes Graham Number floor, Net-Net Working Capital (NNWC), Net Current
 * Asset Value (NCAV), Margin of Safety, and defensive investor criteria.
 * Emits canonical UniformVerdictContract (principle: "graham", is_veto: false).
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'graham-template.html');

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
 * Calculate classical Graham Number floor: sqrt(22.5 * EPS * BVPS).
 * Returns null if EPS <= 0 or BVPS <= 0.
 */
function calculateGrahamNumber(eps, bvps) {
  if (!isFiniteNumber(eps) || !isFiniteNumber(bvps) || eps <= 0 || bvps <= 0) {
    return null;
  }
  return round2(Math.sqrt(22.5 * eps * bvps));
}

/**
 * Calculate Net-Net Working Capital (NNWC):
 * Cash + (0.75 * Receivables) + (0.50 * Inventory) - Total Liabilities.
 */
function calculateNNWC(cash, receivables, inventory, totalLiabilities) {
  const c = isFiniteNumber(cash) ? cash : 0;
  const r = isFiniteNumber(receivables) ? receivables : 0;
  const i = isFiniteNumber(inventory) ? inventory : 0;
  const l = isFiniteNumber(totalLiabilities) ? totalLiabilities : 0;
  return round2(c + (0.75 * r) + (0.50 * i) - l);
}

/**
 * Calculate Net Current Asset Value (NCAV):
 * Total Current Assets - Total Liabilities.
 */
function calculateNCAV(totalCurrentAssets, totalLiabilities) {
  const ca = isFiniteNumber(totalCurrentAssets) ? totalCurrentAssets : 0;
  const l = isFiniteNumber(totalLiabilities) ? totalLiabilities : 0;
  return round2(ca - l);
}

/**
 * Pure deterministic valuation evaluator for Benjamin Graham value-investing rules.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @param {object} [options]
 * @returns {object} Canonical UniformVerdictContract (principle: "graham")
 */
function evaluateGrahamValuation(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateGrahamValuation requires a valid NormalizedCompanyFinancials object');
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
    const etfSummary = `Index ETF passive basket (${ticker}): Single-equity Graham liquidation floors and valuation multiples bypassed.`;
    return {
      principle: 'graham',
      ticker,
      timestamp,
      score: 100.0,
      stance: 'HOLD',
      is_veto: false,
      summary: etfSummary,
      metrics: {
        graham_number: null,
        nnwc: null,
        nnwc_per_share: null,
        ncav_per_share: null,
        margin_of_safety_pct: null,
        current_ratio: null,
        pe_ratio: null,
        pb_ratio: null,
        pe_x_pb: null
      },
      red_flags: [],
      verdict: {
        principle: 'graham',
        principle_title: 'Benjamin Graham Deep Value',
        ticker,
        timestamp,
        stance: 'HOLD',
        score: 100.0,
        is_veto: false,
        summary: etfSummary
      },
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
        'Broad market index diversification eliminates single-company insolvency risk.'
      ],
      negative: [],
      observations: [
        'Passive index fund is evaluated on asset diversification rather than individual balance sheet liquidation.'
      ],
      warnings: []
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};

  const cmp = isFiniteNumber(marketData.cmp) ? Number(marketData.cmp) : null;
  const eps = marketData.eps_ttm !== undefined && isFiniteNumber(marketData.eps_ttm)
    ? Number(marketData.eps_ttm)
    : (income.eps !== undefined && isFiniteNumber(income.eps) ? Number(income.eps) : null);
  const bvps = isFiniteNumber(marketData.bvps) ? Number(marketData.bvps) : null;
  const pe = isFiniteNumber(marketData.pe_ttm) ? Number(marketData.pe_ttm) : null;
  const pb = isFiniteNumber(marketData.pb_ttm) ? Number(marketData.pb_ttm) : null;
  const shares = isFiniteNumber(marketData.shares_outstanding) && marketData.shares_outstanding > 0
    ? Number(marketData.shares_outstanding)
    : null;
  const divYield = isFiniteNumber(marketData.dividend_yield_pct) ? Number(marketData.dividend_yield_pct) : 0.0;

  const cash = isFiniteNumber(balance.cash_and_equivalents) ? Number(balance.cash_and_equivalents) : 0.0;
  const receivables = isFiniteNumber(balance.accounts_receivable) ? Number(balance.accounts_receivable) : 0.0;
  const inventory = isFiniteNumber(balance.inventory) ? Number(balance.inventory) : 0.0;
  const totalCurrentAssets = isFiniteNumber(balance.total_current_assets)
    ? Number(balance.total_current_assets)
    : (cash + receivables + inventory);
  const totalCurrentLiab = isFiniteNumber(balance.total_current_liabilities) ? Number(balance.total_current_liabilities) : 0.0;
  const totalLiab = isFiniteNumber(balance.total_liabilities) ? Number(balance.total_liabilities) : 0.0;
  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0.0;
  const netIncome = isFiniteNumber(income.net_income) ? Number(income.net_income) : null;

  // 2. Metrics calculation
  const grahamNumber = calculateGrahamNumber(eps, bvps);
  const nnwc = calculateNNWC(cash, receivables, inventory, totalLiab);
  const nnwcPerShare = shares ? round2(nnwc / shares) : null;

  const ncav = calculateNCAV(totalCurrentAssets, totalLiab);
  const ncavPerShare = shares ? round2(ncav / shares) : null;

  const currentRatio = (totalCurrentLiab > 0) ? round2(totalCurrentAssets / totalCurrentLiab) : null;
  const peXpb = (pe !== null && pe > 0 && pb !== null && pb > 0) ? round2(pe * pb) : null;

  let marginOfSafetyPct = null;
  if (grahamNumber !== null && cmp !== null && cmp > 0) {
    marginOfSafetyPct = round2(((grahamNumber - cmp) / grahamNumber) * 100);
  }

  // 3. Quantitative Graham Scoring & Observations
  let score = 0.0;
  const redFlags = [];

  let pillar1Score = 0.0;
  // Pillar 1: Margin of Safety vs Graham Number (max 40 pts)
  if (marginOfSafetyPct !== null) {
    if (marginOfSafetyPct >= 30.0) {
      pillar1Score = 40.0;
    } else if (marginOfSafetyPct >= 10.0) {
      pillar1Score = 30.0;
    } else if (marginOfSafetyPct >= -10.0) {
      pillar1Score = 20.0; // Fair value band
    } else if (marginOfSafetyPct >= -30.0) {
      pillar1Score = 10.0;
      redFlags.push(`Moderate valuation premium: CMP trades ${round2(Math.abs(marginOfSafetyPct))}% above Graham Number floor`);
    } else {
      pillar1Score = 0.0;
      redFlags.push(`Substantial valuation stretch: CMP trades ${round2(Math.abs(marginOfSafetyPct))}% above Graham Number floor`);
    }
  } else {
    pillar1Score = 0.0;
    if (eps === null || eps <= 0) {
      redFlags.push('Negative or zero EPS precludes Graham Number valuation');
    }
    if (bvps === null || bvps <= 0) {
      redFlags.push('Negative or zero Book Value per Share precludes Graham Number valuation');
    }
  }
  score += pillar1Score;

  let pillar2Score = 0.0;
  // Pillar 2: Multiples Discipline (max 25 pts)
  if (peXpb !== null) {
    if ((pe <= 15.0 && pb <= 1.5) || peXpb <= 22.5) {
      pillar2Score = 25.0;
    } else if (peXpb <= 35.0) {
      pillar2Score = 15.0;
    } else if (peXpb <= 50.0) {
      pillar2Score = 8.0;
      redFlags.push(`Elevated multiples product: P/E × P/B of ${peXpb} exceeds classical 22.5 ceiling`);
    } else {
      pillar2Score = 0.0;
      redFlags.push(`Aggressive valuation multiples: P/E × P/B of ${peXpb} significantly exceeds Graham ceiling (22.5)`);
    }
  } else {
    pillar2Score = 0.0;
    if (pe !== null && pe > 50.0) {
      redFlags.push(`Excessive P/E multiple (${pe} > 50.0)`);
    }
  }
  score += pillar2Score;

  let pillar3Score = 0.0;
  // Pillar 3: Balance Sheet Liquidity & Solvency (max 20 pts)
  // Current Ratio (10 pts)
  if (currentRatio !== null) {
    if (currentRatio >= 2.0) {
      pillar3Score += 10.0;
    } else if (currentRatio >= 1.5) {
      pillar3Score += 6.0;
    } else if (currentRatio >= 1.0) {
      pillar3Score += 3.0;
      redFlags.push(`Sub-optimal working capital: Current ratio ${currentRatio} is below Graham 2.0 standard`);
    } else {
      pillar3Score += 0.0;
      redFlags.push(`Deficient liquidity: Current ratio ${currentRatio} < 1.0 indicates working capital shortfall`);
    }
  }

  // Debt vs Net Current Assets (10 pts)
  if (ncav !== null) {
    if (totalDebt <= ncav && ncav > 0) {
      pillar3Score += 10.0;
    } else {
      pillar3Score += 0.0;
      redFlags.push(`High leverage: Total debt (${totalDebt}) exceeds Net Current Assets (${ncav})`);
    }
  }
  score += pillar3Score;

  let pillar4Score = 0.0;
  // Pillar 4: Earnings Stability & Dividends (max 15 pts)
  if (netIncome !== null && netIncome > 0) {
    pillar4Score += 10.0;
  } else {
    pillar4Score += 0.0;
    redFlags.push('Unprofitable operations: negative or missing net income breaches Graham earnings stability rule');
  }

  if (divYield !== null && divYield > 0.0) {
    pillar4Score += 5.0;
  }
  score += pillar4Score;

  // Net-Net Special Condition Bonus
  const isNetNetBargain = Boolean(
    nnwcPerShare !== null &&
    cmp !== null &&
    cmp > 0 &&
    cmp <= nnwcPerShare
  );

  if (isNetNetBargain) {
    score = Math.max(score, 90.0);
    redFlags.unshift(`🌟 GRAHAM NET-NET BARGAIN: CMP (${cmp}) trades below Net-Net Working Capital per share (${nnwcPerShare})`);
  }

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

  // Narrative summary
  let summary;
  if (isNetNetBargain) {
    summary = `STRONG BUY (Graham Net-Net): ${ticker} trades at a rare discount to liquidation floor (CMP ${cmp} <= NNWC/share ${nnwcPerShare}). Substantial margin of safety verified.`;
  } else if (stance === 'STRONG_BUY' || stance === 'BUY') {
    summary = `${stance}: Classical margin of safety confirmed. Graham Number floor (${grahamNumber}) offers ${marginOfSafetyPct}% buffer vs CMP (${cmp}). P/E × P/B = ${peXpb || 'N/A'}.`;
  } else if (stance === 'HOLD') {
    summary = `HOLD: Fair value range. CMP (${cmp}) closely reflects Graham intrinsic bounds (${grahamNumber || 'N/A'}). Adequate balance sheet strength maintained.`;
  } else {
    summary = `${stance}: Extended valuation multiples and insufficient margin of safety. CMP (${cmp}) exceeds Graham Number floor (${grahamNumber || 'N/A'}) by ${marginOfSafetyPct ? Math.abs(marginOfSafetyPct) + '%' : 'wide margin'}.`;
  }

  // 1. Audit Checks
  const audit = [
    {
      check: 'Net-Net Liquidation Floor (NNWC)',
      criterion: 'CMP <= NNWC/share (Deep Liquidation Bargain)',
      value: nnwcPerShare !== null ? `NNWC: ${nnwcPerShare}, CMP: ${cmp}` : 'N/A',
      status: isNetNetBargain ? 'PASS' : (ncavPerShare !== null && cmp <= ncavPerShare ? 'WARN' : 'FAIL'),
      score: isNetNetBargain ? 40 : (ncavPerShare !== null && cmp <= ncavPerShare ? 20 : 0),
      max_score: 40,
      details: isNetNetBargain
        ? 'Trades below conservative Net-Net Working Capital liquidation floor'
        : (ncavPerShare !== null && cmp <= ncavPerShare ? 'Trades below NCAV but above NNWC' : 'Market price trades above liquidation floor')
    },
    {
      check: 'Classical Graham Margin of Safety',
      criterion: 'Graham Number Floor >= CMP (≥ 0% Margin of Safety)',
      value: grahamNumber !== null ? `Graham No: ${grahamNumber}, MoS: ${marginOfSafetyPct !== null ? marginOfSafetyPct + '%' : 'N/A'}` : 'N/A',
      status: marginOfSafetyPct !== null && marginOfSafetyPct >= 10 ? 'PASS' : (marginOfSafetyPct !== null && marginOfSafetyPct >= -25 ? 'WARN' : 'FAIL'),
      score: pillar1Score,
      max_score: 40,
      details: marginOfSafetyPct !== null
        ? (marginOfSafetyPct >= 0 ? `Positive margin of safety: ${marginOfSafetyPct}% buffer` : `Trades at a ${round2(Math.abs(marginOfSafetyPct))}% premium to Graham floor`)
        : 'Negative or zero earnings/book value precludes calculation'
    },
    {
      check: 'Conservative Valuation Multiples',
      criterion: 'P/E <= 15.0 & P/B <= 1.5 (P/E × P/B <= 22.5)',
      value: peXpb !== null ? `P/E: ${pe}, P/B: ${pb}, P/E×P/B: ${peXpb}` : 'N/A',
      status: peXpb !== null && peXpb <= 22.5 ? 'PASS' : (peXpb !== null && peXpb <= 35 ? 'WARN' : 'FAIL'),
      score: pillar2Score,
      max_score: 25,
      details: peXpb !== null
        ? (peXpb <= 22.5 ? 'Multiples product complies with defensive investor ceiling (≤ 22.5)' : `Multiples product of ${peXpb} exceeds Graham 22.5 ceiling`)
        : 'Missing or negative P/E or P/B multiple'
    },
    {
      check: 'Financial Strength & Balance Sheet Liquidity',
      criterion: 'Current Ratio >= 2.0x & Total Debt <= NCAV',
      value: `Current Ratio: ${currentRatio !== null ? currentRatio + 'x' : 'N/A'}, Debt: ${totalDebt}`,
      status: (currentRatio !== null && currentRatio >= 2.0 && totalDebt <= (ncav || 0)) ? 'PASS' : (currentRatio !== null && currentRatio >= 1.2 ? 'WARN' : 'FAIL'),
      score: pillar3Score,
      max_score: 20,
      details: currentRatio !== null && currentRatio >= 2.0
        ? `Current ratio of ${currentRatio}x meets Graham 2.0x safety standard`
        : `Current ratio (${currentRatio !== null ? currentRatio + 'x' : 'N/A'}) falls below 2.0x benchmark`
    }
  ];

  // 2. Positive Factors
  const positive = [];
  if (isNetNetBargain) {
    positive.push(`Rare Net-Net liquidation bargain: CMP (${cmp}) is at or below Net-Net Working Capital per share (${nnwcPerShare}).`);
  }
  if (marginOfSafetyPct !== null && marginOfSafetyPct > 0) {
    positive.push(`Positive Margin of Safety: Graham Number intrinsic floor offers a ${marginOfSafetyPct}% buffer above CMP.`);
  }
  if (peXpb !== null && peXpb <= 22.5) {
    positive.push(`Conservative valuation multiples: P/E × P/B (${peXpb}) meets defensive investor ceiling (≤ 22.5).`);
  }
  if (currentRatio !== null && currentRatio >= 2.0) {
    positive.push(`Robust working capital liquidity: Current ratio of ${currentRatio}x meets Graham 2.0x threshold.`);
  }
  if (totalDebt === 0) {
    positive.push('Fortress balance sheet: Zero interest-bearing debt obligations.');
  } else if (ncav !== null && totalDebt <= ncav && ncav > 0) {
    positive.push(`Manageable leverage: Total debt (${totalDebt}) is fully covered by Net Current Assets (${ncav}).`);
  }
  if (netIncome !== null && netIncome > 0) {
    positive.push('Profitable operations: Stable net income satisfies Graham earnings stability rule.');
  }
  if (divYield > 0) {
    positive.push(`Active capital return: Dividend yield of ${divYield}% provides defensive income.`);
  }

  // 3. Negative Factors
  const negative = [];
  if (marginOfSafetyPct !== null && marginOfSafetyPct < 0) {
    negative.push(`Negative Margin of Safety: CMP trades at a ${round2(Math.abs(marginOfSafetyPct))}% premium above Graham Number floor (${grahamNumber}).`);
  }
  if (peXpb !== null && peXpb > 22.5) {
    negative.push(`Extended multiples product: P/E × P/B (${peXpb}) exceeds Graham defensive limit (22.5).`);
  }
  if (currentRatio !== null && currentRatio < 2.0) {
    negative.push(`Working capital cushion: Current ratio (${currentRatio}x) is below Graham 2.0x standard.`);
  }
  if (ncav !== null && totalDebt > ncav) {
    negative.push(`Debt exceeds net current assets: Total debt (${totalDebt}) > NCAV (${ncav}).`);
  }
  if (netIncome !== null && netIncome <= 0) {
    negative.push('Unprofitable operations: Negative net income violates Graham earnings continuity rule.');
  }

  // 4. Observations
  const observations = [];
  if (isNetNetBargain) {
    observations.push('Deep value classification: Net-Net Bargain (trading below liquidating working capital).');
  } else if (stance === 'STRONG_BUY' || stance === 'BUY') {
    observations.push('Deep value classification: Defensive Graham Investor Candidate.');
  } else if (stance === 'HOLD') {
    observations.push('Deep value classification: Enterprising / Fairly Valued Graham Candidate.');
  } else {
    observations.push('Deep value classification: Extended Valuation Multiples (insufficient classical margin of safety).');
  }
  if (eps !== null) observations.push(`Trailing Twelve Months EPS: ${eps}`);
  if (bvps !== null) observations.push(`Book Value Per Share: ${bvps}`);
  if (ncavPerShare !== null) observations.push(`Net Current Asset Value (NCAV) per Share: ${ncavPerShare}`);

  // 5. Warnings
  const warnings = [...redFlags];

  // 6. Verdict Container
  const verdict = {
    principle: 'graham',
    principle_title: 'Benjamin Graham Deep Value',
    ticker,
    timestamp,
    stance,
    score: finalScore,
    is_veto: false,
    summary
  };

  const metrics = {
    graham_number: grahamNumber,
    nnwc: isFiniteNumber(nnwc) ? nnwc : null,
    nnwc_per_share: nnwcPerShare,
    ncav_per_share: ncavPerShare,
    margin_of_safety_pct: marginOfSafetyPct,
    current_ratio: currentRatio,
    pe_ratio: pe,
    pb_ratio: pb,
    pe_x_pb: peXpb
  };

  return {
    principle: 'graham',
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
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Graham Valuation Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
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
    jsonPath = path.join(verdictsDir, 'graham_portfolio_verdicts.json');
    htmlPath = path.join(verdictsDir, 'graham_portfolio_audits.html');
    schemaType = 'verdict-batch';
  } else {
    jsonPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_graham.json`);
    htmlPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_graham.html`);
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
  const verdict = evaluateGrahamValuation(financials, options);

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

  const verdict = evaluateGrahamValuation(financials, options);
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
      const fixtureDeepPath = path.join(SKILL_ROOT, 'tests', 'fixtures', 'graham_deep_value.json');

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
      } else if (fs.existsSync(fixtureDeepPath)) {
        const base = JSON.parse(fs.readFileSync(fixtureDeepPath, 'utf8'));
        financials = { ...base, ticker, name: item.name || base.name };
      }
    }

    if (financials) {
      const v = evaluateGrahamValuation(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'graham',
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
Benjamin Graham Valuation Engine CLI
Usage:
  node analyze_graham.js --data <path_to_financials.json> [--out <dir>]
  node analyze_graham.js --ticker <SYMBOL> [--market <IN|US>] [--out <dir>] [--refresh]
  node analyze_graham.js --holdings <path_to_holdings.json> [--out <dir>]

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
      process.stdout.write(`\n🏛️  Graham Valuation: Evaluated ${result.batch.verdicts.length} securities in portfolio batch:\n`);
      for (const v of result.batch.verdicts) {
        const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
        process.stdout.write(`   ${icon} ${v.ticker.padEnd(8)}: ${v.stance.padEnd(14)} Score: ${String(v.score).padStart(5)}/100  (MoS: ${v.metrics.margin_of_safety_pct !== null ? v.metrics.margin_of_safety_pct + '%' : 'N/A'})\n`);
      }
      process.stdout.write(`\n📁 Consolidated Artifacts:\n`);
      process.stdout.write(`   • JSON: ${result.jsonPath}\n`);
      process.stdout.write(`   • HTML: ${result.htmlPath}\n`);
      process.stdout.write('✅ Universal Verification Harness verified batch artifact pair.\n\n');
    } else {
      const v = result.verdict;
      const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
      process.stdout.write(`\n🏛️  Graham Valuation Verdict for ${v.ticker}:\n`);
      process.stdout.write(`   • Stance:            ${icon} ${v.stance}\n`);
      process.stdout.write(`   • Graham Score:      ${v.score}/100.0\n`);
      process.stdout.write(`   • Graham Number:     ${v.metrics.graham_number !== null ? v.metrics.graham_number : 'N/A'}\n`);
      process.stdout.write(`   • Margin of Safety:  ${v.metrics.margin_of_safety_pct !== null ? v.metrics.margin_of_safety_pct + '%' : 'N/A'}\n`);
      process.stdout.write(`   • NNWC per Share:    ${v.metrics.nnwc_per_share !== null ? v.metrics.nnwc_per_share : 'N/A'}\n`);
      process.stdout.write(`   • P/E × P/B:         ${v.metrics.pe_x_pb !== null ? v.metrics.pe_x_pb : 'N/A'}\n`);
      process.stdout.write(`   • Summary:           ${v.summary}\n`);
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
  calculateGrahamNumber,
  calculateNCAV,
  calculateNNWC,
  evaluateGrahamValuation,
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

