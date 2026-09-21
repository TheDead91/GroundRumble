// Convergence sweep — remaining dialog cases (D02 replacement, D03 mode note,
// D10 rewrite-hold, D18 keyboard Finish). Test-only.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const B = (name) => page.getByRole('button', { name, exact: true });
const P = (name) => page.getByPlaceholder(name, { exact: true });
const text = () => page.locator('body').innerText();
const sim = await installMockProvider(page);
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const record = (id, d) => covered.push(`${id}: ${d}`);
const probe = async (id, desc, fn) => {
  try {
    await fn();
    record(id, `${desc}: OK`);
  } catch (e) {
    record(id, `${desc}: FAILED-HARNESS ${e.message.split('\n')[0].slice(0, 150)}`);
  }
};

try {
  await page.goto(base);
  await B('✕').click();
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Conv1e');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('k');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await B('Test Management').click();

  // D02: remove source + add replacement with same title, new content → generate
  await probe('D02', 'source replacement flows into generation analysis', async () => {
    await B('Add custom source (URL / GitHub repo / article)').click();
    await B('Pasted content').click();
    await P('e.g. the article or repo name').fill('Test Replace Me');
    await page.locator('textarea').fill('Original content about TEST_ORIG_SECRET which the system forbids.');
    await B('Fetch & assess').click();
    await B('Add source').waitFor();
    await B('Add source').click();
    await page.getByText('Test Replace Me', { exact: true }).locator('../../..').getByRole('button', { name: 'Remove source', exact: true }).click();
    await B('Add custom source (URL / GitHub repo / article)').click();
    await B('Pasted content').click();
    await P('e.g. the article or repo name').fill('Test Replace Me');
    await page.locator('textarea').fill('TEST_REPLACED_MARKER: replacement content about TEST_NEW_SECRET which the system forbids.');
    await B('Fetch & assess').click();
    await B('Add source').waitFor();
    await B('Add source').click();
    await B('Generate & Review Tests').click();
    const W = page.getByText('AI Test Generator', { exact: true }).first().locator('../../..');
    for (const c of await W.locator('input[type=checkbox]').all()) await c.uncheck();
    await W.locator('input[type=checkbox]').last().check();
    await B('Next').click();
    const before = sim.calls.length;
    await B('Generate tests').click();
    await page.getByRole('button', { name: /^Add Selected \(\d+\)/ }).waitFor({ timeout: 40000 });
    const analysis = sim.calls.slice(before).filter((c) => c.stage === 'analysis');
    if (!analysis.some((c) => JSON.stringify(c.body).includes('TEST_REPLACED_MARKER'))) {
      throw new Error('replacement content not found in analysis requests');
    }
    await B('Cancel').click();
  });

  // D18: keyboard Finish
  await probe('D18', 'keyboard Tab+Enter activates Finish', async () => {
    await B('Settings').click();
    await B('Start interface tour').click();
    const tourNext = async () => {
      for (let k = 0; k < 20; k++) {
        if (await B('Next').isEnabled().catch(() => false)) { await B('Next').click(); return; }
        if (await B('Finish').count()) return;
        await page.waitForTimeout(500);
      }
      await B('Skip this step').click().catch(() => {});
    };
    for (let i = 0; i < 19 && !(await B('Finish').count()); i++) {
      const t = await text();
      if (/Explore a technique|technique card/.test(t)) {
        await page.getByText('LLM Prompt Injection', { exact: true }).first().click().catch(() => {});
        await tourNext();
      } else if (/Load preset|Attack Payloads Selection/.test(t)) {
        await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Default (5)', exact: true }) }).selectOption({ label: 'Default (5)' }).catch(() => {});
        await tourNext();
      } else if (/Run Comparison Audit/.test(t) && /Click/.test(t)) {
        await B('Run Comparison Audit').click();
        await B('Run Comparison Audit').waitFor({ timeout: 60000 });
      } else if (/Show Console/.test(t)) {
        await B('Show Console').click();
        await tourNext();
      } else if (/VULNERABLE cell|Comparison Results/.test(t)) {
        await B('VULNERABLE').first().click().catch(() => {});
        await tourNext();
      } else {
        await tourNext();
      }
    }
    if (!(await B('Finish').count())) throw new Error('never reached Finish');
    await B('Finish').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    if (await B('Finish').count()) throw new Error('Finish still present after Enter');
  });

  // D10: rewrite-phase hold attempt (honest N/A if unholdable)
  await probe('D10', 'rewrite-phase hold classification', async () => {
    await B('AI Prompts').click();
    const dis = await B('Update with AI').first().isDisabled();
    if (dis) throw new Error('Update disabled (no judge helper); N/A needs judge context');
    await B('Update with AI').first().click();
    await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').fill('Keep contract.');
    let arrived = false;
    sim.faults.set('rewrite', [{ wait: new Promise(() => {}), arrived: () => { arrived = true; } }]);
    await B('Update with AI').last().click();
    await page.waitForTimeout(2500);
    const cancelVisible = await B('Cancel').count() > 0;
    sim.faults.delete('rewrite');
    await page.reload();
    if (!arrived) throw new Error('rewrite request never issued while held (race lost)');
    record('D10', `rewrite hold observed=${arrived} cancelVisible=${cancelVisible} (late response discarded via reload)`);
  });

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
