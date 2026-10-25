---
name: fundamental-stock-analysis
description: 'Rigorous value-investing fundamental and forensic audit of Indian stocks using Tickertape Pro. Use when the user says "analyze stock", "fundamental analysis", "value valuation report", "research stock", or "run investment committee on [ticker]".'
---
# Fundamental Stock Analysis

Evaluate Indian companies (NSE/BSE) using value-investing principles (Graham, Buffett, Munger, Lynch, Klarman) augmented with Indian forensic and corporate governance checks. Ignore short-term momentum and price speculation; focus exclusively on business economics, capital allocation efficiency, and a strict margin of safety.

## Execution Rules

1. **Deterministic Financial Math**: Never calculate multi-step arithmetic within raw language weights. Use `node {skill-root}/scripts/calculate_valuation.js` to compute Graham numbers, NNWC, Owner Earnings, 5-step DuPont ROE decomposition, and leverage ratios. State all company financials in INR ₹ Crores (₹ Cr), share prices in ₹, and ratios explicitly labelled.
2. **Tickertape Pro Data Retrieval**: Run `node {skill-root}/scripts/fetch_stock_fundamentals.js --ticker <SYMBOL>` to fetch real-time financials, scorecards, Tickertape Pro checklists, analyst consensus readings, Tickertape Special readings, and peer multiples. For detailed field mappings, read `references/tickertape-pro-metrics.md`.
3. **Citations**: Every financial figure, ratio, and statement extract must carry an inline citation pointing to its exact source filing or platform (e.g., *[Annual Report FY25]*, *[Q4 Results]*, *[SEBI Disclosure]*, or *[Tickertape Pro]*).
4. **Devil's Advocate Stance**: Actively critique optimistic assumptions. Detail why a seemingly cheap P/E multiple may represent an un-investable value trap.

## Indian Market Forensic & Governance Checks

Before performing valuation, audit the company against Indian market structural risks:

- **Promoter Share Pledging**: Check the proportion of promoter holdings pledged as collateral. Any pledge level exceeding `{workflow.promoter_pledge_max_pct}` (default 20%) is a critical red flag.
- **Promoter Holding Trend**: Audit sequential quarter-on-quarter (QoQ) promoter shareholding changes for unannounced dilution or distress.
- **Related-Party Transactions (RPTs)**: Audit notes to accounts for loans, advances, guarantees, or trade with promoter-owned group companies not conducted at arm's length.
- **Auditor Stability & Qualifications**: Audit statutory auditor credentials and tenure. Flag mid-year resignations, frequent auditor churn, or qualified opinions.
- **Tickertape Pro Surveillance & Credit Flags**: Verify ASM / GSM surveillance lists, unsolicited stock tip circulation, and the 12-month Default Probability score (`IC006`).

## Core Value Investing Analytical Framework

Evaluate the business across five foundational value pillars using metrics computed by `calculate_valuation.js`:

1. **Graham Downside Protection**: Compare current market price (CMP) against Net-Net Working Capital (NNWC), Graham Number liquidating floor, and tangible book value.
2. **Buffett-Munger Compounding (Ind AS)**: Verify Owner Earnings (CFO - Maintenance CapEx) are positive and growing. Ensure ROIC and ROCE exceed `{workflow.roce_min_pct}` (default 15%) across a 5-year trend. Run a 5-step DuPont analysis to ensure ROE growth is driven by operating efficiency and margins rather than financial leverage.
3. **Lynch Growth & Inventory**: Calculate the PEG ratio ($\text{PE} / \text{Earnings Growth Rate}$). Flag inventory-to-revenue divergence exceeding 5 percentage points.
4. **Klarman Risk & Solvency**: Ensure Net Debt / EBITDA is under `{workflow.net_debt_ebitda_max}` (default 2.5x) and Interest Coverage exceeds `{workflow.interest_coverage_min}` (default 4.0x). Verify accrual quality ($\text{CFO} \ge \text{Net Income}$).
5. **Tickertape Scorecard & Sentimental Analysis**:
   - **6-Pillar Scorecard**: Profitability (1-10), Valuation (1-10), Growth (1-10), Performance (1-10), Entry Point (`IC004`), and Red Flags (`IC005`).
   - **4 Layers of Sentiment**: Sell-side analyst recommendations (`breco`, `hreco`, `sreco`, `upside`), smart money ownership trends (FII/DII net flows), credit/default sentiment (`IC006`), and unsolicited tipster circulation.
   - **5 Tickertape Special Proprietary Rankings**: Value Momentum Rank (`vmRank`), Price Momentum Rank (`pmRank`), Earnings Quality Rank (`erqr`), Price to Intrinsic Value Rank (`ptir`), and Fundamental Score (`fundamental`).

## Output Schema

Render the final valuation report following the template at `{skill-root}/assets/report-template.md`. Populate all tables with metrics computed by `calculate_valuation.js` and retrieved by `fetch_stock_fundamentals.js`. To customize thresholds or output paths, invoke the `bmad-customize` skill.
