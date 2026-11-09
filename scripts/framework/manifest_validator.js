'use strict';

const path = require('path');
const { loadManifestFile } = require('./yaml_loader');

const WEIGHT_TOLERANCE = 1e-6;

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Validate a parsed manifest object against structural schema and set-theoretic invariants.
 * @param {object} manifest
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function validateManifestObject(manifest) {
  const errors = [];

  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!isPlainObject(manifest)) {
    addError('ERR_SCHEMA_INVALID', '$', 'Manifest root must be a JSON/YAML object');
    return { ok: false, errors, summary: {} };
  }

  const requiredTopKeys = [
    'version',
    'accounts',
    'data_providers',
    'gatekeepers',
    'analysis_principles',
    'investment_ways'
  ];

  for (const key of requiredTopKeys) {
    if (!(key in manifest)) {
      addError('ERR_SCHEMA_INVALID', key, `Missing required top-level field "${key}"`);
    }
  }

  if (typeof manifest.version !== 'string' || !/^[0-9]+\.[0-9]+$/.test(manifest.version)) {
    addError('ERR_SCHEMA_INVALID', 'version', 'Field "version" must be a version string like "1.0"');
  }

  const accounts = isPlainObject(manifest.accounts) ? manifest.accounts : null;
  if (!accounts || Object.keys(accounts).length === 0) {
    addError('ERR_SCHEMA_INVALID', 'accounts', 'Section "accounts" must be a non-empty map of broker accounts');
  }

  const dataProviders = isPlainObject(manifest.data_providers) ? manifest.data_providers : null;
  if (!dataProviders || Object.keys(dataProviders).length === 0) {
    addError('ERR_SCHEMA_INVALID', 'data_providers', 'Section "data_providers" must be a non-empty map');
  }

  const gatekeepers = isPlainObject(manifest.gatekeepers) ? manifest.gatekeepers : null;
  if (!gatekeepers) {
    addError('ERR_SCHEMA_INVALID', 'gatekeepers', 'Section "gatekeepers" must be a map');
  }

  const principles = isPlainObject(manifest.analysis_principles) ? manifest.analysis_principles : null;
  if (!principles || Object.keys(principles).length === 0) {
    addError('ERR_SCHEMA_INVALID', 'analysis_principles', 'Section "analysis_principles" must be a non-empty map');
  }

  const ways = isPlainObject(manifest.investment_ways) ? manifest.investment_ways : null;
  if (!ways || Object.keys(ways).length === 0) {
    addError('ERR_SCHEMA_INVALID', 'investment_ways', 'Section "investment_ways" must be a non-empty map');
  }

  if (errors.length > 0) {
    return { ok: false, errors, summary: {} };
  }

  // Validate accounts entries
  for (const [accId, acc] of Object.entries(accounts)) {
    const basePath = `accounts.${accId}`;
    if (!isPlainObject(acc)) {
      addError('ERR_SCHEMA_INVALID', basePath, `Account "${accId}" must be an object`);
      continue;
    }
    if (typeof acc.broker !== 'string' || acc.broker.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.broker`, `Account "${accId}" requires a non-empty "broker" string`);
    }
    if (typeof acc.currency !== 'string' || !/^[A-Z]{3}$/.test(acc.currency)) {
      addError('ERR_SCHEMA_INVALID', `${basePath}.currency`, `Account "${accId}" requires a 3-letter ISO currency code`);
    }
    if (typeof acc.skill !== 'string' || acc.skill.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.skill`, `Account "${accId}" requires a non-empty "skill" identifier`);
    }
  }

  // Validate data_providers entries
  for (const [provId, prov] of Object.entries(dataProviders)) {
    const basePath = `data_providers.${provId}`;
    if (!isPlainObject(prov)) {
      addError('ERR_SCHEMA_INVALID', basePath, `Data provider "${provId}" must be an object`);
      continue;
    }
    if (typeof prov.skill !== 'string' || prov.skill.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.skill`, `Data provider "${provId}" requires a non-empty "skill"`);
    }
    if (!Array.isArray(prov.markets) || prov.markets.length === 0) {
      addError('ERR_SCHEMA_INVALID', `${basePath}.markets`, `Data provider "${provId}" requires a non-empty "markets" array`);
    }
  }

  // Validate gatekeepers entries
  for (const [gkId, gk] of Object.entries(gatekeepers)) {
    const basePath = `gatekeepers.${gkId}`;
    if (!isPlainObject(gk) || typeof gk.skill !== 'string' || gk.skill.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.skill`, `Gatekeeper "${gkId}" requires a non-empty "skill"`);
    }
  }

  // Validate analysis_principles entries
  for (const [prId, pr] of Object.entries(principles)) {
    const basePath = `analysis_principles.${prId}`;
    if (!isPlainObject(pr)) {
      addError('ERR_SCHEMA_INVALID', basePath, `Analysis principle "${prId}" must be an object`);
      continue;
    }
    if (typeof pr.skill !== 'string' || pr.skill.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.skill`, `Analysis principle "${prId}" requires a non-empty "skill"`);
    }
    if (typeof pr.category !== 'string' || pr.category.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.category`, `Analysis principle "${prId}" requires a non-empty "category"`);
    }
  }

  // Track account assignments across Investment Ways for strict 1-to-many partition
  const accountOwnerMap = new Map();

  for (const [wayId, way] of Object.entries(ways)) {
    const basePath = `investment_ways.${wayId}`;
    if (!isPlainObject(way)) {
      addError('ERR_SCHEMA_INVALID', basePath, `Investment Way "${wayId}" must be an object`);
      continue;
    }

    if (typeof way.title !== 'string' || way.title.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.title`, `Investment Way "${wayId}" requires a non-empty "title"`);
    }
    if (typeof way.skill !== 'string' || way.skill.trim() === '') {
      addError('ERR_SCHEMA_INVALID', `${basePath}.skill`, `Investment Way "${wayId}" requires a non-empty "skill"`);
    }
    if (typeof way.base_currency !== 'string' || !/^[A-Z]{3}$/.test(way.base_currency)) {
      addError('ERR_SCHEMA_INVALID', `${basePath}.base_currency`, `Investment Way "${wayId}" requires a 3-letter "base_currency"`);
    }

    // 1. Account bindings & strict partition check
    if (!Array.isArray(way.accounts) || way.accounts.length === 0) {
      addError(
        'ERR_EMPTY_ACCOUNTS',
        `${basePath}.accounts`,
        `Investment Way "${wayId}" must bind at least one broker account`
      );
    } else {
      const seenInWay = new Set();
      for (const accId of way.accounts) {
        if (seenInWay.has(accId)) {
          addError(
            'ERR_DUPLICATE_ACCOUNT_IN_WAY',
            `${basePath}.accounts`,
            `Investment Way "${wayId}" lists duplicate account "${accId}"`
          );
          continue;
        }
        seenInWay.add(accId);

        if (!(accId in accounts)) {
          addError(
            'ERR_UNKNOWN_ACCOUNT',
            `${basePath}.accounts`,
            `Investment Way "${wayId}" references unregistered account "${accId}"`
          );
          continue;
        }

        if (accountOwnerMap.has(accId)) {
          const firstOwner = accountOwnerMap.get(accId);
          addError(
            'ERR_ACCOUNT_PARTITION_COLLISION',
            `${basePath}.accounts`,
            `Account partition collision: account "${accId}" is assigned to both "${firstOwner}" and "${wayId}"`
          );
        } else {
          accountOwnerMap.set(accId, wayId);
        }
      }
    }

    // 2. Data provider reference check
    if (typeof way.data_provider !== 'string' || !(way.data_provider in dataProviders)) {
      addError(
        'ERR_UNKNOWN_PROVIDER',
        `${basePath}.data_provider`,
        `Investment Way "${wayId}" references unregistered data provider "${way.data_provider}"`
      );
    }

    // 3. Gatekeepers reference check
    if (!Array.isArray(way.gatekeepers)) {
      addError('ERR_SCHEMA_INVALID', `${basePath}.gatekeepers`, `Investment Way "${wayId}" requires a "gatekeepers" array`);
    } else {
      for (const gkId of way.gatekeepers) {
        if (!(gkId in gatekeepers)) {
          addError(
            'ERR_UNKNOWN_GATEKEEPER',
            `${basePath}.gatekeepers`,
            `Investment Way "${wayId}" references unregistered gatekeeper "${gkId}"`
          );
        }
      }
    }

    // 4. Analysis principles reference check
    const activePrinciples = Array.isArray(way.analysis_principles) ? way.analysis_principles : [];
    if (!Array.isArray(way.analysis_principles) || activePrinciples.length === 0) {
      addError(
        'ERR_SCHEMA_INVALID',
        `${basePath}.analysis_principles`,
        `Investment Way "${wayId}" requires a non-empty "analysis_principles" array`
      );
    } else {
      for (const prId of activePrinciples) {
        if (!(prId in principles)) {
          addError(
            'ERR_UNKNOWN_PRINCIPLE',
            `${basePath}.analysis_principles`,
            `Investment Way "${wayId}" references unregistered analysis principle "${prId}"`
          );
        }
      }
    }

    // 5. Weights normalization check
    if (!isPlainObject(way.weights)) {
      addError('ERR_SCHEMA_INVALID', `${basePath}.weights`, `Investment Way "${wayId}" requires a "weights" map`);
    } else {
      const weightKeys = Object.keys(way.weights);
      for (const prId of activePrinciples) {
        if (!(prId in way.weights)) {
          addError(
            'ERR_WEIGHT_SUM_MISMATCH',
            `${basePath}.weights.${prId}`,
            `Investment Way "${wayId}" is missing weight for active principle "${prId}"`
          );
        }
      }
      for (const wk of weightKeys) {
        if (!activePrinciples.includes(wk)) {
          addError(
            'ERR_WEIGHT_SUM_MISMATCH',
            `${basePath}.weights.${wk}`,
            `Investment Way "${wayId}" defines weight for "${wk}" which is not in its analysis_principles`
          );
        }
      }

      let weightSum = 0;
      let allNumericValid = true;
      for (const [wk, wVal] of Object.entries(way.weights)) {
        if (typeof wVal !== 'number' || !Number.isFinite(wVal) || wVal <= 0 || wVal > 1) {
          addError(
            'ERR_WEIGHT_SUM_MISMATCH',
            `${basePath}.weights.${wk}`,
            `Weight for "${wk}" in "${wayId}" must be a positive number in (0, 1], got ${wVal}`
          );
          allNumericValid = false;
        } else {
          weightSum += wVal;
        }
      }

      if (allNumericValid && weightKeys.length > 0 && Math.abs(weightSum - 1.0) > WEIGHT_TOLERANCE) {
        addError(
          'ERR_WEIGHT_SUM_MISMATCH',
          `${basePath}.weights`,
          `Valuation pillar weights in "${wayId}" must sum to 1.0 (got ${Number(weightSum.toFixed(6))})`
        );
      }
    }
  }

  // Check for orphan active accounts
  for (const [accId, acc] of Object.entries(accounts)) {
    const isActive = isPlainObject(acc) && acc.active !== false;
    if (isActive && !accountOwnerMap.has(accId)) {
      addError(
        'ERR_ORPHAN_ACCOUNT',
        `accounts.${accId}`,
        `Registered active account "${accId}" is not assigned to any Investment Way`
      );
    }
  }

  const summary = {
    version: manifest.version,
    totalAccounts: Object.keys(accounts).length,
    assignedAccounts: accountOwnerMap.size,
    totalInvestmentWays: Object.keys(ways).length,
    accountPartition: Object.fromEntries(accountOwnerMap.entries())
  };

  return {
    ok: errors.length === 0,
    errors,
    summary
  };
}

/**
 * Load and validate a manifest file from disk.
 * @param {string} [configPath]
 * @returns {{ ok: boolean, configPath: string, manifest?: object, errors: Array, summary: object }}
 */
function validateManifestFile(configPath) {
  const resolvedPath = path.resolve(
    configPath || path.join(process.cwd(), 'config', 'investment_ways.yaml')
  );

  try {
    const manifest = loadManifestFile(resolvedPath);
    const result = validateManifestObject(manifest);
    return {
      ok: result.ok,
      configPath: resolvedPath,
      manifest,
      errors: result.errors,
      summary: result.summary
    };
  } catch (err) {
    return {
      ok: false,
      configPath: resolvedPath,
      errors: [
        {
          code: err.code || 'ERR_MANIFEST_NOT_FOUND',
          path: '$',
          message: err.message
        }
      ],
      summary: {}
    };
  }
}

/**
 * CLI execution entrypoint.
 * @param {string[]} argv
 * @returns {number} exit code
 */
function runCli(argv = process.argv.slice(2)) {
  let configPath = null;
  let jsonMode = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--config' && i + 1 < argv.length) {
      configPath = argv[++i];
    } else if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
    }
  }

  const result = validateManifestFile(configPath);

  if (jsonMode) {
    const payload = {
      ok: result.ok,
      configPath: result.configPath,
      summary: result.summary,
      errors: result.errors
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(
      `[OK] Manifest valid (${result.configPath}): ${result.summary.assignedAccounts} accounts strictly partitioned across ${result.summary.totalInvestmentWays} investment ways.\n`
    );
  } else {
    process.stderr.write(`[FAIL] Manifest validation failed (${result.configPath}):\n`);
    for (const err of result.errors) {
      process.stderr.write(`  - [${err.code}] (${err.path}): ${err.message}\n`);
    }
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  const code = runCli();
  process.exit(code);
}

module.exports = {
  WEIGHT_TOLERANCE,
  validateManifestObject,
  validateManifestFile,
  runCli
};

