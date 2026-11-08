# Design: Snapshot Caching & Interactive Token Renewal Handler

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) relies on Tier 1 account fetchers (`fetch-angelone`, `fetch-indmoney-us`) and Tier 2 market data providers (`provider-tickertape`) to populate canonical contracts (`AccountHoldingsSnapshot`, `NormalizedCompanyFinancials`). In production and local development, upstream APIs and MCP endpoints can be unavailable due to network dropouts, rate limits (HTTP 429), or routine session/JWT expiration (Angel One SmartAPI, INDmoney MCP, Tickertape Pro).

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Centralized auth detection and renewal module (`.agents/shared/framework/auth_manager.js`) supporting Angel One, INDmoney, and Tickertape Pro.
- Safe, idempotent environment credential persistence (`updateEnvCredentials`) that preserves existing comments, whitespace, and variable formatting.
- Standalone CLI command (`renew-token` via `.agents/shared/framework/renew_token.js`) supporting interactive (TTY) prompts and parameter-driven credential renewal.
- Universal graceful degradation protocol in `fetch-angelone`, `fetch-indmoney-us`, and `provider-tickertape`: fall back to the most recent cached snapshot when upstream requests fail.
- Top-level alert banner injection in offline HTML dashboards: `[WARNING] Cached Snapshot Active: Data as of YYYY-MM-DD HH:MM:SS. Upstream provider unreachable`, fully self-contained with 0 external network requests.
- Full test coverage with zero external npm runtime dependencies.

**Non-Goals:**
- Storing secrets or plain-text credentials in reports or git-tracked directories (credentials stay in `.env` and local config files).
- Replacing official broker 2FA/TOTP authentication flows.
- Modifying underlying financial or valuation calculation algorithms.

## Decisions

### Decision 1: Centralized Auth Manager in `.agents/shared/framework/`
Rather than having each skill independently parse `.env` files or detect HTTP 401 statuses, we implement `.agents/shared/framework/auth_manager.js` and export it through `index.js`.
- **Rationale**: Ensures uniform error categorization (`detectAuthError`), consistent renewal instructions (`formatRenewalInstructions`), and centralized credential persistence.
- **Alternatives considered**: Ad-hoc handling within each skill script (rejected due to code duplication and diverging error formats).

### Decision 2: Zero-Dependency Idempotent `.env` Persistence
To adhere to the repo-wide zero-dependency convention, `updateEnvCredentials` uses a pure Node.js regex-based line parser that updates existing `KEY=VALUE` pairs or appends new ones at the bottom of `.env` while preserving comments and unaffected keys.
- **Rationale**: Avoids adding `dotenv` or other external npm packages.
- **Alternatives considered**: External npm packages like `dotenv-edit` (rejected: violates zero-dependency mandate).

### Decision 3: High-Contrast Inline Warning Banner in HTML Templates
When an artifact is generated from a fallback cached snapshot, a top-level alert banner is rendered in the HTML document:
```html
<div class="cache-warning-banner" role="alert" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; padding:12px 16px; margin-bottom:20px; display:flex; align-items:center; gap:10px; font-size:14px; font-weight:500;">
  <span style="font-size:18px;">⚠️</span>
  <div>
    <strong>[WARNING] Cached Snapshot Active:</strong> Data as of <span class="cache-timestamp">${timestamp}</span>. Upstream provider unreachable.
  </div>
</div>
```
- **Rationale**: Immediate visibility to the user whether opened directly in a browser or embedded in downstream orchestration views, with 100% offline self-containment.
- **Alternatives considered**: JavaScript alert modals (rejected: intrusive, poor print support, may be blocked by browser sandbox).

### Decision 4: Non-Blocking Graceful Degradation in Non-Interactive Modes
If an auth failure occurs in non-interactive mode (e.g., automated batch execution or CI where `process.stdin.isTTY` is falsy), the system prints structured renewal guidance to `stderr` and seamlessly falls back to the latest cached snapshot if available.
- **Rationale**: Prevents automated pipelines from hanging or abruptly crashing while ensuring users receive actionable guidance to restore live sync.
- **Alternatives considered**: Immediate non-zero exit on auth failure (rejected: prevents offline/cached portfolio analysis).

## Risks / Trade-offs

- **[Risk: Stale Data Reliance]** Users might unknowingly rely on outdated cached data if upstream outages persist.
  → *Mitigation*: The warning banner prominently renders the original snapshot timestamp in both the HTML dashboard and console output.
- **[Risk: Accidental `.env` Clobbering]** Updating credentials might corrupt surrounding environment configuration.
  → *Mitigation*: Safe line-by-line regex scanning and unit tests validating multiline preservation and idempotency.
- **[Risk: Terminal Hang in CI/Script Execution]** Interactive CLI prompt might wait indefinitely for input.
  → *Mitigation*: Guard interactive prompt behind `process.stdin.isTTY` and provide immediate non-interactive exit.

