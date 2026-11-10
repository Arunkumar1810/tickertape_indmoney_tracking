#!/usr/bin/env node
'use strict';

/**
 * orchestrate_klarman_analysis.js:
 * Seth Klarman Baupost Downside Stress & Solvency Engine.
 *
 * Evaluates securities across 4 quantitative solvency pillars:
 * 1. Altman Z-Score & Bankruptcy Distress (principle-altman-z-score) [35 pts]
 * 2. Leverage Burden & Net Debt to EBITDA (principle-debt-maturity-wall) [25 pts]
 * 3. Debt Maturity Wall & 24-Month Liquidity Cushion [25 pts]
 * 4. Interest Coverage & Debt Service Buffer [15 pts]
 * alongside Circle of Competence gating and Baupost cash till discipline.
 *
 * Emits Baupost margin of safety wisdom, canonical UniformVerdictContract reports
 * (principle: "klarman_solvency"), and self-contained offline HTML audit dashboards.
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'klarman-template.html');

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
const { evaluateAltmanZ, calculateAltmanZScore } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-altman-z-score', 'scripts', 'evaluate_altman_z'));
const { evaluateDebtWall } = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-debt-maturity-wall', 'scripts', 'evaluate_debt_wall'));
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
    else if (k === '--json-output' || k === '--json') args.jsonOutput = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else if (!k.startsWith('--') && !args.ticker) args.ticker = k.toUpperCase();
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

/**
 * Pure quantitative Seth Klarman downside stress evaluator across 4 pillars.
 */
function evaluateKlarmanSolvency(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateKlarmanSolvency requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  const timestamp = options.timestamp || new Date().toISOString();

  const isIndexEtf = Boolean(
    financials.is_index_etf === true ||
    financials.sector === 'Index ETF' ||
    INDEX_ETF_TICKERS.has(ticker)
  );

  if (isIndexEtf) {
    const etfSummary = `Index ETF passive basket (${ticker}): Single-equity Seth Klarman downside stress and solvency evaluation bypassed. Broad asset diversification eliminates insolvency hazard.`;
    return {
      principle: 'klarman_solvency',
      ticker,
      timestamp,
      score: 100,
      stance: 'HOLD',
      is_veto: false,
      metrics: {
        altman_z_score: null,
        net_debt_to_ebitda: null,
        interest_coverage: null,
        debt_maturing_24m: 0,
        cash_to_debt_maturing_ratio: null,
        accrual_gap: null,
        total_debt: 0,
        cash_and_equivalents: 0,
        net_debt: 0
      },
      red_flags: [],
      summary: etfSummary,
      verdict: {
        principle: 'klarman_solvency',
        principle_title: 'Seth Klarman Downside Solvency & Distress',
        ticker,
        timestamp,
        stance: 'HOLD',
        score: 100,
        is_veto: false,
        summary: etfSummary
      },
      audit: [
        {
          check: 'Broad-Market Index Diversification',
          criterion: 'Passive Index Basket',
          value: 'Full Basket',
          status: 'PASS',
          score: 100,
          max_score: 100,
          details: 'Passive ETF automatically diversifies across constituent corporate balance sheets'
        }
      ],
      positive: [
        'Broad market index diversification eliminates single-company insolvency risk.',
        'Passive asset allocation conforms to Baupost capital preservation standards.'
      ],
      negative: [],
      observations: [
        'Passive index fund is evaluated on broad market risk rather than individual debt service covenants.'
      ]
    };
  }

  // 1. Decoupled Principle Micro-Engines
  const altmanEval = evaluateAltmanZ(financials);
  const debtWallEval = evaluateDebtWall(financials);

  // Accounting and market data extraction
  const bal = financials.balance_sheet || {};
  const inc = financials.income_statement || {};
  const mkt = financials.market_data || {};
  const val = financials.valuation || {};
  const cf = financials.cash_flow || {};

  const totalAssets = isFiniteNumber(bal.total_assets) ? Number(bal.total_assets) : 0;
  const totalLiab = isFiniteNumber(bal.total_liabilities) ? Number(bal.total_liabilities) : 0;
  const currentAssets = isFiniteNumber(bal.total_current_assets)
    ? Number(bal.total_current_assets)
    : (isFiniteNumber(bal.current_assets) ? Number(bal.current_assets) : 0);
  const currentLiab = isFiniteNumber(bal.total_current_liabilities)
    ? Number(bal.total_current_liabilities)
    : (isFiniteNumber(bal.current_liabilities) ? Number(bal.current_liabilities) : 0);
  const retainedEarnings = isFiniteNumber(bal.retained_earnings) ? Number(bal.retained_earnings) : 0;
  const totalDebt = isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0;
  const cash = isFiniteNumber(bal.cash_and_equivalents) ? Number(bal.cash_and_equivalents) : 0;
  const netDebt = round2(totalDebt - cash);

  const revenue = isFiniteNumber(inc.revenue) ? Number(inc.revenue) : (isFiniteNumber(inc.total_revenue) ? Number(inc.total_revenue) : 0);
  const ebit = isFiniteNumber(inc.ebit) ? Number(inc.ebit) : (isFiniteNumber(inc.operating_profit) ? Number(inc.operating_profit) : 0);
  const ebitda = isFiniteNumber(inc.ebitda) ? Number(inc.ebitda) : null;
  const interestExpense = isFiniteNumber(inc.interest_expense) ? Number(inc.interest_expense) : 0;
  const netIncome = isFiniteNumber(inc.net_income) ? Number(inc.net_income) : 0;
  const ocf = isFiniteNumber(cf.operating_cash_flow) ? Number(cf.operating_cash_flow) : 0;
  const mcap = isFiniteNumber(mkt.market_cap) ? Number(mkt.market_cap) : (isFiniteNumber(val.market_cap) ? Number(val.market_cap) : null);

  let debtMaturing24m = 0;
  if (isFiniteNumber(bal.debt_maturing_24m)) {
    debtMaturing24m = Math.max(0, Number(bal.debt_maturing_24m));
  } else if (isFiniteNumber(bal.short_term_debt)) {
    debtMaturing24m = Math.max(0, Number(bal.short_term_debt));
  }

  const altmanZScore = altmanEval.metrics.altman_z_score;
  const netDebtToEbitda = debtWallEval.metrics.net_debt_to_ebitda;
  const interestCoverage = debtWallEval.metrics.interest_coverage;
  const cashToDebtMaturingRatio = debtMaturing24m > 0 ? round2(cash / debtMaturing24m) : null;
  const accrualGap = round2(ocf - netIncome);

  // 2. Scoring & Risk Flags
  let score = 0;
  const redFlags = [];

  // Pillar 1: Altman Z-Score & Bankruptcy Resistance (35 pts)
  let p1Score = 0;
  if (altmanZScore !== null) {
    if (altmanZScore > 2.99) {
      p1Score = 35.0; // Safe Zone
    } else if (altmanZScore >= 2.50) {
      p1Score = 25.0; // Upper Grey Zone
    } else if (altmanZScore >= 1.81) {
      p1Score = 15.0; // Lower Grey Zone
      redFlags.push(`Grey Zone: Altman Z-Score of ${altmanZScore} indicates vulnerability to adverse economic shocks.`);
    } else {
      p1Score = 0.0; // Distress Zone
      redFlags.push(`Distress Zone: Altman Z-Score of ${altmanZScore} (< 1.81) indicates heightened bankruptcy and insolvency probability.`);
    }
  } else {
    p1Score = 0.0;
  }
  score += p1Score;

  // Pillar 2: Leverage Burden & Net Debt to EBITDA (25 pts)
  let p2Score = 0;
  if (netDebt <= 0) {
    p2Score = 25.0; // Fortress Net Cash balance sheet
  } else if (ebitda !== null && ebitda > 0 && netDebtToEbitda !== null) {
    if (netDebtToEbitda <= 1.0) {
      p2Score = 25.0;
    } else if (netDebtToEbitda <= 2.5) {
      p2Score = 18.0;
    } else if (netDebtToEbitda <= 4.0) {
      p2Score = 8.0;
      redFlags.push(`Elevated Leverage: Net Debt to EBITDA of ${netDebtToEbitda}x (above conservative 2.5x threshold).`);
    } else {
      p2Score = 0.0;
      redFlags.push(`Excessive Leverage: Net Debt to EBITDA ratio of ${netDebtToEbitda}x (> 4.0x) indicates high debt vulnerability.`);
    }
  } else {
    p2Score = 0.0;
    redFlags.push(`Severe Leverage Burden: Positive net debt (${netDebt}) with non-positive or negative EBITDA (${ebitda}).`);
  }
  score += p2Score;

  // Pillar 3: Debt Maturity Wall & Refinancing Exposure (25 pts)
  let p3Score = 0;
  const totalLiquidCushion = cash + Math.max(0, ocf);
  if (debtMaturing24m <= 0) {
    p3Score = 25.0; // No debt due in 24m
  } else if (cash >= debtMaturing24m) {
    p3Score = 25.0; // Fully covered by liquid cash reserves
  } else if (totalLiquidCushion >= debtMaturing24m) {
    p3Score = 18.0; // Covered by operating cash flow + cash
  } else {
    const liquidityCoverageRatio = totalLiquidCushion / debtMaturing24m;
    if (liquidityCoverageRatio >= 0.5) {
      p3Score = 8.0;
      redFlags.push(`Refinancing Exposure: Cash and operating cash flow cover only ${round2(liquidityCoverageRatio * 100)}% of debt maturing within 24 months (${debtMaturing24m}).`);
    } else {
      p3Score = 0.0;
      redFlags.push(`Debt Maturity Cliff: Imminent debt wall of ${debtMaturing24m} severely exceeds total liquidity (${round2(totalLiquidCushion)}), risking refinancing distress.`);
    }
  }
  score += p3Score;

  // Pillar 4: Interest Coverage & Debt Service Cushion (15 pts)
  let p4Score = 0;
  if (totalDebt <= 0 || interestExpense <= 0) {
    p4Score = 15.0; // No interest-bearing debt burden
  } else if (interestCoverage !== null) {
    if (interestCoverage >= 5.0) {
      p4Score = 15.0; // Safe interest buffer
    } else if (interestCoverage >= 3.0) {
      p4Score = 10.0;
    } else if (interestCoverage >= 1.5) {
      p4Score = 5.0;
      redFlags.push(`Thin Interest Coverage: Operating earnings cover interest expense by only ${interestCoverage}x (below 3.0x safe buffer).`);
    } else {
      p4Score = 0.0;
      redFlags.push(`Strained Debt Service: Interest coverage ratio of ${interestCoverage}x (< 1.5x) or negative operating profit.`);
    }
  } else {
    p4Score = 0.0;
    if (ebit <= 0) {
      redFlags.push(`Strained Debt Service: Operating profit (EBIT) is negative (${ebit}) with ongoing interest charges.`);
    }
  }
  score += p4Score;

  score = round2(Math.max(0.0, Math.min(100.0, score)));

  let stance = 'HOLD';
  if (score >= 80.0) stance = 'STRONG_BUY';
  else if (score >= 65.0) stance = 'BUY';
  else if (score >= 50.0) stance = 'HOLD';
  else if (score >= 35.0) stance = 'REDUCE';
  else stance = 'STRONG_SELL';

  let summary = '';
  if (score >= 80.0) {
    summary = `Fortress balance sheet for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). Net cash or ultra-low leverage with ample liquidity covering near-term obligations.`;
  } else if (score >= 65.0) {
    summary = `Solid solvency profile for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). Manageable debt burden with adequate operational debt service buffers.`;
  } else if (score >= 50.0) {
    summary = `Balanced downside risk for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). Moderate leverage or grey zone Altman Z-score warrants monitoring of refinancing conditions.`;
  } else if (score >= 35.0) {
    summary = `Elevated solvency fragility for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). High leverage or constrained interest coverage creates downside vulnerability in recessionary environments.`;
  } else {
    summary = `High downside stress and insolvency danger for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). Altman distress zone or acute debt maturity cliff requires extreme caution.`;
  }

  const audit = [
    {
      check: 'Altman Z-Score Distress Buffer',
      criterion: 'Z-Score > 2.99 (Safe Zone, > 1.81 Grey Zone)',
      value: altmanZScore !== null ? `${altmanZScore}` : 'N/A',
      status: altmanZScore !== null && altmanZScore > 2.99 ? 'PASS' : (altmanZScore !== null && altmanZScore >= 1.81 ? 'WARN' : 'FAIL'),
      score: p1Score,
      max_score: 35,
      details: altmanZScore !== null
        ? `Altman Z-Score of ${altmanZScore} (${altmanZScore > 2.99 ? 'Safe Zone' : (altmanZScore >= 1.81 ? 'Grey Zone' : 'Distress Zone')})`
        : 'Insufficient data for Altman Z calculation'
    },
    {
      check: 'Leverage Burden & Net Debt to EBITDA',
      criterion: 'Net Cash or Net Debt / EBITDA ≤ 2.5x',
      value: netDebt <= 0 ? `Net Cash (${netDebt})` : (netDebtToEbitda !== null ? `${netDebtToEbitda}x` : 'N/A'),
      status: netDebt <= 0 || (netDebtToEbitda !== null && netDebtToEbitda <= 2.5) ? 'PASS' : (netDebtToEbitda !== null && netDebtToEbitda <= 4.0 ? 'WARN' : 'FAIL'),
      score: p2Score,
      max_score: 25,
      details: netDebt <= 0
        ? `Fortress balance sheet with net cash position of ${Math.abs(netDebt)}`
        : (netDebtToEbitda !== null ? `Net debt of ${netDebt} represents ${netDebtToEbitda}x EBITDA` : 'Non-positive EBITDA with net debt')
    },
    {
      check: 'Debt Maturity Wall (24M Cushion)',
      criterion: 'Cash & OCF cover 100% of debt due in 24 months',
      value: debtMaturing24m <= 0 ? 'No Debt Due in 24M' : `${cashToDebtMaturingRatio !== null ? cashToDebtMaturingRatio + 'x' : 'N/A'} (Due: ${debtMaturing24m})`,
      status: (debtMaturing24m <= 0 || cash >= debtMaturing24m || (cash + ocf) >= debtMaturing24m) ? 'PASS' : ((cash + Math.max(0, ocf)) >= 0.5 * debtMaturing24m ? 'WARN' : 'FAIL'),
      score: p3Score,
      max_score: 25,
      details: debtMaturing24m <= 0
        ? 'No debt maturities in the next 24 months'
        : (cash >= debtMaturing24m
          ? `Liquid cash reserves (${cash}) fully cover 24M debt wall (${debtMaturing24m})`
          : `Cash (${cash}) and OCF (${ocf}) vs 24M maturities (${debtMaturing24m})`)
    },
    {
      check: 'Interest Coverage & Debt Service Cushion',
      criterion: 'Interest Coverage ≥ 3.0x (or Zero Debt)',
      value: (totalDebt <= 0 || interestExpense <= 0) ? 'Debt-Free / No Interest' : (interestCoverage !== null ? `${interestCoverage}x` : 'N/A'),
      status: (totalDebt <= 0 || interestExpense <= 0 || (interestCoverage !== null && interestCoverage >= 3.0)) ? 'PASS' : (interestCoverage !== null && interestCoverage >= 1.5 ? 'WARN' : 'FAIL'),
      score: p4Score,
      max_score: 15,
      details: (totalDebt <= 0 || interestExpense <= 0)
        ? 'Zero interest-bearing debt burden'
        : (interestCoverage !== null
          ? `Operating profit (EBIT ${ebit}) covers interest expense (${interestExpense}) by ${interestCoverage}x`
          : 'Negative operating profit with ongoing interest charges')
    }
  ];

  const positive = [];
  if (altmanZScore !== null && altmanZScore > 2.99) {
    positive.push(`Altman Safe Zone: Z-Score of ${altmanZScore} indicates robust bankruptcy resistance.`);
  }
  if (netDebt <= 0) {
    positive.push(`Fortress net cash: Cash and liquid equivalents exceed total debt by ${Math.abs(netDebt)}.`);
  } else if (netDebtToEbitda !== null && netDebtToEbitda <= 1.0) {
    positive.push(`Conservative leverage: Net Debt / EBITDA of ${netDebtToEbitda}x is well within safe bounds.`);
  }
  if (debtMaturing24m <= 0) {
    positive.push('Zero near-term refinancing risk: No debt maturities scheduled in next 24 months.');
  } else if (cash >= debtMaturing24m) {
    positive.push(`Fully funded debt wall: Liquid cash reserves (${cash}) completely cover 24-month maturities (${debtMaturing24m}).`);
  }
  if (totalDebt <= 0 || interestExpense <= 0) {
    positive.push('Unencumbered operations: Zero interest expense eliminates debt servicing vulnerability.');
  }

  const negative = [...redFlags];

  const observations = [
    altmanZScore !== null ? `Altman Z-Score: ${altmanZScore}` : 'Altman Z-Score not computed',
    netDebt <= 0 ? `Net cash position: ${Math.abs(netDebt)}` : `Net Debt / EBITDA: ${netDebtToEbitda}x`,
    debtMaturing24m > 0 ? `Debt maturing in 24 months: ${debtMaturing24m}` : 'Zero debt maturing within 24 months',
    `Operating cash flow: ${ocf}, Accrual gap (OCF - Net Income): ${accrualGap}`
  ];

  const verdict = {
    principle: 'klarman_solvency',
    principle_title: 'Seth Klarman Downside Solvency & Distress',
    ticker,
    timestamp,
    stance,
    score,
    is_veto: false,
    summary
  };

  const metrics = {
    altman_z_score: altmanZScore,
    net_debt_to_ebitda: netDebtToEbitda,
    interest_coverage: interestCoverage,
    debt_maturing_24m: debtMaturing24m,
    cash_to_debt_maturing_ratio: cashToDebtMaturingRatio,
    accrual_gap: accrualGap,
    total_debt: totalDebt,
    cash_and_equivalents: cash,
    net_debt: netDebt
  };

  return {
    principle: 'klarman_solvency',
    ticker,
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
    observations
  };
}

function renderHtml(verdictOrBatch) {
  let template;
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } else {
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Seth Klarman Solvency Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
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
    ? path.join(verdictsDir, 'klarman_solvency_portfolio_verdicts.json')
    : path.join(verdictsDir, `${ticker}_klarman_solvency.json`);
  const htmlPath = isBatch
    ? path.join(verdictsDir, 'klarman_solvency_portfolio_audits.html')
    : path.join(verdictsDir, `${ticker}_klarman_solvency.html`);

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
 * High-level Seth Klarman advisory workflow.
 * Stress-tests balance sheet solvency, enforces Circle of Competence & Baupost cash till discipline,
 * and emits actionable advisory recommendations.
 */
async function analyzeStockWithKlarman(ticker, options = {}) {
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

  // 2. Evaluate Pure Quantitative Klarman Solvency Stress
  const verdictResult = evaluateKlarmanSolvency(financials, options);
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
    portfolioWarnings.push(`CIRCLE OF COMPETENCE UNASSESSED: You have not evaluated Seth Klarman's business questionnaire for ${clean}. Avoid debt-laden complexity.`);
  } else if (competenceStatus === 'OUTSIDE_CIRCLE') {
    portfolioWarnings.push(`OUTSIDE CIRCLE OF COMPETENCE: Comprehension score ${competenceScore}/100 indicates high ambiguity. Position capped at HOLD.`);
  }

  if (!portfolioKnown) {
    if (compositeScore >= 75) {
      call = 'HOLD';
      callReason = 'Fortress balance sheet and pristine solvency, but BUY is strictly gated until portfolio holdings and cash till are verified via fetch-all.';
      portfolioWarnings.push('PORTFOLIO UNKNOWN: Seth Klarman refuses to commit capital blind without inspecting portfolio cash reserves. Run fetch-all.');
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = 'Moderate balance sheet leverage. Hold position pending portfolio review.';
    } else {
      call = 'AVOID';
      callReason = 'Acute debt wall or insolvency risk. Steer clear.';
    }
  } else {
    const MAX_CONCENTRATION_PCT = Math.min(15.0, competenceMaxWeight);
    const MIN_CASH_REQUIRED = 500.0;

    if (compositeScore >= 75) {
      if (competenceStatus === 'NEEDS_ASSESSMENT' || competenceStatus === 'OUTSIDE_CIRCLE') {
        call = 'HOLD';
        callReason = `Fortress balance sheet (${compositeScore}/100), but currently outside your evaluated circle of competence. Baupost rule: Never invest in complex or uncomprehended balance sheets. Complete the questionnaire first.`;
      } else if (currentWeightPct >= MAX_CONCENTRATION_PCT) {
        call = 'HOLD';
        callReason = `Impregnable solvency profile (${compositeScore}/100), but position already sits at ${currentWeightPct.toFixed(1)}% (exceeds ${MAX_CONCENTRATION_PCT}% ceiling). Baupost risk management caps single-idea exposure.`;
        portfolioWarnings.push(`Concentration ceiling reached: Current weight is ${currentWeightPct.toFixed(1)}% (max ${MAX_CONCENTRATION_PCT}%).`);
      } else if (availableCash < MIN_CASH_REQUIRED) {
        call = 'HOLD';
        callReason = `Solvent fortress (${compositeScore}/100), but portfolio cash reserves are inadequate (${availableCash.toFixed(2)}). Cash is your ultimate hedge; never stretch liquidity.`;
        portfolioWarnings.push(`Insufficient cash till: Available cash is ${availableCash.toFixed(2)}.`);
      } else {
        call = 'BUY';
        callReason = `Impregnable balance sheet verified (${compositeScore}/100). Net cash or ultra-low leverage, zero refinancing cliff, and ample till reserves. Downside is well-protected.`;
      }
    } else if (compositeScore >= 50) {
      call = 'HOLD';
      callReason = isHeld
        ? `Acceptable solvency buffer (${compositeScore}/100). Maintain current ${currentWeightPct.toFixed(1)}% position while monitoring near-term refinancing conditions.`
        : `Moderate debt burden (${compositeScore}/100). Not compelling enough to displace cash reserves. Leave on watchlist.`;
    } else {
      if (isHeld) {
        call = 'SELL';
        callReason = `Solvency failure modes triggered (${compositeScore}/100). Dangerous debt maturity cliff, Altman distress zone, or thin interest coverage. Liquidate to protect principal.`;
      } else {
        call = 'AVOID';
        callReason = `Severe leverage or insolvency hazard (${compositeScore}/100). Fails Seth Klarman downside stress standards.`;
      }
    }
  }

  const companyName = financials.name || financials.ticker || clean;
  let folksyVerdict = '';

  if (isIndexEtf) {
    folksyVerdict = `“Broad diversification across the market eliminates the single-firm insolvency trap.” ${clean} spreads corporate debt hazards across hundreds of balance sheets. Continue holding.`;
  } else if (call === 'BUY') {
    folksyVerdict = `“Investors must focus on downside risk; the upside will take care of itself.” ${companyName} possesses an ironclad balance sheet—net cash, an Altman Z-score in the safe zone, and no debt maturity cliffs. Your till is primed. We commit capital with a genuine margin of safety.`;
  } else if (call === 'HOLD') {
    if (portfolioKnown && currentWeightPct >= 15.0) {
      folksyVerdict = `“Risk is not a single number; it is a multi-dimensional concept where concentration is the enemy of survival.” You already hold ${currentWeightPct.toFixed(1)}% in ${companyName}. Sit tight.`;
    } else if (portfolioKnown && availableCash < 500) {
      folksyVerdict = `“Cash is the ultimate hedge against market volatility. While you hold cash, you never have to be a forced seller.” ${companyName} has a sound balance sheet, but our partnership cash till is dry. We conserve liquidity.`;
    } else if (!portfolioKnown) {
      folksyVerdict = `“The single most crucial factor in investing is knowing your own liquidity profile before committing capital.” I see ${companyName}'s financial statements, but our portfolio till balance remains unverified. Run fetch-all.`;
    } else {
      folksyVerdict = `“There are times when the best investment is to do nothing at all.” ${companyName} has a tolerable balance sheet, but no extraordinary margin of safety to justify parting with our cash. We wait.`;
    }
  } else if (call === 'SELL') {
    folksyVerdict = `“Avoid the temptation to average down on debt-heavy companies hoping for a turnaround. When a debt maturity wall hits, equity holders get wiped out.” ${companyName}'s balance sheet is severely strained. Liquidate and preserve capital.`;
  } else {
    folksyVerdict = `“The disciplined investor never reaches for yield or growth by compromising on balance sheet solvency.” ${companyName} carries unacceptably high leverage or refinancing cliff risk. We pass.`;
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
      const v = evaluateKlarmanSolvency(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'klarman_solvency',
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
  evaluateKlarmanSolvency,
  analyzeStockWithKlarman,
  processHoldings,
  parseArgs,
  calculateAltmanZScore
};

if (require.main === module) {
  (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      if (!args.ticker && !args.data && !args.holdings) {
        console.log('Usage: node orchestrate_klarman_analysis.js [--ticker <SYMBOL> | --holdings <PATH>] [--market IN|US]');
        process.exit(1);
      }

      if (args.holdings) {
        const batchRes = await processHoldings(args.holdings, { outDir: args.out });
        if (args.jsonOutput) {
          console.log(JSON.stringify(batchRes, null, 2));
        } else {
          console.log(`\n===============================================================`);
          console.log(`  SETH KLARMAN PORTFOLIO SOLVENCY MATRIX (${batchRes.batch.verdicts.length} Holdings)`);
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

      const res = await analyzeStockWithKlarman(args.ticker, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`\n===============================================================`);
        console.log(`  SETH KLARMAN DOWNSIDE STRESS & SOLVENCY REPORT: ${res.ticker} (${res.market})`);
        console.log(`===============================================================`);
        console.log(`Actionable Call : ${res.call}`);
        console.log(`Composite Score : ${res.composite_score}/100`);
        console.log(`Reason          : ${res.call_reason}\n`);
        console.log(`Baupost Verdict:\n  ${res.folksy_verdict}\n`);
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

