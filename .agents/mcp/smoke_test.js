const { createAngelOneClient } = require('../shared/angelone');
(async () => {
  const c = createAngelOneClient();
  try {
    const init = await c._startStdio();
    const tools = await c._rpc('tools/list', {});
    console.log('TOOLS:', tools.result.tools.map(t => t.name).join(', '));
    try { await c.getHoldings(); } catch (e) { console.log('HOLDINGS (expected w/o creds):', e.message.slice(0, 200)); }
  } finally { await c.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
