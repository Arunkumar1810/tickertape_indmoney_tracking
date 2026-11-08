# Design: Implement analyze-lynch Deterministic Growth Engine

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 5-pillar valuation suite under Tier 3. Following `forensic-governance` (Story 3.1) and `analyze-graham` (Story 3.2), `analyze-lynch` provides Peter Lynch's classic Growth-At-A-Reasonable-Price (GARP) methodology. It assesses whether earnings expansion justifies valuation multiples, categorizes the business into Lynch lifecycles, and flags operational inventory bloat.

See `proposal.md` for background and motivation.

## Goals / Non-Goals

**Goals:**
- Implement `evaluateLynchValuation(financials, options)` as a pure deterministic calculation function.
- Compute traditional PEG ($\text{P/E} / \text{EPS Growth Rate}$) and yield-adjusted PEG ($\text{P/E} / (\text{EPS Growth} + \text{Dividend Yield})$).
- Compute Lynch Fair Value line: $(\text{EPS Growth} + \text{Dividend Yield}) \times \text{EPS}$.
- Compute Inventory vs Sales velocity divergence: $\text{Inventory Growth Rate} - \text{Sales Growth Rate}$ (flagging when $> 5.0\%$).
- Categorize securities into canonical Lynch lifecycle categories: Fast Grower, Stalwart, Slow Grower, Cyclical, Turnaround, Asset Play.
- Output canonical `UniformVerdictContract` with `principle: "lynch"`, `is_veto: false`, and stance in `['STRONG_BUY', 'BUY', 'HOLD', 'REDUCE', 'STRONG_SELL']`.
- Provide passive broad market Index ETF bypass (`score: 100.0`, `stance: "HOLD"`).
- Support Pattern C Dual-Mode CLI: `--data <path>`, `--ticker <SYMBOL>`, and `--holdings <path>` (Option C batch mode).
- Render self-contained offline HTML audit dashboard with visual metric gauges and PEG valuation meters, verified by `artifact_harness.js`.

**Non-Goals:**
- Tangible asset liquidation floors (reserved for `analyze-graham`, Story 3.2).
- Owner Earnings and DuPont ROE decomposition (reserved for `analyze-buffett-munger`, Story 3.4).
- Balance sheet insolvency distress models / Altman Z (reserved for `analyze-klarman-solvency`, Story 3.5).
- Gatekeeper veto disqualifications (reserved for `forensic-governance`, Story 3.1).

## Decisions

### Decision 1: Pure Deterministic Functional Core
`evaluateLynchValuation(normalizedFinancials, options)` is isolated as a pure mathematical function.
- **Inputs**: A valid `NormalizedCompanyFinancials` object.
- **Outputs**: A canonical `UniformVerdictContract` object (`principle: "lynch"`).
- **Rationale**: Keeps calculations and lifecycle classifications decoupled from I/O, network queries, and file writing, ensuring 100% deterministic testability.

### Decision 2: Quantitative Lynch Scoring & Stance Synthesis
The Lynch Score is normalized from 0.0 to 100.0 across 4 quantitative pillars:
1. **PEG Valuation Discipline (40 pts)**:
   - $\text{PEG} \le 0.5$: 40 pts (screaming growth bargain)
   - $\text{PEG} \in (0.5, 1.0]$: 32 pts (fair/attractive growth)
   - $\text{PEG} \in (1.0, 1.5]$: 20 pts (fair value)
   - $\text{PEG} \in (1.5, 2.0]$: 10 pts (multiple expansion stretch)
   - $\text{PEG} > 2.0$ or $\text{PEG} = \text{null}$ (negative growth): 0 pts
2. **Earnings & Revenue Expansion Engine (25 pts)**:
   - 5-year EPS CAGR $\ge 20.0\%$: 25 pts (Fast Grower tier)
   - 5-year EPS CAGR $\in [10.0\%, 20.0\%)$: 18 pts (Stalwart tier)
   - 5-year EPS CAGR $\in [5.0\%, 10.0\%)$: 10 pts
   - 5-year EPS CAGR $< 5.0\%$: 0 pts
3. **Operational Inventory Velocity (20 pts)**:
   - Inventory growth $\le$ Sales growth ($\Delta \le 0.0\%$): 20 pts
   - $\Delta \in (0.0\%, 5.0\%]$: 14 pts
   - $\Delta \in (5.0\%, 10.0\%]$: 6 pts (warning flagged)
   - $\Delta > 10.0\%$: 0 pts (severe channel-stuffing / inventory glut red flag)
4. **Balance Sheet Health & Financial Freedom (15 pts)**:
   - Debt-to-Equity $\le 0.5$: 15 pts (strong balance sheet)
   - Debt-to-Equity $\in (0.5, 1.0]$: 10 pts
   - Debt-to-Equity $> 1.0$: 0 pts (elevated leverage warning)

**Stance Mapping**:
- `score >= 80.0`: `STRONG_BUY`
- `score >= 65.0`: `BUY`
- `score >= 50.0`: `HOLD`
- `score >= 35.0`: `REDUCE`
- `score < 35.0`: `STRONG_SELL`

### Decision 3: Categorization Taxonomy
Each security is assigned a primary Peter Lynch archetype:
- **Fast Grower**: EPS CAGR $\ge 20.0\%$ and $\text{Debt-to-Equity} \le 1.0$.
- **Stalwart**: EPS CAGR $\in [10.0\%, 20.0\%)$ and large/mid cap.
- **Slow Grower**: EPS CAGR $\in [2.0\%, 10.0\%)$ with dividend yield $\ge 2.5\%$.
- **Cyclical**: Identified by cyclical sector/industry (Automobiles, Metals, Construction, Capital Goods) or revenue growth volatility $> 25\%$.
- **Turnaround**: Transitioning from prior negative net income to positive trailing net income.
- **Asset Play**: Cash & equivalents $> 50\%$ of market cap or NCAV/share $\ge$ CMP.

### Decision 4: Option C Consolidated Portfolio Matrix
In `--holdings` batch mode, `analyze-lynch` outputs:
- `verdicts/lynch_portfolio_verdicts.json` (conforming to `VerdictBatch`)
- `verdicts/lynch_portfolio_audits.html` (interactive multi-stock matrix with sorting by Lynch score, stance filters, category badges, and PEG meters)

### Decision 5: Self-Contained Offline HTML Design
The HTML template in `assets/lynch-template.html` embeds all CSS inline with zero external fonts or stylesheets. Visual features include:
- SVG circular gauge for the Lynch GARP score.
- Color-coded PEG valuation meter.
- Inventory velocity vs sales growth delta visualizer.
- Category badge and narrative rationale.

## Risks / Trade-offs

- **[Risk: Early-stage fast growers with temporarily high P/E ratios and high inventory buildup for product launches]**
  → *Mitigation*: The inventory divergence rule permits up to a 5% difference before triggering a red flag, and yield-adjusted PEG gives credit for capital returns.
- **[Risk: Companies without 5-year CAGR history (recent IPOs)]**
  → *Mitigation*: Fallback to TTM EPS growth rate or revenue growth rate when 5-year CAGR is not yet established.

