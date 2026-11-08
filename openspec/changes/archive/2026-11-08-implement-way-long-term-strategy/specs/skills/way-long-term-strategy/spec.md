# Spec Delta: skills/way-long-term-strategy

## Purpose

Master Tier 4 Investment Way orchestrator and Option C consolidated HTML dashboard embedding multi-account blended positions, True Strategy XIRR, downside guardrail verdicts, and interactive Tier 3 valuation audits.

## ADDED Requirements

### Requirement: Canonical StrategyConsolidatedPortfolio Contract Schema
The system SHALL aggregate blended holdings, strategy performance, verdict synthesis, and embedded audits into a single contract conforming to the canonical `StrategyConsolidatedPortfolio` draft-07 JSON Schema (`strategy_id`, `timestamp`, `eval_date`, `base_currency`, `summary`, `blended_holdings`, `performance`, `verdict_synthesis`, `embedded_audits`).

#### Scenario: Valid consolidated portfolio contract generation
- **WHEN** valid blended holdings, XIRR performance, and verdict synthesis artifacts are compiled
- **THEN** the emitted JSON payload validates against `strategy-consolidated-portfolio.schema.json` without errors

#### Scenario: Executive portfolio summary containment
- **WHEN** a consolidated strategy contract is generated
- **THEN** `summary` contains numeric fields for total portfolio equity, invested capital, unrealized profit and loss, strategy XIRR, portfolio health score, and capital at risk

### Requirement: End-to-End Multi-Account Strategy Orchestration
The system SHALL coordinate pipeline execution across accounts assigned to an Investment Way in `config/investment_ways.yaml`, executing position blending, True Strategy XIRR solving, and downside guardrail synthesis.

#### Scenario: Autonomous strategy orchestration via manifest
- **WHEN** executed with an investment way identifier
- **THEN** the system resolves assigned broker accounts, executes holding blending, calculates pooled XIRR, evaluates valuation pillars, and compiles the consolidated portfolio

#### Scenario: Deterministic offline orchestration via file inputs
- **WHEN** pre-computed blended holdings, XIRR reports, and verdict synthesis files are supplied
- **THEN** the system generates the consolidated contract and master dashboard without external network access

### Requirement: Option C Consolidated Audit Embedding Architecture
The system SHALL ingest consolidated Tier 3 valuation and forensic governance audits for all portfolio securities and embed their metrics, formulas, red flags, and narrative rationale into interactive per-principle data structures.

#### Scenario: Embedding all five analysis principles
- **WHEN** portfolio securities are audited across forensic governance, Graham, Lynch, Buffett-Munger, and Klarman solvency
- **THEN** complete pillar scores, metrics, red flags, and summaries are embedded for each security under `embedded_audits`

#### Scenario: Seamless drill-down access without file fragmentation
- **WHEN** viewing any individual portfolio security in the master dashboard
- **THEN** users can inspect the complete audit trail across all five analysis principles directly within inline drawers and tabs

### Requirement: Interactive Lot-Level Attribution and Pooled Cash Inspection
The system SHALL preserve and render lot-level purchase tranches across domestic and foreign broker accounts alongside pooled multi-currency cash balances with FX conversion transparency.

#### Scenario: Multi-broker lot attribution inspection
- **WHEN** an equity position is held across multiple broker accounts
- **THEN** the dashboard attribution drawer displays individual account quantities, local purchase costs, exchange rates, and base currency invested amounts

#### Scenario: Pooled cash balance display
- **WHEN** multiple broker accounts hold uninvested liquid cash
- **THEN** the dashboard displays individual account cash balances and the consolidated pooled cash in strategy base currency

### Requirement: Offline Self-Contained Master Executive HTML Dashboard
The system SHALL render a single, offline self-contained HTML dashboard featuring dark-mode styling, executive KPI cards, asset allocation visualization, responsive audit tabs, and interactive drawers with zero external network leaks.

#### Scenario: Interactive dashboard rendering
- **WHEN** the user opens the master portfolio dashboard in an offline web browser
- **THEN** all KPI cards, asset tables, attribution drawers, and responsive valuation tabs render correctly without external CDN requests

#### Scenario: Verification harness conformance
- **WHEN** the generated master dashboard is evaluated by `artifact_harness.js`
- **THEN** verification passes with zero external style, script, or image leak errors

### Requirement: Dual-Mode CLI Execution
The system SHALL support deterministic offline execution via `--blended`, `--xirr`, `--synthesis` flags and autonomous strategy orchestration via `--way <way_id>`.

#### Scenario: Offline file-based CLI execution
- **WHEN** executed with pre-computed component files
- **THEN** the CLI emits the consolidated JSON contract and master HTML dashboard to the specified output directory

#### Scenario: Autonomous CLI execution via strategy way
- **WHEN** executed with `--way fundamental_lts`
- **THEN** the system resolves strategy accounts, executes the full pipeline, and outputs verified artifacts

