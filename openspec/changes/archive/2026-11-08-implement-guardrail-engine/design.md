# Design

## Context

Under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), investment decisions are decoupled into Tier 3 specialized valuation principles and gatekeeper forensic audits. Individual engines emit canonical `UniformVerdictContract` payloads.

Story 4.3 implements the **Tier 4 Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine** (`guardrail-engine`). It synthesizes disparate pillar evaluations into unified, risk-mitigated portfolio decisions. The engine operates on the core value-investing principle that avoiding catastrophic capital impairment takes absolute precedence over maximizing prospective upside: an equity with acute accounting red flags or an existential valuation flaw flagged by any single pillar must never receive automated buy clearance.

## Goals / Non-Goals

**Goals:**
- Implement a 3-stage hierarchical evaluation pipeline:
  1. Gatekeeper Veto Check (`forensic_governance` hard stop).
  2. Asymmetric Downside Guardrail Check (`STRONG_SELL` interception).
  3. Weighted Principle Compounding Scoring with `REDUCE` ceiling capping.
- Provide portfolio-wide posture metrics: `portfolio_health_score`, `disqualified_count`, `needs_review_count`, `approved_count`, and `capital_at_risk`.
- Recommend defensive capital allocation weights (0% to disqualified securities, proportional redistribution across approved securities).
- Emit canonical `StrategyVerdictSynthesis` draft-07 JSON contract and 100% offline self-contained HTML audit report with zero external network leaks.
- Support Pattern C dual-mode execution (offline static files via CLI flags and autonomous `--way <way_id>` execution).

**Non-Goals:**
- Automated live trade placement or broker order routing.
- Re-executing raw financial statement calculations (delegated to Tier 3 principles).

## Decisions

### 1. Hierarchical Short-Circuit Evaluation Pipeline
- **Decision**: Synthesize verdicts through a strict 3-tier sequence:
  1. **Gatekeeper Check**: If `forensic_governance` reports `is_veto: true` or `stance: "VETO_DISQUALIFIED"`, evaluation immediately short-circuits. Output: `stance: "DISQUALIFIED"`, `score: 0.0`, `target_allocation_pct: 0.0%`, `is_disqualified: true`. Downside and weighted calculations are bypassed.
  2. **Downside Guardrail**: If Gatekeeper passes, inspect all active valuation principle verdicts. If any pillar signals `STRONG_SELL`, output: `stance: "NEEDS_REVIEW"`, `guardrail_triggered: true`, logging the offending principle. Automated buy clearance is strictly suppressed.
  3. **Composite Scoring**: If no veto and no Strong Sell, compute weighted score:
     $$\text{CompositeScore} = \sum_{k} w_k \cdot \text{Score}_k$$
     Map composite score to baseline stance:
     - $\ge 80.0 \implies \text{STRONG\_BUY}$
     - $\ge 65.0 \implies \text{BUY}$
     - $\ge 45.0 \implies \text{HOLD}$
     - $\ge 30.0 \implies \text{REDUCE}$
     - $< 30.0 \implies \text{STRONG\_SELL}$
     *Ceiling Rule*: If any principle signals `REDUCE`, the synthesized stance cannot exceed `HOLD`.
- **Rationale**: Prevents high numerical scores in one pillar (e.g., Graham liquidation surplus) from masking structural terminal decay or fraudulent promoter behavior.
- **Alternatives Considered**: Linear weighted average across all 5 principles. Rejected because a 90% Graham score and a 0% Forensic Governance score would average to 72% ("BUY"), allocating capital to potentially fraudulent companies.

### 2. Capital At Risk & Recommended Allocation Pruning
- **Decision**: Calculate `capital_at_risk` as the sum of current market values of all positions with stance `DISQUALIFIED` or `NEEDS_REVIEW`. Rebalance target allocations such that disqualified assets receive 0%, while capital is redistributed proportionally among approved assets.
- **Rationale**: Gives investors immediate actionable intelligence on the monetary volume of portfolio capital requiring remediation.

### 3. File Layout & Contract Architecture
```
.agents/
  shared/
    framework/
      schemas/strategy-verdict-synthesis.schema.json
      contract_validator.js (validateVerdictSynthesis)
      artifact_harness.js (schemaType: 'verdict-synthesis')
  skills/
    guardrail-engine/
      SKILL.md
      scripts/
        guardrail_engine.js (Pattern C CLI & runner)
        lib/
          gatekeeper_short_circuit.js
          downside_guardrail.js
          verdict_synthesizer.js
      assets/
        guardrail-engine-template.html
      tests/
        guardrail_engine.test.js
        fixtures/
          sample_disqualified_stock.json
          sample_guardrail_review_stock.json
          sample_approved_stock.json
          sample_portfolio_verdicts.json
```

## Risks / Trade-offs

- **[Risk: Missing principle verdict for a portfolio security]**  
  $\rightarrow$ **Mitigation**: If an active principle verdict is missing for a security, the synthesizer assigns weight 0 to the missing principle, re-normalizes active principle weights to sum to 1.0, and flags an audit warning banner.
- **[Risk: Stale verdicts used in real-time synthesis]**  
  $\rightarrow$ **Mitigation**: Record individual verdict timestamps and emit an alert if any verdict is older than 30 days relative to `eval_date`.

