---
name: fundamental-us-stock-analysis
description: 'Rigorous value-investing fundamental and forensic audit of US stocks using Tickertape Pro. Use when the user says ''analyze US stock'', ''fundamental analysis of [US ticker]'', ''value US stock'', ''research US stock'', or ''run US investment committee on [ticker]''.'
---

# Fundamental US Stock Analysis

Evaluate US companies (NYSE/NASDAQ) using value-investing principles (Graham, Buffett, Munger, Lynch, Klarman) augmented with US GAAP forensic and SEC governance audits. Ignore short-term momentum and price speculation; focus exclusively on business economics, capital allocation efficiency, and a strict margin of safety.

## Execution Rules

1. **Deterministic Financial Math**: Never calculate multi-step arithmetic within raw language weights. Use `node {skill-root}/scripts/calculate_us_valuation.js` to compute Graham numbers, NNWC, Owner Earnings, 5-step DuPont ROE decomposition, Altman Z-scores, and leverage ratios. State all company financials in USD ($ Millions or Billions), share prices in $, and ratios explicitly labelled.
2. **Tickertape US Pro Data Retrieval**: Run `node {skill-root}/scripts/fetch_us_stock_fundamentals.js --ticker <SYMBOL>` to fetch real-time financials (income statements, balance sheets, cash flows), overview metrics, analyst consensus, and valuation multiples.
3. **Citations**: Every financial figure, ratio, and statement extract must carry an inline citation pointing to its exact source filing or platform (e.g., *[10-K FY25]*, *[10-Q Q3]*, *[SEC Filing]*, or *[Tickertape US]*).
4. **Devil's Advocate Stance**: Actively critique optimistic assumptions. Detail why a seemingly cheap multiple may represent a secular value trap or technological disruption.

## US Market Forensic & Governance Checks

Before performing valuation, audit the company against US market structural risks:

- **Stock-Based Compensation (SBC) Dilution**: Compare SBC against operating cash flow. If SBC exceeds 15% of operating cash flow, subtract it directly when calculating true Owner Earnings to account for economic shareholder dilution.
- **Share Repurchase Quality**: Audit whether share buybacks were executed below intrinsic value or merely offset executive dilution at peak cycle multiples.
- **Goodwill & Intangible Bloat**: Evaluate Goodwill as a percentage of Total Assets. Any level exceeding 35% with decelerating acquired revenue indicates high impairment risk.
- **Debt Maturity Cliff**: Audit the proportion of total debt maturing within the next 24 months in a higher-for-longer interest rate environment.
- **Revenue Recognition & Days Sales Outstanding (DSO)**: Flag DSO expansion exceeding 15% YoY while revenue growth is slowing, which signals aggressive channel stuffing.

## Core Value Investing Analytical Framework

Evaluate the business across five foundational value pillars using metrics computed by `calculate_us_valuation.js`:

1. **Graham Downside Protection**: Compare current market price (CMP) against Net-Net Working Capital ($\text{NNWC} = \text{Cash} + 0.75 \times \text{Receivables} + 0.50 \times \text{Inventory} - \text{Total Liabilities}$), Graham Number liquidating floor ($\sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$), and tangible book value per share.
2. **Buffett-Munger Compounding (US GAAP)**: Verify Owner Earnings ($\text{CFO} - \text{Maintenance CapEx} - \text{SBC}$) are positive and compounding. Verify that ROIC and Return on Capital Employed exceed 15% across a multi-year trend. Run a 5-step DuPont analysis to ensure ROE growth is driven by operating efficiency and margins rather than leverage.
3. **Lynch Growth & Operational Health**: Calculate the PEG ratio ($\text{PE} / \text{EPS Growth Rate}$). Flag inventory or accounts receivable growth that outpaces revenue growth by more than 5 percentage points.
4. **Klarman Risk & Solvency**: Ensure Net Debt / EBITDA is under 2.5x and Interest Coverage ($\text{EBIT} / \text{Interest Expense}$) exceeds 4.0x. Compute the Altman Z-score ($> 2.99$ Safe, $1.81 - 2.99$ Grey, $< 1.81$ Distress). Verify accrual quality ($\text{CFO} \ge \text{Net Income}$).
5. **Tickertape Valuation & Peer Multiples**:
   - P/E (TTM), Forward P/E, P/B, EV/EBITDA, and Price/Sales vs 5-year historical median.
   - Street consensus (target price upside/downside, buy/hold/sell recommendations).
   - Peer comparison against sector leaders.

## Output Schema

Render the final valuation report following the template at `{skill-root}/assets/report-template.md`. Populate all tables with metrics computed by `calculate_us_valuation.js` and retrieved by `fetch_us_stock_fundamentals.js`.
