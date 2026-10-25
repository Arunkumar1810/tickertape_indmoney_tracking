const XirrSolver = require('./xirr_solver');

/**
 * Computes dual-perspective XIRR and friction drag metrics
 */
class FrictionEngine {
  /**
   * Run comprehensive XIRR analysis
   */
  static analyze(params = {}) {
    const evalDate = params.evalDate || new Date().toISOString().split('T')[0];
    const fundCashflows = params.fundCashflows || [];
    const holdings = params.holdings || [];
    const margin = params.margin || { available_cash: 0, net_margin: 0 };
    const groupedTrades = params.groupedTrades || {};
    const subAnnualDaysThreshold = params.subAnnualDaysThreshold || 90;
    const earnedDividends = params.earnedDividends || [];

    // Helper to normalize symbol
    const cleanSym = s => (s || '').trim().toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, '');

    // 1. Calculate Demat Equity & Cash
    let totalHoldingsMarketValue = 0;
    let totalHoldingsInvested = 0;

    const holdingsMap = new Map();
    for (const h of holdings) {
      const isin = h.isin || h.tradingsymbol;
      holdingsMap.set(isin, h);
      totalHoldingsMarketValue += (h.current_value || (h.quantity * h.last_price) || 0);
      totalHoldingsInvested += (h.invested || (h.quantity * h.average_price) || 0);
    }

    const availableCash = Number(margin.available_cash || margin.net_margin || 0);
    const totalAccountEquity = totalHoldingsMarketValue + availableCash;

    // 2. Compute True Investor XIRR (Account Level)
    const investorCashflows = [...fundCashflows];

    // Inject Verified Dividend Inflows (+Amount credited on ex-date)
    let totalDividendsEarned = 0;
    for (const d of earnedDividends) {
      totalDividendsEarned += d.amount;
      investorCashflows.push({
        date: d.exDate,
        amount: d.amount,
        category: 'DIVIDEND',
        description: `Dividend: ${d.symbol} (₹${d.dividendPerShare}/sh x ${d.quantity} sh)`
      });
    }

    // Inject Terminal Valuation on evalDate
    if (totalAccountEquity > 0) {
      investorCashflows.push({
        date: evalDate,
        amount: totalAccountEquity,
        category: 'TERMINAL_EQUITY',
        description: 'Current Net Account Value (Holdings + Cash Margin)'
      });
    }

    const investorXirrResult = XirrSolver.calculate(investorCashflows, { subAnnualDaysThreshold });

    let totalDeposited = 0;
    let totalWithdrawn = 0;
    for (const cf of fundCashflows) {
      if (cf.amount < 0) totalDeposited += Math.abs(cf.amount);
      if (cf.amount > 0 && cf.category === 'PAYOUT') totalWithdrawn += cf.amount;
    }

    // Combine symbols from active holdings and historical trades
    const allSymbols = new Set([
      ...holdings.map(h => cleanSym(h.tradingsymbol)),
      ...Object.keys(groupedTrades).map(k => cleanSym(groupedTrades[k].symbol || k))
    ]);

    const stockResults = [];
    const allStockTradeCashflows = [];

    for (const sym of allSymbols) {
      // Find trade history
      let tradesForStock = [];
      for (const k of Object.keys(groupedTrades)) {
        const tradeSym = cleanSym(groupedTrades[k].symbol || k);
        if (tradeSym === sym) {
          tradesForStock = groupedTrades[k].trades || [];
          break;
        }
      }

      // Find active holding if any
      const activeHolding = holdings.find(h => cleanSym(h.tradingsymbol) === sym);

      const stockCashflows = [];

      for (const t of tradesForStock) {
        const amt = t.type === 'BUY' ? -Math.abs(t.amount) : Math.abs(t.amount);
        stockCashflows.push({
          date: t.date,
          amount: amt,
          type: t.type
        });
        allStockTradeCashflows.push({
          date: t.date,
          amount: amt,
          symbol: sym
        });
      }

      // Reconcile unrecorded prior share acquisitions (e.g. trades older than tradebook API window)
      if (activeHolding && activeHolding.quantity > 0) {
        const tradeNetQty = tradesForStock.reduce((acc, t) => acc + (t.type === 'BUY' ? Number(t.quantity || 0) : -Number(t.quantity || 0)), 0);
        const tradeInvested = tradesForStock.reduce((acc, t) => acc + (t.type === 'BUY' ? Number(t.amount || 0) : 0), 0);

        if (activeHolding.quantity > tradeNetQty) {
          const unrecordedQty = activeHolding.quantity - tradeNetQty;
          const holdingTotalCost = Number(activeHolding.invested || (activeHolding.quantity * activeHolding.average_price));
          const unrecordedCost = Math.max(0, holdingTotalCost - tradeInvested) || (unrecordedQty * Number(activeHolding.average_price || 0));
          const unrecordedDate = activeHolding.buyDate || (tradesForStock.length > 0 ? tradesForStock[0].date : '2024-01-01');

          if (unrecordedCost > 0) {
            stockCashflows.unshift({
              date: unrecordedDate,
              amount: -unrecordedCost,
              type: 'BUY',
              description: `Opening acquisition balance (${unrecordedQty} sh @ avg ₹${activeHolding.average_price})`
            });
            allStockTradeCashflows.push({
              date: unrecordedDate,
              amount: -unrecordedCost,
              symbol: sym
            });
          }
        }
      }

      // Inject stock-specific earned dividends
      let stockDividends = 0;
      for (const d of earnedDividends) {
        if (cleanSym(d.symbol) === sym) {
          stockDividends += d.amount;
          stockCashflows.push({
            date: d.exDate,
            amount: d.amount,
            type: 'DIVIDEND',
            description: `Dividend (₹${d.dividendPerShare}/sh x ${d.quantity} sh)`
          });
          allStockTradeCashflows.push({
            date: d.exDate,
            amount: d.amount,
            symbol: sym
          });
        }
      }

      // If active holding exists, inject terminal stock value
      if (activeHolding && activeHolding.quantity > 0) {
        const val = activeHolding.current_value || (activeHolding.quantity * activeHolding.last_price);
        if (val > 0) {
          stockCashflows.push({
            date: evalDate,
            amount: val,
            type: 'TERMINAL_STOCK'
          });
        }
      } else if (stockCashflows.length === 0 && activeHolding) {
        // Fallback if no detailed historical trades imported yet:
        // Use average_price and quantity as proxy acquisition
        const approxBuyDate = params.defaultBuyDate || '2024-01-01';
        stockCashflows.push({
          date: approxBuyDate,
          amount: -Math.abs(activeHolding.invested),
          type: 'BUY'
        });
        stockCashflows.push({
          date: evalDate,
          amount: activeHolding.current_value,
          type: 'TERMINAL_STOCK'
        });
      }

      const stockXirr = XirrSolver.calculate(stockCashflows, { subAnnualDaysThreshold });
      const holdingGain = (activeHolding ? (activeHolding.current_value - activeHolding.invested) : 0) + stockDividends;
      const accurateAbsReturn = (activeHolding && activeHolding.invested > 0)
        ? (holdingGain / activeHolding.invested)
        : stockXirr.absoluteReturn;

      stockResults.push({
        symbol: sym,
        isin: activeHolding ? activeHolding.isin : '',
        quantity: activeHolding ? activeHolding.quantity : 0,
        averagePrice: activeHolding ? activeHolding.average_price : 0,
        lastPrice: activeHolding ? activeHolding.last_price : 0,
        invested: activeHolding ? activeHolding.invested : 0,
        currentValue: activeHolding ? activeHolding.current_value : 0,
        pnl: activeHolding ? (activeHolding.current_value - activeHolding.invested) : 0,
        dividendsEarned: stockDividends,
        totalGain: holdingGain,
        xirr: stockXirr.xirr,
        isSubAnnual: stockXirr.isSubAnnual,
        daysHeld: stockXirr.daysHeld,
        absoluteReturn: accurateAbsReturn,
        cashflows: stockCashflows
      });
    }

    // 4. Compute Gross Stock-Level XIRR (excluding cash drag & broker fees)
    for (const h of holdings) {
      if (h.quantity > 0 && h.current_value > 0) {
        allStockTradeCashflows.push({
          date: evalDate,
          amount: h.current_value
        });
      }
    }
    const grossStockXirrResult = XirrSolver.calculate(allStockTradeCashflows, { subAnnualDaysThreshold });

    // 5. Calculate Friction Drag Spread
    let frictionDragPct = null;
    if (grossStockXirrResult.xirr !== null && investorXirrResult.xirr !== null) {
      frictionDragPct = (grossStockXirrResult.xirr - investorXirrResult.xirr) * 100;
    }

    const netProfit = (totalAccountEquity + totalWithdrawn + totalDividendsEarned) - totalDeposited;

    return {
      evalDate,
      summary: {
        totalDeposited,
        totalWithdrawn,
        totalDividendsEarned,
        netInvestedCapital: totalDeposited - totalWithdrawn,
        totalHoldingsMarketValue,
        availableCash,
        totalAccountEquity,
        netProfit,
        investorXirr: investorXirrResult.xirr,
        investorAbsoluteReturn: investorXirrResult.absoluteReturn,
        isInvestorSubAnnual: investorXirrResult.isSubAnnual,
        grossStockXirr: grossStockXirrResult.xirr,
        frictionDragPct,
        frictionNote: 'Spread reflects STT, DP charges (₹13.5+GST), exchange fees, stamp duty, AMC, and uninvested cash drag.'
      },
      holdings: stockResults.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0)),
      investorCashflows
    };
  }
}

module.exports = FrictionEngine;
