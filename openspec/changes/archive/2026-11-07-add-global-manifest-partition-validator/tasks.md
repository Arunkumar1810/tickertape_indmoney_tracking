# Tasks

## 1. Schema & Default Manifest Configuration

- [x] 1.1 Create `.agents/shared/framework/schemas/investment-ways-manifest.schema.json` defining draft-07 JSON Schema for `version`, `accounts`, `data_providers`, `gatekeepers`, `analysis_principles`, and `investment_ways`, and verify the file parses as valid JSON via `node -e "JSON.parse(require('fs').readFileSync('.agents/shared/framework/schemas/investment-ways-manifest.schema.json', 'utf8'))"`.
- [x] 1.2 Create the default declarative manifest `config/investment_ways.yaml` registering `angelone` and `indmoney_us` accounts, `provider-tickertape`, `forensic-governance` gatekeeper, the 4 valuation principles (`analyze-graham`, `analyze-lynch`, `analyze-buffett-munger`, `analyze-klarman-solvency`), and partitioned Investment Ways, and verify the file exists at `config/investment_ways.yaml`.

## 2. Manifest Loader & Partition Validator Engine

- [x] 2.1 Implement zero-dependency YAML/JSON manifest loader in `.agents/shared/framework/yaml_loader.js` supporting comments, nested maps, inline/block lists, strings, numbers, and booleans, and verify unit tests for parsing `config/investment_ways.yaml` pass via `node --test .agents/shared/framework/tests/manifest_validator.test.js`.
- [x] 2.2 Implement structural schema validation and relational invariant checks in `.agents/shared/framework/manifest_validator.js` (enforcing strict 1-to-many account partitioning, non-empty account bindings, orphan/unknown account detection, catalog reference checks, and $\sum w_k = 1.0 \pm 10^{-6}$), and verify all invariant unit tests pass via `node --test .agents/shared/framework/tests/manifest_validator.test.js`.

## 3. CLI Runner & End-to-End Verification

- [x] 3.1 Add CLI entrypoint support (`--config <path>`, `--json`) and module exports (`index.js`) in `.agents/shared/framework/`, and verify `node .agents/shared/framework/manifest_validator.js --config config/investment_ways.yaml --json` exits with code 0 and outputs `"ok": true` while duplicate-account fixtures exit with code 1.

