import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ATLAS_MINIMAL_YAML } from './fixtures/atlas-document.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, route => route.fulfill({
    status: 200, contentType: 'application/x-yaml', body: ATLAS_MINIMAL_YAML,
  }));
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));
  const testUrl = process.env.TEST_URL || 'http://localhost:5173/';
  const response = await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  // First-run welcome modal covers the UI — dismiss before interacting.
  try { await page.getByText(/Skip — I already know this tool|Skip tour|Got it|Not now/i).first().click({ timeout: 3000 }); } catch {}
  try { await page.getByRole('button', { name: /Skip|Got it|Later|Not now/i }).first().click({ timeout: 2000 }); } catch {}
  const headers = response.headers();
  assert.equal(headers['content-security-policy'] ? true : false, true, 'CSP header must be present');
  assert.equal(headers['x-frame-options'], 'DENY', 'X-Frame-Options must deny framing');
  assert.equal(headers['referrer-policy'], 'no-referrer', 'Referrer-Policy must be set');
  assert.equal(headers['x-content-type-options'], 'nosniff', 'X-Content-Type-Options must be set');
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin', 'Cross-Origin-Opener-Policy must be set');
  const csp = headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/, 'CSP must restrict default sources to self');
  assert.match(csp, /script-src 'self'/, 'CSP must restrict scripts to self');
  assert.match(csp, /object-src 'none'/, 'CSP must forbid plugins/objects');
  assert.match(csp, /frame-ancestors 'none'/, 'CSP must forbid framing');
  assert.match(csp, /base-uri 'self'/, 'CSP must pin base-uri');
  assert.doesNotMatch(csp, /script-src 'self' 'unsafe-inline'/, 'preview must not allow inline scripts');
  assert.equal(await page.title(), 'GroundRumble');
  await page.locator('#root').waitFor({ state: 'attached' });
  assert.ok((await page.locator('#root').textContent()).includes('GroundRumble'));

  // Frame denial: the app must refuse to render inside an embedding frame.
  const framer = await browser.newPage();
  await framer.setContent(`<iframe id="target" src="${testUrl}"></iframe>`);
  await framer.waitForTimeout(500);
  const framed = await framer.evaluate(() => {
    const frame = document.getElementById('target');
    try { return { blocked: frame.contentDocument === null, title: frame.contentDocument?.title || null }; }
    catch { return { blocked: true, title: null }; }
  });
  assert.equal(framed.blocked, true, `app must not render in an iframe (got title: ${framed.title})`);
  await framer.close();

  const skip = page.getByRole('button', { name: /Skip — I already know this tool/ });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Providers', { exact: true }).first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Add Provider', exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Auditor Runner', exact: true }).click();
  await page.getByText('Run Comparison Audit', { exact: true }).waitFor({ state: 'visible' });
  await page.evaluate(() => {
    localStorage.setItem('atlas_onboarding_done', '1');
    localStorage.setItem('atlas_demo_mode', 'true');
    localStorage.setItem('atlas_compare_targets', JSON.stringify([
      { uid: 'demo-1', provider: 'sandbox', model: 'Demo Secure' },
      { uid: 'demo-2', provider: 'sandbox', model: 'Demo Vulnerable' }
    ]));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Auditor Runner', exact: true }).click();
  const payloads = page.locator('[data-tour="payload-selection"]');
  await payloads.getByRole('button', { name: 'Clear All', exact: true }).click();
  await payloads.locator('input[type="checkbox"]').first().check();
  await page.getByTestId('audit-run').click();
  await page.getByText('Comparison Results', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  const reportPopup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Download Report', exact: true }).click();
  const report = await reportPopup;
  await report.waitForLoadState('domcontentloaded');
  const reportBody = report.frameLocator('iframe').locator('body');
  await reportBody.waitFor({ state: 'visible' });
  assert.equal(await report.locator('iframe[sandbox=""]').count(), 1, 'report must render inside a sandboxed (script-blocking) iframe');
  assert.ok((await reportBody.textContent()).includes('GroundRumble'));
  await report.close();

  await page.getByTestId('audit-run').click();
  assert.equal(await page.getByTestId('audit-run').isDisabled(), true);
  await page.getByTestId('audit-stop').click();

   await page.getByRole('button', { name: 'Settings', exact: true }).click();
   await page.getByText('Key Vault', { exact: true }).waitFor({ state: 'visible' });
  // Provider private-endpoint approval flow (current UX): a loopback endpoint
  // without approval is rejected with actionable feedback and the draft stays
  // open; approving it lets the save proceed. The probe provider is removed
  // again through the confirmed delete flow.
  await page.getByRole('button', { name: 'Add Provider', exact: true }).click();
  await page.locator('input[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]').fill('Local Probe');
  await page.locator('input[placeholder="https://api.openai.com/v1/chat/completions"]').fill('http://127.0.0.1:9/v1/chat/completions');
  await page.getByRole('button', { name: 'Save Provider', exact: true }).click();
  await page.getByText('Private or loopback endpoint requires explicit approval.').first().waitFor({ timeout: 10000 });
  await page.getByTestId('provider-allow-private').check();
  await page.getByRole('button', { name: 'Save Provider', exact: true }).click();
  await page.locator('[data-testid^="provider-row-"]').filter({ hasText: 'Local Probe' }).waitFor({ timeout: 10000 });
  await page.locator('button[data-tip="Delete"]').click();
  await page.getByText('Delete provider?').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Delete Provider', exact: true }).click();
  await page.locator('[data-testid^="provider-row-"]').filter({ hasText: 'Local Probe' }).waitFor({ state: 'detached', timeout: 10000 });

   await page.getByRole('button', { name: 'Add Provider', exact: true }).click();
   await page.locator('input[placeholder="Optional (leave blank if none required)"]').fill('draft-secret');
   await page.locator('input[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]').fill('Race Provider');
   await page.locator('input[placeholder="https://api.openai.com/v1/chat/completions"]').fill('https://provider.example/test');
   let releaseProviderTest;
   const providerTestGate = new Promise(resolve => { releaseProviderTest = resolve; });
   // Provider calls go directly from the browser. Intercept the endpoint host so
   // the race stays in-flight until the lock.
   await page.route('**provider.example/**', async route => {
     await providerTestGate;
     try {
       const isModels = route.request().url().includes('/models');
       const body = isModels ? JSON.stringify({ data: [{ id: 'race-model' }] }) : 'ok';
       await route.fulfill({ status: 200, contentType: 'application/json', body });
     } catch { /* request was aborted by the lock reload — expected */ }
   });
   await page.getByRole('button', { name: 'Save Provider', exact: true }).click();
   // Unencrypted-vault save with an API key prompts for confirmation — proceed
   // with the plaintext "Save anyway" path (matches the browser-e2e helper).
   const saveAnyway = page.getByRole('button', { name: 'Save anyway', exact: true });
   try {
     await saveAnyway.waitFor({ state: 'visible', timeout: 3000 });
     await saveAnyway.click();
   } catch { /* no dialog — the vault is already encrypted */ }
    await page.getByTitle('Test connection (reachability, auth, chat round-trip)').last().click();
  const vaultPassphrase = page.locator('input[placeholder="Set a passphrase to encrypt your keys"]');
  await vaultPassphrase.fill('browser-smoke-strong-passphrase');
  await page.getByTestId('vault-protect').click();
   await page.getByTestId('vault-lock').click();
   releaseProviderTest();
  // "Lock now" forces a full reload — wait for the freshly booted locked state
  // (the unlock prompt) and confirm no stale provider draft or connection result
  // survived the lock.
  await page.getByTestId('vault-passphrase-input').waitFor({ state: 'visible' });
  assert.equal(await page.getByText('New Provider', { exact: true }).count(), 0, 'locking must clear the open provider draft');
  await page.waitForTimeout(50);
  assert.equal(await page.getByText(/Connected|Connection failed/, { exact: false }).count(), 0, 'a provider test completion must not repopulate state after locking');
  await page.getByTestId('vault-passphrase-input').fill('browser-smoke-strong-passphrase');
  await page.getByTestId('vault-unlock').click();
   await page.getByRole('button', { name: 'Settings', exact: true }).click();
   await page.getByText(/keys are encrypted at rest and unlocked/, { exact: false }).waitFor({ state: 'visible' });
   assert.equal(await page.getByText('New Provider', { exact: true }).count(), 0, 'provider draft secret must not return after unlock');
   assert.equal(await page.locator('input[placeholder="Optional (leave blank if none required)"]').count(), 0, 'provider draft input must be cleared');
    const modelRefresh = page.getByTitle('Reload the model list from the provider').last();
   await modelRefresh.waitFor({ state: 'visible' });
   assert.equal(await modelRefresh.isDisabled(), false, 'model refresh must not remain disabled after locking an in-flight fetch');
   assert.equal(pageErrors.length, 0, pageErrors.map(error => error.message).join('\n'));
} finally {
  await browser.close();
}
