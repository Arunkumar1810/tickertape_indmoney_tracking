'use strict';

const { compileEmbeddedAudits } = require('./audit_embedder');

/**
 * Compile the master StrategyConsolidatedPortfolio contract from sub-engine outputs.
 * @param {object} params
 * @param {string} params.strategyId
 * @param {string} [params.baseCurrency='INR']
 * @param {string} [params.evalDate]
 * @param {string} [params.timestamp]
 * @param {object} params.blendedHoldings - from holding-blender
 * @param {object} params.performance - from strategy-xirr
 * @param {object} params.verdictSynthesis - from guardrail-engine
 * @param {object} [params.embeddedAudits] - optional pre-compiled audits map
 * @param {Map<string, Array<object>> | Record<string, Array<object>>} [params.rawVerdictsByTicker] - raw verdicts to compile audits
 * @returns {object} Canonical StrategyConsolidatedPortfolio object
 */
function compileConsolidatedPortfolio(params) {
  const strategyId = params.strategyId || 'fundamental_lts';
  const baseCurrency = (params.baseCurrency || 'INR').toUpperCase();
  const evalDate = params.evalDate || new Date().toISOString().slice(0, 10);
  const timestamp = params.timestamp || new Date().toISOString();

  const blendedHoldings = params.blendedHoldings || {
    strategy_id: strategyId,
    base_currency: baseCurrency,
    eval_date: evalDate,
    timestamp,
    accounts_blended: [],
    summary: {
      total_invested_capital_base: 0.0,
      total_current_value_base: 0.0,
      total_unrealized_pnl_base: 0.0,
      unrealized_pnl_pct: 0.0,
      pooled_cash_base: 0.0,
      total_strategy_equity: 0.0,
      positions_count: 0
    },
    positions: [],
    pooled_cash: []
  };

  const performance = params.performance || {
    strategy_id: strategyId,
    timestamp,
    base_currency: baseCurrency,
    eval_date: evalDate,
    xirr: null,
    xirr_annualized: null,
    absolute_return: 0.0,
    total_deposited: 0.0,
    total_withdrawn: 0.0,
    net_invested: 0.0,
    terminal_equity: 0.0,
    days_held: 0,
    is_sub_annual: true,
    friction_breakdown: {
      brokerage: 0.0,
      stt: 0.0,
      fx_drag: 0.0,
      taxes_and_charges: 0.0,
      total_friction: 0.0,
      friction_drag_pct: 0.0
    },
    account_cashflows_summary: [],
    cashflows: []
  };

  const verdictSynthesis = params.verdictSynthesis || {
    strategy_id: strategyId,
    timestamp,
    eval_date: evalDate,
    summary: {
      portfolio_health_score: 0.0,
      total_positions: 0,
      disqualified_count: 0,
      needs_review_count: 0,
      approved_count: 0,
      capital_at_risk: 0.0
    },
    portfolio_verdicts: [],
    allocations: []
  };

  // Compile embedded audits
  let embeddedAudits = params.embeddedAudits;
  if (!embeddedAudits || Object.keys(embeddedAudits).length === 0) {
    embeddedAudits = compileEmbeddedAudits(
      verdictSynthesis.portfolio_verdicts || [],
      params.rawVerdictsByTicker || {}
    );
  }

  // Derive consolidated executive summary metrics
  const totalEquity = blendedHoldings.summary
    ? blendedHoldings.summary.total_strategy_equity || 0.0
    : 0.0;

  const totalInvested = blendedHoldings.summary
    ? blendedHoldings.summary.total_invested_capital_base || 0.0
    : 0.0;

  const unrealizedPnl = blendedHoldings.summary
    ? (blendedHoldings.summary.total_unrealized_pnl_base !== undefined
        ? blendedHoldings.summary.total_unrealized_pnl_base
        : totalEquity - totalInvested)
    : 0.0;

  const unrealizedPnlPct = totalInvested > 0
    ? Number(((unrealizedPnl / totalInvested) * 100).toFixed(2))
    : 0.0;

  const xirrVal = performance.xirr !== undefined ? performance.xirr : null;

  const vsSummary = verdictSynthesis.summary || {};
  const healthScore = typeof vsSummary.portfolio_health_score === 'number'
    ? vsSummary.portfolio_health_score
    : 0.0;

  const totalPositions = (blendedHoldings.positions && blendedHoldings.positions.length) || vsSummary.total_positions || 0;
  const disqCount = vsSummary.disqualified_count || 0;
  const reviewCount = vsSummary.needs_review_count || 0;
  const approvedCount = vsSummary.approved_count || 0;
  const capitalAtRisk = vsSummary.capital_at_risk || 0.0;

  const summary = {
    total_strategy_equity: Number(totalEquity.toFixed(2)),
    total_invested_capital: Number(totalInvested.toFixed(2)),
    unrealized_pnl: Number(unrealizedPnl.toFixed(2)),
    unrealized_pnl_pct: unrealizedPnlPct,
    xirr: xirrVal !== null ? Number(xirrVal.toFixed(2)) : null,
    portfolio_health_score: Number(healthScore.toFixed(2)),
    total_positions: totalPositions,
    disqualified_count: disqCount,
    needs_review_count: reviewCount,
    approved_count: approvedCount,
    capital_at_risk: Number(capitalAtRisk.toFixed(2))
  };

  return {
    strategy_id: strategyId,
    timestamp,
    eval_date: evalDate,
    base_currency: baseCurrency,
    summary,
    blended_holdings: blendedHoldings,
    performance,
    verdict_synthesis: verdictSynthesis,
    embedded_audits: embeddedAudits
  };
}

module.exports = {
  compileConsolidatedPortfolio
};

