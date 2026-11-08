'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  detectAuthError,
  formatRenewalInstructions,
  updateEnvCredentials,
  saveServiceCredentials,
  promptTokenRenewal,
  renderCacheWarningBanner
} = require('../auth_manager');

const { parseArgs } = require('../renew_token');

test('auth_manager - detectAuthError identifies various auth failures', () => {
  // HTTP 401 code
  const err401 = new Error('Request failed with status code 401');
  err401.statusCode = 401;
  const res1 = detectAuthError('angelone', err401);
  assert.equal(res1.isAuthError, true);
  assert.equal(res1.service, 'angelone');

  // HTTP 403 code
  const res403 = detectAuthError('indmoney', { statusCode: 403, message: 'Forbidden' });
  assert.equal(res403.isAuthError, true);

  // JWT expired message
  const jwtErr = new Error('JsonWebTokenError: jwt expired');
  const res2 = detectAuthError('tickertape', jwtErr);
  assert.equal(res2.isAuthError, true);

  // Angel One error code AG8001
  const smartApiErr = { message: 'Invalid Token AG8001', code: 'AG8001' };
  const res3 = detectAuthError('angelone', smartApiErr);
  assert.equal(res3.isAuthError, true);

  // Plain string token expired
  const resStr = detectAuthError('indmoney', 'Session token has expired');
  assert.equal(resStr.isAuthError, true);

  // Non-auth error: DNS failure
  const netErr = new Error('getaddrinfo ENOTFOUND api.angelbroking.com');
  const res4 = detectAuthError('angelone', netErr);
  assert.equal(res4.isAuthError, false);

  // Non-auth error: Syntax error
  const synErr = new SyntaxError('Unexpected token < in JSON at position 0');
  const res5 = detectAuthError('tickertape', synErr);
  assert.equal(res5.isAuthError, false);
});

test('auth_manager - formatRenewalInstructions returns tailored guidance', () => {
  const angelGuide = formatRenewalInstructions('angelone');
  assert.match(angelGuide, /ANGELONE_CLIENT_CODE/);
  assert.match(angelGuide, /ANGELONE_API_KEY/);
  assert.match(angelGuide, /ANGELONE_TOTP_KEY/);

  const indGuide = formatRenewalInstructions('indmoney');
  assert.match(indGuide, /INDMONEY_MCP_TOKEN/);

  const ttGuide = formatRenewalInstructions('tickertape');
  assert.match(ttGuide, /access_token/);
  assert.match(ttGuide, /tokens\.json/);
});

test('auth_manager - updateEnvCredentials idempotently modifies .env', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
  const tempEnv = path.join(tempDir, '.env');

  try {
    // Initial content with comments
    const initialContent = `# Project Config
PORT=3000
# Auth Section
ANGELONE_CLIENT_CODE=OLD_CODE
ANGELONE_API_KEY=OLD_KEY
`;
    fs.writeFileSync(tempEnv, initialContent, 'utf8');

    // Update existing and add new
    const updates = {
      ANGELONE_API_KEY: 'NEW_KEY_123',
      ANGELONE_TOTP_KEY: 'TOTP_SECRET_ABC'
    };

    const res = updateEnvCredentials(updates, tempEnv);
    assert.equal(res.success, true);
    assert.deepEqual(res.updatedKeys, ['ANGELONE_API_KEY', 'ANGELONE_TOTP_KEY']);

    const updated = fs.readFileSync(tempEnv, 'utf8');
    // Ensure comments and unaffected keys preserved
    assert.match(updated, /# Project Config/);
    assert.match(updated, /PORT=3000/);
    assert.match(updated, /ANGELONE_CLIENT_CODE=OLD_CODE/);
    // Ensure updated key changed
    assert.match(updated, /ANGELONE_API_KEY=NEW_KEY_123/);
    assert.doesNotMatch(updated, /OLD_KEY/);
    // Ensure new key appended
    assert.match(updated, /ANGELONE_TOTP_KEY=TOTP_SECRET_ABC/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('auth_manager - saveServiceCredentials handles multiple services', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-test-'));
  const tempEnv = path.join(tempDir, '.env');
  const tempTokens = path.join(tempDir, 'tokens.json');

  try {
    // 1. Angel One
    const angelRes = saveServiceCredentials('angelone', {
      ANGELONE_JWT_TOKEN: 'jwt_mock_999'
    }, { envPath: tempEnv });
    assert.equal(angelRes.success, true);
    assert.match(fs.readFileSync(tempEnv, 'utf8'), /ANGELONE_JWT_TOKEN=jwt_mock_999/);

    // 2. INDmoney
    const indRes = saveServiceCredentials('indmoney', {
      token: 'ind_bearer_token_xyz'
    }, { envPath: tempEnv });
    assert.equal(indRes.success, true);
    assert.match(fs.readFileSync(tempEnv, 'utf8'), /INDMONEY_MCP_TOKEN=ind_bearer_token_xyz/);

    // 3. Tickertape
    const ttRes = saveServiceCredentials('tickertape', {
      access_token: 'tt_access_111',
      refresh_token: 'tt_refresh_222'
    }, { tokensPath: tempTokens });
    assert.equal(ttRes.success, true);
    const parsedTokens = JSON.parse(fs.readFileSync(tempTokens, 'utf8'));
    assert.equal(parsedTokens.access_token, 'tt_access_111');
    assert.equal(parsedTokens.refresh_token, 'tt_refresh_222');
    assert.ok(parsedTokens.saved_at > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('auth_manager - promptTokenRenewal non-interactive and scripted modes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'));
  const tempEnv = path.join(tempDir, '.env');

  try {
    // Non-interactive without inputs returns false and prints instructions
    const nonIntRes = await promptTokenRenewal('indmoney', {
      nonInteractive: true,
      silent: true,
      envPath: tempEnv
    });
    assert.equal(nonIntRes.success, false);
    assert.equal(nonIntRes.promptAvailable, false);
    assert.match(nonIntRes.instructions, /INDMONEY_MCP_TOKEN/);

    // Scripted inputs mode succeeds
    const scriptedRes = await promptTokenRenewal('indmoney', {
      inputs: { token: 'scripted_token_777' },
      envPath: tempEnv
    });
    assert.equal(scriptedRes.success, true);
    assert.match(fs.readFileSync(tempEnv, 'utf8'), /INDMONEY_MCP_TOKEN=scripted_token_777/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('auth_manager - renderCacheWarningBanner generates self-contained alert banner', () => {
  const banner = renderCacheWarningBanner('2026-11-07T12:00:00Z');
  assert.match(banner, /class="cache-warning-banner"/);
  assert.match(banner, /2026-11-07T12:00:00Z/);
  assert.match(banner, /\[WARNING\] Cached Snapshot Active:/);
  assert.match(banner, /Upstream provider unreachable/);

  // Invariant 2: Check for 0 external network leaks
  assert.doesNotMatch(banner, /https?:\/\//i);
});

test('renew_token CLI - parses arguments properly', () => {
  const args1 = parseArgs(['--service', 'indmoney', '--token', 'secret123']);
  assert.equal(args1.service, 'indmoney');
  assert.equal(args1.token, 'secret123');

  const args2 = parseArgs(['-s', 'tickertape', '--token', 'access99', '--refresh-token', 'refresh88']);
  assert.equal(args2.service, 'tickertape');
  assert.equal(args2.token, 'access99');
  assert.equal(args2.refreshToken, 'refresh88');

  const args3 = parseArgs(['--service', 'angelone', '--jwt', 'jwtval', '--totp', 'totpval']);
  assert.equal(args3.service, 'angelone');
  assert.equal(args3.jwt, 'jwtval');
  assert.equal(args3.totp, 'totpval');
});

