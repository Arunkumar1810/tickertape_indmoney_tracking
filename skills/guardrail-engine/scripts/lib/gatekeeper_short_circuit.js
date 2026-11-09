'use strict';

/**
 * Gatekeeper Short-Circuit Evaluator
 * Stage 1 of the Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine.
 * Evaluates the forensic governance gatekeeper verdict.
 * If is_veto === true or stance === 'VETO_DISQUALIFIED', short-circuits the evaluation
 * to DISQUALIFIED with 0.0% capital allocation and 0.0 composite score.
 *
 * @param {object} gatekeeperVerdict
 * @returns {{
 *   short_circuited: boolean,
 *   is_disqualified: boolean,
 *   synthesized_stance?: 'DISQUALIFIED',
 *   synthesized_score?: number,
 *   recommended_allocation_pct?: number,
 *   gatekeeper_clean: boolean,
 *   notes: string[]
 * }}
 */
function evaluateGatekeeperShortCircuit(gatekeeperVerdict) {
  if (!gatekeeperVerdict || typeof gatekeeperVerdict !== 'object') {
    return {
      short_circuited: false,
      is_disqualified: false,
      gatekeeper_clean: false,
      notes: ['Gatekeeper verdict not available']
    };
  }

  const isVeto = gatekeeperVerdict.is_veto === true || gatekeeperVerdict.stance === 'VETO_DISQUALIFIED';
  const redFlags = Array.isArray(gatekeeperVerdict.red_flags) ? gatekeeperVerdict.red_flags : [];

  if (isVeto) {
    const notes = [
      'GATEKEEPER VETO: Forensic governance audit triggered a hard veto. Automated capital allocation disqualified (0.0%).'
    ];
    if (redFlags.length > 0) {
      notes.push(...redFlags.map(rf => `[Gatekeeper Red Flag] ${rf}`));
    } else if (gatekeeperVerdict.summary) {
      notes.push(`[Gatekeeper Rationale] ${gatekeeperVerdict.summary}`);
    }

    return {
      short_circuited: true,
      is_disqualified: true,
      synthesized_stance: 'DISQUALIFIED',
      synthesized_score: 0.0,
      recommended_allocation_pct: 0.0,
      gatekeeper_clean: false,
      notes
    };
  }

  const isFlagged = gatekeeperVerdict.stance === 'FLAG';
  const notes = [];
  if (isFlagged) {
    notes.push('Gatekeeper Notice: Forensic governance raised non-fatal surveillance warning flags.');
    if (redFlags.length > 0) {
      notes.push(...redFlags.map(rf => `[Gatekeeper Notice] ${rf}`));
    }
  }

  return {
    short_circuited: false,
    is_disqualified: false,
    gatekeeper_clean: !isFlagged,
    notes
  };
}

module.exports = {
  evaluateGatekeeperShortCircuit
};

