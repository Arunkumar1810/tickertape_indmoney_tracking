# Design

## Context

Story 1.1 established `.agents/shared/framework/` with the declarative manifest schema (`investment-ways-manifest.schema.json`) and partition validator (`manifest_validator.js`). Story 1.2 adds the data-plane schemas that decouple Tier 2 Market Data Providers from Tier 3 Analysis Principles (`NormalizedCompanyFinancials`) and Tier 3 Analysis Principles from Tier 4 Investment Way Orchestrators (`UniformVerdictContract`).

See `proposal.md` for motivation and `specs/framework/financials-verdict-schemas/spec.md` for normative requirements.

## Goals / Non-Goals

**Goals:**
- Provide formal draft-07 JSON Schema files for `NormalizedCompanyFinancials` and `UniformVerdictContract` (single and Option C consolidated batch formats).
- Provide zero-dependency programmatic and CLI validation in `.agents/shared/framework/contract_validator.js` that enforces both structural types and cross-field semantic invariants.
- Support both Indian (Ind AS / ₹) and US (US GAAP / $) equities as well as passive Index ETFs (`is_index_etf: true`).

**Non-Goals:**
- HTML report structure validation (covered in Story 1.3: Universal 1-JSON + 1-HTML Verification Harness).
- Live Tickertape API fetching or transformation (covered in Epic 2 Story 2.3).
- Valuation formula computation (covered in Epic 3 Stories 3.1–3.5).

## Decisions

### 1. Unified Cross-Market `NormalizedCompanyFinancials` Schema
- **Decision**: Structure `NormalizedCompanyFinancials` into 6 explicit top-level domains:
  1. Top-level identity (`ticker`, `name`, `exchange`, `market` in `["IN", "US"]`, `currency` in `["INR", "USD"]`, `unit_scale`, `sector`, `industry`, `timestamp`, `is_index_etf`, `source_provider`).
  2. `market_data` (`cmp`, `market_cap`, `shares_outstanding`, `eps_ttm`, `bvps`, `pe_ttm`, `pb_ttm`, `ev_ebitda`, `dividend_yield_pct`, `beta`, `historical_pe_5y_median`, `historical_pb_5y_median`, `eps_growth_5y_cagr_pct`, `revenue_growth_5y_cagr_pct`).
  3. `income_statement` (`revenue`, `ebitda`, `ebit`, `interest_expense`, `ebt`, `tax_expense`, `net_income`, `eps`).
  4. `balance_sheet` (`cash_and_equivalents`, `accounts_receivable`, `inventory`, `total_current_assets`, `goodwill`, `intangible_assets`, `total_assets`, `short_term_debt`, `long_term_debt`, `total_debt`, `debt_maturing_24m`, `total_current_liabilities`, `total_liabilities`, `retained_earnings`, `total_equity`).
  5. `cash_flow` (`operating_cash_flow`, `capital_expenditure`, `maintenance_capex`, `free_cash_flow`, `stock_based_compensation`, `dividends_paid`, `share_repurchases`).
  6. `forensics` (`promoter_holding_pct`, `promoter_pledge_pct`, `promoter_holding_qoq_delta_pct`, `related_party_transactions_pct`, `auditor_resignation_flag`, `qualified_opinion_flag`, `beneish_m_score`, `sloan_accrual_ratio`, `dso_yoy_expansion_pct`, `inventory_growth_vs_sales_delta_pct`, `surveillance_stage`).
- **Rationale**: Grouping metrics into canonical financial statement blocks prevents flat-namespace collisions and gives every Tier 3 pillar (`graham`, `lynch`, `buffett_munger`, `klarman_solvency`, `forensic_governance`) exact, predictable field paths regardless of whether the stock is Indian or US.
- **Alternatives considered**:
  - *Separate schemas for IN and US equities*: Rejected because Invariant 3 requires Tier 3 analysis principles to be market-agnostic calculation engines operating over a single normalized schema.

### 2. Semantic Invariants on `UniformVerdictContract`
- **Decision**: Enforce strict partition of stances by `principle`:
  - Gatekeeper (`forensic_governance`): `stance` must be in `["PASS", "FLAG", "VETO_DISQUALIFIED"]`, and `is_veto` must equal `(stance === "VETO_DISQUALIFIED")`.
  - Valuation pillars (`graham`, `lynch`, `buffett_munger`, `klarman_solvency`): `stance` must be in `["STRONG_BUY", "BUY", "HOLD", "REDUCE", "STRONG_SELL"]`, and `is_veto` must be `false`.
- **Rationale**: Prevents accidental veto short-circuiting by a valuation pillar or an unflagged veto by the gatekeeper, guaranteeing deterministic behavior in the Epic 4 Asymmetric Downside Guardrail engine.

### 3. Option C Consolidated Batch Schema Support
- **Decision**: Support both single-ticker `UniformVerdictContract` objects and consolidated portfolio batch envelopes (`{ principle, timestamp, verdicts: [...] }`) in `uniform-verdict.schema.json` and `contract_validator.js`.
- **Rationale**: Aligns directly with Option C (`AID-BMAD-MODULAR-STOCK-V1` Section 4.2), where each Tier 3 skill emits a consolidated `<principle>_portfolio_verdicts.json` when run across a portfolio.

## Risks / Trade-offs

- **[Risk] Missing vendor metrics for newly listed companies or Index ETFs** → **Mitigation**: Allow optional/nullable secondary fields within statement blocks while strictly enforcing core identity and price fields (`cmp`, `shares_outstanding` for equities), and relax statement requirements when `is_index_etf: true`.

## Migration Plan

1. Add `.agents/shared/framework/schemas/normalized-company-financials.schema.json`.
2. Add `.agents/shared/framework/schemas/uniform-verdict.schema.json`.
3. Implement `.agents/shared/framework/contract_validator.js` and export from `.agents/shared/framework/index.js`.
4. Add unit and CLI tests in `.agents/shared/framework/tests/contract_validator.test.js`.

