const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');

/**
 * Client for Angel One Model Context Protocol (MCP) server
 * Compatible with pyalgobot/angelone-mcp (https://mcpservers.org/servers/pyalgobot/angelone-mcp.git)
 */
class AngelOneMcpClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.ANGELONE_MCP_URL || 'http://localhost:8000/mcp';
    this.token = options.token || process.env.ANGELONE_JWT_TOKEN || process.env.SMARTAPI_TOKEN || null;
    this.apiKey = options.apiKey || process.env.ANGELONE_API_KEY || null;
    this.timeoutMs = options.timeoutMs || 30000;
    // 'http' (default) or 'stdio' (spawn the MCP server as a child process on demand)
    this.transport = options.transport || 'http';
    this.stdio = options.stdio || null; // { command, args, cwd, env }
    this._child = null;
    this._pending = new Map();
    this._nextId = 1;
    this._buffer = '';
    this._ready = null;
  }

  /** Unwrap a standard MCP tools/call result into parsed JSON or text */
  static unwrapResult(parsed) {
    if (parsed.error) {
      throw new Error(`Angel One MCP Error [${parsed.error.code}]: ${parsed.error.message}`);
    }
    const result = parsed.result;
    if (result && result.isError) {
      const t = (result.content || []).find(c => c.type === 'text');
      throw new Error(`Angel One MCP tool error: ${t ? t.text : 'unknown'}`);
    }
    if (result && Array.isArray(result.content)) {
      const textItems = result.content.filter(c => c.type === 'text' && c.text);
      if (textItems.length > 1) {
        return textItems.map(item => {
          try { return JSON.parse(item.text); } catch { return item.text; }
        });
      }
      if (textItems.length === 1) {
        try { return JSON.parse(textItems[0].text); } catch { return textItems[0].text; }
      }
    }
    return result || parsed;
  }

  _rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Angel One MCP request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      this._child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async _startStdio() {
    if (this._ready) return this._ready;
    if (!this.stdio || !this.stdio.command) {
      throw new Error('Angel One MCP stdio transport requires a command (see .agents/config/angelone-mcp.json)');
    }
    this._ready = (async () => {
      const child = spawn(this.stdio.command, this.stdio.args || [], {
        cwd: this.stdio.cwd || undefined,
        env: { ...process.env, ...(this.stdio.env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      this._child = child;
      let stderr = '';
      child.stderr.on('data', d => { stderr = (stderr + d).slice(-500); });
      const failAll = err => {
        this._ready = null;
        this._child = null;
        for (const p of this._pending.values()) { clearTimeout(p.timer); p.reject(err); }
        this._pending.clear();
      };
      child.on('error', err => failAll(new Error(`Angel One MCP failed to start: ${err.message}`)));
      child.on('exit', code => failAll(new Error(`Angel One MCP exited (code ${code}). ${stderr.trim()}`)));
      child.stdout.on('data', chunk => {
        this._buffer += chunk;
        let nl;
        while ((nl = this._buffer.indexOf('\n')) >= 0) {
          const line = this._buffer.slice(0, nl).trim();
          this._buffer = this._buffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          const p = this._pending.get(msg.id);
          if (p) { clearTimeout(p.timer); this._pending.delete(msg.id); p.resolve(msg); }
        }
      });
      await this._rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agents-angelone-client', version: '1.0.0' }
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    })();
    return this._ready;
  }

  async _callStdio(toolName, toolArgs) {
    await this._startStdio();
    const msg = await this._rpc('tools/call', { name: toolName, arguments: toolArgs });
    return AngelOneMcpClient.unwrapResult(msg);
  }

  /** Stop the spawned MCP server (no-op for HTTP transport) */
  async close() {
    if (this._child) {
      try { this._child.stdin.end(); } catch { /* ignore */ }
      this._child.kill();
      this._child = null;
      this._ready = null;
    }
  }

  /**
   * Execute a JSON-RPC tool call against Angel One MCP endpoint
   */
  async callTool(toolName, toolArgs = {}, customHeaders = {}) {
    if (this.transport === 'stdio') {
      return this._callStdio(toolName, toolArgs);
    }
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs
      }
    });

    return new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(this.endpoint);
      } catch (err) {
        return reject(new Error(`Invalid Angel One MCP endpoint URL: ${this.endpoint}`));
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
        ...customHeaders
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (this.apiKey) {
        headers['X-Api-Key'] = this.apiKey;
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
            return reject(new Error(`Angel One MCP Authentication failed (HTTP ${res.statusCode}). Please check your SmartAPI key or session.`));
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Angel One MCP returned HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              return reject(new Error(`Angel One MCP Error [${parsed.error.code}]: ${parsed.error.message}`));
            }
            // Standard MCP tools/call result format
            if (parsed.result && parsed.result.content && Array.isArray(parsed.result.content)) {
              const textContent = parsed.result.content.find(c => c.type === 'text');
              if (textContent && textContent.text) {
                try {
                  return resolve(JSON.parse(textContent.text));
                } catch {
                  return resolve(textContent.text);
                }
              }
            }
            resolve(parsed.result || parsed);
          } catch (e) {
            reject(new Error(`Failed to parse MCP response as JSON: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Angel One MCP request timed out after ${this.timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(new Error(`Angel One MCP connection error: ${err.message}`));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Fetch user's equity holdings from Angel One SmartAPI via MCP
   * Calls get_holdings or get_all_holdings
   */
  async getHoldings() {
    try {
      let res;
      try {
        res = await this.callTool('get_holdings');
      } catch (e) {
        res = await this.callTool('get_all_holdings');
      }

      const holdings = Array.isArray(res) ? res : (res.data || res.holdings || []);
      return holdings.map(h => {
        let symbol = (h.tradingsymbol || h.symbol || h.scrip_name || h.trading_symbol || '').trim();
        // Strip exchange series suffix (e.g., "INFY-EQ" -> "INFY", "ITC-EQ" -> "ITC")
        symbol = symbol.replace(/-EQ$/i, '').replace(/-BE$/i, '');
        const qty = Number(h.totalqty || h.quantity || h.holdings_quantity || 0) + Number(h.t1_quantity || h.t1quantity || 0);
        const avgPrice = Number(h.avgprice || h.averageprice || h.average_price || 0);
        const ltp = Number(h.ltp || h.last_price || h.close || h.close_price || 0);
        const pnl = Number(h.pnl || h.unrealized_pnl || h.unrealizedpnl || (qty * (ltp - avgPrice)));
        const invested = Number(h.invested || (qty * avgPrice));
        const currentValue = Number(h.current_value || (qty * ltp));

        return {
          tradingsymbol: symbol,
          isin: h.isin || h.isin_code || '',
          quantity: qty,
          average_price: avgPrice,
          last_price: ltp,
          pnl,
          invested,
          current_value: currentValue
        };
      });
    } catch (err) {
      throw new Error(`Failed to get Angel One holdings: ${err.message}`);
    }
  }

  /**
   * Fetch cash margins, funds and RMS limits
   * Calls get_rms_limits or get_margins
   */
  async getMargins() {
    try {
      let res;
      try {
        res = await this.callTool('get_rms_limits');
      } catch (e) {
        res = await this.callTool('get_margins');
      }

      const raw = (res && res.data) ? res.data : res;
      const cash = Number(raw.net || raw.availablecash || raw.available_cash || raw.live_balance || 0);
      const collateral = Number(raw.collateral || raw.marginused || 0);
      const utilised = Number(raw.utilised || raw.utilised_debits || 0);

      return {
        available_cash: cash,
        collateral,
        utilised,
        net_margin: cash + collateral - utilised
      };
    } catch (err) {
      throw new Error(`Failed to get Angel One margins: ${err.message}`);
    }
  }

  /**
   * Fetch today's executed trades
   * Calls get_trade_book or get_trades
   */
  async getTrades() {
    try {
      let res;
      try {
        res = await this.callTool('get_trade_book');
      } catch (e) {
        res = await this.callTool('get_trades');
      }
      return Array.isArray(res) ? res : (res.data || res.trades || []);
    } catch (err) {
      throw new Error(`Failed to get Angel One trades: ${err.message}`);
    }
  }

  /**
   * Fetch multi-year historical executed trades parsed from annual tradebooks via MCP
   * Calls get_historical_trades
   */
  async getHistoricalTrades(year = null) {
    try {
      const args = year ? { year: Number(year) } : {};
      const res = await this.callTool('get_historical_trades', args);
      const trades = Array.isArray(res) ? res : (res && res.data ? res.data : []);
      return trades.map(t => ({
        tradeId: String(t.trade_id || t.tradeId || ''),
        symbol: (t.symbol || '').toUpperCase().replace(/-EQ$/i, '').replace(/-BE$/i, ''),
        isin: t.isin || '',
        date: t.date,
        type: (t.type || 'BUY').toUpperCase(),
        quantity: Number(t.quantity || t.qty || 0),
        price: Number(t.price || 0),
        amount: Number(t.amount || (Number(t.quantity || 0) * Number(t.price || 0)))
      }));
    } catch (err) {
      throw new Error(`Failed to get Angel One historical trades from MCP: ${err.message}`);
    }
  }

  /**
   * Fetch multi-year bank fund cashflows (pay-ins & payouts) from annual account ledgers via MCP
   * Calls get_account_ledger
   */
  async getAccountLedger(year = null) {
    try {
      const args = year ? { year: Number(year) } : {};
      const res = await this.callTool('get_account_ledger', args);
      const flows = Array.isArray(res) ? res : (res && res.data ? res.data : []);
      return flows.map(cf => ({
        date: cf.date,
        amount: Number(cf.amount || 0),
        category: cf.category || (Number(cf.amount) < 0 ? 'PAYIN' : 'PAYOUT'),
        description: cf.description || cf.desc || cf.particulars || 'Fund Transfer',
        voucher: cf.voucher || ''
      }));
    } catch (err) {
      throw new Error(`Failed to get Angel One account ledger from MCP: ${err.message}`);
    }
  }
}

// Export AngelOneMcpClient as default, with KiteMcpClient alias for backwards compatibility
module.exports = AngelOneMcpClient;
module.exports.AngelOneMcpClient = AngelOneMcpClient;
module.exports.KiteMcpClient = AngelOneMcpClient;
