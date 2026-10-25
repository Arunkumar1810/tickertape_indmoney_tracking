const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const AngelOneMcpClient = require('../scripts/lib/mcp_client');

test('AngelOneMcpClient successfully connects to local mock Angel One MCP server and returns holdings', async () => {
  const mockHoldings = [
    { tradingsymbol: 'INFY', isin: 'INE009A01021', quantity: 50, t1_quantity: 0, average_price: 1400, last_price: 1600, pnl: 10000 },
    { tradingsymbol: 'RELIANCE', isin: 'INE002A01018', quantity: 20, t1_quantity: 0, average_price: 2400, last_price: 2600, pnl: 4000 }
  ];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      if (parsed.params && (parsed.params.name === 'get_holdings' || parsed.params.name === 'get_all_holdings')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(mockHoldings) }]
          }
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const client = new AngelOneMcpClient({ endpoint: `http://127.0.0.1:${port}/mcp` });
    const holdings = await client.getHoldings();

    assert.strictEqual(holdings.length, 2);
    assert.strictEqual(holdings[0].tradingsymbol, 'INFY');
    assert.strictEqual(holdings[0].invested, 70000);
    assert.strictEqual(holdings[0].current_value, 80000);
    assert.strictEqual(holdings[1].tradingsymbol, 'RELIANCE');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('AngelOneMcpClient fetches multi-year historical trades and account ledger cashflows', async () => {
  const mockTrades = [
    { trade_id: 'TR001', symbol: 'INFY-EQ', date: '2026-06-25', type: 'BUY', quantity: 2, price: 1050, amount: 2100 }
  ];
  const mockLedger = [
    { date: '2026-04-01', amount: -10000, category: 'PAYIN', description: 'Funds Added', voucher: 'V101' },
    { date: '2026-07-15', amount: 2500, category: 'PAYOUT', description: 'Payout', voucher: 'V102' }
  ];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const toolName = parsed.params && parsed.params.name;
      if (toolName === 'get_historical_trades') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: { content: [{ type: 'text', text: JSON.stringify(mockTrades) }] }
        }));
      } else if (toolName === 'get_account_ledger') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: parsed.id,
          result: { content: [{ type: 'text', text: JSON.stringify(mockLedger) }] }
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const client = new AngelOneMcpClient({ endpoint: `http://127.0.0.1:${port}/mcp` });
    const trades = await client.getHistoricalTrades();
    assert.strictEqual(trades.length, 1);
    assert.strictEqual(trades[0].symbol, 'INFY');
    assert.strictEqual(trades[0].quantity, 2);
    assert.strictEqual(trades[0].amount, 2100);

    const ledger = await client.getAccountLedger();
    assert.strictEqual(ledger.length, 2);
    assert.strictEqual(ledger[0].category, 'PAYIN');
    assert.strictEqual(ledger[0].amount, -10000);
    assert.strictEqual(ledger[1].category, 'PAYOUT');
    assert.strictEqual(ledger[1].amount, 2500);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('AngelOneMcpClient handles 401 Unauthorized gracefully', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Session expired' }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const client = new AngelOneMcpClient({ endpoint: `http://127.0.0.1:${port}/mcp` });
    await assert.rejects(
      async () => await client.getHoldings(),
      /Angel One MCP Authentication failed/
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
