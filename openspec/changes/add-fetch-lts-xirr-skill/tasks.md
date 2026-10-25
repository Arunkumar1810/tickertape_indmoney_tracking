# Tasks

## 1. Skill Scaffolding & Configuration

- [x] 1.1 Create directory structure for `.agents/skills/fetch-lts-xirr/` (`scripts/`, `scripts/lib/`, `assets/`, `config/`, `reports/`, `tests/`) and verify directories exist
- [x] 1.2 Create `SKILL.md` defining skill instructions, invocation flags (`--refresh`, `--ledger`, `--tradebook`, `--only`), and input formats, and verify file is valid markdown
- [x] 1.3 Create `config/xirr.config.json` defining Angel One MCP endpoint URLs, sub-90-day thresholds, and cache file paths, and verify valid JSON structure

## 2. Ingestion & Angel One MCP Connector

- [x] 2.1 Implement `scripts/lib/mcp_client.js` to query Angel One MCP (`pyalgobot/angelone-mcp`) for holdings, CMPs, margin balances, and session trades, verifying with fixture tests
- [x] 2.2 Implement `scripts/lib/ledger_parser.js` to parse bank pay-in (outflow) and pay-out (inflow) statements from CSV/JSON into normalized cashflows, verifying test cases
- [x] 2.3 Implement `scripts/lib/trades_cache.js` to persist multi-year tradebook logs indexed by ISIN and trading symbol into `trades_cache.json`, verifying cache read/write

## 3. Mathematical Solver Engine

- [x] 3.1 Implement `scripts/lib/xirr_solver.js` with analytical Newton-Raphson root-finder and bounded Bisection fallback, verifying against known financial XIRR test vectors
- [x] 3.2 Implement sub-90-day holding duration guardrail in `scripts/lib/xirr_solver.js`, verifying it flags short-duration positions and computes Absolute Return %
- [x] 3.3 Implement `scripts/lib/friction_engine.js` to compute True Investor XIRR, Asset Stock XIRR, and the Friction Drag spread, verifying accuracy across test fixtures

## 4. Report Generation & CLI Runner

- [x] 4.1 Create `assets/report-template.html` containing hero KPI cards, visual cashflow waterfall, sortable holdings matrix, and slide-out ledger drawers, verifying offline browser rendering
- [x] 4.2 Implement `scripts/lib/redact.js` to sanitize PANs, client codes, bank accounts, and auth tokens, verifying redaction filters pass on test payloads
- [x] 4.3 Implement `scripts/fetch_lts_xirr.js` orchestrating MCP fetch, ledger parsing, dual XIRR calculation, and HTML/JSON report generation, verifying end-to-end execution
