'use strict';
const auth = require('./auth');

function service() {
  return auth;
}

class AuthError extends Error {}

/**
 * Minimal Tickertape MCP client over streamable HTTP with refresh-on-401.
 * Tokens never leave this module: they are not returned, logged, or cached.
 */
function createClient(opts = {}) {
  const svc = opts.service || service();
  const endpoint = opts.endpoint || 'https://mcp.tickertape.in/mcp';
  let state = null;
  let refreshing = null;

  async function init() {
    if (!state) state = await svc.getValidToken();
    return state;
  }

  async function recover() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const creds = state.creds;
      const tokens = svc.loadTokens();
      const refreshed = tokens ? await svc.refreshToken(creds, tokens) : null;
      if (refreshed) {
        state = { creds, token: refreshed.access_token };
      } else {
        console.error('Session rejected and refresh failed; starting interactive login...');
        const t = await svc.performOAuthLogin(creds);
        state = { creds, token: t.access_token };
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function rawCall(name, args) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + state.token,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e6), method: 'tools/call', params: { name, arguments: args || {} } })
    });
    if (res.status === 401) throw new AuthError('Unauthorized');
    const text = await res.text();
    let json = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        json = JSON.parse(line.slice(6));
        break;
      }
    }
    if (!json) {
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error(`Unparseable response for ${name}: ${text.slice(0, 120)}`);
      }
    }
    if (json.error) throw new Error(`${name}: ${JSON.stringify(json.error).slice(0, 200)}`);
    const result = json.result;
    const body = result && result.content && result.content[0] && result.content[0].text;
    if (result && result.isError) {
      if (/unauthori[sz]ed/i.test(body || '')) throw new AuthError('Unauthorized');
      throw new Error(`${name}: ${String(body).slice(0, 200)}`);
    }
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.error && /unauthori[sz]ed/i.test(String(parsed.error))) throw new AuthError('Unauthorized');
        return parsed;
      } catch (e) {
        if (e instanceof AuthError) throw e;
        return body;
      }
    }
    return result;
  }

  async function call(name, args) {
    await init();
    try {
      return await rawCall(name, args);
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      await recover();
      return rawCall(name, args);
    }
  }

  return { call };
}

module.exports = { createClient, AuthError };
