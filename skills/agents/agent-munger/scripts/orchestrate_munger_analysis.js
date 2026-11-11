#!/usr/bin/env node
'use strict';

/**
 * orchestrate_munger_analysis.js:
 * Charlie Munger Value Investing Advisor & Inversion Engine.
 *
 * Performs disciplined quantitative analysis across 4 pillars:
 * 1. Inversion & Terminal Failure Modes (principle-inversion-failure)
 * 2. Economic Moats & Pricing Power (principle-economic-moat)
 * 3. Incentive Alignment & Governance (principle-incentive-bias)
 * 4. Quality at a Fair Price (principle-quality-at-fair-price)
 * alongside Circle of Competence gating and portfolio cash till discipline.
 *
 * Emits Pasadena/Omaha wisdom, canonical UniformVerdictContract reports
 * (principle: "munger"), and self-contained offline HTML audit dashboards.
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'munger-template.html');

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
const { evaluateMoat } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-economic-moat', 'scripts', 'evaluate_moat'));
const { evaluateInversionFailure } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-inversion-failure', 'scripts', 'evaluate_inversion'));
const { evaluateIncentiveBias } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-incentive-bias', 'scripts', 'evaluate_incentives'));
const { evaluateQualityAtFairPrice } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-quality-at-fair-price', 'scripts', 'evaluate_quality'));
const { evaluateCircleOfCompetence } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-circle-of-competence', 'scripts', 'evaluate_competence'));

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
    jsonOutput: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error(`Missing value for ${k}`);
      }
      return argv[++i];
    };

    if (k === '--ticker') args.ticker = next().toUpperCase();
    else if (k === '--market') args.market = next().toUpperCase();
    else if (k === '--data') args.data = next();
    else if (k === '--holdings') args.holdings = next();
    else if (k === '--portfolio') args.portfolio = next();
    else if (k === '--no-portfolio') args.noPortfolio = true;
    else if (k === '--out') args.out = next();
    else if (k === '--refresh') args.refresh = true;
    else if (k === '--diagnostics') args.diagnostics = true;
    else if (k === '--record-verdict') args.recordVerdict = next();
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else if (!k.startsWith('--') && !args.ticker) args.ticker = k.toUpperCase();
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

/**
 * Evaluates Charlie Munger Valuation across 4 pillars.
 */
function evaluateMungerValuation(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateMungerValuation requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const timestamp = new Date().toISOString();

  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'munger',
      ticker,
      timestamp,
      score: 100,
      stance: 'HOLD',
      is_veto: false,
      metrics: {
        roic_pct: null,
        debt_to_equity: 0,
        sbc_dilution_pct: 0,
        pe_ratio: null
      },
      red_flags: [],
      summary: `HOLD (Index ETF Passive Compounding Basket): Broad-market index fund (${ticker}) diversifies away single-company failure modes.`,
      verdict: {
        principle: 'munger',
        principle_title: 'Charlie Munger Value Investing & Inversion',
        ticker,
        timestamp,
        stance: 'HOLD',
        score: 100,
        is_veto: false,
        summary: `HOLD (Index ETF Passive Compounding Basket): Diversification eliminates company insolvency risk.`
      },
      audit: [
        { check: 'Inversion & Failure Modes', criterion: 'D/E ≤ 1.2x & FCF > 0', value: 'Diversified Basket', status: 'PASS', score: 35, max_score: 35, details: 'Broad market eliminates single corporate failure modes.' },
        { check: 'Economic Moat & Pricing Power', criterion: 'ROIC ≥ 15.0%', value: 'Market Composite', status: 'PASS', score: 25, max_score: 25, details: 'Passive basket of top commercial enterprises.' },
        { check: 'Incentive Alignment & Governance', criterion: 'Aligned incentives & low dilution', value: 'Fiduciary Vehicle', status: 'PASS', score: 20, max_score: 20, details: 'Statutory index management.' },
        { check: 'Quality at a Fair Price', criterion: 'High quality business at fair multiple', value: 'Market Multiple', status: 'PASS', score: 20, max_score: 20, details: 'Market-cap weighted compounding.' }
      ],
      positive: ['Passive broad-market index eliminates single-stock failure modes.'],
      negative: [],
      observations: ['Index ETF passive compounding basket.']
    };
  }

  // Evaluate principles
  const inversionEval = evaluateInversionFailure(financials);
  const moatEval = evaluateMoat(financials);
  const incentiveEval = evaluateIncentiveBias(financials);
  const qualityEval = evaluateQualityAtFairPrice(financials);

  // Pillar 1: Inversion Failure Modes (35 pts)
  const p1Score = round2((inversionEval.score / 100) * 35);
  // Pillar 2: Economic Moat (25 pts)
  const p2Score = round2((moatEval.score / 100) * 25);
  // Pillar 3: Incentive Alignment (20 pts)
  const p3Score = round2((incentiveEval.score / 100) * 20);
  // Pillar 4: Quality at Fair Price (20 pts)
  const p4Score = round2((qualityEval.score / 100) * 20);

  const totalScore = Math.min(100, Math.round(p1Score + p2Score + p3Score + p4Score));

  let stance = 'HOLD';
  if (totalScore >= 75) stance = 'STRONG_BUY';
  else if (totalScore >= 60) stance = 'BUY';
  else if (totalScore >= 45) stance = 'HOLD';
  else if (totalScore >= 30) stance = 'REDUCE';
  else stance = 'STRONG_SELL';

  const redFlags = [];
  if (inversionEval.failure_modes) redFlags.push(...inversionEval.failure_modes);
  if (incentiveEval.incentive_flags) redFlags.push(...incentiveEval.incentive_flags);

  const audit = [
    {
      check: 'Inversion & Failure Modes',
      criterion: 'Solvent balance sheet, healthy interest cover & positive FCF',
      value: `Score: ${inversionEval.score}/100`,
      status: inversionEval.status,
      score: p1Score,
      max_score: 35,
      details: inversionEval.summary
    },
    {
      check: 'Economic Moat & Pricing Power',
      criterion: 'ROIC ≥ 15.0% (Wide Moat ≥ 20.0%) with durable pricing power',
      value: moatEval.metrics ? `ROIC: ${moatEval.metrics.roic_pct}%` : 'N/A',
      status: moatEval.status,
      score: p2Score,
      max_score: 25,
      details: moatEval.summary
    },
    {
      check: 'Incentive Alignment & Governance',
      criterion: 'SBC dilution ≤ 15.0% & modest goodwill asset burden',
      value: incentiveEval.metrics ? `SBC: ${incentiveEval.metrics.sbc_dilution_pct}%` : 'N/A',
      status: incentiveEval.status,
      score: p3Score,
      max_score: 20,
      details: incentiveEval.summary
    },
    {
      check: 'Quality at a Fair Price',
      criterion: 'Rejects cigar-butt cheapness; requires high ROIC at fair multiples',
      value: `Score: ${qualityEval.score}/100`,
      status: qualityEval.status,
      score: p4Score,
      max_score: 20,
      details: qualityEval.summary
    }
  ];

  return {
    principle: 'munger',
    ticker,
    timestamp,
    score: totalScore,
    stance,
    is_veto: false,
    metrics: {
      inversion_score: inversionEval.score,
      moat_score: moatEval.score,
      incentive_score: incentiveEval.score,
      quality_score: qualityEval.score,
      roic_pct: moatEval.metrics ? moatEval.metrics.roic_pct : null,
      debt_to_equity: inversionEval.metrics ? inversionEval.metrics.debt_to_equity : null,
      sbc_dilution_pct: incentiveEval.metrics ? incentiveEval.metrics.sbc_dilution_pct : null
    },
    red_flags: redFlags,
    summary: `${stance} (${totalScore}/100): ${inversionEval.classification}. ${moatEval.classification}. ${qualityEval.classification}.`,
    verdict: {
      principle: 'munger',
      principle_title: 'Charlie Munger Value Investing & Inversion',
      ticker,
      timestamp,
      stance,
      score: totalScore,
      is_veto: false,
      summary: `${stance} (${totalScore}/100): Inversion & failure mode resilience combined with moat pricing power and aligned incentives.`
    },
    audit,
    positive: [
      `Inversion resilience: ${inversionEval.classification}`,
      `Moat durability: ${moatEval.classification}`,
      `Governance: ${incentiveEval.classification}`
    ],
    negative: redFlags,
    observations: [
      inversionEval.summary,
      moatEval.summary,
      incentiveEval.summary,
      qualityEval.summary
    ]
  };
}

function writeArtifacts(verdictData, outDir = DEFAULT_REPORTS_DIR, isBatch = false) {
  const reportsDir = path.resolve(outDir);
  const verdictsDir = path.join(reportsDir, 'verdicts');
  fs.mkdirSync(verdictsDir, { recursive: true });

  const ticker = (verdictData.ticker || 'PORTFOLIO').toUpperCase();
  const jsonPath = isBatch
    ? path.join(verdictsDir, 'munger_portfolio_verdicts.json')
    : path.join(verdictsDir, `${ticker}_munger.json`);
  const htmlPath = isBatch
    ? path.join(verdictsDir, 'munger_portfolio_audits.html')
    : path.join(verdictsDir, `${ticker}_munger.html`);

  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const jsonString = JSON.stringify(verdictData, null, 2);

  let htmlContent = templateHtml.replace('/*__DATA__*/null', () => jsonString);
  htmlContent = htmlContent.replace('<!--__CACHE_BANNER__-->', '');

  fs.writeFileSync(jsonPath, jsonString, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: 'verdict'
  });

  return { jsonPath, htmlPath };
}

async function resolveMungerFinancials(tickerOrData, options = {}) {
  const clean = typeof tickerOrData === 'string' ? tickerOrData.trim().toUpperCase() : null;
  const outDir = options.out || DEFAULT_REPORTS_DIR;
  const market = inferMarket(clean, options.market);

  if (options.data && fs.existsSync(options.data)) {
    return JSON.parse(fs.readFileSync(options.data, 'utf8'));
  }
  if (options.financials) {
    return options.financials;
  }
  if (clean) {
    const finPath = path.join(FINANCIALS_DIR, `${clean}.json`);
    if (fs.existsSync(finPath) && !options.refresh) {
      return JSON.parse(fs.readFileSync(finPath, 'utf8'));
    } else if (providerTickertape && typeof providerTickertape.fetchAndNormalizeTicker === 'function') {
      return await providerTickertape.fetchAndNormalizeTicker(clean, {
        market,
        refresh: options.refresh,
        out: outDir
      });
    } else if (fs.existsSync(finPath)) {
      return JSON.parse(fs.readFileSync(finPath, 'utf8'));
    }
  }
  throw new Error(`Unable to resolve NormalizedCompanyFinancials for ${clean || 'provided data'}.`);
}

/**
 * Gather Tier 2/3 Principle Diagnostics for Munger Agent Consumption.
 * Emits raw metrics and principle checks without making a closed stock verdict.
 */
async function getMungerDiagnostics(tickerOrData, options = {}) {
  const financials = await resolveMungerFinancials(tickerOrData, options);
  const clean = (financials.ticker || tickerOrData || 'UNKNOWN').toUpperCase();
  const companyName = financials.name || clean;
  const market = inferMarket(clean, options.market);
  const isIndexEtf = Boolean(financials.is_index_etf || INDEX_ETF_TICKERS.has(clean));

  // Principle diagnostics
  const inversionEval = evaluateInversionFailure(financials);
  const moatEval = evaluateMoat(financials);
  const incentiveEval = evaluateIncentiveBias(financials);
  const qualityEval = evaluateQualityAtFairPrice(financials);

  // Portfolio checks
  let portfolio = null;
  let portfolioKnown = false;
  const portfolioPath = options.portfolio || DEFAULT_PORTFOLIO_PATH;
  if (!options.noPortfolio && fs.existsSync(portfolioPath)) {
    try {
      portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
      portfolioKnown = Boolean(portfolio && Array.isArray(portfolio.holdings));
    } catch {
      portfolio = null;
      portfolioKnown = false;
    }
  }

  const liquidCash = getLiquidCashSummary(portfolio, options.bankBalancePath);
  let availableCash = liquidCash.total_liquid_cash;
  let currentWeightPct = 0.0;
  let isHeld = false;

  if (portfolioKnown) {
    const match = (portfolio.holdings || []).find(h => (h.ticker || '').toUpperCase() === clean);
    if (match) {
      isHeld = true;
      currentWeightPct = match.weight_pct || 0.0;
    }
  }

  const competenceEval = isIndexEtf
    ? { in_circle: true, status: 'IN_CIRCLE', max_position_weight_pct: 15.0, score: 100 }
    : evaluateCircleOfCompetence(clean);
  const competenceStatus = competenceEval.status || 'NEEDS_ASSESSMENT';
  const competenceScore = competenceEval.score || 0;
  const competenceMaxWeight = competenceEval.max_position_weight_pct !== undefined ? competenceEval.max_position_weight_pct : 15.0;

  const portfolioWarnings = [];
  if (!portfolioKnown) {
    portfolioWarnings.push('PORTFOLIO UNKNOWN: Charlie Munger refuses to commit capital blind without inspecting portfolio till balance. Run fetch-all.');
  } else {
    if (availableCash < 500) {
      portfolioWarnings.push(`Insufficient cash till: Available cash is ₹${Number(availableCash || 0).toFixed(2)} (< ₹500 minimum).`);
    }
    if (currentWeightPct >= 15.0) {
      portfolioWarnings.push(`Concentration limit reached: Current weight is ${currentWeightPct.toFixed(1)}% (max 15.0%).`);
    }
  }

  return {
    ticker: clean,
    company_name: companyName,
    market,
    currency: financials.currency || (market === 'US' ? 'USD' : 'INR'),
    sector: financials.sector || 'Unknown',
    industry: financials.industry || 'Unknown',
    is_index_etf: isIndexEtf,
    portfolio_status: {
      portfolio_known: portfolioKnown,
      is_held: isHeld,
      current_weight_pct: currentWeightPct,
      broker_cash: round2(liquidCash.broker_cash),
      bank_balance: round2(liquidCash.bank_balance),
      total_liquid_cash: round2(availableCash),
      available_cash: round2(availableCash),
      min_cash_required: 500.0,
      cash_till_dry: portfolioKnown ? (availableCash < 500.0) : true,
      concentration_limit_breached: currentWeightPct >= 15.0,
      circle_of_competence: {
        status: competenceStatus,
        score: competenceScore,
        max_position_weight_pct: competenceMaxWeight
      },
      warnings: portfolioWarnings
    },
    principles: [
      {
        principle_id: 'inversion-failure',
        name: 'Inversion & Failure Mode Analysis',
        metrics: inversionEval.metrics || {},
        checks: [
          {
            name: 'Inversion & Failure Modes',
            criterion: 'Solvent balance sheet, healthy interest cover & positive FCF',
            actual: `D/E: ${inversionEval.metrics ? inversionEval.metrics.debt_to_equity + 'x' : 'N/A'}, FCF: ${inversionEval.metrics ? inversionEval.metrics.free_cash_flow : 'N/A'}`,
            status: inversionEval.status,
            details: (inversionEval.failure_modes && inversionEval.failure_modes.length > 0) ? inversionEval.failure_modes.join('; ') : inversionEval.summary
          }
        ],
        observations: inversionEval.failure_modes || []
      },
      {
        principle_id: 'economic-moat',
        name: 'Economic Moat & Pricing Power',
        metrics: moatEval.metrics || {},
        checks: moatEval.checks || [
          {
            name: 'Economic Moat & ROIC Hurdle',
            criterion: 'ROIC >= 15.0% (Wide Moat >= 20.0%)',
            actual: moatEval.metrics ? `${moatEval.metrics.roic_pct}%` : 'N/A',
            status: moatEval.status,
            details: moatEval.summary
          }
        ],
        observations: moatEval.observations || []
      },
      {
        principle_id: 'incentive-bias',
        name: 'Incentive Alignment & Governance',
        metrics: incentiveEval.metrics || {},
        checks: [
          {
            name: 'Executive Compensation & Dilution Drag',
            criterion: 'SBC dilution <= 15.0% & modest goodwill asset burden',
            actual: incentiveEval.metrics ? `SBC: ${incentiveEval.metrics.sbc_dilution_pct}%` : 'N/A',
            status: incentiveEval.status,
            details: (incentiveEval.incentive_flags && incentiveEval.incentive_flags.length > 0) ? incentiveEval.incentive_flags.join('; ') : incentiveEval.summary
          }
        ],
        observations: incentiveEval.incentive_flags || []
      },
      {
        principle_id: 'quality-at-fair-price',
        name: 'Quality Business at a Fair Price',
        metrics: qualityEval.metrics || {},
        checks: [
          {
            name: 'Quality at a Fair Price',
            criterion: 'Rejects statistical cigar butts; requires high ROIC at fair multiples',
            actual: qualityEval.metrics ? `ROIC: ${qualityEval.metrics.roic_pct}%, P/E: ${qualityEval.metrics.pe_ratio}x` : 'N/A',
            status: qualityEval.status,
            details: qualityEval.summary
          }
        ],
        observations: qualityEval.observations || []
      }
    ]
  };
}

/**
 * Record the Agent's Reasoned Verdict into Canonical UniformVerdictContract Artifacts.
 */
async function recordMungerVerdict(tickerOrData, advisorVerdict, options = {}) {
  const diag = await getMungerDiagnostics(tickerOrData, options);
  const clean = diag.ticker;
  const outDir = options.out || DEFAULT_REPORTS_DIR;
  const timestamp = options.timestamp || new Date().toISOString();

  const stance = advisorVerdict.canonical_stance || advisorVerdict.stance || 'HOLD';
  const score = round2(advisorVerdict.score !== undefined ? advisorVerdict.score : (advisorVerdict.composite_score !== undefined ? advisorVerdict.composite_score : 50.0));
  const call = advisorVerdict.actionable_call || advisorVerdict.call || (stance === 'STRONG_BUY' || stance === 'BUY' ? 'BUY' : (stance === 'STRONG_SELL' || stance === 'REDUCE' ? 'SELL' : 'HOLD'));
  const callReason = advisorVerdict.call_reason || advisorVerdict.reason || 'Reasoned evaluation by Charlie Munger persona.';
  const folksyVerdict = advisorVerdict.folksy_verdict || advisorVerdict.verdict_text || 'Invert, always invert.';
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

  const moatMetrics = (diag.principles.find(p => p.principle_id === 'economic-moat') || {}).metrics || {};
  const inversionMetrics = (diag.principles.find(p => p.principle_id === 'inversion-failure') || {}).metrics || {};
  const incentiveMetrics = (diag.principles.find(p => p.principle_id === 'incentive-bias') || {}).metrics || {};
  const qualityMetrics = (diag.principles.find(p => p.principle_id === 'quality-at-fair-price') || {}).metrics || {};

  const metrics = {
    roic_pct: moatMetrics.roic_pct !== undefined ? moatMetrics.roic_pct : null,
    debt_to_equity: inversionMetrics.debt_to_equity !== undefined ? inversionMetrics.debt_to_equity : null,
    interest_coverage: inversionMetrics.interest_coverage !== undefined ? inversionMetrics.interest_coverage : null,
    sbc_dilution_pct: incentiveMetrics.sbc_dilution_pct !== undefined ? incentiveMetrics.sbc_dilution_pct : null,
    pe_ratio: qualityMetrics.pe_ratio !== undefined ? qualityMetrics.pe_ratio : null
  };

  const verdict = {
    principle: 'munger',
    principle_title: 'Charlie Munger Value Investing & Inversion',
    ticker: clean,
    timestamp,
    stance,
    score,
    is_veto: false,
    summary
  };

  const uniformPayload = {
    principle: 'munger',
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
    ticker: clean,
    company_name: diag.company_name,
    market: diag.market,
    composite_score: score,
    call,
    call_reason: callReason,
    folksy_verdict: folksyVerdict,
    portfolio_status: uniformPayload.portfolio_status,
    verdict: uniformPayload,
    artifacts: {
      json: artifacts ? artifacts.jsonPath : null,
      html: artifacts ? artifacts.htmlPath : null
    }
  };
}

/**
 * Conversational Persona & Advisory Analysis.
 */
async function analyzeStockWithMunger(tickerOrData, options = {}) {
  const clean = typeof tickerOrData === 'string' ? tickerOrData.trim().toUpperCase() : null;
  const outDir = options.out || DEFAULT_REPORTS_DIR;
  const market = inferMarket(clean, options.market);

  let financials = null;
  if (options.data && fs.existsSync(options.data)) {
    financials = JSON.parse(fs.readFileSync(options.data, 'utf8'));
  } else if (clean) {
    const finPath = path.join(FINANCIALS_DIR, `${clean}.json`);
    if (fs.existsSync(finPath) && !options.refresh) {
      financials = JSON.parse(fs.readFileSync(finPath, 'utf8'));
    } else if (providerTickertape && typeof providerTickertape.fetchAndNormalizeTicker === 'function') {
      financials = await providerTickertape.fetchAndNormalizeTicker(clean, {
        market,
        refresh: options.refresh,
        out: outDir
      });
    } else if (fs.existsSync(finPath)) {
      financials = JSON.parse(fs.readFileSync(finPath, 'utf8'));
    }
  }

  if (!financials) {
    throw new Error(`Unable to resolve NormalizedCompanyFinancials for ${clean || 'provided data'}.`);
  }

  const isIndexEtf = Boolean(financials.is_index_etf || INDEX_ETF_TICKERS.has(clean));
  const verdictResult = evaluateMungerValuation(financials);
  const compositeScore = verdictResult.score;

  // Portfolio checks
  let portfolio = null;
  let portfolioKnown = false;
  const portfolioPath = options.portfolio || DEFAULT_PORTFOLIO_PATH;
  if (!options.noPortfolio && fs.existsSync(portfolioPath)) {
    try {
      portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
      portfolioKnown = Boolean(portfolio && Array.isArray(portfolio.holdings));
    } catch {
      portfolio = null;
      portfolioKnown = false;
    }
  }

  const liquidCash = getLiquidCashSummary(portfolio, options.bankBalancePath);
  let availableCash = liquidCash.total_liquid_cash;
  let currentWeightPct = 0.0;
  let isHeld = false;

  if (portfolioKnown) {
    const match = (portfolio.holdings || []).find(h => (h.ticker || '').toUpperCase() === clean);
    if (match) {
      isHeld = true;
      currentWeightPct = match.weight_pct || 0.0;
    }
  }

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
    portfolioWarnings.push(`CIRCLE OF COMPETENCE UNASSESSED: You have not answered Charlie's 5-point business questionnaire for ${clean}. Put it in the 'Too Hard' pile until you do.`);
  } else if (competenceStatus === 'OUTSIDE_CIRCLE') {
    portfolioWarnings.push(`OUTSIDE CIRCLE OF COMPETENCE: Comprehension score ${competenceScore}/100 indicates high ambiguity. Position capped at HOLD/WATCHLIST.`);
  }

  if (!portfolioKnown) {
    if (compositeScore >= 75) {
      call = 'HOLD';
      callReason = 'Strong inversion resilience and moat, but BUY is strictly gated until portfolio holdings and cash till are verified via fetch-all.';
      portfolioWarnings.push('PORTFOLIO UNKNOWN: Charlie Munger refuses to commit capital blind without inspecting portfolio till balance. Run fetch-all.');
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = 'Moderate business quality. Hold position pending portfolio review.';
    } else {
      call = 'AVOID';
      callReason = 'Severe inversion failure modes or misaligned incentives. Steer clear.';
    }
  } else {
    const MAX_CONCENTRATION_PCT = Math.min(15.0, competenceMaxWeight);
    const MIN_CASH_REQUIRED = 500.0;

    if (compositeScore >= 75) {
      if (competenceStatus === 'NEEDS_ASSESSMENT' || competenceStatus === 'OUTSIDE_CIRCLE') {
        call = 'HOLD';
        callReason = `High quality business (${compositeScore}/100), but currently outside your evaluated circle of competence. “The most important thing is knowing what you don't know.” Complete the questionnaire first.`;
      } else if (currentWeightPct >= MAX_CONCENTRATION_PCT) {
        call = 'HOLD';
        callReason = `Wonderful enterprise (${compositeScore}/100), but position already sits at ${currentWeightPct.toFixed(1)}% (exceeds ${MAX_CONCENTRATION_PCT}% ceiling). Sit on your hands.`;
        portfolioWarnings.push(`Concentration limit reached: Current weight is ${currentWeightPct.toFixed(1)}% (max ${MAX_CONCENTRATION_PCT}%).`);
      } else if (availableCash < MIN_CASH_REQUIRED) {
        call = 'HOLD';
        callReason = `High-quality compounding franchise (${compositeScore}/100), but cash reserves are inadequate (${availableCash.toFixed(2)}). Never stretch liquidity.`;
        portfolioWarnings.push(`Insufficient cash till: Available cash is ${availableCash.toFixed(2)}.`);
      } else {
        call = 'BUY';
        callReason = `Passes inversion stress tests with flying colors (${compositeScore}/100). Resilient balance sheet, pristine capital efficiency, and aligned incentives with ample till reserves.`;
      }
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = isHeld
        ? `Decent franchise (${compositeScore}/100), but lacks wide-moat pricing power or faces moderate inversion headwinds. Hold current ${currentWeightPct.toFixed(1)}% position.`
        : `Fair company (${compositeScore}/100), but not compelling enough to displace cash. Leave on watchlist.`;
    } else {
      if (isHeld) {
        call = 'SELL';
        callReason = `Failure modes triggered (${compositeScore}/100). Deteriorating balance sheet, dilutive incentives, or commoditized margins. Cut the loss.`;
      } else {
        call = 'AVOID';
        callReason = `Cigar butt or terminal value trap (${compositeScore}/100). Fails Munger compounding standards.`;
      }
    }
  }

  const companyName = financials.name || financials.ticker || clean;
  let folksyVerdict = '';

  if (isIndexEtf) {
    folksyVerdict = `“The intelligent investor stays with low-cost index funds and lets compounding do the heavy lifting.” ${clean} avoids single-company stupidity. Keep compounding.`;
  } else if (call === 'BUY') {
    folksyVerdict = `“Forget what you know about buying fair businesses at wonderful prices; instead, buy wonderful businesses at fair prices.” ${companyName} has inverted the problem of failure, built an impregnable moat, and your cash till is primed. We swing with conviction.`;
  } else if (call === 'HOLD') {
    if (portfolioKnown && currentWeightPct >= 15.0) {
      folksyVerdict = `“The big money is not in the buying and the selling, but in the waiting.” You already own plenty of ${companyName} (${currentWeightPct.toFixed(1)}%). Sit on your ass and let compounding work.`;
    } else if (portfolioKnown && availableCash < 500) {
      folksyVerdict = `“Someone will always be getting richer faster than you. This is not a tragedy.” We like ${companyName}, but our cash till is dry. Never borrow or overextend. We wait.`;
    } else if (!portfolioKnown) {
      folksyVerdict = `“Acknowledging what you don't know is the dawning of wisdom.” I see ${companyName}'s balance sheet, but I haven't seen our partnership ledger. Run fetch-all so we can inspect our till.`;
    } else {
      folksyVerdict = `“It takes character to sit there with all that cash and do nothing.” ${companyName} is acceptable, but not a fat pitch. We wait.`;
    }
  } else if (call === 'SELL') {
    folksyVerdict = `“If you mix raisins with turds, you've still got turds.” ${companyName} has structural failure modes leaking value. Sell it and put the capital where it compounds safely.`;
  } else {
    folksyVerdict = `“We have three baskets for investing: yes, no, and too tough to understand.” ${companyName} belongs in the 'no' basket. We pass.`;
  }

  verdictResult.advisor_verdict = {
    actionable_call: call,
    call_reason: callReason,
    folksy_verdict: folksyVerdict
  };
  verdictResult.portfolio_status = {
    portfolio_known: portfolioKnown,
    is_held: isHeld,
    current_weight_pct: currentWeightPct,
    broker_cash: round2(liquidCash.broker_cash),
    bank_balance: round2(liquidCash.bank_balance),
    total_liquid_cash: round2(availableCash),
    available_cash: round2(availableCash),
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
    }
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
      } else if (providerTickertape && typeof providerTickertape.fetchAndNormalizeTicker === 'function') {
        try {
          financials = await providerTickertape.fetchAndNormalizeTicker(ticker, {
            market: inferMarket(ticker),
            out: outDir
          });
        } catch {
          financials = null;
        }
      }
    }

    if (financials) {
      const v = evaluateMungerValuation(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'munger',
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

module.exports = {
  evaluateMungerValuation,
  analyzeStockWithMunger,
  getMungerDiagnostics,
  recordMungerVerdict,
  processHoldings,
  parseArgs
};

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (!args.ticker && !args.data && !args.holdings) {
        console.log('Usage: node orchestrate_munger_analysis.js [--ticker <SYMBOL> | --holdings <PATH>] [--market IN|US]');
        process.exit(1);
      }

      if (args.ticker && args.diagnostics) {
        const diag = await getMungerDiagnostics(args.ticker, args);
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
        const res = await recordMungerVerdict(args.ticker, payload, args);
        if (args.jsonOutput) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`\n=== Charlie Munger Reasoned Verdict Recorded: ${res.ticker} ===`);
          console.log(`Stance          : ${res.verdict.stance} | Score: ${res.composite_score}/100`);
          console.log(`Actionable Call : ${res.call}`);
          console.log(`Reason          : ${res.call_reason}`);
          console.log(`Pasadena Verdict: ${res.folksy_verdict}`);
          console.log(`Artifacts written to:\n  ${res.artifacts.json}\n  ${res.artifacts.html}\n`);
        }
        return;
      }

      if (args.holdings) {
        const batchRes = await processHoldings(args.holdings, { outDir: args.out });
        if (args.jsonOutput) {
          console.log(JSON.stringify(batchRes, null, 2));
        } else {
          console.log(`\n===============================================================`);
          console.log(`  CHARLIE MUNGER PORTFOLIO AUDIT MATRIX (${batchRes.batch.verdicts.length} Holdings)`);
          console.log(`===============================================================`);
          batchRes.batch.verdicts.forEach(v => {
            console.log(`  • ${v.ticker.padEnd(12)}: Stance: ${v.stance.padEnd(11)} Score: ${String(v.score).padStart(3)}/100 | ${v.summary}`);
          });
          console.log(`\nArtifacts Written:`);
          console.log(`  JSON : ${batchRes.jsonPath}`);
          console.log(`  HTML : ${batchRes.htmlPath}`);
          console.log(`===============================================================\n`);
        }
        return;
      }

      const res = await analyzeStockWithMunger(args.ticker, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`\n===============================================================`);
        console.log(`  CHARLIE MUNGER VALUE INVESTING REPORT: ${res.ticker} (${res.market})`);
        console.log(`===============================================================`);
        console.log(`Actionable Call : ${res.call}`);
        console.log(`Composite Score : ${res.composite_score}/100`);
        console.log(`Reason          : ${res.call_reason}\n`);
        console.log(`Pasadena Verdict:\n  ${res.folksy_verdict}\n`);
        console.log(`Portfolio Gating & Cash Till:`);
        console.log(`  Known: ${res.portfolio_status.portfolio_known ? 'YES' : 'NO'}`);
        console.log(`  Held: ${res.portfolio_status.is_held ? 'YES (' + res.portfolio_status.current_weight_pct.toFixed(1) + '% weight)' : 'NO'}`);
        console.log(`  Liquid Cash Till: ₹${res.portfolio_status.total_liquid_cash.toLocaleString('en-IN')} (Broker: ₹${res.portfolio_status.broker_cash} | Bank: ₹${res.portfolio_status.bank_balance.toLocaleString('en-IN')})`);
        if (res.portfolio_status.warnings.length > 0) {
          console.log(`  Warnings:`);
          res.portfolio_status.warnings.forEach(w => console.log(`   - ${w}`));
        }
        console.log(`\nCanonical Verdict Artifacts:`);
        console.log(`  JSON : ${res.artifacts.json}`);
        console.log(`  HTML : ${res.artifacts.html}`);
        console.log(`===============================================================\n`);
      }
    } catch (err) {
      console.error('Execution error:', err.message);
      process.exit(1);
    }
  })();
}
