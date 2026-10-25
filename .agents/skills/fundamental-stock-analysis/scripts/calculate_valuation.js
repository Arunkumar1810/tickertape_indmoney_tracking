#!/usr/bin/env node
'use strict';

/**
 * calculate_valuation.js
 * Deterministic financial calculator for value investing formulas:
 * - Graham Liquidating Floor & Net-Net Working Capital (NNWC)
 * - Graham Number
 * - Buffett-Munger Owner Earnings & 5-step DuPont Decomposition
 * - Peter Lynch PEG Ratio & Inventory-to-Revenue Divergence
 * - Seth Klarman Solvency & Accrual Quality Checks
 */

function calculateGrahamNumber(eps, bvps) {
  if (eps <= 0 || bvps <= 0) return null;
  return Math.sqrt(22.5 * eps * bvps);
}

function calculateNNWC(cashAndEquivalents, receivables, inventory, totalLiabilities) {
  return cashAndEquivalents + (0.75 * receivables) + (0.50 * inventory) - totalLiabilities;
}

function calculateOwnerEarnings(operatingCashFlow, maintenanceCapEx) {
  return operatingCashFlow - maintenanceCapEx;
}

function calculate5StepDuPont({ netIncome, ebt, ebit, revenue, totalAssets, totalEquity }) {
  if (!ebt || !ebit || !revenue || !totalAssets || !totalEquity) return null;
  const taxBurden = netIncome / ebt;
  const interestBurden = ebt / ebit;
  const operatingMargin = ebit / revenue;
  const assetTurnover = revenue / totalAssets;
  const financialLeverage = totalAssets / totalEquity;
  const roe = taxBurden * interestBurden * operatingMargin * assetTurnover * financialLeverage;

  return {
    taxBurden: Number(taxBurden.toFixed(4)),
    interestBurden: Number(interestBurden.toFixed(4)),
    operatingMargin: Number((operatingMargin * 100).toFixed(2)), // in %
    assetTurnover: Number(assetTurnover.toFixed(3)),
    financialLeverage: Number(financialLeverage.toFixed(2)),
    calculatedRoePct: Number((roe * 100).toFixed(2))
  };
}

function calculateLynchMetrics({ pe, epsGrowthRate, revenueGrowthRate, inventoryGrowthRate }) {
  const peg = (epsGrowthRate && epsGrowthRate > 0) ? (pe / epsGrowthRate) : null;
  const inventoryDivergence = (inventoryGrowthRate != null && revenueGrowthRate != null)
    ? (inventoryGrowthRate - revenueGrowthRate)
    : null;
  const inventoryFlag = inventoryDivergence != null && inventoryDivergence > 5.0;

  return {
    peg: peg ? Number(peg.toFixed(2)) : null,
    inventoryDivergencePct: inventoryDivergence ? Number(inventoryDivergence.toFixed(2)) : null,
    inventoryFlag
  };
}

function calculateKlarmanSolvency({ totalDebt, cash, ebitda, ebit, interestExpense, netIncome, operatingCashFlow }) {
  const netDebt = totalDebt - cash;
  const netDebtToEbitda = ebitda > 0 ? (netDebt / ebitda) : null;
  const interestCoverage = (interestExpense && interestExpense > 0) ? (ebit / interestExpense) : null;
  const accrualGap = operatingCashFlow - netIncome;

  return {
    netDebt: Number(netDebt.toFixed(2)),
    netDebtToEbitda: netDebtToEbitda ? Number(netDebtToEbitda.toFixed(2)) : null,
    isNetDebtSafe: netDebtToEbitda !== null ? netDebtToEbitda < 2.5 : null,
    interestCoverage: interestCoverage ? Number(interestCoverage.toFixed(2)) : null,
    accrualGap: Number(accrualGap.toFixed(2)),
    accrualQualityHealthy: operatingCashFlow >= netIncome
  };
}

// CLI usage with JSON input or file or stdin
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);
  let rawInput = '';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`calculate_valuation.js - Deterministic Financial Valuation Calculator

Usage:
  node calculate_valuation.js '<JSON_PAYLOAD>'
  node calculate_valuation.js --file <PATH_TO_JSON>
  cat payload.json | node calculate_valuation.js

Options:
  -h, --help    Show this help message and exit
  --file        Path to a JSON file containing the valuation payload

Input JSON Structure:
  {
    "eps": 60.5,
    "bvps": 220.0,
    "cash": 15000,
    "receivables": 8000,
    "inventory": 4000,
    "totalLiabilities": 12000,
    "operatingCashFlow": 24000,
    "maintenanceCapEx": 4000,
    "dupont": {
      "netIncome": 25000,
      "ebt": 32000,
      "ebit": 35000,
      "revenue": 150000,
      "totalAssets": 120000,
      "totalEquity": 85000
    },
    "lynch": {
      "pe": 24.5,
      "epsGrowthRate": 14.2,
      "revenueGrowthRate": 12.0,
      "inventoryGrowthRate": 8.0
    },
    "klarman": {
      "totalDebt": 10000,
      "cash": 15000,
      "ebitda": 38000,
      "ebit": 35000,
      "interestExpense": 1200,
      "netIncome": 25000,
      "operatingCashFlow": 28000
    }
  }`);
    process.exit(0);
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    rawInput = fs.readFileSync(args[fileIdx + 1], 'utf8');
  } else if (args[0] && !args[0].startsWith('--')) {
    rawInput = args.join(' ');
  } else {
    try {
      rawInput = fs.readFileSync(0, 'utf8');
    } catch (e) {
      // no stdin
    }
  }

  if (!rawInput.trim()) {
    console.error('Error: Missing JSON input. Run with --help for usage information.');
    process.exit(1);
  }

  try {
    const data = JSON.parse(rawInput);
    const results = {};

    if (data.eps != null && data.bvps != null) {
      results.grahamNumber = calculateGrahamNumber(data.eps, data.bvps);
    }
    if (data.cash != null && data.receivables != null && data.inventory != null && data.totalLiabilities != null) {
      results.nnwc = calculateNNWC(data.cash, data.receivables, data.inventory, data.totalLiabilities);
    }
    if (data.operatingCashFlow != null && data.maintenanceCapEx != null) {
      results.ownerEarnings = calculateOwnerEarnings(data.operatingCashFlow, data.maintenanceCapEx);
    }
    if (data.dupont) {
      results.dupont = calculate5StepDuPont(data.dupont);
    }
    if (data.lynch) {
      results.lynch = calculateLynchMetrics(data.lynch);
    }
    if (data.klarman) {
      results.klarman = calculateKlarmanSolvency(data.klarman);
    }

    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error calculating valuation metrics:', err.message);
    process.exit(1);
  }
}

module.exports = {
  calculateGrahamNumber,
  calculateNNWC,
  calculateOwnerEarnings,
  calculate5StepDuPont,
  calculateLynchMetrics,
  calculateKlarmanSolvency
};
