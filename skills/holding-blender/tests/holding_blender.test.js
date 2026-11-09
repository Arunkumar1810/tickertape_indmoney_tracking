'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getFxRate,
  blendHoldings,
  renderHtml,
  writeArtifacts,
  processSnapshots,
  processStrategyWay,
  parseArgs
} = require('../scripts/holding_blender');

const {
  validateBlendedHoldings,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require('../../../scripts/framework');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('1. getFxRate currency resolution and inverse pair inversion', () => {
  assert.equal(getFxRate('INR', 'INR'), 1.0);
  assert.equal(getFxRate('USD', 'USD'), 1.0);
  assert.equal(getFxRate('USD', 'INR', { USDINR: 87.20 }), 87.20);
  // Inverse lookup
  const inv = getFxRate('INR', 'USD', { USDINR: 87.20 });
  assert.equal(inv, 0.0115);
  // Custom rate overrides default
  assert.equal(getFxRate('USD', 'INR', { USDINR: 90.0 }), 90.0);
});

test('2. blendHoldings multi-account consolidation, WAC calculation, and cash pooling', () => {
  const angelone = loadFixture('sample_angelone_holdings.json');
  const indmoney = loadFixture('sample_indmoney_holdings.json');

  const blended = blendHoldings([angelone, indmoney], {
    strategyId: 'fundamental_lts',
    baseCurrency: 'INR',
    fxRates: { USDINR: 87.20 }
  });

  assert.equal(blended.strategy_id, 'fundamental_lts');
  assert.equal(blended.base_currency, 'INR');

  // Summary assertions
  // Cash: 25000 (Angel One) + 400 * 87.20 (INDmoney) = 25000 + 34880 = 59880
  assert.equal(blended.summary.pooled_cash, 59880.0);
  assert.equal(blended.summary.positions_count, 3); // INFY, AAPL, TCS

  // Positions check
  const infy = blended.positions.find(p => p.ticker === 'INFY');
  assert.ok(infy, 'INFY position must exist');
  // 100 shares from Angel One + 25 shares from INDmoney = 125 shares
  assert.equal(infy.quantity, 125.0);
  // Invested: 100 * 1500 = 150,000 + 25 * 18 * 87.20 = 39,240 -> Total 189,240
  assert.equal(infy.invested_value, 189240.0);
  // WAC = 189,240 / 125 = 1513.92
  assert.equal(infy.average_price, 1513.92);
  // CMP = (100 * 1800 + 25 * 21 * 87.20) / 125 = (180,000 + 45,780) / 125 = 1806.24
  assert.equal(infy.cmp, 1806.24);
  assert.equal(infy.current_value, 225780.0);
  assert.equal(infy.unrealized_pnl, 36540.0);
  assert.equal(infy.unrealized_pnl_pct, 19.31);

  // Attribution check for INFY
  assert.equal(infy.attribution.length, 2);
  const angelLot = infy.attribution.find(a => a.account_id === 'angelone');
  const indLot = infy.attribution.find(a => a.account_id === 'indmoney_us');
  assert.ok(angelLot && indLot);
  assert.equal(angelLot.quantity, 100);
  assert.equal(angelLot.weight_in_position_pct, 80.0);
  assert.equal(angelLot.original_currency, 'INR');
  assert.equal(indLot.quantity, 25);
  assert.equal(indLot.weight_in_position_pct, 20.0);
  assert.equal(indLot.original_currency, 'USD');
  assert.equal(indLot.fx_rate, 87.20);
  assert.equal(indLot.cost_in_base_currency, 1569.6);

  // Fractional share check (AAPL)
  const aapl = blended.positions.find(p => p.ticker === 'AAPL');
  assert.ok(aapl);
  assert.equal(aapl.quantity, 10.5);
  assert.equal(aapl.attribution.length, 1);
  assert.equal(aapl.attribution[0].weight_in_position_pct, 100.0);

  // Schema validation
  const validation = validateBlendedHoldings(blended);
  assert.equal(validation.ok, true, `Validation failed: ${JSON.stringify(validation.errors)}`);
});

test('3. blendHoldings single-account passthrough with matching currency', () => {
  const angelone = loadFixture('sample_angelone_holdings.json');
  const blended = blendHoldings([angelone], {
    strategyId: 'india_only',
    baseCurrency: 'INR'
  });

  assert.equal(blended.summary.positions_count, 2);
  assert.equal(blended.summary.pooled_cash, 25000.0);
  assert.equal(blended.summary.total_invested, 220000.0);
  assert.equal(blended.summary.total_current_value, 260000.0);
  assert.equal(blended.summary.unrealized_pnl, 40000.0);

  const val = validateBlendedHoldings(blended);
  assert.equal(val.ok, true);
});

test('4. parseArgs CLI parameter parsing', () => {
  const args = parseArgs([
    '--snapshots', 'acc1.json', 'acc2.json',
    '--way', 'fundamental_lts',
    '--manifest', 'config/custom_ways.yaml',
    '--base-currency', 'inr',
    '--fx', 'usdinr=88.5',
    '--out', 'output_dir',
    '--json-output'
  ]);

  assert.deepEqual(args.snapshots, ['acc1.json', 'acc2.json']);
  assert.equal(args.way, 'fundamental_lts');
  assert.equal(args.manifest, 'config/custom_ways.yaml');
  assert.equal(args.baseCurrency, 'INR');
  assert.equal(args.fxRates.USDINR, 88.5);
  assert.equal(args.out, 'output_dir');
  assert.equal(args.jsonOutput, true);
});

test('5. Pattern C: processSnapshots generates verified JSON and HTML artifacts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-test-'));
  try {
    const p1 = path.join(FIXTURES_DIR, 'sample_angelone_holdings.json');
    const p2 = path.join(FIXTURES_DIR, 'sample_indmoney_holdings.json');

    const result = processSnapshots([p1, p2], {
      strategyId: 'test_strategy',
      baseCurrency: 'INR',
      fxRates: { USDINR: 87.20 },
      outDir: tmpDir
    });

    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(result.jsonPath), `JSON artifact not found at ${result.jsonPath}`);
    assert.ok(fs.existsSync(result.htmlPath), `HTML artifact not found at ${result.htmlPath}`);

    // Verify self-containment
    const htmlContent = fs.readFileSync(result.htmlPath, 'utf8');
    const containment = verifyHtmlSelfContainment(htmlContent);
    assert.equal(containment.ok, true, `HTML containment failed: ${JSON.stringify(containment.errors)}`);
    assert.equal(containment.summary.externalLeaksCount, 0);

    // Verify artifact pair
    const pairResult = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'blended-holdings'
    });
    assert.equal(pairResult.ok, true, `Artifact pair validation failed: ${JSON.stringify(pairResult.errors)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6. Strategy Way execution via processStrategyWay with assigned accounts', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-way-test-'));
  try {
    const angelone = loadFixture('sample_angelone_holdings.json');
    const indmoney = loadFixture('sample_indmoney_holdings.json');

    // Test fundamental_lts with snapshot map
    const result = await processStrategyWay('fundamental_lts', {
      outDir: tmpDir,
      snapshotsMap: {
        angelone
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.blended.strategy_id, 'fundamental_lts');
    assert.equal(result.blended.base_currency, 'INR');
    assert.equal(result.blended.summary.positions_count, 2);

    const pairResult = verifyArtifactPair({
      jsonPath: result.jsonPath,
      htmlPath: result.htmlPath,
      schemaType: 'blended-holdings'
    });
    assert.equal(pairResult.ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('7. Edge case: Multi-lot fractional share blending with WAC precision', () => {
  const account1 = {
    account_id: 'drivewealth_1',
    broker: 'drivewealth',
    currency: 'USD',
    timestamp: '2026-11-08T10:00:00.000Z',
    summary: {
      total_invested: 500.0,
      total_current_value: 600.0,
      unrealized_pnl: 100.0,
      unrealized_pnl_pct: 20.0,
      available_cash: 50.0,
      total_account_equity: 650.0,
      holdings_count: 1
    },
    margin: {
      available_cash: 50.0,
      collateral: 0,
      utilised: 0,
      net_margin: 50.0
    },
    holdings: [
      {
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        isin: 'US67066G1040',
        exchange: 'NASDAQ',
        quantity: 2.3456,
        average_price: 120.0,
        cmp: 140.0,
        invested_value: 281.47,
        current_value: 328.38,
        unrealized_pnl: 46.91,
        unrealized_pnl_pct: 16.67,
        weight_pct: 100.0
      }
    ]
  };

  const account2 = {
    account_id: 'drivewealth_2',
    broker: 'drivewealth',
    currency: 'USD',
    timestamp: '2026-11-08T10:00:00.000Z',
    summary: {
      total_invested: 300.0,
      total_current_value: 350.0,
      unrealized_pnl: 50.0,
      unrealized_pnl_pct: 16.67,
      available_cash: 25.0,
      total_account_equity: 375.0,
      holdings_count: 1
    },
    margin: {
      available_cash: 25.0,
      collateral: 0,
      utilised: 0,
      net_margin: 25.0
    },
    holdings: [
      {
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        isin: 'US67066G1040',
        exchange: 'NASDAQ',
        quantity: 1.6544,
        average_price: 130.0,
        cmp: 140.0,
        invested_value: 215.07,
        current_value: 231.62,
        unrealized_pnl: 16.55,
        unrealized_pnl_pct: 7.69,
        weight_pct: 100.0
      }
    ]
  };

  const blended = blendHoldings([account1, account2], {
    strategyId: 'us_tech_fractional',
    baseCurrency: 'USD'
  });

  // Quantity: 2.3456 + 1.6544 = 4.0000 exactly
  assert.equal(blended.positions[0].quantity, 4.0);
  assert.equal(blended.positions[0].attribution.length, 2);
  assert.equal(blended.summary.pooled_cash, 75.0);

  const val = validateBlendedHoldings(blended);
  assert.equal(val.ok, true);
});

test('8. Edge case: Empty account holdings blended with active account', () => {
  const activeAccount = loadFixture('sample_angelone_holdings.json');
  const emptyAccount = {
    account_id: 'empty_demat',
    broker: 'zerodha',
    currency: 'INR',
    timestamp: '2026-11-08T10:00:00.000Z',
    summary: {
      total_invested: 0,
      total_current_value: 0,
      unrealized_pnl: 0,
      unrealized_pnl_pct: 0,
      available_cash: 10000.0,
      total_account_equity: 10000.0,
      holdings_count: 0
    },
    margin: {
      available_cash: 10000.0,
      collateral: 0,
      utilised: 0,
      net_margin: 10000.0
    },
    holdings: []
  };

  const blended = blendHoldings([activeAccount, emptyAccount], {
    strategyId: 'mixed_active_empty',
    baseCurrency: 'INR'
  });

  assert.equal(blended.summary.positions_count, 2);
  // Cash: 25000 + 10000 = 35000
  assert.equal(blended.summary.pooled_cash, 35000.0);
  assert.equal(blended.accounts_blended.length, 2);

  const val = validateBlendedHoldings(blended);
  assert.equal(val.ok, true);
});
