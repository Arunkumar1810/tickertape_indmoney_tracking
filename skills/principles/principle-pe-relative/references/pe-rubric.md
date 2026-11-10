# P/E Multiple Relative Valuation & PEG Rubric

Evaluates Price-to-Earnings (P/E) multiple against industry benchmarks, historical trading bands, and growth rate (PEG), matching the Digital Buffett financial tools.

## Valuation Signal Rules

| Condition | Valuation Signal | Status | Score |
|---|---|---|---|
| $\text{P/E} < \text{Historical Min} \times 0.8$ | UNDERVALUED | PASS | 100 |
| $\text{P/E} < \text{Industry Avg} \times 0.9$ | ATTRACTIVE | PASS | 80 |
| $\text{Within Range}$ | NEUTRAL | PASS | 50 |
| $\text{P/E} > \text{Industry Avg} \times 1.1$ | EXPENSIVE | WARN | 30 |
| $\text{P/E} > \text{Historical Max} \times 1.2$ | OVERVALUED | FAIL | 0 |

## PEG Ratio

$$\text{PEG Ratio} = \frac{\text{Current P/E}}{\text{Earnings Growth Rate} \times 100}$$

- $\text{PEG} < 1.0$: Compelling growth value
- $1.0 \le \text{PEG} \le 1.5$: Fair valuation
- $\text{PEG} > 2.0$: Growth priced at high premium

