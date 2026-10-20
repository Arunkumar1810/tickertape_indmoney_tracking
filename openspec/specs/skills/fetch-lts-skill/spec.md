# skills/fetch-lts-skill Specification

## Purpose

Defines the fetch-lts skill: it obtains Angel One holdings and Tickertape data, computes an auditable rule-based rationale per stock, and renders a self-contained HTML report with a JSON side-output.

## Requirements

### Requirement: Self-contained skill
All scripts, assets, configuration, fixtures, credentials state and generated outputs used by the skill SHALL live inside the skill directory.

#### Scenario: Run without repo scripts
- **WHEN** the skill directory is used with no other project scripts present
- **THEN** the skill runs and writes its outputs only under the skill directory

### Requirement: Fetch Angel One holdings
The system SHALL retrieve the user's holdings filtered to the Angel One broker via the Tickertape portfolio tools.

#### Scenario: Holdings retrieved
- **WHEN** the CLI is run with `--broker angelone` and a valid session exists
- **THEN** the system obtains the list of Angel One holdings with quantity and average buy price

#### Scenario: Unsupported broker
- **WHEN** the CLI is run with a broker other than `angelone`
- **THEN** the system exits with a clear message that the broker is not supported in this version

### Requirement: Session reuse and refresh
The system SHALL reuse the stored Tickertape session and refresh or re-authenticate only when it is rejected.

#### Scenario: Expired token
- **WHEN** a request returns an unauthorized response
- **THEN** the system attempts one token refresh and retries before prompting the user to log in

### Requirement: Per-ticker enrichment
The system SHALL enrich each holding with fundamentals, scorecard, forecast and technical data, running at most 3 ticker enrichments concurrently.

#### Scenario: Bounded concurrency
- **WHEN** a portfolio has more than 3 holdings
- **THEN** no more than 3 enrichment requests are in flight at once

### Requirement: Daily cache
The system SHALL cache enrichment results per ticker per calendar day and reuse them on later runs that day.

#### Scenario: Rerun same day
- **WHEN** the CLI is run twice on the same day without `--refresh`
- **THEN** the second run makes no enrichment API calls for cached tickers

#### Scenario: Forced refresh
- **WHEN** the CLI is run with `--refresh`
- **THEN** cached data is ignored and fetched again

### Requirement: Single-ticker mode
The system SHALL support `--only TICKER` to process just one holding.

#### Scenario: Only one ticker
- **WHEN** the CLI is run with `--only INFY`
- **THEN** only that holding is enriched and reported

### Requirement: Fail-soft enrichment
The system SHALL continue the run when enrichment of a ticker fails and mark that ticker as partial with a warning.

#### Scenario: One ticker fails
- **WHEN** enrichment for one ticker errors after retries
- **THEN** the run completes and that ticker is reported with available data and a warning marker

### Requirement: Dimension scores
The system SHALL compute quality, valuation, momentum, analyst and risk scores per holding from available metrics.

#### Scenario: Scores computed
- **WHEN** a holding has enrichment data
- **THEN** each of the five scores is produced, or marked unavailable when its inputs are missing

### Requirement: Verdict assignment
The system SHALL assign each holding exactly one verdict from Accumulate, Hold, Trim, Review or Exit, with a one-line reason.

#### Scenario: Verdict with reason
- **WHEN** scoring completes for a holding
- **THEN** the holding has one verdict and a plain-English one-line reason

### Requirement: Auditable triggers
The system SHALL list the 2-3 metrics that triggered each verdict with their values.

#### Scenario: Triggers shown
- **WHEN** a verdict is produced
- **THEN** the output includes the triggering metrics and their values

### Requirement: Confidence indicator
The system SHALL report the share of expected metrics that were available for each holding.

#### Scenario: Missing metrics
- **WHEN** half of the expected metrics are unavailable
- **THEN** the confidence value reflects roughly 50 percent availability

### Requirement: Red and green flags
The system SHALL flag red (falling promoter holding with rising debt and declining margins) and green (rising ROCE, positive free cash flow, low debt) conditions.

#### Scenario: Red flag
- **WHEN** promoter holding falls, debt rises and margins decline
- **THEN** the holding carries a red flag

### Requirement: Concentration warnings
The system SHALL warn when a stock exceeds 15 percent or a sector exceeds 30 percent of portfolio weight, using configurable caps.

#### Scenario: Stock over cap
- **WHEN** a single stock weighs 18 percent
- **THEN** a concentration warning is attached to it

### Requirement: Configurable thresholds
The system SHALL read thresholds, weights and caps from `lts.config.json` inside the skill directory, falling back to documented defaults.

#### Scenario: Custom threshold
- **WHEN** the config changes the stock weight cap to 10 percent
- **THEN** warnings use the new cap

### Requirement: Tax-aware trim
The system SHALL note when a holding is close to the one-year holding mark before issuing a Trim verdict.

#### Scenario: Near one year
- **WHEN** a Trim verdict applies to a holding bought 11 months ago
- **THEN** the reason notes the upcoming long-term gains threshold

### Requirement: Self-contained report file
The system SHALL write a single HTML file named `fetch-lts-YYYY-MM-DD.html` in the output directory that works offline with inline CSS, JS and data.

#### Scenario: Offline open
- **WHEN** the report is opened without network access
- **THEN** all content, charts and interactions work

### Requirement: Hero summary
The report SHALL show total invested, current value, P&L, day change and a data-as-of timestamp at the top.

#### Scenario: Summary visible
- **WHEN** the report loads
- **THEN** the hero strip shows the portfolio totals and timestamp

### Requirement: Sector allocation chart
The report SHALL show a sector allocation donut chart with hover tooltips.

#### Scenario: Hover slice
- **WHEN** the user hovers a slice
- **THEN** the sector name and weight are shown

### Requirement: Cards and table views
The report SHALL offer card and sortable table views of holdings, sorted by action needed by default.

#### Scenario: Toggle view
- **WHEN** the user toggles to table view and sorts by P&L
- **THEN** rows reorder by P&L

### Requirement: Filter and search
The report SHALL filter by verdict, sector, red flags, winners and losers, and search by ticker or name.

#### Scenario: Search
- **WHEN** the user types "infy" in the search box
- **THEN** only matching holdings remain visible

### Requirement: Stock detail and methodology
Each holding SHALL expand to show full metrics, scores, verdict, triggers and confidence, and the report SHALL include a methodology section explaining scoring weights.

#### Scenario: Expand card
- **WHEN** the user expands a holding
- **THEN** its metrics, scores, rationale and triggers are shown

### Requirement: Partial-data warning
Holdings with failed or missing enrichment SHALL display a warning badge.

#### Scenario: Partial card
- **WHEN** a holding is partial
- **THEN** its card shows a warning badge and the available data

### Requirement: No secrets in output
The report and JSON output MUST NOT contain tokens, client secrets or account identifiers.

#### Scenario: Secret scan
- **WHEN** the output files are searched for token and credential values
- **THEN** no matches are found

### Requirement: Disclaimer and presentation
The report SHALL include an informational-only disclaimer, default to dark mode with a light toggle, be print-friendly and responsive.

#### Scenario: Disclaimer present
- **WHEN** the report is rendered
- **THEN** the footer states it is not investment advice

### Requirement: JSON side-output
The system SHALL write a JSON file with the computed data next to the HTML report.

#### Scenario: JSON written
- **WHEN** a run completes
- **THEN** a JSON file with the same date stem exists beside the HTML
