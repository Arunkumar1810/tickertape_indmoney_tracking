'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  weights: { quality: 0.25, valuation: 0.25, momentum: 0.15, analyst: 0.15, risk: 0.2 },
  caps: { stockWeightPct: 15, sectorWeightPct: 30 },
  thresholds: {
    accumulateOverall: 70,
    accumulateMinValuation: 50,
    holdOverall: 50,
    reviewBelow: 45,
    exitBelow: 30,
    exitMaxRisk: 30,
    trimValuationMax: 25,
    trimMaxOverall: 60,
    concentrationTrimMaxOverall: 65,
    hysteresis: 5
  },
  tax: { ltcgDays: 365, nearWindowDays: 60 },
  concurrency: 3,
  buyDates: {}
};

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

// Skill root: .agents/skills/fetch-lts/scripts/lib -> up 2. Everything the skill needs lives under it.
const SKILL_ROOT = path.resolve(__dirname, '..', '..');

function loadConfig(file) {
  const p = file || path.join(SKILL_ROOT, 'config', 'lts.config.json');
  if (!fs.existsSync(p)) return deepMerge(DEFAULTS, {});
  try {
    return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch (e) {
    console.warn(`Warning: could not parse ${p} (${e.message}); using defaults.`);
    return deepMerge(DEFAULTS, {});
  }
}

module.exports = { DEFAULTS, loadConfig, deepMerge, SKILL_ROOT };
