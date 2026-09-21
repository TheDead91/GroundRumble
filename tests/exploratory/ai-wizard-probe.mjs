// Browser probe for the AI Test Generation
// wizard — overlay frame, header, step indicator, the sources step (row
// toggles, selected count, zero-source gate) and the config step (advanced
// mode, batch, budget, generation mode + their persistence) — driven purely
// through visible copy and roles.
//
// It never references where the wizard JSX lives.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/ai-wizard-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // Fresh demo-mode session with no persisted AI-gen state.
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

  // --- A1/A3: the wizard opens from the Test Management tab and mounts only when open ---
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.locator('[data-tour="ai-generate"]').click();
  const dialog = page.locator('div.glass-card', { has: page.locator('h3') }).filter({ hasText: 'AI Test Generator' });
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  const overlay = page.locator('div[style*="backdrop-filter: blur(4px)"], div[style*="rgba(0, 0, 0, 0.75)"]');
  assert.ok(await overlay.count() >= 1, 'the fixed overlay renders while the wizard is open');
  const chips = dialog.locator('span').filter({ hasText: /^(\d)\. / });
  assert.equal(await chips.count(), 4, 'simple mode starts with the 4-step indicator (sources/config/running/results)');
  assert.equal((await chips.nth(0).textContent()).trim(), '1. Sources', 'the sources chip is first');
  assert.equal((await chips.nth(1).textContent()).trim(), '2. Options', 'the config chip is second');
  assert.equal(await chips.nth(0).getAttribute('style').then(s => s.includes('var(--color-primary)'), false), true, 'the active step chip is highlighted');

  // --- A1: the sources step lists bundled + custom rows with live counts ---
  const bundled = dialog.locator('label', { hasText: 'OWASP LLM01: Prompt Injections' }).first();
  await bundled.waitFor({ state: 'visible', timeout: 5000 });
  const headline = () => dialog.locator('div').filter({ hasText: /^Select sources for this run \(/ }).first().textContent();
  const selectedBefore = await headline();
  await bundled.locator('input[type="checkbox"]').uncheck();
  assert.notEqual(await headline(), selectedBefore, 'unticking a bundled source updates the selected count');
  assert.ok(await dialog.getByText('No sources selected — tick at least one above').count() === 0, 'the zero-sources warning stays hidden while rows remain selected');

  // --- A2: the zero-source validation gate disables Next ---
  const checkboxes = dialog.locator('input[type="checkbox"]');
  const n = await checkboxes.count();
  for (let i = 0; i < n; i++) await checkboxes.nth(i).uncheck();
  assert.ok(await dialog.getByText('No sources selected — tick at least one above').isVisible(), 'the zero-sources warning appears');
  const nextBtn = dialog.getByRole('button', { name: 'Next', exact: true });
  assert.equal(await nextBtn.isDisabled(), true, 'Next is disabled with zero selected sources');
  await checkboxes.nth(0).check();
  assert.equal(await nextBtn.isDisabled(), false, 'Next re-enables once a source is selected');
  await nextBtn.click();

  // --- A1/A2: the config step renders generator-model + option controls ---
  await dialog.getByText('Generator model', { exact: true }).waitFor({ timeout: 5000 });
  await dialog.getByText('Generation options', { exact: true }).waitFor({ timeout: 5000 });
  const chips2 = dialog.locator('span').filter({ hasText: /^(\d)\. / });
  assert.equal((await chips2.nth(1).getAttribute('style')).includes('var(--color-primary)'), true, 'the config step highlights chip 2');

  // --- A2: persisted toggles — advanced mode, batch, budget, mode ---
  await dialog.getByRole('button', { name: 'Advanced', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('atlas_ai_gen_advanced')), '1', 'advanced mode persists atlas_ai_gen_advanced');
  assert.equal(await chips2.count(), 5, 'the step indicator switches to the advanced 5-chip order');
  await dialog.locator('select:has(option[value="3"])').first().selectOption('3');
  assert.equal(await page.evaluate(() => localStorage.getItem('atlas_ai_gen_batch')), '3', 'batch persists atlas_ai_gen_batch');
  await dialog.locator('select:has(option[value="1024"])').first().selectOption('1024');
  assert.equal(await page.evaluate(() => localStorage.getItem('atlas_ai_gen_budget')), '1024', 'budget persists atlas_ai_gen_budget');
  await dialog.getByRole('button', { name: 'Fast', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('atlas_ai_gen_mode')), 'fast', 'mode persists atlas_ai_gen_mode');

  // --- A2: Back returns to sources, then the header close button dismisses ---
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByText('Select sources for this run').first().waitFor({ timeout: 5000 });
  await dialog.locator('button:has(svg)').first().click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  assert.equal(await page.locator('h3:has-text("AI Test Generator")').count(), 0, 'no wizard DOM remains after close (A3: conditional render)');

  // --- A2: persisted toggles survive a reload and re-open at the sources step ---
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Test Management', exact: true }).click();
  await page.locator('[data-tour="ai-generate"]').click();
  const dialog2 = page.locator('div.glass-card', { has: page.locator('h3') }).filter({ hasText: 'AI Test Generator' });
  await dialog2.waitFor({ state: 'visible', timeout: 5000 });
  const chips3 = dialog2.locator('span').filter({ hasText: /^(\d)\. / });
  assert.equal(await chips3.count(), 5, 'the advanced 5-chip order survives the reload');
  assert.equal((await chips3.nth(2).textContent()).trim(), '3. Profiles', 'the advanced order inserts the profiles step');
  await dialog2.locator('button:has(svg)').first().click();
  await dialog2.waitFor({ state: 'detached', timeout: 5000 });

  assert.deepEqual(pageErrors, [], 'zero uncaught page errors');
} finally {
  await browser.close();
}
console.log('AI wizard probe: PASS');
