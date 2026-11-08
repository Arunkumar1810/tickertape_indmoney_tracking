'use strict';

/**
 * Option C Audit Embedder
 * Compiles and structures Tier 3 valuation audits (Forensic Governance, Graham,
 * Lynch, Buffett & Munger, Klarman Solvency) into consolidated per-stock audit
 * records for the Option C Master Dashboard.
 */

/**
 * Normalize principle identifier between skill format (analyze-buffett-munger)
 * and canonical principle format (buffett_munger).
 * @param {string} name
 * @returns {string}
 */
function normalizePrincipleName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/^analyze[-_]/, '').replace(/[-]/g, '_');
}

/**
 * Compile embedded audits for a portfolio from synthesized verdicts and raw pillar verdicts.
 * @param {Array<object>} portfolioVerdicts - from StrategyVerdictSynthesis
 * @param {Map<string, Array<object>> | Record<string, Array<object>>} rawVerdictsByTicker - map of ticker -> SingleVerdict[]
 * @returns {Record<string, object>} embedded_audits map keyed by ticker
 */
function compileEmbeddedAudits(portfolioVerdicts = [], rawVerdictsByTicker = {}) {
  const embeddedAudits = {};

  const getTickerVerdicts = (ticker) => {
    if (rawVerdictsByTicker instanceof Map) {
      return rawVerdictsByTicker.get(ticker) || [];
    }
    return rawVerdictsByTicker[ticker] || [];
  };

  for (const pv of portfolioVerdicts) {
    if (!pv || !pv.ticker) continue;
    const ticker = pv.ticker;
    const rawList = getTickerVerdicts(ticker);

    // Build gatekeeper verdict object
    let gatekeeper = {
      principle: 'forensic_governance',
      stance: pv.gatekeeper_verdict ? pv.gatekeeper_verdict.stance : 'PASS',
      is_veto: pv.gatekeeper_verdict ? pv.gatekeeper_verdict.is_veto : false,
      score: pv.gatekeeper_verdict ? pv.gatekeeper_verdict.score : 100.0,
      metrics: {},
      red_flags: pv.gatekeeper_verdict && Array.isArray(pv.gatekeeper_verdict.red_flags) ? [...pv.gatekeeper_verdict.red_flags] : [],
      summary: ''
    };

    // Find raw gatekeeper details if available
    const rawGatekeeper = rawList.find(v => normalizePrincipleName(v.principle) === 'forensic_governance');
    if (rawGatekeeper) {
      if (rawGatekeeper.metrics) gatekeeper.metrics = { ...rawGatekeeper.metrics };
      if (rawGatekeeper.summary) gatekeeper.summary = rawGatekeeper.summary;
      if (Array.isArray(rawGatekeeper.red_flags) && gatekeeper.red_flags.length === 0) {
        gatekeeper.red_flags = [...rawGatekeeper.red_flags];
      }
    }

    // Build pillar verdicts
    const pillarVerdicts = {};
    const synthesizedPillars = pv.pillar_verdicts || {};

    const ALL_PILLARS = ['graham', 'lynch', 'buffett_munger', 'klarman_solvency'];
    for (const pil of ALL_PILLARS) {
      const syn = synthesizedPillars[pil];
      const raw = rawList.find(v => normalizePrincipleName(v.principle) === pil);

      if (syn || raw) {
        pillarVerdicts[pil] = {
          score: syn ? syn.score : (raw ? raw.score : 0.0),
          stance: syn ? syn.stance : (raw ? raw.stance : 'HOLD'),
          weight: syn ? syn.weight : 0.25,
          weighted_score: syn ? syn.weighted_score : 0.0,
          metrics: raw && raw.metrics ? { ...raw.metrics } : {},
          red_flags: syn && syn.red_flags ? [...syn.red_flags] : (raw && raw.red_flags ? [...raw.red_flags] : []),
          summary: raw && raw.summary ? raw.summary : ''
        };
      }
    }

    embeddedAudits[ticker] = {
      ticker,
      name: pv.name || ticker,
      market: pv.market || 'IN',
      synthesized_stance: pv.synthesized_stance,
      synthesized_score: pv.synthesized_score,
      gatekeeper_verdict: gatekeeper,
      pillar_verdicts: pillarVerdicts,
      notes: Array.isArray(pv.notes) ? [...pv.notes] : []
    };
  }

  return embeddedAudits;
}

module.exports = {
  normalizePrincipleName,
  compileEmbeddedAudits
};

