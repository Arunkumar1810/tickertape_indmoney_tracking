# Tasks

## 1. Core Verification Harness Module

- [x] 1.1 Implement `.agents/shared/framework/artifact_harness.js` providing `verifyArtifactPair({ jsonPath, htmlPath, schemaType, allowExternalAssets })`, `verifyHtmlSelfContainment(htmlContentOrPath, options)`, and `verifyDirectoryArtifacts(dirPath, options)` enforcing Invariant 2 (validating file existence, schema compliance via `contract_validator` / `manifest_validator`, and HTML offline self-containment with external URL detection), and verify unit tests pass via `node --test .agents/shared/framework/tests/artifact_harness.test.js`.
- [x] 1.2 Add CLI entrypoint `runHarnessCli` in `artifact_harness.js` (`--json <path> --html <path> [--schema <financials|verdict|verdict-batch|manifest|none>] [--allow-external-assets] [--json-output]`), export harness functions from `.agents/shared/framework/index.js`, and verify CLI execution and full framework test suite pass via `node --test .agents/shared/framework/tests/artifact_harness.test.js`.

