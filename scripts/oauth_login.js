#!/usr/bin/env node
'use strict';

/**
 * scripts/oauth_login.js: Standalone CLI wrapper for INDmoney OAuth flow.
 */

const { performIndmoneyOAuthLogin } = require('./indmoney/oauth');

performIndmoneyOAuthLogin()
  .then((res) => {
    process.exit(res && res.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('Failed to authenticate:', err.message);
    process.exit(1);
  });
