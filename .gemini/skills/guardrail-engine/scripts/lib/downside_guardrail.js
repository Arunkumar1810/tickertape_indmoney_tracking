'use strict';

/**
 * Asymmetric Downside Guardrail Evaluator
 * Stage 2 of the Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine.
 * Evaluates active valuation principle verdicts for non-vetoed securities.
 * If ANY principle issues a STRONG_SELL stance, the guardrail triggers:
 * forcing synthesized_stance to NEEDS_REVIEW and suppressing automated buy clearance.
 *
 * @param {Record<string, object> | Array<object>} pillarVerdicts - map or array of principle verdicts
 * @returns {{
 *   guardrail_triggered: boolean,
 *   synthesized_stance?: 'NEEDS_REVIEW',
 *   offending_principles: string[],
 *   notes: string[]
 * }}
 */
function evaluateDownsideGuardrail(pillarVerdicts) {
  const offendingPrinciples = [];
  const notes = [];

  const verdictsList = Array.isArray(pillarVerdicts)
    ? pillarVerdicts
    : Object.values(pillarVerdicts || {});

  for (const verdict of verdictsList) {
    if (!verdict || typeof verdict !== 'object') continue;

    const principle = verdict.principle || 'valuation_pillar';
    const stance = verdict.stance;

    if (stance === 'STRONG_SELL') {
      offendingPrinciples.push(principle);
      notes.push(
        `DOWNSIDE GUARDRAIL TRIGGERED: Principle "${principle}" issued STRONG_SELL. Stance forced to NEEDS_REVIEW.`
      );

      const redFlags = Array.isArray(verdict.red_flags) ? verdict.red_flags : [];
      if (redFlags.length > 0) {
        notes.push(...redFlags.map(rf => `[${principle} Risk] ${rf}`));
      } else if (verdict.summary) {
        notes.push(`[${principle} Summary] ${verdict.summary}`);
      }
    }
  }

  const guardrailTriggered = offendingPrinciples.length > 0;

  return {
    guardrail_triggered: guardrailTriggered,
    synthesized_stance: guardrailTriggered ? 'NEEDS_REVIEW' : undefined,
    offending_principles: offendingPrinciples,
    notes
  };
}

module.exports = {
  evaluateDownsideGuardrail
};

