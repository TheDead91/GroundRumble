import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

// Follow the shared browser-suite contract (see scripts/run-browser-tests.mjs):
// TEST_URL is injected by the runner, so the suite skips instead of hitting a
// hard-coded port that may not be serving. No `||` fallback: a fixed port is
// exactly what broke the entry against `npm test` (ERR_CONNECTION_REFUSED).
const TEST_URL = process.env.TEST_URL;
const SKIP_REASON = TEST_URL ? false
  : 'TEST_URL is not set; run via npm run test:browser or scripts/run-browser-tests.mjs';

const withPage = async (runScenario) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await runScenario(page);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
};

async function setupLockedVault(page) {
  // First, set up a plain vault with some providers, then protect and lock it
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  
  // Handle onboarding if present
  const skip = page.getByRole('button', { name: /Skip — I already know this tool/ });
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skip.click();
  }
  
  // Wait for app to load
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  
  // Navigate to Settings and protect the vault with a passphrase
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Key Vault', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  
  // Fill in the passphrase and protect the vault
  await page.getByTestId('vault-protect-input').fill('test-passphrase-123');
  await page.getByTestId('vault-protect').click();
  await page.getByTestId('vault-lock').waitFor({ state: 'visible', timeout: 15000 });
  
  // Now lock the vault
  await page.getByTestId('vault-lock').click({ force: true });
  
  // Wait for the unlock prompt to appear (locked state)
  await page.getByTestId('vault-passphrase-input').first().waitFor({ state: 'visible', timeout: 15000 });
  
  // Close the unlock prompt by clicking "Continue in read-only mode"
  const continueBtn = page.getByRole('button', { name: /Continue in read-only mode/ });
  if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.click();
  }
  
  // Wait for the UI to update
  await page.waitForTimeout(1000);
  
  // Verify locked state via the app's read-only gate: the Settings tab itself
  // is disabled (data-locked) in locked mode, so it cannot be navigated back
  // into — the read-only-mode scenario below asserts the same surface.
  const settingsNav = page.getByRole('button', { name: 'Settings', exact: true });
  await settingsNav.waitFor({ state: 'visible', timeout: 15000 });
  const isSettingsDisabled = await settingsNav.isDisabled();
  console.log('[setupLockedVault] Settings tab disabled (locked gate):', isSettingsDisabled);
  if (!isSettingsDisabled) {
    throw new Error('Vault is not locked - Settings tab should be disabled in read-only mode');
  }
  console.log('[setupLockedVault] Vault successfully locked');
}

async function testReadWriteMode(page) {
  // In read-write mode (unlocked vault), all buttons should be enabled
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  
  // Handle onboarding if present
  const skip = page.getByRole('button', { name: /Skip — I already know this tool/ });
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skip.click();
  }
  
  // Wait for app to load - wait for Settings tab to be clickable
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  
  // Navigate to Settings and check Provider buttons
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Key Vault', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  
  // Expand Providers section if collapsed
  const providersHeader = page.getByRole('button', { name: /Providers/, exact: false });
  if (await providersHeader.isVisible({ timeout: 5000 }).catch(() => false)) {
    const isExpanded = await providersHeader.getAttribute('aria-expanded');
    if (isExpanded === 'false') {
      await providersHeader.click();
    }
  }
  
  // Check Add Provider button is enabled
  await page.getByRole('button', { name: 'Add Provider', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.getByRole('button', { name: 'Add Provider', exact: true }).isDisabled(), false);
  
  // Check Audit Logs History buttons
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const historyRows = page.getByTestId('history-row');
  if (await historyRows.count() > 0) {
    const row = historyRows.first();
    await row.waitFor({ state: 'visible' });
    
    // View button (Eye icon) should be enabled
    const viewBtn = row.locator('button[data-tip="View"]');
    if (await viewBtn.count() > 0) {
      assert.equal(await viewBtn.isDisabled(), false, 'View button should be enabled in read-write mode');
    }
    
    // Report button should be enabled
    const reportBtn = row.locator('button[data-tip="Report"]');
    if (await reportBtn.count() > 0) {
      assert.equal(await reportBtn.isDisabled(), false, 'Report button should be enabled in read-write mode');
    }
    
    // Delete button should be enabled
    const deleteBtn = row.locator('button[data-tip="Delete"]');
    if (await deleteBtn.count() > 0) {
      assert.equal(await deleteBtn.isDisabled(), false, 'Delete button should be enabled in read-write mode');
    }
  }
}

async function testReadOnlyMode(page) {
  // Setup locked vault
  await setupLockedVault(page);
  
  // Now in read-only mode (locked vault)
  // Close the unlock prompt if open
  const unlockPromptClose = page.getByRole('button', { name: /Continue in read-only mode/ });
  if (await unlockPromptClose.isVisible({ timeout: 5000 }).catch(() => false)) {
    await unlockPromptClose.click();
  }
  
  // Now in read-only mode (locked vault)
  // Check that restricted tabs are disabled (not clickable)
  const auditorBtn = page.getByRole('button', { name: 'Auditor Runner', exact: true });
  await auditorBtn.waitFor({ state: 'visible' });
  assert.equal(await auditorBtn.isDisabled(), true, 'Auditor Runner tab should be disabled in read-only mode');
  
  const promptsBtn = page.getByRole('button', { name: 'AI Prompts', exact: true });
  await promptsBtn.waitFor({ state: 'visible' });
  assert.equal(await promptsBtn.isDisabled(), true, 'AI Prompts tab should be disabled in read-only mode');
  
  // Settings tab should also be disabled in read-only mode (only Dashboard accessible)
  const settingsBtn = page.getByRole('button', { name: 'Settings', exact: true });
  await settingsBtn.waitFor({ state: 'visible' });
  assert.equal(await settingsBtn.isDisabled(), true, 'Settings tab should be disabled in read-only mode');
  
  // Check that Dashboard is accessible
  const dashboardBtn = page.getByRole('button', { name: 'Dashboard', exact: true });
  await dashboardBtn.waitFor({ state: 'visible' });
  assert.equal(await dashboardBtn.isDisabled(), false, 'Dashboard tab should be accessible in read-only mode');
  
  // Check that history buttons are disabled
  // Dashboard should be accessible, check history buttons there
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const historyRows = page.getByTestId('history-row');
  if (await historyRows.count() > 0) {
    const row = historyRows.first();
    await row.waitFor({ state: 'visible' });
    
    // View button should be disabled
    const viewBtn = row.locator('button[data-tip="View"]');
    if (await viewBtn.count() > 0) {
      assert.equal(await viewBtn.isDisabled(), true, 'View button should be disabled in read-only mode');
    }
    
    // Report button should be disabled
    const reportBtn = row.locator('button[data-tip="Report"]');
    if (await reportBtn.count() > 0) {
      assert.equal(await reportBtn.isDisabled(), true, 'Report button should be disabled in read-only mode');
    }
    
    // Delete button should be disabled
    const deleteBtn = row.locator('button[data-tip="Delete"]');
    if (await deleteBtn.count() > 0) {
      assert.equal(await deleteBtn.isDisabled(), true, 'Delete button should be disabled in read-only mode');
    }
  }

  // Check that Auditor Runner is disabled
  await auditorBtn.waitFor({ state: 'visible' });
  assert.equal(await auditorBtn.isDisabled(), true, 'Auditor Runner tab should be disabled in read-only mode');
}

async function testUnlockFlow(page) {
  // Unlocking restores the gated actions. PBKDF2 key derivation can take a
  // minute on slow hardware, so the re-enable assertion allows 120s.
  await setupLockedVault(page);
  const continueBtn = page.getByRole('button', { name: /Continue in read-only mode/ });
  if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await continueBtn.click();
  }
  await page.getByRole('button', { name: /Unlock keys/ }).click();
  const input = page.getByTestId('vault-passphrase-input').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill('test-passphrase-123');
  await input.press('Enter');
  const auditorBtn = page.getByRole('button', { name: 'Auditor Runner', exact: true });
  await auditorBtn.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const buttons = [...document.querySelectorAll('button')];
      const auditor = buttons.find((b) => b.textContent.trim() === 'Auditor Runner');
      return auditor && !auditor.disabled;
    },
    null,
    { timeout: 120000 },
  );
  assert.equal(await auditorBtn.isDisabled(), false, 'Auditor Runner re-enables after unlock');
}

test('read-only mode buttons — read-write mode (unlocked vault)', { skip: SKIP_REASON }, () => withPage(async (page) => {
  await testReadWriteMode(page);
  console.log('✓ Read-write mode tests passed');
}));

test('read-only mode buttons — read-only mode (locked vault)', { skip: SKIP_REASON }, () => withPage(async (page) => {
  await testReadOnlyMode(page);
  console.log('✓ Read-only mode tests passed');
}));

test('read-only mode buttons — unlock flow', { skip: SKIP_REASON }, () => withPage(testUnlockFlow));
