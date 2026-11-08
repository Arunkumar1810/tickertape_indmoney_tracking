## 1. JSON Schema Definitions

- [x] 1.1 Create `.agents/shared/framework/schemas/normalized-company-financials.schema.json` defining the draft-07 JSON Schema for `NormalizedCompanyFinancials` (covering identity metadata, `market_data`, `income_statement`, `balance_sheet`, `cash_flow`, `forensics`, and `is_index_etf` handling) and verify valid JSON parsing via `node -e "JSON.parse(require('fs').readFileSync('.agents/shared/framework/schemas/normalized-company-financials.schema.json', 'utf8'))"`.
- [x] 1.2 Create `.agents/shared/framework/schemas/uniform-verdict.schema.json` defining the draft-07 JSON Schema for single `UniformVerdictContract` objects and Option C consolidated portfolio batch envelopes, and verify valid JSON parsing via `node -e "JSON.parse(require('fs').readFileSync('.agents/shared/framework/schemas/uniform-verdict.schema.json', 'utf8'))"`.

## 2. Runtime Contract Validator & CLI Entrypoint

- [x] 2.1 Implement `.agents/shared/framework/contract_validator.js` providing `validateNormalizedFinancials(payload)`, `validateUniformVerdict(payload)`, and `validateUniformVerdictBatch(payload)` (enforcing structural schema rules, ETF relaxations, and gatekeeper vs valuation stance/veto consistency), and verify unit tests pass via `node --test .agents/shared/framework/tests/contract_validator.test.js`.
- [x] 2.2 Add CLI entrypoint support (`--type <financials|verdict|verdict-batch> --file <path> [--json]`) in `.agents/shared/framework/contract_validator.js`, export the contract validator functions from `.agents/shared/framework/index.js`, and verify CLI and unit tests pass via `node --test .agents/shared/framework/tests/contract_validator.test.js`.

