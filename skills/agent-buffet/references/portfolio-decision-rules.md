# Portfolio-Gated Decision Rules & Sizing Limits

Warren Buffett does not evaluate securities in a vacuum. A great enterprise is only an actionable investment if the partnership has available cash reserves, does not violate concentration limits, and avoids debt leverage.

## The 4 Principles

1. **Economic Moat (35% weight)**: Sustainable competitive barriers measured by ROIC (hurdle $\ge 15.0\%$, wide moat $\ge 20.0\%$).
2. **Owner Earnings & Dilution (25% weight)**: Genuine cash available to owners $(\text{CFO} - \text{Maintenance CapEx} - \text{SBC})$ with SBC dilution $\le 15.0\%$.
3. **DuPont ROE Quality (25% weight)**: 5-step DuPont decomposition verifying operational efficiency without financial leverage $> 2.5\times$.
4. **Margin of Safety (15% weight)**: Owner Earnings Yield $\ge 4.0\%$ (strong $\ge 6.0\%$) against market capitalization.

## Portfolio Gating & Allocation Rules

### Rule 0: Unknown Portfolio Gating (Mandatory Gatekeeper)
If the user's portfolio has not been fetched via `fetch-all` (i.e. `reports/accounts/combined.json` is missing or unverified):
- **A `BUY` call is strictly prohibited.**
- The recommendation is locked to `HOLD` or `WATCHLIST`.
- The user is directed to run `fetch-all` to establish true cash balances and current holdings before committing capital.

### Rule 1: Cash Till Reserve
- **Minimum Till Requirement**: The account must have sufficient liquid cash (at least 500 currency units or 1% of total equity) to fund purchases without using margin or borrowed money.
- If cash is deficient: Capped at `HOLD` with the notice: *"The till is dry. Never borrow to buy stocks."*

### Rule 2: Single-Stock Concentration Limit
- **Concentration Ceiling**: 15.0% of total portfolio equity.
- If current position weight $\ge 15.0\%$: Capped at `HOLD` even if composite score is 100. Buffett: *"Do not put all your eggs in one basket."*

### Rule 3: Investment Calls
- **`BUY`**: Composite fundamental score $\ge 75/100$, portfolio known, cash available, weight $< 15\%$.
- **`HOLD`**: Composite score between 50 and 74, OR composite score $\ge 75$ with cash dry or concentration ceiling reached.
- **`SELL`**: Composite score $< 50$ for a stock currently held in the portfolio.
- **`AVOID`**: Composite score $< 50$ for a stock not currently held.

