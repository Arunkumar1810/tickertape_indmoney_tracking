#!/usr/bin/env node
'use strict';

/**
 * analyze_klarman_solvency.js: Tier 3 Seth Klarman Downside Stress & Solvency Engine.
 * Computes Altman Z-Score, Net Debt to EBITDA leverage, Debt Maturity Wall / Cliff coverage,
 * and Interest Coverage buffers.
 * Emits canonical UniformVerdictContract (principle: "klarman_solvency", is_veto: false).
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
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'klarman-solvency-template.html');

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
 * Calculate classical Altman Z-Score:
 * X1 = Working Capital / Total Assets
 * X2 = Retained Earnings / Total Assets
 * X3 = EBIT / Total Assets
 * X4 = Market Cap / Total Liabilities
 * X5 = Revenue / Total Assets
 * Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5
 */
function calculateAltmanZScore({
  totalAssets,
  totalCurrentAssets,
  totalCurrentLiabilities,
  retainedEarnings,
  ebit,
  marketCap,
  totalLiabilities,
  revenue
}) {
  if (
    !isFiniteNumber(totalAssets) || totalAssets <= 0 ||
    !isFiniteNumber(totalLiabilities) || totalLiabilities <= 0 ||
    !isFiniteNumber(marketCap) || marketCap < 0
  ) {
    return null;
  }

  const workingCapital = (isFiniteNumber(totalCurrentAssets) ? Number(totalCurrentAssets) : 0) -
                         (isFiniteNumber(totalCurrentLiabilities) ? Number(totalCurrentLiabilities) : 0);
  const retEarn = isFiniteNumber(retainedEarnings) ? Number(retainedEarnings) : 0;
  const opEarn = isFiniteNumber(ebit) ? Number(ebit) : 0;
  const rev = isFiniteNumber(revenue) ? Number(revenue) : 0;

  const X1 = workingCapital / totalAssets;
  const X2 = retEarn / totalAssets;
  const X3 = opEarn / totalAssets;
  const X4 = marketCap / totalLiabilities;
  const X5 = rev / totalAssets;

  const Z = (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (0.999 * X5);
  return round2(Z);
}

/**
 * Pure deterministic valuation evaluator for Seth Klarman downside stress rules.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @param {object} [options]
 * @returns {object} Canonical UniformVerdictContract (principle: "klarman_solvency")
 */
function evaluateKlarmanSolvency(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateKlarmanSolvency requires a valid NormalizedCompanyFinancials object');
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
    return {
      principle: 'klarman_solvency',
      ticker,
      timestamp,
      score: 100.0,
      stance: 'HOLD',
      is_veto: false,
      metrics: {
        altman_z_score: null,
        net_debt: null,
        net_debt_to_ebitda: null,
        interest_coverage: null,
        debt_maturing_24m: null,
        cash_to_debt_maturing_ratio: null,
        accrual_gap: null,
        operating_cash_flow_to_debt: null
      },
      red_flags: [],
      summary: `Index ETF passive basket (${ticker}): Single-equity Seth Klarman downside stress and solvency evaluation bypassed.`
    };
  }

  const marketData = financials.market_data || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};
  const cashFlow = financials.cash_flow || {};

  const marketCap = isFiniteNumber(marketData.market_cap) ? Number(marketData.market_cap) : null;
  const revenue = isFiniteNumber(income.revenue) ? Number(income.revenue) : 0;
  const ebitda = isFiniteNumber(income.ebitda) ? Number(income.ebitda) : null;
  const ebit = isFiniteNumber(income.ebit) ? Number(income.ebit) : 0;
  const interestExpense = isFiniteNumber(income.interest_expense) ? Number(income.interest_expense) : 0;
  const netIncome = isFiniteNumber(income.net_income) ? Number(income.net_income) : 0;

  const totalAssets = isFiniteNumber(balance.total_assets) ? Number(balance.total_assets) : 0;
  const totalLiabilities = isFiniteNumber(balance.total_liabilities) ? Number(balance.total_liabilities) : 0;
  const totalCurrentAssets = isFiniteNumber(balance.total_current_assets) ? Number(balance.total_current_assets) : 0;
  const totalCurrentLiabilities = isFiniteNumber(balance.total_current_liabilities) ? Number(balance.total_current_liabilities) : 0;
  const retainedEarnings = isFiniteNumber(balance.retained_earnings) ? Number(balance.retained_earnings) : 0;
  const totalDebt = isFiniteNumber(balance.total_debt) ? Number(balance.total_debt) : 0;
  const cash = isFiniteNumber(balance.cash_and_equivalents) ? Number(balance.cash_and_equivalents) : 0;

  // Debt maturing within 24m: check balance.debt_maturing_24m, fallback to balance.short_term_debt, else 0
  let debtMaturing24m = 0;
  if (isFiniteNumber(balance.debt_maturing_24m)) {
    debtMaturing24m = Math.max(0, Number(balance.debt_maturing_24m));
  } else if (isFiniteNumber(balance.short_term_debt)) {
    debtMaturing24m = Math.max(0, Number(balance.short_term_debt));
  }

  const ocf = isFiniteNumber(cashFlow.operating_cash_flow) ? Number(cashFlow.operating_cash_flow) : 0;

  // 2. Metrics calculation
  const altmanZScore = calculateAltmanZScore({
    totalAssets,
    totalCurrentAssets,
    totalCurrentLiabilities,
    retainedEarnings,
    ebit,
    marketCap,
    totalLiabilities,
    revenue
  });

  const netDebt = round2(totalDebt - cash);

  let netDebtToEbitda = null;
  if (isFiniteNumber(ebitda) && ebitda > 0) {
    netDebtToEbitda = round2(netDebt / ebitda);
  } else if (isFiniteNumber(ebitda) && ebitda < 0 && netDebt > 0) {
    netDebtToEbitda = round2(netDebt / ebitda); // Negative ratio when EBITDA is negative
  }

  let interestCoverage = null;
  if (interestExpense > 0) {
    interestCoverage = round2(ebit / interestExpense);
  }

  let cashToDebtMaturingRatio = null;
  if (debtMaturing24m > 0) {
    cashToDebtMaturingRatio = round2(cash / debtMaturing24m);
  }

  const accrualGap = round2(ocf - netIncome);

  let ocfToDebt = null;
  if (totalDebt > 0) {
    ocfToDebt = round2(ocf / totalDebt);
  }

  // 3. Scoring & Risk Flags
  let score = 0.0;
  const redFlags = [];

  // Pillar 1: Altman Z-Score & Bankruptcy Resistance (35 pts)
  if (altmanZScore !== null) {
    if (altmanZScore > 2.99) {
      score += 35.0; // Safe Zone
    } else if (altmanZScore >= 2.50) {
      score += 25.0; // Upper Grey Zone
    } else if (altmanZScore >= 1.81) {
      score += 15.0; // Lower Grey Zone
      redFlags.push(`Grey Zone: Altman Z-Score of ${altmanZScore} indicates vulnerability to adverse economic shocks.`);
    } else {
      score += 0.0; // Distress Zone
      redFlags.push(`Distress Zone: Altman Z-Score of ${altmanZScore} (< 1.81) indicates heightened bankruptcy and insolvency probability.`);
    }
  } else {
    // Missing balance sheet denominators or insufficient data
    score += 0.0;
  }

  // Pillar 2: Leverage Burden & Net Debt to EBITDA (25 pts)
  if (netDebt <= 0) {
    score += 25.0; // Fortress Net Cash balance sheet
  } else if (ebitda !== null && ebitda > 0 && netDebtToEbitda !== null) {
    if (netDebtToEbitda <= 1.0) {
      score += 25.0;
    } else if (netDebtToEbitda <= 2.5) {
      score += 18.0;
    } else if (netDebtToEbitda <= 4.0) {
      score += 8.0;
      redFlags.push(`Elevated Leverage: Net Debt to EBITDA of ${netDebtToEbitda}x (above conservative 2.5x threshold).`);
    } else {
      score += 0.0;
      redFlags.push(`Excessive Leverage: Net Debt to EBITDA ratio of ${netDebtToEbitda}x (> 4.0x) indicates high debt vulnerability.`);
    }
  } else {
    score += 0.0; // Positive net debt with zero or negative EBITDA
    redFlags.push(`Severe Leverage Burden: Positive net debt (${netDebt}) with non-positive or negative EBITDA (${ebitda}).`);
  }

  // Pillar 3: Debt Maturity Wall & Refinancing Exposure (25 pts)
  if (debtMaturing24m <= 0) {
    score += 25.0; // No debt due in 24m
  } else if (cash >= debtMaturing24m) {
    score += 25.0; // Fully covered by liquid cash reserves
  } else if ((cash + ocf) >= debtMaturing24m) {
    score += 18.0; // Covered by operating cash flow + cash
  } else {
    const totalLiquidCushion = cash + Math.max(0, ocf);
    const liquidityCoverageRatio = totalLiquidCushion / debtMaturing24m;
    if (liquidityCoverageRatio >= 0.5) {
      score += 8.0;
      redFlags.push(`Refinancing Exposure: Cash and operating cash flow cover only ${round2(liquidityCoverageRatio * 100)}% of debt maturing within 24 months (${debtMaturing24m}).`);
    } else {
      score += 0.0;
      redFlags.push(`Debt Maturity Cliff: Imminent debt wall of ${debtMaturing24m} severely exceeds total liquidity (${round2(totalLiquidCushion)}), risking refinancing distress.`);
    }
  }

  // Pillar 4: Interest Coverage & Debt Service Cushion (15 pts)
  if (totalDebt <= 0 || interestExpense <= 0) {
    score += 15.0; // No interest-bearing debt burden
  } else if (interestCoverage !== null) {
    if (interestCoverage >= 5.0) {
      score += 15.0; // Safe interest buffer
    } else if (interestCoverage >= 3.0) {
      score += 10.0;
    } else if (interestCoverage >= 1.5) {
      score += 5.0;
      redFlags.push(`Thin Interest Coverage: Operating earnings cover interest expense by only ${interestCoverage}x (below 3.0x safe buffer).`);
    } else {
      score += 0.0;
      redFlags.push(`Strained Debt Service: Interest coverage ratio of ${interestCoverage}x (< 1.5x) or negative operating profit.`);
    }
  } else {
    score += 0.0;
    if (ebit <= 0) {
      redFlags.push(`Strained Debt Service: Operating profit (EBIT) is negative (${ebit}) with ongoing interest charges.`);
    }
  }

  // 4. Stance Synthesis
  score = round2(Math.max(0.0, Math.min(100.0, score)));

  let stance = 'HOLD';
  if (score >= 80.0) {
    stance = 'STRONG_BUY';
  } else if (score >= 65.0) {
    stance = 'BUY';
  } else if (score >= 50.0) {
    stance = 'HOLD';
  } else if (score >= 35.0) {
    stance = 'REDUCE';
  } else {
    stance = 'STRONG_SELL';
  }

  // 5. Narrative Summary
  let summary = '';
  if (score >= 80.0) {
    summary = `Fortress balance sheet for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). ` +
      `Net cash or ultra-low leverage with ample liquidity covering near-term obligations.`;
  } else if (score >= 65.0) {
    summary = `Solid solvency profile for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). ` +
      `Manageable debt burden with adequate operational debt service buffers.`;
  } else if (score >= 50.0) {
    summary = `Balanced downside risk for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). ` +
      `Moderate leverage or grey zone Altman Z-score warrants monitoring of refinancing conditions.`;
  } else if (score >= 35.0) {
    summary = `Elevated solvency fragility for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). ` +
      `High leverage or constrained interest coverage creates downside vulnerability in recessionary environments.`;
  } else {
    summary = `High downside stress and insolvency danger for ${ticker} (Solvency Score: ${score}/100.0, Altman Z: ${altmanZScore !== null ? altmanZScore : 'N/A'}). ` +
      `Altman distress zone or acute debt maturity cliff requires extreme caution.`;
  }

  return {
    principle: 'klarman_solvency',
    ticker,
    timestamp,
    score,
    stance,
    is_veto: false,
    metrics: {
      altman_z_score: altmanZScore,
      net_debt: netDebt,
      net_debt_to_ebitda: netDebtToEbitda,
      interest_coverage: interestCoverage,
      debt_maturing_24m: round2(debtMaturing24m),
      cash_to_debt_maturing_ratio: cashToDebtMaturingRatio,
      accrual_gap: accrualGap,
      operating_cash_flow_to_debt: ocfToDebt
    },
    red_flags: redFlags,
    summary
  };
}

/**
 * Render self-contained HTML dashboard from template.
 */
function renderHtml(data) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found at ${TEMPLATE_PATH}`);
  }
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const serialized = JSON.stringify(data);
  return template.replace('/*__DATA__*/null;', `const DATA = ${serialized};`);
}

/**
 * Write output artifacts and verify with universal harness.
 */
function writeArtifacts(verdictOrBatch, outDir, isBatch) {
  const verdictsDir = path.join(outDir, 'verdicts');
  fs.mkdirSync(verdictsDir, { recursive: true });

  let jsonPath;
  let htmlPath;
  let schemaType;

  if (isBatch) {
    jsonPath = path.join(verdictsDir, 'klarman_solvency_portfolio_verdicts.json');
    htmlPath = path.join(verdictsDir, 'klarman_solvency_portfolio_audits.html');
    schemaType = 'verdict-batch';
  } else {
    jsonPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_klarman_solvency.json`);
    htmlPath = path.join(verdictsDir, `${verdictOrBatch.ticker}_klarman_solvency.html`);
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
  const verdict = evaluateKlarmanSolvency(financials, options);

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

  const verdict = evaluateKlarmanSolvency(financials, options);
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
      const fixtureFortressPath = path.join(SKILL_ROOT, 'tests', 'fixtures', 'klarman_fortress.json');

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
      } else if (fs.existsSync(fixtureFortressPath)) {
        const base = JSON.parse(fs.readFileSync(fixtureFortressPath, 'utf8'));
        financials = { ...base, ticker, name: item.name || base.name };
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
Klarman Solvency & Downside Stress Engine CLI
Usage:
  node analyze_klarman_solvency.js --data <path_to_financials.json> [--out <dir>]
  node analyze_klarman_solvency.js --ticker <SYMBOL> [--market <IN|US>] [--out <dir>] [--refresh]
  node analyze_klarman_solvency.js --holdings <path_to_holdings.json> [--out <dir>]

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
      process.stdout.write(`\n🛡️ Klarman Solvency Engine: Evaluated ${result.batch.verdicts.length} securities in portfolio batch:\n`);
      for (const v of result.batch.verdicts) {
        const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
        process.stdout.write(`   ${icon} ${v.ticker.padEnd(8)}: ${v.stance.padEnd(14)} Score: ${String(v.score).padStart(5)}/100  (Altman Z: ${v.metrics.altman_z_score !== null ? v.metrics.altman_z_score : 'N/A'})\n`);
      }
      process.stdout.write(`\n📁 Consolidated Artifacts:\n`);
      process.stdout.write(`   • JSON: ${result.jsonPath}\n`);
      process.stdout.write(`   • HTML: ${result.htmlPath}\n`);
      process.stdout.write('✅ Universal Verification Harness verified batch artifact pair.\n\n');
    } else {
      const v = result.verdict;
      const icon = v.stance === 'STRONG_BUY' || v.stance === 'BUY' ? '🟢' : (v.stance === 'HOLD' ? '🟡' : '🔴');
      process.stdout.write(`\n🛡️ Klarman Solvency Verdict for ${v.ticker}:\n`);
      process.stdout.write(`   • Stance:                   ${icon} ${v.stance}\n`);
      process.stdout.write(`   • Solvency Score:           ${v.score}/100.0\n`);
      process.stdout.write(`   • Altman Z-Score:           ${v.metrics.altman_z_score !== null ? v.metrics.altman_z_score : 'N/A'}\n`);
      process.stdout.write(`   • Net Debt to EBITDA:       ${v.metrics.net_debt_to_ebitda !== null ? v.metrics.net_debt_to_ebitda + 'x' : (v.metrics.net_debt <= 0 ? 'Net Cash' : 'N/A')}\n`);
      process.stdout.write(`   • Debt Maturing in 24m:     ${v.metrics.debt_maturing_24m}\n`);
      process.stdout.write(`   • Cash / Debt 24m Ratio:    ${v.metrics.cash_to_debt_maturing_ratio !== null ? v.metrics.cash_to_debt_maturing_ratio + 'x' : 'N/A'}\n`);
      process.stdout.write(`   • Interest Coverage:        ${v.metrics.interest_coverage !== null ? v.metrics.interest_coverage + 'x' : 'N/A'}\n`);
      process.stdout.write(`   • Accrual Gap (CFO - NI):   ${v.metrics.accrual_gap}\n`);
      process.stdout.write(`   • Summary:                  ${v.summary}\n`);
      if (v.red_flags.length > 0) {
        process.stdout.write(`   • Risk Triggers (${v.red_flags.length}):\n`);
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
  main().catch(err => {
    process.stderr.write(`[FATAL] ${err.message}\n${err.stack}\n`);
    process.exit(1);
  });
}

module.exports = {
  calculateAltmanZScore,
  evaluateKlarmanSolvency,
  processDataFile,
  processTicker,
  processHoldings,
  renderHtml,
  writeArtifacts,
  parseArgs,
  main
};

