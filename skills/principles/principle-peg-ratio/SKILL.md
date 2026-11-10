---
name: principle-peg-ratio
description: Growth-At-A-Reasonable-Price (GARP) valuation engine computing Price/Earnings-to-Growth (PEG) ratio, yield-adjusted PEG, and fair value line. Evaluates multiple expansion against earnings momentum.
---

# principle-peg-ratio

Growth-At-A-Reasonable-Price (GARP) valuation engine establishing whether equity multiples are justified by earnings growth and dividend capital returns.

## Core Formulae

- **Classic PEG Ratio**: $\text{P/E} / g_{\text{EPS}}$
  - $\le 0.50$: Screaming bargain / high growth discount
  - $0.51 - 1.00$: Attractive valuation at reasonable price
  - $1.01 - 1.50$: Fairly valued growth
  - $1.51 - 2.00$: Valuation multiple stretch
  - $> 2.00$: Unfavorable growth valuation / excessive premium
- **Yield-Adjusted PEG Ratio**: $\text{P/E} / (g_{\text{EPS}} + \text{Dividend Yield})$
- **Fair Value Line**: $(g_{\text{EPS}} + \text{Dividend Yield}) \times \text{EPS}$

