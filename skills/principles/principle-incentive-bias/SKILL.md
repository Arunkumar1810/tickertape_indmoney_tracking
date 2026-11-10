---
name: principle-incentive-bias
description: Charlie Munger Incentive Alignment & Governance Analysis Engine. Audits managerial incentives, stock-based compensation extraction, promoter skin-in-the-game, and capital allocation sanity.
---

# principle-incentive-bias

Charlie Munger Incentive Alignment & Governance Analysis Engine.

> *“I think I've been in the top 5% of my age cohort all my life in understanding the power of incentives, and all my life I've underestimated it. And never a year passes but I get some surprise that pushes my limit a little farther.”* — Charlie Munger

## Overview
Evaluates the human psychological forces and financial incentives governing corporate stewards:
1. **Equity Dilution & Option Extraction**: SBC as a percentage of operating cash flow ($> 15\%$ penalized, $> 25\%$ vetoed).
2. **Promoter Pledging / Financial Duress**: Pledged promoter holdings create margin call cascades.
3. **Capital Return Discipline**: Dividends and share repurchases funded from authentic free cash vs. debt-fueled distributions.
4. **Acquisitive Empire-Building**: Bloated goodwill indicating expensive M&A ego trips.

## CLI Usage

```bash
node skills/principles/principle-incentive-bias/scripts/evaluate_incentives.js --ticker INFY
```

