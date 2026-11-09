const fs = require('fs');
const path = require('path');
const { fetchUsFundamentals } = require('../.agents/skills/fundamental-us-stock-analysis/scripts/fetch_us_stock_fundamentals');

const HOLDINGS_PATH = path.join(__dirname, '../reports/indmoney-us-stocks.json');

async function run() {
  const holdingsData = JSON.parse(fs.readFileSync(HOLDINGS_PATH, 'utf8'));
  const holdings = holdingsData.holdings;

  console.log(`Analyzing ${holdings.length} holdings from portfolio...`);

  const results = [];

  for (const h of holdings) {
    // Skip index ETFs for single-stock fundamental math, evaluate individual equities
    if (['VOO', 'QQQ', 'RSP'].includes(h.ticker)) {
      results.push({
        ticker: h.ticker,
        name: h.companyName,
        isEtf: true,
        currentWeightPct: h.portfolioPct,
        currentValueUsd: h.currentValueUsd,
        pnlPct: h.unrealizedPnlPct
      });
      continue;
    }

    try {
      console.log(`Fetching fundamentals for ${h.ticker}...`);
      const fund = await fetchUsFundamentals(h.ticker);
      const m = fund.marketData;
      const v = fund.valuationMath;
      const a = fund.analystConsensus;

      results.push({
        ticker: h.ticker,
        name: fund.name,
        isEtf: false,
        sector: fund.sector,
        industry: fund.industry,
        currentWeightPct: h.portfolioPct,
        currentValueUsd: h.currentValueUsd,
        currentPnlPct: h.unrealizedPnlPct,
        cmp: m.cmp,
        pe: m.pe,
        pb: m.pb,
        eps: m.eps,
        peg: v.lynch ? v.lynch.peg : null,
        grahamNumber: v.grahamNumber,
        grahamGapPct: v.grahamNumber ? Number((((v.grahamNumber - m.cmp) / m.cmp) * 100).toFixed(2)) : null,
        ownerEarningsM: Number((v.ownerEarnings.trueOwnerEarnings / 1e6).toFixed(2)),
        roePct: v.dupont ? v.dupont.calculatedRoePct : null,
        operatingMarginPct: v.dupont ? v.dupont.operatingMarginPct : null,
        altmanZ: v.altmanZ ? v.altmanZ.zScore : null,
        altmanZone: v.altmanZ ? v.altmanZ.zone : null,
        analystTarget: a.targetPrice,
        analystUpsidePct: a.upsidePct,
        analystBuyPct: a.buyPct
      });
    } catch (err) {
      console.error(`Failed to fetch ${h.ticker}: ${err.message}`);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'batch_us_analysis.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('Batch analysis completed!');
}

run().catch(console.error);
