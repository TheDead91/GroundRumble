// Browser probe for the provider/helper-model settings
// surface — the Providers card (rows, draft form with preset quick-fill, model
// auto-fetch, the "Unencrypted keys" badge), the Sandbox Configuration card,
// the Helper Models card (AI Judge + Test Generator selection), the
// save-without-encryption choice flow, the card collapse state and the tour
// anchors.
//
// DOM-anchor-driven (data-tour / data-testid / visible copy only) and never
// references where the JSX lives.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/settings-view-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // The app auto-syncs MITRE ATLAS shortly after load; serve it hermetically.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: [
      'format-version: 2026.01',
      'tactics:',
      '  AML.TA0001: { name: "Execution", description: "d" }',
      'techniques:',
      '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
      'relationships: {}',
      'mitigations: {}'
    ].join('\n') });
  });

  // The saved provider auto-fetches its model list right after the save;
  // serve the models endpoint hermetically (never hit the real host).
  await page.route(/\/models\/?$/, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'mock-model-a' }, { id: 'mock-model-b' }] }) });
  });

  // Fresh session with onboarding done and demo mode on (the shipped default
  // experience), and no persisted providers or judge/gen config.
  await page.context().addInitScript(() => {
    if (!sessionStorage.getItem('__grSeeded')) {
      sessionStorage.setItem('__grSeeded', '1');
      localStorage.setItem('atlas_onboarding_done', '1');
      localStorage.setItem('atlas_demo_mode', 'true');
      localStorage.removeItem('atlas_providers');
      localStorage.removeItem('atlas_judge_config');
      localStorage.removeItem('atlas_gen_config');
      localStorage.removeItem('atlas_settings_collapsed');
    }
  });
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

  // --- A1: the settings surface renders with all of its cards ---
  await page.locator('[data-tour="nav-settings"]').click();

  const providersCard = page.locator('[data-tour="credentials-panel"]');
  await providersCard.getByText('Providers', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await providersCard.getByText(/No providers configured yet/).waitFor({ state: 'visible' });

  const helpersCard = page.locator('[data-tour="helper-models"]');
  await helpersCard.getByText('AI Judge Model', { exact: true }).waitFor({ state: 'visible' });
  await helpersCard.getByText('Test Generator Model', { exact: true }).waitFor({ state: 'visible' });

  const sandboxCard = page.locator('[data-tour="sandbox-config"]');
  await sandboxCard.getByText('Sandbox Configuration').waitFor({ state: 'visible' });
  await page.locator('[data-tour="sandbox-toggle"]').waitFor({ state: 'visible' });
  await page.locator('[data-tour="judge-config"]').waitFor({ state: 'visible' });
  await page.locator('[data-tour="gen-config"]').waitFor({ state: 'visible' });

  // Fresh unencrypted vault with no providers: no "Unencrypted keys" badge yet.
  assert.equal(await providersCard.locator('[data-testid="providers-plaintext-badge"]').count(), 0, 'no plaintext badge before a secret-carrying provider exists');

  // --- A1: the provider draft form quick-fills from a preset ---
  await providersCard.getByRole('button', { name: 'Add Provider' }).click();
  await providersCard.getByText('New Provider', { exact: true }).waitFor({ state: 'visible' });
  await providersCard.getByRole('button', { name: /Groq/ }).first().click();
  const nameInput = providersCard.locator('input[placeholder*="OpenAI, OpenRouter"]');
  const endpointInput = providersCard.locator('input[placeholder="https://api.openai.com/v1/chat/completions"]');
  assert.equal(await nameInput.inputValue(), 'Groq', 'preset quick-fill sets the provider name');
  assert.equal(await endpointInput.inputValue(), 'https://api.groq.com/openai/v1/chat/completions', 'preset quick-fill sets the endpoint');

  // --- A2: the save-without-encryption choice flow ---
  await providersCard.locator('input[placeholder="Optional (leave blank if none required)"]').fill('sk-test-browser-key');
  await providersCard.getByText(/Your vault is not encrypted\. API keys will be stored in plaintext\./).waitFor({ state: 'visible' });

  // The choice dialog text and buttons (the dialog renders via the shared
  // ConfirmDialog machinery; .first() because the legacy App.jsx dialog copy
  // and the AppLayout ConfirmDialog can both be mounted at baseline).
  const choiceMessage = page.getByText('Do you want to set up encryption first, or save without encryption?').last();
  const dialogButton = (name) => page.getByRole('button', { name, exact: true }).last();

  // Cancel path: the choice dialog appears; cancelling keeps the draft open.
  await providersCard.getByRole('button', { name: 'Save Provider' }).click();
  await choiceMessage.waitFor({ state: 'visible', timeout: 5000 });
  await dialogButton('Cancel').click();
  await providersCard.getByText('New Provider', { exact: true }).waitFor({ state: 'visible' });
  assert.ok(await nameInput.isVisible(), 'cancel leaves the draft open');
  assert.equal(await page.locator('[data-testid^="provider-row-"]').count(), 0, 'cancel saves nothing');

  // "Set up encryption" path: the passphrase prompt enforces 12+ chars and is
  // cancellable — the save aborts and the draft survives.
  await providersCard.getByRole('button', { name: 'Save Provider' }).click();
  await choiceMessage.waitFor({ state: 'visible', timeout: 5000 });
  await dialogButton('Set up encryption').click();
  const passphraseInput = page.locator('div[style*="z-index: 9999"] input[type="password"]').last();
  const passphrasePrompt = page.getByText('Enter a passphrase to encrypt your vault (min 12 characters):').last();
  await passphrasePrompt.waitFor({ state: 'visible', timeout: 5000 });
  await passphraseInput.fill('short');
  await dialogButton('OK').click();
  await page.getByText('Passphrase must be at least 12 characters.').last().waitFor({ state: 'visible', timeout: 5000 });
  await dialogButton('Cancel').click();
  await providersCard.getByText('New Provider', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-testid^="provider-row-"]').count(), 0, 'aborting encryption setup aborts the save');

  // "Save anyway" path: the provider saves unencrypted.
  await providersCard.getByRole('button', { name: 'Save Provider' }).click();
  await choiceMessage.waitFor({ state: 'visible', timeout: 5000 });
  await dialogButton('Save anyway').click();
  const row = page.locator('[data-testid^="provider-row-"]');
  await row.getByText(/Groq/).first().waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await row.count(), 1, 'exactly one provider row exists after the save');
  await row.getByText('OpenAI-compatible', { exact: true }).waitFor({ state: 'visible' });
  await row.getByText('https://api.groq.com/openai/v1/chat/completions', { exact: false }).waitFor({ state: 'visible' });
  await providersCard.locator('[data-testid="providers-plaintext-badge"]').waitFor({ state: 'visible', timeout: 5000 });

  // The auto-fetch merges the mock model list into the row — the provider
  // round-tripped through the vault (IndexedDB) and came back with its models.
  await row.getByText(/2 model\(s\)/).waitFor({ state: 'visible', timeout: 10000 });
  const rowText = await row.innerText();
  assert.ok(rowText.includes('sk-test-br') === false, 'the stored API key is never echoed back into the row');

  // --- A1/A2: Helper Models selection drives the persisted judge config ---
  // The judge provider select lists the saved provider and — through the App's
  // auto-fallback effect — is already pointed at it (no "Needs attention"
  // banner: judge AND generator both resolve against a configured provider).
  const judgeProviderSelect = page.locator('[data-tour="judge-config"] select').first();
  await judgeProviderSelect.waitFor({ state: 'visible', timeout: 5000 });
  const judgeProviderValue = await judgeProviderSelect.inputValue();
  assert.ok(judgeProviderValue.startsWith('cp_'), 'the judge provider auto-falls back to the saved provider');
  await judgeProviderSelect.selectOption({ label: 'Groq' });
  const judgeModelSelect = page.locator('[data-tour="judge-config"] select').nth(1);
  await judgeModelSelect.selectOption('mock-model-a');
  await page.waitForFunction(() => {
    try { const cfg = JSON.parse(localStorage.getItem('atlas_judge_config')); return cfg && cfg.model === 'mock-model-a'; } catch { return false; }
  }, null, { timeout: 5000 });
  const judgeCfg = JSON.parse(await page.evaluate(() => localStorage.getItem('atlas_judge_config')));
  assert.equal(judgeCfg.provider, judgeProviderValue, 'the judge provider persists');
  assert.equal(judgeCfg.model, 'mock-model-a', 'the judge model persists');
  assert.equal(await page.getByText('Needs attention').count(), 0, 'no "Needs attention" banner once judge and generator resolve');

  // --- A2: the sandbox toggle persists atlas_demo_mode ---
  const sandboxToggle = page.locator('[data-tour="sandbox-toggle"] input[type="checkbox"]');
  assert.equal(await sandboxToggle.isChecked(), true, 'sandbox starts ON for a fresh demo session');
  await sandboxToggle.uncheck();
  await page.waitForFunction(() => localStorage.getItem('atlas_demo_mode') === 'false', null, { timeout: 5000 });
  await sandboxToggle.check();
  await page.waitForFunction(() => localStorage.getItem('atlas_demo_mode') === 'true', null, { timeout: 5000 });

  // --- A3: card collapse state comes from SettingsContext and persists ---
  const chevron = providersCard.getByTitle('Collapse card');
  assert.equal(await chevron.getAttribute('aria-expanded'), 'true', 'the Providers card starts expanded');
  await chevron.click();
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_settings_collapsed')).providers === true; } catch { return false; }
  }, null, { timeout: 5000 });
  // Collapsing flips the chevron's title — re-locate it by its new title.
  const expandedChevron = providersCard.getByTitle('Expand card');
  assert.equal(await expandedChevron.getAttribute('aria-expanded'), 'false', 'the chevron collapses the card');
  await providersCard.getByText(/Connect the model hosts you want to use/).waitFor({ state: 'hidden' });
  await expandedChevron.click();
  await providersCard.getByText(/Connect the model hosts you want to use/).waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_settings_collapsed')).providers === false; } catch { return false; }
  }, null, { timeout: 5000 });

  // The browser session must stay clean: no uncaught page errors anywhere.
  assert.deepEqual(pageErrors, [], 'no uncaught page errors during the whole flow');
} finally {
  await browser.close();
}
