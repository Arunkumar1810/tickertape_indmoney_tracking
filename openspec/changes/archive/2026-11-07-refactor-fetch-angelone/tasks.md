# Tasks

## 1. Canonical Schema & Validator Integration

- [x] 1.1 Create `.agents/shared/framework/schemas/account-holdings-snapshot.schema.json` defining the draft-07 JSON Schema for `AccountHoldingsSnapshot` (`account_id`, `broker`, `currency`, `timestamp`, `summary`, `margin`, `holdings`) and verify valid JSON parsing via `node -e "JSON.parse(require('fs').readFileSync('.agents/shared/framework/schemas/account-holdings-snapshot.schema.json', 'utf8'))"`.
- [x] 1.2 Implement `validateAccountHoldingsSnapshot(payload)` in `.agents/shared/framework/contract_validator.js`, register schema type `'holdings'` in `artifact_harness.js`, export from `index.js`, and verify unit tests pass via `node --test .agents/shared/framework/tests/contract_validator.test.js`.

## 2. fetch-angelone Skill & Offline Dashboard

- [x] 2.1 Implement `.agents/skills/fetch-angelone/` with `SKILL.md`, `assets/report-template.html` (offline self-contained HTML dashboard with inlined styles and SVG icons), and `scripts/fetch_angelone.js` normalizing SmartAPI data into `accounts/angelone.json` and `accounts/angelone.html`.
- [x] 2.2 Add unit and CLI tests in `.agents/skills/fetch-angelone/tests/fetch_angelone.test.js` covering snapshot generation, cash margin ledger, `--only <ticker>` filtering, and verification harness validation (`verifyArtifactPair` with schema `'holdings'`), and verify tests pass via `node --test .agents/skills/fetch-angelone/tests/fetch_angelone.test.js`.

