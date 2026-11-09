# INDmoney MCP Configuration

This directory contains configuration and credentials for the INDmoney DriveWealth US Equities Model Context Protocol (MCP) server.

## Files
- `mcp.json`: Server endpoint and HTTP transport configuration.
- `.env`: Active authentication Bearer token. *(Git-ignored)*
- `.env.example`: Template for credentials.

## Interactive Token Renewal
To authenticate or renew your token via OAuth PKCE:
```bash
node scripts/framework/renew_token.js --service indmoney
```

