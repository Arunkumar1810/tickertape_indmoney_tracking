# framework/financials-verdict-schemas Specification

## Purpose

Defines the formal JSON Schemas and validation contracts for `NormalizedCompanyFinancials` (emitted by Tier 2 market data providers) and `UniformVerdictContract` (emitted by Tier 3 analysis principles and gatekeepers).

## Requirements

### Requirement: NormalizedCompanyFinancials schema validation
The system SHALL validate `NormalizedCompanyFinancials` payloads against a draft-07 JSON Schema requiring company identity metadata (`ticker`, `name`, `market`, `currency`, `timestamp`), `market_data`, `income_statement`, `balance_sheet`, `cash_flow`, and `forensics` sections.

#### Scenario: Valid Indian and US equity financial payloads
- **WHEN** a `NormalizedCompanyFinancials` object containing valid metadata and financial statement sections for an `IN` (`INR`) or `US` (`USD`) equity is validated
- **THEN** the validator returns `ok: true` with zero errors

#### Scenario: Missing required financial statement section
- **WHEN** a `NormalizedCompanyFinancials` payload omits `balance_sheet` or `cash_flow` for a non-ETF equity
- **THEN** the validator returns `ok: false` and reports a missing required section error

#### Scenario: Invalid market price or share count
- **WHEN** a `NormalizedCompanyFinancials` payload contains a non-positive `market_data.cmp` or `market_data.shares_outstanding`
- **THEN** the validator returns `ok: false` and reports a numeric constraint violation

### Requirement: Index ETF financial payload support
The system SHALL allow `NormalizedCompanyFinancials` payloads with `is_index_etf: true` to have nullable single-company GAAP statement fields while still requiring `ticker`, `name`, `market`, `currency`, `timestamp`, and `market_data.cmp`.

#### Scenario: Valid index ETF payload
- **WHEN** a `NormalizedCompanyFinancials` payload has `is_index_etf: true` and valid `market_data.cmp`
- **THEN** the validator passes without requiring single-company forensic or balance sheet line items

### Requirement: UniformVerdictContract structural validation
The system SHALL validate `UniformVerdictContract` payloads requiring `principle`, `ticker`, `timestamp`, `score` in `[0.0, 100.0]`, `stance`, `is_veto` boolean, numeric `metrics` map, `red_flags` string array, and non-empty `summary`.

#### Scenario: Valid valuation principle verdict
- **WHEN** a verdict object for `graham` has `score: 78.5`, `stance: "BUY"`, `is_veto: false`, numeric `metrics`, and `red_flags` array
- **THEN** the validator returns `ok: true` with zero errors

#### Scenario: Score out of range
- **WHEN** a verdict object has `score: 105` or `score: -5`
- **THEN** the validator returns `ok: false` and reports a score range violation

### Requirement: Gatekeeper vs valuation stance and veto consistency
The system MUST enforce that `forensic_governance` verdicts use stances in `["PASS", "FLAG", "VETO_DISQUALIFIED"]` with `is_veto: true` if and only if `stance` is `"VETO_DISQUALIFIED"`, and that valuation pillars (`graham`, `lynch`, `buffett_munger`, `klarman_solvency`) use stances in `["STRONG_BUY", "BUY", "HOLD", "REDUCE", "STRONG_SELL"]` with `is_veto: false`.

#### Scenario: Forensic governance veto verdict
- **WHEN** a `forensic_governance` verdict has `stance: "VETO_DISQUALIFIED"` and `is_veto: true`
- **THEN** the semantic consistency check passes

#### Scenario: Inconsistent veto flag on forensic governance verdict
- **WHEN** a `forensic_governance` verdict has `stance: "VETO_DISQUALIFIED"` with `is_veto: false`, or `stance: "PASS"` with `is_veto: true`
- **THEN** the validator returns `ok: false` and reports a stance-veto consistency violation

#### Scenario: Valuation pillar attempting to set veto flag
- **WHEN** a `graham` or `lynch` verdict sets `is_veto: true` or uses stance `"PASS"`
- **THEN** the validator returns `ok: false` and reports an invalid principle stance or veto flag

### Requirement: Consolidated batch verdict validation
The system SHALL support validating consolidated Option C portfolio verdict batches containing a `principle`, `timestamp`, and a non-empty `verdicts` array where every element conforms to `UniformVerdictContract` for that principle and has a unique `ticker`.

#### Scenario: Valid consolidated portfolio verdict batch
- **WHEN** a batch payload for `lynch` contains valid verdicts for `INFY` and `TCS`
- **THEN** the batch validator returns `ok: true`

#### Scenario: Duplicate ticker or mismatched principle in batch
- **WHEN** a batch payload for `lynch` contains two entries for `INFY` or an entry with `principle: "graham"`
- **THEN** the batch validator returns `ok: false` and reports the collision or principle mismatch

### Requirement: CLI contract validation interface
The contract validator CLI SHALL accept `--type <financials|verdict|verdict-batch>` and `--file <path>` (plus optional `--json`), exiting with code 0 when valid and code 1 with structured error diagnostics when invalid.

#### Scenario: CLI validation failure in JSON mode
- **WHEN** the CLI runs with `--type verdict --file invalid.json --json`
- **THEN** stdout contains JSON with `ok: false` and an `errors` array, and the process exits with code 1

