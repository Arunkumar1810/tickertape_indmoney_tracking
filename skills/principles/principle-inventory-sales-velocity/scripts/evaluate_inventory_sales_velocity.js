#!/usr/bin/env node
'use strict';

/**
 * evaluate_inventory_sales_velocity.js:
 * Operational Inventory vs Sales Velocity Divergence Engine.
 * Detects channel-stuffing, demand slowdowns, and inventory accumulation traps.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Calculate Inventory vs Sales velocity divergence: Inventory Growth Rate - Sales Growth Rate.
 */
function calculateInventoryDivergence(inventoryGrowth, salesGrowth) {
  if (!isFiniteNumber(inventoryGrowth) || !isFiniteNumber(salesGrowth)) {
    return null;
  }
  return round2(inventoryGrowth - salesGrowth);
}

/**
 * Evaluates operational inventory velocity against revenue expansion.
 * @param {object} financials - NormalizedCompanyFinancials object
 * @returns {object} Evaluation result object
 */
function evaluateInventorySalesVelocity(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateInventorySalesVelocity requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'inventory-sales-velocity',
      name: 'Inventory vs Sales Velocity Divergence',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Basket (Bypasses Inventory Checks)',
      metrics: {
        inventory_divergence_pct: null,
        inventory_growth_pct: null,
        sales_growth_pct: null,
        has_inventory: false
      },
      observations: ['Passive index fund eliminates single-company inventory divergence risks.'],
      summary: 'Index ETF passive basket: Operational inventory checks bypassed.'
    };
  }

  const bal = financials.balance_sheet || {};
  const forensics = financials.forensics || {};

  const hasNoInventory = (bal.inventory === 0 || bal.inventory === null);

  let inventoryDivergence = null;
  let invGrowth = isFiniteNumber(forensics.inventory_growth_pct) ? Number(forensics.inventory_growth_pct) : null;
  let salesGrowth = isFiniteNumber(forensics.sales_growth_pct) ? Number(forensics.sales_growth_pct) : null;

  if (isFiniteNumber(forensics.inventory_growth_vs_sales_delta_pct)) {
    inventoryDivergence = Number(forensics.inventory_growth_vs_sales_delta_pct);
  } else if (invGrowth !== null && salesGrowth !== null) {
    inventoryDivergence = calculateInventoryDivergence(invGrowth, salesGrowth);
  } else if (hasNoInventory) {
    inventoryDivergence = 0.0;
  }

  const divergencePct = round2(inventoryDivergence);

  let score = 0;
  let status = 'PASS';
  let classification = 'Lean Working Capital & Fast Velocity';
  const observations = [];
  const redFlags = [];

  if (hasNoInventory) {
    score = 100;
    status = 'PASS';
    classification = 'Asset-Light / Service Business (No Inventory)';
    observations.push('Service or asset-light business model carries zero physical inventory risk.');
  } else if (divergencePct !== null) {
    if (divergencePct <= 0.0) {
      score = 100;
      status = 'PASS';
      classification = 'Healthy Inventory Velocity (Sales > Inventory)';
      observations.push(`Healthy inventory management: Sales growth outpaces inventory accumulation by ${Math.abs(divergencePct)}%.`);
    } else if (divergencePct <= 5.0) {
      score = 70;
      status = 'PASS';
      classification = 'Acceptable Working Capital Expansion';
      observations.push(`Normal inventory buffer: Inventory growth exceeds sales growth by ${divergencePct}%, within normal operating tolerance.`);
    } else if (divergencePct <= 10.0) {
      score = 30;
      status = 'FLAG';
      classification = 'Inventory Bloat Warning (5% - 10% Divergence)';
      redFlags.push(`Inventory divergence warning: Inventory growth outpaces sales growth by ${divergencePct}% (> 5.0% threshold).`);
    } else {
      score = 0;
      status = 'FAIL';
      classification = 'Severe Inventory Trap / Channel Stuffing (> 10% Divergence)';
      redFlags.push(`Severe inventory bloat: Inventory growth outpaces sales growth by ${divergencePct}% (> 10.0% ceiling).`);
    }
  } else {
    score = 50;
    status = 'PASS';
    classification = 'Inventory Data Not Disclosed';
    observations.push('Inventory expansion metrics not reported or unavailable in financial statements.');
  }

  const summary = `Inventory Velocity Divergence: ${divergencePct !== null ? divergencePct + '%' : 'N/A'} (Score: ${score}/100) — ${classification}.`;

  return {
    principle: 'inventory-sales-velocity',
    name: 'Inventory vs Sales Velocity Divergence',
    ticker,
    status,
    score,
    classification,
    metrics: {
      inventory_divergence_pct: divergencePct,
      inventory_growth_pct: invGrowth,
      sales_growth_pct: salesGrowth,
      has_inventory: !hasNoInventory
    },
    observations,
    red_flags: redFlags,
    summary
  };
}

module.exports = {
  calculateInventoryDivergence,
  evaluateInventorySalesVelocity
};

