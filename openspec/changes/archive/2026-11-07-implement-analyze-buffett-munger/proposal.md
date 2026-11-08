# Proposal: Implement analyze-buffett-munger Compounding Engine

## Why

In a comprehensive value-investing architecture, evaluating quality requires assessing durable economic moats, capital allocation efficiency, and authentic cash generation. While `analyze-graham` quantifies liquidation floors and `analyze-lynch` measures PEG growth expansion, Warren Buffett and Charlie Munger evaluate businesses by their return on invested capital (ROIC/ROCE), 5-step DuPont decomposition of Return on Equity (ROE), and true Owner Earnings net of capital expenditures and stock-based compensation (SBC) dilution.

Implementing `analyze-buffett-munger` completes the fourth pillar of the Tier 3 Valuation Suite (`AID-BMAD-MODULAR-STOCK-V1`), allowing the framework to identify exceptional compounders trading at fair prices while penalizing accounting illusions fueled by excessive financial leverage or dilutive share issuance.

## What Changes

- **New Valuation Engine Skill (`analyze-buffett-munger`)**:
  - Implement `.agents/skills/analyze-buffett-munger/SKILL.md` and CLI executable `scripts/analyze_buffett_munger.js`.
  - Pure deterministic mathematical calculations:
    - **True Owner Earnings**: $\text{Operating Cash Flow} - \text{Maintenance CapEx} - \text{Stock-Based Compensation (SBC)}$
    - **SBC Dilution Impact**: $(\text{SBC} / \text{Operating Cash Flow}) \times 100$ (penalizing earnings distorted by equity dilution)
    - **5-Step DuPont ROE Decomposition**:
      1. Tax Burden ($\text{Net Income} / \text{EBT}$)
      2. Interest Burden ($\text{EBT} / \text{EBIT}$)
      3. Operating Margin ($\text{EBIT} / \text{Revenue}$)
      4. Asset Turnover ($\text{Revenue} / \text{Total Assets}$)
      5. Financial Leverage ($\text{Total Assets} / \text{Total Equity}$)
    - **Return on Invested Capital (ROIC)** and capital efficiency benchmark (ROIC $\ge 15\%$ indicating strong moat)
    - **Owner Earnings Yield**: $\text{Owner Earnings} / \text{Market Cap}$
  - Output canonical `UniformVerdictContract` (`principle: "buffett_munger"`, `is_veto: false`, stances: `STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`, score in `[0.0, 100.0]`).
  - Broad-market Index ETF passive bypass (`VOO`, `QQQ`, `SPY`, etc.) returning `score: 100.0`, `stance: "HOLD"`, `is_veto: false`.
- **Pattern C Dual-Mode & Option C Batch CLI**:
  - `--data <path>`: Offline deterministic evaluation of `NormalizedCompanyFinancials`.
  - `--ticker <SYMBOL> [--market <IN|US>]`: Autonomous evaluation resolving statements via `provider-tickertape`.
  - `--holdings <path>`: Option C portfolio batch mode processing `AccountHoldingsSnapshot` into `VerdictBatch` JSON and consolidated HTML audit dashboard.
- **Offline HTML Audit Dashboard**:
  - Authored in `assets/buffett-munger-template.html` with inline SVG gauges, DuPont 5-step visual waterfall, and 0 external network requests, validated by `artifact_harness.js`.

## Capabilities

### New Capabilities
- `skills/analyze-buffett-munger`: Tier 3 Buffett-Munger economic moat, 5-step DuPont ROE decomposition, and true Owner Earnings compounding valuation engine.

### Modified Capabilities
*(None)*

## Impact

- **New Skill**: `.agents/skills/analyze-buffett-munger/` with `SKILL.md`, `scripts/analyze_buffett_munger.js`, `assets/buffett-munger-template.html`, fixtures, and tests.
- **Dependencies**: Leverages existing `.agents/shared/framework` validation harnesses (`validateUniformVerdict`, `validateUniformVerdictBatch`, `verifyArtifactPair`). No external npm dependencies.
- **Downstream Consumers**: Informs Tier 4 strategy orchestrator (`way-long-term-strategy`) and master portfolio dashboards.

