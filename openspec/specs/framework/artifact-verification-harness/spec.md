# framework/artifact-verification-harness Specification

## Purpose

Defines the verification harness that enforces Invariant 2 (Universal "1 JSON + 1 HTML" Contract), ensuring every skill across all tiers outputs a valid schema-compliant JSON contract and a fully self-contained offline HTML dashboard.

## Requirements

### Requirement: Artifact pair presence and pairing validation
The system SHALL verify that a skill execution outputs both a canonical `.json` contract artifact and a `.html` dashboard artifact at the designated file paths, verifying that both files exist, are readable, and non-empty.

#### Scenario: Both JSON and HTML artifacts exist
- **WHEN** verification is executed against existing non-empty JSON and HTML files
- **THEN** the harness reports existence checks passed with zero missing-file errors

#### Scenario: Missing JSON artifact
- **WHEN** the specified JSON file path does not exist on disk
- **THEN** the harness reports `ERR_JSON_FILE_NOT_FOUND` and returns `ok: false`

#### Scenario: Missing HTML artifact
- **WHEN** the specified HTML file path does not exist on disk
- **THEN** the harness reports `ERR_HTML_FILE_NOT_FOUND` and returns `ok: false`

### Requirement: Contract JSON schema compliance validation
The system SHALL validate the JSON artifact against the designated schema type (`financials`, `verdict`, `verdict-batch`, `manifest`, or `none`), reporting schema constraint violations and failing verification when the payload is invalid.

#### Scenario: Valid JSON contract matches designated schema
- **WHEN** a JSON file adhering to `uniform-verdict` is verified with `--schema verdict`
- **THEN** the JSON validation passes with `ok: true`

#### Scenario: Invalid JSON contract fails validation
- **WHEN** a JSON file violating schema constraints is verified with a designated schema
- **THEN** the harness returns `ok: false` with structured JSON diagnostic errors

### Requirement: HTML offline self-containment verification
The system SHALL verify that the HTML artifact is fully self-contained for offline viewing by confirming standard HTML structure and detecting unauthorized external network dependencies (`http://`, `https://`, or `//` URLs in `<link>`, `<script>`, `<style>`, or `<img>` tags).

#### Scenario: Self-contained HTML with inlined assets passes
- **WHEN** an HTML file with inline `<style>` and `<script>` tags and no external URLs is verified
- **THEN** the HTML self-containment check returns `ok: true`

#### Scenario: External stylesheet link detected
- **WHEN** an HTML file contains `<link rel="stylesheet" href="https://cdn.jsdelivr.net/.../style.css">`
- **THEN** the harness reports `ERR_EXTERNAL_STYLE_LINK` and returns `ok: false`

#### Scenario: External script tag detected
- **WHEN** an HTML file contains `<script src="https://cdn.example.com/lib.js"></script>`
- **THEN** the harness reports `ERR_EXTERNAL_SCRIPT_TAG` and returns `ok: false`

#### Scenario: External asset allowlist override
- **WHEN** external asset validation runs with `allowExternalAssets: true`
- **THEN** the harness permits external asset links while still checking document structure

### Requirement: Directory batch artifact scanning
The system SHALL support discovering and validating artifact pairs within a target directory matching a specified prefix or naming pattern, verifying that every JSON file has a corresponding HTML companion.

#### Scenario: Directory containing valid matching artifact pairs
- **WHEN** a directory containing matching `portfolio.json` and `portfolio.html` is verified
- **THEN** the batch harness verifies each pair and returns overall `ok: true`

#### Scenario: Unpaired orphan JSON or HTML file in directory
- **WHEN** a directory contains `report.json` without any matching `report.html`
- **THEN** the batch harness flags `ERR_UNPAIRED_ARTIFACT` and returns `ok: false`

### Requirement: Verification harness CLI interface
The verification harness CLI SHALL accept `--json <path>`, `--html <path>`, `--schema <financials|verdict|verdict-batch|manifest|none>`, optional `--allow-external-assets`, and optional `--json-output`, exiting with code 0 on success and code 1 on verification failure.

#### Scenario: CLI run with valid pair exits with code 0
- **WHEN** the CLI is executed against valid JSON and HTML artifacts
- **THEN** the process prints an `[OK]` confirmation and exits with status code 0

#### Scenario: CLI run with violation in JSON output mode returns structured diagnostics
- **WHEN** the CLI is executed with `--json-output` against an invalid artifact pair
- **THEN** the process outputs JSON detailing errors and exits with status code 1

