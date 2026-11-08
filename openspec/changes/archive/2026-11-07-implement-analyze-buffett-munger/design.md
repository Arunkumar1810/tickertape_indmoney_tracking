# Design: Implement analyze-buffett-munger Compounding Engine

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 5-pillar valuation suite under Tier 3. Following `forensic-governance` (Story 3.1), `analyze-graham` (Story 3.2), and `analyze-lynch` (Story 3.3), `analyze-buffett-munger` introduces the Warren Buffett and Charlie Munger philosophy: identifying durable economic moats, high returns on invested capital (ROIC), 5-step DuPont decomposition of ROE, and true Owner Earnings net of capital expenditures and dilutive stock-based compensation (SBC).

See `proposal.md` for background and motivation.

## Goals / Non-Goals

**Goals:**
- Implement `evaluateBuffettMungerValuation(financials, options)` as a pure deterministic calculation function.
- Compute true Owner Earnings: $\text{Operating Cash Flow} - \text{Maintenance CapEx} - \text{Stock-Based Compensation}$.
- Compute SBC Dilution Percentage: $(\text{Stock-Based Compensation} / \text{Operating Cash Flow}) \times 100$.
- Compute 5-Step DuPont ROE Decomposition:
  1. $\text{Tax Burden} = \text{Net Income} / \text{EBT}$
  2. $\text{Interest Burden} = \text{EBT} / \text{EBIT}$
  3. $\text{Operating Margin} = \text{EBIT} / \text{Revenue}$
  4. $\text{Asset Turnover} = \text{Revenue} / \text{Total Assets}$
  5. $\text{Financial Leverage} = \text{Total Assets} / \text{Total Equity}$
- Compute Return on Invested Capital (ROIC): $\text{NOPAT} / \text{Invested Capital} = (\text{EBIT} \times (1 - \text{Effective Tax Rate})) / (\text{Total Equity} + \text{Total Debt} - \text{Cash})$.
- Compute Owner Earnings Yield: $\text{True Owner Earnings} / \text{Market Cap}$.
- Output canonical `UniformVerdictContract` (`principle: "buffett_munger"`, `is_veto: false`, stances: `STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`).
- Broad market Index ETF passive bypass (`VOO`, `QQQ`, `SPY`, etc.) returning `score: 100.0`, `stance: "HOLD"`.
- Support Pattern C Dual-Mode CLI (`--data <path>`, `--ticker <SYMBOL>`) and Option C Portfolio Batch Mode (`--holdings <path>`).
- Render self-contained offline HTML audit dashboard template (`assets/buffett-munger-template.html`) with SVG gauges, DuPont waterfall, and zero external network leaks verified by `artifact_harness.js`.

**Non-Goals:**
- Liquidation floors or Net-Net Working Capital (reserved for `analyze-graham`, Story 3.2).
- PEG ratios and inventory velocity divergence (reserved for `analyze-lynch`, Story 3.3).
- Solvency distress models / Altman Z-Score (reserved for `analyze-klarman-solvency`, Story 3.5).
- Gatekeeper veto disqualification (reserved for `forensic-governance`, Story 3.1).

## Decisions

### Decision 1: Pure Deterministic Functional Core
`evaluateBuffettMungerValuation(normalizedFinancials, options)` is isolated as a pure mathematical function.
- **Inputs**: A valid `NormalizedCompanyFinancials` object.
- **Outputs**: A canonical `UniformVerdictContract` object (`principle: "buffett_munger"`).
- **Rationale**: Keeps calculations and DuPont math decoupled from I/O, network queries, and file writing, ensuring 100% deterministic testability.

### Decision 2: Quantitative Buffett-Munger Scoring & Stance Synthesis
The Buffett-Munger Score is normalized from 0.0 to 100.0 across 4 quantitative pillars:
1. **Capital Efficiency & ROIC Moat (35 pts)**:
   - $\text{ROIC} \ge 20.0\%$: 35 pts (exceptional wide moat)
   - $\text{ROIC} \in [15.0\%, 20.0\%)$: 28 pts (strong moat)
   - $\text{ROIC} \in [10.0\%, 15.0\%)$: 18 pts (narrow moat)
   - $\text{ROIC} \in [5.0\%, 10.0\%)$: 8 pts (average capital returns)
   - $\text{ROIC} < 5.0\%$ or negative: 0 pts (sub-par capital efficiency)
2. **True Owner Earnings & Dilution Quality (25 pts)**:
   - $\text{True OE} > 0$ and $\text{SBC Dilution} \le 5.0\%$: 25 pts (high cash purity)
   - $\text{True OE} > 0$ and $\text{SBC Dilution} \in (5.0\%, 15.0\%]$: 18 pts
   - $\text{True OE} > 0$ and $\text{SBC Dilution} \in (15.0\%, 25.0\%]$: 8 pts (dilution warning flagged)
   - $\text{True OE} \le 0$ or $\text{SBC Dilution} > 25.0\%$: 0 pts (severe equity dilution / cash drain)
3. **DuPont ROE Quality & Balance Sheet Discipline (25 pts)**:
   - $\text{Calculated ROE} \ge 15.0\%$, Operating Margin $\ge 15.0\%$, and Financial Leverage $\le 2.5$: 25 pts (high quality, un-leveraged ROE)
   - $\text{Calculated ROE} \ge 12.0\%$ and Financial Leverage $\le 3.5$: 15 pts
   - High ROE driven by excessive Financial Leverage ($> 3.5$) or thin Operating Margin ($< 8.0\%$): 5 pts (artificial leverage warning flagged)
   - Negative ROE or unprofitable operations: 0 pts
4. **Valuation & Owner Earnings Yield (15 pts)**:
   - $\text{Owner Earnings Yield} \ge 6.0\%$: 15 pts (wonderful business at attractive price)
   - $\text{Owner Earnings Yield} \in [4.0\%, 6.0\%)$: 10 pts (fair price)
   - $\text{Owner Earnings Yield} \in [2.0\%, 4.0\%)$: 5 pts (mild valuation stretch)
   - $\text{Owner Earnings Yield} < 2.0\%$ or negative: 0 pts (expensive multiple)

**Stance Mapping**:
- `score >= 80.0`: `STRONG_BUY`
- `score >= 65.0`: `BUY`
- `score >= 50.0`: `HOLD`
- `score >= 35.0`: `REDUCE`
- `score < 35.0`: `STRONG_SELL`

### Decision 3: Option C Consolidated Portfolio Matrix
In `--holdings` batch mode, `analyze-buffett-munger` outputs:
- `verdicts/buffett_munger_portfolio_verdicts.json` (conforming to `VerdictBatch`)
- `verdicts/buffett_munger_portfolio_audits.html` (interactive multi-stock matrix with sorting by score, stance filters, DuPont breakdown, and Owner Earnings meters)

### Decision 4: Self-Contained Offline HTML Design
The HTML template in `assets/buffett-munger-template.html` embeds all CSS inline with zero external fonts or stylesheets. Visual features include:
- SVG circular gauge for the Buffett-Munger compounding score.
- 5-step DuPont decomposition visual cards (Tax Burden, Interest Burden, Operating Margin, Asset Turnover, Financial Leverage).
- Owner Earnings vs reported Net Income comparison bar.
- SBC dilution alert indicators.

## Risks / Trade-offs

- **[Risk: Heavy Capital Expenditure cycle vs maintenance CapEx]**
  → *Mitigation*: When `maintenance_capex` is explicitly broken out in cash flow statements, the engine prioritizes maintenance CapEx over total growth CapEx to avoid unfairly penalizing expansionary investment.
- **[Risk: Negative net income or negative equity]**
  → *Mitigation*: Guard all division denominators (EBT, EBIT, Revenue, Total Assets, Total Equity) against zero or negative values, returning `null` cleanly and appending appropriate red flags without crashing.

