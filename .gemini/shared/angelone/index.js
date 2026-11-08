const fs = require('fs');
const path = require('path');
const AngelOneMcpClient = require('./client');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_SERVER_DIR = path.join(REPO_ROOT, '.agents', 'mcp', 'angelone-server');
const CONFIG_PATH = path.join(REPO_ROOT, '.agents', 'config', 'angelone-mcp.json');
const ENV_PATH = path.join(REPO_ROOT, '.env');

/** Minimal .env parser (KEY=VALUE, # comments, optional quotes). Does not mutate process.env. */
function loadEnvFile(file = ENV_PATH) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/** Expand ${VAR} using the merged env (.env + process.env) */
function expand(value, env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => env[k] || '');
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Build an Angel One MCP client from the shared repo config.
 * Resolution: overrides > ANGELONE_MCP_TRANSPORT env > .agents/config/angelone-mcp.json
 * Credentials come from the git-ignored repo-root .env (or process env); they are
 * only passed to the spawned server process and never written to disk or reports.
 */
function createAngelOneClient(overrides = {}) {
  const cfg = loadConfig();
  const env = { ...loadEnvFile(), ...process.env };
  // The bundled in-repo server is the default; ANGELONE_MCP_DIR overrides it.
  if (!env.ANGELONE_MCP_DIR) env.ANGELONE_MCP_DIR = DEFAULT_SERVER_DIR;
  const transport = overrides.transport || env.ANGELONE_MCP_TRANSPORT || cfg.transport || 'stdio';

  if (transport === 'http') {
    const http = cfg.http || {};
    return new AngelOneMcpClient({
      transport: 'http',
      endpoint: overrides.endpoint || env.ANGELONE_MCP_URL || http.endpoint || 'http://localhost:8000/mcp',
      timeoutMs: cfg.timeoutMs
    });
  }

  const s = cfg.stdio || {};
  const serverEnv = {};
  for (const k of cfg.passEnv || []) if (env[k]) serverEnv[k] = env[k];
  const needsDir = JSON.stringify(s).includes('${ANGELONE_MCP_DIR}') && !env.ANGELONE_MCP_DIR;
  return new AngelOneMcpClient({
    transport: 'stdio',
    timeoutMs: overrides.timeoutMs || cfg.timeoutMs || 30000,
    stdio: {
      // null command => client reports "requires a command" instead of spawning a bogus path
      command: needsDir ? null : expand(s.command, env),
      args: (s.args || []).map(a => expand(a, env)),
      cwd: s.cwd ? expand(s.cwd, env) : undefined,
      env: serverEnv
    }
  });
}

module.exports = { createAngelOneClient, loadConfig, loadEnvFile, AngelOneMcpClient, CONFIG_PATH, ENV_PATH };
