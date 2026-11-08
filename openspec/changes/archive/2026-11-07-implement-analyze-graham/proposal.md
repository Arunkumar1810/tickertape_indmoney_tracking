# Proposal: Implement analyze-graham Deterministic Valuation Engine

## Why

Under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), Tier 3 valuation pillars provide independent, principle-specific investment committee audits across company fundamentals. Following the implementation of the `forensic-governance` gatekeeper (Story 3.1), the framework requires Benjamin Graham's classic value investing discipline (Story 3.2). 

Investors need deterministic, mathematical valuation metrics—including the Graham Number floor, Net-Net Working Capital (NNWC), Net Current Asset Value (NCAV), and Margin of Safety—to establish conservative liquidation and intrinsic value floors for equities across both Indian and US markets without relying on speculative terminal growth assumptions.

## What Changes

- Create `.agents/skills/analyze-graham/` as an independent Tier 3 valuation engine.
- Implement pure deterministic calculation functions for:
  - Graham Number floor: $\sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$ (when EPS > 0 and BVPS > 0).
  - Net-Net Working Capital (NNWC): $\text{Cash} + 0.75 \times \text{Receivables} + 0.50 \times \text{Inventory} - \text{Total Liabilities}$.
  - Net Current Asset Value (NCAV): $\text{Total Current Assets} - \text{Total Liabilities}$.
  - Per-share valuations: NNWC per share, NCAV per share, and Graham Number.
  - Margin of Safety percentage vs Current Market Price (CMP).
  - Defensive and Enterprising investor screening checks (Current Ratio $\ge 2.0$, Long-Term Debt $\le$ Net Current Assets, P/E $\le 15.0$, P/B $\le 1.5$, $\text{P/E} \times \text{P/B} \le 22.5$, positive earnings stability).
- Map Graham valuation scores and margin of safety to canonical `UniformVerdictContract` valuation stances (`STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`) with `principle: "graham"`, `is_veto: false`, and normalized score in `[0.0, 100.0]`.
- Provide passive broad-market Index ETF bypass (`score: 100.0`, `stance: "HOLD"`, `is_veto: false`).
- Support Pattern C Dual-Mode CLI execution:
  - `--data <path>`: Deterministic offline evaluation of a local `NormalizedCompanyFinancials` JSON file.
  - `--ticker <SYMBOL> [--market <IN|US>]`: Autonomous evaluation resolving financials via `provider-tickertape`.
  - `--holdings <path>`: Option C portfolio batch mode processing an `AccountHoldingsSnapshot` into a consolidated `VerdictBatch` JSON and multi-stock HTML matrix (`graham_portfolio_verdicts.json` and `graham_portfolio_audits.html`).
- Author offline self-contained HTML audit dashboard template (`assets/graham-template.html`) featuring visual gauges, valuation floors vs CMP waterfall charts, defensive checklist tables, and zero external network leaks.
- Ensure 100% compliance with `contract_validator.js` and `artifact_harness.js`.

## Capabilities

### New Capabilities
- `skills/analyze-graham`: Deterministic Benjamin Graham valuation engine computing NNWC, NCAV, Graham Number, Margin of Safety, and defensive investor criteria, emitting canonical `UniformVerdictContract` payloads and offline HTML dashboards.

### Modified Capabilities
- None.

## Impact

- Adds `.agents/skills/analyze-graham/` with CLI script, test suite, fixtures, template, and documentation.
- Consumers (e.g., Tier 4 strategy orchestrators and portfolio dashboards) can consume canonical Graham valuation verdicts via standard JSON schemas (`SingleVerdict` and `VerdictBatch`).
- Zero breaking changes to existing framework schemas or provider contracts.

