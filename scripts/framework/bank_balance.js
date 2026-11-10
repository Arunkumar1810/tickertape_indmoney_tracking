'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BANK_BALANCE_PATH = path.join(REPO_ROOT, 'config', 'bank_balance.json');

/**
 * Load user bank balance configuration.
 *
 * @param {string} [customPath] - Path to bank_balance.json
 * @returns {{
 *   total_bank_balance: number,
 *   currency: string,
 *   accounts: Array<{ account_name: string, bank?: string, balance: number, currency: string, updated_at?: string }>,
 *   updated_at: string | null,
 *   exists: boolean
 * }}
 */
function loadBankBalance(customPath) {
  const targetPath = customPath || DEFAULT_BANK_BALANCE_PATH;
  if (!fs.existsSync(targetPath)) {
    return {
      total_bank_balance: 0.0,
      currency: 'INR',
      accounts: [],
      updated_at: null,
      exists: false
    };
  }

  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const data = JSON.parse(raw);
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];

    let total = 0.0;
    if (typeof data.total_bank_balance === 'number' && Number.isFinite(data.total_bank_balance)) {
      total = data.total_bank_balance;
    } else if (accounts.length > 0) {
      total = accounts.reduce((acc, a) => acc + (typeof a.balance === 'number' && Number.isFinite(a.balance) ? a.balance : 0), 0);
    }

    return {
      total_bank_balance: Number(total.toFixed(2)),
      currency: typeof data.currency === 'string' && data.currency.trim() ? data.currency.trim().toUpperCase() : 'INR',
      accounts,
      updated_at: data.updated_at || null,
      exists: true
    };
  } catch (err) {
    console.warn(`[WARN] Failed to parse bank balance from ${targetPath}:`, err.message);
    return {
      total_bank_balance: 0.0,
      currency: 'INR',
      accounts: [],
      updated_at: null,
      exists: false
    };
  }
}

/**
 * Save user bank balance configuration.
 *
 * @param {object} payload
 * @param {number} payload.total_bank_balance
 * @param {string} [payload.currency]
 * @param {Array} [payload.accounts]
 * @param {string} [customPath]
 * @returns {string} Target file path
 */
function saveBankBalance(payload, customPath) {
  const targetPath = customPath || DEFAULT_BANK_BALANCE_PATH;
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  let total = typeof payload.total_bank_balance === 'number' && Number.isFinite(payload.total_bank_balance)
    ? payload.total_bank_balance
    : accounts.reduce((acc, a) => acc + (typeof a.balance === 'number' && Number.isFinite(a.balance) ? a.balance : 0), 0);

  const doc = {
    updated_at: new Date().toISOString(),
    currency: (payload.currency || 'INR').toUpperCase(),
    total_bank_balance: Number(total.toFixed(2)),
    accounts
  };

  fs.writeFileSync(targetPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return targetPath;
}

/**
 * Get unified liquid cash summary combining broker cash margin and external bank balance.
 *
 * @param {object|null} portfolio - AccountHoldingsSnapshot or Combined portfolio
 * @param {string} [bankBalancePath] - Optional custom bank balance path
 * @returns {{
 *   broker_cash: number,
 *   bank_balance: number,
 *   total_liquid_cash: number,
 *   currency: string,
 *   has_bank_balance: boolean
 * }}
 */
function getLiquidCashSummary(portfolio, bankBalancePath) {
  let brokerCash = 0.0;
  if (portfolio && portfolio.summary && typeof portfolio.summary.available_cash === 'number') {
    brokerCash = portfolio.summary.available_cash;
  } else if (portfolio && portfolio.margin && typeof portfolio.margin.available_cash === 'number') {
    brokerCash = portfolio.margin.available_cash;
  }

  const bank = loadBankBalance(bankBalancePath);
  const total = Number((brokerCash + bank.total_bank_balance).toFixed(2));

  return {
    broker_cash: Number(brokerCash.toFixed(2)),
    bank_balance: bank.total_bank_balance,
    total_liquid_cash: total,
    currency: bank.currency || 'INR',
    has_bank_balance: bank.exists && bank.total_bank_balance > 0
  };
}

module.exports = {
  DEFAULT_BANK_BALANCE_PATH,
  loadBankBalance,
  saveBankBalance,
  getLiquidCashSummary
};

