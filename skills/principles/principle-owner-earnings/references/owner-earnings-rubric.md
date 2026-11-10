# True Owner Earnings & Dilution Quality Rubric

Warren Buffett defined Owner Earnings in Berkshire Hathaway's 1986 letter to shareholders as the authentic cash available to owners net of necessary reinvestment.

## Formula

$$\text{True Owner Earnings} = \text{Operating Cash Flow} - \text{Maintenance CapEx} - \text{Stock-Based Compensation}$$

$$\text{SBC Dilution \%} = \frac{\text{Stock-Based Compensation}}{\text{Operating Cash Flow}} \times 100$$

## Hurdle Rates & Classification

| Condition | Classification | Status | Principle Score |
|---|---|---|---|
| True OE $> 0$ and $\text{SBC Dilution} \le 5.0\%$ | Pristine Cash Conversion | PASS | 100 |
| True OE $> 0$ and $5.0\% < \text{SBC Dilution} \le 15.0\%$ | Acceptable Dilution | PASS | 75 |
| True OE $> 0$ and $15.0\% < \text{SBC Dilution} \le 25.0\%$ | Elevated Dilution Drag | WARN | 35 |
| True OE $> 0$ and $\text{SBC Dilution} > 25.0\%$ | Severe SBC Dilution | FAIL | 0 |
| True OE $\le 0$ | Negative Owner Earnings / Cash Drain | FAIL | 0 |

Broad-market index ETFs (e.g. VOO, SPY, QQQ) automatically pass with a score of 100 due to natural basket diversification.

