const fs = require('fs');
const path = require('path');
const { createClient } = require('../../../../shared/tickertape');

// Mapping from trading symbols to Tickertape internal SIDs
const SID_MAP = {
  INFY: 'INFY',
  ITC: 'ITC',
  ZYDUSLIFE: 'CADI',
  NATCOPHARM: 'NATP',
  HDFCBANK: 'HDBK',
  SOUTHBANK: 'SIBK',
  TCS: 'TCS',
  WIPRO: 'WIPR',
  HCLTECH: 'HCLT'
};

class DividendFetcher {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.resolve(__dirname, '../../.cache');
    this.cacheFile = options.cacheFile || path.join(this.cacheDir, 'dividends_cache.json');
  }

  load() {
    if (!fs.existsSync(this.cacheFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch {
      return null;
    }
  }

  save(data) {
    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), 'utf8');
    return data;
  }

  /**
   * Fetches corporate dividend history via Tickertape MCP and determines
   * the exact dividends earned based on historical trades and share balances on ex-dates.
   *
   * @param {Array} trades List of historical trades with date, symbol, type, quantity
   * @param {boolean} forceRefresh Force refresh from Tickertape
   */
  async fetchEarnedDividends(trades = [], forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.load();
      if (cached && Array.isArray(cached.dividends)) {
        return cached.dividends;
      }
    }

    let ttClient;
    try {
      ttClient = createClient();
    } catch {
      return [];
    }

    const earned = [];
    const symbols = [...new Set(trades.map(t => t.symbol))];

    for (const sym of symbols) {
      const sid = SID_MAP[sym] || sym;
      const symTrades = trades.filter(t => t.symbol === sym).sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!symTrades.length) continue;

      try {
        const res = await ttClient.call('in_stock_corporate_read', {
          type: 'dividends',
          dividends: { sid }
        });

        const past = res && Array.isArray(res.past) ? res.past : [];
        for (const d of past) {
          const exDate = d.exDate ? d.exDate.split('T')[0] : null;
          if (!exDate) continue;

          // Compute cumulative share balance held before the ex-date
          let qtyHeld = 0;
          for (const t of symTrades) {
            if (t.date < exDate) {
              qtyHeld += (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity));
            }
          }

          if (qtyHeld > 0 && d.dividend > 0) {
            const amount = Math.round(qtyHeld * Number(d.dividend) * 100) / 100;
            earned.push({
              symbol: sym,
              exDate,
              dividendPerShare: Number(d.dividend),
              quantity: qtyHeld,
              amount,
              type: d.subType || 'Dividend'
            });
          }
        }
      } catch (err) {
        // Silently continue if Tickertape has no corporate entry for this stock
      }
    }

    // Sort chronologically
    earned.sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    this.save({
      lastUpdated: new Date().toISOString(),
      dividends: earned,
      totalEarned: earned.reduce((sum, d) => sum + d.amount, 0)
    });

    return earned;
  }
}

module.exports = DividendFetcher;
