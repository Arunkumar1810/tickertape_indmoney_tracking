const fs = require('fs');
const path = require('path');
const LedgerParser = require('./ledger_parser');
const { readTradeBookRecords } = require('./xlsx_reader');

// Standard mapping from Angel One corporate scrip names to NSE trading symbols
const ANGEL_SCRIP_MAP = {
  'ZYDUS LIFESCIENCES LTD': 'ZYDUSLIFE',
  'HDFC BANK LTD': 'HDFCBANK',
  'NATCO PHARMA LTD.': 'NATCOPHARM',
  'TATA CONSULTANCY SERV LT': 'TCS',
  'WIPRO LTD': 'WIPRO',
  'THE SOUTH INDIAN BANK LTD': 'SOUTHBANK',
  'INFOSYS LIMITED': 'INFY',
  'ITC LTD': 'ITC',
  'HCL TECHNOLOGIES LTD': 'HCLTECH'
};

class TradesCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.resolve(__dirname, '../../.cache');
    this.cacheFile = options.cacheFile || path.join(this.cacheDir, 'trades_cache.json');
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load existing trades from cache
   */
  load() {
    if (!fs.existsSync(this.cacheFile)) {
      return { lastUpdated: null, trades: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch {
      return { lastUpdated: null, trades: [] };
    }
  }

  /**
   * Save trades into cache atomically
   */
  save(trades) {
    this.ensureCacheDir();
    const data = {
      lastUpdated: new Date().toISOString(),
      trades
    };
    const tmp = `${this.cacheFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.cacheFile);
    return data;
  }

  /**
   * Parse Zerodha Console Tradebook CSV or JSON
   */
  parseTradebook(input) {
    let rawRows = [];

    if (Array.isArray(input)) {
      rawRows = input;
    } else if (typeof input === 'string') {
      if (fs.existsSync(input) && /\.xlsx$/i.test(input)) {
        rawRows = readTradeBookRecords(input);
      } else if (fs.existsSync(input)) {
        const content = fs.readFileSync(input, 'utf8');
        try {
          rawRows = JSON.parse(content);
        } catch {
          rawRows = LedgerParser.parseCsv(content);
        }
      } else {
        try {
          rawRows = JSON.parse(input);
        } catch {
          rawRows = LedgerParser.parseCsv(input);
        }
      }
    }

    const normalized = [];

    for (const row of rawRows) {
      // Support Angel One 'scrip/contract' or generic symbol/tradingsymbol
      const rawScrip = (row['scrip/contract'] || row.scrip || row.symbol || row.tradingsymbol || '').trim();
      let symbol = (ANGEL_SCRIP_MAP[rawScrip] || rawScrip).toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, '');
      if (!symbol) continue;

      const isin = (row.isin || '').trim().toUpperCase();
      const rawDate = row['trade date'] || row.trade_date || row.date || row['order execution time'];
      const date = LedgerParser.normalizeDate(String(rawDate));
      if (!date) continue;

      const tradeType = (row['buy/sell'] || row['trade type'] || row.trade_type || row.type || row.transaction_type || '').trim().toUpperCase();
      const isBuy = tradeType === 'BUY' || tradeType === 'B';
      const isSell = tradeType === 'SELL' || tradeType === 'S';
      if (!isBuy && !isSell) continue;

      const quantity = LedgerParser.parseAmount(row.quantity || row.qty);
      const price = LedgerParser.parseAmount(row['buy price'] || row['sell price'] || row.price || row.rate || row.average_price);
      if (quantity <= 0 || price <= 0) continue;

      const tradeId = String(row['trade id'] || row.trade_id || row['order id'] || `${date}-${symbol}-${tradeType}-${quantity}-${price}`);

      normalized.push({
        tradeId,
        symbol,
        isin,
        date,
        type: isBuy ? 'BUY' : 'SELL',
        quantity,
        price,
        amount: quantity * price
      });
    }

    return normalized;
  }

  /**
   * Merge new trades into existing cache without duplicates
   */
  mergeTrades(newTrades) {
    const existingData = this.load();
    const tradeMap = new Map();

    for (const t of existingData.trades) {
      tradeMap.set(t.tradeId, t);
    }

    for (const t of newTrades) {
      tradeMap.set(t.tradeId, t);
    }

    const merged = Array.from(tradeMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    return this.save(merged);
  }

  /**
   * Group trades by ISIN or Symbol
   */
  groupBySymbol() {
    const data = this.load();
    const grouped = {};

    for (const t of data.trades) {
      const key = t.isin || t.symbol;
      if (!grouped[key]) {
        grouped[key] = {
          symbol: t.symbol,
          isin: t.isin,
          trades: []
        };
      }
      grouped[key].trades.push(t);
    }

    return grouped;
  }
}

module.exports = TradesCache;
