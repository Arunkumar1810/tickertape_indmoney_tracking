'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SHARED_DIR = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CREDENTIALS_FILE = path.join(SHARED_DIR, 'client_credentials.json');
const TOKENS_FILE = path.join(SHARED_DIR, 'tokens.json');
const PORT = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function basicHeaders(creds) {
  const h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (creds.client_secret) {
    h.Authorization = 'Basic ' + Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  }
  return h;
}

async function getClientCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
  }
  const rootCreds = path.join(PROJECT_ROOT, 'client_credentials.json');
  if (fs.existsSync(rootCreds)) {
    const creds = JSON.parse(fs.readFileSync(rootCreds, 'utf8'));
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
    return creds;
  }
  console.error('Registering client with Tickertape...');
  const res = await fetch('https://auth.api.tickertape.in/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'tickertape skill', redirect_uris: [REDIRECT_URI] })
  });
  if (!res.ok) throw new Error(`Dynamic registration failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const creds = {
    client_id: data.client_id,
    client_secret: data.client_secret,
    authorization_endpoint: 'https://auth.api.tickertape.in/oauth/authorize',
    token_endpoint: 'https://auth.api.tickertape.in/oauth/token',
    mcp_endpoint: 'https://mcp.tickertape.in/mcp'
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  return creds;
}

function loadTokens() {
  for (const f of [TOKENS_FILE, path.join(PROJECT_ROOT, 'tokens.json')]) {
    try {
      if (fs.existsSync(f)) {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (data.access_token) return data;
      }
    } catch (e) {
      /* empty */
    }
  }
  return null;
}

function saveTokens(t) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...t, saved_at: Date.now() }, null, 2));
}

async function refreshToken(creds, tokens) {
  if (!tokens || !tokens.refresh_token) return null;
  try {
    const res = await fetch(creds.token_endpoint, {
      method: 'POST',
      headers: basicHeaders(creds),
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.client_id,
        refresh_token: tokens.refresh_token
      })
    });
    if (!res.ok) return null;
    const fresh = await res.json();
    saveTokens(fresh);
    return fresh;
  } catch (e) {
    return null;
  }
}

function openBrowser(url) {
  const p = process.platform;
  const cmd = p === 'win32' ? `start "" "${url.replace(/&/g, '^&')}"` : p === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function performOAuthLogin(creds) {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = `${creds.authorization_endpoint}?${new URLSearchParams({
    response_type: 'code',
    client_id: creds.client_id,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })}`;

  console.error('\nTo authenticate with Tickertape, open:');
  console.error(authUrl + '\n');
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, `http://localhost:${PORT}`);
        if (u.pathname !== '/callback') {
          res.writeHead(404).end();
          return;
        }
        if (u.searchParams.get('state') !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' }).end('State mismatch.');
          reject(new Error('OAuth state mismatch'));
          return;
        }
        const c = u.searchParams.get('code');
        if (!c) {
          res.writeHead(400, { 'Content-Type': 'text/html' }).end('Missing code.');
          reject(new Error('No code returned from OAuth'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('Authentication successful. You can close this tab.');
        resolve(c);
      } finally {
        server.close();
      }
    });
    server.listen(PORT, '127.0.0.1');
    server.on('error', reject);
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout after 180s'));
    }, 180000);
  });

  const res = await fetch(creds.token_endpoint, {
    method: 'POST',
    headers: basicHeaders(creds),
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: creds.client_id,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const tokens = await res.json();
  saveTokens(tokens);
  return tokens;
}

async function getValidToken() {
  const creds = await getClientCredentials();
  const existing = loadTokens();
  if (existing) {
    const expired = existing.saved_at && existing.expires_in && Date.now() - existing.saved_at > (existing.expires_in - 60) * 1000;
    if (!expired) return { creds, token: existing.access_token };
    const refreshed = await refreshToken(creds, existing);
    if (refreshed) return { creds, token: refreshed.access_token };
  }
  const fresh = await performOAuthLogin(creds);
  return { creds, token: fresh.access_token };
}

module.exports = {
  getClientCredentials,
  loadTokens,
  saveTokens,
  refreshToken,
  performOAuthLogin,
  getValidToken,
  PORT,
  REDIRECT_URI,
  CREDENTIALS_FILE,
  TOKENS_FILE,
  SHARED_DIR
};
