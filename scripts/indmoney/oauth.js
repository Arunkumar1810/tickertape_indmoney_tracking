'use strict';

/**
 * scripts/indmoney/oauth.js: INDmoney OAuth PKCE authentication helper.
 * Provides browser-based authorization code flow with PKCE, token exchange,
 * and automatic persistence to configuration environment files.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const REPO_ROOT = fs.existsSync(path.join(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '../../..');

const DEFAULT_CONFIG_ENV = path.join(REPO_ROOT, 'config', '.env');
const DEFAULT_ROOT_ENV = path.join(REPO_ROOT, '.env');

const CLIENT_ID = '5d1c1acf-9fd4-4264-b817-5932b538faf6';
const CLIENT_SECRET = 'ca0641d9b4cc1a0da3eccf084fd1a522f4332e35ab3fa10a119fd06f352e1b85';
const DEFAULT_PORT = 3000;
const AUTHORIZE_ENDPOINT = 'https://mcp.indmoney.com/authorize';
const TOKEN_ENDPOINT = 'https://mcp.indmoney.com/token';

/**
 * Generate PKCE code verifier and SHA256 challenge.
 */
function generatePkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Build the authorization URL for INDmoney MCP.
 */
function buildAuthorizeUrl({
  clientId = CLIENT_ID,
  redirectUri,
  challenge,
  scope = 'portfolio:read market:read',
  state = null
} = {}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  if (state) params.set('state', state);
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/**
 * Open URL in default system browser across platforms.
 */
function openBrowser(url) {
  const p = process.platform;
  const cmd = p === 'win32'
    ? `start "" "${url}"`
    : p === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

/**
 * Exchange OAuth authorization code for access token.
 */
function exchangeCodeForToken({
  code,
  codeVerifier,
  clientId = CLIENT_ID,
  clientSecret = CLIENT_SECRET,
  redirectUri
}) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }).toString();

    const u = new URL(TOKEN_ENDPOINT);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.access_token) {
            resolve(parsed);
          } else {
            const errDetail = parsed.error_description || parsed.error || body;
            reject(new Error(`INDmoney token exchange failed (${res.statusCode}): ${errDetail}`));
          }
        } catch (e) {
          reject(new Error(`Failed parsing token response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Update INDMONEY_MCP_TOKEN in .env files (both config/.env and root .env).
 */
function updateEnvToken(newToken, customEnvPath = null) {
  const targetPaths = customEnvPath
    ? [customEnvPath]
    : [DEFAULT_CONFIG_ENV, DEFAULT_ROOT_ENV];

  const updatedFiles = [];
  for (const envPath of targetPaths) {
    try {
      const parent = path.dirname(envPath);
      if (!fs.existsSync(parent)) {
        fs.mkdirSync(parent, { recursive: true });
      }

      let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (content.includes('INDMONEY_MCP_TOKEN=')) {
        content = content.replace(/INDMONEY_MCP_TOKEN=.*/, `INDMONEY_MCP_TOKEN=${newToken}`);
      } else {
        if (content && !content.endsWith('\n')) content += '\n';
        content += `INDMONEY_MCP_TOKEN=${newToken}\n`;
      }
      fs.writeFileSync(envPath, content, 'utf8');
      updatedFiles.push(envPath);
    } catch {
      // Continue writing other paths
    }
  }

  // Also update live process.env for the current execution
  process.env.INDMONEY_MCP_TOKEN = newToken;

  return updatedFiles;
}

/**
 * Perform complete interactive browser OAuth PKCE login for INDmoney.
 * @param {object} [options]
 * @param {number} [options.port] - Callback listener port (default 3000)
 * @param {boolean} [options.openBrowser] - Whether to trigger system browser (default true)
 * @param {number} [options.timeoutMs] - Timeout in milliseconds (default 180000 / 3m)
 * @param {string} [options.envPath] - Custom .env path
 * @param {boolean} [options.silent] - Suppress console logs
 * @param {Function} [options.onAuthUrl] - Callback invoked with the authorization URL
 * @returns {Promise<{ ok: boolean, access_token: string, token_type: string, updatedFiles: string[] }>}
 */
function performIndmoneyOAuthLogin(options = {}) {
  const port = options.port || DEFAULT_PORT;
  const redirectUri = `http://localhost:${port}/callback`;
  const timeoutMs = options.timeoutMs || 180000;
  const shouldOpenBrowser = options.openBrowser !== false;
  const silent = Boolean(options.silent);

  const { verifier, challenge } = generatePkce();
  const authUrl = buildAuthorizeUrl({
    redirectUri,
    challenge,
    scope: options.scope || 'portfolio:read market:read'
  });

  if (typeof options.onAuthUrl === 'function') {
    options.onAuthUrl(authUrl);
  }

  return new Promise((resolve, reject) => {
    let timeoutTimer = null;
    let serverClosed = false;

    const closeServer = () => {
      if (!serverClosed) {
        serverClosed = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          server.close();
        } catch {
          // ignore
        }
      }
    };

    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url, `http://localhost:${port}`);
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');
      const errorDescription = reqUrl.searchParams.get('error_description') || '';

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
          <h2 style="color:#cf222e;">Authentication Failed</h2>
          <p>${error}: ${errorDescription}</p>
        </body></html>`);
        closeServer();
        reject(new Error(`OAuth error: ${error} ${errorDescription}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>Missing code parameter</h2>');
        closeServer();
        reject(new Error('Missing authorization code in OAuth callback'));
        return;
      }

      // Success HTML response
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>INDmoney Authentication Successful</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; text-align: center; padding: 60px 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; max-width: 500px; margin: 0 auto; padding: 32px; }
    h2 { color: #3fb950; margin-top: 0; }
    p { color: #8b949e; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h2>✅ INDmoney Authentication Successful!</h2>
    <p>Your session Bearer token has been refreshed and saved.</p>
    <p>You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`);

      try {
        const tokenExchangeFn = options.tokenFetcher || exchangeCodeForToken;
        const tokenData = await tokenExchangeFn({
          code,
          codeVerifier: verifier,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          redirectUri
        });

        const updatedFiles = updateEnvToken(tokenData.access_token, options.envPath);

        if (!silent) {
          process.stdout.write(`\n✅ [SUCCESS] INDmoney OAuth token obtained!\n`);
          process.stdout.write(`   • Token Type: ${tokenData.token_type || 'Bearer'}\n`);
          process.stdout.write(`   • Persisted to: ${updatedFiles.join(', ')}\n\n`);
        }

        closeServer();
        resolve({
          ok: true,
          access_token: tokenData.access_token,
          token_type: tokenData.token_type || 'Bearer',
          expires_in: tokenData.expires_in,
          updatedFiles
        });
      } catch (err) {
        closeServer();
        reject(err);
      }
    });

    server.on('error', (err) => {
      closeServer();
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Ensure no other OAuth helper or service is running on port ${port}.`));
      } else {
        reject(err);
      }
    });

    timeoutTimer = setTimeout(() => {
      closeServer();
      reject(new Error(`INDmoney OAuth login timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    server.listen(port, () => {
      if (!silent) {
        process.stdout.write(`\nOAuth helper listening on ${redirectUri}\n`);
        process.stdout.write(`======================================================\n`);
        process.stdout.write(`  OPEN THIS URL IN YOUR BROWSER TO AUTHORIZE:\n`);
        process.stdout.write(`======================================================\n\n`);
        process.stdout.write(`${authUrl}\n\n`);
        process.stdout.write(`======================================================\n\n`);
      }

      if (shouldOpenBrowser) {
        openBrowser(authUrl);
      }
    });
  });
}

module.exports = {
  CLIENT_ID,
  CLIENT_SECRET,
  DEFAULT_PORT,
  AUTHORIZE_ENDPOINT,
  TOKEN_ENDPOINT,
  generatePkce,
  buildAuthorizeUrl,
  openBrowser,
  exchangeCodeForToken,
  updateEnvToken,
  performIndmoneyOAuthLogin
};

