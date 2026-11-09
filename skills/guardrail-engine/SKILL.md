---
name: guardrail-engine
description: Tier 4 Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine. Evaluates multi-pillar valuation verdicts and forensic gatekeeper audits, short-circuiting vetoed securities to DISQUALIFIED with zero capital allocation, enforcing the Asymmetric Downside Guardrail (NEEDS_REVIEW on any STRONG_SELL), synthesizing weighted principle scores with REDUCE ceiling capping, and auditing portfolio risk posture. Emits canonical StrategyVerdictSynthesis and offline self-contained HTML audit dashboard.
license: Proprietary
compatibility: Node.js (>= 18.0.0)
metadata:
  tier: 4
  role: guardrail_engine_synthesizer
  author: Antigravity
---

# Tier 4 Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine

## Overview

The `guardrail-engine` skill implements Tier 4 **Choice C: Asymmetric Downside Guardrail & Gatekeeper Short-Circuit Engine** under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`). It synthesizes individual Tier 3 valuation verdicts (`graham`, `lynch`, `buffett_munger`, `klarman_solvency`) alongside the Gatekeeper audit (`forensic_governance`) into a unified, risk-mitigated portfolio decision contract.

Guided by foundational value-investing doctrine, the engine prioritizes the avoidance of catastrophic capital impairment over speculative upside: acute accounting fraud or an existential valuation flaw signaled by any single pillar must immediately halt automated capital allocation.

## 3-Stage Hierarchical Evaluation Pipeline

```
Raw Verdicts (Gatekeeper + Valuation Pillars)
                  │
                  ▼
      [ Stage 1: Gatekeeper Check ]
   Is forensic_governance vetoed or flagged?
         ├── YES ──► Stance: DISQUALIFIED (0.0% Allocation, Score 0.0) [SHORT-CIRCUITED]
         └── NO  ──► Proceed to Stage 2
                  │
                  ▼
    [ Stage 2: Downside Guardrail ]
     Does ANY pillar signal STRONG_SELL?
         ├── YES ──► Stance: NEEDS_REVIEW (Guardrail Triggered, No Buy Clearance)
         └── NO  ──► Proceed to Stage 3
                  │
                  ▼
     [ Stage 3: Composite Scoring ]
    CompositeScore = Sum(weight_k * Score_k)
    Map Score to Baseline Stance (STRONG_BUY, BUY, HOLD, REDUCE, STRONG_SELL)
    If ANY pillar signals REDUCE ──► Cap Stance at HOLD
                  │
                  ▼
      Target Allocation & Risk Auditing
```

### 1. Stage 1: Gatekeeper Veto Protocol
- If `forensic_governance` has `is_veto === true` or `stance === 'VETO_DISQUALIFIED'`:
  - `synthesized_stance: "DISQUALIFIED"`
  - `synthesized_score: 0.0`
  - `recommended_allocation_pct: 0.0`
  - `is_disqualified: true`
  - `notes`: Records gatekeeper red flags and hard-veto rationale.
  - Evaluation short-circuits: downside checks and valuation score weighting are bypassed.

### 2. Stage 2: Asymmetric Downside Guardrail Check
- If Gatekeeper passes, inspect all active valuation principle verdicts.
- If ANY principle issues `STRONG_SELL`:
  - `synthesized_stance: "NEEDS_REVIEW"`
  - `guardrail_triggered: true`
  - `notes`: Identifies offending principle(s) issuing Strong Sell.
  - Automated buy clearance is strictly suppressed.

### 3. Stage 3: Composite Scoring & Stance Synthesis
- If no veto and no Strong Sell:
  - $\text{CompositeScore} = \sum_{k} w_k \cdot \text{Score}_k$
  - Baseline stance mapping:
    - $\ge 80.0 \implies \text{STRONG\_BUY}$
    - $\ge 65.0 \implies \text{BUY}$
    - $\ge 45.0 \implies \text{HOLD}$
    - $\ge 30.0 \implies \text{REDUCE}$
    - $< 30.0 \implies \text{STRONG\_SELL}$
  - **Ceiling Rule**: If any principle signals `REDUCE`, the synthesized stance cannot exceed `HOLD`.

### 4. Portfolio Risk Posture & Capital Allocation Auditing
- `capital_at_risk`: Sum of current values of positions with stance `DISQUALIFIED` or `NEEDS_REVIEW`.
- `recommended_allocation_pct`: Disqualified assets are pruned to 0.0%; capital is redistributed proportionally among approved assets based on composite score.

## CLI Usage

### 1. Offline Deterministic Mode
Synthesize static verdict files and blended holdings:
```bash
node .agents/skills/guardrail-engine/scripts/guardrail_engine.js \
  --verdicts verdicts/INFY_batch.json verdicts/AAPL_batch.json \
  --blended strategies/fundamental_lts/holdings_blended.json \
  --manifest config/investment_ways.yaml \
  --way fundamental_lts \
  --out strategies/fundamental_lts/ \
  --json-output
```

### 2. Autonomous Investment Way Mode
Automatically resolve assigned principles, weights, and blended holdings:
```bash
node .agents/skills/guardrail-engine/scripts/guardrail_engine.js \
  --way fundamental_lts \
  --out strategies/fundamental_lts/ \
  --json-output
```

## Contract Outputs
- `strategy_verdict_synthesis.json`: Conforms to `StrategyVerdictSynthesis` draft-07 JSON Schema.
- `strategy_verdict_synthesis.html`: 100% offline self-contained HTML audit dashboard with risk gauge, disqualified stock cards, and principle score breakdown, verified with zero external leaks via `artifact_harness.js`.

