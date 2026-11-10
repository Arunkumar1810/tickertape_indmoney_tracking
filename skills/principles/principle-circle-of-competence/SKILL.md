---
name: principle-circle-of-competence
description: Warren Buffett Circle of Competence Diagnostic Questionnaire. Evaluates investor understanding of business unit economics, pricing power durability, terminal disruption threats, and capital allocation before increasing stock allocations. Use to assess circle of competence, administer the Buffett business questionnaire, or gate position expansion.
---

# principle-circle-of-competence

Warren Buffett Circle of Competence Diagnostic Questionnaire.

> *"What counts for most people in investing is not how much they know, but rather how realistically they define what they don't know."* — Warren Buffett

Evaluates whether an investor genuinely understands a company's business model before initiating or expanding an equity position. Administers a disciplined 5-point questionnaire, scores comprehension quality, and gates portfolio allocation increases.

## The 5 Core Buffett Business Questions

1. **Business Simplicity & Unit Economics**: Can you explain in 2 simple sentences what the business sells, to whom, and why customers come back?
2. **Moat Durability & Pricing Power**: What protects their pricing power over the next 10 years (Low-cost producer, switching costs, network effects, high brand loyalty, or proprietary assets)?
3. **Terminal Disruption & Obsolescence Risk**: Could rapid technological disruption, regulatory shifts, or aggressive competitors permanently impair this business within 10 years?
4. **Promoter & Management Integrity**: Are the promoters and management honest, able, and proven capital allocators who treat shareholders as partners?
5. **Investor Conviction / Strike Zone**: Are you swinging at a pitch inside your circle of competence, or chasing momentum outside your depth?

## CLI Usage

```bash
# Evaluate or check status for a ticker:
node skills/principles/principle-circle-of-competence/scripts/evaluate_competence.js --ticker INFY

# Record answers interactively or via JSON:
node skills/principles/principle-circle-of-competence/scripts/evaluate_competence.js --ticker INFY --answers '{"q1": 5, "q2": 5, "q3": 5, "q4": 5, "q5": 5}'

# Output as JSON:
node skills/principles/principle-circle-of-competence/scripts/evaluate_competence.js --ticker INFY --json
```

## Status & Scoring

- **`IN_CIRCLE`** (Score $\ge 80$): High comprehension across all 5 dimensions. Fully cleared for BUY/ACCUMULATE.
- **`EXPANDING_CIRCLE`** (Score $50 - 79$): Growing comprehension. Permitted for initial/modest position (capped at 5% portfolio allocation).
- **`OUTSIDE_CIRCLE`** (Score $< 50$ or not yet evaluated): Capped at `HOLD` or `WATCHLIST`. Buffett advises: *"Put it in the 'Too Hard' pile until you do the homework."*

