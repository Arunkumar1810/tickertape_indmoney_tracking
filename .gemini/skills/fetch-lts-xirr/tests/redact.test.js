const test = require('node:test');
const assert = require('node:assert');
const Redactor = require('../scripts/lib/redact');

test('Redactor scrubs sensitive keys, PAN, and bank accounts', () => {
  const dirtyPayload = {
    client_id: 'AB1234',
    pan: 'ABCDE1234F',
    description: 'Payout to bank account 123456789012 for PAN ABCDE1234F',
    access_token: 'secret_token_12345',
    holdings: [
      {
        symbol: 'TCS',
        notes: 'Bought with account 987654321098'
      }
    ]
  };

  const sanitized = Redactor.sanitize(dirtyPayload);

  assert.strictEqual(sanitized.client_id, '[REDACTED]');
  assert.strictEqual(sanitized.pan, '[REDACTED]');
  assert.strictEqual(sanitized.access_token, '[REDACTED]');
  assert.ok(!sanitized.description.includes('ABCDE1234F'));
  assert.ok(!sanitized.description.includes('123456789012'));
  assert.ok(sanitized.description.includes('[REDACTED_ACCOUNT]'));
  assert.ok(sanitized.description.includes('[REDACTED_PAN]'));

  assert.ok(!sanitized.holdings[0].notes.includes('987654321098'));
  assert.ok(sanitized.holdings[0].notes.includes('[REDACTED_ACCOUNT]'));
});

test('Redactor assertClean detects leaked secrets', () => {
  const leakedHtml = '<html><body>Token: secret_super_token_999</body></html>';
  assert.throws(
    () => Redactor.assertClean(leakedHtml, ['secret_super_token_999']),
    /Security validation failed/
  );

  const cleanHtml = '<html><body>Token: [REDACTED]</body></html>';
  assert.doesNotThrow(
    () => Redactor.assertClean(cleanHtml, ['secret_super_token_999'])
  );
});
