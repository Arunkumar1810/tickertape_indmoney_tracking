#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_BANK_BALANCE_PATH,
  loadBankBalance,
  saveBankBalance,
  getLiquidCashSummary
} = require('./framework/bank_balance');

const USAGE = `
Usage: node scripts/bank_balance.js [OPTIONS]

Manage user bank balance for agent-buffet and portfolio valuation skills.

Options:
  --show                     Display current bank balance and liquid cash summary (default)
  --set <AMOUNT>             Set total bank balance (e.g. --set 50000)
  --add <NAME> <AMOUNT> [CURRENCY]  Add or update a specific bank account entry
  --currency <CURRENCY>      Set primary currency (default: INR)
  --json                     Output result as JSON
  --help, -h                 Show this help message

Configuration file:
  config/bank_balance.json
`;

function parseArgs(argv) {
  const args = {
    action: 'show',
    amount: null,
    accountName: null,
    currency: 'INR',
    json: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--show') {
      args.action = 'show';
    } else if (arg === '--set') {
      args.action = 'set';
      args.amount = parseFloat(argv[++i]);
    } else if (arg === '--add') {
      args.action = 'add';
      args.accountName = argv[++i];
      args.amount = parseFloat(argv[++i]);
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        args.currency = argv[++i].toUpperCase();
      }
    } else if (arg === '--currency') {
      args.currency = argv[++i].toUpperCase();
    } else if (arg === '--json') {
      args.json = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.log(USAGE);
      process.exit(1);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const current = loadBankBalance();

  if (args.action === 'set') {
    if (isNaN(args.amount) || args.amount < 0) {
      console.error('Error: --set requires a valid non-negative number.');
      process.exit(1);
    }

    const updated = {
      total_bank_balance: args.amount,
      currency: args.currency || current.currency || 'INR',
      accounts: current.accounts.length > 0
        ? current.accounts
        : [{ account_name: 'Primary Savings', balance: args.amount, currency: args.currency || 'INR' }]
    };

    saveBankBalance(updated);
    if (args.json) {
      console.log(JSON.stringify(loadBankBalance(), null, 2));
    } else {
      console.log(`\n✔ Bank balance updated successfully.`);
      console.log(`  File: ${DEFAULT_BANK_BALANCE_PATH}`);
      console.log(`  Total Bank Balance: ${updated.currency} ${args.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`);
    }
    return;
  }

  if (args.action === 'add') {
    if (!args.accountName || isNaN(args.amount) || args.amount < 0) {
      console.error('Error: --add requires <NAME> and valid non-negative <AMOUNT>.');
      process.exit(1);
    }

    const accounts = [...current.accounts];
    const existingIdx = accounts.findIndex(a => a.account_name.toLowerCase() === args.accountName.toLowerCase());
    const accountEntry = {
      account_name: args.accountName,
      balance: args.amount,
      currency: args.currency,
      updated_at: new Date().toISOString()
    };

    if (existingIdx !== -1) {
      accounts[existingIdx] = accountEntry;
    } else {
      accounts.push(accountEntry);
    }

    const newTotal = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    saveBankBalance({
      total_bank_balance: newTotal,
      currency: args.currency || current.currency || 'INR',
      accounts
    });

    if (args.json) {
      console.log(JSON.stringify(loadBankBalance(), null, 2));
    } else {
      console.log(`\n✔ Account "${args.accountName}" saved successfully.`);
      console.log(`  File: ${DEFAULT_BANK_BALANCE_PATH}`);
      console.log(`  Total Bank Balance: ${args.currency} ${newTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`);
    }
    return;
  }

  // Action: show
  const repoRoot = path.resolve(__dirname, '..');
  const combinedPath = path.join(repoRoot, 'reports', 'accounts', 'combined.json');
  let portfolio = null;
  if (fs.existsSync(combinedPath)) {
    try { portfolio = JSON.parse(fs.readFileSync(combinedPath, 'utf8')); } catch { }
  }

  const liquid = getLiquidCashSummary(portfolio);

  if (args.json) {
    console.log(JSON.stringify({ bank: current, liquid_summary: liquid }, null, 2));
    return;
  }

  console.log('\n===============================================================');
  console.log('  LIQUID CASH & BANK BALANCE STATUS');
  console.log('===============================================================');
  console.log(`Config file       : ${DEFAULT_BANK_BALANCE_PATH}`);
  console.log(`Bank Balance File : ${current.exists ? 'Configured' : 'Not configured yet (Run with --set <AMOUNT>)'}`);
  console.log(`Total Bank Balance: ${current.currency} ${current.total_bank_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  if (current.updated_at) {
    console.log(`Last Updated      : ${current.updated_at}`);
  }
  if (current.accounts.length > 0) {
    console.log('\nRegistered Accounts:');
    current.accounts.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.account_name}: ${a.currency || current.currency} ${(a.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    });
  }

  console.log('\nUnified Liquidity Summary:');
  console.log(`  Broker Cash Margin : ${liquid.currency} ${liquid.broker_cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  Bank Balance       : ${liquid.currency} ${liquid.bank_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log(`  Total Liquid Cash  : ${liquid.currency} ${liquid.total_liquid_cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  console.log('===============================================================\n');
}

if (require.main === module) {
  main();
}

