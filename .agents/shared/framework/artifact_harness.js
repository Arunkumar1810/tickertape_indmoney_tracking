'use strict';

const fs = require('fs');
const path = require('path');

const {
  validateNormalizedFinancials,
  validateUniformVerdict,
  validateUniformVerdictBatch,
  validateAccountHoldingsSnapshot,
  validateBlendedHoldings,
  validateStrategyXirr,
  validateVerdictSynthesis,
  validateConsolidatedPortfolio
} = require('./contract_validator');
const { validateManifestObject } = require('./manifest_validator');

const VALID_SCHEMA_TYPES = new Set([
  'financials',
  'verdict',
  'verdict-batch',
  'manifest',
  'holdings',
  'blended-holdings',
  'strategy-xirr',
  'verdict-synthesis',
  'strategy-verdict-synthesis',
  'consolidated-portfolio',
  'strategy-consolidated-portfolio',
  'none'
]);

// Regular expressions to detect external network asset leaks in HTML
const RE_EXTERNAL_LINK = /<link\b[^>]*\bhref\s*=\s*["']\s*(https?:|\/\/)[^"']*["'][^>]*>/gi;
const RE_EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["']\s*(https?:|\/\/)[^"']*["'][^>]*>/gi;
const RE_EXTERNAL_IMG = /<img\b[^>]*\bsrc\s*=\s*["']\s*(https?:|\/\/)[^"']*["'][^>]*>/gi;
const RE_EXTERNAL_STYLE_IMPORT = /@import\s+(?:url\(\s*['"]?\s*(https?:|\/\/)|['"]\s*(https?:|\/\/))/gi;

/**
 * Verify an HTML string or file for document structure and offline self-containment.
 * @param {string} htmlContentOrPath
 * @param {object} [options]
 * @param {boolean} [options.allowExternalAssets=false]
 * @param {number} [options.minSizeBytes=50]
 * @returns {{ ok: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function verifyHtmlSelfContainment(htmlContentOrPath, options = {}) {
  const allowExternalAssets = options.allowExternalAssets === true;
  const minSizeBytes = typeof options.minSizeBytes === 'number' ? options.minSizeBytes : 50;
  const errors = [];

  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  let htmlContent = '';
  let sourceIdentifier = '$';

  if (typeof htmlContentOrPath !== 'string') {
    addError('ERR_HTML_INVALID_INPUT', '$', 'HTML input must be a file path string or HTML content string');
    return { ok: false, errors, summary: {} };
  }

  // Check if input is an existing file path
  if (htmlContentOrPath.includes('\n') || htmlContentOrPath.includes('<')) {
    htmlContent = htmlContentOrPath;
    sourceIdentifier = '<inline-html>';
  } else {
    sourceIdentifier = htmlContentOrPath;
    if (!fs.existsSync(htmlContentOrPath)) {
      addError('ERR_HTML_FILE_NOT_FOUND', sourceIdentifier, `HTML artifact not found at ${htmlContentOrPath}`);
      return { ok: false, errors, summary: {} };
    }
    try {
      htmlContent = fs.readFileSync(htmlContentOrPath, 'utf8');
    } catch (err) {
      addError('ERR_HTML_READ_ERROR', sourceIdentifier, `Failed to read HTML file: ${err.message}`);
      return { ok: false, errors, summary: {} };
    }
  }

  const byteLength = Buffer.byteLength(htmlContent, 'utf8');

  // 1. Minimum size / non-empty check
  if (byteLength < minSizeBytes) {
    addError(
      'ERR_HTML_EMPTY_OR_TRUNCATED',
      sourceIdentifier,
      `HTML content is too small or empty (${byteLength} bytes, minimum required is ${minSizeBytes} bytes)`
    );
  }

  // 2. Standard document tags check
  const hasDocType = /<!DOCTYPE\s+html/i.test(htmlContent);
  const hasHtmlTag = /<html\b/i.test(htmlContent);
  const hasBodyTag = /<body\b/i.test(htmlContent);

  if (!hasDocType && !hasHtmlTag) {
    addError(
      'ERR_HTML_MALFORMED',
      sourceIdentifier,
      'HTML artifact lacks standard <!DOCTYPE html> or <html> document structure'
    );
  }

  let externalLeaksCount = 0;

  // 3. External asset leaks detection (unless allowExternalAssets is true)
  if (!allowExternalAssets) {
    let match;

    // Check external <link> stylesheets / fonts
    const linkScanner = new RegExp(RE_EXTERNAL_LINK);
    while ((match = linkScanner.exec(htmlContent)) !== null) {
      externalLeaksCount++;
      addError(
        'ERR_EXTERNAL_STYLE_LINK',
        sourceIdentifier,
        `External network asset in <link> tag detected: ${match[0].slice(0, 100)}`
      );
    }

    // Check external <script src="...">
    const scriptScanner = new RegExp(RE_EXTERNAL_SCRIPT);
    while ((match = scriptScanner.exec(htmlContent)) !== null) {
      externalLeaksCount++;
      addError(
        'ERR_EXTERNAL_SCRIPT_TAG',
        sourceIdentifier,
        `External network script in <script src="..."> detected: ${match[0].slice(0, 100)}`
      );
    }

    // Check external <img src="...">
    const imgScanner = new RegExp(RE_EXTERNAL_IMG);
    while ((match = imgScanner.exec(htmlContent)) !== null) {
      externalLeaksCount++;
      addError(
        'ERR_EXTERNAL_IMAGE_URL',
        sourceIdentifier,
        `External network image in <img src="..."> detected: ${match[0].slice(0, 100)}`
      );
    }

    // Check external CSS @import
    const importScanner = new RegExp(RE_EXTERNAL_STYLE_IMPORT);
    while ((match = importScanner.exec(htmlContent)) !== null) {
      externalLeaksCount++;
      addError(
        'ERR_EXTERNAL_STYLE_IMPORT',
        sourceIdentifier,
        `External @import rule detected in stylesheet: ${match[0].slice(0, 100)}`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      source: sourceIdentifier,
      byteLength,
      hasDocType,
      hasHtmlTag,
      hasBodyTag,
      externalLeaksCount,
      allowExternalAssets
    }
  };
}

/**
 * Verify a single skill execution's JSON contract + HTML dashboard artifact pair.
 * @param {object} params
 * @param {string} [params.jsonPath]
 * @param {string} [params.htmlPath]
 * @param {string} [params.schemaType='none']
 * @param {boolean} [params.allowExternalAssets=false]
 * @param {object|string} [params.jsonContent]
 * @param {string} [params.htmlContent]
 * @returns {{ ok: boolean, jsonOk: boolean, htmlOk: boolean, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function verifyArtifactPair(params = {}) {
  const {
    jsonPath,
    htmlPath,
    schemaType = 'none',
    allowExternalAssets = false,
    jsonContent,
    htmlContent
  } = params;

  const errors = [];
  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  if (!VALID_SCHEMA_TYPES.has(schemaType)) {
    addError(
      'ERR_UNSUPPORTED_SCHEMA_TYPE',
      'schemaType',
      `Unsupported schema type "${schemaType}". Expected one of [${[...VALID_SCHEMA_TYPES].join(', ')}]`
    );
  }

  let jsonOk = true;
  let parsedJson = null;
  let jsonSource = jsonPath || '<inline-json>';

  // 1. JSON Verification
  if (jsonContent !== undefined && jsonContent !== null) {
    if (typeof jsonContent === 'string') {
      try {
        parsedJson = JSON.parse(jsonContent);
      } catch (err) {
        jsonOk = false;
        addError('ERR_INVALID_JSON', jsonSource, `Failed to parse JSON content: ${err.message}`);
      }
    } else if (typeof jsonContent === 'object') {
      parsedJson = jsonContent;
    } else {
      jsonOk = false;
      addError('ERR_INVALID_JSON', jsonSource, 'jsonContent must be an object or valid JSON string');
    }
  } else if (jsonPath) {
    if (!fs.existsSync(jsonPath)) {
      jsonOk = false;
      addError('ERR_JSON_FILE_NOT_FOUND', jsonPath, `JSON contract artifact not found at ${jsonPath}`);
    } else {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        if (Buffer.byteLength(raw, 'utf8') === 0) {
          jsonOk = false;
          addError('ERR_JSON_EMPTY', jsonPath, `JSON file at ${jsonPath} is empty (0 bytes)`);
        } else {
          parsedJson = JSON.parse(raw);
        }
      } catch (err) {
        jsonOk = false;
        addError('ERR_INVALID_JSON', jsonPath, `Failed to parse JSON file: ${err.message}`);
      }
    }
  } else {
    jsonOk = false;
    addError('ERR_JSON_MISSING_TARGET', '$', 'No jsonPath or jsonContent provided for verification');
  }

  // Schema-specific validation
  if (jsonOk && parsedJson !== null && schemaType !== 'none') {
    let schemaResult;
    if (schemaType === 'financials') {
      schemaResult = validateNormalizedFinancials(parsedJson);
    } else if (schemaType === 'verdict') {
      schemaResult = validateUniformVerdict(parsedJson);
    } else if (schemaType === 'verdict-batch') {
      schemaResult = validateUniformVerdictBatch(parsedJson);
    } else if (schemaType === 'manifest') {
      schemaResult = validateManifestObject(parsedJson);
    } else if (schemaType === 'holdings') {
      schemaResult = validateAccountHoldingsSnapshot(parsedJson);
    } else if (schemaType === 'blended-holdings') {
      schemaResult = validateBlendedHoldings(parsedJson);
    } else if (schemaType === 'strategy-xirr') {
      schemaResult = validateStrategyXirr(parsedJson);
    } else if (schemaType === 'verdict-synthesis' || schemaType === 'strategy-verdict-synthesis') {
      schemaResult = validateVerdictSynthesis(parsedJson);
    } else if (schemaType === 'consolidated-portfolio' || schemaType === 'strategy-consolidated-portfolio') {
      schemaResult = validateConsolidatedPortfolio(parsedJson);
    }

    if (schemaResult && !schemaResult.ok) {
      jsonOk = false;
      for (const err of schemaResult.errors) {
        errors.push({
          code: err.code,
          path: `${jsonSource}:${err.path}`,
          message: err.message
        });
      }
    }
  }

  // 2. HTML Verification
  let htmlOk = true;
  let htmlTarget = htmlContent || htmlPath;
  let htmlResult = { summary: {} };

  if (htmlTarget) {
    htmlResult = verifyHtmlSelfContainment(htmlTarget, { allowExternalAssets });
    if (!htmlResult.ok) {
      htmlOk = false;
      for (const err of htmlResult.errors) {
        errors.push(err);
      }
    }
  } else {
    htmlOk = false;
    addError('ERR_HTML_FILE_NOT_FOUND', '$', 'No htmlPath or htmlContent provided for verification');
  }

  const ok = jsonOk && htmlOk && errors.length === 0;

  return {
    ok,
    jsonOk,
    htmlOk,
    errors,
    summary: {
      jsonSource,
      htmlSource: htmlPath || '<inline-html>',
      schemaType,
      jsonParsed: parsedJson !== null,
      htmlSummary: htmlResult.summary
    }
  };
}

/**
 * Scan an output directory for matching <prefix>*.json and <prefix>*.html artifact pairs.
 * @param {string} dirPath
 * @param {object} [options]
 * @param {string} [options.prefix='']
 * @param {string} [options.schemaType='none']
 * @param {boolean} [options.allowExternalAssets=false]
 * @returns {{ ok: boolean, pairsCount: number, errors: Array<{ code: string, path: string, message: string }>, summary: object }}
 */
function verifyDirectoryArtifacts(dirPath, options = {}) {
  const prefix = options.prefix || '';
  const schemaType = options.schemaType || 'none';
  const allowExternalAssets = options.allowExternalAssets === true;
  const errors = [];

  function addError(code, fieldPath, message) {
    errors.push({ code, path: fieldPath, message });
  }

  const resolvedDir = path.resolve(dirPath || '.');
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    addError('ERR_DIR_NOT_FOUND', resolvedDir, `Directory not found: ${resolvedDir}`);
    return { ok: false, pairsCount: 0, errors, summary: {} };
  }

  const entries = fs.readdirSync(resolvedDir);
  const jsonFiles = new Set();
  const htmlFiles = new Set();

  for (const file of entries) {
    if (prefix && !file.startsWith(prefix)) {
      continue;
    }
    if (file.endsWith('.json')) {
      jsonFiles.add(file.slice(0, -5));
    } else if (file.endsWith('.html')) {
      htmlFiles.add(file.slice(0, -5));
    }
  }

  // Detect orphan JSON files
  for (const base of jsonFiles) {
    if (!htmlFiles.has(base)) {
      addError(
        'ERR_UNPAIRED_ARTIFACT',
        path.join(resolvedDir, `${base}.json`),
        `Unpaired artifact: "${base}.json" exists without companion "${base}.html"`
      );
    }
  }

  // Detect orphan HTML files
  for (const base of htmlFiles) {
    if (!jsonFiles.has(base)) {
      addError(
        'ERR_UNPAIRED_ARTIFACT',
        path.join(resolvedDir, `${base}.html`),
        `Unpaired artifact: "${base}.html" exists without companion "${base}.json"`
      );
    }
  }

  // Verify all matching pairs
  const commonBases = [...jsonFiles].filter((b) => htmlFiles.has(b));
  for (const base of commonBases) {
    const pairResult = verifyArtifactPair({
      jsonPath: path.join(resolvedDir, `${base}.json`),
      htmlPath: path.join(resolvedDir, `${base}.html`),
      schemaType,
      allowExternalAssets
    });

    if (!pairResult.ok) {
      for (const err of pairResult.errors) {
        errors.push(err);
      }
    }
  }

  return {
    ok: errors.length === 0,
    pairsCount: commonBases.length,
    errors,
    summary: {
      directory: resolvedDir,
      totalJson: jsonFiles.size,
      totalHtml: htmlFiles.size,
      matchedPairs: commonBases.length
    }
  };
}

/**
 * CLI execution entrypoint for artifact_harness.js.
 * @param {string[]} argv
 * @returns {number} exit code
 */
function runHarnessCli(argv = process.argv.slice(2)) {
  let jsonPath = null;
  let htmlPath = null;
  let dirPath = null;
  let prefix = '';
  let schemaType = 'none';
  let allowExternalAssets = false;
  let jsonOutput = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json-output') {
      jsonOutput = true;
    } else if (arg === '--allow-external-assets') {
      allowExternalAssets = true;
    } else if (arg === '--json' && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      jsonPath = argv[++i];
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg.startsWith('--json=')) {
      jsonPath = arg.slice('--json='.length);
    } else if (arg === '--html' && i + 1 < argv.length) {
      htmlPath = argv[++i];
    } else if (arg.startsWith('--html=')) {
      htmlPath = arg.slice('--html='.length);
    } else if (arg === '--dir' && i + 1 < argv.length) {
      dirPath = argv[++i];
    } else if (arg.startsWith('--dir=')) {
      dirPath = arg.slice('--dir='.length);
    } else if (arg === '--prefix' && i + 1 < argv.length) {
      prefix = argv[++i];
    } else if (arg.startsWith('--prefix=')) {
      prefix = arg.slice('--prefix='.length);
    } else if (arg === '--schema' && i + 1 < argv.length) {
      schemaType = argv[++i];
    } else if (arg.startsWith('--schema=')) {
      schemaType = arg.slice('--schema='.length);
    }
  }

  let result;
  if (dirPath) {
    result = verifyDirectoryArtifacts(dirPath, {
      prefix,
      schemaType,
      allowExternalAssets
    });
  } else {
    result = verifyArtifactPair({
      jsonPath,
      htmlPath,
      schemaType,
      allowExternalAssets
    });
  }

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(
      `[OK] Artifact verification passed (schema: ${schemaType}, externalAssetsAllowed: ${allowExternalAssets})\n`
    );
  } else {
    process.stderr.write(`[FAIL] Artifact verification failed with ${result.errors.length} error(s):\n`);
    for (const err of result.errors) {
      process.stderr.write(`  - [${err.code}] (${err.path}): ${err.message}\n`);
    }
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  const code = runHarnessCli();
  process.exit(code);
}

module.exports = {
  verifyHtmlSelfContainment,
  verifyArtifactPair,
  verifyDirectoryArtifacts,
  runHarnessCli
};
