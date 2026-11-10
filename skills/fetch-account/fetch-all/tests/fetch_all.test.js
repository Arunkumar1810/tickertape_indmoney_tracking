'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function findRepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'package.json'))) return curr;
    curr = path.dirname(curr);
  }
  return path.resolve(startDir, '../../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);

const {
  validateAccountHoldingsSnapshot,
  verifyArtifactPair,
  verifyHtmlSelfContainment
} = require(path.join(REPO_ROOT, 'scripts', 'framework'));

const {
  combineSnapshots,
  parseArgs,
  main
} = require('../scripts/fetch_all');

const SCRIPT_PATH = path.resolve(__dirname, '../scripts/fetch_all.js');

const MOCK_ANGELONE = {
  account_id: 'angelone',
  broker: 'angelone',
  currency: 'INR',
  timestamp: new Date().toISOString(),
  summary: {
    total_invested: 50000.0,
    total_current_value: 55000.0,
    unrealized_pnl: 5000.0,
    unrealized_pnl_pct: 10.0,
    available_cash: 12000.0,
    total_account_equity: 67000.0,
    holdings_count: 2
  },
  margin: {
    available_cash: 12000.0,
    collateral: 0,
    utilised: 0,
    net_margin: 12000.0
  },
  holdings: [
    {
      ticker: 'HDFCBANK',
      name: 'HDFC Bank Ltd',
      isin: 'INE040A01034',
      exchange: 'NSE',
      quantity: 20,
      average_price: 1500.0,
      cmp: 1650.0,
      invested_value: 30000.0,
      current_value: 33000.0,
      unrealized_pnl: 3000.0,
      unrealized_pnl_pct: 10.0,
      weight_pct: 60.0,
      fractional_shares: false,
      buy_date: '2023-01-15',
      sector: 'Financial Services'
    },
    {
      ticker: 'INFY',
      name: 'Infosys Ltd',
      isin: 'INE009A01021',
      exchange: 'NSE',
      quantity: 10,
      average_price: 2000.0,
      cmp: 2200.0,
      invested_value: 20000.0,
      current_value: 22000.0,
      unrealized_pnl: 2000.0,
      unrealized_pnl_pct: 10.0,
      weight_pct: 40.0,
      fractional_shares: false,
      buy_date: '2023-02-10',
      sector: 'Information Technology'
    }
  ]
};

const MOCK_INDMONEY = {
  account_id: 'indmoney_us',
  broker: 'indmoney',
  currency: 'USD',
  timestamp: new Date().toISOString(),
  usd_to_inr: 90.0,
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
      ticker: 'AAPL',
      name: 'Apple Inc',
      isin: 'US0378331005',
      exchange: 'NASDAQ',
      quantity: 3,
      average_price: 166.67,
      cmp: 200.0,
      invested_value: 500.0,
      current_value: 600.0,
      unrealized_pnl: 100.0,
      unrealized_pnl_pct: 20.0,
      weight_pct: 100.0,
      fractional_shares: true,
      buy_date: '2023-03-01',
      sector: 'Information Technology'
    }
  ]
};

test('fetch_all: parseArgs defaults and CLI options', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.out, null);
  assert.equal(defaults.refresh, false);
  assert.equal(defaults.only, null);
  assert.equal(defaults.jsonOutput, false);
  assert.equal(defaults.mockData, null);
  assert.equal(defaults.help, false);

  const custom = parseArgs([
    '--out', './custom_reports',
    '--only', 'hdfcbank',
    '--refresh',
    '--json-output',
    '--mock-data', './mock.json'
  ]);
  assert.equal(custom.out, './custom_reports');
  assert.equal(custom.only, 'HDFCBANK');
  assert.equal(custom.refresh, true);
  assert.equal(custom.jsonOutput, true);
  assert.equal(custom.mockData, './mock.json');
});

test('fetch_all: combineSnapshots correctly merges positions, converts currency, and passes contract validation', () => {
  const { snapshot, fxRate } = combineSnapshots(MOCK_ANGELONE, MOCK_INDMONEY);
  assert.equal(fxRate, 90.0);
  assert.equal(snapshot.account_id, 'combined');
  assert.equal(snapshot.broker, 'combined');
  assert.equal(snapshot.currency, 'INR');

  // Total current value: INR 55000 + (USD 600 * 90) = 55000 + 54000 = 109000
  assert.equal(snapshot.summary.total_current_value, 109000);
  // Total invested: INR 50000 + (USD 500 * 90) = 50000 + 45000 = 95000
  assert.equal(snapshot.summary.total_invested, 95000);
  assert.equal(snapshot.summary.unrealized_pnl, 14000);
  assert.equal(snapshot.summary.holdings_count, 3);

  // Cash margin pooled: INR 12000 + (USD 50 * 90) = 12000 + 4500 = 16500
  assert.equal(snapshot.margin.available_cash, 16500);
  assert.equal(snapshot.summary.available_cash, 16500);
  assert.equal(snapshot.summary.total_account_equity, 109000 + 16500);

  // Weights sum to 100% (within round2 tolerance)
  const weightSum = snapshot.holdings.reduce((sum, h) => sum + h.weight_pct, 0);
  assert.ok(Math.abs(weightSum - 100) < 0.2, `Weights sum to ${weightSum}`);

  // Contract validation must pass with zero errors
  const valResult = validateAccountHoldingsSnapshot(snapshot);
  assert.equal(valResult.ok, true, `Validation errors: ${JSON.stringify(valResult.errors)}`);
  assert.equal(snapshot.summary.funds_invested, 95000);
  assert.equal(snapshot.summary.account_gain, 30500); // 125500 - 95000
});

test('fetch_all: combineSnapshots correctly merges ledgers and calculates XIRR', () => {
  const angelOneWithLedger = {
    ...MOCK_ANGELONE,
    summary: { ...MOCK_ANGELONE.summary, funds_invested: 50000, account_xirr: 25.0 },
    ledger: [
      { date: '2023-01-01', amount: -50000, category: 'PAYIN', description: 'Deposit' }
    ]
  };
  const indmoneyWithLedger = {
    ...MOCK_INDMONEY,
    summary: { ...MOCK_INDMONEY.summary, funds_invested: 500, account_xirr: 30.0 },
    ledger: [
      { date: '2023-02-01', amount: 500, amount_usd: 500, category: 'DEPOSIT', title: 'USD Transfer' }
    ]
  };

  const { snapshot } = combineSnapshots(angelOneWithLedger, indmoneyWithLedger);
  assert.equal(snapshot.summary.funds_invested, 50000 + (500 * 90)); // 95000
  assert.ok(snapshot.summary.account_xirr !== null, 'XIRR should be computed');
  assert.equal(snapshot.ledger.length, 2);
  assert.equal(snapshot.ledger[0].broker, 'INDmoney US');
  assert.equal(snapshot.ledger[1].broker, 'Angel One');
});

test('fetch_all: combineSnapshots supports --only filtering', () => {
  const { snapshot } = combineSnapshots(MOCK_ANGELONE, MOCK_INDMONEY, { only: 'AAPL' });
  assert.equal(snapshot.holdings.length, 1);
  assert.equal(snapshot.holdings[0].ticker, 'AAPL');
  assert.equal(snapshot.holdings[0].weight_pct, 100);
});

test('fetch_all: main creates twin artifacts and passes verification harness', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-all-test-'));
  const mockFile = path.join(tmpDir, 'mock_input.json');
  fs.writeFileSync(mockFile, JSON.stringify({ angelone: MOCK_ANGELONE, indmoney: MOCK_INDMONEY }), 'utf8');

  try {
    const res = await main(['--out', tmpDir, '--mock-data', mockFile]);
    assert.equal(res.ok, true);
    assert.ok(fs.existsSync(res.jsonPath), 'JSON contract must exist');
    assert.ok(fs.existsSync(res.htmlPath), 'HTML report must exist');

    const pairResult = verifyArtifactPair({
      jsonPath: res.jsonPath,
      htmlPath: res.htmlPath,
      schemaType: 'holdings'
    });
    assert.equal(pairResult.ok, true, `Pair verification errors: ${JSON.stringify(pairResult.errors)}`);

    const containmentResult = verifyHtmlSelfContainment(res.htmlPath);
    assert.equal(containmentResult.ok, true, `Containment errors: ${JSON.stringify(containmentResult.errors)}`);

    const htmlContent = fs.readFileSync(res.htmlPath, 'utf8');
    assert.ok(htmlContent.includes('id="kpi-funds-invested"'), 'HTML must include Funds Invested card');
    assert.ok(htmlContent.includes('id="kpi-account-gain"'), 'HTML must include Account Gain card');
    assert.ok(htmlContent.includes('id="cardXirr"'), 'HTML must include Account XIRR clickable card');
    assert.ok(htmlContent.includes('id="ledgerModal"'), 'HTML must include Bank Transactions Ledger modal');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('fetch_all: CLI execution via spawnSync with --json-output', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-all-cli-test-'));
  const mockFile = path.join(tmpDir, 'mock_input.json');
  fs.writeFileSync(mockFile, JSON.stringify({ angelone: MOCK_ANGELONE, indmoney: MOCK_INDMONEY }), 'utf8');

  try {
    const proc = spawnSync(process.execPath, [
      SCRIPT_PATH,
      '--out', tmpDir,
      '--mock-data', mockFile,
      '--json-output'
    ], { encoding: 'utf8' });

    assert.equal(proc.status, 0, `CLI failed with error: ${proc.stderr}`);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.broker, 'combined');
    assert.equal(parsed.currency, 'INR');
    assert.equal(parsed.summary.holdings_count, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

