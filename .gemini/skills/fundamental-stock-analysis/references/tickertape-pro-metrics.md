# Tickertape Pro Parameters, Scorecard & Sentimental Analysis Reference

## 1. Tickertape Special Proprietary Readings
Tickertape Special metrics are institutional-grade quantitative scores developed by Tickertape (source: [Learn by Tickertape - Tickertape Special](https://www.tickertape.in/knowledge-base/modules/evaluating-stocks/tickertape-special)) ranking Indian equities on a percentile basis (0–100) or 1–10 scale:

| Metric | Field Key | Scale | Description & Analytical Value |
|---|---|---|---|
| **Value Momentum Rank** | `vmRank` | 0 – 100 Percentile | Combines valuation (discount vs historical & industry expectations) with 3–12M price momentum. Separates genuine undervalued bargains from fundamentally broken value traps. |
| **Price Momentum Rank** | `pmRank` | 0 – 100 Percentile | Percentile ranking against all Indian equities based on 12-month historical price strength and relative strength vs sector peers. |
| **Earnings Quality Rank** | `erqr` | 0 – 100 Percentile | Evaluates earnings sustainability, accruals, operating cash flow conversion ($\text{CFO} / \text{EBITDA}$), asset turnover efficiency, and margin stability. High ERQR indicates real, repeatable earnings. |
| **Price to Intrinsic Value Rank** | `ptir` | 0 – 100 Percentile | Percentile ranking based on the ratio of market price to calculated intrinsic value (DCF & dividend models). Higher rank denotes deeper discount to intrinsic value. |
| **Fundamental Score** | `fundamental` | 1 – 10 Score | Sector-relative composite score ranking the stock against peers across 5 core pillars: valuation, profitability, market share growth, financial health, and earnings momentum. |

## 2. Tickertape 6-Pillar Scorecard Architecture
The Tickertape Scorecard provides a structured overview of company health across 6 core pillars with qualitative tags and color coding (`green` = strong, `yellow` = neutral, `red` = concern):

| Scorecard Pillar | Score / Tag | Underlying Granular Metrics & Flags |
|---|---|---|
| **Profitability** | 1 – 10 Score (`green`/`red`) | Return on Equity (ROE), Net Profit Margin, Cash Flow Margin |
| **Valuation** | 1 – 10 Score (`green`/`red`) | Price to Earnings (TTM P/E), Price to Book (P/B), Price to Cash Flow (P/CFO) |
| **Growth** | 1 – 10 Score (`green`/`red`) | 3Y Historical Revenue CAGR, 3Y Cash Flow CAGR, 3Y EPS Growth |
| **Performance** | 1 – 10 Score (`green`/`red`) | Absolute Return (YTD / 1Y), Annualised Return (5Y CAGR), Expected Return Forecast |
| **Entry Point** | Tag (`Good` / `Bad`) | **Fundamentals** (CMP vs calculated Intrinsic Value) + **Technicals** (Overbought vs Oversold zone) |
| **Red Flags** | Risk Level (`Low` / `High`) | SEBI ASM / GSM list inclusion, Promoter Pledged Holding %, Unsolicited Tipster Messages, and 12M Default Probability |

## 3. Business & Market Sentimental Analysis
Tickertape aggregates multi-layered sentiment across sell-side institutions, corporate credit markets, institutional capital flows, and retail circulation:

| Sentiment Layer | Source / Metric | Metrics & Sentiment Signals |
|---|---|---|
| **Analyst & Brokerage Sentiment** | `breco`, `hreco`, `sreco`, `nBreco`, `totalAnalysts`, `upside` | - **Consensus Stance**: Buy / Hold / Sell percentage distribution across covered brokerage desks.<br>- **Price Target Sentiment**: Median 12M target upside or downside percentage vs CMP.<br>- **Forward EPS Trajectory**: 12-month forward consensus EPS growth rate (`12mEpsg`). |
| **Smart Money / Ownership Sentiment** | `in_stock_ownership_read` | - **FII Sentiment**: Foreign Institutional Investor quarterly stake accumulation vs exit trends.<br>- **DII / Mutual Fund Sentiment**: Domestic mutual fund net buying and continuous allocation.<br>- **Promoter Conviction**: Net insider stake changes and reduction of pledge encumbrances. |
| **Credit & Solvency Sentiment** | `IC006 Default Probability` | Synthesizes credit yield spreads, bond market perception, financial health ratios, and NLP-analyzed sentiment from corporate disclosures and news filings to flag 12-month default risk. |
| **Retail & Tipster Sentiment** | `scorecard.redFlag` | Monitors circulation of unsolicited SMS, WhatsApp, and Telegram stock tips attempting artificial retail volume pump-and-dump manipulation. |

## 4. Tickertape Pro Core Checklists
Automated institutional pass/fail checklists:
- **`IC001 Intrinsic Value`**: Checked when Current Market Price (CMP) is strictly below computed Intrinsic Value.
- **`IC002 ROE vs FD Rates`**: Checked when 5Y average ROE exceeds standard risk-free bank fixed deposit rates.
- **`IC003 Dividend Returns`**: Validates consistent dividend payouts and attractive yield across cycles.
- **`IC004 Entry Point`**: Checked when stock is neither overvalued nor in an overbought technical zone.
- **`IC005 No Red Flags`**: Validates absence of ASM/GSM surveillance, zero high promoter pledges, and clean governance.
- **`IC006 Default Probability`**: 12-month credit risk assessment (<0.1% for high investment grade).
- **`IC007 Quality Check Score`**: Decile ranking evaluating leverage, 5Y ROE stability, and operational moat.
- **`IC008 Growth Score`**: Expansion of top-line and bottom-line earnings relative to market cap peers.

## 5. Mandatory Indian Market Forensic Checks
Before completing any valuation, rigorously audit structural Indian corporate risks:
1. **Promoter Pledging**: Pledged shares $> 20\%$ of promoter holding is a **CRITICAL RED FLAG**.
2. **Promoter Holding Trend**: Trace sequential QoQ changes; investigate whether drops represent distress sales or institutional OFS.
3. **Related-Party Transactions (RPTs)**: Audit notes to accounts for promoter group entity loans, advances, or royalty leaks.
4. **Auditor Stability & Opinions**: Verify statutory auditor tenure, qualifications, or mid-year resignations.
