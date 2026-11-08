# Proposal: Implement analyze-lynch Deterministic Growth Engine

## Why

Under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), Tier 3 valuation pillars provide independent, principle-specific investment committee audits across company fundamentals. Following the implementation of `forensic-governance` (Story 3.1) and `analyze-graham` (Story 3.2), the framework requires Peter Lynch's classic Growth-At-A-Reasonable-Price (GARP) valuation discipline (Story 3.3).

Investors need deterministic, mathematical growth valuation metrics—including the Lynch PEG ratio, yield-adjusted PEG, Lynch Fair Value, company lifecycle categorization, and inventory-to-sales velocity divergence detection—to identify high-quality growing businesses without overpaying for multiple expansion or falling into operational inventory traps.

## What Changes

- Create `.agents/skills/analyze-lynch/` as an independent Tier 3 valuation engine.
- Implement pure deterministic calculation functions for:
  - Traditional PEG ratio: $\text{P/E} / \text{EPS Growth Rate}$ (using 5-year historical EPS CAGR or TTM growth).
  - Yield-adjusted PEG ratio: $\text{P/E} / (\text{EPS Growth Rate} + \text{Dividend Yield})$.
  - Lynch Fair Value line: $(\text{EPS Growth Rate} + \text{Dividend Yield}) \times \text{EPS}$.
  - Inventory-to-Sales velocity divergence: $\text{Inventory Growth Rate} - \text{Sales Growth Rate}$ (flagging when inventory growth outpaces sales growth by $> 5.0\%$).
  - Lynch company classification:
    - **Fast Grower**: EPS CAGR $\ge 20.0\%$ (sustainable growth with healthy balance sheet).
    - **Stalwart**: EPS CAGR in $[10.0\%, 20.0\%)$ (steady, large-cap compounders).
    - **Slow Grower**: EPS CAGR in $[2.0\%, 10.0\%)$ with above-average dividend yield.
    - **Cyclical**: Companies in cyclical industries (metals, capital goods, infrastructure) with volatile revenue swings.
    - **Turnaround**: Companies emerging from negative earnings to profitability.
    - **Asset Play**: High net cash / tangible book assets relative to market cap.
  - Quantitative Lynch score (0 to 100) mapping to canonical `UniformVerdictContract` stances (`STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`) with `principle: "lynch"`, `is_veto: false`.
- Broad market Index ETF passive bypass (`score: 100.0`, `stance: "HOLD"`, `is_veto: false`).
- Pattern C Dual-Mode CLI execution:
  - `--data <path>`: Deterministic offline evaluation of a local `NormalizedCompanyFinancials` JSON file.
  - `--ticker <SYMBOL> [--market <IN|US>]`: Autonomous evaluation resolving financials via `provider-tickertape`.
  - `--holdings <path>`: Option C portfolio batch mode processing an `AccountHoldingsSnapshot` into a consolidated `VerdictBatch` JSON and multi-stock HTML matrix (`lynch_portfolio_verdicts.json` and `lynch_portfolio_audits.html`).
- Author offline self-contained HTML audit dashboard template (`assets/lynch-template.html`) featuring visual gauges, PEG valuation meters, inventory divergence alerts, and zero external network leaks.
- Ensure 100% compliance with `contract_validator.js` and `artifact_harness.js`.

## Capabilities

### New Capabilities
- `skills/analyze-lynch`: Deterministic Peter Lynch GARP valuation engine computing PEG ratios, yield-adjusted PEG, inventory velocity divergence, and company lifecycle categorization, emitting canonical `UniformVerdictContract` payloads and offline HTML dashboards.

### Modified Capabilities
- None.

## Impact

- Adds `.agents/skills/analyze-lynch/` with CLI script, test suite, fixtures, template, and documentation.
- Extends the Tier 3 analysis suite with classical GARP metrics consumable by Tier 4 orchestrators.
- Zero breaking changes to existing contracts or schemas.

