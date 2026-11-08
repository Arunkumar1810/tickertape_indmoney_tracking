---
name: strategy-xirr
description: Pooled True Strategy XIRR Calculator and Friction Tracker for Tier 4 investment ways. Aggregates multi-account external bank cash deposits, withdrawals, and dividends, nets internal inter-account transfers, normalizes multi-currency flows to base currency, applies numerical Newton-Raphson solving with sub-90-day guardrails, and audits itemized friction drag (brokerage, STT, FX markups, and taxes). Emits canonical StrategyXirrReport and offline self-contained HTML audit dashboard.
license: Proprietary
compatibility: Node.js (>= 18.0.0)
metadata:
  tier: 4
  role: strategy_xirr_calculator
  author: Antigravity
---

# Pooled True Strategy XIRR Calculator & Friction Tracker

## Overview

The `strategy-xirr` skill implements Tier 4 **Choice B: True Strategy XIRR** under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`). When an Investment Way (such as `way-long-term-strategy`) manages multiple broker accounts (e.g. Angel One Indian Demat and INDmoney US brokerage accounts), `strategy-xirr` calculates portfolio-level performance by pooling external capital cash flows, cancelling internal transfers between assigned accounts, converting all flows to the strategy base currency, running a high-precision Newton-Raphson numerical solver, and providing a comprehensive itemized audit of friction costs.

## Mathematical Formulation

1. **Newton-Raphson XIRR Polynomial Equation**:
   Solves for $r_{\text{XIRR}}$ satisfying:
   $$\sum_{i=1}^{M} \frac{\text{CF}_i}{(1 + r_{\text{XIRR}})^{\frac{t_i - t_0}{365.25}}} + \frac{V_{\text{terminal}}}{(1 + r_{\text{XIRR}})^{\frac{t_{\text{terminal}} - t_0}{365.25}}} = 0$$
   Where:
   - $\text{CF}_i$: External bank cash deposits (negative outlay) and cash withdrawals (positive inflow) converted to base currency.
   - $t_i$: Calendar date of cashflow transaction.
   - $V_{\text{terminal}}$: Terminal portfolio equity (blended position market value + pooled liquid cash) from `StrategyHoldingsBlended`.
   - $t_{\text{terminal}}$: Cutoff evaluation date (`eval_date`).

2. **Internal Transfer Cancellation ($Net = 0$)**:
   When capital moves between two accounts bound to the *same* Investment Way (e.g., Demat payout $\rightarrow$ USD Brokerage deposit), the two transactions cancel out:
   $$\text{Outflow}_A + \text{Inflow}_B = 0$$
   Internal transfers do not represent external capital injections and are pruned to prevent return distortion.

3. **Sub-90-Day Annualization Guardrail**:
   If the holding duration $\Delta t = t_{\text{terminal}} - t_0 < 90\text{ days}$:
   - Annualization is suppressed: `is_sub_annual = true`, `xirr = null`, `xirr_annualized = null`.
   - The report displays absolute return: $\text{AbsoluteReturn} = \frac{V_{\text{terminal}} + \sum \text{Withdrawals} - \sum \text{Deposits}}{\sum \text{Deposits}} \times 100\%$.

4. **Itemized Friction Accounting**:
   $$\text{TotalFriction} = \text{Brokerage} + \text{STT} + \text{FX Drag} + \text{Regulatory Taxes}$$
   $$\text{FrictionDrag\%} = \text{GrossReturn\%} - \text{NetReturn\%}$$

## CLI Usage

### 1. Offline Deterministic Mode
Calculate Strategy XIRR from static account ledgers and blended holdings:
```bash
node .agents/skills/strategy-xirr/scripts/strategy_xirr.js \
  --ledgers accounts/angelone_ledger.json accounts/indmoney_ledger.json \
  --blended strategies/fundamental_lts/holdings_blended.json \
  --base-currency INR \
  --out strategies/fundamental_lts/ \
  --json-output
```

### 2. Autonomous Investment Way Mode
Automatically resolve assigned accounts from `config/investment_ways.yaml`, locate cached ledgers, and emit verified artifacts:
```bash
node .agents/skills/strategy-xirr/scripts/strategy_xirr.js \
  --way fundamental_lts \
  --out strategies/fundamental_lts/ \
  --json-output
```

## Contract Outputs
- `strategy_xirr.json`: Conforms to `StrategyXirrReport` draft-07 JSON Schema.
- `strategy_xirr.html`: 100% offline self-contained HTML audit dashboard with timeline waterfall, verified with zero external asset leaks.

