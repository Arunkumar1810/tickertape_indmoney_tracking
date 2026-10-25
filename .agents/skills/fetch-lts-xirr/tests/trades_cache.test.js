const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TradesCache = require('../scripts/lib/trades_cache');

test('TradesCache parses Zerodha Tradebook CSV and merges without duplicates', () => {
  const tmpDir = path.resolve(__dirname, '../.cache/test_' + Date.now());
  const cacheFile = path.join(tmpDir, 'trades_cache.json');

  try {
    const cache = new TradesCache({ cacheDir: tmpDir, cacheFile });

    const sampleCsv = `
Symbol,ISIN,Trade Date,Trade Type,Quantity,Price,Trade ID
TCS,INE467B01029,10-01-2024,BUY,10,3800.00,TRD1001
TCS,INE467B01029,15-05-2024,BUY,5,3700.00,TRD1002
INFY,INE009A01021,20-03-2024,BUY,20,1500.00,TRD1003
TCS,INE467B01029,15-05-2024,BUY,5,3700.00,TRD1002
`;

    const parsed = cache.parseTradebook(sampleCsv);
    assert.strictEqual(parsed.length, 4);

    cache.mergeTrades(parsed);
    const loaded = cache.load();

    // TRD1002 duplicate should be merged into 1
    assert.strictEqual(loaded.trades.length, 3);
    assert.strictEqual(loaded.trades[0].symbol, 'TCS');
    assert.strictEqual(loaded.trades[0].tradeId, 'TRD1001');

    const grouped = cache.groupBySymbol();
    assert.ok(grouped['INE467B01029']);
    assert.strictEqual(grouped['INE467B01029'].trades.length, 2);
    assert.ok(grouped['INE009A01021']);
    assert.strictEqual(grouped['INE009A01021'].trades.length, 1);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});
