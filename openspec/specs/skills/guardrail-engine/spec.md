# Spec: skills/guardrail-engine

## Purpose

Evaluates multi-pillar valuation verdicts and forensic gatekeeper audits, short-circuiting vetoed securities to DISQUALIFIED with zero capital allocation, enforcing the Asymmetric Downside Guardrail (NEEDS_REVIEW on any STRONG_SELL), and synthesizing weighted principle scores.

## Requirements

### Requirement: Canonical StrategyVerdictSynthesis Contract Schema
The system SHALL evaluate gatekeeper and valuation principle verdicts for strategy assets and emit a consolidated synthesis object conforming to the canonical `StrategyVerdictSynthesis` draft-07 JSON Schema (`strategy_id`, `timestamp`, `eval_date`, `summary`, `portfolio_verdicts`, `allocations`).

#### Scenario: Valid verdict synthesis report generation
- **WHEN** valid gatekeeper and valuation pillar verdicts are synthesized for a strategy portfolio
- **THEN** the emitted JSON payload validates against `strategy-verdict-synthesis.schema.json` without errors

#### Scenario: Summary property containment
- **WHEN** a strategy verdict synthesis is emitted
- **THEN** `summary` contains numeric fields for `portfolio_health_score`, `total_positions`, `disqualified_count`, `needs_review_count`, `approved_count`, and `capital_at_risk`

### Requirement: Gatekeeper Veto Short-Circuit Protocol
The system SHALL check the forensic governance gatekeeper verdict first; if a hard veto is present, it MUST immediately short-circuit the asset to `DISQUALIFIED` with zero recommended capital allocation.

#### Scenario: Vetoed stock immediate disqualification
- **WHEN** an equity's `forensic_governance` verdict carries `is_veto: true` or `stance: "VETO_DISQUALIFIED"`
- **THEN** the synthesized verdict sets `stance: "DISQUALIFIED"`, `is_disqualified: true`, `score: 0.0`, `recommended_allocation_pct: 0.0`, and records the gatekeeper red flags

#### Scenario: Gatekeeper pass allows valuation synthesis
- **WHEN** an equity's `forensic_governance` verdict carries `is_veto: false` and `stance: "PASS"`
- **THEN** `is_disqualified` is set to false and the system proceeds to downside guardrail and valuation weighting

### Requirement: Asymmetric Downside Guardrail Enforcement
The system SHALL inspect all active valuation principle verdicts for non-vetoed securities; if ANY principle signals `STRONG_SELL`, the synthesized stance MUST be forced to `NEEDS_REVIEW` regardless of composite score.

#### Scenario: Strong sell forces Needs Review
- **WHEN** an equity receives high scores from Graham, Buffett, and Klarman, but Lynch issues `STRONG_SELL`
- **THEN** the synthesized verdict sets `stance: "NEEDS_REVIEW"`, `guardrail_triggered: true`, logs the offending principle, and suppresses automated buy clearance

#### Scenario: Absence of Strong Sell preserves composite stance
- **WHEN** all active valuation principles report stances of `HOLD`, `BUY`, or `STRONG_BUY`
- **THEN** `guardrail_triggered` is set to false and the stance reflects the weighted composite score

### Requirement: Principle Weighting and Composite Score Synthesis
The system SHALL calculate the weighted average score across active valuation principles using weights defined in `config/investment_ways.yaml`, capping stance at `HOLD` if any principle reports `REDUCE`.

#### Scenario: Composite score calculation
- **WHEN** an equity is evaluated against 4 weighted principles with weights summing to 1.0
- **THEN** `score` equals $\sum (w_k \times \text{Score}_k)$ and baseline stance is determined from defined score thresholds

#### Scenario: Reduce signal caps stance
- **WHEN** an equity achieves a composite score above 65.0 (normally `BUY`), but one principle reports `REDUCE`
- **THEN** the synthesized stance is capped at `HOLD` with an explanatory note

### Requirement: Portfolio Risk Posture and Capital Allocation Auditing
The system SHALL compute portfolio-wide risk posture metrics and recommend rebalancing capital allocations across safe, reviewed, and disqualified holdings.

#### Scenario: Capital at risk measurement
- **WHEN** portfolio positions are evaluated against synthesized stances
- **THEN** `capital_at_risk` reflects the total market value of all positions flagged as `DISQUALIFIED` or `NEEDS_REVIEW`

#### Scenario: Recommended capital allocation pruning
- **WHEN** recommending target capital weights across portfolio assets
- **THEN** disqualified assets receive 0.0% allocation and capital is redistributed proportionally among approved assets

### Requirement: Offline Interactive HTML Audit Dashboard
The system SHALL render a self-contained offline HTML audit report displaying the portfolio risk gauge, disqualified stock cards, guardrail warning drawers, and principle score breakdown with zero external network leaks.

#### Scenario: Interactive report rendering
- **WHEN** the user opens the generated synthesis dashboard offline
- **THEN** the page renders visual posture gauges, warning cards for disqualified stocks, and expandable principle audit drawers

#### Scenario: Verification harness conformance
- **WHEN** the generated HTML report is verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

### Requirement: Dual-Mode CLI Execution
The system SHALL support deterministic offline execution via `--verdicts <path...>` and autonomous strategy ingestion via `--way <way_id>`.

#### Scenario: Offline execution via --verdicts and --manifest flags
- **WHEN** executed with local verdict files and manifest path
- **THEN** the system synthesizes verdicts locally without network calls and writes output artifacts

#### Scenario: Autonomous execution via --way flag
- **WHEN** executed with `--way fundamental_lts`
- **THEN** the system resolves strategy principles and weights from `config/investment_ways.yaml`, loads blended holdings, evaluates positions, and emits verified artifacts

