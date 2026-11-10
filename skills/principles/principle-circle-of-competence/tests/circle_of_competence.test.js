'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  evaluateCircleOfCompetence,
  QUESTIONS
} = require('../scripts/evaluate_competence');

test('1. QUESTIONS list contains 5 core Buffett business dimensions', () => {
  assert.equal(QUESTIONS.length, 5);
  assert.equal(QUESTIONS[0].id, 'q1');
  assert.equal(QUESTIONS[4].id, 'q5');
});

test('2. Unassessed stock returns NEEDS_ASSESSMENT with 0 allocation', () => {
  const tmpConfig = path.join(os.tmpdir(), `coc-test-${Date.now()}.json`);
  const result = evaluateCircleOfCompetence('ACME', null, { configPath: tmpConfig });
  assert.equal(result.status, 'NEEDS_ASSESSMENT');
  assert.equal(result.in_circle, false);
  assert.equal(result.max_position_weight_pct, 0.0);
  assert.equal(result.score, 0);
});

test('3. High score (>=80) confers IN_CIRCLE with full 15% concentration allocation', () => {
  const tmpConfig = path.join(os.tmpdir(), `coc-test-${Date.now()}.json`);
  const answers = { q1: 5, q2: 5, q3: 4, q4: 5, q5: 5, notes: 'Wonderful digital transformation business' };
  const result = evaluateCircleOfCompetence('INFY', answers, { configPath: tmpConfig });
  assert.equal(result.status, 'IN_CIRCLE');
  assert.equal(result.in_circle, true);
  assert.equal(result.max_position_weight_pct, 15.0);
  assert.ok(result.score >= 80);
});

test('4. Moderate score (50-79) confers EXPANDING_CIRCLE with 5% capped allocation', () => {
  const tmpConfig = path.join(os.tmpdir(), `coc-test-${Date.now()}.json`);
  const answers = { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3, notes: 'Studying unit economics' };
  const result = evaluateCircleOfCompetence('GROWTH', answers, { configPath: tmpConfig });
  assert.equal(result.status, 'EXPANDING_CIRCLE');
  assert.equal(result.in_circle, true);
  assert.equal(result.max_position_weight_pct, 5.0);
  assert.equal(result.score, 60);
});

test('5. Low score (<50) gates to OUTSIDE_CIRCLE with 0% allocation', () => {
  const tmpConfig = path.join(os.tmpdir(), `coc-test-${Date.now()}.json`);
  const answers = { q1: 1, q2: 2, q3: 1, q4: 2, q5: 1, notes: 'High speculation' };
  const result = evaluateCircleOfCompetence('SPEC', answers, { configPath: tmpConfig });
  assert.equal(result.status, 'OUTSIDE_CIRCLE');
  assert.equal(result.in_circle, false);
  assert.equal(result.max_position_weight_pct, 0.0);
  assert.ok(result.score < 50);
});

