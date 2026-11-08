# Proposal: Implement analyze-klarman-solvency Downside Stress Engine

## Why

In disciplined value investing, capital preservation strictly precedes return generation. Seth Klarman's philosophy focuses on margin of safety, downside risk stress-testing, and balance sheet distress identification. While `analyze-graham` establishes asset floors, `analyze-lynch` measures growth discipline, and `analyze-buffett-munger` evaluates economic moats, `analyze-klarman-solvency` evaluates financial survival: detecting insolvency risks, Altman Z-Score distress zones, excessive Net Debt / EBITDA leverage, deficient interest coverage, and debt maturity walls maturing within 24 months.

Implementing `analyze-klarman-solvency` delivers the fifth and final pillar of the Tier 3 Valuation Suite (`AID-BMAD-MODULAR-STOCK-V1`), ensuring the investment framework actively weeds out fragile capital structures and refinancing traps before capital is allocated.

## What Changes

- **New Valuation Engine Skill (`analyze-klarman-solvency`)**:
  - Implement `.agents/skills/analyze-klarman-solvency/SKILL.md` and CLI executable `scripts/analyze_klarman_solvency.js`.
  - Pure deterministic mathematical calculations:
    - **Altman Z-Score**: $1.2 X_1 + 1.4 X_2 + 3.3 X_3 + 0.6 X_4 + 0.999 X_5$ (with zones: Safe $> 2.99$, Grey $[1.81, 2.99]$, Distress $< 1.81$)
    - **Net Debt to EBITDA**: $(\text{Total Debt} - \text{Cash}) / \text{EBITDA}$
    - **Interest Coverage Ratio**: $\text{EBIT} / \text{Interest Expense}$
    - **Debt Maturity Cliff**: Ratio of debt maturing within 24 months to available cash reserves plus annual cash generation
    - **Accrual Cash Gap**: Operating Cash Flow $-$ Net Income
  - Output canonical `UniformVerdictContract` (`principle: "klarman_solvency"`, `is_veto: false`, stances: `STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`, score in `[0.0, 100.0]`).
  - Broad-market Index ETF passive bypass (`VOO`, `QQQ`, `SPY`, etc.) returning `score: 100.0`, `stance: "HOLD"`, `is_veto: false`.
- **Pattern C Dual-Mode & Option C Batch CLI**:
  - `--data <path>`: Offline deterministic evaluation of `NormalizedCompanyFinancials`.
  - `--ticker <SYMBOL> [--market <IN|US>]`: Autonomous evaluation resolving statements via `provider-tickertape`.
  - `--holdings <path>`: Option C portfolio batch mode processing `AccountHoldingsSnapshot` into `VerdictBatch` JSON and consolidated HTML audit dashboard.
- **Offline HTML Audit Dashboard**:
  - Authored in `assets/klarman-solvency-template.html` with inline SVG gauges, Altman Z-Score risk meter, debt maturity cliff visualizer, and 0 external network requests, validated by `artifact_harness.js`.

## Capabilities

### New Capabilities
- `skills/analyze-klarman-solvency`: Tier 3 Seth Klarman downside stress, Altman Z-Score, debt maturity cliff, and balance sheet solvency evaluation engine.

### Modified Capabilities
*(None)*

## Impact

- **New Skill**: `.agents/skills/analyze-klarman-solvency/` with `SKILL.md`, `scripts/analyze_klarman_solvency.js`, `assets/klarman-solvency-template.html`, fixtures, and tests.
- **Dependencies**: Leverages existing `.agents/shared/framework` validation harnesses (`validateUniformVerdict`, `validateUniformVerdictBatch`, `verifyArtifactPair`). No external npm dependencies.
- **Epic 3 Completion**: Completes all 5 pillars of the Tier 3 Valuation Suite, unblocking Epic 4 (`epic-strategy-orchestrator`).

