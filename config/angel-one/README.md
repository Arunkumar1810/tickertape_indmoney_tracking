# Angel One SmartAPI MCP Configuration

This directory contains configuration and credentials for the Angel One SmartAPI Model Context Protocol (MCP) server.

## Files
- `mcp.json`: Server transport and process execution configuration.
- `.env`: Active credentials (API key, client code, PIN, and TOTP secret). *(Git-ignored)*
- `.env.example`: Template for credentials.

## Server Details
- Transport: `stdio` (spawns Python SmartAPI MCP server via `uv run`) or `http` (local/remote proxy).
- Python MCP Server location: `.agents/mcp/angelone-server/`

