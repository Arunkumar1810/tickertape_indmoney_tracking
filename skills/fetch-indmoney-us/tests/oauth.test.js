'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  generatePkce,
  buildAuthorizeUrl,
  updateEnvToken,
  performIndmoneyOAuthLogin
} = require('../../../scripts/indmoney/oauth');

test('indmoney oauth: generatePkce produces URL-safe verifier and SHA256 challenge', () => {
  const { verifier, challenge } = generatePkce();
  assert.ok(verifier && typeof verifier === 'string');
  assert.ok(challenge && typeof challenge === 'string');
  assert.ok(verifier.length >= 43);
  assert.ok(challenge.length >= 43);
  // Verify base64url characters (no +, /, or =)
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
});

test('indmoney oauth: buildAuthorizeUrl constructs complete URL with required parameters', () => {
  const url = buildAuthorizeUrl({
    redirectUri: 'http://localhost:3000/callback',
    challenge: 'TEST_CHALLENGE',
    scope: 'portfolio:read'
  });

  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'https:');
  assert.equal(parsed.hostname, 'mcp.indmoney.com');
  assert.equal(parsed.pathname, '/authorize');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'http://localhost:3000/callback');
  assert.equal(parsed.searchParams.get('code_challenge'), 'TEST_CHALLENGE');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('scope'), 'portfolio:read');
});

test('indmoney oauth: updateEnvToken idempotently writes INDMONEY_MCP_TOKEN', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-env-'));
  const tmpEnv = path.join(tmpDir, '.env');
  fs.writeFileSync(tmpEnv, 'EXISTING_VAR=123\nINDMONEY_MCP_TOKEN=old_token\nOTHER_VAR=456\n', 'utf8');

  try {
    updateEnvToken('new_fresh_token', tmpEnv);
    const updated = fs.readFileSync(tmpEnv, 'utf8');
    assert.match(updated, /INDMONEY_MCP_TOKEN=new_fresh_token/);
    assert.match(updated, /EXISTING_VAR=123/);
    assert.match(updated, /OTHER_VAR=456/);
    assert.doesNotMatch(updated, /old_token/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('indmoney oauth: performIndmoneyOAuthLogin handles full callback cycle successfully', async () => {
  const testPort = 3095;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-login-'));
  const tmpEnv = path.join(tmpDir, '.env');
  fs.writeFileSync(tmpEnv, 'EXISTING_VAR=hello\n', 'utf8');

  const mockTokenFetcher = async ({ code, codeVerifier }) => {
    assert.equal(code, 'mock_auth_code_999');
    assert.ok(codeVerifier);
    return {
      access_token: 'mock_access_token_xyz',
      token_type: 'Bearer',
      expires_in: 3600
    };
  };

  try {
    const loginPromise = performIndmoneyOAuthLogin({
      port: testPort,
      openBrowser: false,
      silent: true,
      envPath: tmpEnv,
      tokenFetcher: mockTokenFetcher,
      timeoutMs: 5000
    });

    // Send callback request to local server
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve, reject) => {
      http.get(`http://localhost:${testPort}/callback?code=mock_auth_code_999`, (res) => {
        assert.equal(res.statusCode, 200);
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          assert.match(body, /Authentication Successful/);
          resolve();
        });
      }).on('error', reject);
    });

    const result = await loginPromise;
    assert.equal(result.ok, true);
    assert.equal(result.access_token, 'mock_access_token_xyz');

    const envContent = fs.readFileSync(tmpEnv, 'utf8');
    assert.match(envContent, /INDMONEY_MCP_TOKEN=mock_access_token_xyz/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('indmoney oauth: performIndmoneyOAuthLogin handles OAuth error callback properly', async () => {
  const testPort = 3096;

  const loginPromise = performIndmoneyOAuthLogin({
    port: testPort,
    openBrowser: false,
    silent: true,
    timeoutMs: 5000
  });

  const rejectionAssertion = assert.rejects(loginPromise, /access_denied/);

  await new Promise((resolve) => setTimeout(resolve, 50));
  await new Promise((resolve, reject) => {
    http.get(`http://localhost:${testPort}/callback?error=access_denied&error_description=User+declined`, (res) => {
      assert.equal(res.statusCode, 400);
      resolve();
    }).on('error', reject);
  });

  await rejectionAssertion;
});
