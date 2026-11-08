#!/usr/bin/env node
'use strict';

/**
 * renew_token.js: CLI Token Renewal Utility.
 * Interactive and argument-driven credential updates for Angel One, INDmoney, and Tickertape Pro.
 *
 * Usage:
 *   node .agents/shared/framework/renew_token.js --service indmoney --token <TOKEN>
 *   node .agents/shared/framework/renew_token.js --service tickertape --token <TOKEN> [--refresh-token <REFRESH>]
 *   node .agents/shared/framework/renew_token.js --service angelone [--jwt <TOKEN>] [--api-key <KEY>] [--totp <KEY>]
 *   node .agents/shared/framework/renew_token.js --service <SERVICE>   # Interactive TTY mode
 */

const {
  KNOWN_SERVICES,
  saveServiceCredentials,
  promptTokenRenewal,
  formatRenewalInstructions
} = require('./auth_manager');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    service: null,
    token: null,
    jwt: null,
    apiKey: null,
    clientCode: null,
    password: null,
    totp: null,
    refreshToken: null,
    envPath: null,
    tokensPath: null,
    nonInteractive: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new Error(`Missing value for ${k}`);
      }
      return argv[++i];
    };

    if (k === '-s' || k === '--service') args.service = next().toLowerCase();
    else if (k === '--token') args.token = next();
    else if (k === '--jwt') args.jwt = next();
    else if (k === '--api-key') args.apiKey = next();
    else if (k === '--client-code') args.clientCode = next();
    else if (k === '--password') args.password = next();
    else if (k === '--totp') args.totp = next();
    else if (k === '--refresh-token') args.refreshToken = next();
    else if (k === '--env') args.envPath = next();
    else if (k === '--tokens-path') args.tokensPath = next();
    else if (k === '--non-interactive') args.nonInteractive = true;
    else if (k === '-h' || k === '--help') args.help = true;
    else throw new Error(`Unknown option: ${k}`);
  }

  return args;
}

const USAGE = `
Usage:
  node renew_token.js --service <angelone|indmoney|tickertape> [options]

Options:
  -s, --service       Target service: angelone, indmoney, tickertape (required)
  --token             Token value (INDmoney MCP token, Tickertape access token, or Angel One JWT)
  --jwt               Angel One session JWT token
  --api-key           Angel One SmartAPI API key
  --client-code       Angel One Client Code
  --password          Angel One Account Password
  --totp              Angel One Authenticator TOTP Secret
  --refresh-token     Tickertape OAuth refresh token
  --env               Path to destination .env file (default: repo root .env)
  --tokens-path       Path to Tickertape tokens.json (default: .agents/shared/tickertape/tokens.json)
  --non-interactive   Disable interactive prompts
  -h, --help          Show this help message
`;

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n${USAGE}\n`);
    process.exit(1);
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (!args.service) {
    process.stderr.write(`Error: Missing required --service parameter.\n${USAGE}\n`);
    process.exit(1);
  }

  if (!KNOWN_SERVICES.has(args.service)) {
    process.stderr.write(`Error: Invalid service "${args.service}". Allowed: ${Array.from(KNOWN_SERVICES).join(', ')}\n`);
    process.exit(1);
  }

  const s = args.service;
  const directCreds = {};

  if (s === 'angelone') {
    if (args.jwt || args.token) directCreds.ANGELONE_JWT_TOKEN = args.jwt || args.token;
    if (args.apiKey) directCreds.ANGELONE_API_KEY = args.apiKey;
    if (args.clientCode) directCreds.ANGELONE_CLIENT_CODE = args.clientCode;
    if (args.password) directCreds.ANGELONE_PASSWORD = args.password;
    if (args.totp) directCreds.ANGELONE_TOTP_KEY = args.totp;
  } else if (s === 'indmoney') {
    if (args.token) directCreds.token = args.token;
  } else if (s === 'tickertape') {
    if (args.token) directCreds.access_token = args.token;
    if (args.refreshToken) directCreds.refresh_token = args.refreshToken;
  }

  const hasDirectCreds = Object.keys(directCreds).length > 0;

  if (hasDirectCreds) {
    try {
      const res = saveServiceCredentials(s, directCreds, {
        envPath: args.envPath,
        tokensPath: args.tokensPath
      });
      process.stdout.write(`\n[SUCCESS] Credentials for "${s}" saved successfully.\nDestination: ${res.destination}\nUpdated keys: ${res.updatedKeys.join(', ')}\n\n`);
      return;
    } catch (err) {
      process.stderr.write(`\n[ERROR] Failed to save credentials for "${s}": ${err.message}\n\n`);
      process.exit(1);
    }
  }

  // Fallback to interactive prompt or non-interactive instructions
  try {
    const res = await promptTokenRenewal(s, {
      envPath: args.envPath,
      tokensPath: args.tokensPath,
      nonInteractive: args.nonInteractive
    });

    if (res.success) {
      process.stdout.write(`\n[SUCCESS] Credentials for "${s}" updated successfully.\nDestination: ${res.destination}\nUpdated keys: ${res.updatedKeys.join(', ')}\n\n`);
    } else {
      process.stderr.write(`\n[INFO] Token renewal for "${s}" not completed.\n`);
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`\n[ERROR] Unexpected error during token renewal: ${err.message}\n\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, parseArgs };

