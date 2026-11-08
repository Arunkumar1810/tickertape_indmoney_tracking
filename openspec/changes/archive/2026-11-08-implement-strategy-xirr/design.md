# Design

## Context

Calculating investment returns in a multi-account, multi-broker setup (e.g. Angel One for domestic Indian equities and INDmoney for US fractional shares) cannot rely on broker-internal CAGR or simple time-weighted return metrics. Broker calculations omit cash balance drag, ignore external bank transfer timing, and treat cross-account transfers as new capital or withdrawals.

Following the architecture approved in AID-BMAD-MODULAR-STOCK-V1 and Story 4.1 (`holding-blender`), Story 4.2 implements the **Choice B: True Strategy XIRR** engine. It aggregates external boundary capital cash flows across all accounts assigned to an Investment Way, cancels internal transfers, normalizes multi-currency flows to base currency, applies a robust Newton-Raphson solver with bounded bisection fallback, enforces a sub-90-day annualization guardrail, and audits friction costs (brokerage, STT, currency conversion drag, and taxes).

## Goals / Non-Goals

**Goals:**
- Provide a pure mathematical strategy XIRR engine that operates deterministically on multi-account ledger and cashflow data.
- Detect and cancel internal inter-account capital transfers within the same strategy boundary.
- Support multi-currency cash flow conversion into strategy base currency (e.g., USD to INR) with attribution preservation.
- Incorporate terminal portfolio valuation ($V_{\text{terminal}} = \text{TotalStrategyEquity}$) from blended holdings (`StrategyHoldingsBlended`).
- Enforce the sub-90-day guardrail to suppress misleading annualized compounding figures on short holding periods.
- Itemize friction components (brokerage, STT, FX drag, regulatory taxes) and compute total friction drag percentage.
- Emit a canonical `StrategyXirrReport` draft-07 JSON contract and a 100% offline self-contained HTML audit dashboard with zero external assets.
- Support Pattern C dual-mode execution (offline static files via CLI flags and autonomous `--way <way_id>` execution).

**Non-Goals:**
- Real-time streaming order updates or intraday P&L calculation.
- Automated bank API syncing or automated withdrawal initiation.
- Modification of existing broker ledger raw formats.

## Decisions

### 1. External Boundary Cashflow Isolation & Internal Transfer Netting
- **Decision**: Only external boundary transactions (deposits from investor bank accounts, withdrawals to investor bank accounts, external dividends) constitute strategy-level cash flows. When funds move between two accounts assigned to the same Investment Way (e.g. Angel One $\rightarrow$ INDmoney US), the matching outbound withdrawal and inbound deposit cancel out ($net = 0$).
- **Rationale**: Internal transfers do not represent external capital injections or liquidations; counting them would artificially dilute or inflate the investor's true internal rate of return.
- **Alternatives Considered**: Account-isolated XIRR (averaging broker CAGRs). Rejected because it fails to capture idle cash drag and cross-account capital rebalancing.

### 2. Multi-Currency Normalization to Strategy Base Currency
- **Decision**: All non-base currency transactions (e.g. USD deposits, dividends, or fees in INDmoney) are converted to base currency (INR) using transaction-date or configured exchange rates prior to solving.
- **Rationale**: Cashflows in different currencies cannot be discounted in the same polynomial without introducing currency exchange distortion.
- **Alternatives Considered**: Calculating dual-currency independent XIRRs. Rejected because the strategy's overall capital compounding must be measured from the investor's domestic base currency perspective.

### 3. Newton-Raphson Numerical Engine with Bisection Fallback
- **Decision**: Solve $\sum_{i=1}^M \frac{\text{CF}_i}{(1 + r)^{d_i}} = 0$ using Newton-Raphson iteration with analytical first derivatives. If convergence stalls ($|f'(r)| < 1e-12$) or iterates oscillate outside $[-0.9999, 10.0]$, fall back to bounded bisection.
- **Rationale**: Newton-Raphson converges quadratically within 5–10 iterations for standard cashflow profiles, while bounded bisection guarantees a solution even for irregular sign alternating cashflows.
- **Alternatives Considered**: Secant method or fixed-point iteration. Rejected due to slower convergence and vulnerability to local extrema.

### 4. Sub-90-Day Annualization Guardrail
- **Decision**: If $t_{\text{terminal}} - t_0 < 90\text{ days}$, set `is_sub_annual: true`, `xirr_annualized: null`, `xirr: null`, and calculate `absolute_return`.
- **Rationale**: Annualizing short-duration returns produces absurd, hyper-inflated figures (e.g., 2% return over 7 days yields $>180\%$ annualized XIRR).
- **Alternatives Considered**: Always reporting annualized XIRR with a disclaimer. Rejected because downstream automated filters could misinterpret the distorted rate as actual historical performance.

### 5. Itemized Friction Drag Breakdown
- **Decision**: Calculate friction drag as both currency amounts itemized by category (`brokerage`, `stt`, `fx_drag`, `taxes_and_charges`) and as a drag percentage: $\text{FrictionDragPct} = \text{GrossReturn} - \text{NetReturn}$.
- **Rationale**: Investors need transparency into how much compounding power is eroded by broker commissions, regulatory taxes, and cross-border currency conversion markups.

### 6. Architectural File Structure
```
.agents/
  shared/
    framework/
      schemas/strategy-xirr.schema.json
      contract_validator.js (export validateStrategyXirr)
      artifact_harness.js (register schemaType: 'strategy-xirr')
  skills/
    strategy-xirr/
      SKILL.md
      scripts/
        strategy_xirr.js (pure mathematical engine + Pattern C CLI)
        lib/
          xirr_math.js (numerical solver)
          ledger_aggregator.js (internal transfer cancellation & FX)
          friction_tracker.js (itemized friction calculator)
      assets/
        strategy-xirr-template.html (offline self-contained template)
      tests/
        strategy_xirr.test.js (unit & E2E tests)
        fixtures/
          sample_angelone_ledger.json
          sample_indmoney_ledger.json
          sample_blended_holdings.json
```

## Risks / Trade-offs

- **[Risk: Floating point instability in high-rate or near-bankruptcy scenarios]**  
  $\rightarrow$ **Mitigation**: Constrain discount rate search interval to $[-0.9999, 10.0]$ with bisection fallback and clamp bounds.
- **[Risk: Timestamp discrepancies and timezone mismatch between Indian Demat and US Brokerage]**  
  $\rightarrow$ **Mitigation**: Normalize all cashflow timestamps to UTC date strings (`YYYY-MM-DD`) and compute day differences using $365.25$ days/year baseline.
- **[Risk: Unmatched internal transfers due to bank transit delays]**  
  $\rightarrow$ **Mitigation**: Match internal transfers by category flag (`INTERNAL_TRANSFER`) or fuzzy amount matching within a 3-day transit window; unmatched flows default to external boundary flows with an audit warning.

