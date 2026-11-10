---
name: way-long-term-strategy
description: Reference Tier 4 Investment Way orchestrator and Option C Consolidated Master HTML Dashboard for long-term compounding strategies. Binds assigned domestic and foreign accounts (Angel One, INDmoney US), blends holdings with WAC and pooled cash, calculates True Strategy XIRR with itemized friction accounting, enforces asymmetric downside guardrails, and embeds complete Tier 3 valuation audits (Graham, Lynch, Buffett & Munger, Klarman Solvency, Forensic Governance) into an offline executive dashboard.
license: Proprietary
compatibility: Node.js (>= 18.0.0)
metadata:
  tier: 4
  role: master_strategy_orchestrator
  author: Antigravity
---

# Tier 4 Reference Orchestrator: way-long-term-strategy

## Overview

The `way-long-term-strategy` skill implements the **reference Tier 4 Investment Way orchestrator** and the **Option C Consolidated Master HTML Dashboard** under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`). It binds assigned domestic and foreign broker accounts (`angelone`, `indmoney_us`), coordinates position blending with Weighted Average Cost (WAC) and pooled cash, calculates True Strategy XIRR with itemized friction accounting, evaluates gatekeeper and valuation principles with downside guardrails, and renders an executive offline master HTML dashboard with embedded Tier 3 audits.

## 5-Stage Orchestration Pipeline

```
              config/investment_ways.yaml
                          │
                          ▼
        [ Stage 1: Manifest & Account Partition ]
        Binds accounts (angelone, indmoney_us) and weights
                          │
                          ▼
        [ Stage 2: Multi-Account Holding Blender ]
         Consolidates quantities, WAC, and pooled cash
         Preserves lot attribution tranches (holding-blender)
                          │
                          ▼
       [ Stage 3: True Strategy XIRR & Friction Tracker ]
         Aggregates bank cashflows, cancels internal transfers,
         and computes Newton-Raphson XIRR (strategy-xirr)
                          │
                          ▼
     [ Stage 4: Downside Guardrails & Verdict Synthesis ]
         Vetoes disqualified stocks (0.0% capital allocation)
         Intercepts Strong Sell signals to NEEDS_REVIEW
         Applies REDUCE ceiling capping at HOLD (guardrail-engine)
                          │
                          ▼
   [ Stage 5: Option C Consolidated Master HTML Dashboard ]
       Embeds complete 5-pillar audits into interactive tabs
       Renders executive KPIs, attribution drawers, and waterfall
```

## Option C Consolidated Embedding Architecture

Rather than fragmenting portfolio analysis into dozens of individual per-stock or per-pillar HTML files, `way-long-term-strategy` embeds complete Tier 3 audit payloads directly into the master dashboard:
- **Forensic Governance**: Promoter pledge checks, auditor continuity, Beneish M-Score, Sloan accrual ratios.
- **Benjamin Graham**: Net Current Asset Value (NCAV), Graham Number floor, Margin of Safety.
- **Peter Lynch**: PEG ratio, growth categorization, inventory-to-sales velocity divergence.
- **Warren Buffett (`agent-buffet`)**: True Owner Earnings, 5-Step DuPont ROE decomposition, ROIC economic moat.
- **Seth Klarman Solvency**: Altman Z-Score, Net Debt/EBITDA, 24-month debt maturity cliff exposure.

## Interactive Master Dashboard Capabilities

1. **Executive Hero KPI Grid**:
   - Total Strategy Equity & Invested Capital
   - Unrealized Profit & Loss (Absolute and %)
   - True Strategy Annualized XIRR %
   - Portfolio Health Score (out of 100)
   - Capital at Risk (Disqualified + Under Review)
2. **Master Portfolio Holdings Matrix**:
   - Blended positions, WAC, CMP, Market Value, P&L, Synthesized Stance, Target Weight, and Action.
3. **Lot-Level Attribution Drawers**:
   - Inline drill-down displaying purchase lots across Angel One and INDmoney with original currency amounts and exchange rates.
4. **Option C Embedded Valuation Audits Tabs**:
   - Interactive tabbed interface allowing instant switching between all 5 analysis principles for any security.
5. **Itemized Friction Accounting**:
   - Explicit breakdown of brokerage, STT, currency conversion markups, and regulatory taxes.

## CLI Usage

### 1. Deterministic Offline Mode
Compile pre-computed component files into master artifacts:
```bash
node .agents/skills/way-long-term-strategy/scripts/way_long_term_strategy.js \
  --blended strategies/fundamental_lts/holdings_blended.json \
  --xirr strategies/fundamental_lts/strategy_xirr.json \
  --synthesis strategies/fundamental_lts/strategy_verdict_synthesis.json \
  --out strategies/fundamental_lts/ \
  --json-output
```

### 2. Autonomous Strategy Orchestration Mode
Execute the end-to-end pipeline using `config/investment_ways.yaml`:
```bash
node .agents/skills/way-long-term-strategy/scripts/way_long_term_strategy.js \
  --way fundamental_lts \
  --out strategies/fundamental_lts/ \
  --json-output
```

## Contract Outputs
- `way_long_term_strategy.json`: Conforms to canonical `StrategyConsolidatedPortfolio` draft-07 JSON Schema.
- `way_long_term_strategy.html`: 100% offline self-contained master executive dashboard, verified with zero external asset leaks via `artifact_harness.js`.

