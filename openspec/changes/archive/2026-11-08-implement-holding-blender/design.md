# Design: Implement Multi-Account Holding Blender & Attribution Drawer

## Context

The Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`) defines a 4-tier decoupled architecture:
- **Tier 1**: Broker Account Ingestion (`fetch-angelone`, `fetch-indmoney-us`) emitting canonical `AccountHoldingsSnapshot` contracts.
- **Tier 2**: Market Data Normalization (`provider-tickertape`) emitting `NormalizedCompanyFinancials`.
- **Tier 3**: Five-Pillar Valuation Suite (`forensic-governance`, `analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`) emitting `UniformVerdictContract`.
- **Tier 4**: Strategy Orchestration (`way-long-term-strategy`).

Epic 4 commences with Story 4.1: creating the Multi-Account Holding Blender to consolidate positions across assigned accounts into a unified strategy portfolio while retaining lot attribution.

See `proposal.md` for motivation and background.

## Goals / Non-Goals

**Goals:**
- Implement `blendHoldings(snapshots, options)` as a pure deterministic calculation function.
- Compute consolidated quantities ($\sum Q_{a, S}$) supporting whole and fractional share precision.
- Compute Weighted Average Cost (WAC) converted to strategy base currency.
- Pool liquid cash reserves across domestic and international accounts with explicit FX conversion.
- Attach an immutable `attribution` array to each blended position detailing contributing account lots.
- Create and validate against canonical draft-07 JSON Schema `strategy-holdings-blended.schema.json`.
- Export `validateBlendedHoldings` from `.agents/shared/framework/`.
- Provide a self-contained offline HTML audit dashboard template (`assets/holding-blender-template.html`) featuring interactive click-to-expand lot attribution drawers with zero external network leaks (verified via `verifyHtmlSelfContainment`).
- Implement Pattern C Dual-Mode CLI supporting `--snapshots <file...>` and `--way <way_id>`.

**Non-Goals:**
- Multi-year Newton-Raphson Strategy XIRR and friction drag calculation (reserved for Story 4.2).
- Asymmetric downside guardrails or gatekeeper short-circuiting (reserved for Story 4.3).
- Master multi-tab strategy dashboard embedding all Tier 3 audit reports (reserved for Story 4.4).
- Placing broker buy/sell orders (the framework is strictly read-only portfolio auditing).

## Decisions

### Decision 1: Pure Deterministic Functional Blender Core
`blendHoldings(snapshots, options)` is isolated as a pure mathematical function:
- **Inputs**: Array of valid `AccountHoldingsSnapshot` objects, plus options (`baseCurrency`, `fxRates`, `timestamp`, `strategyId`).
- **Outputs**: A canonical `StrategyHoldingsBlended` object.
- **Rationale**: Clean decoupling of multi-account aggregation logic from disk I/O, network calls, and CLI arguments, enabling 100% deterministic unit testing across static fixtures.

### Decision 2: Mathematical Formulation of Blended Positions
1. **Canonical Position Keying**:
   Positions are indexed by canonical `ticker` (fallback to `isin` or `symbol`).
2. **Blended Quantity**:
   $$Q_{\text{blended}} = \sum_{a \in \mathcal{A}} Q_{a}$$
   Fractional quantities are preserved with up to 6 decimal places of precision.
3. **Weighted Average Cost (WAC)**:
   $$\text{WAC}_{\text{blended}} = \frac{\sum_{a \in \mathcal{A}} \big( Q_{a} \times C_{a} \times \text{FX}_{a} \big)}{Q_{\text{blended}}}$$
   Where $\text{FX}_a$ is the exchange rate from account currency $a$ to strategy base currency.
4. **Current Value & Invested Value**:
   $$\text{InvestedValue} = Q_{\text{blended}} \times \text{WAC}_{\text{blended}}$$
   $$\text{CurrentValue} = Q_{\text{blended}} \times \text{CMP}_{\text{base}}$$
   $$\text{UnrealizedPnL} = \text{CurrentValue} - \text{InvestedValue}$$
   $$\text{UnrealizedPnL\%} = \frac{\text{UnrealizedPnL}}{\text{InvestedValue}} \times 100$$
5. **Portfolio Weighting**:
   $$\text{Weight\%} = \frac{\text{CurrentValue}}{\sum_{S} \text{CurrentValue}_{S}} \times 100$$

### Decision 3: Immutable Lot-Level Attribution Tranche Drawer
Each position retains an `attribution` array:
```json
{
  "account_id": "angelone",
  "broker": "angelone",
  "quantity": 100,
  "average_price": 1450.0,
  "original_currency": "INR",
  "fx_rate": 1.0,
  "cost_in_base_currency": 1450.0,
  "invested_value_base": 145000.0,
  "current_value_base": 160000.0,
  "weight_in_position_pct": 72.5
}
```
This guarantees complete auditability back to individual broker demat statements without losing macro portfolio visibility.

### Decision 4: Multi-Currency Cash Pooling & FX Rates
- Cash pooling converts available cash from each account into strategy base currency:
  $$\text{Cash}_{\text{total}} = \sum_{a \in \mathcal{A}} \text{FX}_a \times \text{Cash}_a$$
- Total Strategy Equity:
  $$\text{TotalEquity} = \sum_{S} \text{CurrentValue}_S + \text{Cash}_{\text{total}}$$
- FX conversion rate is sourced from:
  1. Explicit `--fx <PAIR>=<RATE>` CLI arguments.
  2. The account snapshot itself (e.g., `fetch-indmoney-us` records `exchange_rate`).
  3. Default fallback parity (1.0) when currencies match.

### Decision 5: Canonical Schema Contract & Framework Integration
- Create schema `strategy-holdings-blended.schema.json` under `.agents/shared/framework/schemas/`.
- Export `validateBlendedHoldings(payload)` from `.agents/shared/framework/index.js`.
- Register `blended-holdings` as a supported schema type in `artifact_harness.js`.

### Decision 6: Interactive Offline Attribution Drawer HTML Dashboard
The template `assets/holding-blender-template.html` renders:
- Strategy summary header with responsive KPI cards.
- Accounts blended summary cards (showing original balance, currency, FX rate, and contribution).
- Consolidated equity table with an interactive chevron button per row.
- Clicking the chevron smoothly toggles an accordion attribution drawer displaying the lot breakdown.
- 100% offline self-containment with zero external network requests (verified via `verifyHtmlSelfContainment`).

## Risks / Trade-offs

- **[Risk: Currency conversion mismatches across different snapshot timestamps]**
  → *Mitigation*: The blender records the exact FX rate applied to each account lot in the `attribution` array and in `accounts_blended`, ensuring complete traceability.
- **[Risk: Fractional share rounding drift across multiple US lots]**
  → *Mitigation*: Calculations maintain raw IEEE 754 float precision during accumulation and apply explicit banker's rounding (`round4` for quantities, `round2` for currency values) only at contract serialization boundaries.

