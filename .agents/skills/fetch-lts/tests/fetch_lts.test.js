'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../scripts/fetch_lts');

test('parseArgs handles flags correctly', () => {
  const args = parseArgs(['--broker', 'angelone', '--refresh', '--only', 'INFY']);
  assert.strictEqual(args.broker, 'angelone');
  assert.strictEqual(args.refresh, true);
  assert.strictEqual(args.only, 'INFY');
});

test('fetch-lts report template contains essential placeholders and KPI IDs', () => {
  const tplPath = path.join(__dirname, '../assets/report-template.html');
  assert.ok(fs.existsSync(tplPath));
  const content = fs.readFileSync(tplPath, 'utf8');
  assert.ok(content.includes('/*__DATA__*/null'));
  assert.ok(content.includes('kpiCurrent'));
  assert.ok(content.includes('kpiInvested'));
  assert.ok(content.includes('kpiPnl'));
  assert.ok(content.includes('holdingsTbody'));
});

test('cached holdings match structure expected by consumer skills', () => {
  const cachePath = path.join(__dirname, '../.cache/holdings_cache.json');
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.ok(Array.isArray(cached.holdings));
    if (cached.holdings.length > 0) {
      const first = cached.holdings[0];
      assert.ok(first.ticker || first.tradingsymbol);
      assert.ok(first.quantity !== undefined);
      assert.ok(first.average_price !== undefined);
      assert.ok(first.current_value !== undefined);
    }
  }
});
