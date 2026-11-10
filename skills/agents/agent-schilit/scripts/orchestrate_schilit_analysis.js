#!/usr/bin/env node
'use strict';

/**
 * orchestrate_schilit_analysis.js:
 * Howard Schilit Forensic Accounting Advisor & Gatekeeper Evaluation Engine.
 *
 * Enforces the Gatekeeper Veto Protocol across accounting integrity, Beneish M-Score,
 * Sloan accrual distortion, promoter pledging, related-party transactions, and auditor continuity.
 *
 * Emits forensic accounting wisdom, canonical UniformVerdictContract reports
 * (principle: "forensic_governance", is_veto: true/false, stance: PASS / FLAG / VETO_DISQUALIFIED),
 * and self-contained offline HTML audit dashboards.
 */

const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = fs.existsSync(path.join(SKILL_ROOT, '..', '..', 'package.json'))
  ? path.resolve(SKILL_ROOT, '..', '..')
  : path.resolve(SKILL_ROOT, '..', '..', '..');

const DEFAULT_REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const TEMPLATE_PATH = path.join(SKILL_ROOT, 'assets', 'schilit-template.html');

// Framework validators & liquidity helpers
const {
  validateUniformVerdict,
  validateUniformVerdictBatch,
  verifyArtifactPair,
  verifyHtmlSelfContainment
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
  evaluateAccountingIntegrity
} = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-accounting-integrity', 'scripts', 'evaluate_accounting_integrity'));

const {
  evaluatePromoterPledging
} = require(path.join(REPO_ROOT, 'skills', 'principles', 'principle-promoter-pledging', 'scripts', 'evaluate_promoter_pledging'));

const INDEX_ETF_TICKERS = new Set([
  'VOO', 'QQQ', 'SPY', 'IVV', 'VTI', 'RSP', 'DIA', 'IWM', 'NIFTYBEES', 'BANKBEES'
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
 * Pure deterministic mathematical function evaluating financial statements
 * for forensic governance and accounting risks.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @param {object} [options]
 * @returns {object} Canonical UniformVerdictContract (principle: "forensic_governance")
 */
function evaluateForensicGovernance(financials, options = {}) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateForensicGovernance requires a valid NormalizedCompanyFinancials object');
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
      principle: 'forensic_governance',
      ticker,
      timestamp,
      score: 100.0,
      stance: 'PASS',
      is_veto: false,
      metrics: {
        promoter_pledging_pct: null,
        promoter_holding_pct: null,
        related_party_transactions_pct: null,
        beneish_m_score: null,
        sloan_accrual_ratio: null,
        dso_yoy_expansion_pct: null,
        inventory_growth_vs_sales_delta_pct: null,
        sbc_dilution_pct: null
      },
      red_flags: [],
      summary: `Index ETF passive basket (${ticker}): Single-company corporate governance and forensic accounting filters bypassed.`
    };
  }

  const forensics = financials.forensics || {};
  const income = financials.income_statement || {};
  const balance = financials.balance_sheet || {};
  const cashFlow = financials.cash_flow || {};

  // Evaluate decoupled principles
  const acctEval = evaluateAccountingIntegrity(financials);
  const promEval = evaluatePromoterPledging(financials);

  // Metric extraction
  const promoterPledgingPct = promEval.metrics.promoter_pledging_pct;
  const promoterHoldingPct = promEval.metrics.promoter_holding_pct;
  const rptPct = promEval.metrics.related_party_transactions_pct;

  const auditorResignationFlag = Boolean(forensics.auditor_resignation_flag);
  const qualifiedOpinionFlag = Boolean(forensics.qualified_opinion_flag);

  const beneishMScore = acctEval.metrics.beneish_m_score;
  const sloanAccrualRatio = acctEval.metrics.sloan_accrual_ratio;
  const dsoExpansionPct = acctEval.metrics.dso_yoy_expansion_pct;
  const inventoryGrowthDelta = acctEval.metrics.inventory_growth_vs_sales_delta_pct;

  const surveillanceStage = String(forensics.surveillance_stage || 'NONE').toUpperCase();

  let sbcDilutionPct = 0.0;
  if (forensics.sbc_dilution_pct !== undefined && forensics.sbc_dilution_pct !== null) {
    sbcDilutionPct = Number(forensics.sbc_dilution_pct);
  } else if (cashFlow.stock_based_compensation && income.revenue && income.revenue > 0) {
    sbcDilutionPct = round2((cashFlow.stock_based_compensation / income.revenue) * 100);
  }

  const shareDilutionPct = forensics.share_dilution_pct !== undefined && forensics.share_dilution_pct !== null
    ? Number(forensics.share_dilution_pct)
    : (forensics.share_count_dilution_pct !== undefined && forensics.share_count_dilution_pct !== null
      ? Number(forensics.share_count_dilution_pct)
      : null);

  // Hard Veto Triggers
  const vetoReasons = [...acctEval.veto_reasons, ...promEval.veto_reasons];

  if (auditorResignationFlag) {
    vetoReasons.push('Unexplained mid-term auditor resignation reported');
  }
  if (qualifiedOpinionFlag) {
    vetoReasons.push('Adverse or qualified independent audit opinion reported');
  }
  if (['STAGE_3', 'STAGE_4', 'GSM_STAGE_4'].includes(surveillanceStage)) {
    vetoReasons.push(`Security under heightened regulatory surveillance (${surveillanceStage})`);
  }
  if (sbcDilutionPct > 10.0) {
    vetoReasons.push(`Excessive stock-based compensation dilution (${round2(sbcDilutionPct)}% > 10% threshold)`);
  }
  if (shareDilutionPct !== null && shareDilutionPct > 10.0) {
    vetoReasons.push(`Aggressive share count dilution (${round2(shareDilutionPct)}% > 10% threshold)`);
  }

  // Warning Flags & Scoring Deductions
  const warningFlags = [...acctEval.warning_flags, ...promEval.warning_flags];
  let scoreDeductions = 0.0;

  if (['STAGE_1', 'STAGE_2'].includes(surveillanceStage)) {
    scoreDeductions += 25.0;
    warningFlags.push(`Exchange surveillance watch active: ${surveillanceStage}`);
  }
  if (sbcDilutionPct > 5.0 && sbcDilutionPct <= 10.0) {
    scoreDeductions += 15.0;
    warningFlags.push(`High stock-based compensation dilution (${round2(sbcDilutionPct)}% of revenue)`);
  }
  if (shareDilutionPct !== null && shareDilutionPct > 5.0 && shareDilutionPct <= 10.0) {
    scoreDeductions += 15.0;
    warningFlags.push(`Elevated share count dilution (${round2(shareDilutionPct)}% YoY)`);
  }

  // Combine scores
  const baseScore = Math.min(acctEval.score, promEval.score) - scoreDeductions;
  const allRedFlags = [...vetoReasons, ...warningFlags];

  let stance;
  let isVeto;
  let finalScore;
  let summary;

  if (vetoReasons.length > 0) {
    isVeto = true;
    stance = 'VETO_DISQUALIFIED';
    finalScore = Math.max(0.0, Math.min(round2(baseScore), 20.0));
    summary = `HARD VETO DISQUALIFIED: ${vetoReasons.join('; ')}. Corporate governance & accounting integrity failed critical gatekeeper thresholds.`;
  } else if (baseScore < 60.0 || warningFlags.length >= 2) {
    isVeto = false;
    stance = 'FLAG';
    finalScore = Math.max(0.0, Math.min(round2(baseScore), 59.9));
    summary = `FLAG: Elevated forensic risk detected (${warningFlags.length} warnings). Review audit notes: ${warningFlags.join('; ')}.`;
  } else {
    isVeto = false;
    stance = 'PASS';
    finalScore = Math.max(60.0, Math.min(round2(baseScore), 100.0));
    summary = 'PASS: Robust corporate governance, clean audit trail, and conservative accounting practices verified.';
  }

  return {
    principle: 'forensic_governance',
    ticker,
    timestamp,
    score: finalScore,
    stance,
    is_veto: isVeto,
    metrics: {
      promoter_pledging_pct: promoterPledgingPct !== null ? round2(promoterPledgingPct) : null,
      promoter_holding_pct: promoterHoldingPct !== null ? round2(promoterHoldingPct) : null,
      related_party_transactions_pct: rptPct !== null ? round2(rptPct) : null,
      beneish_m_score: isFiniteNumber(beneishMScore) ? round2(beneishMScore) : null,
      sloan_accrual_ratio: isFiniteNumber(sloanAccrualRatio) ? round4(sloanAccrualRatio) : null,
      dso_yoy_expansion_pct: round2(dsoExpansionPct),
      inventory_growth_vs_sales_delta_pct: round2(inventoryGrowthDelta),
      sbc_dilution_pct: round2(sbcDilutionPct)
    },
    red_flags: allRedFlags,
    summary
  };
}

const evaluateSchilitForensic = evaluateForensicGovernance;

/**
 * Render self-contained offline HTML audit report using the template.
 */
function renderHtml(verdictOrBatch) {
  let template;
  if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } else {
    template = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Forensic Verdict</title></head><body><script>const DATA = /*__DATA__*/null;</script></body></html>`;
  }
  const jsonContent = JSON.stringify(verdictOrBatch, null, 2);
  return template.replace('/*__DATA__*/null', () => jsonContent);
}

const renderSchilitDashboardHtml = renderHtml;

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
    jsonPath = path.join(verdictsDir, 'forensic_governance_portfolio_verdicts.json');
    htmlPath = path.join(verdictsDir, 'forensic_governance_portfolio_audits.html');
    schemaType = 'verdict-batch';
  } else {
    jsonPath = path.join(verdictsDir, `forensic_governance_${verdictOrBatch.ticker}.json`);
    htmlPath = path.join(verdictsDir, `forensic_governance_${verdictOrBatch.ticker}.html`);
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
 * Format Howard Schilit advisory speech with classic CFRA forensic authority.
 */
function formatSchilitSpeech({
  clean,
  companyName,
  stance,
  isVeto,
  score,
  metrics,
  redFlags,
  summary,
  jsonPath,
  htmlPath
}) {
  const lines = [];
  lines.push('================================================================================');
  lines.push(`🔍  HOWARD SCHILIT — FORENSIC ACCOUNTING AUDIT & GATEKEEPER EVALUATION: ${clean}`);
  lines.push('================================================================================\n');

  lines.push(`Company: ${companyName} (${clean})`);
  lines.push(`Gatekeeper Stance: ${stance} [Score: ${score}/100]`);
  lines.push(`Veto Triggered: ${isVeto ? '🚨 YES — HARD VETO ACTIVE' : '✅ NO — GATEKEEPER PASS'}\n`);

  lines.push('--- HOWARD SCHILIT\'S FORENSIC AUDIT OPINION ---');
  if (isVeto) {
    lines.push('“STOP! As a forensic auditor, I must invoke the Gatekeeper Veto Protocol immediately.');
    lines.push('In my decades investigating financial shenanigans, the red flags uncovered here represent critical accounting toxicity.');
    lines.push('Never let glamorous valuation multiples blind you to aggressive revenue booking, massive promoter leverage, or auditor departures.”');
  } else if (stance === 'FLAG') {
    lines.push('“Caution advised. While no single metric breaches the hard veto boundary, we have detected multiple early-warning shenanigans.');
    lines.push('The cash conversion and footnote disclosures require scrutiny before committing capital.”');
  } else {
    lines.push('“Spotless forensic audit trail verified. The reported net income is backed by clean operating cash flow, low non-cash accruals, and unencumbered promoter ownership.');
    lines.push('This company passes the Gatekeeper barrier and is cleared for valuation pillar weighting.”');
  }

  lines.push('\n--- FORENSIC METRICS AUDIT ---');
  lines.push(`  • Beneish M-Score         : ${metrics.beneish_m_score !== null ? metrics.beneish_m_score : 'N/A'} (Manipulation threshold: > -1.78)`);
  lines.push(`  • Sloan Accrual Ratio     : ${metrics.sloan_accrual_ratio !== null ? metrics.sloan_accrual_ratio : 'N/A'} (Distortion threshold: > 0.25)`);
  lines.push(`  • Promoter Pledging       : ${metrics.promoter_pledging_pct !== null ? metrics.promoter_pledging_pct + '%' : 'N/A'} (Veto ceiling: > 50.0%)`);
  lines.push(`  • Related-Party Tx (RPT)  : ${metrics.related_party_transactions_pct !== null ? metrics.related_party_transactions_pct + '%' : 'N/A'} (Tunneling ceiling: > 25.0%)`);
  lines.push(`  • DSO YoY Expansion       : ${metrics.dso_yoy_expansion_pct !== null ? metrics.dso_yoy_expansion_pct + '%' : '0.0%'}`);
  lines.push(`  • Inventory vs Sales Delta: ${metrics.inventory_growth_vs_sales_delta_pct !== null ? metrics.inventory_growth_vs_sales_delta_pct + '%' : '0.0%'}`);

  if (redFlags.length > 0) {
    lines.push('\n--- FORENSIC RED FLAGS & AUDIT FINDINGS ---');
    redFlags.forEach(f => lines.push(`  ⚠️  ${f}`));
  }

  lines.push(`\nSummary: ${summary}`);
  if (jsonPath) lines.push(`Data Contract: ${jsonPath}`);
  if (htmlPath) lines.push(`Audit Dashboard: ${htmlPath}`);

  return lines.join('\n');
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
  const verdict = evaluateForensicGovernance(financials, options);

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
 * High-level Howard Schilit advisory workflow.
 */
async function analyzeStockWithSchilit(ticker, options = {}) {
  const clean = String(ticker || '').trim().toUpperCase();
  if (!clean) throw new Error('A ticker symbol is required.');

  const outDir = options.out || options.outDir || DEFAULT_REPORTS_DIR;
  const market = inferMarket(clean, options.market);

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

  const verdict = evaluateForensicGovernance(financials, options);
  const companyName = financials.name || financials.ticker || clean;

  let artifacts = null;
  if (!options.noWrite) {
    artifacts = writeArtifacts(verdict, outDir, false);
  }

  const speech = formatSchilitSpeech({
    clean,
    companyName,
    stance: verdict.stance,
    isVeto: verdict.is_veto,
    score: verdict.score,
    metrics: verdict.metrics,
    redFlags: verdict.red_flags,
    summary: verdict.summary,
    jsonPath: artifacts ? artifacts.jsonPath : null,
    htmlPath: artifacts ? artifacts.htmlPath : null
  });

  return {
    ok: true,
    ticker: clean,
    companyName,
    stance: verdict.stance,
    isVeto: verdict.is_veto,
    score: verdict.score,
    verdict,
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
  const processedTickers = new Set();
  const verdicts = [];

  for (const h of holdings) {
    const rawTicker = h.ticker || h.symbol;
    if (!rawTicker) continue;
    const ticker = rawTicker.toUpperCase();
    if (processedTickers.has(ticker)) continue;
    processedTickers.add(ticker);

    let financials = null;
    const localReportPath = path.join(outDir, 'financials', `${ticker}.json`);
    const repoReportPath = path.join(REPO_ROOT, 'reports', 'financials', `${ticker}.json`);

    if (fs.existsSync(localReportPath)) {
      financials = JSON.parse(fs.readFileSync(localReportPath, 'utf8'));
    } else if (fs.existsSync(repoReportPath)) {
      financials = JSON.parse(fs.readFileSync(repoReportPath, 'utf8'));
    } else if (INDEX_ETF_TICKERS.has(ticker)) {
      financials = {
        ticker,
        name: h.name || `${ticker} ETF`,
        market: 'US',
        currency: 'USD',
        timestamp: new Date().toISOString(),
        is_index_etf: true,
        sector: 'Index ETF',
        market_data: { cmp: h.cmp || 100.0, shares_outstanding: 1000 }
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

    if (financials) {
      const v = evaluateForensicGovernance(financials, options);
      verdicts.push(v);
    }
  }

  if (verdicts.length === 0) {
    throw new Error('No valid verdicts could be computed for holdings batch.');
  }

  const batch = {
    principle: 'forensic_governance',
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
    out: null,
    refresh: false,
    jsonOutput: false,
    noWrite: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ticker' && i + 1 < argv.length) {
      args.ticker = argv[++i].toUpperCase();
    } else if (a === '--market' && i + 1 < argv.length) {
      args.market = argv[++i].toUpperCase();
    } else if (a === '--data' && i + 1 < argv.length) {
      args.data = argv[++i];
    } else if (a === '--holdings' && i + 1 < argv.length) {
      args.holdings = argv[++i];
    } else if (a === '--out' && i + 1 < argv.length) {
      args.out = argv[++i];
    } else if (a === '--refresh') {
      args.refresh = true;
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
    if (args.holdings) {
      const res = await processHoldings(args.holdings, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res.batch, null, 2));
      } else {
        console.log(`Evaluated ${res.batch.verdicts.length} holdings with Howard Schilit forensic gatekeeper standards.`);
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
        console.log(`Successfully audited ${args.data} with Howard Schilit forensic standards.`);
        if (res.jsonPath) console.log(`JSON: ${res.jsonPath}`);
        if (res.htmlPath) console.log(`HTML: ${res.htmlPath}`);
      }
      return;
    }

    if (args.ticker) {
      const res = await analyzeStockWithSchilit(args.ticker, args);
      if (args.jsonOutput) {
        console.log(JSON.stringify(res.verdict, null, 2));
      } else {
        console.log(res.speech);
      }
      return;
    }

    console.error('Usage:');
    console.error('  node orchestrate_schilit_analysis.js --ticker <TICKER> [--market IN|US] [--json-output]');
    console.error('  node orchestrate_schilit_analysis.js --data <PATH_TO_NORMALIZED_FINANCIALS>');
    console.error('  node orchestrate_schilit_analysis.js --holdings <PATH_TO_HOLDINGS_SNAPSHOT>');
    process.exit(1);
  } catch (err) {
    console.error('Error executing Howard Schilit forensic analysis:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateForensicGovernance,
  evaluateSchilitForensic,
  renderHtml,
  renderSchilitDashboardHtml,
  writeArtifacts,
  processDataFile,
  analyzeStockWithSchilit,
  processHoldings,
  parseArgs,
  main
};
