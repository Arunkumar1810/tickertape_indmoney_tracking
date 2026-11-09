'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  verifyHtmlSelfContainment,
  verifyArtifactPair,
  verifyDirectoryArtifacts,
  runHarnessCli
} = require('../index');

function createSampleVerdict() {
  return {
    principle: 'graham',
    ticker: 'INFY',
    timestamp: '2026-11-07T12:00:00.000Z',
    score: 82.5,
    stance: 'BUY',
    is_veto: false,
    metrics: {
      graham_number: 1850.0,
      margin_of_safety_pct: 15.2
    },
    red_flags: [],
    summary: 'Strong balance sheet trading below intrinsic value.'
  };
}

function createSampleValidHtml(title = 'Report') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .card { background: #1e293b; padding: 16px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>Offline self-contained dashboard.</p>
    <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9zdmc+" alt="icon" />
  </div>
  <script>
    console.log("Interactive script loaded locally");
  </script>
</body>
</html>`;
}

test('verifyHtmlSelfContainment passes for valid offline self-contained HTML', () => {
  const html = createSampleValidHtml('Graham Valuation');
  const res = verifyHtmlSelfContainment(html);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.summary.hasDocType, true);
  assert.equal(res.summary.externalLeaksCount, 0);
});

test('verifyHtmlSelfContainment flags malformed or truncated HTML', () => {
  const shortHtml = '<p>Hi</p>';
  const res = verifyHtmlSelfContainment(shortHtml);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_HTML_EMPTY_OR_TRUNCATED'));
  assert.ok(res.errors.some((e) => e.code === 'ERR_HTML_MALFORMED'));
});

test('verifyHtmlSelfContainment flags external CSS stylesheet link', () => {
  const htmlWithCss = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body><h1>Test</h1></body>
</html>`;
  const res = verifyHtmlSelfContainment(htmlWithCss);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_EXTERNAL_STYLE_LINK'));
});

test('verifyHtmlSelfContainment flags external script tag', () => {
  const htmlWithScript = `<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.example.com/chart.js"></script>
</head>
<body><h1>Test</h1></body>
</html>`;
  const res = verifyHtmlSelfContainment(htmlWithScript);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_EXTERNAL_SCRIPT_TAG'));
});

test('verifyHtmlSelfContainment flags external image tag', () => {
  const htmlWithImg = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test</h1>
  <img src="https://example.com/logo.png" alt="logo" />
</body>
</html>`;
  const res = verifyHtmlSelfContainment(htmlWithImg);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'ERR_EXTERNAL_IMAGE_URL'));
});

test('verifyHtmlSelfContainment allows external assets when allowExternalAssets: true', () => {
  const htmlWithCdn = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <script src="https://cdn.example.com/chart.js"></script>
</head>
<body><h1>Test with CDN</h1></body>
</html>`;
  const res = verifyHtmlSelfContainment(htmlWithCdn, { allowExternalAssets: true });
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
});

test('verifyArtifactPair verifies valid JSON contract and HTML dashboard pair', () => {
  const verdict = createSampleVerdict();
  const html = createSampleValidHtml('Graham Verdict');

  const res = verifyArtifactPair({
    jsonContent: verdict,
    htmlContent: html,
    schemaType: 'verdict'
  });

  assert.equal(res.ok, true);
  assert.equal(res.jsonOk, true);
  assert.equal(res.htmlOk, true);
  assert.equal(res.errors.length, 0);
});

test('verifyArtifactPair detects missing files on disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));

  try {
    const nonExistentJson = path.join(tmpDir, 'missing.json');
    const nonExistentHtml = path.join(tmpDir, 'missing.html');

    const res = verifyArtifactPair({
      jsonPath: nonExistentJson,
      htmlPath: nonExistentHtml,
      schemaType: 'verdict'
    });

    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.code === 'ERR_JSON_FILE_NOT_FOUND'));
    assert.ok(res.errors.some((e) => e.code === 'ERR_HTML_FILE_NOT_FOUND'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyArtifactPair flags schema violations in JSON contract', () => {
  const badVerdict = createSampleVerdict();
  badVerdict.score = 150; // out of range
  badVerdict.stance = 'PASS'; // invalid for valuation pillar

  const html = createSampleValidHtml('Bad Verdict');
  const res = verifyArtifactPair({
    jsonContent: badVerdict,
    htmlContent: html,
    schemaType: 'verdict'
  });

  assert.equal(res.ok, false);
  assert.equal(res.jsonOk, false);
  assert.equal(res.htmlOk, true);
  assert.ok(res.errors.length >= 2);
});

test('verifyDirectoryArtifacts detects pairs and flags unpaired orphan files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dir-test-'));

  try {
    // 1. Paired files
    fs.writeFileSync(
      path.join(tmpDir, 'graham.json'),
      JSON.stringify(createSampleVerdict()),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'graham.html'),
      createSampleValidHtml('Graham'),
      'utf8'
    );

    // 2. Orphan JSON
    fs.writeFileSync(
      path.join(tmpDir, 'lynch.json'),
      JSON.stringify(createSampleVerdict()),
      'utf8'
    );

    // 3. Orphan HTML
    fs.writeFileSync(
      path.join(tmpDir, 'buffett.html'),
      createSampleValidHtml('Buffett'),
      'utf8'
    );

    const res = verifyDirectoryArtifacts(tmpDir, { schemaType: 'verdict' });
    assert.equal(res.ok, false);
    assert.equal(res.pairsCount, 1);
    assert.ok(
      res.errors.some(
        (e) =>
          e.code === 'ERR_UNPAIRED_ARTIFACT' &&
          e.path.endsWith('lynch.json')
      )
    );
    assert.ok(
      res.errors.some(
        (e) =>
          e.code === 'ERR_UNPAIRED_ARTIFACT' &&
          e.path.endsWith('buffett.html')
      )
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runHarnessCli exits 0 for valid pair and exits 1 with structured JSON on error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cli-test-'));
  const cliScript = path.join(__dirname, '..', 'artifact_harness.js');

  try {
    const validJson = path.join(tmpDir, 'test.json');
    const validHtml = path.join(tmpDir, 'test.html');
    fs.writeFileSync(validJson, JSON.stringify(createSampleVerdict()), 'utf8');
    fs.writeFileSync(validHtml, createSampleValidHtml('CLI Test'), 'utf8');

    // Valid CLI run
    const okProc = spawnSync(
      process.execPath,
      [cliScript, '--json', validJson, '--html', validHtml, '--schema', 'verdict', '--json-output'],
      { encoding: 'utf8' }
    );
    assert.equal(okProc.status, 0);
    const okOut = JSON.parse(okProc.stdout);
    assert.equal(okOut.ok, true);

    // Invalid CLI run: HTML contains external asset
    const badHtml = path.join(tmpDir, 'bad.html');
    fs.writeFileSync(
      badHtml,
      '<!DOCTYPE html><html><head><script src="https://cdn.evil.com/bad.js"></script></head><body><h1>Bad</h1></body></html>',
      'utf8'
    );

    const failProc = spawnSync(
      process.execPath,
      [cliScript, '--json', validJson, '--html', badHtml, '--schema', 'verdict', '--json-output'],
      { encoding: 'utf8' }
    );
    assert.equal(failProc.status, 1);
    const failOut = JSON.parse(failProc.stdout);
    assert.equal(failOut.ok, false);
    assert.ok(failOut.errors.some((e) => e.code === 'ERR_EXTERNAL_SCRIPT_TAG'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
