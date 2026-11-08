'use strict';

const fs = require('fs');

/**
 * Strip inline comment outside quoted strings.
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && line[i - 1] !== '\\') {
      inDouble = !inDouble;
    } else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i).trimEnd();
      }
    }
  }
  return line.trimEnd();
}

/**
 * Parse a scalar or inline JSON value (array/object/string/number/boolean/null).
 * @param {string} raw
 * @returns {*}
 */
function parseScalar(raw) {
  const val = raw.trim();
  if (val === '') return null;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return null;

  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    if (val.startsWith('"')) {
      try {
        return JSON.parse(val);
      } catch (_) {
        return val.slice(1, -1);
      }
    }
    return val.slice(1, -1);
  }

  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (inner === '') return [];
    try {
      return JSON.parse(val);
    } catch (_) {
      return inner.split(',').map((item) => parseScalar(item));
    }
  }

  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1).trim();
    if (inner === '') return {};
    try {
      return JSON.parse(val);
    } catch (_) {
      const obj = {};
      for (const pair of inner.split(',')) {
        const idx = pair.indexOf(':');
        if (idx !== -1) {
          const k = parseScalar(pair.slice(0, idx));
          const v = parseScalar(pair.slice(idx + 1));
          obj[String(k)] = v;
        }
      }
      return obj;
    }
  }

  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val)) {
    return Number(val);
  }

  return val;
}

/**
 * Parse a YAML or JSON string into a JavaScript object.
 * Supports nested maps, block sequences, inline arrays/maps, scalars, and comments.
 * @param {string} text
 * @returns {object}
 */
function parseYamlOrJson(text) {
  if (typeof text !== 'string') {
    throw new Error('Manifest content must be a string');
  }

  const trimmed = text.trim();
  if (trimmed === '') {
    throw new Error('Manifest content is empty');
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  const rawLines = text.split(/\r?\n/);
  const tokens = [];

  for (let i = 0; i < rawLines.length; i++) {
    const cleaned = stripComment(rawLines[i]);
    if (cleaned.trim() === '' || cleaned.trim() === '---') continue;
    const indentMatch = cleaned.match(/^( *)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    tokens.push({
      lineNum: i + 1,
      indent,
      text: cleaned.trim()
    });
  }

  if (tokens.length === 0) {
    return {};
  }

  let pos = 0;

  function parseBlock(minIndent) {
    if (pos >= tokens.length) return {};
    const first = tokens[pos];
    if (first.indent < minIndent) return {};

    if (first.text.startsWith('- ') || first.text === '-') {
      return parseSequence(first.indent);
    }
    return parseMapping(first.indent);
  }

  function parseSequence(seqIndent) {
    const arr = [];
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.indent < seqIndent) break;
      if (tok.indent > seqIndent) {
        throw new Error(`Invalid indentation at line ${tok.lineNum}: ${tok.text}`);
      }
      if (!tok.text.startsWith('- ') && tok.text !== '-') break;

      const rest = tok.text.slice(1).trim();
      pos++;

      if (rest === '') {
        if (pos < tokens.length && tokens[pos].indent > seqIndent) {
          arr.push(parseBlock(tokens[pos].indent));
        } else {
          arr.push(null);
        }
      } else {
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  function parseMapping(mapIndent) {
    const obj = {};
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.indent < mapIndent) break;
      if (tok.indent > mapIndent) {
        throw new Error(`Unexpected indentation at line ${tok.lineNum}: ${tok.text}`);
      }
      if (tok.text.startsWith('- ') || tok.text === '-') break;

      const colonIdx = tok.text.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(`Expected key: value pair at line ${tok.lineNum}: ${tok.text}`);
      }

      const rawKey = tok.text.slice(0, colonIdx).trim();
      const key = String(parseScalar(rawKey));
      const rawVal = tok.text.slice(colonIdx + 1).trim();
      pos++;

      if (rawVal === '') {
        if (pos < tokens.length && tokens[pos].indent > mapIndent) {
          obj[key] = parseBlock(tokens[pos].indent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseScalar(rawVal);
      }
    }
    return obj;
  }

  return parseBlock(tokens[0].indent);
}

/**
 * Load and parse a YAML or JSON manifest file from disk.
 * @param {string} filePath
 * @returns {object}
 */
function loadManifestFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`Manifest file not found: ${filePath}`);
    err.code = 'ERR_MANIFEST_NOT_FOUND';
    throw err;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return parseYamlOrJson(content);
  } catch (parseErr) {
    const err = new Error(`Failed to parse manifest (${filePath}): ${parseErr.message}`);
    err.code = 'ERR_SCHEMA_INVALID';
    throw err;
  }
}

module.exports = {
  stripComment,
  parseScalar,
  parseYamlOrJson,
  loadManifestFile
};

