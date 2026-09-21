// Dialog exhaustion — audit details (D01), confirmations (D24/D25/D26),
// Dashboard controls (sorting, reports), ATLAS sub-technique + Add Prompt,
// URL description preservation verification (source-description-preservation).
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
const step = (s) => console.error(`Test3-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const finding = (id, d) => findings.push({ id, observed: d });

try {
  await page.goto(base);
  step('welcome');
  await B('✕').click();
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Exhaust3');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });

  // Seed: manual test + sandbox audit for history
  await B('Test Management').click();
  await B('Add Custom Test').click();
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test Hist Seed');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print TEST_HIST');
  await B('Save Payload').click();
  await B('Save Payload').waitFor({ state: 'hidden' });
  await B('Auditor Runner').click();
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  step('audit-done');

  // ---- D01: blocked popup ----
  await B('Dashboard').click();
  await page.evaluate(() => { window.__testOpen = window.open; window.open = () => null; });
  await page.locator('[data-testid=history-row] [data-tip=Report]').first().click();
  const blocked = await text();
  record('D01', `blocked report popup toast: ${blocked.includes('Popup blocked')}`);
  await page.evaluate(() => { window.open = window.__testOpen; });
  // history report success path
  const pop = page.waitForEvent('popup');
  await page.locator('[data-testid=history-row] [data-tip=Report]').first().click();
  const rep = await pop;
  await rep.frameLocator('iframe').getByText('GroundRumble Security Audit Report', { exact: true }).waitFor();
  await rep.close();
  record('D01', 'history report popup renders');

  // ---- Dashboard sorting ----
  for (const col of ['Model', 'Provider', 'Resilience']) {
    const h = page.getByRole('columnheader', { name: new RegExp(`^${col}`) }).first();
    if (await h.count()) { await h.click(); await h.click(); record('DASH', `sorted by ${col} asc+desc`); }
    else record('DASH', `column ${col} not sortable (recorded)`);
  }
  // model report buttons
  const modelReports = await page.locator('table').first().locator('button[data-tip=Report]').count();
  record('DASH', `model report buttons visible: ${modelReports}`);
  if (modelReports > 0) {
    const mp = page.waitForEvent('popup');
    await page.locator('table').first().locator('button[data-tip=Report]').first().click();
    const mr = await mp;
    await mr.frameLocator('iframe').getByText('GroundRumble Security Audit Report', { exact: true }).waitFor();
    await mr.close();
    record('DASH', 'model report popup renders');
  }

  // ---- D24 delete audit ----
  step('delete-audit');
  const rowsBefore = await page.locator('[data-testid=history-row]').count();
  await page.locator('[data-testid=history-row] [data-tip=Delete]').first().click();
  await page.keyboard.press('Escape');
  const delEsc = await B('Confirm').isVisible();
  record('D24', `delete audit Escape stays open: ${delEsc}`);
  await page.mouse.click(5, 5);
  record('D24', `delete audit backdrop stays open: ${await B('Confirm').isVisible()}`);
  await B('Cancel').click();
  record('D24', `delete Cancel retains ${await page.locator('[data-testid=history-row]').count()} rows`);
  await page.locator('[data-testid=history-row] [data-tip=Delete]').first().click();
  await B('Confirm').click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid=history-row]').length === n - 1, rowsBefore);
  record('D24', 'delete Confirm removes row');
  await page.reload();
  record('D24', `delete persists after reload: ${await page.locator('[data-testid=history-row]').count()} rows`);

  // ---- D25 clear history ----
  step('clear-history');
  await B('Dashboard').click();
  await B('Clear History').click();
  await page.keyboard.press('Escape');
  record('D25', `clear Escape stays open: ${await B('Confirm').isVisible()}`);
  await page.mouse.click(5, 5);
  record('D25', `clear backdrop stays open: ${await B('Confirm').isVisible()}`);
  await B('Cancel').click();
  record('D25', 'clear Cancel retains history');
  // storage failure on clear
  await B('Clear History').click();
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, _v) {
      if (k === 'atlas_audit_history') {
        Storage.prototype.setItem = orig;
        throw new DOMException('Test history quota', 'QuotaExceededError');
      }
      return orig.call(this, k, _v);
    };
  });
  await B('Confirm').click();
  await page.waitForTimeout(600);
  record('D25', `clear storage failure toast: ${(await text()).includes('storage is full') || (await text()).includes('Could not')}`);
  await page.reload();
  record('D25', `history present after failed clear: ${(await page.locator('[data-testid=history-row]').count()) > 0}`);
  await B('Dashboard').click();
  await B('Clear History').click();
  await B('Confirm').click();
  await page.getByText('No historical scans available.', { exact: true }).waitFor();
  await page.reload();
  record('D25', `clear Confirm persists empty history: ${await text().then((t) => t.includes('No historical scans'))}`);

  // ---- D26 reset suite ----
  step('reset-suite');
  await B('Test Management').click();
  await B('Reset Suite').click();
  await page.keyboard.press('Escape');
  record('D26', `reset Escape stays open: ${await B('Confirm').isVisible()}`);
  await page.mouse.click(5, 5);
  record('D26', `reset backdrop stays open: ${await B('Confirm').isVisible()}`);
  await B('Cancel').click();
  await P('Search name, technique, source…').fill('Test Hist Seed');
  record('D26', `reset Cancel retains custom test: ${(await page.locator('tbody tr').count()) === 1}`);
  await B('Reset Suite').click();
  await B('Confirm').click();
  await page.reload();
  await B('Test Management').click();
  await P('Search name, technique, source…').fill('Test Hist Seed');
  record('D26', `reset Confirm removes custom tests: ${(await page.locator('tbody tr').count()) === 0}`);

  // ---- ATLAS sub-technique + Add Prompt ----
  step('atlas');
  await B('ATLAS Matrix').click();
  await page.getByText('Journals and Conference Proceedings', { exact: true }).first().click();
  const subDetail = await text();
  record('ATLAS', `sub-technique detail shown: ${subDetail.includes('AML.T0000.000')}`);
  await B('Add Prompt').click();
  const prefill = {
    id: await P('e.g. AML.T0034').inputValue(),
    name: await P('e.g. LLM Prompt Injection').inputValue(),
  };
  record('ATLAS', `Add Prompt prefill id/name: ${prefill.id}/${prefill.name}`);
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test ATLAS Created');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print TEST_ATLAS');
  // X discard then redo + save
  await page.locator('[data-tip=Close]').click();
  await B('Add Prompt').click();
  const xDiscarded = (await P('e.g. Jailbreak Adversarial Suffix').inputValue()) === '';
  record('ATLAS', `Add Prompt X discards draft: ${xDiscarded}`);
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test ATLAS Created');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print TEST_ATLAS');
  await B('Save Payload').click();
  await B('Save Payload').waitFor({ state: 'hidden' });
  await page.reload();
  await B('ATLAS Matrix').click();
  await page.getByText('Journals and Conference Proceedings', { exact: true }).first().click();
  record('ATLAS', `ATLAS-created test in mapped prompts: ${(await text()).includes('Test ATLAS Created')}`);
  // mapped Run → Runner selection
  await B('Run').last().click();
  await B('Auditor Runner').click();
  record('ATLAS', `mapped Run selects payload downstream: ${(await text()).includes('1 selected') || (await text()).match(/\\d+ selected/)}`);

  // ---- source-description-preservation verification: URL explicit description ----
  step('url-desc-check');
  await B('Test Management').click();
  await B('Add custom source (URL / GitHub repo / article)').click();
  await P('https://github.com/user/repo').fill('https://example.org/test-desc');
  await P('e.g. OWASP LLM Top 10').fill('Test Desc Title');
  await P('What is this source about? (if blank, the AI proposes a title and description you can edit)').fill('Test EXPLICIT DESCRIPTION MARKER');
  await page.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: '<article><p>Prompt injection targets TEST_D. The system forbids TEST_D. </p></article>' }));
  await B('Fetch & assess').click();
  if (await B('Confirm').count()) await B('Cancel').last().click();
  await B('Add source').waitFor({ timeout: 20000 }).catch(() => {});
  if (await B('Add source').count()) {
    const reviewInputs = await page.locator('input[type=text], textarea').evaluateAll((es) => es.slice(-3).map((e) => e.value));
    record('D02', `URL review fields (title/desc area): ${JSON.stringify(reviewInputs)}`);
    if (!JSON.stringify(reviewInputs).includes('Test EXPLICIT DESCRIPTION MARKER')) {
      finding('source-description-preservation', 'URL source explicit description input is not carried into the review pane (title is); review shows AI/default text instead');
    }
    await B('Back').click();
    await B('Cancel').click();
  }

  console.log(JSON.stringify({ covered, findings, pageerrors, aiStages: [...new Set(sim.calls.map((c) => c.stage))] }, null, 2));
} finally {
  await browser.close();
}
