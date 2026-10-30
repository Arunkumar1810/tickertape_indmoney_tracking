const fs = require('fs');
const path = require('path');
const IndmoneyMcpClient = require('./client');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(REPO_ROOT, '.agents', 'config', 'indmoney-mcp.json');
const ENV_PATH = path.join(REPO_ROOT, '.env');

/** Minimal .env parser without mutating process.env */
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

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Build an INDmoney MCP client from shared repo config and environment.
 */
function createIndmoneyClient(overrides = {}) {
  const cfg = loadConfig();
  const env = { ...loadEnvFile(), ...process.env };

  const endpoint = overrides.endpoint || env.INDMONEY_MCP_URL || cfg.endpoint || 'https://mcp.indmoney.com/mcp';
  const token = overrides.token || env.INDMONEY_MCP_TOKEN || null;
  const timeoutMs = overrides.timeoutMs || cfg.timeoutMs || 30000;

  return new IndmoneyMcpClient({
    endpoint,
    token,
    timeoutMs
  });
}

module.exports = {
  createIndmoneyClient,
  IndmoneyMcpClient,
  loadConfig,
  loadEnvFile,
  CONFIG_PATH,
  ENV_PATH
};
