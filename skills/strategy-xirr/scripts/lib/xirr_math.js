'use strict';

/**
 * High-precision numerical XIRR solver
 * Combines analytical Newton-Raphson with bounded Bisection fallback
 * and enforces sub-90-day annualization guardrail.
 */

function round4(val) {
  return Math.round(val * 10000) / 10000;
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

/**
 * Calculate Net Present Value and its first derivative for rate r.
 * Uses 365.25 days per leap-year cycle for exact macroeconomic compounding.
 * @param {Array<{dateObj: Date, amount: number}>} cashflows
 * @param {Date} d0 Initial reference date
 * @param {number} rate Discount rate (decimal, e.g. 0.10)
 * @returns {{ npv: number, dnpv: number }}
 */
function evalNpv(cashflows, d0, rate) {
  let npv = 0;
  let dnpv = 0;

  for (let i = 0; i < cashflows.length; i++) {
    const c = cashflows[i];
    const years = (c.dateObj.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const discount = Math.pow(1 + rate, years);

    npv += c.amount / discount;
    dnpv += -years * c.amount / (discount * (1 + rate));
  }

  return { npv, dnpv };
}

/**
 * Bounded bisection fallback when Newton-Raphson stalls or oscillates.
 * @param {Array<{dateObj: Date, amount: number}>} cashflows
 * @param {Date} d0
 * @param {number} lowBound
 * @param {number} highBound
 * @param {number} tol
 * @param {number} maxIter
 * @returns {number|null}
 */
function solveBisection(cashflows, d0, lowBound = -0.999, highBound = 10.0, tol = 1e-7, maxIter = 100) {
  let a = lowBound;
  let b = highBound;

  const npvA = evalNpv(cashflows, d0, a).npv;
  const npvB = evalNpv(cashflows, d0, b).npv;

  if (npvA * npvB > 0) {
    // Both endpoints have same sign; no zero crossing in standard interval
    return null;
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const mid = (a + b) / 2;
    const { npv } = evalNpv(cashflows, d0, mid);

    if (Math.abs(npv) < tol || (b - a) / 2 < tol) {
      return mid;
    }

    if (evalNpv(cashflows, d0, a).npv * npv <= 0) {
      b = mid;
    } else {
      a = mid;
    }
  }

  return (a + b) / 2;
}

/**
 * Main Strategy XIRR calculation method.
 * @param {Array<{date: string, amount: number}>} rawCashflows
 * @param {object} [options]
 * @param {number} [options.subAnnualDaysThreshold=90]
 * @param {number} [options.tolerance=1e-7]
 * @param {number} [options.maxIterations=100]
 * @returns {{
 *   xirr: number|null,
 *   xirr_annualized: number|null,
 *   absolute_return: number,
 *   days_held: number,
 *   is_sub_annual: boolean,
 *   status: string,
 *   message?: string
 * }}
 */
function calculateXirr(rawCashflows, options = {}) {
  const subAnnualDaysThreshold = typeof options.subAnnualDaysThreshold === 'number'
    ? options.subAnnualDaysThreshold
    : 90;
  const tol = typeof options.tolerance === 'number' ? options.tolerance : 1e-7;
  const maxIterations = typeof options.maxIterations === 'number' ? options.maxIterations : 100;

  if (!Array.isArray(rawCashflows) || rawCashflows.length < 2) {
    return {
      xirr: null,
      xirr_annualized: null,
      absolute_return: 0,
      days_held: 0,
      is_sub_annual: false,
      status: 'INSUFFICIENT_DATA',
      message: 'At least 2 dated cashflows are required.'
    };
  }

  // Parse and sort cashflows by date ascending
  const cashflows = rawCashflows
    .map(c => ({
      date: c.date,
      dateObj: new Date(c.date + 'T00:00:00.000Z'),
      amount: Number(c.amount)
    }))
    .filter(c => !isNaN(c.dateObj.getTime()) && Math.abs(c.amount) > 1e-6)
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  if (cashflows.length < 2) {
    return {
      xirr: null,
      xirr_annualized: null,
      absolute_return: 0,
      days_held: 0,
      is_sub_annual: false,
      status: 'INSUFFICIENT_DATA',
      message: 'Valid dated cashflows with non-zero amounts required.'
    };
  }

  let hasPositive = false;
  let hasNegative = false;
  let totalDeposited = 0;
  let totalWithdrawnAndTerminal = 0;

  for (const c of cashflows) {
    if (c.amount > 0) {
      hasPositive = true;
      totalWithdrawnAndTerminal += c.amount;
    } else {
      hasNegative = true;
      totalDeposited += Math.abs(c.amount);
    }
  }

  if (!hasPositive || !hasNegative) {
    return {
      xirr: null,
      xirr_annualized: null,
      absolute_return: 0,
      days_held: 0,
      is_sub_annual: false,
      status: 'INVALID_SIGNS',
      message: 'Cash flows must contain at least one positive and one negative amount.'
    };
  }

  const d0 = cashflows[0].dateObj;
  const dLast = cashflows[cashflows.length - 1].dateObj;
  const daysHeld = Math.max(0, Math.round((dLast.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24)));
  const absoluteReturn = totalDeposited > 0
    ? ((totalWithdrawnAndTerminal - totalDeposited) / totalDeposited) * 100
    : 0;

  // Sub-90 day guardrail suppression
  if (daysHeld < subAnnualDaysThreshold) {
    return {
      xirr: null,
      xirr_annualized: null,
      absolute_return: round2(absoluteReturn),
      days_held: daysHeld,
      is_sub_annual: true,
      status: 'SUB_ANNUAL',
      message: `Duration (${daysHeld} days) is under ${subAnnualDaysThreshold}-day threshold. Annualized XIRR suppressed.`
    };
  }

  // Initial estimate for Newton-Raphson
  let rate = Math.min(Math.max(absoluteReturn / 100, -0.5), 1.0);
  if (isNaN(rate) || Math.abs(rate) < 1e-4) rate = 0.10;

  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    const { npv, dnpv } = evalNpv(cashflows, d0, rate);

    if (Math.abs(npv) < tol) {
      converged = true;
      break;
    }

    if (Math.abs(dnpv) < 1e-12 || isNaN(dnpv)) {
      // Derivative too flat or NaN; break to bisection
      break;
    }

    const nextRate = rate - npv / dnpv;

    // Check bounds
    if (nextRate <= -0.9999 || nextRate > 10.0 || isNaN(nextRate)) {
      break;
    }

    if (Math.abs(nextRate - rate) < tol) {
      rate = nextRate;
      converged = true;
      break;
    }

    rate = nextRate;
  }

  if (!converged) {
    // Attempt bisection fallback
    const bisectRate = solveBisection(cashflows, d0, -0.999, 10.0, tol, maxIterations * 2);
    if (bisectRate !== null) {
      rate = bisectRate;
      converged = true;
    }
  }

  if (!converged) {
    return {
      xirr: null,
      xirr_annualized: null,
      absolute_return: round2(absoluteReturn),
      days_held: daysHeld,
      is_sub_annual: false,
      status: 'CONVERGENCE_FAILED',
      message: 'Newton-Raphson and Bisection failed to converge to a valid root.'
    };
  }

  return {
    xirr: round4(rate),
    xirr_annualized: round2(rate * 100),
    absolute_return: round2(absoluteReturn),
    days_held: daysHeld,
    is_sub_annual: false,
    status: 'SUCCESS'
  };
}

module.exports = {
  evalNpv,
  solveBisection,
  calculateXirr,
  round4,
  round2
};

