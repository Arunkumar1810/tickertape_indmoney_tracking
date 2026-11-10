---
name: principle-altman-z-score
description: Altman Z-Score and bankruptcy distress evaluation engine. Computes working capital, retained earnings, operating earnings, and equity capitalization relative to total liabilities to identify safe, grey, and distress zones.
---

# principle-altman-z-score

Evaluates the classic Altman Z-Score for non-financial corporations:
$$Z = 1.2 X_1 + 1.4 X_2 + 3.3 X_3 + 0.6 X_4 + 0.999 X_5$$
Where:
- $X_1 = \text{Working Capital} / \text{Total Assets}$
- $X_2 = \text{Retained Earnings} / \text{Total Assets}$
- $X_3 = \text{EBIT} / \text{Total Assets}$
- $X_4 = \text{Market Cap} / \text{Total Liabilities}$
- $X_5 = \text{Revenue} / \text{Total Assets}$

### Zones:
- **Safe Zone**: $Z > 2.99$ (Score 100)
- **Upper Grey Zone**: $2.50 \le Z \le 2.99$ (Score 75)
- **Lower Grey Zone**: $1.81 \le Z < 2.50$ (Score 45)
- **Distress Zone**: $Z < 1.81$ (Score 0)

