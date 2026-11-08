'use strict';

/**
 * Multi-account cashflow pooling, internal transfer netting,
 * and currency normalization for True Strategy XIRR.
 */

const DEFAULT_FX_RATES = {
  'USD/INR': 87.2,
  'INR/USD': 0.011468,
  'INR/INR': 1.0,
  'USD/USD': 1.0
};

function round2(val) {
  return Math.round(val * 100) / 100;
}

function round4(val) {
  return Math.round(val * 10000) / 10000;
}

/**
 * Resolve FX rate from account currency to strategy base currency.
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @param {object} [customFxRates={}]
 * @returns {number}
 */
function resolveFxRate(fromCurrency, toCurrency, customFxRates = {}) {
  if (fromCurrency === toCurrency) return 1.0;

  const pair = `${fromCurrency}/${toCurrency}`;
  if (customFxRates && typeof customFxRates[pair] === 'number') {
    return customFxRates[pair];
  }

  const invPair = `${toCurrency}/${fromCurrency}`;
  if (customFxRates && typeof customFxRates[invPair] === 'number' && customFxRates[invPair] > 0) {
    return round4(1 / customFxRates[invPair]);
  }

  if (DEFAULT_FX_RATES[pair]) return DEFAULT_FX_RATES[pair];
  if (DEFAULT_FX_RATES[invPair]) return round4(1 / DEFAULT_FX_RATES[invPair]);

  throw new Error(`Cannot resolve FX rate from ${fromCurrency} to ${toCurrency}`);
}

/**
 * Aggregate account ledgers into a normalized strategy cashflow stream.
 * @param {Array<object>} accountLedgers
 * @param {object} options
 * @param {string} options.strategyId
 * @param {string} [options.baseCurrency='INR']
 * @param {number} [options.terminalEquity=0]
 * @param {string} [options.evalDate]
 * @param {object} [options.customFxRates={}]
 * @returns {{
 *   cashflows: Array<object>,
 *   account_cashflows_summary: Array<object>,
 *   total_deposited: number,
 *   total_withdrawn: number,
 *   net_invested: number,
 *   terminal_equity: number,
 *   eval_date: string
 * }}
 */
function aggregateAccountLedgers(accountLedgers, options = {}) {
  const strategyId = options.strategyId || 'strategy_portfolio';
  const baseCurrency = options.baseCurrency || 'INR';
  const terminalEquity = typeof options.terminalEquity === 'number' ? options.terminalEquity : 0;
  const customFxRates = options.customFxRates || {};

  const assignedAccountIds = new Set(accountLedgers.map(l => l.account_id));
  const rawTransactions = [];
  const accountSummaries = [];

  // Pass 1: Extract and normalize transactions per account
  for (const ledger of accountLedgers) {
    const accId = ledger.account_id;
    const broker = ledger.broker || accId;
    const curr = ledger.currency || baseCurrency;
    const fxRate = resolveFxRate(curr, baseCurrency, customFxRates);

    let accDepositedBase = 0;
    let accWithdrawnBase = 0;
    let accTransfersNettedBase = 0;
    let accFrictionBase = 0;

    const txList = Array.isArray(ledger.transactions) ? ledger.transactions : [];

    for (const tx of txList) {
      const amountInBase = round2(tx.amount * fxRate);
      rawTransactions.push({
        account_id: accId,
        broker,
        original_currency: curr,
        fx_rate: fxRate,
        date: tx.date,
        original_amount: tx.amount,
        amount_base: amountInBase,
        category: tx.category || (tx.amount < 0 ? 'DEPOSIT' : 'WITHDRAWAL'),
        transfer_id: tx.transfer_id || null,
        counterparty_account: tx.counterparty_account || null,
        description: tx.description || ''
      });
    }

    // Process friction summary if present
    if (ledger.friction_summary) {
      const rawFriction = Number(ledger.friction_summary.total_friction || 0);
      accFrictionBase = round2(rawFriction * fxRate);
    }

    accountSummaries.push({
      account_id: accId,
      broker,
      original_currency: curr,
      fx_rate: fxRate,
      total_deposited_base: 0,
      total_withdrawn_base: 0,
      internal_transfers_netted_base: 0,
      friction_base: accFrictionBase
    });
  }

  // Pass 2: Identify and net internal transfers between assigned accounts
  // Matching criteria: same transfer_id OR matching counterparty and opposite converted amounts
  const internalTransferIndices = new Set();

  for (let i = 0; i < rawTransactions.length; i++) {
    const txA = rawTransactions[i];
    if (txA.category !== 'INTERNAL_TRANSFER' && !txA.transfer_id) continue;
    if (internalTransferIndices.has(i)) continue;

    for (let j = i + 1; j < rawTransactions.length; j++) {
      if (internalTransferIndices.has(j)) continue;
      const txB = rawTransactions[j];

      const matchById = txA.transfer_id && txB.transfer_id && txA.transfer_id === txB.transfer_id;
      const matchByAccounts = txA.counterparty_account === txB.account_id &&
                              txB.counterparty_account === txA.account_id;
      const amountOpposite = Math.abs(txA.amount_base + txB.amount_base) < 1.0; // opposite signs cancel

      if (matchById || (matchByAccounts && amountOpposite)) {
        internalTransferIndices.add(i);
        internalTransferIndices.add(j);

        const nettedVal = Math.abs(txA.amount_base);
        const summA = accountSummaries.find(s => s.account_id === txA.account_id);
        const summB = accountSummaries.find(s => s.account_id === txB.account_id);
        if (summA) summA.internal_transfers_netted_base += nettedVal;
        if (summB) summB.internal_transfers_netted_base += nettedVal;
        break;
      }
    }
  }

  // Pass 3: Assemble external boundary cashflows
  const finalCashflows = [];
  let totalDeposited = 0;
  let totalWithdrawn = 0;
  let latestDate = '1970-01-01';

  for (let idx = 0; idx < rawTransactions.length; idx++) {
    const tx = rawTransactions[idx];
    if (tx.date > latestDate) latestDate = tx.date;

    if (internalTransferIndices.has(idx)) {
      // Net internal transfer out of return calculations
      continue;
    }

    const summ = accountSummaries.find(s => s.account_id === tx.account_id);

    // External deposits are negative investor cashflows
    if (tx.category === 'DEPOSIT' || tx.amount_base < 0) {
      const depAmt = Math.abs(tx.amount_base);
      totalDeposited += depAmt;
      if (summ) summ.total_deposited_base += depAmt;

      finalCashflows.push({
        date: tx.date,
        amount: -depAmt,
        category: 'DEPOSIT',
        account_id: tx.account_id,
        description: tx.description || `Deposit to ${tx.broker}`,
        original_amount: tx.original_amount,
        original_currency: tx.original_currency,
        fx_rate: tx.fx_rate
      });
    } else {
      // External withdrawals and dividends are positive investor returns
      const withAmt = Math.abs(tx.amount_base);
      totalWithdrawn += withAmt;
      if (summ) summ.total_withdrawn_base += withAmt;

      finalCashflows.push({
        date: tx.date,
        amount: withAmt,
        category: tx.category === 'DIVIDEND' ? 'DIVIDEND' : 'WITHDRAWAL',
        account_id: tx.account_id,
        description: tx.description || `${tx.category} from ${tx.broker}`,
        original_amount: tx.original_amount,
        original_currency: tx.original_currency,
        fx_rate: tx.fx_rate
      });
    }
  }

  // Pass 4: Determine evaluation cutoff date & inject terminal equity
  const evalDate = options.evalDate || latestDate || new Date().toISOString().slice(0, 10);

  if (terminalEquity > 0) {
    finalCashflows.push({
      date: evalDate,
      amount: round2(terminalEquity),
      category: 'TERMINAL_EQUITY',
      account_id: strategyId,
      description: 'Terminal Portfolio Valuation (Blended Equity Market Value + Pooled Cash)'
    });
  }

  // Sort cashflows chronologically
  finalCashflows.sort((a, b) => a.date.localeCompare(b.date));

  // Round summary figures
  for (const s of accountSummaries) {
    s.total_deposited_base = round2(s.total_deposited_base);
    s.total_withdrawn_base = round2(s.total_withdrawn_base);
    s.internal_transfers_netted_base = round2(s.internal_transfers_netted_base);
    s.friction_base = round2(s.friction_base);
  }

  return {
    cashflows: finalCashflows,
    account_cashflows_summary: accountSummaries,
    total_deposited: round2(totalDeposited),
    total_withdrawn: round2(totalWithdrawn),
    net_invested: round2(totalDeposited - totalWithdrawn),
    terminal_equity: round2(terminalEquity),
    eval_date: evalDate
  };
}

module.exports = {
  resolveFxRate,
  aggregateAccountLedgers,
  DEFAULT_FX_RATES
};

