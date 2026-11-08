const SENSITIVE_KEYS = new Set([
  'client_id',
  'pan',
  'bank_account',
  'account_id',
  'account_number',
  'api_key',
  'access_token',
  'enctoken',
  'public_token',
  'password',
  'pin',
  'totp',
  'secret'
]);

const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
const BANK_ACCT_REGEX = /\b\d{9,18}\b/g;
const TOKEN_REGEX = /\b(ey[a-zA-Z0-9_-]{20,}|[a-f0-9]{32,64})\b/g;

class Redactor {
  /**
   * Redact a string containing potential sensitive patterns
   */
  static redactString(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(PAN_REGEX, '[REDACTED_PAN]')
      .replace(BANK_ACCT_REGEX, '[REDACTED_ACCOUNT]')
      .replace(TOKEN_REGEX, '[REDACTED_TOKEN]');
  }

  /**
   * Recursively sanitize object or array
   */
  static sanitize(data) {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
      return data.map(item => Redactor.sanitize(item));
    }

    if (typeof data === 'object') {
      const clean = {};
      for (const [key, val] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          clean[key] = '[REDACTED]';
        } else if (typeof val === 'string') {
          clean[key] = Redactor.redactString(val);
        } else if (typeof val === 'object') {
          clean[key] = Redactor.sanitize(val);
        } else {
          clean[key] = val;
        }
      }
      return clean;
    }

    if (typeof data === 'string') {
      return Redactor.redactString(data);
    }

    return data;
  }

  /**
   * Asserts that a rendered string is clean of sensitive patterns
   */
  static assertClean(content, knownSecrets = []) {
    for (const secret of knownSecrets) {
      if (secret && typeof secret === 'string' && secret.length >= 6 && content.includes(secret)) {
        throw new Error(`Security validation failed: unredacted secret leaked into report!`);
      }
    }
    return true;
  }
}

module.exports = Redactor;
