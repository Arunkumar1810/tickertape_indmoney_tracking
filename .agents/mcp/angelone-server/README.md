# angelone-server

Read-only Angel One SmartAPI MCP server (stdio). Built on the official `smartapi-python` SDK and the `mcp` Python SDK.

**Tools:** `get_holdings`, `get_all_holdings`, `get_positions`, `get_rms_limits`, `get_order_book`, `get_trade_book`, `get_ltp`, `get_candle_data`.
No order placement, modify, cancel or GTT tools exist by design.

## Setup

1. `uv sync` in this folder.
2. Put `ANGEL_ONE_API_KEY`, `ANGEL_ONE_CLIENT_CODE`, `ANGEL_ONE_PASSWORD` (PIN) and `ANGEL_ONE_TOTP_SECRET` in the repo-root `.env` (template: `.agents/config/angelone.env.example`).
3. Smoke test from the repo root: `node .agents/mcp/smoke_test.js`.

The skills launch it automatically through `.agents/shared/angelone` using `.agents/config/angelone-mcp.json`.

## Notes
- Session tokens stay in memory and are never returned by a tool; the server re-logs in once on an auth error.
- `mcp` is pinned `<2` (v2 renamed `FastMCP`). `logzero` and `websocket-client` are declared because `smartapi-python` imports them without listing them.
- Ledger/pay-in history is not available from SmartAPI; use the ledger `.xlsx` flow in `fetch-lts-xirr`.
