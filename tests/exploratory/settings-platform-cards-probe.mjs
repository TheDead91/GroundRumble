// Browser probe for the settings platform cards —
// the MITRE ATLAS sync card with its live status line, the Proxy
// Configuration card with immediate persistence, the Account & Data card (Key
// Vault passphrase flows + Backup & Restore export/import-modal), Reset
// Platform and Help & Onboarding.
//
// DOM-anchor-driven (data-tour / data-testid only) and never references where
// the cards live.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/settings-platform-cards-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // Serve the ATLAS sync hermetically (v6 pointer 404s; the legacy document is
  // a minimal valid framework) so the sync flow is deterministic.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    if (route.request().url().includes('ATLAS-latest.yaml')) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: [
      'version: "2026.01"',
      'tactics:',
      '  AML.TA0001: { name: "Execution", description: "d" }',
      'techniques:',
      '  AML.T0034: { name: "LLM Prompt Injection", description: "x" }',
      'relationships:',
      '  AML.T0034:',
      '    achieves:',
      '      - target: AML.TA0001',
      'mitigations: {}'
    ].join('\n') });
  });

  // Fresh demo-mode session with no persisted state.
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

  // --- A1: the four platform cards render on the settings tab ---
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const marker of ['atlas-sync-settings', 'cors-card', 'account-data', 'key-vault', 'backup-card', 'help-onboarding']) {
    await page.locator(`[data-tour="${marker}"]`).waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await page.locator(`[data-tour="${marker}"]`).count(), 1, `the settings tab carries data-tour="${marker}" exactly once`);
  }

  // --- A2: proxy edits persist immediately (atlas_proxy) ---
  const cors = page.locator('[data-tour="cors-card"]');
  const enableBox = cors.locator('input[type="checkbox"]').first();
  await enableBox.waitFor({ state: 'visible' });
  await enableBox.check();
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_proxy') || '{}').enabled === true; } catch { return false; }
  }, { timeout: 10000 });
  await cors.getByPlaceholder('Enter your proxy URL (supports {url} placeholder)').fill('http://127.0.0.1:9999/proxy?url={url}');
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_proxy') || '{}').url === 'http://127.0.0.1:9999/proxy?url={url}'; } catch { return false; }
  }, { timeout: 10000 });
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas_proxy')));
  assert.equal(cfg.enabled, true, 'the proxy enable flip persists');
  assert.equal(cfg.mode, 'fallback', 'the proxy mode persists with its default');

  // --- A2: the ATLAS sync button updates the cached matrix + the status line ---
  await page.getByRole('button', { name: 'Sync Live ATLAS', exact: true }).click();
  await page.getByText(/Last synced .+ · version 2026\.01/).waitFor({ state: 'visible', timeout: 20000 });
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas_cached_matrix') || 'null'));
  assert.ok(Array.isArray(cached) && cached.length === 1 && cached[0].id === 'AML.TA0001', 'the synced matrix replaces the cache');

  // --- A2: Key Vault — short passphrase is rejected, a real one encrypts ---
  const vault = page.locator('[data-tour="key-vault"]');
  const protectInput = vault.getByTestId('vault-protect-input');
  const assertPassphraseRows = async (protectedVault) => {
    const label = vault.locator('label').filter({ hasText: protectedVault ? /^New passphrase:$/ : /^Passphrase:$/ });
    const input = protectedVault ? vault.getByLabel('New passphrase:', { exact: true }) : protectInput;
    const submit = vault.getByRole('button', { name: protectedVault ? 'Change passphrase' : 'Protect with passphrase', exact: true });
    assert.equal(await submit.isVisible(), true);
    const { labelBox, inputBox, submitBox, lockBox, removeBox } = await vault.evaluate((element, protectedVault) => {
      const input = element.querySelector(protectedVault ? '#vault-change-input' : '#vault-protect-input');
      const rect = node => node?.getBoundingClientRect().toJSON();
      const button = name => [...element.querySelectorAll('button')].find(node => node.textContent.trim() === name);
      return {
        labelBox: rect(element.querySelector(`label[for="${input.id}"]`)),
        inputBox: rect(input),
        submitBox: rect(button(protectedVault ? 'Change passphrase' : 'Protect with passphrase')),
        lockBox: rect(button('Lock now')),
        removeBox: rect(button('Remove passphrase')),
      };
    }, protectedVault);
    assert.ok(labelBox && inputBox && submitBox, 'passphrase controls are visible');
    assert.equal(await label.getAttribute('for'), await input.getAttribute('id'), 'label identifies its input');
    if (page.viewportSize().width >= 1280) {
      assert.ok(labelBox.x + labelBox.width <= inputBox.x, 'label precedes the input');
      assert.ok(inputBox.x + inputBox.width <= submitBox.x, 'input precedes submit');
      assert.ok(Math.abs(inputBox.y + inputBox.height / 2 - submitBox.y - submitBox.height / 2) < 2, 'input and submit share the first row');
    }
    if (protectedVault) {
      assert.ok(lockBox.y >= Math.max(inputBox.y + inputBox.height, submitBox.y + submitBox.height), 'lock stays below the passphrase row');
      assert.ok(removeBox.y >= lockBox.y, 'remove never precedes lock');
      if (page.viewportSize().width >= 1280) {
        assert.equal(lockBox.y, removeBox.y, 'lock and remove share the second row');
        assert.ok(lockBox.x + lockBox.width <= removeBox.x, 'lock precedes remove');
      }
    }
  };
  await assertPassphraseRows(false);
  const validationMessage = 'Use a passphrase of at least 12 characters.';
  const assertSingleToast = async () => {
    const toast = page.locator('span').filter({ hasText: new RegExp(`^${validationMessage.replaceAll('.', '\\.')}\\s*$`) })
      .locator('..').filter({ has: page.locator(':scope > button') });
    assert.equal(await toast.count(), 1, 'one notification per submit');
    await toast.getByRole('button').click();
  };
  const assertInvalid = async (input, errorId) => {
    const error = vault.locator(`#${errorId}`);
    await error.waitFor({ state: 'visible' });
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await input.getAttribute('aria-describedby'), errorId);
    assert.equal(await error.textContent(), validationMessage);
    await page.waitForFunction(id => {
      const error = document.getElementById(id);
      const input = document.querySelector(`[aria-describedby="${id}"]`);
      return input && error && getComputedStyle(input).borderTopColor === getComputedStyle(error).color;
    }, errorId);
    // Read both rectangles in one frame; resizing can scroll the focused input.
    const { inputBox, errorBox } = await input.evaluate((element, id) => ({
      inputBox: element.getBoundingClientRect().toJSON(),
      errorBox: document.getElementById(id).getBoundingClientRect().toJSON(),
    }), errorId);
    assert.ok(errorBox.y >= inputBox.y + inputBox.height, 'reason appears below the field');
  };
  for (const [value, submit] of [['', 'click'], ['four', 'enter'], ['0123456789a', 'click']]) {
    await protectInput.fill(value);
    assert.equal(await protectInput.getAttribute('aria-invalid'), 'false');
    if (submit === 'enter') await protectInput.press('Enter');
    else await vault.getByTestId('vault-protect').click();
    await assertInvalid(protectInput, 'vault-protect-error');
    await assertPassphraseRows(false);
    await assertSingleToast();
  }
  await page.getByTitle('Collapse sidebar', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await protectInput.focus();
  await assertInvalid(protectInput, 'vault-protect-error');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTitle('Expand sidebar', { exact: true }).click();
  await page.getByText('Your keys are encrypted at rest and unlocked for this session.').waitFor({ state: 'hidden' }).catch(() => {});
  assert.equal(await page.getByText('Your keys are encrypted at rest and unlocked for this session.').count(), 0, 'a short passphrase never flips the vault to encrypted');
  await protectInput.fill('0123456789ab');
  assert.equal(await protectInput.getAttribute('aria-invalid'), 'false');
  assert.equal(await protectInput.getAttribute('aria-describedby'), null);
  assert.equal(await protectInput.evaluate(input => input.style.borderColor), '');
  assert.equal(await vault.locator('#vault-protect-error').count(), 0);
  await vault.getByTestId('vault-protect').click();
  await page.getByText('Your keys are encrypted at rest and unlocked for this session.').waitFor({ state: 'visible', timeout: 15000 });
  await vault.getByText('ENCRYPTED', { exact: true }).waitFor({ state: 'visible' });
  await vault.getByRole('button', { name: 'Lock now', exact: true }).waitFor({ state: 'visible' });

  const changeInput = vault.getByPlaceholder('Change passphrase');
  await assertPassphraseRows(true);
  await changeInput.fill('four');
  await changeInput.press('Enter');
  await assertInvalid(changeInput, 'vault-change-error');
  await assertPassphraseRows(true);
  await assertSingleToast();
  await page.getByTitle('Collapse sidebar', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertInvalid(changeInput, 'vault-change-error');
  await assertPassphraseRows(true);
  await changeInput.fill('correct horse battery staple');
  assert.equal(await changeInput.getAttribute('aria-invalid'), 'false');
  assert.equal(await vault.locator('#vault-change-error').count(), 0);
  await vault.getByRole('button', { name: 'Change passphrase', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[placeholder="Change passphrase"]')?.value === '');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByTitle('Expand sidebar', { exact: true }).click();
  await assertPassphraseRows(true);

  // --- A2: Backup & Restore — export downloads an encrypted JSON backup ---
  const backup = page.locator('[data-tour="backup-card"]');
  const backupInput = backup.locator('input[type="password"]');
  const backupError = backup.locator('#backup-export-error');
  const backupMessage = 'Set a backup passphrase of at least 12 characters. GroundRumble backups are encrypted-only.';
  const downloads = [];
  page.on('download', download => downloads.push(download));
  for (const [value, submit] of [['', 'click'], ['short', 'enter'], ['0123456789a', 'click']]) {
    await backupInput.fill(value);
    assert.equal(await backupInput.getAttribute('aria-invalid'), 'false');
    if (submit === 'enter') await backupInput.press('Enter');
    else await backup.getByTestId('backup-export').click();
    await backupError.waitFor({ state: 'visible' });
    assert.equal(await backupError.textContent(), backupMessage);
    assert.equal(await backupInput.getAttribute('aria-invalid'), 'true');
    assert.equal(await backupInput.getAttribute('aria-describedby'), 'backup-export-error');
    await page.waitForFunction(() => {
      const error = document.getElementById('backup-export-error');
      const input = document.querySelector('[aria-describedby="backup-export-error"]');
      return input && error && getComputedStyle(input).borderTopColor === getComputedStyle(error).color;
    });
    const belowInput = await backupInput.evaluate(input =>
      document.getElementById('backup-export-error').getBoundingClientRect().top >= input.getBoundingClientRect().bottom);
    assert.equal(belowInput, true, 'error appears below the passphrase field');
    const backupToast = page.getByText(`Export failed: ${backupMessage}`, { exact: true })
      .locator('..').filter({ has: page.locator(':scope > button') });
    await backupToast.waitFor({ state: 'visible' });
    assert.equal(await backupToast.count(), 1, 'one notification per submit');
    await backupToast.getByRole('button').click();
    assert.equal(downloads.length, 0, 'invalid input never downloads a backup');
  }
  await backupInput.fill('0123456789ab');
  assert.equal(await backupInput.getAttribute('aria-invalid'), 'false');
  assert.equal(await backupInput.getAttribute('aria-describedby'), null);
  assert.equal(await backupInput.evaluate(input => input.style.borderColor), '');
  assert.equal(await backupError.count(), 0);
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await backup.getByTestId('backup-export').click();
  const download = await downloadPromise;
  await page.waitForFunction(() => document.querySelector('[data-tour="backup-card"] input[type="password"]').value === '');
  assert.equal(await backupInput.getAttribute('aria-invalid'), 'false');
  assert.equal(await backupError.count(), 0);
  assert.match(download.suggestedFilename(), /^groundrumble-backup-\d{4}-\d{2}-\d{2}\.json$/, 'the export downloads as groundrumble-backup-<date>.json');

  // --- A2: importing a backup opens the App-side passphrase modal ---
  await backup.getByTestId('backup-import-input').setInputFiles(await download.path());
  await page.getByText('Encrypted backup', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('backup-passphrase-input').waitFor({ state: 'visible' });
  await page.getByTestId('backup-passphrase-import').waitFor({ state: 'visible' });
  await page.getByTestId('backup-passphrase-cancel').click();
  await page.getByText('Encrypted backup', { exact: true }).waitFor({ state: 'hidden' });

  // --- A3: card collapse persists through atlas_settings_collapsed ---
  await page.locator('[data-tour="cors-card"]').locator('button[aria-expanded]').first().click();
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_settings_collapsed') || '{}').cors === true; } catch { return false; }
  }, { timeout: 10000 });
  await page.locator('[data-tour="cors-card"]').locator('button[aria-expanded]').first().click();
  await page.waitForFunction(() => {
    try { return JSON.parse(localStorage.getItem('atlas_settings_collapsed') || '{}').cors === false; } catch { return false; }
  }, { timeout: 10000 });

  // --- A1: Help & Onboarding buttons render ---
  const help = page.locator('[data-tour="help-onboarding"]');
  await help.getByRole('button', { name: 'Replay onboarding', exact: true }).waitFor({ state: 'visible' });
  await help.getByRole('button', { name: 'Start interface tour', exact: true }).waitFor({ state: 'visible' });

  assert.deepEqual(pageErrors, [], 'no uncaught page errors during the settings flow');
} finally {
  await browser.close();
}
