# Proposal: Implement Multi-Account Holding Blender & Attribution Drawer

## Why

In the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), an Investment Way (such as `way-long-term-strategy`) aggregates holdings and cash across multiple assigned broker accounts (e.g., domestic Indian demat accounts like Angel One and foreign US brokerage accounts like INDmoney). Currently, Tier 1 fetchers emit standardized `AccountHoldingsSnapshot` contracts on a per-account basis, but the framework lacks a deterministic holding blender to consolidate duplicate stock lots, compute weighted average cost basis (WAC), pool cash balances across currencies with explicit FX conversion, and maintain audit-grade lot attribution. 

Implementing the Multi-Account Holding Blender now (Story 4.1, Epic 4) unlocks Tier 4 strategy orchestration by providing a unified, blended position dataset that downstream valuation engines, the True Strategy XIRR calculator (Story 4.2), and the master portfolio dashboard (Story 4.4) depend on.

## What Changes

- **Multi-Account Holding Blender Engine**:
  - Ingests multiple `AccountHoldingsSnapshot` contracts according to the strategy manifest partition (`config/investment_ways.yaml`).
  - Aggregates positions by canonical identifier (ISIN / Ticker) across accounts.
  - Computes blended quantity ($\sum Q_{a, S}$) supporting whole and fractional shares (e.g. US fractional equity lots).
  - Computes Weighted Average Cost (WAC) in strategy base currency:
    $$\text{WAC}_{\text{blended}}(S) = \frac{\sum_{a \in \mathcal{A}_W} \big( Q_{a, S} \times C_{a, S} \times \text{FX}_a \big)}{\text{Quantity}_{\text{blended}}(S)}$$
  - Pools liquid cash and margin reserves across accounts into strategy base currency using current FX conversion rates:
    $$\text{Cash}_{\text{total}} = \sum_{a \in \mathcal{A}_W} \text{FX}_a \times \text{Cash}_a$$
  - Preserves an immutable `attribution` array for every consolidated position detailing account-level lots, quantities, original currency costs, and weights within the blended position.
- **Canonical Strategy Holdings Contract Schema**:
  - Introduces `strategy-holdings-blended.schema.json` draft-07 JSON schema and exports validation functions (`validateBlendedHoldings`) via `.agents/shared/framework/`.
- **Interactive Offline Attribution Drawer HTML Dashboard**:
  - Implements an offline self-contained HTML report with interactive expandable drawer rows/modals exposing lot-level attribution per account, blended vs individual cost comparisons, and currency conversion details with zero external network leaks (verified via `artifact_harness.js`).
- **CLI & Autonomous Invocation**:
  - Supports `--snapshots <file1> <file2> ...` for deterministic offline testing.
  - Supports `--way <way_id> [--manifest <path>]` for autonomous account snapshot ingestion and consolidation.

## Capabilities

### New Capabilities
- `skills/holding-blender`: Multi-account position blending, weighted average cost basis calculation, multi-currency cash pooling, lot-level attribution preservation, and interactive offline attribution drawer dashboard generation.

### Modified Capabilities
<!-- None: Existing Tier 1, Tier 2, and Tier 3 capabilities remain unchanged -->

## Impact

- **Affected Code**:
  - Adds `.agents/skills/holding-blender/` (or `.agents/skills/way-long-term-strategy/scripts/holding_blender.js`).
  - Adds `.agents/shared/framework/schemas/strategy-holdings-blended.schema.json`.
  - Updates `.agents/shared/framework/index.js` to export `validateBlendedHoldings`.
- **APIs & Dependencies**:
  - Consumes `AccountHoldingsSnapshot` artifacts from `fetch-angelone` and `fetch-indmoney-us`.
  - Zero external npm runtime dependencies (pure Node.js standard library built-ins).
- **Compatibility**:
  - Backward compatible with existing standalone single-account holdings snapshots.

