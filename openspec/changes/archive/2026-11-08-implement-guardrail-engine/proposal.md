# Proposal

## Why

In value-investing portfolio management, naive mechanical averaging of valuation scores fails to protect capital when acute corporate governance red flags or fatal valuation flaws exist in an asset. An equity with outstanding historical Graham liquidation metrics or high DCF numbers must not be purchased if forensic governance detects accounting fraud, promoter pledge risk, or auditor resignation. Similarly, if any independent valuation pillar (such as Peter Lynch growth analysis or Klarman solvency stress) flags an existential flaw and issues a `STRONG_SELL` stance, the stock cannot be cleared for automated buying. 

Tier 4 Investment Ways require an asymmetric synthesis engine that short-circuits vetoed equities to `DISQUALIFIED` with 0% capital allocation, forces `NEEDS_REVIEW` on any `STRONG_SELL` signal, and calculates weighted aggregate scores across active valuation principles.

## What Changes

- Introduce `.agents/shared/framework/schemas/strategy-verdict-synthesis.schema.json` defining the canonical `StrategyVerdictSynthesis` draft-07 JSON Schema (`strategy_id`, `timestamp`, `eval_date`, `summary`, `portfolio_verdicts`, `allocations`).
- Export `validateVerdictSynthesis(payload)` in `contract_validator.js` and register `schemaType: 'verdict-synthesis'` in `artifact_harness.js`.
- Implement `.agents/skills/guardrail-engine/` skill containing:
  - `scripts/lib/gatekeeper_short_circuit.js`: Evaluates forensic governance gatekeeper verdicts, immediately short-circuiting vetoed stocks to `DISQUALIFIED` with zero capital allocation.
  - `scripts/lib/downside_guardrail.js`: Enforces the Asymmetric Downside Guardrail rule, intercepting any `STRONG_SELL` valuation signals and forcing stance to `NEEDS_REVIEW`.
  - `scripts/lib/verdict_synthesizer.js`: Computes weighted composite scores based on `config/investment_ways.yaml` principle weights, maps scores to baseline synthesized stances (`STRONG_BUY`, `BUY`, `HOLD`, `REDUCE`, `STRONG_SELL`), caps stance at `HOLD` if any principle signals `REDUCE`, and aggregates portfolio posture metrics.
  - `scripts/guardrail_engine.js`: Pattern C dual-mode CLI supporting offline evaluation via `--verdicts <paths...>` / `--blended <path>` and autonomous execution via `--way <way_id>`.
  - `assets/guardrail-engine-template.html`: Self-contained offline HTML audit dashboard rendering portfolio health status, disqualified stock cards, guardrail warning drawers, and principle score breakdown with zero external network leaks.
- Unit and integration tests in `.agents/skills/guardrail-engine/tests/guardrail_engine.test.js`.

## Capabilities

### New Capabilities
- `skills/guardrail-engine`: Evaluates multi-pillar valuation verdicts and forensic gatekeeper audits, short-circuiting vetoed securities to `DISQUALIFIED` with zero capital allocation, enforcing the Asymmetric Downside Guardrail (`NEEDS_REVIEW` on any `STRONG_SELL`), and synthesizing weighted principle scores.

### Modified Capabilities
<!-- None -->

## Impact

- Dependent systems: Downstream Tier 4 Master Dashboard (`Option C Consolidated HTML Dashboard`, Story 4.4) embeds these synthesized verdicts, guardrail flags, and capital allocation recommendations.
- Shared framework: Enhances `contract_validator.js` and `artifact_harness.js` with `verdict-synthesis` schema validation.
- Zero breaking changes to existing broker fetchers, market data providers, or Tier 3 valuation engines.

