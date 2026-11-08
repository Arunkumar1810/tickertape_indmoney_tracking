---
name: holding-blender
description: Multi-account holding blender and attribution engine for Tier 4 investment ways. Aggregates positions across domestic and foreign accounts into a unified strategy portfolio, computing Weighted Average Cost (WAC), pooling multi-currency cash balances with FX conversion, preserving immutable lot-level attribution tranches, and generating interactive offline HTML dashboards with expandable attribution drawers.
license: Proprietary
compatibility: Node.js (>= 18.0.0)
metadata:
  tier: 4
  role: portfolio_blender
  author: Antigravity
---

# Multi-Account Holding Blender & Attribution Drawer

## Overview

The `holding-blender` skill implements Tier 4 multi-account position consolidation under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`). When an Investment Way (such as `way-long-term-strategy`) manages multiple broker accounts (e.g. Angel One Indian Demat and INDmoney US brokerage accounts), `holding-blender` reconciles duplicate securities, calculates blended quantities and Weighted Average Cost basis (WAC), pools liquid cash reserves into the strategy's base currency, and retains immutable lot-level attribution for auditability.

## Mathematical Formulation

1. **Blended Quantity & Weighted Average Cost (WAC)**:
   For any equity position $S$ held across assigned accounts $a \in \mathcal{A}_W$:
   $$Q_{\text{blended}}(S) = \sum_{a \in \mathcal{A}_W} Q_{a, S}$$
   $$\text{WAC}_{\text{blended}}(S) = \frac{\sum_{a \in \mathcal{A}_W} \big( Q_{a, S} \times C_{a, S} \times \text{FX}_a \big)}{Q_{\text{blended}}(S)}$$
   Where $Q_{a, S}$ is quantity held in account $a$ (supporting whole and fractional shares), $C_{a, S}$ is the average purchase cost in account currency, and $\text{FX}_a$ is the exchange rate to strategy base currency.

2. **Pooled Cash Reserves**:
   $$\text{Cash}_{\text{total}} = \sum_{a \in \mathcal{A}_W} \text{FX}_a \times \text{Cash}_a$$

3. **Valuation & Weighting**:
   $$\text{InvestedValue}(S) = Q_{\text{blended}}(S) \times \text{WAC}_{\text{blended}}(S)$$
   $$\text{CurrentValue}(S) = Q_{\text{blended}}(S) \times \text{CMP}_{\text{base}}(S)$$
   $$\text{UnrealizedPnL}(S) = \text{CurrentValue}(S) - \text{InvestedValue}(S)$$
   $$\text{Weight\%}(S) = \frac{\text{CurrentValue}(S)}{\sum_{S'} \text{CurrentValue}(S')} \times 100$$
   $$\text{TotalStrategyEquity} = \sum_{S} \text{CurrentValue}(S) + \text{Cash}_{\text{total}}$$

4. **Immutable Attribution Tranches**:
   Each position preserves an `attribution` array retaining individual lot tranches:
   ```json
   [
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
   ]
   ```

## CLI Usage

### 1. Offline Deterministic Mode
Blend local `AccountHoldingsSnapshot` JSON files:
```bash
node .agents/skills/holding-blender/scripts/holding_blender.js \
  --snapshots accounts/angelone.json accounts/indmoney_us.json \
  --base-currency INR \
  --fx USDINR=87.20 \
  --out reports
```

### 2. Strategy Manifest Mode
Resolve assigned accounts from `config/investment_ways.yaml` and blend automatically:
```bash
node .agents/skills/holding-blender/scripts/holding_blender.js \
  --way fundamental_lts \
  --manifest config/investment_ways.yaml \
  --out reports
```

## Generated Artifacts

- **JSON Contract**: `reports/strategies/<way_id>_blended_holdings.json` (validates against `strategy-holdings-blended.schema.json`).
- **Offline HTML Dashboard**: `reports/strategies/<way_id>_blended_holdings.html` (interactive lot attribution drawers with zero external network requests).

