# Specification: forensic-governance Skill

## Purpose

Provides an independent Tier 3 Gatekeeper evaluation engine auditing promoter pledging, related-party transactions, auditor continuity, Beneish M-Score, and Sloan accrual ratio to detect accounting fraud and enforce hard veto disqualifications (`is_veto: true`, `VETO_DISQUALIFIED`).

## Requirements

### Requirement: Canonical UniformVerdictContract output
The system SHALL evaluate company financials and output verdicts conforming to the canonical `UniformVerdictContract` draft-07 JSON Schema (`principle: "forensic_governance"`, `ticker`, `timestamp`, `score`, `stance`, `is_veto`, `metrics`, `red_flags`, `summary`).

#### Scenario: Clean pass company evaluation
- **WHEN** a company with low promoter pledging, clean audit opinions, and safe accruals is evaluated
- **THEN** it outputs a `UniformVerdictContract` with `stance: "PASS"`, `is_veto: false`, `score >= 60.0`, and empty or minimal `red_flags`

#### Scenario: Metric property containment
- **WHEN** a forensic verdict is generated
- **THEN** `metrics` contains numeric keys for `promoter_pledging_pct`, `beneish_m_score`, `sloan_accrual_ratio`, and `related_party_transactions_pct`

### Requirement: Gatekeeper Veto Protocol enforcement
The system SHALL enforce hard veto disqualifications (`is_veto: true`, `stance: "VETO_DISQUALIFIED"`, `score <= 20.0`) whenever critical accounting, governance, or promoter risk thresholds are breached.

#### Scenario: Extreme promoter pledging veto
- **WHEN** promoter pledged shares exceed 50.0% of total promoter holdings
- **THEN** the verdict outputs `stance: "VETO_DISQUALIFIED"`, `is_veto: true`, and logs a critical red flag

#### Scenario: Related-party transaction excessive leakage
- **WHEN** related-party transactions exceed 25.0% of reported revenue
- **THEN** the verdict outputs `stance: "VETO_DISQUALIFIED"`, `is_veto: true`, and logs a critical red flag

#### Scenario: Mid-term auditor resignation or qualified audit opinion
- **WHEN** `auditor_resignation_flag: true` or `qualified_opinion_flag: true`
- **THEN** the verdict outputs `stance: "VETO_DISQUALIFIED"`, `is_veto: true`, and flags auditor instability

#### Scenario: High probability of earnings manipulation
- **WHEN** Beneish M-Score is greater than -1.78
- **THEN** the verdict outputs `stance: "VETO_DISQUALIFIED"`, `is_veto: true`, and flags potential manipulation

#### Scenario: Extreme non-cash accruals
- **WHEN** Sloan Accrual Ratio is greater than 0.25
- **THEN** the verdict outputs `stance: "VETO_DISQUALIFIED"`, `is_veto: true`, and flags aggressive revenue recognition

### Requirement: Non-veto flag thresholding
The system SHALL assign `stance: "FLAG"` and `is_veto: false` when elevated risks are detected without triggering hard disqualifications (score in [20.0, 59.9] or multiple warning flags).

#### Scenario: Moderate pledging and elevated DSO flagged
- **WHEN** promoter pledging is between 25.0% and 50.0% or DSO expands significantly
- **THEN** the verdict outputs `stance: "FLAG"`, `is_veto: false`, and `score` between 20.0 and 59.9

### Requirement: Index ETF passive bypass
The system SHALL detect broad market index ETFs and bypass single-company corporate governance checks, returning `score: 100.0`, `stance: "PASS"`, `is_veto: false`, and an informative passive benchmark summary.

#### Scenario: Index ETF security evaluation
- **WHEN** an index ETF security (e.g. `VOO`, `QQQ`) is evaluated
- **THEN** the system outputs `score: 100.0`, `stance: "PASS"`, `is_veto: false`, and empty `red_flags`

### Requirement: Pattern C dual-mode and batch execution
The system SHALL support `--data <path>` (deterministic offline mode), `--ticker <SYMBOL>` (autonomous mode), and `--holdings <path>` (Option C portfolio batch mode emitting `VerdictBatch`).

#### Scenario: Offline execution via --data flag
- **WHEN** executed with `--data <path_to_normalized_financials.json>`
- **THEN** the system evaluates the local file without making network requests and writes output artifacts

#### Scenario: Autonomous ticker execution via provider integration
- **WHEN** executed with `--ticker <SYMBOL>`
- **THEN** the system queries normalized financial statements from `provider-tickertape` and computes the verdict

#### Scenario: Portfolio batch execution via --holdings
- **WHEN** executed with `--holdings <path_to_account_holdings.json>`
- **THEN** the system processes all holdings into an Option C `VerdictBatch` JSON and consolidated HTML audit report

### Requirement: Standalone offline HTML audit dashboard
The system SHALL render a self-contained offline HTML audit report with inline CSS, visual metric gauges, red-flag badges, and zero external network asset dependencies.

#### Scenario: Single stock audit report rendering
- **WHEN** the HTML report is opened in an offline browser via `file://`
- **THEN** all visual gauges, forensic checklists, and summary cards render without network requests

#### Scenario: Verification harness conformance
- **WHEN** output artifacts are verified by `artifact_harness.js`
- **THEN** verification returns `ok: true` with zero external leak errors

