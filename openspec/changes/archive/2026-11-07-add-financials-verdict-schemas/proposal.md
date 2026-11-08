# Proposal

## Why

To enforce **Invariant 3 (Source-Agnostic Principle Isolation)** and enable **Pattern C Dual-Mode Execution** in the 4-tier Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), Tier 2 Market Data Providers and Tier 3 Analysis Principle skills must communicate exclusively through formal, canonical JSON contracts. Defining and validating the `NormalizedCompanyFinancials` and `UniformVerdictContract` JSON Schemas ensures that every valuation engine (`forensic-governance`, `analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`) operates deterministically over a vendor-neutral financial model and emits uniform verdicts that Tier 4 orchestrators can synthesize without custom adapters.

## What Changes

- Create `.agents/shared/framework/schemas/normalized-company-financials.schema.json` (draft-07 JSON Schema) defining standardized company metadata, market multiples, income statement, balance sheet, cash flow, and forensic/governance fields across Indian (Ind AS / ₹) and US (US GAAP / $) equities.
- Create `.agents/shared/framework/schemas/uniform-verdict.schema.json` (draft-07 JSON Schema) defining the canonical `UniformVerdictContract` (`principle`, `ticker`, `timestamp`, `score` in $[0, 100]$, `stance`, `is_veto`, `metrics`, `red_flags`, `summary`) and consolidated batch verdict arrays for Option C portfolio runs.
- Implement a zero-dependency schema and semantic contract validator module (`.agents/shared/framework/contract_validator.js`) providing `validateNormalizedFinancials(payload)` and `validateUniformVerdict(payload)` (plus batch array validation `validateUniformVerdictBatch(payload)`) and CLI support (`--type financials|verdict|verdict-batch --file <path> [--json]`).
-Enforce domain invariants between `principle`, `stance`, and `is_veto` (e.g., `forensic_governance` emits `PASS`, `FLAG`, or `VETO_DISQUALIFIED` and sets `is_veto: true` iff `stance === "VETO_DISQUALIFIED"`, whereas valuation principles emit `STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, or `STRONG_SELL` with `is_veto: false`).
- Export the contract validators and schema loaders from `.agents/shared/framework/index.js` and add unit and CLI tests in `.agents/shared/framework/tests/contract_validator.test.js`.

## Capabilities

### New Capabilities
- `framework/financials-verdict-schemas`: Formal draft-07 JSON Schemas and programmatic/CLI validators for `NormalizedCompanyFinancials` and `UniformVerdictContract` (single and consolidated batch modes).

### Modified Capabilities
<!-- None -->

## Impact

- Extends `.agents/shared/framework/` with `schemas/normalized-company-financials.schema.json`, `schemas/uniform-verdict.schema.json`, `contract_validator.js`, and `tests/contract_validator.test.js`.
- Unblocks Story 1.3 (`Universal 1-JSON + 1-HTML Verification Harness`), Epic 2 (`provider-tickertape`), Epic 3 (all 5 valuation pillars), and Epic 4 (`way-long-term-strategy`).

