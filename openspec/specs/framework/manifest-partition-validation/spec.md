# framework/manifest-partition-validation Specification

## Purpose

Defines the declarative investment ways manifest configuration and the pre-execution validator that enforces strict 1-to-many broker account partitioning and strategy configuration invariants across all Investment Ways.

## Requirements

### Requirement: Declarative manifest configuration
The system SHALL load the global investment ways manifest from a declarative YAML or JSON file (defaulting to `config/investment_ways.yaml`) declaring registered broker accounts, market data providers, gatekeepers, analysis principles, and Investment Ways.

#### Scenario: Load default manifest
- **WHEN** the validator runs without a `--config` flag and `config/investment_ways.yaml` exists
- **THEN** the system parses `config/investment_ways.yaml` and validates its structure

#### Scenario: Missing manifest file
- **WHEN** the validator runs with a `--config` path that does not exist
- **THEN** the system exits with status code 1 and reports a file-not-found error

### Requirement: Strict account partition enforcement
The system MUST enforce that no broker account identifier is assigned to more than one Investment Way across the entire manifest.

#### Scenario: Unique account bindings across investment ways
- **WHEN** `angelone` is assigned only to `fundamental_lts` and `indmoney_us` is assigned only to `fundamental_foreign`
- **THEN** the partition check succeeds with zero duplicate-account errors

#### Scenario: Duplicate account assigned to two investment ways
- **WHEN** broker account `angelone` is listed in both `fundamental_lts` and `swing_trading`
- **THEN** the validator fails with status code 1 and reports a partition collision naming `angelone` and both conflicting Investment Ways

#### Scenario: Duplicate account within the same investment way
- **WHEN** an Investment Way lists the same account identifier twice in its `accounts` array
- **THEN** the validator fails with status code 1 and reports a duplicate account entry

### Requirement: Complete account assignment verification
The system SHALL verify that every account identifier referenced by an Investment Way exists in the registered accounts catalog, and that every registered active account belongs to an Investment Way.

#### Scenario: Unregistered account referenced by an investment way
- **WHEN** an Investment Way references account `zerodha_main` which is not declared in the `accounts` registry
- **THEN** the validator fails with status code 1 and reports an unknown account reference

#### Scenario: Registered account left unassigned
- **WHEN** a broker account is declared in the `accounts` registry but is not bound to any Investment Way
- **THEN** the validator fails with status code 1 and reports an unassigned orphan account

### Requirement: Non-empty account binding per investment way
Each declared Investment Way MUST bind at least one broker account identifier.

#### Scenario: Investment way with empty accounts list
- **WHEN** an Investment Way declares `accounts: []`
- **THEN** the validator fails with status code 1 and reports that every Investment Way must own at least one account

### Requirement: Registered provider and principle validation
The system SHALL verify that all market data providers, gatekeepers, and analysis principles referenced by an Investment Way are declared in the manifest's registered catalogs.

#### Scenario: Unknown analysis principle referenced
- **WHEN** an Investment Way references an unregistered analysis principle `analyze-momentum`
- **THEN** the validator fails with status code 1 and reports an unregistered analysis principle

### Requirement: Normalized valuation weight validation
The system MUST verify that the valuation pillar weights configured for each Investment Way correspond to its active analysis principles, are strictly positive numbers, and sum to 1.0 within a tolerance of 0.000001.

#### Scenario: Weights sum to 1.0
- **WHEN** an Investment Way configures four valuation principles each with weight 0.25
- **THEN** the weight normalization check passes

#### Scenario: Weights do not sum to 1.0
- **WHEN** an Investment Way configures valuation weights that sum to 0.85
- **THEN** the validator fails with status code 1 and reports a weight sum mismatch

### Requirement: CLI validation output and exit codes
The validator CLI SHALL support `--config <path>` and `--json` flags, exit with status code 0 when all checks pass, and exit with status code 1 with structured error diagnostics when any violation occurs.

#### Scenario: JSON output on validation failure
- **WHEN** the CLI is invoked with `--json` on a manifest containing a duplicate account assignment
- **THEN** stdout contains a valid JSON object with `ok: false` and an `errors` array detailing the partition violation, and the process exits with code 1

