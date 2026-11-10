#!/usr/bin/env node
'use strict';

/**
 * evaluate_competence.js:
 * Warren Buffett Circle of Competence Diagnostic Questionnaire Engine.
 * Evaluates investor comprehension of business model, unit economics,
 * moat durability, and management integrity before position increases.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = fs.existsSync(path.resolve(__dirname, '../../../package.json'))
  ? path.resolve(__dirname, '../../..')
  : path.resolve(__dirname, '../../../..');

const DEFAULT_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'circle_of_competence.json');

const QUESTIONS = [
  {
    id: 'q1',
    dimension: 'Business Simplicity & Value Proposition',
    prompt: 'Can you explain in 2 simple sentences what the business sells, to whom, and why customers return?',
    rubric: '5 = Flawless clarity; 3 = Fair understanding with some jargon; 1 = Unclear / speculative'
  },
  {
    id: 'q2',
    dimension: 'Moat Durability & Pricing Power',
    prompt: 'What protects their pricing power over the next decade (Low cost, switching costs, network effect, brand)?',
    rubric: '5 = Proven pricing power with clear barriers; 3 = Moderate advantage; 1 = Commodity price-taker'
  },
  {
    id: 'q3',
    dimension: 'Terminal Disruption & Obsolescence Risk',
    prompt: 'Could technology shifts, regulation, or competitors permanently impair this business 10 years out?',
    rubric: '5 = Highly resilient to disruption; 3 = Modest vulnerability; 1 = High terminal risk'
  },
  {
    id: 'q4',
    dimension: 'Promoter & Management Integrity',
    prompt: 'Are promoters/management honest, able, and disciplined allocators of shareholder capital?',
    rubric: '5 = Superb integrity and track record; 3 = Neutral/average; 1 = Value-destructive / questionable'
  },
  {
    id: 'q5',
    dimension: 'Investor Strike Zone / Honest Self-Assessment',
    prompt: 'Are you swinging inside your personal circle of competence, or chasing momentum/FOMO?',
    rubric: '5 = Patient swing in fat pitch zone; 3 = Expanding competence; 1 = Swinging blind / FOMO'
  }
];

function loadCompetenceStore(configPath = DEFAULT_CONFIG_PATH) {
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      return { assessments: {} };
    }
  }
  return { assessments: {} };
}

function saveCompetenceStore(data, configPath = DEFAULT_CONFIG_PATH) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Evaluate Circle of Competence for a ticker.
 * @param {string} ticker
 * @param {object} [providedAnswers] - e.g. { q1: 5, q2: 4, q3: 5, q4: 5, q5: 4, notes: '...' }
 * @param {object} [options]
 * @returns {object} Canonical evaluation result
 */
function evaluateCircleOfCompetence(ticker, providedAnswers = null, options = {}) {
  const cleanTicker = (ticker || 'UNKNOWN').toUpperCase();
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const store = loadCompetenceStore(configPath);

  // If new answers are provided, update store
  if (providedAnswers && typeof providedAnswers === 'object') {
    let scoreTotal = 0;
    const scores = {};
    for (const q of QUESTIONS) {
      const rawVal = Number(providedAnswers[q.id]);
      const val = (!isNaN(rawVal) && rawVal >= 1 && rawVal <= 5) ? rawVal : 3;
      scores[q.id] = val;
      scoreTotal += val;
    }
    // Scale 5 questions (max 25) to 100
    const finalScore = Math.round((scoreTotal / 25) * 100);
    const assessment = {
      ticker: cleanTicker,
      score: finalScore,
      scores,
      notes: providedAnswers.notes || '',
      updated_at: new Date().toISOString()
    };
    if (!store.assessments) store.assessments = {};
    store.assessments[cleanTicker] = assessment;
    saveCompetenceStore(store, configPath);
  }

  const existing = store.assessments ? store.assessments[cleanTicker] : null;

  if (!existing) {
    return {
      principle: 'circle-of-competence',
      name: 'Circle of Competence Diagnostic',
      ticker: cleanTicker,
      status: 'NEEDS_ASSESSMENT',
      score: 0,
      classification: 'Outside Circle of Competence / Not Yet Assessed',
      in_circle: false,
      max_position_weight_pct: 0.0,
      questions: QUESTIONS,
      summary: `Circle of Competence not yet assessed for ${cleanTicker}. Answer the 5-point questionnaire to expand your strike zone.`,
      advice: `“What counts is not how large your circle is, but how well you define the perimeter.” Complete the questionnaire before increasing capital allocation.`
    };
  }

  const score = existing.score;
  let status = 'OUTSIDE_CIRCLE';
  let classification = 'Outside Circle of Competence';
  let inCircle = false;
  let maxWeight = 0.0;
  let advice = '';

  if (score >= 80) {
    status = 'IN_CIRCLE';
    classification = 'Inside Circle of Competence (High Conviction)';
    inCircle = true;
    maxWeight = 15.0; // Full concentration permitted
    advice = `“We swing hard when the pitch is right down our alley.” High comprehension across business unit economics, moat durability, and management.`;
  } else if (score >= 50) {
    status = 'EXPANDING_CIRCLE';
    classification = 'Expanding Circle of Competence (Moderate Conviction)';
    inCircle = true;
    maxWeight = 5.0; // Modest initial allocation permitted
    advice = `“You don't have to be an expert on everything, but be realistic about what you know.” Acceptable foundation for a modest position (up to 5%). Keep studying.`;
  } else {
    status = 'OUTSIDE_CIRCLE';
    classification = 'Outside Circle of Competence (High Ambiguity)';
    inCircle = false;
    maxWeight = 0.0;
    advice = `“The most important thing in investing is to know what you don't know.” Place in the 'Too Hard' pile until the unit economics and terminal risks are understood.`;
  }

  return {
    principle: 'circle-of-competence',
    name: 'Circle of Competence Diagnostic',
    ticker: cleanTicker,
    status,
    score,
    classification,
    in_circle: inCircle,
    max_position_weight_pct: maxWeight,
    scores: existing.scores,
    notes: existing.notes || '',
    updated_at: existing.updated_at,
    summary: `${status} (${classification}): Score ${score}/100. Max permitted portfolio allocation: ${maxWeight}%.`,
    advice
  };
}

module.exports = {
  QUESTIONS,
  evaluateCircleOfCompetence,
  loadCompetenceStore,
  saveCompetenceStore
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  let ticker = null;
  let answers = null;
  let jsonOutput = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticker' && argv[i + 1]) ticker = argv[++i];
    else if (argv[i] === '--answers' && argv[i + 1]) {
      const raw = argv[++i];
      try {
        answers = JSON.parse(raw);
      } catch {
        try {
          answers = JSON.parse(raw.replace(/\\"/g, '"'));
        } catch {
          answers = null;
        }
      }
    } else if (argv[i] === '--score' && argv[i + 1]) {
      const s = parseInt(argv[++i], 10);
      answers = { q1: s / 20, q2: s / 20, q3: s / 20, q4: s / 20, q5: s / 20 };
    } else if (argv[i] === '--notes' && argv[i + 1]) {
      if (!answers) answers = {};
      answers.notes = argv[++i];
    } else if (argv[i] === '--json') jsonOutput = true;
  }

  if (!ticker) {
    console.log('Usage: node evaluate_competence.js --ticker <TICKER> [--answers JSON] [--json]');
    process.exit(1);
  }

  const result = evaluateCircleOfCompetence(ticker, answers);
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n===============================================================`);
    console.log(`  CIRCLE OF COMPETENCE EVALUATION: ${result.ticker}`);
    console.log(`===============================================================`);
    console.log(`Status        : ${result.status} (${result.classification})`);
    console.log(`Score         : ${result.score}/100`);
    console.log(`Max Allocation: ${result.max_position_weight_pct}%`);
    console.log(`Advice        : ${result.advice}\n`);
  }
}
