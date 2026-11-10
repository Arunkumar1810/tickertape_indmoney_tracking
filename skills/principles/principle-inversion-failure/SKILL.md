---
name: principle-inversion-failure
description: Charlie Munger Inversion & Terminal Failure Mode Evaluation Engine. Inverts the investment thesis to identify how a business dies over 10 years (customer/product concentration fragility, debt wall vulnerability, commodity margin collapse, and obsolescence risk).
---

# principle-inversion-failure

Charlie Munger Inversion & Terminal Failure Mode Evaluation Engine.

> *“Invert, always invert: Turn a situation or problem upside down. What happens if all our plans go wrong? Where don't we want to go, and how do you get there? Instead of looking for success, look for failure.”* — Charlie Munger

## Overview
Evaluates the durability and vulnerability of a business model by testing how it could fail over a 10-year horizon across four critical stress dimensions:
1. **Solvency & Balance Sheet Debt Wall**: High leverage ($> 3.0\times$ Debt/EBITDA or Debt/Equity $> 1.5$) under a credit crunch.
2. **Margin Deterioration & Fixed Cost Burden**: Operating margin vulnerability and sensitivity to demand shocks.
3. **Cash Burn & Reinvestment Trap**: Free cash generation vs. debt servicing obligations.
4. **Commoditization & Replacement Fragility**: Low asset turnover paired with thin margins indicating a price-taker.

## CLI Usage

```bash
# Evaluate by ticker:
node skills/principles/principle-inversion-failure/scripts/evaluate_inversion.js --ticker INFY

# Evaluate from file:
node skills/principles/principle-inversion-failure/scripts/evaluate_inversion.js --data reports/financials/INFY.json
```
