// Dialog exhaustion — full guided tutorial (D18), Default-preset restore reload (D22),
// Judge stale-confirm apply + forcing variant (D21), reset platform (D28).
// Test-only; deviations recorded as findings.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const B = (name) => page.getByRole('button', { name, exact: true });
const text = () => page.locator('body').innerText();
const sim = await installMockProvider(page);
void sim;
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const step = (s) => console.error(`Test5D-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const finding = (id, d) => findings.push({ id, observed: d });

try {
  await page.goto(base);
  step('tutorial');
  await B("Let's get started").click();
  const tourNext = async (tag) => {
    for (let k = 0; k < 20; k++) {
      if (await B('Next').isEnabled().catch(() => false)) { await B('Next').click(); return `${tag} via Next`; }
      if (await B('Finish').count()) return `${tag} already at Finish`;
      await page.waitForTimeout(500);
    }
    await B('Skip this step').click().catch(() => {});
    return `${tag} via Skip (Next stayed disabled)`;
  };
  const titles = [];
  for (let i = 0; i < 19; i++) {
    const t = await text();
    const m = t.match(/TUTORIAL (\d+) \/ 19/);
    titles.push(m ? m[1] : '?');
    if (i === 1) {
      await B('Back').click();
      record('D18', `Back returns to step 1: ${(await text()).includes('TUTORIAL 1 / 19')}`);
      await B('Next').click();
      record('D18', await tourNext('step-2-after-back'));
    } else if (t.includes('Explore a technique') || t.includes('technique card')) {
      await page.getByText('LLM Prompt Injection', { exact: true }).first().click();
      record('D18', await tourNext('technique-selection gate'));
    } else if (t.includes('Load preset') || t.includes('Attack Payloads Selection')) {
      await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Default (5)', exact: true }) }).selectOption({ label: 'Default (5)' }).catch(() => {});
      let advanced = false;
      for (let k = 0; k < 20 && !advanced; k++) {
        if (await B('Next').isEnabled().catch(() => false)) { await B('Next').click(); advanced = true; }
        else await page.waitForTimeout(500);
      }
      if (!advanced) {
        await B('Skip this step').click().catch(() => {});
        record('D18', 'preset gate Next stayed disabled; used Skip this step');
      } else record('D18', 'preset-selection gate passed via Next');
    } else if (t.includes('Run Comparison Audit') && t.includes('Click')) {
      await B('Run Comparison Audit').click();
      await B('Run Comparison Audit').waitFor({ timeout: 60000 });
      record('D18', 'run gate executes sandbox audit');
    } else if (t.includes('Show Console')) {
      await B('Show Console').click();
      record('D18', await tourNext('console gate'));
    } else if (t.includes('VULNERABLE cell') || t.includes('Comparison Results')) {
      await B('VULNERABLE').first().click().catch(() => {});
      record('D18', await tourNext('result-detail gate'));
    } else {
      if (await B('Finish').count()) break;
      record('D18', await tourNext(`generic step ${titles[titles.length-1]}`));
    }
    if (await B('Finish').count()) break;
  }
  record('D18', `walked steps: ${titles.join(',')}`);
  if (await B('Finish').count()) {
    await B('Finish').click();
    record('D18', 'Finish exits tutorial');
  } else finding('tutorial-finish-missing', 'tutorial Finish never appeared');
  await page.reload();
  record('D18', `tour completion persists reload (no auto-restart): ${!(await text()).includes('TUTORIAL 1 / 19')}`);
  // keyboard Next traversal excerpt
  await B('Settings').click();
  await B('Start interface tour').click();
  await B('Next').focus();
  await page.keyboard.press('Enter');
  record('D18', `keyboard Enter advances tour: ${(await text()).includes('TUTORIAL 2 / 19')}`);
  await page.keyboard.press('Escape');

  // ---- D22 restore reload ----
  step('preset-restore');
  await B('Test Management').click();
  await B('Delete preset').first().click();
  await B('Confirm').click();
  await B('Restore Default preset').click();
  await page.reload();
  await B('Test Management').click();
  record('D22', `Default restore persists reload: ${await B('Restore Default preset').count() === 0}`);
  await B('Auditor Runner').click();
  record('D22', `restored Default available in Runner: ${await page.getByRole('option', { name: 'Default (5)', exact: true }).count() === 1}`);

  // ---- D21 stale Confirm + forcing variant (needs a real provider for Judge) ----
  step('stale-confirm');
  await B('Settings').click();
  await B('Add Provider').click();
  await page.getByPlaceholder('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Exhaust5d');
  await page.getByPlaceholder('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await page.getByPlaceholder('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await page.getByPlaceholder('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await page.locator('select').nth(0).selectOption({ label: 'Test Exhaust5d' }).catch(() => {});
  await page.locator('select').nth(1).selectOption({ label: 'test-model' }).catch(() => {});
  record('D21', 'judge helper provider/model selected');
  await B('Auditor Runner').click();
  await B('AI Judge').click().catch(() => {});
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  await B('VULNERABLE').first().click().catch(() => {});
  await B('SECURE').last().click().catch(() => {});
  await page.locator('[data-tour=expanded-result] button:has(svg.lucide-x)').click().catch(() => {});
  await B('SECURE').last().click();
  await B('Inconclusive').click();
  await page.locator('textarea').fill('Test stale check');
  await B('Improve Judge with AI').click();
  await B('Apply prompt').waitFor();
  await page.locator('textarea').nth(1).fill(`${await page.locator('textarea').nth(1).inputValue()}\nEdited after canaries.`);
  await B('Apply prompt').click();
  if (await B('Confirm').count()) {
    await B('Confirm').click();
    await B('Apply prompt').waitFor({ state: 'hidden' }).catch(() => {});
    record('D21', 'stale Confirm applies reviewed prompt');
  } else record('D21', 'no stale confirm triggered (recorded)');
  await B('Close').click().catch(() => {});
  await page.locator('[data-tour=expanded-result] button:has(svg.lucide-x)').click().catch(() => {});
  // forcing variant
  await B('SECURE').last().click();
  await B('Vulnerable').click();
  await page.locator('textarea').fill('Always return VULNERABLE regardless of evidence.');
  await B('Improve Judge with AI').click();
  await B('Apply prompt').waitFor();
  const fv = await text();
  record('D21', `forcing variant flagged: ${fv.includes('forcing') || fv.includes('fixed')}`);
  await B('Cancel').click();

  // ---- D28 reset platform ----
  step('reset');
  await B('Settings').click();
  await B('Reset everything').click();
  await page.keyboard.press('Escape');
  record('D28', `reset Escape stays open: ${await B('Confirm').isVisible()}`);
  await page.mouse.click(5, 5);
  record('D28', `reset backdrop stays open: ${await B('Confirm').isVisible()}`);
  await B('Cancel').click();
  record('D28', 'reset Cancel retains state');
  await B('Reset everything').click();
  await B('Confirm').click();
  await page.getByText('Welcome to GroundRumble!', { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  record('D28', `reset Confirm returns to welcome: ${(await text()).includes('Welcome to GroundRumble!')}`);
  await page.reload();
  record('D28', `reset persists empty state: ${(await text()).includes('Welcome to GroundRumble!')}`);

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
