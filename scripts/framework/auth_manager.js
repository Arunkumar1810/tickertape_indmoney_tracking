'use strict';

/**
 * auth_manager.js: Centralized Authentication Error Detection & Token Renewal Handler.
 * Supports Angel One SmartAPI, INDmoney MCP, and Tickertape Pro.
 * Provides graceful degradation cache warning banners and zero-dependency credential persistence.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = fs.existsSync(path.join(__dirname, '..', '..', 'package.json'))
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '../../..');
const DEFAULT_ENV_PATH = [
  path.join(REPO_ROOT, 'config', '.env'),
  path.join(REPO_ROOT, '.env')
].find(p => fs.existsSync(p)) || path.join(REPO_ROOT, '.env');

const TICKERTAPE_TOKENS_PATH = [
  path.join(REPO_ROOT, 'config', 'tickertape', 'tokens.json'),
  path.join(REPO_ROOT, 'config', 'tokens.json'),
  path.join(REPO_ROOT, 'scripts', 'tickertape', 'tokens.json')
].find(p => fs.existsSync(p)) || path.join(REPO_ROOT, 'config', 'tickertape', 'tokens.json');

const KNOWN_SERVICES = new Set(['angelone', 'indmoney', 'tickertape']);

const AUTH_ERROR_PATTERNS = [
  /401\b/,
  /403\b/,
  /unauthorized/i,
  /jwt expired/i,
  /token.*expired/i,
  /expired.*token/i,
  /invalid.*token/i,
  /token.*invalid/i,
  /session.*expired/i,
  /expired.*session/i,
  /invalid.*session/i,
  /authentication.*failed/i,
  /invalid.*totp/i,
  /invalid.*credentials/i,
  /AG8001|AG8002|AB1004/i // Known Angel One SmartAPI token/auth error codes
];

/**
 * Detect whether an error corresponds to an authentication/token expiration failure.
 * @param {string} service - 'angelone' | 'indmoney' | 'tickertape' | null
 * @param {Error|object|string} error - The caught error or response object
 * @returns {{ isAuthError: boolean, service: string|null, message: string, code: string|number|null }}
 */
function detectAuthError(service, error) {
  const normService = service ? String(service).toLowerCase().trim() : null;
  if (!error) {
    return { isAuthError: false, service: normService, message: '', code: null };
  }

  let message = '';
  let code = null;

  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message || '';
    code = error.code || error.statusCode || error.status || null;
  } else if (typeof error === 'object') {
    message = error.message || error.error || error.description || JSON.stringify(error);
    code = error.statusCode || error.status || error.code || null;
  }

  // Check HTTP status code
  if (code === 401 || code === 403 || code === '401' || code === '403') {
    return { isAuthError: true, service: normService, message, code };
  }

  // Check text patterns
  for (const pat of AUTH_ERROR_PATTERNS) {
    if (pat.test(message) || (code && pat.test(String(code)))) {
      return { isAuthError: true, service: normService, message, code };
    }
  }

  return { isAuthError: false, service: normService, message, code };
}

/**
 * Format human-readable step-by-step renewal instructions.
 * @param {string} service - 'angelone' | 'indmoney' | 'tickertape'
 * @param {object} [options]
 * @returns {string}
 */
function formatRenewalInstructions(service, options = {}) {
  const s = (service || '').toLowerCase().trim();
  const header = `\n=======================================================\n` +
                 `  AUTH TOKEN RENEWAL REQUIRED: [${s.toUpperCase()}]\n` +
                 `=======================================================`;

  if (s === 'angelone') {
    return `${header}
Angel One SmartAPI credentials or JWT session has expired or is invalid.

Steps to renew:
1. Verify your credentials in the repository root .env file:
   ANGELONE_CLIENT_CODE=<your_client_code>
   ANGELONE_PASSWORD=<your_password>
   ANGELONE_API_KEY=<your_api_key>
   ANGELONE_TOTP_KEY=<your_totp_secret_key>
2. If using manual session JWT token, update:
   ANGELONE_JWT_TOKEN=<fresh_jwt_token>
3. Or run the interactive renewal utility:
   node scripts/framework/renew_token.js --service angelone
=======================================================\n`;
  }

  if (s === 'indmoney') {
    return `${header}
INDmoney MCP session token has expired or is missing.

Steps to renew:
1. Run interactive OAuth browser login directly via the skill:
   node skills/fetch-indmoney-us/scripts/fetch_indmoney_us.js --login
   # Or via renewal helper:
   node scripts/framework/renew_token.js --service indmoney --login
2. Or manually update INDMONEY_MCP_TOKEN in the repository root .env file:
   INDMONEY_MCP_TOKEN=<fresh_token>
   # Or run:
   node scripts/framework/renew_token.js --service indmoney --token <YOUR_TOKEN>
=======================================================\n`;
  }

  if (s === 'tickertape') {
    return `${header}
Tickertape Pro OAuth tokens have expired or are missing.

Steps to renew:
1. Re-authenticate via the Tickertape OAuth flow or obtain fresh tokens.
2. Update tokens in config/tokens.json:
   {
     "access_token": "<fresh_access_token>",
     "refresh_token": "<fresh_refresh_token>"
   }
3. Or run the renewal utility:
   node scripts/framework/renew_token.js --service tickertape --token <YOUR_ACCESS_TOKEN>
=======================================================\n`;
  }

  return `${header}
Authentication credentials for service "${service}" have expired.
Please review your local .env configuration or run:
node scripts/framework/renew_token.js --service ${service || 'unknown'}
=======================================================\n`;
}

/**
 * Idempotently update or append KEY=VALUE pairs in a .env file.
 * Preserves comments, whitespace, and unaffected keys.
 * @param {Record<string, string>} updates
 * @param {string} [envPath]
 * @returns {{ success: boolean, updatedKeys: string[], envPath: string }}
 */
function updateEnvCredentials(updates = {}, envPath = DEFAULT_ENV_PATH) {
  if (!updates || typeof updates !== 'object') {
    throw new Error('updates must be an object of key-value pairs');
  }

  const keysToUpdate = Object.keys(updates);
  if (keysToUpdate.length === 0) {
    return { success: true, updatedKeys: [], envPath };
  }

  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  const lines = content.split(/\r?\n/);
  const foundKeys = new Set();
  const updatedLines = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (match) {
      const varName = match[1];
      if (varName in updates) {
        foundKeys.add(varName);
        updatedLines.push(`${varName}=${updates[varName]}`);
        continue;
      }
    }
    updatedLines.push(line);
  }

  // Append keys that weren't found in the existing .env
  const appended = [];
  for (const key of keysToUpdate) {
    if (!foundKeys.has(key)) {
      appended.push(`${key}=${updates[key]}`);
    }
  }

  if (appended.length > 0) {
    // Ensure newline separation before appending
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    for (const app of appended) {
      updatedLines.push(app);
    }
  }

  const finalContent = updatedLines.join('\n').replace(/\n*$/, '\n');
  fs.writeFileSync(envPath, finalContent, 'utf8');

  return {
    success: true,
    updatedKeys: keysToUpdate,
    envPath
  };
}

/**
 * Save credentials for a specific service.
 * @param {string} service - 'angelone' | 'indmoney' | 'tickertape'
 * @param {Record<string, string>} credentials
 * @param {object} [options]
 * @returns {{ success: boolean, service: string, updatedKeys: string[], destination: string }}
 */
function saveServiceCredentials(service, credentials = {}, options = {}) {
  const s = (service || '').toLowerCase().trim();
  if (!KNOWN_SERVICES.has(s)) {
    throw new Error(`Unknown service "${service}". Expected angelone, indmoney, or tickertape.`);
  }

  const envPath = options.envPath || DEFAULT_ENV_PATH;

  if (s === 'angelone') {
    const res = updateEnvCredentials(credentials, envPath);
    if (!options.envPath) {
      for (const sub of ['angel-one', 'angle-one']) {
        const subEnv = path.join(REPO_ROOT, 'config', sub, '.env');
        if (fs.existsSync(subEnv) && path.resolve(envPath) !== path.resolve(subEnv)) {
          try { updateEnvCredentials(credentials, subEnv); } catch { /* empty */ }
        }
      }
    }
    return {
      success: true,
      service: s,
      updatedKeys: res.updatedKeys,
      destination: envPath
    };
  }

  if (s === 'indmoney') {
    const envUpdates = {};
    if (credentials.token || credentials.INDMONEY_MCP_TOKEN) {
      envUpdates.INDMONEY_MCP_TOKEN = credentials.token || credentials.INDMONEY_MCP_TOKEN;
    }
    if (credentials.endpoint || credentials.INDMONEY_MCP_URL) {
      envUpdates.INDMONEY_MCP_URL = credentials.endpoint || credentials.INDMONEY_MCP_URL;
    }
    const res = updateEnvCredentials(envUpdates, envPath);
    if (!options.envPath) {
      const subEnv = path.join(REPO_ROOT, 'config', 'ind-money', '.env');
      if (fs.existsSync(subEnv) && path.resolve(envPath) !== path.resolve(subEnv)) {
        try { updateEnvCredentials(envUpdates, subEnv); } catch { /* empty */ }
      }
    }
    return {
      success: true,
      service: s,
      updatedKeys: res.updatedKeys,
      destination: envPath
    };
  }

  if (s === 'tickertape') {
    const tokensPath = options.tokensPath || TICKERTAPE_TOKENS_PATH;
    const parentDir = path.dirname(tokensPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    let existing = {};
    if (fs.existsSync(tokensPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      } catch {
        existing = {};
      }
    }

    const merged = {
      ...existing,
      access_token: credentials.access_token || credentials.token || existing.access_token,
      refresh_token: credentials.refresh_token || existing.refresh_token,
      saved_at: Date.now()
    };

    fs.writeFileSync(tokensPath, JSON.stringify(merged, null, 2), 'utf8');

    return {
      success: true,
      service: s,
      updatedKeys: ['access_token', 'refresh_token', 'saved_at'],
      destination: tokensPath
    };
  }
}

/**
 * Interactively prompt the user for token renewal or return non-interactive status.
 * @param {string} service - 'angelone' | 'indmoney' | 'tickertape'
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, service: string, updatedKeys?: string[], instructions?: string, promptAvailable: boolean }>}
 */
async function promptTokenRenewal(service, options = {}) {
  const s = (service || '').toLowerCase().trim();
  const instructions = formatRenewalInstructions(s, options);

  // If scripted/programmatic inputs are supplied in options, use them directly
  if (options.inputs && typeof options.inputs === 'object') {
    const res = saveServiceCredentials(s, options.inputs, options);
    return {
      success: true,
      service: s,
      updatedKeys: res.updatedKeys,
      promptAvailable: true,
      destination: res.destination
    };
  }

  const isInteractive = Boolean(process.stdin.isTTY && !options.nonInteractive);
  if (!isInteractive) {
    if (!options.silent) {
      process.stderr.write(instructions);
    }
    return {
      success: false,
      service: s,
      promptAvailable: false,
      instructions
    };
  }

  process.stdout.write(instructions);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  try {
    const collected = {};
    if (s === 'angelone') {
      const jwt = await ask('Enter fresh Angel One JWT Token (or leave blank to skip): ');
      if (jwt.trim()) collected.ANGELONE_JWT_TOKEN = jwt.trim();
      const apiKey = await ask('Enter Angel One API Key (or leave blank to keep existing): ');
      if (apiKey.trim()) collected.ANGELONE_API_KEY = apiKey.trim();
      const totp = await ask('Enter Angel One TOTP Secret Key (or leave blank to keep existing): ');
      if (totp.trim()) collected.ANGELONE_TOTP_KEY = totp.trim();
    } else if (s === 'indmoney') {
      const mode = (await ask('Renew INDmoney token via: [1] Browser OAuth login (Recommended) or [2] Manual token input? [1]: ')).trim();
      if (mode === '2') {
        const token = await ask('Enter fresh INDmoney MCP Token: ');
        if (token.trim()) collected.token = token.trim();
      } else {
        rl.close();
        let oauthHelper;
        try {
          oauthHelper = require('../indmoney/oauth');
        } catch {
          oauthHelper = null;
        }
        if (oauthHelper && typeof oauthHelper.performIndmoneyOAuthLogin === 'function') {
          const oauthRes = await oauthHelper.performIndmoneyOAuthLogin({ envPath: options.envPath });
          return {
            success: Boolean(oauthRes && oauthRes.ok),
            service: s,
            updatedKeys: ['INDMONEY_MCP_TOKEN'],
            promptAvailable: true,
            destination: options.envPath || DEFAULT_ENV_PATH
          };
        } else {
          const fallbackRl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const token = await new Promise(r => fallbackRl.question('Enter fresh INDmoney MCP Token: ', r));
          fallbackRl.close();
          if (token.trim()) collected.token = token.trim();
        }
      }
    } else if (s === 'tickertape') {
      const token = await ask('Enter fresh Tickertape Pro Access Token: ');
      if (token.trim()) collected.access_token = token.trim();
      const refresh = await ask('Enter Refresh Token (optional): ');
      if (refresh.trim()) collected.refresh_token = refresh.trim();
    }

    rl.close();

    if (Object.keys(collected).length === 0) {
      return { success: false, service: s, promptAvailable: true, updatedKeys: [] };
    }

    const res = saveServiceCredentials(s, collected, options);
    return {
      success: true,
      service: s,
      promptAvailable: true,
      updatedKeys: res.updatedKeys,
      destination: res.destination
    };
  } catch (err) {
    rl.close();
    throw err;
  }
}

/**
 * Render a high-contrast, self-contained offline warning banner for cached fallback data.
 * Adheres 100% to Invariant 2 (no external assets or font leaks).
 * @param {string} timestamp - Original snapshot timestamp
 * @param {object} [options]
 * @returns {string}
 */
function renderCacheWarningBanner(timestamp, options = {}) {
  const ts = timestamp || 'Unknown';
  const customMsg = options.message || 'Upstream provider unreachable.';
  return `<div class="cache-warning-banner" role="alert" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; padding:12px 16px; margin-bottom:20px; display:flex; align-items:center; gap:12px; font-size:14px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight:500; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
  <span style="font-size:20px; line-height:1;" aria-hidden="true">&#9888;&#65039;</span>
  <div>
    <strong>[WARNING] Cached Snapshot Active:</strong> Data as of <span class="cache-timestamp">${ts}</span>. ${customMsg}
  </div>
</div>`;
}

module.exports = {
  detectAuthError,
  formatRenewalInstructions,
  updateEnvCredentials,
  saveServiceCredentials,
  promptTokenRenewal,
  renderCacheWarningBanner,
  KNOWN_SERVICES,
  DEFAULT_ENV_PATH,
  TICKERTAPE_TOKENS_PATH
};

