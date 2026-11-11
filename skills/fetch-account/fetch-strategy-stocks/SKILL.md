---
name: fetch-strategy-stocks
description: Fetches and consolidates account holdings for a target investment strategy. Resolves assigned accounts from config/investment_ways.yaml, calls their respective fetch skills (fetch-angelone, fetch-indmoney-us), blends positions with Weighted Average Cost (WAC), pools cash, and emits twin AccountHoldingsSnapshot artifacts (JSON and offline HTML dashboard). Use when the user asks to fetch strategy stocks, get holdings for a strategy, run fetch-strategy-stocks, blend positions for an investment way, or check strategy holdings.
---

# fetch-strategy-stocks

Tier 1 Strategy Holdings Orchestrator & Multi-Account Blender.

Resolves assigned broker accounts for a designated investment strategy from `config/investment_ways.yaml`, calls their respective fetch skills dynamically (`fetch-angelone`, `fetch-indmoney-us`), blends duplicate positions across accounts using volume-weighted average cost (WAC), pools multi-currency cash balances with FX currency conversion, preserves immutable lot-level account attribution tranches, and emits canonical twin `AccountHoldingsSnapshot` artifacts (JSON data contract and self-contained offline HTML dashboard).

## Usage

```bash
# Fetch holdings for default strategy (fundamental_lts)
node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js

# Fetch holdings for a specific strategy
node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js --strategy fundamental_lts
node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js --strategy fundamental_foreign

# List all available strategies defined in manifest
node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js --list

# Force live re-fetch from underlying broker accounts
node skills/fetch-account/fetch-strategy-stocks/scripts/fetch_strategy_stocks.js --strategy fundamental_lts --refresh
```

### CLI Options

| Flag | Meaning |
|---|---|
| `--strategy, --way <ID>` | Target strategy way ID from `config/investment_ways.yaml` (default: `fundamental_lts`) |
| `--list` | List available strategies, currencies, and assigned accounts from the manifest |
| `--refresh` | Force live broker refresh across all underlying accounts in the strategy |
| `--only <TICKER>` | Filter blended holdings to a single ticker symbol |
| `--out <DIR>` | Output directory for reports (default: `reports/`) |
| `--manifest <PATH>` | Custom path to `investment_ways.yaml` (default: `config/investment_ways.yaml`) |
| `--mock-data <PATH>` | Load mock account snapshots JSON for offline testing |
| `--json, --json-output` | Output machine-readable JSON summary and artifact paths to stdout |
| `-h, --help` | Display usage instructions and available parameters |

### Generated Artifacts

Every execution emits canonical twin artifacts conforming strictly to `AccountHoldingsSnapshot`:

- **Strategy JSON Contract**:
  - `reports/strategies/<STRATEGY_ID>_holdings.json`
  - `reports/accounts/<STRATEGY_ID>.json` (mirrored for fetch-account compatibility)
- **Offline Self-Contained HTML Dashboard**:
  - `reports/strategies/<STRATEGY_ID>_holdings.html`
  - `reports/accounts/<STRATEGY_ID>.html` (mirrored for fetch-account compatibility)

### Contract Schema & Structure

Emits canonical `AccountHoldingsSnapshot` with the exact same structure as other fetch skills:

- `account_id`: Strategy identifier (e.g., `fundamental_lts`, `fundamental_foreign`)
- `broker`: Strategy display name (e.g., `Strategy: Fundamental Long-Term Stocks (India)`)
- `currency`: Base currency of the strategy (`INR`, `USD`)
- `timestamp`: ISO 8601 generation timestamp
- `summary`:
  - `total_invested`: Consolidated invested cost basis
  - `total_current_value`: Current market valuation
  - `unrealized_pnl`: Total unrealized gain/loss
  - `unrealized_pnl_pct`: Total unrealized return percentage
  - `available_cash`: Total pooled ledger cash across accounts
  - `total_account_equity`: Total strategy equity (`total_current_value + available_cash`)
  - `holdings_count`: Number of distinct positions
- `margin`: Margin availability and collateral tracking
- `holdings`: Array of blended positions with WAC, CMP, invested value, current value, concentration weight %, and lot-level `attribution`
- `accounts_blended`: Summary of individual accounts contributing to the strategy

