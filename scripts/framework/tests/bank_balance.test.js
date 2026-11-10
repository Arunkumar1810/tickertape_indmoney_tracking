'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  loadBankBalance,
  saveBankBalance,
  getLiquidCashSummary
} = require('../bank_balance');

test('1. loadBankBalance returns default structure when file does not exist', () => {
  const tmpPath = path.join(os.tmpdir(), `non_existent_bank_${Date.now()}.json`);
  const res = loadBankBalance(tmpPath);
  assert.equal(res.exists, false);
  assert.equal(res.total_bank_balance, 0.0);
  assert.equal(res.currency, 'INR');
  assert.deepEqual(res.accounts, []);
});

test('2. saveBankBalance writes valid configuration and loadBankBalance reads it back accurately', () => {
  const tmpPath = path.join(os.tmpdir(), `test_bank_${Date.now()}.json`);
  try {
    saveBankBalance({
      total_bank_balance: 75000.50,
      currency: 'INR',
      accounts: [
        { account_name: 'HDFC Savings', balance: 50000.50, currency: 'INR' },
        { account_name: 'ICICI Emergency', balance: 25000.00, currency: 'INR' }
      ]
    }, tmpPath);

    const loaded = loadBankBalance(tmpPath);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.total_bank_balance, 75000.50);
    assert.equal(loaded.currency, 'INR');
    assert.equal(loaded.accounts.length, 2);
    assert.equal(loaded.accounts[0].account_name, 'HDFC Savings');
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

test('3. getLiquidCashSummary combines broker cash and external bank balance correctly', () => {
  const tmpPath = path.join(os.tmpdir(), `test_bank_liq_${Date.now()}.json`);
  try {
    saveBankBalance({
      total_bank_balance: 50000.0,
      currency: 'INR'
    }, tmpPath);

    const portfolio = {
      summary: {
        available_cash: 86.39
      }
    };

    const liquid = getLiquidCashSummary(portfolio, tmpPath);
    assert.equal(liquid.broker_cash, 86.39);
    assert.equal(liquid.bank_balance, 50000.0);
    assert.equal(liquid.total_liquid_cash, 50086.39);
    assert.equal(liquid.has_bank_balance, true);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
});

