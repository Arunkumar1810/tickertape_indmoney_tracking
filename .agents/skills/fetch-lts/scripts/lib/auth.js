'use strict';
/**
 * Self-contained Tickertape OAuth helper for the fetch-lts skill.
 * State (tokens, client registration) lives in the skill's `state/` directory
 * (override with LTS_STATE_DIR). Nothing outside the skill is read or written,
 * except a one-time import of an existing tokens.json / client_credentials.json
 * from the repository root so an existing login keeps working.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = process.env.LTS_STATE_DIR ? path.resolve(process.env.LTS_STATE_DIR) : path.join(SKILL_ROOT, 'state');
const CREDENTIALS_FILE = path.join(STATE_DIR, 'client_credentials.json');
const TOKENS_FILE = path.join(STATE_DIR, 'tokens.json');
const LEGACY_DIR = path.resolve(SKILL_ROOT, '..', '..', '..');
const PORT = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

function ensureState() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  for (const [dest, name] of [[CREDENTIALS_FILE, 'client_credentials.json'], [TOKENS_FILE, 'tokens.json']]) {
    const legacy = path.join(LEGACY_DIR, name);
    if (!fs.existsSync(dest) && !process.env.LTS_STATE_DIR && fs.existsSync(legacy)) fs.copyFileSync(legacy, dest);
  }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getClientCredentials() {
  ensureState();
  if (fs.existsSync(CREDENTIALS_FILE)) return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
  console.error('Registering client with Tickertape...');
  const res = await fetch('https://auth.api.tickertape.in/oauth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'fetch-lts skill', redirect_uris: [REDIRECT_URI] })
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
  ensureState();
  try {
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    if (data.access_token) return data;
  } catch (e) {
    /* none */
  }
  return null;
}

function saveTokens(tokens) {
  ensureState();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...tokens, saved_at: Date.now() }, null, 2));
}

function basicHeaders(creds) {
  const h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (creds.client_secret) h.Authorization = 'Basic ' + Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  return h;
}

async function refreshToken(creds, tokens) {
  if (!tokens || !tokens.refresh_token) return null;
  console.error('Refreshing access token...');
  try {
    const res = await fetch(creds.token_endpoint, {
      method: 'POST',
      headers: basicHeaders(creds),
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: creds.client_id }).toString()
    });
    if (res.ok) {
      const t = await res.json();
      saveTokens(t);
      return t;
    }
  } catch (err) {
    console.error('Failed to refresh token:', err.message);
  }
  return null;
}

function performOAuthLogin(creds) {
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    const authUrl = new URL(creds.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', creds.client_id);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', 'market_data portfolio');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname !== '/callback') return;
      const fail = (code, msg, err) => {
        res.writeHead(code, { 'Content-Type': 'text/plain' });
        res.end(msg);
        server.close();
        reject(err);
      };
      if (u.searchParams.get('error')) return fail(400, 'Authentication failed', new Error('OAuth error: ' + u.searchParams.get('error')));
      if (u.searchParams.get('state') !== state) return fail(400, 'State mismatch', new Error('OAuth state mismatch'));
      try {
        const tokenRes = await fetch(creds.token_endpoint, {
          method: 'POST',
          headers: basicHeaders(creds),
          body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: REDIRECT_URI, code_verifier: verifier, client_id: creds.client_id }).toString()
        });
        if (!tokenRes.ok) return fail(500, 'Token exchange failed', new Error(`Token exchange failed: ${tokenRes.status}`));
        const t = await tokenRes.json();
        saveTokens(t);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Tickertape connected. You can close this tab and return to your terminal.');
        server.close();
        resolve(t);
      } catch (err) {
        fail(500, 'Error', err);
      }
    });
    server.listen(PORT, () => {
      console.error(`\nTICKERTAPE LOGIN REQUIRED. Open:\n${authUrl}\n`);
      exec(`start "" "${authUrl.toString()}"`, () => {});
    });
    server.on('error', reject);
  });
}

async function getValidToken() {
  const creds = await getClientCredentials();
  const tokens = loadTokens();
  if (tokens) {
    const expired = tokens.saved_at && tokens.expires_in && Date.now() - tokens.saved_at > (tokens.expires_in - 60) * 1000;
    if (!expired) return { creds, token: tokens.access_token };
    const refreshed = await refreshToken(creds, tokens);
    if (refreshed) return { creds, token: refreshed.access_token };
  }
  const t = await performOAuthLogin(creds);
  return { creds, token: t.access_token };
}

module.exports = { getValidToken, getClientCredentials, loadTokens, refreshToken, performOAuthLogin, STATE_DIR, TOKENS_FILE, CREDENTIALS_FILE };
