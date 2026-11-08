# Design: Option C Consolidated HTML Dashboard with Embedded Audits (way-long-term-strategy)

## Context

See `proposal.md` for the overarching motivation. Under the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), investment operations are decoupled into:
- Tier 1: Broker Connectors (`fetch-angelone`, `fetch-indmoney-us`)
- Tier 2: Normalized Market Data (`provider-tickertape`)
- Tier 3: 5-Pillar Valuation & Gatekeeper Suite (`forensic-governance`, `analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`)
- Tier 4: Multi-Account Orchestration (`holding-blender`, `strategy-xirr`, `guardrail-engine`)

Story 4.4 implements the **reference Investment Way orchestrator** (`way-long-term-strategy`) that ties all four tiers together, producing the **Option C Consolidated Master HTML Dashboard** and the canonical `StrategyConsolidatedPortfolio` contract.

## Goals / Non-Goals

**Goals:**
- Provide an end-to-end strategy orchestrator coordinating multi-account blending, strategy XIRR solving, multi-pillar valuation, and downside guardrail synthesis.
- Implement the Option C Consolidated Embedding Architecture, embedding comprehensive Tier 3 audit details (metrics, formulas, red flags, summaries) into interactive tabs and drawers directly within the master dashboard.
- Render an executive, offline self-contained HTML dashboard with dark-mode styling, hero KPI cards (Portfolio Value, WAC, Unrealized P&L, Strategy XIRR, Health Score, Capital at Risk), lot attribution drawers, and interactive valuation tabs for all 5 principles.
- Support Pattern C dual-mode CLI execution (offline component files or autonomous strategy way execution via `config/investment_ways.yaml`).
- Guarantee 100% offline self-containment with zero external network leaks, verified by `artifact_harness.js`.

**Non-Goals:**
- Live broker order placement or algorithmic rebalancing execution.
- Re-implementing mathematical calculations delegated to specialized Tier 3/4 engines.

## Decisions

### 1. Option C Consolidated Embedding Architecture
- **Decision**: Ingest consolidated Tier 3 audit payloads and embed them directly into the master dashboard's data model and interactive UI instead of generating separate HTML files for every stock/pillar pair.
- **Rationale**: A portfolio with 20 stocks and 5 principles would otherwise generate $20 \times 5 = 100$ disjoint HTML files, cluttering disk and making executive portfolio review fragmented. Option C delivers an all-in-one executive dashboard with instant drill-down tabs for Forensic Governance, Benjamin Graham, Peter Lynch, Buffett & Munger, and Seth Klarman Solvency.
- **Alternatives Considered**: Option A (separate per-stock HTML reports) and Option B (separate per-pillar consolidated reports). Both rejected due to file fragmentation and poor cross-pillar audit UX.

### 2. Tier 4 Orchestration Pipeline Sequence
- **Decision**: Coordinate execution through a 5-step pipeline:
  1. **Resolve Manifest & Accounts**: Identify assigned accounts (`angelone`, `indmoney_us`) and weights from `config/investment_ways.yaml`.
  2. **Blend Holdings**: Ingest broker snapshots, pool cash, compute WAC, and preserve lot attribution tranches using `holding-blender`.
  3. **Calculate Strategy XIRR**: Ingest external bank ledger flows, cancel internal transfers, and compute Newton-Raphson XIRR with friction drag using `strategy-xirr`.
  4. **Synthesize Verdicts**: Ingest Tier 3 principle audits, execute Gatekeeper veto check, evaluate Downside Guardrail, and compute composite scores using `guardrail-engine`.
  5. **Compile Master Portfolio Contract & Dashboard**: Unify results into `StrategyConsolidatedPortfolio` JSON contract and render `way_long_term_strategy.html`.

### 3. File Layout & Contract Architecture
```
.agents/
  shared/
    framework/
      schemas/strategy-consolidated-portfolio.schema.json
      contract_validator.js (validateConsolidatedPortfolio)
      artifact_harness.js (schemaType: 'consolidated-portfolio')
  skills/
    way-long-term-strategy/
      SKILL.md
      scripts/
        way_long_term_strategy.js (Pattern C CLI & runner)
        lib/
          orchestrator.js
          audit_embedder.js
      assets/
        way-long-term-strategy-template.html
      tests/
        way_long_term_strategy.test.js
        fixtures/
          sample_consolidated_strategy.json
```

## Risks / Trade-offs

- **[Risk: Large embedded audit payloads causing HTML size bloat]**  
  $\rightarrow$ **Mitigation**: Render embedded audits using clean, lightweight semantic HTML5 elements (`<details>`, `<summary>`, inline table drawers) and pure CSS tab switches without bloated third-party JavaScript libraries.
- **[Risk: Missing audit for a specific stock or principle]**  
  $\rightarrow$ **Mitigation**: Render a graceful "Audit Pending" badge in the master table without failing overall dashboard generation.

