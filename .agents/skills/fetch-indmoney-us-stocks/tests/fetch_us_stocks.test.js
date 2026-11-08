'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseArgs, buildFundamentalAudit, enrichHoldingsWithFundamentals } = require('../scripts/fetch_us_stocks');
const IndmoneyMcpClient = require('../../../shared/indmoney/client');

test('parseArgs handles flags correctly', () => {
  const args = parseArgs(['--out', 'custom_reports', '--refresh', '--only', 'AAPL', '--mock']);
  assert.strictEqual(args.out, 'custom_reports');
  assert.strictEqual(args.refresh, true);
  assert.strictEqual(args.only, 'AAPL');
  assert.strictEqual(args.mock, true);
});

test('report template contains essential placeholders, KPI IDs, verdict filter pills, and inline audit drawer', () => {
  const tplPath = path.join(__dirname, '../assets/report-template.html');
  assert.ok(fs.existsSync(tplPath));
  const content = fs.readFileSync(tplPath, 'utf8');
  assert.ok(content.includes('/*__DATA__*/null'));
  assert.ok(content.includes('kpi-total-usd'));
  assert.ok(content.includes('kpi-invested-usd'));
  assert.ok(content.includes('kpi-fundamental-summary'));
  assert.ok(content.includes('stock-donut-svg'));
  assert.ok(content.includes('sector-donut-svg'));
  assert.ok(content.includes('verdict-filter-pills'));
  assert.ok(content.includes('audit-detail-row'));
  assert.ok(content.includes('holdings-tbody'));
});

test('IndmoneyMcpClient normalizes raw holdings correctly with sector breakdown', () => {
  const client = new IndmoneyMcpClient();
  const raw = {
    stocks: [
      { ticker: 'AAPL', name: 'Apple Inc.', shares: 10, avg_price: 150, cmp: 200 }
    ],
    cash_balance: 100,
    usd_to_inr: 85.0
  };

  const normalized = client.normalizeUsStocks(raw, { selectedTool: 'test-tool' });
  assert.strictEqual(normalized.holdings.length, 1);
  assert.strictEqual(normalized.holdings[0].ticker, 'AAPL');
  assert.strictEqual(normalized.holdings[0].sector, 'Technology');
  assert.strictEqual(normalized.holdings[0].shares, 10);
  assert.strictEqual(normalized.holdings[0].investedValueUsd, 1500);
  assert.strictEqual(normalized.holdings[0].currentValueUsd, 2000);
  assert.strictEqual(normalized.holdings[0].unrealizedPnlUsd, 500);
  assert.strictEqual(normalized.holdings[0].unrealizedPnlPct, 33.33);
  assert.strictEqual(normalized.summary.totalCurrentUsd, 2000);
  assert.strictEqual(normalized.summary.availableCashUsd, 100);
  assert.strictEqual(normalized.summary.totalAccountValueUsd, 2100);
  assert.strictEqual(normalized.summary.totalCurrentInr, 170000);
  assert.ok(Array.isArray(normalized.summary.sectorBreakdown));
  assert.strictEqual(normalized.summary.sectorBreakdown[0].sector, 'Technology');
  assert.strictEqual(normalized.summary.sectorBreakdown[0].valueUsd, 2000);
});

test('buildFundamentalAudit classifies Index ETFs and individual equities deterministically', () => {
  const etfAudit = buildFundamentalAudit({ ticker: 'VOO', sector: 'Index ETF', portfolioPct: 5.16 }, null);
  assert.strictEqual(etfAudit.isEtf, true);
  assert.strictEqual(etfAudit.verdict, 'ETF');
  assert.strictEqual(etfAudit.verdictLabel, '■ CORE INDEX ETF');

  const investAudit = buildFundamentalAudit(
    { ticker: 'TSM', currentPriceUsd: 400, portfolioPct: 9.0 },
    {
      industry: 'Semiconductors',
      exchange: 'NYSE',
      marketData: { cmp: 400, pe: 28.5, pb: 10.6, eps: 15.4, bvps: 38.0 },
      analystConsensus: { targetPrice: 580, upsidePct: 45.0, buyPct: 95.0, analystsTracking: 40 },
      valuationMath: {
        grahamNumber: 115.0,
        nnwc: 10000000000,
        ownerEarnings: { trueOwnerEarnings: 25000000000, rawOwnerEarnings: 25500000000, sbcDilutionPct: 2.0 },
        dupont: { taxBurden: 0.85, interestBurden: 0.98, operatingMarginPct: 33.2, assetTurnover: 0.4, financialLeverage: 1.5, calculatedRoePct: 16.5 },
        altmanZ: { zScore: 3.5, zone: 'Safe Zone' },
        klarman: { isNetDebtSafe: true, accrualGap: 500000000 },
        lynch: { peg: 0.44 }
      }
    }
  );
  assert.strictEqual(investAudit.isEtf, false);
  assert.strictEqual(investAudit.verdict, 'INVEST');
  assert.strictEqual(investAudit.peg, 0.44);
  assert.ok(investAudit.devilsAdvocate.length >= 2);
});
