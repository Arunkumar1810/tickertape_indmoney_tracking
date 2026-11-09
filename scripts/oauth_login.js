const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = fs.existsSync(path.join(REPO_ROOT, 'config', '.env'))
  ? path.join(REPO_ROOT, 'config', '.env')
  : path.join(REPO_ROOT, '.env');

const CLIENT_ID = '5d1c1acf-9fd4-4264-b817-5932b538faf6';
const CLIENT_SECRET = 'ca0641d9b4cc1a0da3eccf084fd1a522f4332e35ab3fa10a119fd06f352e1b85';
const REDIRECT_URI = 'http://localhost:3000/callback';

const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

const authUrl = `https://mcp.indmoney.com/authorize?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent('portfolio:read market:read')}` +
  `&code_challenge=${challenge}` +
  `&code_challenge_method=S256`;

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost:3000');
  if (reqUrl.pathname === '/callback') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Authentication Failed</h2><p>${error}: ${reqUrl.searchParams.get('error_description')}</p>`);
      console.error(`OAuth error: ${error}`);
      server.close();
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>Missing code parameter</h2>');
      server.close();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authentication Successful!</h2><p>You can close this tab now. Returning to terminal...</p>');

    try {
      const tokenData = await exchangeCodeForToken(code, verifier);
      console.log('SUCCESS: Obtained OAuth token!');
      console.log('Token Type:', tokenData.token_type);
      console.log('Access Token (truncated):', tokenData.access_token.slice(0, 10) + '...');

      // Update .env
      updateEnv(tokenData.access_token);
      console.log('Updated .env with fresh INDMONEY_MCP_TOKEN.');
    } catch (e) {
      console.error('Failed to exchange code for token:', e.message);
    } finally {
      server.close();
      process.exit(0);
    }
  }
});

function exchangeCodeForToken(code, codeVerifier) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    }).toString();

    const req = https.request({
      hostname: 'mcp.indmoney.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && parsed.access_token) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error_description || parsed.error || body));
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

function updateEnv(newToken) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  if (content.includes('INDMONEY_MCP_TOKEN=')) {
    content = content.replace(/INDMONEY_MCP_TOKEN=.*/, `INDMONEY_MCP_TOKEN=${newToken}`);
  } else {
    content += `\nINDMONEY_MCP_TOKEN=${newToken}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

server.listen(3000, () => {
  console.log('OAuth helper listening on http://localhost:3000/callback');
  console.log('\n======================================================');
  console.log('  OPEN THIS URL IN YOUR BROWSER TO AUTHORIZE:');
  console.log('======================================================\n');
  console.log(authUrl);
  console.log('\n======================================================\n');

  // Attempt opening browser automatically on Windows
  exec(`start "" "${authUrl}"`, (err) => {
    if (err) console.log('Could not open browser automatically, please copy the URL above.');
  });
});

