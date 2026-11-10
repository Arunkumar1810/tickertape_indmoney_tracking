#!/usr/bin/env node
'use strict';

/**
 * evaluate_net_net.js:
 * Benjamin Graham Net-Net Working Capital (NNWC) & Net Current Asset Value (NCAV) Engine.
 * Calculates liquidation floors and net-net margin of safety against market cap / price.
 */

function round2(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function evaluateNetNet(financials) {
  if (!financials || typeof financials !== 'object') {
    throw new Error('evaluateNetNet requires a valid NormalizedCompanyFinancials object');
  }

  const ticker = (financials.ticker || 'UNKNOWN').toUpperCase();
  if (financials.is_index_etf) {
    return {
      principle: 'net-net-working-capital',
      name: 'Net-Net Working Capital & Liquidation Floor',
      ticker,
      status: 'PASS',
      score: 100,
      classification: 'Passive Basket (Bypasses Liquidation Valuation)',
      metrics: { ncav: null, nnwc: null, discount_to_ncav_pct: null },
      summary: 'Index ETF passive basket: Net-net liquidation calculations bypassed.'
    };
  }

  const bal = financials.balance_sheet || {};
  const val = financials.valuation || {};
  const mkt = financials.market_data || {};

  const currentAssets = isFiniteNumber(bal.total_current_assets)
    ? Number(bal.total_current_assets)
    : (isFiniteNumber(bal.current_assets) ? Number(bal.current_assets) : 0);
  const cash = isFiniteNumber(bal.cash_and_equivalents) ? Number(bal.cash_and_equivalents) : 0;
  const receivables = isFiniteNumber(bal.accounts_receivable) ? Number(bal.accounts_receivable) : 0;
  const inventory = isFiniteNumber(bal.inventory) ? Number(bal.inventory) : 0;
  const totalLiabilities = isFiniteNumber(bal.total_liabilities)
    ? Number(bal.total_liabilities)
    : (isFiniteNumber(bal.total_debt) ? Number(bal.total_debt) : 0);

  const mcap = isFiniteNumber(val.market_cap)
    ? Number(val.market_cap)
    : (isFiniteNumber(mkt.market_cap) ? Number(mkt.market_cap) : null);
  const shares = isFiniteNumber(bal.shares_outstanding)
    ? Number(bal.shares_outstanding)
    : (isFiniteNumber(mkt.shares_outstanding) ? Number(mkt.shares_outstanding) : (isFiniteNumber(val.shares_outstanding) ? Number(val.shares_outstanding) : null));
  const cmp = isFiniteNumber(val.cmp)
    ? Number(val.cmp)
    : (isFiniteNumber(mkt.cmp) ? Number(mkt.cmp) : (mcap && shares ? mcap / shares : null));

  // NCAV = Current Assets - Total Liabilities
  const ncav = currentAssets - totalLiabilities;
  // NNWC = Cash + (0.75 * Receivables) + (0.50 * Inventory) - Total Liabilities
  const nnwc = cash + (0.75 * receivables) + (0.50 * inventory) - totalLiabilities;

  const ncavPerShare = shares && shares > 0 ? round2(ncav / shares) : null;
  const nnwcPerShare = shares && shares > 0 ? round2(nnwc / shares) : null;

  let score = 0;
  let status = 'FAIL';
  let classification = 'Trades Above Current Asset Liquidation Floor';
  const observations = [];

  if (mcap && mcap > 0) {
    if (mcap < nnwc) {
      score = 100;
      status = 'PASS';
      classification = 'Rare Deep Net-Net (Price < NNWC)';
      observations.push(`Extreme Deep Value: Market cap (${mcap}) is BELOW Net-Net Working Capital (${nnwc}).`);
    } else if (mcap < ncav) {
      score = 85;
      status = 'PASS';
      classification = 'Classic NCAV Bargain (Price < NCAV)';
      observations.push(`Classic Graham Bargain: Market cap (${mcap}) is below Net Current Asset Value (${ncav}).`);
    } else if (ncav > 0) {
      const ratio = mcap / ncav;
      if (ratio < 1.5) {
        score = 65;
        status = 'WARN';
        classification = 'Modest Liquidation Cushion (P/NCAV < 1.5x)';
        observations.push(`Moderate Asset Cushion: Market cap is ${ratio.toFixed(2)}x NCAV.`);
      } else {
        score = 35;
        status = 'HOLD';
        classification = 'Operating Franchise Valued on Earnings Power, Not Scrap Assets';
        observations.push(`Modern Going-Concern: Valued on operational earnings power rather than liquidation working capital.`);
      }
    } else {
      score = 20;
      status = 'FAIL';
      classification = 'Negative Net Current Assets';
      observations.push(`Negative NCAV: Total liabilities exceed current assets.`);
    }
  } else {
    score = 35;
    status = 'HOLD';
    classification = 'Operational Enterprise Value';
  }

  return {
    principle: 'net-net-working-capital',
    name: 'Net-Net Working Capital & Liquidation Floor',
    ticker,
    status,
    score,
    classification,
    metrics: {
      ncav: round2(ncav),
      nnwc: round2(nnwc),
      ncav_per_share: round2(ncavPerShare),
      nnwc_per_share: round2(nnwcPerShare),
      market_cap: round2(mcap),
      cmp: round2(cmp)
    },
    observations,
    summary: `${status} (${classification}): NCAV: ${round2(ncav)}, NNWC: ${round2(nnwc)}.`
  };
}

module.exports = { evaluateNetNet };
