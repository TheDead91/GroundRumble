// Browser-level probe of the provider transport-policy surface. Two phases:
//
//   1. Live-form phase (always runs): the Add Provider form surfaces the
//      plaintext-HTTP warning + approval checkbox exactly when
//      isInsecureHttpEndpoint(endpoint || modelsEndpoint) holds — public HTTP
//      yes, public HTTPS no, loopback/IPv6-literal hosts exempt. This is the
//      same policy primitive family the backup-import gates consume.
//   2. Module phase (only once the policy module is actually served): the
//      pure module exports both predicates off the low-level endpoint-policy
//      primitives, and ProvidersContext still transforms cleanly against it.
//
// NB: the encrypted-backup import flow is intentionally NOT driven here.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/provider-policy-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const ATLAS_MINIMAL_YAML = [
  'format-version: 2026.01',
  'tactics:',
  '  AML.TA0001: { name: "Execution", description: "d" }',
  'techniques:',
  '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
  'relationships: {}',
  'mitigations: {}'
].join('\n');

// --- Phase 2 pre-check: vacuous until the policy module is served ------------
// NB: Vite's SPA fallback answers missing paths with HTTP 200 text/html, so
// the gate checks the JavaScript content-type, not just the status.
const moduleUrl = new URL('src/utils/provider-endpoint-policy.js', testUrl).href;
const moduleRes = await fetch(moduleUrl);
const moduleType = moduleRes.headers.get('content-type') || '';
if (moduleRes.status === 200 && moduleType.includes('javascript')) {
  const moduleJs = await moduleRes.text();
  for (const name of ['providerNeedsPrivateBypass', 'providerNeedsInsecureTransport']) {
    assert.match(
      moduleJs,
      new RegExp(`export\\s+const\\s+${name}\\b`),
      `the served policy module must export ${name}`
    );
  }
  assert.doesNotMatch(moduleJs, /from\s*'\.\/endpoint-policy\.js'/, 'post-mod003 the policy module is self-contained — the old relative import must not return');
} else {
  console.log(
    `[provider-policy-probe] ${moduleUrl} -> HTTP ${moduleRes.status} (${moduleType || 'no content-type'}); ` +
    'module-phase assertions are vacuous until src/utils/provider-endpoint-policy.js exists.'
  );
}

// Both eras must transform the context module that exposes the predicates.
const ctxRes = await fetch(new URL('src/context/ProvidersContext.jsx', testUrl).href);
assert.equal(ctxRes.status, 200, '/src/context/ProvidersContext.jsx must transform cleanly');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // Hermetic session: stub the MITRE ATLAS sync so startup never hits GitHub.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: ATLAS_MINIMAL_YAML });
  });

  const script = {
    content: `(() => {
      if (!sessionStorage.getItem('__grSeeded')) {
        sessionStorage.setItem('__grSeeded', '1');
        localStorage.setItem('atlas_onboarding_done', '1');
        localStorage.setItem('atlas_demo_mode', 'true');
      }
    })();`
  };
  await page.context().addInitScript(script);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('button', { name: /Skip — I already know this tool/ });
  if (await skip.isVisible()) await skip.click();

  // --- Phase 1: the live provider form applies the transport policy ----------
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const addProvider = page.getByRole('button', { name: 'Add Provider', exact: true });
  await addProvider.waitFor({ state: 'visible' });
  await addProvider.click();

  const endpointInput = page.locator('label:has-text("Endpoint URL") + input');
  const modelsEndpointInput = page.locator('label:has-text("Models Endpoint") + input');
  const insecureApproval = page.getByTestId('provider-allow-insecure-transport');
  await endpointInput.waitFor({ state: 'visible' });

  // Public HTTPS: no cleartext-transport approval offered at all.
  await endpointInput.fill('https://api.example.com/v1/chat/completions');
  assert.equal(await insecureApproval.count(), 0, 'public HTTPS endpoints must not offer the insecure-transport approval');

  // Public plaintext HTTP: warning + unchecked approval appear.
  await endpointInput.fill('http://plain-relay.example/v1/chat/completions');
  await insecureApproval.waitFor({ state: 'visible' });
  assert.equal(await insecureApproval.isChecked(), false, 'the approval defaults to unchecked for a public HTTP endpoint');

  // Loopback hostname: exempt, approval disappears again.
  await endpointInput.fill('http://localhost:11434/v1/chat/completions');
  await page.waitForTimeout(150);
  assert.equal(await insecureApproval.count(), 0, 'loopback hostnames must be exempt from the insecure-transport gate');

  // Bracketed IPv6 loopback literal: exempt as well.
  await endpointInput.fill('http://[::1]:9/v1/chat/completions');
  await page.waitForTimeout(150);
  assert.equal(await insecureApproval.count(), 0, 'bracketed IPv6 loopback literals must be exempt');

  // The modelsEndpoint leg counts too: public chat URL but a cleartext-HTTP
  // models endpoint flips the gate back on.
  await endpointInput.fill('https://api.example.com/v1/chat/completions');
  await modelsEndpointInput.fill('http://models.example/v1');
  await insecureApproval.waitFor({ state: 'visible' });
  assert.equal(await insecureApproval.count(), 1, 'a cleartext-HTTP models endpoint must trigger the gate');

  assert.equal(pageErrors.length, 0, pageErrors.map(error => error.message).join('\n'));
  console.log('[provider-policy-probe] all phases passed.');
} finally {
  await browser.close();
}
