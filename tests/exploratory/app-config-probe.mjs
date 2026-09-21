// Browser-level probe for the shared provider-config module wiring.
//
// Two phases in one spec:
//
//   1. Shell phase (always runs): the dev server serves the index.html shell.
//   2. Module phase (only once the config module is actually served):
//      the module transforms, /src/App.jsx no longer fails its transform, and
//      the app boots with zero page errors.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/app-config-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

// --- Phase 1: shell must always be served ---------------------------------
const shellRes = await fetch(testUrl);
assert.equal(shellRes.status, 200, `dev server must serve the app shell at ${testUrl}`);
const shellHtml = await shellRes.text();
assert.match(shellHtml, /<div id="root"><\/div>/, 'shell carries the React mount point');
assert.match(shellHtml, /<title>GroundRumble<\/title>/, 'shell keeps the app title');

// --- Phase 2: vacuous until the data module is restored --------------------
// NB: Vite's SPA fallback answers missing paths with HTTP 200 text/html, so
// the gate checks the JavaScript content-type, not just the status.
const moduleUrl = new URL('src/data/app-config.js', testUrl).href;
const moduleRes = await fetch(moduleUrl);
const moduleType = moduleRes.headers.get('content-type') || '';
if (moduleRes.status !== 200 || !moduleType.includes('javascript')) {
  console.log(
    `[app-config-probe] ${moduleUrl} -> HTTP ${moduleRes.status} (${moduleType || 'no content-type'}); ` +
    'module-level assertions are vacuous until src/data/app-config.js is restored.'
  );
  process.exit(0);
}

const moduleJs = await moduleRes.text();
for (const name of ['PROVIDER_PRESETS', 'SANDBOX_PROVIDER_ID', 'SANDBOX_MODELS']) {
  assert.match(
    moduleJs,
    new RegExp(`export\\s+const\\s+${name}\\b`),
    `the served module must still export ${name}`
  );
}
// NB: vite's dev transform may rewrite quote styles, so pin the VALUE, not the quote spelling.
assert.match(moduleJs, /SANDBOX_PROVIDER_ID\s*=\s*(['"])sandbox\1/, "the served module must carry SANDBOX_PROVIDER_ID's literal");

// THE repair proof: the App.jsx transform must not fail (baseline returns 500
// with "Failed to resolve import ./data/app-config").
const appRes = await fetch(new URL('src/App.jsx', testUrl).href);
assert.equal(appRes.status, 200, '/src/App.jsx must transform without the import-resolution error');

// Boot smoke: the restored app mounts cleanly, no uncaught page errors.
// The app auto-syncs MITRE ATLAS shortly after load; serve it hermetically.
const ATLAS_MINIMAL_YAML = [
  'format-version: 2026.01',
  'tactics:',
  '  AML.TA0001: { name: "Execution", description: "d" }',
  'techniques:',
  '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
  'relationships: {}',
  'mitigations: {}'
].join('\n');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: ATLAS_MINIMAL_YAML });
  });
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#root *').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(500);
  assert.equal(pageErrors.length, 0, pageErrors.map(error => error.message).join('\n'));
} finally {
  await browser.close();
}
