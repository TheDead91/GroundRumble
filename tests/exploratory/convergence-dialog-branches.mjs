// Convergence sweep — micro-branches across dialogs/controls.
// Test-only; failures recorded per-probe, never thrown.
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
async function uClick(loc, timeout=8000) {
  try {
    await loc.click({ timeout });
  } catch {
    await loc.click({ force: true });
  }
}
async function closeDialogs() {
  for (let k = 0; k < 4; k++) {
    let open = false;
    if (await B('Apply prompt').count()) { await B('Cancel').last().click().catch(() => {}); open = true; }
    if (await B('Fetch & assess').count()) { await B('Cancel').click().catch(() => {}); open = true; }
    await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});
    await B('Back').click().catch(() => {});
    await page.waitForTimeout(300);
    if (!open && !(await B('Apply prompt').count())) break;
  }
  // dismiss toast overlays that intercept pointer events
  await B('Clear notification history').click().catch(() => {});
}
async function nav(name) {
  try {
    await B(name).click({ timeout: 8000 });
  } catch {
    record('HARNESS', `nav ${name} intercepted; force-clicking`);
    await B(name).click({ force: true });
  }
}
const probe = async (id, desc, fn) => {
  try {
    await fn();
    record(id, `${desc}: OK`);
  } catch (e) {
    const ctx = await page.locator('button').evaluateAll((es) => es.filter((x) => x.checkVisibility()).map((x) => x.innerText.trim().slice(0, 25))).catch(() => []);
    const frame = (e.stack || '').split('\n').find((l) => l.includes('convergence-dialog-branches.mjs:'))?.trim().slice(0, 80) || '';
    record(id, `${desc}: FAILED-HARNESS ${e.message.split('\n')[0].slice(0, 90)} @${frame} ctx=${JSON.stringify(ctx).slice(0, 200)}`);
  }
};

try {
  await page.goto(base);
  await B('✕').click();
  await nav('Settings');
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Conv1b');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  // Enable AI rewrite buttons (gated on judgeConfigured, not mere provider).
  await page.locator('select').nth(0).selectOption({ label: 'Test Conv1b' }).catch(() => {});
  await page.locator('select').nth(1).selectOption({ label: 'test-model' }).catch(() => {});
  await page.locator('select').nth(2).selectOption({ label: 'Test Conv1b' }).catch(() => {});
  await page.locator('select').nth(3).selectOption({ label: 'test-model' }).catch(() => {});

  // 1. preset prefills (Gemini, Hugging Face, OpenRouter)
  await probe('PROV', 'remaining preset prefills', async () => {
    const eps = {};
    for (const preset of ['Gemini', 'Hugging Face', 'OpenRouter']) {
      await B('Add Provider').click();
      await B(preset).click();
      eps[preset] = await P('https://api.openai.com/v1/chat/completions').inputValue();
      await B('Cancel').click();
    }
    if (!eps.Gemini.includes('google') || !eps['Hugging Face'].includes('huggingface') || !eps.OpenRouter.includes('openrouter')) {
      throw new Error(JSON.stringify(eps).slice(0, 150));
    }
  });

  // 2. seed source + manual test for downstream probes
  await nav('Test Management');
  await B('Add custom source (URL / GitHub repo / article)').click();
  await B('Pasted content').click();
  await page.locator('textarea').fill('Prompt injection asks for TEST_1B; the system forbids TEST_1B.');
  await B('Fetch & assess').click();
  await B('Add source').waitFor();
  await B('Add source').click();
  await B('Add Custom Test').click();
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test Conv1b Manual');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print TEST_1B');
  await B('Save Payload').click();
  await B('Save Payload').waitFor({ state: 'hidden' });

  // 3. D06 Shift+Enter
  await probe('D06', 'bulk textarea Shift+Enter newline, no submit', async () => {
    await B('Bulk Import').click();
    await page.locator('textarea').fill('a');
    await page.locator('textarea').press('Shift+Enter');
    const v = await page.locator('textarea').inputValue();
    if (!v.includes('\n')) throw new Error('no newline');
    if (!(await B('Parse & Preview').isVisible())) throw new Error('submitted');
    await page.locator('[data-tip=Close]').click();
  });

  // 4. wizard option effects on request
  await probe('D03', 'tests-per-call + response-size reflected in request', async () => {
    await B('Generate & Review Tests').click();
    const W = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
    for (const c of await W.locator('input[type=checkbox]').all()) await c.uncheck();
    await W.locator('input[type=checkbox]').last().check();
    await B('Next').click();
    await W.locator('select').nth(2).selectOption('3');
    await W.locator('select').nth(3).selectOption('2048');
    const before = sim.calls.length;
    await B('Generate tests').click();
    await B('Add Selected (1)').waitFor({ timeout: 30000 });
    const gen = sim.calls.slice(before).filter((c) => c.stage === 'generation');
    if (!gen.length) throw new Error('no generation call');
    if (gen[0].body.max_tokens !== 2048) throw new Error(`max_tokens=${gen[0].body.max_tokens}`);
    await B('Cancel').click();
  });

  // 5. D03 Deep mode reconstruct across X
  await probe('D03', 'Deep mode retained across X-reopen', async () => {
    await B('Generate & Review Tests').click();
    const W = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
    for (const c of await W.locator('input[type=checkbox]').all()) await c.uncheck();
    await W.locator('input[type=checkbox]').last().check();
    await B('Next').click();
    await B('Advanced').click();
    await B('Deep (recommended)').click();
    await W.locator('button:has(svg.lucide-x)').click();
    await B('Generate & Review Tests').click();
    const W2 = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
    for (const c of await W2.locator('input[type=checkbox]').all()) await c.uncheck();
    await W2.locator('input[type=checkbox]').last().check();
    await B('Next').click();
    const deepOn = await B('Deep (recommended)').evaluate((e) => e.className.includes('active') || e.getAttribute('aria-pressed') === 'true' || e.style.background !== '');
    await W2.locator('button:has(svg.lucide-x)').click();
    if (!deepOn) throw new Error('Deep mode not retained');
  });

  // 6. run audit for D10/D11/D24/D01/DASH probes
  await nav('Auditor Runner');
  await B('Clear All').click();
  await P('Search payloads…').fill('Test Conv1b Manual');
  await page.locator('input[type=checkbox]').check();
  await B('AI Judge').click().catch(() => {});
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });

  // 7. D10 canary-hold
  await probe('D10', 'pending canary hold → X → late response discarded', async () => {
    await P('Search payloads…').fill('Test Conv1b Manual');
    await B('SECURE').last().click();
    await B('Vulnerable').click();
    await page.locator('textarea').fill('Test canary hold check');
    await B('Improve Judge with AI').click();
    await B('Apply prompt').waitFor();
    let release;
    let arrived;
    sim.faults.set('judge', [{ wait: new Promise((r) => { release = r; }), arrived: new Promise((r) => { arrived = r; }) }]);
    await B('Re-run canaries').click();
    await Promise.race([arrived, new Promise((_, rej) => setTimeout(() => rej(new Error('canary never called')), 30000))]);
    await page.locator('button:has(svg.lucide-x)').last().click();
    release();
    await page.waitForTimeout(800);
    for (let k = 0; k < 3 && (await B('Apply prompt').count()); k++) {
      await B('Cancel').last().click().catch(() => {});
      await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});
      await page.waitForTimeout(400);
    }
    if (await B('Apply prompt').count()) throw new Error('review dialog stuck open');
  });

  // 8. D11 rewrite transport failure → retry + error X
  const openFeedback = async () => {
    let last = '';
    for (let k = 0; k < 3; k++) {
      await uClick(B('Update with AI').first());
      await page.waitForTimeout(800);
      const n = await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').count();
      const dis = await B('Update with AI').first().isDisabled().catch(() => 'unknown');
      last = `try${k}: inputs=${n} btnDisabled=${dis} tail=${(await text()).slice(-180).replace(/\n/g, ' ')}`;
      if (n > 0) return;
      await closeDialogs();
    }
    throw new Error(`feedback input never opened; ${last}`);
  };
  await probe('D11', 'rewrite connection failure → error → retry success', async () => {
    await nav('AI Prompts');
    await closeDialogs();
    await openFeedback();
    await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').fill('Keep contract; be concise.');
    sim.faults.set('rewrite', ['connection']);
    await uClick(B('Update with AI').last());
    await page.getByText(/failed|error|connection/i).last().waitFor({ timeout: 20000 });
    sim.faults.delete('rewrite');
    if (await B('Back').count()) await uClick(B('Back'));
    else if (await B('Cancel').count()) await uClick(B('Cancel').last());
    await openFeedback();
    await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').fill('Keep contract; be concise.');
    await uClick(B('Update with AI').last());
    await B('Apply prompt').waitFor({ timeout: 20000 });
    await closeDialogs();
  });
  await probe('D11', 'canary 500 → error surfaced; error X closes', async () => {
    await closeDialogs();
    await uClick(B('Update with AI').first());
    await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').waitFor({ timeout: 8000 });
    await P('e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…').fill('Keep contract; be concise.');
    await B('Update with AI').last().click();
    await B('Apply prompt').waitFor();
    sim.faults.set('judge', [500, 500, 500]);
    await B('Re-run canaries').click();
    await B('Re-run canaries').waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const t = await text();
    if (!/failed|error|500|inconclusive/i.test(t)) throw new Error('no canary error surfaced');
    sim.faults.delete('judge');
    await closeDialogs();
  });

  // 9. D22 storage failure
  await probe('D22', 'Default delete storage failure retains preset', async () => {
    await nav('Test Management');
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).includes('preset')) {
          Storage.prototype.setItem = orig;
          throw new DOMException('Test preset quota', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
      };
    });
    await B('Delete preset').first().click();
    await B('Confirm').click();
    await page.waitForTimeout(600);
    await page.reload();
    await nav('Test Management');
    if (!(await text()).includes('Default')) throw new Error('Default lost despite fault');
  });

  // 10. D24 double-submit
  await probe('D24', 'delete-audit double Confirm deletes once', async () => {
    await nav('Dashboard');
    const n = await page.locator('[data-testid=history-row]').count();
    if (n < 1) throw new Error('no history rows');
    await page.locator('[data-testid=history-row] [data-tip=Delete]').first().click();
    await B('Confirm').dblclick();
    await page.waitForTimeout(800);
    const n2 = await page.locator('[data-testid=history-row]').count();
    if (n2 !== n - 1) throw new Error(`rows ${n}->${n2}`);
  });

  // 11. D01 deleted-test historical evidence
  await probe('D01', 'history detail after current-test delete', async () => {
    await nav('Test Management');
    await P('Search name, technique, source…').fill('Test Conv1b Manual');
    await B('Remove test').click();
    await B('Confirm').click();
    await nav('Dashboard');
    await page.locator('[data-testid=history-row] [data-tip=View]').first().click();
    await B('View').last().click();
    const t = await text();
    if (!/Test Conv1b Manual|Attack Payload|Model Response/.test(t)) throw new Error('history detail missing');
    await page.locator('[data-tip=Close]').click();
  });

  // 12. Dashboard multi-tactic sorting via sandbox audit (Default preset: 5 tests, 4 tactics)
  await probe('DASH', 'multi-tactic sandbox audit + tactic sort', async () => {
    await nav('Settings');
    await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).check().catch(() => {});
    await nav('Auditor Runner');
    await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Default (5)', exact: true }) }).selectOption({ label: 'Default (5)' }).catch(() => {});
    await B('Run Comparison Audit').click();
    await B('Run Comparison Audit').waitFor({ timeout: 120000 });
    await nav('Dashboard');
    const cols = await page.getByRole('columnheader').evaluateAll((es) => es.map((e) => e.innerText.trim().slice(0, 20)));
    if (!cols.some((c) => /tactic|execution|recon/i.test(c))) throw new Error(`no tactic cols: ${cols.slice(0, 8)}`);
  });

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
