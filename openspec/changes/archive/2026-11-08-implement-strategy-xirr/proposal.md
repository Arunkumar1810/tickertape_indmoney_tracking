# Proposal

## Why

In multi-account and multi-currency portfolio management, evaluating investment performance using individual broker-reported returns or simple point-in-point CAGR produces distorted and misleading compounding figures. Broker calculations ignore external bank timing, fail to account for cash drag in intermediate balances, and cannot reconcile cross-account capital transfers or currency conversion friction.

Tier 4 Investment Ways require a unified, multi-account True Strategy XIRR engine that aggregates irregular external bank deposits and withdrawals across all assigned accounts (Angel One and INDmoney US), cancels internal inter-account transfers, converts multi-currency cash flows to strategy base currency, applies numerical Newton-Raphson solving with sub-90-day guardrails, and provides an itemized audit of friction drag (brokerage, STT, currency conversion, taxes).

## What Changes

- Introduce `.agents/shared/framework/schemas/strategy-xirr.schema.json` defining the canonical `StrategyXirrReport` JSON Schema draft-07 (`strategy_id`, `timestamp`, `base_currency`, `eval_date`, `xirr`, `xirr_annualized`, `absolute_return`, `total_deposited`, `total_withdrawn`, `net_invested`, `terminal_equity`, `days_held`, `is_sub_annual`, `friction_breakdown`, `account_cashflows_summary`, `cashflows`).
- Update `.agents/shared/framework/contract_validator.js` and `artifact_harness.js` to register and validate `StrategyXirrReport` artifacts.
- Implement `.agents/skills/strategy-xirr/` skill containing:
  - `scripts/strategy_xirr.js`: Pure mathematical pooling engine, multi-account ledger aggregator, internal transfer cancellation, Newton-Raphson solver with bisection fallback, and friction drag accounting.
  - Pattern C dual-mode CLI supporting offline evaluation via `--ledgers <paths...>` and autonomous strategy execution via `--way <way_id>`.
  - `assets/strategy-xirr-template.html`: Offline self-contained HTML audit dashboard displaying capital timeline, cashflow waterfall, annualized XIRR KPI cards, and friction drag breakdown with zero external network leaks.
- Create comprehensive unit and end-to-end test suites verifying mathematical precision, internal transfer netting, sub-90-day guardrail behavior, and offline artifact self-containment.

## Capabilities

### New Capabilities
- `skills/strategy-xirr`: Calculates pooled multi-account True Strategy XIRR across domestic and foreign brokerage ledgers, netting internal capital transfers, converting cash flows to base currency, enforcing sub-90-day annualization guardrails, and itemizing friction drag (brokerage, STT, FX fees).

### Modified Capabilities
<!-- None -->

## Impact

- Dependent systems: Downstream Tier 4 Master Dashboard (`Option C Consolidated HTML Dashboard`, Story 4.4) will embed Strategy XIRR metrics and friction visualizations.
- Shared framework: Enhances `contract_validator.js` and `artifact_harness.js` with `strategy-xirr` schema validation.
- Zero breaking changes to existing broker fetchers, market data providers, or Tier 3 valuation engines.

