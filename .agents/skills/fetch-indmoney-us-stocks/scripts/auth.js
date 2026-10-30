#!/usr/bin/env node
'use strict';
/**
 * One-click OAuth login helper for INDmoney MCP (https://mcp.indmoney.com/mcp).
 * Completes RFC 7591 dynamic client registration + PKCE authorization flow.
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function postJson(urlStr, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postForm(urlStr, params) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = new URLSearchParams(params).toString();
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/json'
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function saveTokenToEnv(token) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  if (content.match(/^INDMONEY_MCP_TOKEN=.*$/m)) {
    content = content.replace(/^INDMONEY_MCP_TOKEN=.*$/m, `INDMONEY_MCP_TOKEN=${token}`);
  } else {
    content = (content.trim() + `\nINDMONEY_MCP_TOKEN=${token}\n`).trim() + '\n';
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

async function startOAuthFlow() {
  console.log('🔑 Initiating INDmoney MCP OAuth 2.1 registration...');

  // 1. Dynamic Client Registration
  const regRes = await postJson('https://mcp.indmoney.com/register', {
    client_name: 'Antigravity MCP Client',
    redirect_uris: [REDIRECT_URI]
  });

  if (regRes.status !== 200 && regRes.status !== 201) {
    throw new Error(`Failed to register OAuth client: ${JSON.stringify(regRes.data || regRes.raw)}`);
  }

  const { client_id, client_secret } = regRes.data;
  console.log('✅ Registered temporary OAuth client:', client_id);

  // 2. PKCE Setup
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = `https://mcp.indmoney.com/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id,
    redirect_uri: REDIRECT_URI,
    scope: 'portfolio:read market:read',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  }).toString();

  // 3. Local callback listener
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const code = reqUrl.searchParams.get('code');
    const returnedState = reqUrl.searchParams.get('state');
    const error = reqUrl.searchParams.get('error');
    const errorDesc = reqUrl.searchParams.get('error_description');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Authorization Error:</h2><p>${errorDesc || error}</p>`);
      console.error(`❌ Authorization rejected: ${errorDesc || error}`);
      server.close();
      process.exit(1);
    }

    if (!code || returnedState !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Invalid authorization callback response.</h2>`);
      server.close();
      process.exit(1);
    }

    // Exchange code for MCP Access Token
    console.log('🔄 Exchanging authorization code for MCP token...');
    try {
      const tokenRes = await postForm('https://mcp.indmoney.com/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id,
        client_secret,
        code_verifier: verifier
      });

      if (tokenRes.status !== 200) {
        throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${JSON.stringify(tokenRes.data || tokenRes.raw)}`);
      }

      const accessToken = tokenRes.data.access_token;
      saveTokenToEnv(accessToken);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #10b981;">🎉 INDmoney MCP Authentication Successful!</h2>
          <p>The token has been saved to your <code>.env</code> file.</p>
          <p>You can close this tab and return to the IDE.</p>
        </div>
      `);

      console.log('✅ INDmoney MCP Token saved to .env successfully!');
      console.log('🚀 You can now run: node .agents/skills/fetch-indmoney-us-stocks/scripts/fetch_us_stocks.js');
    } catch (err) {
      console.error('❌ Token exchange error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h2>Failed to exchange token</h2><p>${err.message}</p>`);
    } finally {
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🌐 Opening INDmoney OAuth authorization page in browser:`);
    console.log(`\n   ${authUrl}\n`);

    // Auto open in Windows browser
    exec(`start "" "${authUrl}"`, () => {});
  });
}

if (require.main === module) {
  startOAuthFlow().catch(err => {
    console.error('❌ Login flow failed:', err.message);
    process.exit(1);
  });
}

module.exports = { startOAuthFlow };
