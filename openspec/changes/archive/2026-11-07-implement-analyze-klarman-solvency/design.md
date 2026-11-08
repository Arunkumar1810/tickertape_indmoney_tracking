# Design: Implement analyze-klarman-solvency Downside Stress Engine

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 5-pillar valuation suite under Tier 3. Following `forensic-governance` (Story 3.1), `analyze-graham` (Story 3.2), `analyze-lynch` (Story 3.3), and `analyze-buffett-munger` (Story 3.4), `analyze-klarman-solvency` delivers Seth Klarman's classic downside risk philosophy: assessing bankruptcy resistance via the Altman Z-Score, evaluating Net Debt to EBITDA leverage, testing interest coverage buffers, and uncovering debt maturity walls maturing within 24 months.

See `proposal.md` for background and motivation.

## Goals / Non-Goals

**Goals:**
- Implement `evaluateKlarmanSolvency(financials, options)` as a pure deterministic calculation function.
- Compute classical Altman Z-Score:
  - $X_1 = \text{Working Capital} / \text{Total Assets}$
  - $X_2 = \text{Retained Earnings} / \text{Total Assets}$
  - $X_3 = \text{EBIT} / \text{Total Assets}$
  - $X_4 = \text{Market Cap} / \text{Total Liabilities}$
  - $X_5 = \text{Revenue} / \text{Total Assets}$
  - $Z = 1.2 X_1 + 1.4 X_2 + 3.3 X_3 + 0.6 X_4 + 0.999 X_5$
  - Classify into Safe ($Z > 2.99$), Grey ($1.81 \le Z \le 2.99$), or Distress ($Z < 1.81$) zones.
- Compute Net Debt to EBITDA ratio: $(\text{Total Debt} - \text{Cash}) / \text{EBITDA}$.
- Compute Interest Coverage Ratio: $\text{EBIT} / \text{Interest Expense}$.
- Compute Debt Maturity Wall (Cliff) ratio: Available Cash & Operating Cash Flow vs Debt maturing within 24 months.
- Compute Cash Flow Accrual Gap: $\text{Operating Cash Flow} - \text{Net Income}$.
- Output canonical `UniformVerdictContract` (`principle: "klarman_solvency"`, `is_veto: false`, stances: `STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`).
- Broad market Index ETF passive bypass (`VOO`, `QQQ`, `SPY`, etc.) returning `score: 100.0`, `stance: "HOLD"`.
- Support Pattern C Dual-Mode CLI (`--data <path>`, `--ticker <SYMBOL>`) and Option C Portfolio Batch Mode (`--holdings <path>`).
- Render self-contained offline HTML audit dashboard template (`assets/klarman-solvency-template.html`) with SVG gauges, Altman Z-Score meter, debt maturity cliff tracker, and zero external network leaks verified by `artifact_harness.js`.

**Non-Goals:**
- Liquidation floors or Net-Net Working Capital (reserved for `analyze-graham`, Story 3.2).
- PEG ratios and inventory velocity divergence (reserved for `analyze-lynch`, Story 3.3).
- True Owner Earnings and 5-step DuPont ROE (reserved for `analyze-buffett-munger`, Story 3.4).
- Gatekeeper veto disqualification (reserved for `forensic-governance`, Story 3.1).

## Decisions

### Decision 1: Pure Deterministic Functional Core
`evaluateKlarmanSolvency(normalizedFinancials, options)` is isolated as a pure mathematical function.
- **Inputs**: A valid `NormalizedCompanyFinancials` object.
- **Outputs**: A canonical `UniformVerdictContract` object (`principle: "klarman_solvency"`).
- **Rationale**: Keeps calculations decoupled from I/O, network queries, and file writing, ensuring 100% deterministic testability.

### Decision 2: Quantitative Klarman Solvency Scoring & Stance Synthesis
The Solvency Score is normalized from 0.0 to 100.0 across 4 quantitative pillars:
1. **Altman Z-Score & Bankruptcy Resistance (35 pts)**:
   - $Z > 2.99$: 35 pts (Safe Zone, robust financial resilience)
   - $Z \in [2.50, 2.99]$: 25 pts (Upper Grey Zone)
   - $Z \in [1.81, 2.50)$: 15 pts (Lower Grey Zone, warning flagged)
   - $Z < 1.81$ or null: 0 pts (Distress Zone, insolvency danger alert)
2. **Leverage Burden & Net Debt to EBITDA (25 pts)**:
   - $\text{Net Debt} \le 0$ (Net Cash) or $\text{Net Debt} / \text{EBITDA} \le 1.0$: 25 pts (fortress balance sheet)
   - $\text{Net Debt} / \text{EBITDA} \in (1.0, 2.5]$: 18 pts (manageable debt load)
   - $\text{Net Debt} / \text{EBITDA} \in (2.5, 4.0]$: 8 pts (elevated leverage warning)
   - $\text{Net Debt} / \text{EBITDA} > 4.0$ or positive debt with negative EBITDA: 0 pts (severe leverage burden alert)
3. **Debt Maturity Wall & Refinancing Exposure (25 pts)**:
   - Debt maturing in 24m $= 0$ or $\text{Cash} \ge \text{Debt 24m}$: 25 pts (complete liquidity coverage)
   - $(\text{Cash} + \text{Operating Cash Flow}) \ge \text{Debt 24m}$: 18 pts (covered by operations)
   - Coverage ratio $\in [0.5, 1.0)$: 8 pts (moderate refinancing exposure warning)
   - Coverage ratio $< 0.5$: 0 pts (acute debt maturity cliff alert)
4. **Interest Coverage & Debt Service Cushion (15 pts)**:
   - Interest Coverage $\ge 5.0$ or interest expense $\le 0$: 15 pts (safe interest buffer)
   - Coverage $\in [3.0, 5.0)$: 10 pts
   - Coverage $\in [1.5, 3.0)$: 5 pts (thin coverage warning)
   - Coverage $< 1.5$ or negative EBIT: 0 pts (dangerously strained debt service)

**Stance Mapping**:
- `score >= 80.0`: `STRONG_BUY`
- `score >= 65.0`: `BUY`
- `score >= 50.0`: `HOLD`
- `score >= 35.0`: `REDUCE`
- `score < 35.0`: `STRONG_SELL`

### Decision 3: Option C Consolidated Portfolio Matrix
In `--holdings` batch mode, `analyze-klarman-solvency` outputs:
- `verdicts/klarman_solvency_portfolio_verdicts.json` (conforming to `VerdictBatch`)
- `verdicts/klarman_solvency_portfolio_audits.html` (interactive multi-stock matrix with sorting by solvency score, stance filters, Altman Z-Score zones, and debt maturity meters)

### Decision 4: Self-Contained Offline HTML Design
The HTML template in `assets/klarman-solvency-template.html` embeds all CSS inline with zero external fonts or stylesheets. Visual features include:
- SVG circular gauge for the Klarman solvency score.
- Altman Z-Score colored zone meter (Safe, Grey, Distress).
- Debt maturity cliff visual bar comparing debt due in 24m against cash reserves.
- Net Debt / EBITDA leverage indicator card.

## Risks / Trade-offs

- **[Risk: Entities with low or zero total debt where interest expense is not reported]**
  → *Mitigation*: When total debt is zero or interest expense is not reported, the engine awards full safety points for leverage and interest coverage without throwing errors.
- **[Risk: High-growth tech firms with zero debt but negative operating earnings]**
  → *Mitigation*: The cash cushion and Altman $X_4$ market capitalization ratio partially offset operating deficits, while alerting the investor to cash burn.

