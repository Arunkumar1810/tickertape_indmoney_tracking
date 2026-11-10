'use strict';

const { evaluateGatekeeperShortCircuit } = require('./gatekeeper_short_circuit');
const { evaluateDownsideGuardrail } = require('./downside_guardrail');

/**
 * Normalize principle identifier between skill format (agent-buffet, analyze-buffett-munger)
 * and verdict format (buffett_munger).
 * @param {string} name
 * @returns {string}
 */
function normalizePrincipleName(name) {
  if (!name || typeof name !== 'string') return '';
  const clean = name.replace(/^analyze[-_]/, '').replace(/^agent[-_]/, '').replace(/[-]/g, '_');
  if (clean === 'buffet' || clean === 'buffett' || clean === 'buffett_munger') return 'buffet';
  return clean;
}

/**
 * Map numerical score to baseline valuation stance.
 * @param {number} score
 * @returns {'STRONG_BUY' | 'BUY' | 'HOLD' | 'REDUCE' | 'STRONG_SELL'}
 */
function scoreToBaselineStance(score) {
  if (score >= 80.0) return 'STRONG_BUY';
  if (score >= 65.0) return 'BUY';
  if (score >= 45.0) return 'HOLD';
  if (score >= 30.0) return 'REDUCE';
  return 'STRONG_SELL';
}

/**
 * Synthesize a single security's gatekeeper and valuation verdicts.
 * Enforces the 3-stage pipeline:
 * 1. Gatekeeper Veto Check (Short-circuit to DISQUALIFIED, 0.0 score, 0.0% allocation)
 * 2. Asymmetric Downside Guardrail (Any STRONG_SELL forces stance to NEEDS_REVIEW)
 * 3. Composite Scoring with REDUCE ceiling capping at HOLD
 *
 * @param {object} security
 * @param {string} security.ticker
 * @param {string} [security.name]
 * @param {'IN' | 'US'} [security.market]
 * @param {Array<object>} security.verdicts - list of SingleVerdict objects
 * @param {Record<string, number>} [assignedWeights] - map of principle name -> weight
 * @returns {object} Synthesized security verdict
 */
function synthesizeSecurityVerdicts(security, assignedWeights = {}) {
  const ticker = security.ticker || 'UNKNOWN';
  const name = security.name || ticker;
  const market = security.market || 'IN';
  const rawVerdicts = Array.isArray(security.verdicts) ? security.verdicts : [];

  // Group raw verdicts by principle
  let gatekeeperVerdict = null;
  const pillarVerdictsRaw = {};

  for (const v of rawVerdicts) {
    if (!v || typeof v !== 'object') continue;
    const normName = normalizePrincipleName(v.principle);
    if (normName === 'forensic_governance') {
      gatekeeperVerdict = v;
    } else {
      pillarVerdictsRaw[normName] = v;
    }
  }

  // Format canonical gatekeeper_verdict object
  const canonicalGatekeeper = {
    principle: 'forensic_governance',
    stance: gatekeeperVerdict ? gatekeeperVerdict.stance : 'PASS',
    is_veto: gatekeeperVerdict ? (gatekeeperVerdict.is_veto === true || gatekeeperVerdict.stance === 'VETO_DISQUALIFIED') : false,
    score: gatekeeperVerdict && typeof gatekeeperVerdict.score === 'number' ? Number(gatekeeperVerdict.score.toFixed(2)) : 100.0,
    red_flags: gatekeeperVerdict && Array.isArray(gatekeeperVerdict.red_flags) ? [...gatekeeperVerdict.red_flags] : []
  };

  // Stage 1: Gatekeeper Veto Check
  const gatekeeperRes = evaluateGatekeeperShortCircuit(gatekeeperVerdict);

  if (gatekeeperRes.short_circuited) {
    // Immediate short-circuit
    return {
      ticker,
      name,
      market,
      synthesized_score: 0.0,
      synthesized_stance: 'DISQUALIFIED',
      is_disqualified: true,
      guardrail_triggered: false,
      gatekeeper_verdict: canonicalGatekeeper,
      pillar_verdicts: {},
      notes: gatekeeperRes.notes,
      recommended_allocation_pct: 0.0
    };
  }

  // Normalize assigned weights
  const normWeights = {};
  for (const [k, w] of Object.entries(assignedWeights)) {
    normWeights[normalizePrincipleName(k)] = w;
  }

  // Identify active principles present
  const presentPrinciples = Object.keys(pillarVerdictsRaw);
  let activeWeightSum = 0;
  for (const p of presentPrinciples) {
    activeWeightSum += (normWeights[p] || 0.25);
  }

  const notes = [...gatekeeperRes.notes];
  const canonicalPillars = {};
  let weightedScoreSum = 0;
  let hasReduceStance = false;
  let reducePrinciple = null;

  for (const p of presentPrinciples) {
    const v = pillarVerdictsRaw[p];
    const rawWeight = normWeights[p] !== undefined ? normWeights[p] : (1.0 / (presentPrinciples.length || 1));
    const normalizedWeight = activeWeightSum > 0 ? (rawWeight / activeWeightSum) : (1.0 / (presentPrinciples.length || 1));
    const score = typeof v.score === 'number' ? v.score : 0.0;
    const weightedScore = score * normalizedWeight;
    weightedScoreSum += weightedScore;

    if (v.stance === 'REDUCE') {
      hasReduceStance = true;
      reducePrinciple = p;
    }

    canonicalPillars[p] = {
      score: Number(score.toFixed(2)),
      stance: v.stance,
      weight: Number(normalizedWeight.toFixed(4)),
      weighted_score: Number(weightedScore.toFixed(2)),
      red_flags: Array.isArray(v.red_flags) ? [...v.red_flags] : []
    };
  }

  const compositeScore = presentPrinciples.length > 0 ? Number(weightedScoreSum.toFixed(2)) : 0.0;

  // Stage 2: Asymmetric Downside Guardrail
  const guardrailRes = evaluateDownsideGuardrail(pillarVerdictsRaw);
  let finalStance;
  let guardrailTriggered = false;

  if (guardrailRes.guardrail_triggered) {
    guardrailTriggered = true;
    finalStance = 'NEEDS_REVIEW';
    notes.push(...guardrailRes.notes);
  } else {
    // Stage 3: Composite Baseline Stance & REDUCE Ceiling Rule
    let baselineStance = scoreToBaselineStance(compositeScore);

    if (hasReduceStance && (baselineStance === 'STRONG_BUY' || baselineStance === 'BUY')) {
      notes.push(
        `CEILING RULE: Synthesized stance capped at HOLD because principle "${reducePrinciple}" signaled REDUCE.`
      );
      baselineStance = 'HOLD';
    }

    finalStance = baselineStance;
  }

  return {
    ticker,
    name,
    market,
    synthesized_score: compositeScore,
    synthesized_stance: finalStance,
    is_disqualified: false,
    guardrail_triggered: guardrailTriggered,
    gatekeeper_verdict: canonicalGatekeeper,
    pillar_verdicts: canonicalPillars,
    notes,
    recommended_allocation_pct: 0.0 // Computed in portfolio aggregation
  };
}

/**
 * Synthesize a full strategy portfolio of securities.
 * Evaluates all positions, computes portfolio risk posture metrics,
 * and redistributes target capital allocations.
 *
 * @param {object} params
 * @param {string} params.strategy_id
 * @param {string} [params.eval_date]
 * @param {string} [params.timestamp]
 * @param {Array<object>} params.stocks
 * @param {Record<string, number>} [params.manifestWeights]
 * @returns {object} Canonical StrategyVerdictSynthesis contract
 */
function synthesizePortfolio(params) {
  const strategyId = params.strategy_id || 'unassigned_strategy';
  const evalDate = params.eval_date || new Date().toISOString().slice(0, 10);
  const timestamp = params.timestamp || new Date().toISOString();
  const stocks = Array.isArray(params.stocks) ? params.stocks : [];
  const manifestWeights = params.manifestWeights || {};

  // Step 1: Synthesize each individual security
  const portfolioVerdicts = stocks.map(stock => {
    return synthesizeSecurityVerdicts(stock, manifestWeights);
  });

  // Step 2: Compute current weights and portfolio totals
  let totalPortfolioValue = 0;
  for (const stock of stocks) {
    const val = typeof stock.current_value === 'number' && stock.current_value > 0 ? stock.current_value : 0;
    totalPortfolioValue += val;
  }

  // Step 3: Compute recommended allocations
  // Disqualified assets receive 0.0%
  // Capital is redistributed proportionally among approved assets based on composite score
  let approvedScoreSum = 0;
  for (const pv of portfolioVerdicts) {
    if (!pv.is_disqualified && !pv.guardrail_triggered && (pv.synthesized_stance === 'HOLD' || pv.synthesized_stance === 'BUY' || pv.synthesized_stance === 'STRONG_BUY')) {
      approvedScoreSum += (pv.synthesized_score > 0 ? pv.synthesized_score : 1.0);
    }
  }

  const allocations = [];
  let capitalAtRisk = 0;
  let disqualifiedCount = 0;
  let needsReviewCount = 0;
  let approvedCount = 0;
  let totalScoreForHealth = 0;
  let countForHealth = 0;

  portfolioVerdicts.forEach((pv, idx) => {
    const stock = stocks[idx] || {};
    const stockValue = typeof stock.current_value === 'number' ? stock.current_value : 0;
    const currentWeightPct = totalPortfolioValue > 0 ? Number(((stockValue / totalPortfolioValue) * 100).toFixed(2)) : 0.0;

    let recWeightPct = 0.0;
    let action = 'MAINTAIN';

    if (pv.is_disqualified) {
      disqualifiedCount++;
      capitalAtRisk += stockValue;
      recWeightPct = 0.0;
      action = 'LIQUIDATE_IMMEDIATELY';
    } else if (pv.guardrail_triggered) {
      needsReviewCount++;
      capitalAtRisk += stockValue;
      // In review, do not allocate new capital; maintain or require manual review
      recWeightPct = currentWeightPct;
      action = 'MANUAL_REVIEW';
      totalScoreForHealth += pv.synthesized_score;
      countForHealth++;
    } else {
      approvedCount++;
      totalScoreForHealth += pv.synthesized_score;
      countForHealth++;

      if (approvedScoreSum > 0) {
        const scoreWeight = (pv.synthesized_score > 0 ? pv.synthesized_score : 1.0);
        recWeightPct = Number(((scoreWeight / approvedScoreSum) * 100).toFixed(2));
      } else {
        recWeightPct = Number((100.0 / portfolioVerdicts.length).toFixed(2));
      }

      if (recWeightPct > currentWeightPct + 2.0) {
        action = 'INCREASE';
      } else if (recWeightPct < currentWeightPct - 2.0) {
        action = 'TRIM';
      } else {
        action = 'MAINTAIN';
      }
    }

    pv.recommended_allocation_pct = recWeightPct;

    allocations.push({
      ticker: pv.ticker,
      current_weight_pct: currentWeightPct,
      recommended_weight_pct: recWeightPct,
      action
    });
  });

  const portfolioHealthScore = countForHealth > 0 ? Number((totalScoreForHealth / countForHealth).toFixed(2)) : 0.0;

  const summary = {
    portfolio_health_score: portfolioHealthScore,
    total_positions: portfolioVerdicts.length,
    disqualified_count: disqualifiedCount,
    needs_review_count: needsReviewCount,
    approved_count: approvedCount,
    capital_at_risk: Number(capitalAtRisk.toFixed(2))
  };

  return {
    strategy_id: strategyId,
    timestamp,
    eval_date: evalDate,
    summary,
    portfolio_verdicts: portfolioVerdicts,
    allocations
  };
}

module.exports = {
  normalizePrincipleName,
  scoreToBaselineStance,
  synthesizeSecurityVerdicts,
  synthesizePortfolio
};

