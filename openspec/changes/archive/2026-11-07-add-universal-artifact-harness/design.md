# Design

## Context

Stories 1.1 and 1.2 implemented `.agents/shared/framework/` validators for investment ways manifests (`manifest_validator.js`) and core data contracts (`contract_validator.js`). Story 1.3 finishes Epic 1 by providing the automated verification harness (`artifact_harness.js`) that enforces Invariant 2 across all 4 tiers of the modular architecture: every skill run must emit both a valid canonical JSON artifact and a self-contained offline HTML dashboard.

See `proposal.md` for motivation and `specs/framework/artifact-verification-harness/spec.md` for normative requirements.

## Goals / Non-Goals

**Goals:**
- Provide a zero-dependency CommonJS verification module (`.agents/shared/framework/artifact_harness.js`) that verifies artifact existence, JSON schema compliance, and HTML offline self-containment.
- Provide programmatic APIs (`verifyArtifactPair`, `verifyHtmlSelfContainment`, `verifyDirectoryArtifacts`) and a CLI entrypoint (`runHarnessCli`).
- Detect external network leaks in HTML dashboards (`<link rel="stylesheet">`, `<script src="...">`, `<img src="...">`, `@import` with `http(s)://` or `//`).
- Support schema types `financials`, `verdict`, `verdict-batch`, `manifest`, and `none`.

**Non-Goals:**
- Headless browser rendering or screenshot capture (e.g., Puppeteer/Playwright).
- Direct invocation of skill processes; the harness verifies generated output artifacts from disk or buffers.

## Decisions

### 1. Zero-Dependency HTML Self-Containment Scanner
- **Decision**: Use deterministic regular expressions to inspect HTML documents for `<link>`, `<script>`, `<img>`, and `@import` tags referencing external network URLs (`http://`, `https://`, or protocol-relative `//`), while allowing `data:` URIs (inline base64 assets) and local intra-document anchors (`#`).
- **Rationale**: Keeps `.agents/shared/framework/` completely zero-dependency and fast without requiring external DOM parsing libraries (`cheerio`, `jsdom`).
- **Alternatives considered**:
  - *Adding `cheerio` or `jsdom`*: Rejected to maintain the zero-dependency convention of the shared framework.

### 2. Pluggable JSON Contract Validation
- **Decision**: Integrate directly with `contract_validator.js` and `manifest_validator.js` based on `--schema <financials|verdict|verdict-batch|manifest|none>`.
- **Rationale**: Centralizes contract rules and prevents divergence between individual validators and the verification harness.
- **Alternatives considered**:
  - *Generic JSON Schema only*: Rejected because semantic checks (e.g., gatekeeper stance vs. veto flag invariants) require programmatic domain validation.

### 3. Orphan and Unpaired File Detection
- **Decision**: In `verifyDirectoryArtifacts`, inspect matching basenames to ensure every `*.json` has a companion `*.html` and vice-versa.
- **Rationale**: Catches silent template rendering crashes where a skill produces JSON data but fails before generating the human dashboard.

## Risks / Trade-offs

- **[Risk] False positives on valid inline data URIs or base64 images** → **Mitigation**: Specifically whitelist `data:` URIs and relative intra-page hash references.
- **[Risk] Future skills needing CDN assets for interactive charts** → **Mitigation**: Provide `--allow-external-assets` (or programmatic option `allowExternalAssets: true`) to bypass external asset errors when explicitly intended, while keeping strict offline containment as the default.

## Migration Plan

1. Implement `.agents/shared/framework/artifact_harness.js`.
2. Export harness APIs from `.agents/shared/framework/index.js`.
3. Add unit and CLI tests in `.agents/shared/framework/tests/artifact_harness.test.js`.
4. Run full test suite with `node --test .agents/shared/framework/tests/*.test.js`.

