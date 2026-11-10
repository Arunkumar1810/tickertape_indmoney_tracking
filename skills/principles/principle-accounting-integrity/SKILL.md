---
name: principle-accounting-integrity
description: Forensic accounting integrity and earnings manipulation detection engine. Evaluates Beneish M-Score, Sloan accrual ratio, Days Sales Outstanding (DSO) expansion, and inventory-to-sales velocity divergence.
---

# principle-accounting-integrity

Forensic accounting integrity engine detecting earnings manipulation, phantom revenue accruals, and non-cash earnings distortion.

## Core Formulae & Thresholds

### 1. Beneish M-Score
Econometric multivariate probability of earnings manipulation:
- $M \le -2.22$: Clean / Unmanipulated earnings
- $-2.22 < M \le -1.78$: Grey Zone / Elevated manipulation warning
- $M > -1.78$: **Critical Red Flag / High Probability of Earnings Manipulation (Hard Veto)**

### 2. Sloan Accrual Ratio
Measures the proportion of operating income driven by non-cash accounting accruals rather than real operating cash flow:
$$\text{Accrual Ratio} = \frac{\text{Net Income} - \text{Operating Cash Flow}}{\text{Average Total Assets}}$$
- $\le 0.10$: High earnings quality / Cash-backed income
- $0.10 - 0.25$: Moderate earnings distortion / Warning zone
- $> 0.25$: **Severe non-cash earnings distortion (Hard Veto)**

### 3. Operational Divergences
- **DSO Expansion**: YoY Days Sales Outstanding increase $> 20\%$ signals premature or aggressive revenue booking.
- **Inventory Outpacing Sales**: Inventory growth exceeding sales growth by $> 15\%$ signals potential channel-stuffing or unsold inventory buildup.

