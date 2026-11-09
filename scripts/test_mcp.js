const https = require('https');
const fs = require('fs');
const { loadEnvFile } = require('./indmoney');

const env = loadEnvFile();
const rawToken = env.INDMONEY_MCP_TOKEN || '';
const token = rawToken.replace(/^Bearer\s+/i, '').trim();

async function testReq(name, headers, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });

    const req = https.request('https://mcp.indmoney.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log(`[${name}] Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        console.log(`Body:`, data.slice(0, 300));
        console.log('---');
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', err => {
      console.log(`[${name}] Error:`, err.message);
      resolve({ error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('Testing raw token length:', token.length);
  // Test 1: Bearer
  await testReq('Bearer', { 'Authorization': `Bearer ${token}` });
  // Test 2: Raw token
  await testReq('Raw Token Header', { 'Authorization': token });
  // Test 3: Cookie
  await testReq('Cookie', { 'Cookie': `token=${token}; session=${token}` });
  // Test 4: x-auth-token / x-access-token
  await testReq('X-Headers', { 'x-auth-token': token, 'x-access-token': token, 'Authorization': `Bearer ${token}` });
})();
