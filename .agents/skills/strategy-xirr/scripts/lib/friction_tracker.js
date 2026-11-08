'use strict';

/**
 * Itemized friction cost accounting and drag analysis across broker accounts.
 */

const { resolveFxRate } = require('./ledger_aggregator');

function round2(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Calculate consolidated friction breakdown across multi-account ledgers.
 * @param {Array<object>} accountLedgers
 * @param {object} options
 * @param {string} [options.baseCurrency='INR']
 * @param {object} [options.customFxRates={}]
 * @param {number} [options.netInvested=0]
 * @returns {{
 *   brokerage: number,
 *   stt: number,
 *   fx_drag: number,
 *   taxes_and_charges: number,
 *   total_friction: number,
 *   friction_drag_pct: number
 * }}
 */
function calculateFrictionBreakdown(accountLedgers, options = {}) {
  const baseCurrency = options.baseCurrency || 'INR';
  const customFxRates = options.customFxRates || {};
  const netInvested = typeof options.netInvested === 'number' ? options.netInvested : 0;

  let totalBrokerage = 0;
  let totalStt = 0;
  let totalFxDrag = 0;
  let totalTaxesAndCharges = 0;

  for (const ledger of accountLedgers) {
    const curr = ledger.currency || baseCurrency;
    const fxRate = resolveFxRate(curr, baseCurrency, customFxRates);

    if (ledger.friction_summary) {
      const fs = ledger.friction_summary;
      totalBrokerage += (Number(fs.brokerage) || 0) * fxRate;
      totalStt += (Number(fs.stt) || 0) * fxRate;
      totalFxDrag += (Number(fs.fx_drag) || 0) * fxRate;
      totalTaxesAndCharges += (Number(fs.taxes_and_charges || fs.taxes) || 0) * fxRate;
    }
  }

  const totalFriction = totalBrokerage + totalStt + totalFxDrag + totalTaxesAndCharges;
  const frictionDragPct = netInvested > 0
    ? (totalFriction / netInvested) * 100
    : 0;

  return {
    brokerage: round2(totalBrokerage),
    stt: round2(totalStt),
    fx_drag: round2(totalFxDrag),
    taxes_and_charges: round2(totalTaxesAndCharges),
    total_friction: round2(totalFriction),
    friction_drag_pct: round2(frictionDragPct)
  };
}

module.exports = {
  calculateFrictionBreakdown
};

