/**
 * High-precision numerical XIRR solver
 * Combines analytical Newton-Raphson with bounded Bisection fallback
 */
class XirrSolver {
  /**
   * Calculate Net Present Value and its first derivative for rate r
   */
  static evalNpv(cashflows, d0, rate) {
    let npv = 0;
    let dnpv = 0;

    for (let i = 0; i < cashflows.length; i++) {
      const c = cashflows[i];
      const years = (c.dateObj - d0) / (1000 * 60 * 60 * 24 * 365);
      const discount = Math.pow(1 + rate, years);

      npv += c.amount / discount;
      dnpv += -years * c.amount / (discount * (1 + rate));
    }

    return { npv, dnpv };
  }

  /**
   * Main XIRR calculation method
   * @param {Array<{date: string, amount: number}>} rawCashflows
   * @param {Object} options
   */
  static calculate(rawCashflows, options = {}) {
    const subAnnualDaysThreshold = options.subAnnualDaysThreshold || 90;
    const maxIterations = options.maxIterations || 100;
    const tol = options.tolerance || 1e-7;

    if (!Array.isArray(rawCashflows) || rawCashflows.length < 2) {
      return {
        xirr: null,
        absoluteReturn: 0,
        status: 'INSUFFICIENT_DATA',
        message: 'At least 2 dated cashflows are required.'
      };
    }

    // Parse and sort cashflows by date
    const cashflows = rawCashflows
      .map(c => ({
        date: c.date,
        dateObj: new Date(c.date),
        amount: Number(c.amount)
      }))
      .filter(c => !isNaN(c.dateObj.getTime()) && Math.abs(c.amount) > 1e-4)
      .sort((a, b) => a.dateObj - b.dateObj);

    if (cashflows.length < 2) {
      return {
        xirr: null,
        absoluteReturn: 0,
        status: 'INSUFFICIENT_DATA',
        message: 'Valid dated cashflows with non-zero amounts required.'
      };
    }

    let hasPositive = false;
    let hasNegative = false;
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const c of cashflows) {
      if (c.amount > 0) {
        hasPositive = true;
        totalInflow += c.amount;
      } else {
        hasNegative = true;
        totalOutflow += Math.abs(c.amount);
      }
    }

    if (!hasPositive || !hasNegative) {
      return {
        xirr: null,
        absoluteReturn: 0,
        status: 'INVALID_SIGNS',
        message: 'Cash flows must contain at least one positive and one negative amount.'
      };
    }

    const d0 = cashflows[0].dateObj;
    const dLast = cashflows[cashflows.length - 1].dateObj;
    const totalDays = Math.round((dLast - d0) / (1000 * 60 * 60 * 24));
    const absoluteReturn = totalOutflow > 0 ? (totalInflow - totalOutflow) / totalOutflow : 0;

    // Sub-90 day annualization guardrail
    if (totalDays < subAnnualDaysThreshold) {
      return {
        xirr: null,
        xirrAnnualized: null,
        absoluteReturn,
        daysHeld: totalDays,
        isSubAnnual: true,
        status: 'SUB_ANNUAL',
        message: `Holding period (${totalDays} days) is under ${subAnnualDaysThreshold} days; annualized rate suppressed to avoid distortion.`
      };
    }

    // Try Newton-Raphson first
    let rate = 0.1; // 10% initial guess
    let converged = false;

    for (let i = 0; i < maxIterations; i++) {
      const { npv, dnpv } = XirrSolver.evalNpv(cashflows, d0, rate);

      if (Math.abs(npv) < tol) {
        converged = true;
        break;
      }

      if (Math.abs(dnpv) < 1e-12) {
        // Derivative too small, switch to Bisection
        break;
      }

      const nextRate = rate - npv / dnpv;

      // Check for runaway rates
      if (nextRate <= -0.999 || nextRate > 50) {
        break;
      }

      if (Math.abs(nextRate - rate) < tol) {
        rate = nextRate;
        converged = true;
        break;
      }

      rate = nextRate;
    }

    // If Newton-Raphson did not converge cleanly, fallback to bounded Bisection
    if (!converged) {
      let low = -0.99;
      let high = 10.0; // 1000%
      let fLow = XirrSolver.evalNpv(cashflows, d0, low).npv;
      let fHigh = XirrSolver.evalNpv(cashflows, d0, high).npv;

      if (fLow * fHigh <= 0) {
        for (let j = 0; j < 80; j++) {
          const mid = (low + high) / 2;
          const fMid = XirrSolver.evalNpv(cashflows, d0, mid).npv;

          if (Math.abs(fMid) < tol || (high - low) / 2 < tol) {
            rate = mid;
            converged = true;
            break;
          }

          if (fLow * fMid <= 0) {
            high = mid;
            fHigh = fMid;
          } else {
            low = mid;
            fLow = fMid;
          }
        }
      }
    }

    if (!converged || isNaN(rate)) {
      return {
        xirr: null,
        absoluteReturn,
        daysHeld: totalDays,
        isSubAnnual: false,
        status: 'INDETERMINATE',
        message: 'Numerical solver did not converge to a single rate.'
      };
    }

    return {
      xirr: rate,
      xirrAnnualized: rate,
      absoluteReturn,
      daysHeld: totalDays,
      isSubAnnual: false,
      status: 'CONVERGED',
      iterations: maxIterations
    };
  }
}

module.exports = XirrSolver;
