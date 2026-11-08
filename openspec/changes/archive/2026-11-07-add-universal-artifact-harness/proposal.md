# Proposal

## Why

To guarantee **Invariant 2 (Universal "1 JSON + 1 HTML" Contract)** from the Modular Stock Portfolio & Analysis Framework (`AID-BMAD-MODULAR-STOCK-V1`), every skill across all 4 tiers must reliably emit two standardized outputs upon execution: a machine-readable JSON artifact adhering to the tier's schema and a fully self-contained offline HTML dashboard viewable via `file://` with zero external network asset dependencies. Building an automated, zero-dependency verification harness (`artifact_harness.js`) provides a unified programmatic and CLI test harness that validates both artifacts for schema conformance, structural completeness, and offline self-containment before any skill is accepted into the production pipeline.

## What Changes

- Implement `.agents/shared/framework/artifact_harness.js` providing programmatic verification APIs:
  - `verifyArtifactPair({ jsonPath, htmlPath, schemaType, allowExternalAssets })`: Validates that both the canonical JSON contract and self-contained HTML file exist, comply with schemas, and meet offline visual integrity standards.
  - `verifyHtmlSelfContainment(htmlContentOrPath, options)`: Analyzes HTML content for external stylesheet links, external script tags, external image URLs, or uncontained web fonts, ensuring 100% offline self-containment.
  - `verifyDirectoryArtifacts(dirPath, { prefix, schemaType })`: Scans an output directory for matching `<prefix>*.json` and `<prefix>*.html` pairs and validates both.
- Provide a CLI interface (`runHarnessCli`) accepting `--json <path> --html <path> [--schema <financials|verdict|verdict-batch|manifest|none>] [--allow-external-assets] [--json-output]`, returning exit code 0 on success and exit code 1 with structured diagnostic errors on validation failure.
- Export the harness functions from `.agents/shared/framework/index.js`.
- Add comprehensive test coverage in `.agents/shared/framework/tests/artifact_harness.test.js` validating JSON schema conformance, missing files, malformed HTML, and external asset leak detection (e.g., `<link rel="stylesheet" href="https://...">` or `<script src="http://...">`).

## Capabilities

### New Capabilities
- `framework/artifact-verification-harness`: Automated verification harness enforcing Invariant 2 (valid canonical JSON artifact + standalone offline HTML dashboard) across all skills and framework tiers.

### Modified Capabilities
<!-- None -->

## Impact

- Extends `.agents/shared/framework/` with `artifact_harness.js` and `tests/artifact_harness.test.js`.
- Reuses `.agents/shared/framework/contract_validator.js` and `.agents/shared/framework/manifest_validator.js`.
- Completes Epic 1 (`epic-core-contracts`), unblocking Epic 2 (`epic-ingestion-pipelines`), Epic 3 (`epic-valuation-suite`), and Epic 4 (`epic-strategy-orchestrator`).

