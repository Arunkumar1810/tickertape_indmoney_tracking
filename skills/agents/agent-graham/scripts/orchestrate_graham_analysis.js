#!/usr/bin/env node
'use strict';

/**
 * orchestrate_graham_analysis.js:
 * Benjamin Graham Value Investing Advisor & Deep Value Engine.
 *
 * Evaluates securities across 4 quantitative Graham pillars:
 * 1. Net-Net Working Capital (NNWC) & Liquidation Floor (principle-net-net-working-capital) [35 pts]
 * 2. Defensive Investor Criteria (principle-defensive-criteria) [25 pts]
 * 3. Margin of Safety & Multiples Discipline (Graham Number & P/E × P/B) [25 pts]
 * 4. Circle of Competence & Conservative Allocation (principle-circle-of-competence) [15 pts]
 * alongside portfolio cash till discipline and conservative position sizing.
 *
 * Emits Dean of Wall Street wisdom, canonical UniformVerdictContract reports
 * (principle: "graham"), and self-contained offline HTML audit dashboards.
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'graham-template.html');

// Framework validators & liquidity helpers
const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
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
const { evaluateNetNet } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-net-net-working-capital', 'scripts', 'evaluate_net_net'));
const { evaluateDefensiveCriteria } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-defensive-criteria', 'scripts', 'evaluate_defensive'));
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

function calculateGrahamNumber(eps, bvps) {
  if (!isFiniteNumber(eps) || !isFiniteNumber(bvps) || eps <= 0 || bvps <= 0) {
    return null;
  }
  return round2(Math.sqrt(22.5 * eps * bvps));
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
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else if (!k.startsWith('--') && !args.ticker) args.ticker = k.toUpperCase();
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

/**
 * Pure quantitative Graham valuation evaluator across 4 pillars.
 */
function evaluateGrahamValuation(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateGrahamValuation requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const timestamp = options.timestamp || new Date().toISOString();

  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    return {
      principle: 'graham',
      ticker,
      timestamp,
      score: 100,
      stance: 'HOLD',
      is_veto: false,
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
      summary: `Index ETF passive basket (${ticker}): Single-equity Graham liquidation floors and valuation multiple hurdles bypassed. Diversification provides inherent downside protection.`,
      verdict: {
        principle: 'graham',
        principle_title: 'Benjamin Graham Deep Value & Defensive Investment',
        ticker,
        timestamp,
        stance: 'HOLD',
        score: 100,
        is_veto: false,
        summary: `Index ETF passive basket (${ticker}): Broad market asset diversification eliminates single-security liquidation risk.`
      },
      audit: [
        {
          check: 'Broad-Market Diversification',
          criterion: 'Passive Index Basket',
          value: 'Full Basket',
          status: 'PASS',
          score: 100,
          max_score: 100,
          details: 'Passive ETF automatically diversifies across constituent holdings'
        }
      ],
      positive: [
        'Broad market index diversification eliminates single-company insolvency risk.',
        'Passive asset allocation conforms to Graham defensive investor asset-preservation principles.'
      ],
      negative: [],
      observations: [
        'Passive index fund is evaluated on asset diversification rather than individual balance sheet liquidation.'
      ]
    };
  }

  // 1. Decoupled Principle Micro-Engines
  const netNetEval = evaluateNetNet(financials);
  const defensiveEval = evaluateDefensiveCriteria(financials);

  // Market & accounting data extraction
  const mkt = financials.market_data || {};
  const inc = financials.income_statement || {};
  const bal = financials.balance_sheet || {};
  const val = financials.valuation || {};

  const cmp = isFiniteNumber(mkt.cmp) ? Number(mkt.cmp) : (isFiniteNumber(val.cmp) ? Number(val.cmp) : null);
  const eps = isFiniteNumber(mkt.eps_ttm)
    ? Number(mkt.eps_ttm)
    : (isFiniteNumber(inc.eps) ? Number(inc.eps) : (isFiniteNumber(val.eps) ? Number(val.eps) : null));
  const bvps = isFiniteNumber(mkt.bvps)
    ? Number(mkt.bvps)
    : (isFiniteNumber(bal.book_value_per_share) ? Number(bal.book_value_per_share) : (isFiniteNumber(val.bvps) ? Number(val.bvps) : null));
  const pe = isFiniteNumber(mkt.pe_ttm)
    ? Number(mkt.pe_ttm)
    : (isFiniteNumber(val.pe_ratio) ? Number(val.pe_ratio) : (isFiniteNumber(val.pe) ? Number(val.pe) : null));
  const pb = isFiniteNumber(mkt.pb_ttm)
    ? Number(mkt.pb_ttm)
    : (isFiniteNumber(val.pb_ratio) ? Number(val.pb_ratio) : (isFiniteNumber(val.pb) ? Number(val.pb) : null));
  const peXpb = (pe !== null && pe > 0 && pb !== null && pb > 0) ? round2(pe * pb) : null;

  const currentAssets = isFiniteNumber(bal.current_assets)
    ? Number(bal.current_assets)
    : (isFiniteNumber(bal.total_current_assets) ? Number(bal.total_current_assets) : 0);
  const currentLiab = isFiniteNumber(bal.current_liabilities)
    ? Number(bal.current_liabilities)
    : (isFiniteNumber(bal.total_current_liabilities) ? Number(bal.total_current_liabilities) : 0);
  const currentRatio = currentLiab > 0 ? round2(currentAssets / currentLiab) : null;

  // Pillar 3: Margin of Safety & Graham Number (max 25 pts)
  const grahamNumber = calculateGrahamNumber(eps, bvps);
  let marginOfSafetyPct = null;
  if (grahamNumber !== null && cmp !== null && cmp > 0) {
    marginOfSafetyPct = round2(((grahamNumber - cmp) / grahamNumber) * 100);
  }

  let p3Score = 0;
  // Sub-check A: Margin of Safety vs Graham Number (15 pts)
  if (marginOfSafetyPct !== null) {
    if (marginOfSafetyPct >= 30.0) p3Score += 15;
    else if (marginOfSafetyPct >= 10.0) p3Score += 12;
    else if (marginOfSafetyPct >= -10.0) p3Score += 8;
    else if (marginOfSafetyPct >= -30.0) p3Score += 4;
    else p3Score += 0;
  }

  // Sub-check B: Multiples Ceiling (10 pts)
  if (peXpb !== null) {
    if ((pe <= 15.0 && pb <= 1.5) || peXpb <= 22.5) p3Score += 10;
    else if (peXpb <= 35.0) p3Score += 6;
    else if (peXpb <= 50.0) p3Score += 3;
    else p3Score += 0;
  } else if (pe !== null && pe <= 15.0) {
    p3Score += 5;
  }

  // Pillar 4: Circle of Competence (max 15 pts)
  const compEval = evaluateCircleOfCompetence(ticker);
  const p4Score = round2((compEval.score / 100) * 15);

  // Pillar 1 & 2 weighted scores
  const p1Score = round2((netNetEval.score / 100) * 35);
  const p2Score = round2((defensiveEval.score / 100) * 25);

  let totalScore = round2(p1Score + p2Score + p3Score + p4Score);

  // Net-Net Special Condition Bonus:
  // If stock trades below NNWC per share, guarantee at least 90 pts!
  const isNetNetBargain = Boolean(
    netNetEval.metrics &&
    netNetEval.metrics.nnwc_per_share !== null &&
    cmp !== null &&
    cmp > 0 &&
    cmp <= netNetEval.metrics.nnwc_per_share
  );

  if (isNetNetBargain) {
    totalScore = Math.max(totalScore, 90);
  }
  totalScore = Math.max(0, Math.min(totalScore, 100));

  let stance;
  if (totalScore >= 75) stance = 'STRONG_BUY';
  else if (totalScore >= 60) stance = 'BUY';
  else if (totalScore >= 45) stance = 'HOLD';
  else if (totalScore >= 30) stance = 'REDUCE';
  else stance = 'STRONG_SELL';

  const redFlags = [];
  if (marginOfSafetyPct !== null && marginOfSafetyPct < -20) {
    redFlags.push(`Negative margin of safety: CMP trades ${round2(Math.abs(marginOfSafetyPct))}% above Graham Number floor (${grahamNumber})`);
  }
  if (peXpb !== null && peXpb > 22.5) {
    redFlags.push(`Multiples stretch: P/E × P/B (${peXpb}) exceeds Graham defensive standard (22.5)`);
  }
  if (currentRatio !== null && currentRatio < 1.5) {
    redFlags.push(`Working capital deficit: Current ratio (${currentRatio}) is below Graham 1.5 defensive threshold`);
  }
  if (netNetEval.status === 'FAIL') {
    redFlags.push('Trading substantially above liquidating asset backing (NCAV/NNWC deficit)');
  }
  if (isNetNetBargain) {
    redFlags.unshift(`🌟 GRAHAM NET-NET BARGAIN: CMP (${cmp}) trades below Net-Net Working Capital per share (${netNetEval.metrics.nnwc_per_share})`);
  }

  const audit = [
    {
      check: 'Net-Net & Liquidation Floor',
      criterion: 'Discount to NCAV and Net-Net Working Capital (NNWC)',
      value: netNetEval.metrics ? `NCAV/sh: ${netNetEval.metrics.ncav_per_share || 'N/A'}` : 'N/A',
      status: netNetEval.status,
      score: p1Score,
      max_score: 35,
      details: netNetEval.summary
    },
    {
      check: 'Defensive Investor Criteria',
      criterion: '7 Graham tests: Size, liquidity, debt cover, earnings & dividend continuity',
      value: `Passed ${defensiveEval.checks_passed || 0}/${defensiveEval.total_checks || 7}`,
      status: defensiveEval.status,
      score: p2Score,
      max_score: 25,
      details: defensiveEval.summary
    },
    {
      check: 'Margin of Safety & Graham Number',
      criterion: 'Graham Number floor sqrt(22.5*EPS*BVPS) and P/E × P/B ≤ 22.5',
      value: grahamNumber !== null ? `Floor: ${grahamNumber} (MOS: ${marginOfSafetyPct || 0}%)` : 'N/A',
      status: (marginOfSafetyPct !== null && marginOfSafetyPct >= 10.0) ? 'PASS' : ((marginOfSafetyPct !== null && marginOfSafetyPct >= -10.0) ? 'HOLD' : 'WARN'),
      score: p3Score,
      max_score: 25,
      details: grahamNumber !== null ? `Graham Number: ${grahamNumber}, P/E × P/B: ${peXpb || 'N/A'}` : 'Negative EPS or BVPS precludes Graham Number calculation'
    },
    {
      check: 'Circle of Competence & Margin Allocation',
      criterion: 'Comprehension of business fundamentals, balance sheet simplicity, and unit economics',
      value: `Score: ${compEval.score}/100`,
      status: compEval.status === 'IN_CIRCLE' ? 'PASS' : (compEval.status === 'NEEDS_ASSESSMENT' ? 'WARN' : 'FAIL'),
      score: p4Score,
      max_score: 15,
      details: compEval.status === 'IN_CIRCLE' ? 'Enterprise is within circle of competence' : 'Unassessed or outside competence boundary'
    }
  ];

  const positive = [];
  if (isNetNetBargain) {
    positive.push(`Rare Net-Net opportunity: CMP (${cmp}) is below Net-Net Working Capital per share (${netNetEval.metrics.nnwc_per_share}).`);
  }
  if (marginOfSafetyPct !== null && marginOfSafetyPct >= 20.0) {
    positive.push(`Substantial margin of safety: CMP trades at a ${marginOfSafetyPct}% discount to Graham Number floor (${grahamNumber}).`);
  }
  if (peXpb !== null && peXpb <= 22.5) {
    positive.push(`Multiples discipline: P/E × P/B (${peXpb}) satisfies Graham defensive 22.5 limit.`);
  }
  if (currentRatio !== null && currentRatio >= 2.0) {
    positive.push(`Pristine liquidity: Current ratio (${currentRatio}) meets the rigorous 2.0x Graham standard.`);
  }
  if (defensiveEval.status === 'PASS') {
    positive.push('Passed all primary Graham defensive investor stability and dividend criteria.');
  }

  const negative = [...redFlags];

  const observations = [
    netNetEval.summary,
    defensiveEval.summary,
    grahamNumber !== null ? `Graham Number floor: ${grahamNumber}` : 'Graham Number could not be computed (non-positive EPS or BVPS)',
    `Circle of Competence: ${compEval.status} (${compEval.score}/100)`
  ];

  let summary = '';
  if (isNetNetBargain) {
    summary = `STRONG BUY (Graham Net-Net): ${ticker} trades at a rare discount to liquidating working capital (CMP ${cmp} <= NNWC/share ${netNetEval.metrics.nnwc_per_share}). Classical margin of safety verified.`;
  } else if (stance === 'STRONG_BUY' || stance === 'BUY') {
    summary = `${stance} (${totalScore}/100): Classical margin of safety verified. Graham Number floor (${grahamNumber || 'N/A'}) offers ${marginOfSafetyPct || 'N/A'}% buffer. Defensive criteria satisfied.`;
  } else if (stance === 'HOLD') {
    summary = `HOLD (${totalScore}/100): Fair value range. CMP reflects Graham intrinsic bounds. Adequate defensive financial strength maintained.`;
  } else if (stance === 'REDUCE') {
    summary = `REDUCE (${totalScore}/100): Valuation premium exceeds conservative bounds. P/E × P/B or working capital cushion is stretched.`;
  } else {
    summary = `STRONG SELL (${totalScore}/100): Speculative valuation or deficient liquidation asset backing. Fails Graham defensive investment criteria.`;
  }

  return {
    principle: 'graham',
    ticker,
    timestamp,
    score: totalScore,
    stance,
    is_veto: false,
    metrics: {
      graham_number: grahamNumber,
      nnwc: netNetEval.metrics ? netNetEval.metrics.nnwc : null,
      nnwc_per_share: netNetEval.metrics ? netNetEval.metrics.nnwc_per_share : null,
      ncav: netNetEval.metrics ? netNetEval.metrics.ncav : null,
      ncav_per_share: netNetEval.metrics ? netNetEval.metrics.ncav_per_share : null,
      margin_of_safety_pct: marginOfSafetyPct,
      current_ratio: currentRatio,
      pe_ratio: pe,
      pb_ratio: pb,
      pe_x_pb: peXpb,
      net_net_score: netNetEval.score,
      defensive_score: defensiveEval.score,
      competence_score: compEval.score
    },
    red_flags: redFlags,
    summary,
    verdict: {
      principle: 'graham',
      principle_title: 'Benjamin Graham Deep Value & Defensive Investment',
      ticker,
      timestamp,
      stance,
      score: totalScore,
      is_veto: false,
      summary
    },
    audit,
    positive,
    negative,
    observations
  };
}

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

function writeArtifacts(verdictData, outDir = DEFAULT_REPORTS_DIR, isBatch = false) {
  const reportsDir = path.resolve(outDir);
  const verdictsDir = path.join(reportsDir, 'verdicts');
  fs.mkdirSync(verdictsDir, { recursive: true });

  const ticker = (verdictData.ticker || 'PORTFOLIO').toUpperCase();
  const jsonPath = isBatch
    ? path.join(verdictsDir, 'graham_portfolio_verdicts.json')
    : path.join(verdictsDir, `${ticker}_graham.json`);
  const htmlPath = isBatch
    ? path.join(verdictsDir, 'graham_portfolio_audits.html')
    : path.join(verdictsDir, `${ticker}_graham.html`);

  const jsonContent = JSON.stringify(verdictData, null, 2);
  const htmlContent = renderHtml(verdictData);

  fs.writeFileSync(jsonPath, jsonContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  const harnessResult = verifyArtifactPair({
    jsonPath,
    htmlPath,
    schemaType: isBatch ? 'verdict-batch' : 'verdict'
  });

  if (!harnessResult.ok) {
    throw new Error(`Artifact verification failed for ${jsonPath}: ${JSON.stringify(harnessResult.errors)}`);
  }

  return { jsonPath, htmlPath, harnessResult };
}

/**
 * High-level Benjamin Graham advisory workflow.
 * Analyzes stock fundamentals, enforces Circle of Competence & portfolio cash till gating,
 * and emits actionable advisory recommendations.
 */
async function analyzeStockWithGraham(ticker, options = {}) {
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

  // 2. Evaluate Pure Quantitative Graham Valuation
  const verdictResult = evaluateGrahamValuation(financials, options);
  const compositeScore = verdictResult.score;

  // 3. Portfolio & Liquidity Cash Till Gating
  const portfolioPath = options.portfolio ? path.resolve(options.portfolio) : DEFAULT_PORTFOLIO_PATH;
  let portfolioKnown = false;
  let isHeld = false;
  let currentWeightPct = 0.0;
  let liquidCash = { total_liquid_cash: 0.0, broker_cash: 0.0, bank_balance: 0.0 };
  let availableCash = 0.0;

  if (!options.noPortfolio) {
    try {
      liquidCash = getLiquidCashSummary();
      availableCash = Number(liquidCash.total_liquid_cash || 0.0);
    } catch {
      availableCash = 0.0;
    }

    if (fs.existsSync(portfolioPath)) {
      try {
        const rawPortfolio = fs.readFileSync(portfolioPath, 'utf8');
        const portfolioData = JSON.parse(rawPortfolio);
        const holdings = Array.isArray(portfolioData.holdings) ? portfolioData.holdings : [];
        portfolioKnown = true;

        const match = holdings.find(h => (h.ticker || h.symbol || '').toUpperCase() === clean);
        if (match) {
          isHeld = true;
          currentWeightPct = match.weight_pct || 0.0;
        }
      } catch {
        portfolioKnown = false;
      }
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
    portfolioWarnings.push(`CIRCLE OF COMPETENCE UNASSESSED: You have not evaluated Benjamin Graham's fundamental understanding questionnaire for ${clean}. Defensive principles urge caution.`);
  } else if (competenceStatus === 'OUTSIDE_CIRCLE') {
    portfolioWarnings.push(`OUTSIDE CIRCLE OF COMPETENCE: Comprehension score ${competenceScore}/100 indicates high enterprise ambiguity. Position capped at HOLD.`);
  }

  if (!portfolioKnown) {
    if (compositeScore >= 75) {
      call = 'HOLD';
      callReason = 'Strong quantitative margin of safety and defensive strength, but BUY is strictly gated until portfolio holdings and cash till are verified via fetch-all.';
      portfolioWarnings.push('PORTFOLIO UNKNOWN: Benjamin Graham requires verification of liquidity till balance before committing capital. Run fetch-all.');
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = 'Fairly valued enterprise within conservative bounds. Hold position pending portfolio review.';
    } else {
      call = 'AVOID';
      callReason = 'Speculative valuation or inadequate liquidation asset backing. Steer clear.';
    }
  } else {
    const MAX_CONCENTRATION_PCT = Math.min(15.0, competenceMaxWeight);
    const MIN_CASH_REQUIRED = 500.0;

    if (compositeScore >= 75) {
      if (competenceStatus === 'NEEDS_ASSESSMENT' || competenceStatus === 'OUTSIDE_CIRCLE') {
        call = 'HOLD';
        callReason = `High defensive quality (${compositeScore}/100), but currently outside your evaluated circle of competence. “Know what you own, and know why you own it.” Complete the questionnaire first.`;
      } else if (currentWeightPct >= MAX_CONCENTRATION_PCT) {
        call = 'HOLD';
        callReason = `Sound defensive investment (${compositeScore}/100), but position already sits at ${currentWeightPct.toFixed(1)}% (exceeds ${MAX_CONCENTRATION_PCT}% ceiling). Conservative diversification limits further exposure.`;
        portfolioWarnings.push(`Concentration ceiling reached: Current weight is ${currentWeightPct.toFixed(1)}% (max ${MAX_CONCENTRATION_PCT}%).`);
      } else if (availableCash < MIN_CASH_REQUIRED) {
        call = 'HOLD';
        callReason = `Compelling quantitative margin of safety (${compositeScore}/100), but cash reserves are inadequate (${availableCash.toFixed(2)}). Never borrow or stretch liquidity.`;
        portfolioWarnings.push(`Insufficient cash till: Available cash is ${availableCash.toFixed(2)}.`);
      } else {
        call = 'BUY';
        callReason = `Exceptional quantitative margin of safety verified (${compositeScore}/100). Robust balance sheet liquidity, conservative multiples, and ample till reserves.`;
      }
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = isHeld
        ? `Enterprising / fairly valued candidate (${compositeScore}/100). Maintain current ${currentWeightPct.toFixed(1)}% allocation while watching for Mr. Market discount.`
        : `Adequate enterprise (${compositeScore}/100), but margin of safety is insufficient to warrant fresh capital commitment. Place on watchlist.`;
    } else {
      if (isHeld) {
        call = 'SELL';
        callReason = `Margin of safety severely breached (${compositeScore}/100). Deteriorating working capital or speculative valuation multiple expansion. Liquidate to protect principal.`;
      } else {
        call = 'AVOID';
        callReason = `Speculative valuation multiple or deficient asset backing (${compositeScore}/100). Fails Benjamin Graham defensive investment standards.`;
      }
    }
  }

  const companyName = financials.name || financials.ticker || clean;
  let folksyVerdict = '';

  if (isIndexEtf) {
    folksyVerdict = `“By investing in a broad cross-section of American enterprise, the defensive investor achieves sound results with minimal effort.” ${clean} eliminates individual business hazards. Continue holding.`;
  } else if (call === 'BUY') {
    folksyVerdict = `“To buy a dollar of assets for 50 cents is the foundation of true investment.” ${companyName} offers an unmistakable quantitative margin of safety, fortified by a solvent balance sheet. Mr. Market is presenting us with a sensible bargain. We buy for the long pull.`;
  } else if (call === 'HOLD') {
    if (portfolioKnown && currentWeightPct >= 15.0) {
      folksyVerdict = `“Diversification is an established tenet of conservative investment.” You already hold an ample allocation in ${companyName} (${currentWeightPct.toFixed(1)}%). Prudence demands that we do not over-concentrate, no matter how attractive the issue appears.`;
    } else if (portfolioKnown && availableCash < 500) {
      folksyVerdict = `“Never buy on borrowed money or allow your cash reserves to run dry.” We respect ${companyName}'s financial condition, but our till requires replenishment. We stand aside until liquidity is restored.`;
    } else if (!portfolioKnown) {
      folksyVerdict = `“An investment operation is one which, upon thorough analysis, promises safety of principal and an adequate return.” I see ${companyName}'s balance sheet, but our portfolio ledger remains unverified. Run fetch-all so we can inspect our till.`;
    } else {
      folksyVerdict = `“The market is a voting machine in the short run, but a weighing machine in the long run.” ${companyName} trades near fair intrinsic value. The defensive investor does not chase fair prices; we wait patiently for Mr. Market's next emotional sell-off.`;
    }
  } else if (call === 'SELL') {
    folksyVerdict = `“You are neither right nor wrong because the crowd disagrees with you. You are right because your data and reasoning are right.” The arithmetic on ${companyName} reveals that the margin of safety has vanished. Sell the shares and preserve your principal.`;
  } else {
    folksyVerdict = `“Speculation is neither illegal, immoral, nor fattening to the pocketbook.” ${companyName} requires projecting optimistic futures rather than counting existing tangible assets. The defensive investor leaves this to others.`;
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

module.exports = {
  evaluateGrahamValuation,
  analyzeStockWithGraham,
  processHoldings,
  parseArgs,
  calculateGrahamNumber
};

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (!args.ticker && !args.data && !args.holdings) {
        console.log('Usage: node orchestrate_graham_analysis.js [--ticker <SYMBOL> | --holdings <PATH>] [--market IN|US]');
        process.exit(1);
      }

      if (args.holdings) {
        const batchRes = await processHoldings(args.holdings, { outDir: args.out });
        if (args.jsonOutput) {
          console.log(JSON.stringify(batchRes, null, 2));
        } else {
          console.log(`\n===============================================================`);
          console.log(`  BENJAMIN GRAHAM PORTFOLIO AUDIT MATRIX (${batchRes.batch.verdicts.length} Holdings)`);
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

      const res = await analyzeStockWithGraham(args.ticker, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`\n===============================================================`);
        console.log(`  BENJAMIN GRAHAM VALUE INVESTING REPORT: ${res.ticker} (${res.market})`);
        console.log(`===============================================================`);
        console.log(`Actionable Call : ${res.call}`);
        console.log(`Composite Score : ${res.composite_score}/100`);
        console.log(`Reason          : ${res.call_reason}\n`);
        console.log(`Dean of Wall Street Verdict:\n  ${res.folksy_verdict}\n`);
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
