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

  const rawBlended = params.blendedHoldings || {};
  const blendedHoldings = {
    strategy_id: rawBlended.strategy_id || strategyId,
    base_currency: rawBlended.base_currency || baseCurrency,
    eval_date: rawBlended.eval_date || evalDate,
    timestamp: rawBlended.timestamp || timestamp,
    accounts_blended: rawBlended.accounts_blended || [],
    summary: rawBlended.summary || {
      total_invested_capital_base: 0.0,
      total_current_value_base: 0.0,
      total_unrealized_pnl_base: 0.0,
      unrealized_pnl_pct: 0.0,
      pooled_cash_base: 0.0,
      total_strategy_equity: 0.0,
      positions_count: 0
    },
    positions: (rawBlended.positions || []).map(p => ({
      ...p,
      total_quantity: p.total_quantity !== undefined ? p.total_quantity : (p.quantity || 0),
      weighted_avg_cost: p.weighted_avg_cost !== undefined ? p.weighted_avg_cost : (p.average_price || 0),
      invested_value_base: p.invested_value_base !== undefined ? p.invested_value_base : (p.invested_value || 0),
      current_value_base: p.current_value_base !== undefined ? p.current_value_base : (p.current_value || 0),
      unrealized_pnl_base: p.unrealized_pnl_base !== undefined ? p.unrealized_pnl_base : (p.unrealized_pnl || 0),
      weight_in_strategy_pct: p.weight_in_strategy_pct !== undefined ? p.weight_in_strategy_pct : (p.weight_pct || 0)
    })),
    pooled_cash: rawBlended.pooled_cash || (
      Array.isArray(rawBlended.accounts_blended) && rawBlended.accounts_blended.length > 0 && typeof rawBlended.accounts_blended[0] === 'object'
        ? rawBlended.accounts_blended.map(acc => {
            const totalCash = (rawBlended.summary && (rawBlended.summary.pooled_cash || rawBlended.summary.pooled_cash_base)) || 1;
            return {
              account_id: acc.account_id,
              original_currency: acc.original_currency || baseCurrency,
              cash_balance: acc.raw_cash !== undefined ? acc.raw_cash : 0,
              fx_rate: acc.fx_rate !== undefined ? acc.fx_rate : 1,
              cash_in_base_currency: acc.pooled_cash_contribution !== undefined ? acc.pooled_cash_contribution : (acc.raw_cash || 0),
              weight_in_cash_pct: totalCash > 0 ? Number((((acc.pooled_cash_contribution || acc.raw_cash || 0) / totalCash) * 100).toFixed(1)) : 0
            };
          })
        : []
    )
  };

  const rawPerformance = params.performance || {};
  const performance = {
    strategy_id: rawPerformance.strategy_id || strategyId,
    timestamp: rawPerformance.timestamp || timestamp,
    base_currency: rawPerformance.base_currency || baseCurrency,
    eval_date: rawPerformance.eval_date || evalDate,
    xirr: rawPerformance.xirr !== undefined ? rawPerformance.xirr : null,
    xirr_annualized: rawPerformance.xirr_annualized !== undefined ? rawPerformance.xirr_annualized : null,
    absolute_return: rawPerformance.absolute_return !== undefined ? rawPerformance.absolute_return : 0.0,
    total_deposited: rawPerformance.total_deposited !== undefined ? rawPerformance.total_deposited : 0.0,
    total_withdrawn: rawPerformance.total_withdrawn !== undefined ? rawPerformance.total_withdrawn : 0.0,
    net_invested: rawPerformance.net_invested !== undefined ? rawPerformance.net_invested : 0.0,
    terminal_equity: rawPerformance.terminal_equity !== undefined ? rawPerformance.terminal_equity : 0.0,
    days_held: rawPerformance.days_held !== undefined ? rawPerformance.days_held : 0,
    is_sub_annual: rawPerformance.is_sub_annual !== undefined ? rawPerformance.is_sub_annual : true,
    friction_breakdown: rawPerformance.friction_breakdown || {
      brokerage: 0.0,
      stt: 0.0,
      fx_drag: 0.0,
      taxes_and_charges: 0.0,
      total_friction: 0.0,
      friction_drag_pct: 0.0
    },
    account_cashflows_summary: rawPerformance.account_cashflows_summary || [],
    cashflows: rawPerformance.cashflows || []
  };

  const rawSynthesis = params.verdictSynthesis || {};
  const verdictSynthesis = {
    strategy_id: rawSynthesis.strategy_id || strategyId,
    timestamp: rawSynthesis.timestamp || timestamp,
    eval_date: rawSynthesis.eval_date || evalDate,
    summary: rawSynthesis.summary || {
      portfolio_health_score: 0.0,
      total_positions: 0,
      disqualified_count: 0,
      needs_review_count: 0,
      approved_count: 0,
      capital_at_risk: 0.0
    },
    portfolio_verdicts: rawSynthesis.portfolio_verdicts || [],
    allocations: rawSynthesis.allocations || []
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
    ? (blendedHoldings.summary.total_invested !== undefined
        ? blendedHoldings.summary.total_invested
        : (blendedHoldings.summary.total_invested_capital_base || 0.0))
    : 0.0;

  const unrealizedPnl = blendedHoldings.summary
    ? (blendedHoldings.summary.unrealized_pnl !== undefined
        ? blendedHoldings.summary.unrealized_pnl
        : (blendedHoldings.summary.total_unrealized_pnl_base !== undefined
            ? blendedHoldings.summary.total_unrealized_pnl_base
            : totalEquity - totalInvested))
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

