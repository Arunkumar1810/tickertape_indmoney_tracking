# Tickertape Pro MCP Configuration

This directory contains configuration, client credentials, and OAuth tokens for the Tickertape Pro Market Data Model Context Protocol (MCP) server.

## Files
- `mcp.json`: Server endpoint and HTTP transport configuration.
- `client_credentials.json`: Dynamic OAuth client registration credentials. *(Git-ignored)*
- `tokens.json`: Active OAuth access and refresh tokens. *(Git-ignored)*

## Token Renewal
To renew or authenticate with Tickertape OAuth:
```bash
node scripts/framework/renew_token.js --service tickertape
```

