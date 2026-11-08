# Design

## Context

The repository currently runs standalone skills (`.agents/skills/fetch-lts`, `fetch-indmoney-us-stocks`, `analyze-lts-holdings`, `fetch-lts-xirr`) with skill-local JSON configurations (`config/lts.config.json`, `.agents/config/indmoney-mcp.json`). As we transition to the 4-tier Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), multiple Investment Ways will orchestrate multiple broker accounts, data providers, gatekeepers, and valuation principles.

See `proposal.md` for the motivation behind strict 1-to-many account partitioning and `specs/framework/manifest-partition-validation/spec.md` for normative requirements.

## Goals / Non-Goals

**Goals:**
- Provide a single declarative source of truth (`config/investment_ways.yaml`) mapping broker accounts, data providers, gatekeepers, and valuation principles to Investment Ways.
- Provide a zero-dependency Node.js validator and JSON Schema that both CLI users and Tier 4 orchestrator skills can invoke pre-execution.
- Guarantee deterministic, fast (< 50ms) validation with clear human-readable and `--json` error reporting.

**Non-Goals:**
-Validating live broker credentials or network connectivity (belongs to Tier 1 Account Fetchers in Epic 2).
- Validating company financial payloads or valuation verdict outputs (belongs to Story 1.2 & Story 1.3).
- Executing portfolio orchestration or XIRR math (belongs to Epic 4).

## Decisions

### 1. JSON-Compatible YAML Subset / Dual YAML+JSON Parser
- **Decision**: Author `config/investment_ways.yaml` using clean YAML syntax (with support for JSON-compatible YAML or a lightweight built-in YAML parser in `.agents/shared/framework/yaml_loader.js`) so the project does not require installing external native or heavy npm packages.
- **Rationale**: `package.json` currently depends only on `@modelcontextprotocol/sdk`. Keeping the core framework validator dependency-free ensures it runs reliably across any Node.js environment without `npm install` friction.
- **Alternatives considered**:
  - *Adding `js-yaml` + `ajv` npm dependencies*: Rejected to avoid bloating `node_modules` for a deterministic config structure that can be validated directly with a dedicated schema+invariant checker in pure Node.js.

### 2. Shared Framework Module Location (`.agents/shared/framework/`)
- **Decision**: Place the validator (`manifest_validator.js`), YAML/JSON loader, and draft-07 schema (`schemas/investment-ways-manifest.schema.json`) under `.agents/shared/framework/`.
- **Rationale**: `.agents/shared/` already houses shared cross-skill modules (`angelone/`, `indmoney/`, `tickertape/`). Adding `framework/` follows the exact repository convention and allows any Tier 1–4 skill to `require('../../shared/framework/manifest_validator')`.

### 3. Two-Phase Validation Pipeline (Structural Schema $\rightarrow$ Set-Theoretic Invariants)
- **Decision**: Separate validation into Phase A (structural schema validation: required top-level sections `version`, `accounts`, `data_providers`, `gatekeepers`, `analysis_principles`, `investment_ways`, field types) and Phase B (relational & mathematical invariants: account partition bijectivity across Investment Ways, referential integrity against registries, and $\sum w_k = 1.0$).
- **Rationale**: Collecting all structural and relational errors in a single pass gives the user a complete diagnostic list rather than failing on the first error.

### 4. Structured Error Codes
- **Decision**: Emit machine-readable error codes (`ERR_MANIFEST_NOT_FOUND`, `ERR_SCHEMA_INVALID`, `ERR_EMPTY_ACCOUNTS`, `ERR_DUPLICATE_ACCOUNT_IN_WAY`, `ERR_ACCOUNT_PARTITION_COLLISION`, `ERR_UNKNOWN_ACCOUNT`, `ERR_ORPHAN_ACCOUNT`, `ERR_UNKNOWN_PROVIDER`, `ERR_UNKNOWN_PRINCIPLE`, `ERR_UNKNOWN_GATEKEEPER`, `ERR_WEIGHT_SUM_MISMATCH`) in both CLI text and `--json` output.
- **Rationale**: Enables deterministic unit test assertions in `node --test` and allows Tier 4 orchestrators to programmatically inspect failure reasons.

## Risks / Trade-offs

- **[Risk] Hand-rolled YAML parser limitations on complex YAML constructs (anchors, multi-line folded blocks)** → **Mitigation**: Restrict `investment_ways.yaml` to standard key-value maps, arrays, strings, booleans, and numbers, and support JSON syntax seamlessly as a valid subset of YAML 1.2. Document supported syntax in the schema and comments.
- **[Risk] Floating-point precision in pillar weight sums (e.g., `0.333333 + 0.333333 + 0.333334`)** → **Mitigation**: Enforce $|\sum w_k - 1.0| \le 10^{-6}$ tolerance rather than strict IEEE-754 `=== 1.0`.

## Migration Plan

1. Create `.agents/shared/framework/schemas/investment-ways-manifest.schema.json`.
2. Implement `.agents/shared/framework/manifest_validator.js` (exposing both `validateManifest(config)` API and CLI runner).
3. Create default `config/investment_ways.yaml` declaring the Phase 1 baseline (`angelone` bound to `fundamental_lts` and `indmoney_us` bound to `fundamental_foreign`, or unified per user config, with `provider-tickertape`, `forensic-governance`, and the 4 valuation pillars).
4. Add `node --test` suite in `.agents/shared/framework/tests/manifest_validator.test.js`.

