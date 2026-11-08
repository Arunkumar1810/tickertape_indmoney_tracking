# Design: Implement forensic-governance Gatekeeper with Veto Protocol

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 5-pillar valuation and analysis tier. The `forensic-governance` skill acts as the mandatory gatekeeper. If corporate governance or accounting integrity is compromised, the stock is marked with `is_veto: true` and `stance: "VETO_DISQUALIFIED"`, alerting the Tier 4 strategy orchestrator to immediately short-circuit capital allocation regardless of how attractive valuation multiples might appear.

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Implement `evaluateForensicGovernance(financials, options)` as a deterministic, pure-function evaluation engine.
- Support Pattern C Dual-Mode: `--data <path>` (deterministic offline mode) and `--ticker <SYMBOL>` (autonomous provider mode).
- Support Option C portfolio batch mode: `--holdings <path>` generating a consolidated `VerdictBatch` JSON and multi-ticker HTML audit matrix.
- Enforce the Gatekeeper Veto Protocol: trigger `is_veto: true` and `stance: "VETO_DISQUALIFIED"` on extreme pledging (>50%), excessive RPT (>25%), auditor resignation/adverse opinions, earnings manipulation (Beneish M-Score > -1.78), or extreme accruals (Sloan ratio > 0.25).
- Automatically bypass corporate governance audits for broad market Index ETFs (`is_index_etf: true`, `VOO`, `QQQ`, `SPY`, etc.).
- Render an offline self-contained HTML audit dashboard with visual metric checklists, red-flag banners, and 0 external network leaks.
- Validate all outputs with `contract_validator.js` and `artifact_harness.js`.

**Non-Goals:**
- Computing valuation multiples (P/E, Graham Number floor, PEG ratio, DCF, DuPont ROE) — these belong to valuation pillars (Stories 3.2–3.5).
- Calculating portfolio-level blended weights or Strategy XIRR (reserved for Tier 4 orchestrator).

## Decisions

### Decision 1: Pure Deterministic Functional Core
The core evaluation logic is encapsulated in `evaluateForensicGovernance(normalizedFinancials)`.
- **Inputs**: A valid `NormalizedCompanyFinancials` object.
- **Outputs**: A canonical `UniformVerdictContract` object (`principle: "forensic_governance"`).
- **Rationale**: Isolates math and business rules completely from I/O, file reading, and network calls, ensuring 100% deterministic testability.

### Decision 2: Hard Veto Priority and Scoring Architecture
- **Initial Score**: 100.0.
- **Deductions for Warning Flags**:
  - Promoter Pledging 10%–25%: -15 pts; 25%–50%: -35 pts.
  - Related-Party Transactions 5%–10%: -10 pts; 10%–25%: -30 pts.
  - Beneish M-Score between -2.22 and -1.78: -25 pts.
  - Sloan Accrual Ratio between 0.10 and 0.25: -25 pts.
  - Days Sales Outstanding (DSO) YoY expansion > 20%: -10 pts.
  - Inventory growth exceeding revenue growth by > 15%: -10 pts.
  - Exchange surveillance stage 1 or 2: -25 pts.
- **Hard Veto Trigger**: If ANY of the following occur:
  - `promoter_pledging_pct > 50.0%`
  - `related_party_transactions_pct > 25.0%`
  - `auditor_resignation_flag === true`
  - `qualified_opinion_flag === true`
  - `beneish_m_score > -1.78`
  - `sloan_accrual_ratio > 0.25`
  - `surveillance_stage in ['STAGE_3', 'STAGE_4', 'GSM_STAGE_4']`
  - YoY share count growth > 10.0% (unjustified dilution)
- **Hard Veto Outcome**:
  - `score`: Capped at `Math.min(calculatedScore, 20.0)`
  - `stance`: `"VETO_DISQUALIFIED"`
  - `is_veto`: `true`
- **Thresholding without Veto**:
  - `score >= 60.0` and <= 1 minor warning: `stance: "PASS"`, `is_veto: false`
  - `score < 60.0` or 2+ warnings: `stance: "FLAG"`, `is_veto: false`

### Decision 3: Option C Consolidated HTML Portfolio Matrix
In `--holdings` batch mode, `forensic-governance` outputs:
- `verdicts/forensic_governance_portfolio_verdicts.json` (conforming to `VerdictBatch`)
- `verdicts/forensic_governance_portfolio_audits.html` (interactive multi-stock matrix with sorting by score, stance filters, and collapsible drill-down cards)
This avoids cluttering the directory with dozens of separate HTML reports while allowing deep forensic auditing.

### Decision 4: Self-Contained Offline HTML Design
The HTML template in `assets/forensic-template.html` embeds all CSS inline with zero external fonts or stylesheets. Visual statuses use SVG icons and high-contrast color codes (Green `#10b981` for Pass, Amber `#f59e0b` for Flag, Crimson `#ef4444` for Veto).

## Risks / Trade-offs

- **[Risk: Market-specific metric discrepancies (e.g. Promoter Pledging not reported in US)]**
  → *Mitigation*: The evaluator checks if a metric is relevant to the market. For US stocks without promoter constructs, promoter pledging is recorded as `null` or `0` and does not deduct score.
- **[Risk: Fast-growth companies exhibiting high Beneish M-scores without fraud]**
  → *Mitigation*: Boundary thresholding: scores between -2.22 and -1.78 trigger warnings (`FLAG`) rather than immediate `VETO_DISQUALIFIED`. Only crossing the definitive manipulation threshold (-1.78) triggers hard veto.

