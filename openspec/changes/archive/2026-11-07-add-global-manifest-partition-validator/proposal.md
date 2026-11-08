# Proposal

## Why

To establish the decoupled 4-tier Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), the system must enforce **Invariant 1 (Strict 1-to-Many Account Partitioning)**: every configured broker account must belong to strictly one Investment Way ($\forall A \in \mathcal{A}, |\{W \in \mathcal{W} \mid A \in \text{Accounts}(W)\}| = 1$). Without a declarative manifest and a pre-execution partition validator, assigning a single broker account to multiple strategies would cause cash margin contention, double-counted equity positions, and corrupted True Strategy XIRR calculations.

## What Changes

- Define the declarative manifest configuration (`config/investment_ways.yaml`) and its formal draft-07 JSON Schema (`.agents/shared/framework/schemas/investment-ways-manifest.schema.json`) to declare broker accounts, market data providers, analysis principles, gatekeepers, and Investment Way bindings.
- Implement the Global Manifest & Account Partition Validator module and CLI (`.agents/shared/framework/manifest_validator.js`) with zero external heavy dependencies.
- Enforce strict 1-to-many account partitioning: verify that every Investment Way owns $\ge 1$ account, no broker account ID is assigned to more than one Investment Way, and all referenced account IDs, data providers, gatekeepers, and analysis principles are registered.
- Validate that each Investment Way's valuation pillar weights are positive numbers that sum to $1.0$ (within floating-point tolerance $10^{-6}$).
- Provide a CLI entrypoint (`node .agents/shared/framework/manifest_validator.js [--config <path>] [--json]`) that outputs structured validation results and exits with a non-zero status code (`1`) on any schema or partition invariant violation.
- Add a deterministic test suite (`.agents/shared/framework/tests/manifest_validator.test.js`) covering valid multi-account partitions, duplicate account collisions, orphan accounts, empty account lists, and invalid weight sums.

## Capabilities

### New Capabilities
- `framework/manifest-partition-validation`: Declarative `investment_ways.yaml` manifest schema, parser, and pre-execution validator enforcing strict 1-to-many broker account partitioning and strategy configuration invariants across Investment Ways.

### Modified Capabilities
<!-- None -->

## Impact

- Introduces `.agents/shared/framework/` for cross-tier schemas, manifest parsing, and partition validation, plus the default `config/investment_ways.yaml` manifest.
- Unblocks Story 1.2 (`NormalizedCompanyFinancials & UniformVerdict JSON Schemas`), Story 1.3 (`Universal 1-JSON + 1-HTML Verification Harness`), and Tier 4 Investment Way orchestrators (`way-long-term-strategy`).
- Does not break or modify existing standalone skills during Phase 1 coexistence.

