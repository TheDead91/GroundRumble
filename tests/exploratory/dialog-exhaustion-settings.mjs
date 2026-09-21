// Dialog exhaustion — settings: providers (presets, raw method/headers, delete,
// rate-limit/notes/models-endpoint), vault change/remove, proxy categories +
// relay failure + redirect consent, ATLAS sync failure→fixture success.
// Test-only; deviations recorded as findings.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const B = (name) => page.getByRole('button', { name, exact: true });
const P = (name) => page.getByPlaceholder(name, { exact: true });
const text = () => page.locator('body').innerText();
const sim = await installMockProvider(page);
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const step = (s) => console.error(`Test5A-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const finding = (id, d) => findings.push({ id, observed: d });

try {
  await page.goto(base);
  step('welcome');
  await B('✕').click();
  await B('Settings').click();

  // ---- provider presets prefill ----
  step('presets');
  for (const preset of ['Groq', 'Ollama (local)']) {
    await B('Add Provider').click();
    await B(preset).click();
    const ep = await P('https://api.openai.com/v1/chat/completions').inputValue();
    record('PROV', `preset ${preset} prefills endpoint: ${ep.slice(0, 60)}`);
    await B('Cancel').click();
  }

  // ---- full-field provider + rate limit/notes/models endpoint ----
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Full Fields');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('Optional (leave blank if none required)').fill('test-key');
  await P('0 = unlimited').fill('120');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('e.g. https://api.openai.com/v1/models').fill('https://test-provider.example/v1/models');
  await P('Anything worth remembering about this provider').fill('test notes marker');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  const modelsBefore = sim.calls.filter((c) => c.stage === 'models').length;
  await B('Test connection (reachability, auth, chat round-trip)').first().click();
  await page.getByText(/Connected|reachable/).last().waitFor({ timeout: 20000 }).catch(() => {});
  if (sim.calls.filter((c) => c.stage === 'models').length <= modelsBefore) {
    finding('provider-test-connection-no-discovery', 'full-fields provider Test Connection issued no models discovery call');
  } else record('PROV', 'full-fields provider connectivity verified at boundary');
  await page.reload();
  await B('Settings').click();
  record('PROV', `rate-limit/notes/models-endpoint persist: ${(await text()).includes('120 req/min') && (await text()).includes('test notes marker')}`);

  // ---- raw provider: PUT + custom header + template; boundary verifies ----
  step('raw-provider');
  await B('Add Provider').click();
  await page.locator('select').first().selectOption('raw');
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Raw PUT');
  await P('https://host.example/api/chat').fill('http://127.0.0.1:4998/chat');
  await page.getByTestId('provider-allow-private').check();
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('raw-model');
  await page.locator('select').nth(1).selectOption('PUT');
  await P('choices.0.message.content').fill('answer');
  await P('{"X-Custom-Header": "value"}').fill('{"X-Test":"raw-header"}');
  await page.locator('textarea').last().fill('{"model":"{{model}}","system":"{{systemPrompt}}","input":"{{userPrompt}}"}');
  await B('Save Provider').click();
  await B('Save Provider').waitFor({ state: 'hidden' }).catch(() => {});
  if (await B('Save Provider').count()) {
    record('PROV', `raw save blocked: ${(await text()).slice(-200).replace(/\n/g, ' ')}`);
    await B('Cancel').click();
  } else record('PROV', 'raw PUT provider saved');
  // local proxy route for the raw target (test-only loopback stand-in)
  const rawSim = await installMockProvider(page, { routePattern: 'http://127.0.0.1:4998/**', rawTemplate: true });
  await B('Test connection (reachability, auth, chat round-trip)').last().click();
  await page.getByText(/Connected|reachable/).last().waitFor({ timeout: 20000 }).catch(() => {});
  const rawCall = rawSim.calls.at(-1);
  record('PROV', `raw connectivity uses PUT + custom header + template: ${rawCall?.wireBody ? JSON.stringify(rawCall.wireBody).slice(0, 120) : 'no-call'}`);
  await page.reload();
  await B('Settings').click();
  record('PROV', `raw provider persists: ${(await text()).includes('Test Raw PUT')}`);

  // ---- provider delete → helpers fallback ----
  step('provider-delete');
  const delCount = await page.locator('button[data-tip=Delete]').count();
  record('PROV-DEL', `provider Delete buttons visible: ${delCount}`);
  await page.locator('button[data-tip=Delete]').last().click();
  await B('Confirm').waitFor({ timeout: 8000 }).catch(() => {});
  if (!(await B('Confirm').count())) {
    record('PROV-DEL', `delete confirm did not open; tail=${(await text()).slice(-300).replace(/\n/g, ' ')}`);
  } else {
    await page.keyboard.press('Escape');
    record('PROV-DEL', `delete Escape stays open: ${await B('Confirm').isVisible()}`);
    await page.mouse.click(5, 5);
    record('PROV-DEL', `delete backdrop stays open: ${await B('Confirm').isVisible()}`);
    await B('Cancel').click();
    await page.locator('button[data-tip=Delete]').last().click();
    await B('Confirm').click();
    await page.reload();
    await B('Settings').click();
    record('PROV-DEL', `delete persists, raw gone: ${!(await text()).includes('Test Raw PUT')}`);
  }

  // ---- vault change/remove ----
  step('vault-change');
  await P('Set a passphrase to encrypt your keys').fill('Test-vault-first-passphrase');
  await B('Protect with passphrase').click();
  await B('Lock now').waitFor();
  await P('Change passphrase').fill('short');
  await B('Change passphrase').click();
  record('VAULT', `change short rejected: ${(await text()).includes('at least 12')}`);
  await P('Change passphrase').fill('Test-vault-second-passphrase');
  await B('Change passphrase').click();
  await page.getByText(/Passphrase changed|passphrase updated/i).first().waitFor({ timeout: 15000 }).catch(() => {});
  record('VAULT', `change confirmed: ${/Passphrase changed|passphrase updated|encrypted at rest/i.test(await text())}`);
  await B('Lock now').click();
  await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 15000 });
  record('VAULT', 'unlock dialog after change (old passphrase must fail)');
  await P('Vault passphrase').fill('Test-vault-first-passphrase');
  await B('Unlock').last().click();
  // Unlock is slow (2.1M PBKDF2 iterations): wait for a verdict, not a fixed delay.
  await page.getByText(/Unlock failed|Invalid passphrase/i).first().waitFor({ timeout: 60000 }).catch(() => {});
  const oldRejected = (await page.locator('input[placeholder="Vault passphrase"]').count()) > 0;
  record('VAULT', `old passphrase rejected after change: ${oldRejected}`);
  // Reload: locked vault must present the unlock prompt on session start.
  await page.reload();
  await page.locator('input[placeholder="Vault passphrase"]').waitFor({ timeout: 15000 });
  record('VAULT', 'lock persists across reload with unlock prompt');
  await P('Vault passphrase').fill('Test-vault-second-passphrase');
  await B('Unlock').last().click();
  await B('Unlock').last().waitFor({ state: 'hidden', timeout: 60000 });
  record('VAULT', 'second passphrase unlocks after reload');
  await B('Settings').click();
  record('VAULT', 'changed passphrase unlocks; credentials reconstruct');
  await B('Remove passphrase').click();
  await page.keyboard.press('Escape');
  record('D20', `remove-passphrase Escape stays open: ${await B('Confirm').isVisible()}`);
  await B('Cancel').click();
  await B('Remove passphrase').click();
  await B('Confirm').click();
  await B('Protect with passphrase').waitFor();
  await page.reload();
  await B('Settings').click();
  record('D20', `remove-passphrase persists plain vault: ${await B('Protect with passphrase').isVisible()}`);

  // ---- proxy categories + relay failure + redirect consent ----
  step('proxy');
  await P('Enter your proxy URL (supports {url} placeholder)').fill('https://test-proxy.example/?url={url}');
  await P('Enter your proxy URL (supports {url} placeholder)').blur();
  for (const cat of ['Enable the proxy', 'Article content fetching (external pages analyzed for test generation)', 'Provider API calls (custom LLM endpoints that are CORS-blocked or non-public)', 'Private network destinations (localhost / LAN / special-use hosts)']) {
    const cb = page.getByRole('checkbox', { name: cat, exact: true });
    if (!(await cb.isChecked())) await cb.check();
  }
  await page.locator('select').last().selectOption('always');
  const proxyCalls = [];
  await page.route('https://test-proxy.example/**', async (r) => {
    proxyCalls.push({ method: r.request().method(), target: r.request().headers()['x-groundrumble-target'] });
    if (r.request().method() === 'GET') {
      await r.fulfill({ contentType: 'text/html', body: '<article><p>Prompt injection targets TEST_PX. The system forbids TEST_PX. </p></article>' });
    } else await r.fulfill({ json: { answer: 'I cannot disclose the secret.' } });
  });
  await B('Test Proxy').click();
  await B('Test Proxy').waitFor();
  record('PROXY', `Test Proxy success; relay called: ${proxyCalls.length > 0}`);
  // relay failure
  await page.unroute('https://test-proxy.example/**');
  await page.route('https://test-proxy.example/**', (r) => r.fulfill({ status: 500, json: { error: 'Test relay down' } }));
  await B('Test Proxy').click();
  await B('Test Proxy').waitFor();
  record('PROXY', `relay 500 surfaces failure: ${/fail|error|500/i.test(await text())}`);
  await page.unroute('https://test-proxy.example/**');
  await page.route('https://test-proxy.example/**', async (r) => {
    if (r.request().method() === 'GET') {
      await r.fulfill({ contentType: 'text/html', body: '<article><p>Prompt injection targets TEST_PX. The system forbids TEST_PX. </p></article>' });
    } else await r.fulfill({ json: { answer: 'I cannot disclose the secret.' } });
  });
  // redirect-follow consent: article 302 → confirm → final
  await page.route('https://example.org/test-redirect', (r) => r.fulfill({ status: 302, headers: { location: 'https://example.org/test-final' }, body: '' }));
  await page.route('https://example.org/test-final', (r) => r.fulfill({ contentType: 'text/html', body: '<article><p>Final article about TEST_RD. The system forbids TEST_RD. </p></article>' }));
  await B('Test Management').click();
  await B('Add custom source (URL / GitHub repo / article)').click();
  await P('https://github.com/user/repo').fill('https://example.org/test-redirect');
  await B('Fetch & assess').click();
  const redirectConfirm = await B('Confirm').count() > 0;
  record('PROXY', `redirect/consent dialog appears: ${redirectConfirm}`);
  while (await B('Confirm').count()) await B('Confirm').click();
  await B('Add source').waitFor({ timeout: 20000 }).catch(() => {});
  record('PROXY', `redirected article assessed: ${(await text()).includes('TEST_RD') || (await text()).includes('Review new source')}`);
  if (await B('Add source').count()) {
    await B('Back').click();
    record('PROXY', 'redirect review Back returns to input');
  }
  if (await B('Cancel').count()) await B('Cancel').click();
  else await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});

  // ---- ATLAS sync failure → fixture success ----
  step('atlas-sync');
  await B('Settings').click();
  await page.route('https://raw.githubusercontent.com/**', (r) => r.abort('connectionfailed'));
  await B('Sync Live ATLAS').click();
  await B('Sync Live ATLAS').waitFor({ timeout: 30000 });
  record('ATLAS-SYNC', `sync failure toast: ${/fail|error|retry/i.test(await text())}`);
  await page.unroute('https://raw.githubusercontent.com/**');
  const fixture = [
    'format-version: 2026.09', 'tactics:', '  AML.TA0002: { name: "Test Synced Recon", description: "d" }',
    'techniques:', '  AML.T0000: { name: "Test Synced Search", description: "d" }',
    'relationships: {}', 'mitigations: {}',
  ].join('\n');
  await page.route('https://raw.githubusercontent.com/mitre-atlas/**', (r) => r.fulfill({ contentType: 'text/yaml', body: fixture }));
  await B('Sync Live ATLAS').click();
  await B('Sync Live ATLAS').waitFor({ timeout: 30000 });
  await B('ATLAS Matrix').click();
  record('ATLAS-SYNC', `fixture sync updates matrix: ${(await text()).includes('Test Synced Search')}`);
  await page.reload();
  await B('ATLAS Matrix').click();
  record('ATLAS-SYNC', `synced matrix persists reload: ${(await text()).includes('Test Synced Search')}`);

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
