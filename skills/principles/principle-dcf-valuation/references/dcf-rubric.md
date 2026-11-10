# Gordon Growth DCF Intrinsic Valuation Rubric

Calculates forward cash flow intrinsic value and Margin of Safety using the Gordon Growth Model, matching the Digital Buffett financial tools.

## Formulas

$$\text{FCF}_1 = \text{FCF}_0 \times (1 + g)$$

$$\text{Intrinsic Value} = \frac{\text{FCF}_1}{r - g}$$

$$\text{Margin of Safety \%} = \frac{\text{Intrinsic Value} - \text{Market Cap}}{\text{Intrinsic Value}} \times 100$$

Where:
- $r$ = Discount rate (default: $10.0\%$ / 0.10)
- $g$ = Perpetual terminal growth rate (default: $2.5\%$ / 0.025)
- $\text{FCF}_0$ = True Owner Earnings $(\text{CFO} - \text{Maintenance CapEx} - \text{SBC})$

## Rating & Hurdle Scale

| Margin of Safety | Classification | Recommendation | Score |
|---|---|---|---|
| $\ge 20.0\%$ | Substantial Margin of Safety (Safe) | BUY | 100 |
| $10.0\% \le \text{MOS} < 20.0\%$ | Moderate Margin of Safety (Consider) | CONSIDER | 75 |
| $0.0\% \le \text{MOS} < 10.0\%$ | Minimal Margin of Safety (Hold) | HOLD | 50 |
| $< 0.0\%$ | Overvalued / Premium Multiple | AVOID | 0 |

