# Design: Implement analyze-graham Deterministic Valuation Engine

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 5-pillar valuation suite under Tier 3. Following the `forensic-governance` Gatekeeper (Story 3.1), `analyze-graham` provides Benjamin Graham's conservative value-investing methodology. It establishes tangible liquidation floors (Net-Net Working Capital, Net Current Asset Value) and intrinsic value bounds (Graham Number) against Current Market Price (CMP).

See `proposal.md` for background and motivation.

## Goals / Non-Goals

**Goals:**
- Implement `evaluateGrahamValuation(financials, options)` as a pure deterministic calculation function.
- Compute Graham Number floor: $\sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$ (when EPS > 0 and BVPS > 0; null otherwise).
- Compute Net-Net Working Capital (NNWC): $\text{Cash} + 0.75 \times \text{Receivables} + 0.50 \times \text{Inventory} - \text{Total Liabilities}$.
- Compute Net Current Asset Value (NCAV): $\text{Total Current Assets} - \text{Total Liabilities}$.
- Compute per-share liquidation values and Margin of Safety percentage vs CMP.
- Evaluate Benjamin Graham's defensive and enterprising investor rules (Current Ratio $\ge 2.0$, Debt $\le$ Net Current Assets, $\text{P/E} \times \text{P/B} \le 22.5$, earnings stability).
- Output canonical `UniformVerdictContract` with `principle: "graham"`, `is_veto: false`, and stance in `['STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'STRONG_SELL']`.
- Provide passive broad market Index ETF bypass (`score: 100.0`, `stance: "HOLD"`).
- Support Pattern C Dual-Mode CLI: `--data <path>`, `--ticker <SYMBOL>`, and `--holdings <path>` (Option C batch mode).
- Render self-contained offline HTML audit dashboard with visual metric gauges and valuation floor comparisons, verified by `artifact_harness.js`.

**Non-Goals:**
- Growth PEG and inventory velocity divergence (reserved for `analyze-lynch`, Story 3.3).
- Owner Earnings and 5-step DuPont ROE decomposition (reserved for `analyze-buffett-munger`, Story 3.4).
- Altman Z-Score and debt maturity cliff exposure (reserved for `analyze-klarman-solvency`, Story 3.5).
- Gatekeeper veto disqualifications (reserved for `forensic-governance`, Story 3.1).

## Decisions

### Decision 1: Pure Deterministic Functional Core
`evaluateGrahamValuation(normalizedFinancials, options)` is isolated as a pure mathematical function.
- **Inputs**: A valid `NormalizedCompanyFinancials` object.
- **Outputs**: A canonical `UniformVerdictContract` object (`principle: "graham"`).
- **Rationale**: Keeps business rules and math decoupled from I/O, network queries, and file writing, ensuring 100% deterministic reproducibility.

### Decision 2: Graham Scoring & Stance Synthesis
The Graham Score is normalized from 0.0 to 100.0 based on 4 quantitative pillars:
1. **Margin of Safety vs Graham Number (40 pts)**:
   - $\text{MoS} \ge 30\%$: 40 pts
   - $\text{MoS} \in [10\%, 30\%)$: 30 pts
   - $\text{MoS} \in [-10\%, 10\%)$: 20 pts (fair value)
   - $\text{MoS} \in [-30\%, -10\%)$: 10 pts
   - $\text{MoS} < -30\%$ or EPS/BVPS $\le 0$: 0 pts
2. **Multiples Discipline (P/E & P/B) (25 pts)**:
   - $\text{P/E} \le 15.0$ and $\text{P/B} \le 1.5$ (or $\text{P/E} \times \text{P/B} \le 22.5$): 25 pts
   - $\text{P/E} \times \text{P/B} \in (22.5, 35.0]$: 15 pts
   - $\text{P/E} \times \text{P/B} \in (35.0, 50.0]$: 8 pts
   - $\text{P/E} \times \text{P/B} > 50.0$: 0 pts
3. **Balance Sheet Liquidity & Solvency (20 pts)**:
   - Current Ratio $\ge 2.0$: 10 pts ($\in [1.5, 2.0)$: 6 pts; $< 1.0$: 0 pts)
   - Total Debt $\le$ Net Current Assets (NCA): 10 pts (otherwise 0 pts)
4. **Earnings Stability & Dividend Continuity (15 pts)**:
   - Positive net income: 10 pts (negative: 0 pts)
   - Positive dividend yield: 5 pts

**Net-Net Special Condition**:
If an equity trades at a discount to its Net-Net Working Capital per share ($\text{CMP} \le \text{NNWC per share}$), the stock is classified as a classic Graham Net-Net bargain, setting the score floor at $\ge 90.0$.

**Stance Mapping**:
- `score >= 80.0`: `STRONG_BUY`
- `score >= 65.0`: `BUY`
- `score >= 50.0`: `HOLD`
- `score >= 35.0`: `REDUCE`
- `score < 35.0`: `STRONG_SELL`

### Decision 3: Option C Consolidated Portfolio Matrix
In `--holdings` batch mode, `analyze-graham` outputs:
- `verdicts/graham_portfolio_verdicts.json` (conforming to `VerdictBatch`)
- `verdicts/graham_portfolio_audits.html` (interactive multi-stock matrix with sorting by Graham score, stance filters, and valuation floor comparisons)
This prevents artifact clutter while maintaining deep individual valuation transparency.

### Decision 4: Self-Contained Offline HTML Design
The HTML template in `assets/graham-template.html` embeds all CSS inline with zero external fonts or remote stylesheets. It features:
- Large SVG Circular Gauge for the Graham Score.
- Visual Valuation Floors comparison (CMP vs Graham Number vs NCAV per share vs NNWC per share).
- Defensive Investor 7-Point Checklist.
- Zero external network calls (verified by `artifact_harness.js`).

## Risks / Trade-offs

- **[Risk: Modern asset-light technology companies trade at high multiples above Graham Number]**
  → *Mitigation*: Graham's methodology is intentionally conservative regarding tangible liquidation value. The score transparently indicates lack of classical margin of safety, while subsequent Tier 3 engines (`analyze-lynch` and `analyze-buffett-munger`) will reward compounding moats and growth.
- **[Risk: Negative EPS or BVPS leads to invalid square root calculation]**
  → *Mitigation*: The formula checks `if (eps <= 0 || bvps <= 0) return null`. The Graham Number is safely recorded as `null`, avoiding `NaN`, and a clear red flag is appended.

