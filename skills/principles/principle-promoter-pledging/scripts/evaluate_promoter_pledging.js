#!/usr/bin/env node
'use strict';

/**
 * evaluate_promoter_pledging.js:
 * Promoter Pledging & Related-Party Transactions (RPT) Risk Evaluation Engine.
 * Audits promoter collateral pledging and management self-dealing transactions.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Evaluates promoter pledging and related-party transaction metrics for a company.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @returns {object} Promoter pledging evaluation result
 */
function evaluatePromoterPledging(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluatePromoterPledging requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'promoter-pledging',
      name: 'Promoter Pledging & Related-Party Transactions',
      ticker,
      status: 'PASS',
      score: 100.0,
      classification: 'Passive Basket (Bypasses Promoter Audits)',
      metrics: {
        promoter_pledging_pct: null,
        promoter_holding_pct: null,
        related_party_transactions_pct: null
      },
      veto_reasons: [],
      warning_flags: [],
      summary: 'Index ETF passive basket: Promoter pledging and governance checks bypassed.'
    };
  }

  const forensics = financials.forensics || {};
  const income = financials.income_statement || {};

  const promoterPledgingPct = forensics.promoter_pledge_pct !== undefined && forensics.promoter_pledge_pct !== null
    ? Number(forensics.promoter_pledge_pct)
    : forensics.promoter_pledging_pct !== undefined && forensics.promoter_pledging_pct !== null
    ? Number(forensics.promoter_pledging_pct)
    : null;

  const promoterHoldingPct = forensics.promoter_holding_pct !== undefined && forensics.promoter_holding_pct !== null
    ? Number(forensics.promoter_holding_pct)
    : null;

  let rptPct = null;
  if (forensics.related_party_transactions_pct !== undefined && forensics.related_party_transactions_pct !== null) {
    rptPct = Number(forensics.related_party_transactions_pct);
  } else if (forensics.related_party_transactions !== undefined && income.revenue && income.revenue > 0) {
    rptPct = round2((forensics.related_party_transactions / income.revenue) * 100);
  }

  const vetoReasons = [];
  const warningFlags = [];
  let scoreDeduction = 0.0;

  // Promoter Pledging Checks
  if (promoterPledgingPct !== null) {
    if (promoterPledgingPct > 50.0) {
      vetoReasons.push(`Promoter pledged shares at critical level (${promoterPledgingPct}% > 50% threshold)`);
    } else if (promoterPledgingPct > 25.0) {
      scoreDeduction += 35.0;
      warningFlags.push(`Elevated promoter pledging (${promoterPledgingPct}% > 25%)`);
    } else if (promoterPledgingPct > 10.0) {
      scoreDeduction += 15.0;
      warningFlags.push(`Moderate promoter pledging (${promoterPledgingPct}% > 10%)`);
    }
  }

  // Related-Party Transactions Checks
  if (rptPct !== null) {
    if (rptPct > 25.0) {
      vetoReasons.push(`Excessive related-party transactions (${rptPct}% > 25% of revenue threshold)`);
    } else if (rptPct > 10.0) {
      scoreDeduction += 30.0;
      warningFlags.push(`High related-party transactions (${rptPct}% of revenue)`);
    } else if (rptPct > 5.0) {
      scoreDeduction += 10.0;
      warningFlags.push(`Elevated related-party transactions (${rptPct}%)`);
    }
  }

  const isVeto = vetoReasons.length > 0;
  const score = isVeto ? 0.0 : Math.max(0.0, 100.0 - scoreDeduction);
  const status = isVeto ? 'VETO' : (warningFlags.length > 0 ? 'FLAG' : 'PASS');

  return {
    principle: 'promoter-pledging',
    name: 'Promoter Pledging & Related-Party Transactions',
    ticker,
    status,
    score,
    is_veto: isVeto,
    metrics: {
      promoter_pledging_pct: promoterPledgingPct !== null ? round2(promoterPledgingPct) : null,
      promoter_holding_pct: promoterHoldingPct !== null ? round2(promoterHoldingPct) : null,
      related_party_transactions_pct: rptPct !== null ? round2(rptPct) : null
    },
    veto_reasons: vetoReasons,
    warning_flags: warningFlags,
    summary: isVeto
      ? `CRITICAL PROMOTER / RPT VETO: ${vetoReasons.join('; ')}`
      : (warningFlags.length > 0 ? `FLAG: ${warningFlags.join('; ')}` : 'PASS: Clean promoter ownership and negligible related-party transactions verified.')
  };
}

module.exports = {
  evaluatePromoterPledging
};

