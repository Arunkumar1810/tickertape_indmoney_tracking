const https = require('https');
const http = require('http');
const { URL } = require('url');

const SECTOR_MAP = {
  // Technology
  AAPL: 'Technology',
  MSFT: 'Technology',
  NVDA: 'Technology',
  AMD: 'Technology',
  AMAT: 'Technology',
  TSM: 'Technology',
  INTC: 'Technology',
  QCOM: 'Technology',
  AVGO: 'Technology',
  ASML: 'Technology',
  CRM: 'Technology',
  ADBE: 'Technology',
  ORCL: 'Technology',
  CSCO: 'Technology',

  // Communication Services
  GOOGL: 'Communication Services',
  GOOG: 'Communication Services',
  META: 'Communication Services',
  NFLX: 'Communication Services',
  DIS: 'Communication Services',

  // Consumer Discretionary
  AMZN: 'Consumer Discretionary',
  TSLA: 'Consumer Discretionary',
  HD: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary',

  // Consumer Staples
  KO: 'Consumer Staples',
  PEP: 'Consumer Staples',
  PG: 'Consumer Staples',
  COST: 'Consumer Staples',
  WMT: 'Consumer Staples',

  // Healthcare
  JNJ: 'Healthcare',
  UNH: 'Healthcare',
  LLY: 'Healthcare',
  ABBV: 'Healthcare',
  PFE: 'Healthcare',

  // Financial Services
  V: 'Financial Services',
  MA: 'Financial Services',
  JPM: 'Financial Services',
  BAC: 'Financial Services',
  GS: 'Financial Services',

  // Index ETFs
  VOO: 'Index ETF',
  QQQ: 'Index ETF',
  SPY: 'Index ETF',
  IVV: 'Index ETF',
  RSP: 'Index ETF',
  VTI: 'Index ETF',
  DIA: 'Index ETF',
  IWM: 'Index ETF'
};

function resolveSector(ticker, name) {
  if (SECTOR_MAP[ticker]) return SECTOR_MAP[ticker];
  if (/ETF|Trust|Fund|Index|S&P|Nasdaq/i.test(name)) return 'Index ETF';
  return 'Other';
}

/**
 * Client for INDmoney Model Context Protocol (MCP) server (https://mcp.indmoney.com/mcp).
 * Supports JSON-RPC 2.0 over HTTPS with OAuth/Bearer session tokens.
 */
class IndmoneyMcpClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.INDMONEY_MCP_URL || 'https://mcp.indmoney.com/mcp';
    this.token = options.token || process.env.INDMONEY_MCP_TOKEN || null;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Unwrap standard MCP tools/call result format into parsed object or text.
   */
  static unwrapResult(parsed) {
    if (!parsed) return null;
    if (parsed.error) {
      throw new Error(`INDmoney MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
    }
    const result = parsed.result;
    if (result && result.isError) {
      const textItem = (result.content || []).find(c => c.type === 'text');
      throw new Error(`INDmoney MCP tool execution error: ${textItem ? textItem.text : 'unknown error'}`);
    }
    if (result && Array.isArray(result.content)) {
      const textItems = result.content.filter(c => c.type === 'text' && c.text);
      if (textItems.length === 1) {
        try {
          return JSON.parse(textItems[0].text);
        } catch {
          return textItems[0].text;
        }
      }
      if (textItems.length > 1) {
        return textItems.map(item => {
          try {
            return JSON.parse(item.text);
          } catch {
            return item.text;
          }
        });
      }
    }
    return result || parsed;
  }

  /**
   * Perform raw JSON-RPC request to INDmoney MCP endpoint.
   */
  _rpc(method, params = {}) {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now() + Math.floor(Math.random() * 1000),
      method,
      params
    });

    return new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(this.endpoint);
      } catch (err) {
        return reject(new Error(`Invalid INDmoney MCP endpoint URL: ${this.endpoint}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'IndmoneyMcpClient/1.0'
      };

      if (this.token) {
        headers['Authorization'] = this.token.startsWith('Bearer ') ? this.token : `Bearer ${this.token}`;
        // If token looks like a cookie string or contains session key, also provide Cookie header
        if (this.token.includes('=')) {
          headers['Cookie'] = this.token;
        }
      }

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers,
        timeout: this.timeoutMs
      };

      const req = transport.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) {
            return reject(new Error(
              `INDmoney MCP Authentication failed (HTTP ${res.statusCode}).\n` +
              `Please ensure INDMONEY_MCP_TOKEN is set in your .env file.\n` +
              `Endpoint: ${this.endpoint}`
            ));
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`INDmoney MCP returned HTTP ${res.statusCode}: ${data.substring(0, 300)}`));
          }

          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            // Handle possible SSE stream or chunked text response
            const match = data.match(/data:\s*(\{.*\})/);
            if (match) {
              try {
                return resolve(JSON.parse(match[1]));
              } catch {
                // fall through
              }
            }
            reject(new Error(`Failed to parse INDmoney MCP JSON response: ${e.message} (Raw: ${data.slice(0, 150)})`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`INDmoney MCP request timed out after ${this.timeoutMs}ms (${this.endpoint})`));
      });

      req.on('error', (err) => {
        reject(new Error(`INDmoney MCP network error: ${err.message}`));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * List available tools exposed by the INDmoney MCP server.
   */
  async listTools() {
    const res = await this._rpc('tools/list', {});
    return res.result && res.result.tools ? res.result.tools : [];
  }

  /**
   * Execute a specific tool call on INDmoney MCP.
   */
  async callTool(toolName, toolArgs = {}) {
    const res = await this._rpc('tools/call', { name: toolName, arguments: toolArgs });
    return IndmoneyMcpClient.unwrapResult(res);
  }

  /**
   * Fetch US stocks from INDmoney MCP with auto-discovery and normalization.
   */
  async getUsStocks(options = {}) {
    let rawData = null;
    let selectedTool = null;

    // 1. Try official networth_holdings tool for US_STOCK
    try {
      rawData = await this.callTool('networth_holdings', { asset_type: 'US_STOCK' });
      if (rawData && (rawData.holdings || Array.isArray(rawData))) {
        selectedTool = 'networth_holdings';
      }
    } catch {
      // Fall through to candidates
    }

    // 2. Discover other potential tools dynamically if networth_holdings was unavailable
    if (!rawData) {
      const candidateTools = [
        'get_us_stocks_holdings',
        'get_us_stocks',
        'get_holdings',
        'get_portfolio',
        'fetch_us_stocks'
      ];

      let lastError = null;
      for (const tool of candidateTools) {
        try {
          rawData = await this.callTool(tool, options.toolArgs || { asset_class: 'US_STOCKS' });
          selectedTool = tool;
          if (rawData) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!rawData) {
        throw lastError || new Error('Unable to retrieve US stocks from INDmoney MCP server.');
      }
    }

    return this.normalizeUsStocks(rawData, { selectedTool });
  }

  /**
   * Normalize various response shapes into a standard portfolio contract.
   */
  normalizeUsStocks(raw, meta = {}) {
    const rawItems = Array.isArray(raw)
      ? raw
      : (raw.holdings || raw.stocks || raw.us_stocks || raw.data || raw.items || []);

    const summaryData = raw.asset_summary || {};
    
    // Calculate live FX rate from asset summary if present, else fallback
    let fxRate = 87.0;
    if (summaryData.total_value && summaryData.total_value_usd) {
      fxRate = Number((summaryData.total_value / summaryData.total_value_usd).toFixed(2));
    } else if (raw.usdinrRate || raw.fxRate || raw.usd_to_inr) {
      fxRate = Number(raw.usdinrRate || raw.fxRate || raw.usd_to_inr);
    }

    const holdings = rawItems.map(item => {
      const ticker = (item.investment_code || item.ticker || item.symbol || item.stock_code || item.code || 'UNKNOWN').toUpperCase();
      const name = item.investment || item.name || item.company_name || item.companyName || ticker;
      const shares = Number(item.total_units || item.shares || item.units || item.quantity || item.qty || 0);

      // USD Valuations
      const avgPriceUsd = Number(item.avgPriceUsd || item.average_price || item.avg_price || item.buy_price || 0);
      const currentPriceUsd = Number(item.currentPriceUsd || item.cmp || item.ltp || item.current_price || avgPriceUsd);

      const investedValueUsd = Number(item.invested_value_usd || item.investedValueUsd || (item.invested_amount ? item.invested_amount / fxRate : (shares * avgPriceUsd)));
      const currentValueUsd = Number(item.current_value_usd || item.currentValueUsd || (item.market_value ? item.market_value / fxRate : (shares * currentPriceUsd)));

      const finalAvgPriceUsd = shares > 0 && !avgPriceUsd ? (investedValueUsd / shares) : avgPriceUsd;
      const finalCurrentPriceUsd = shares > 0 && !currentPriceUsd ? (currentValueUsd / shares) : currentPriceUsd;

      const unrealizedPnlUsd = Number(item.unrealizedPnlUsd || (currentValueUsd - investedValueUsd));
      const unrealizedPnlPct = Number(item.pnl_per || item.unrealizedPnlPct || (investedValueUsd > 0 ? ((unrealizedPnlUsd / investedValueUsd) * 100) : 0));

      // INR Valuations
      const investedValueInr = Math.round(Number(item.invested_amount || (investedValueUsd * fxRate)));
      const currentValueInr = Math.round(Number(item.market_value || (currentValueUsd * fxRate)));
      const unrealizedPnlInr = Math.round(Number(item.total_pnl || (unrealizedPnlUsd * fxRate)));

      const oneDayChangeUsd = Number(item.one_day_change_usd || 0);
      const oneDayChangePct = Number(item.one_day_change_percentage || 0);
      const broker = item.broker || 'INDmoney';
      const sector = resolveSector(ticker, name);

      return {
        ticker,
        companyName: name,
        shares: Number(shares.toFixed(4)),
        avgPriceUsd: Number(finalAvgPriceUsd.toFixed(2)),
        currentPriceUsd: Number(finalCurrentPriceUsd.toFixed(2)),
        investedValueUsd: Number(investedValueUsd.toFixed(2)),
        currentValueUsd: Number(currentValueUsd.toFixed(2)),
        unrealizedPnlUsd: Number(unrealizedPnlUsd.toFixed(2)),
        unrealizedPnlPct: Number(unrealizedPnlPct.toFixed(2)),
        investedValueInr,
        currentValueInr,
        unrealizedPnlInr,
        oneDayChangeUsd: Number(oneDayChangeUsd.toFixed(2)),
        oneDayChangePct: Number(oneDayChangePct.toFixed(2)),
        broker,
        sector,
        portfolioPct: item.holding_percent !== undefined ? Number(Number(item.holding_percent).toFixed(2)) : 0
      };
    });

    // Summary calculations
    const totalInvestedUsd = summaryData.invested_usd !== undefined
      ? Number(summaryData.invested_usd.toFixed(2))
      : Number(holdings.reduce((sum, h) => sum + h.investedValueUsd, 0).toFixed(2));

    const totalCurrentUsd = summaryData.total_value_usd !== undefined
      ? Number(summaryData.total_value_usd.toFixed(2))
      : Number(holdings.reduce((sum, h) => sum + h.currentValueUsd, 0).toFixed(2));

    const totalPnlUsd = Number((totalCurrentUsd - totalInvestedUsd).toFixed(2));
    const totalReturnPct = totalInvestedUsd > 0 ? Number(((totalPnlUsd / totalInvestedUsd) * 100).toFixed(2)) : 0;

    const totalInvestedInr = summaryData.invested !== undefined
      ? Math.round(summaryData.invested)
      : Math.round(totalInvestedUsd * fxRate);

    const totalCurrentInr = summaryData.total_value !== undefined
      ? Math.round(summaryData.total_value)
      : Math.round(totalCurrentUsd * fxRate);

    const totalPnlInr = totalCurrentInr - totalInvestedInr;

    // Recalculate weights if not pre-populated
    if (holdings.length > 0 && holdings[0].portfolioPct === 0 && totalCurrentUsd > 0) {
      holdings.forEach(h => {
        h.portfolioPct = Number(((h.currentValueUsd / totalCurrentUsd) * 100).toFixed(2));
      });
    }

    // Calculate sector breakdown
    const sectorGroups = {};
    holdings.forEach(h => {
      const s = h.sector || 'Other';
      if (!sectorGroups[s]) {
        sectorGroups[s] = { sector: s, valueUsd: 0, valueInr: 0, count: 0 };
      }
      sectorGroups[s].valueUsd += h.currentValueUsd;
      sectorGroups[s].valueInr += h.currentValueInr;
      sectorGroups[s].count += 1;
    });

    const sectorBreakdown = Object.values(sectorGroups).map(g => ({
      sector: g.sector,
      valueUsd: Number(g.valueUsd.toFixed(2)),
      valueInr: Math.round(g.valueInr),
      count: g.count,
      pct: totalCurrentUsd > 0 ? Number(((g.valueUsd / totalCurrentUsd) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.valueUsd - a.valueUsd);

    const availableCashUsd = Number(raw.availableCashUsd || raw.cash_balance || 0);
    const totalAccountValueUsd = Number((totalCurrentUsd + availableCashUsd).toFixed(2));

    return {
      source: 'indmoney-mcp',
      toolUsed: meta.selectedTool || 'networth_holdings',
      timestamp: new Date().toISOString(),
      fxRate,
      summary: {
        totalInvestedUsd,
        totalCurrentUsd,
        totalPnlUsd,
        totalReturnPct,
        totalInvestedInr,
        totalCurrentInr,
        totalPnlInr,
        oneDayChangeUsd: Number((summaryData.one_day_change_usd || 0).toFixed(2)),
        oneDayChangePct: Number((summaryData.one_day_change_percentage || 0).toFixed(2)),
        availableCashUsd,
        totalAccountValueUsd,
        totalAccountValueInr: Math.round(totalAccountValueUsd * fxRate),
        holdingsCount: holdings.length,
        sectorBreakdown
      },
      holdings
    };

  }

  async close() {
    // No-op for HTTP transport
  }
}

module.exports = IndmoneyMcpClient;

