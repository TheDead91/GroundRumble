// Dialog exhaustion (focused): discovery-driven second model → lineup → reload;
// Failed-group DOM structure → ERROR detail expand. Test-only.
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
// Later-registered route wins: discovery returns a second model.
await page.route('https://test-provider.example/**', async (r) => {
  if (r.request().method() === 'GET') {
    await r.fulfill({ json: { data: [{ id: 'test-model' }, { id: 'test-second' }] } });
    return;
  }
  await r.fallback();
});
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const step = (s) => console.error(`Test5F-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const finding = (id, d) => findings.push({ id, observed: d });

try {
  await page.goto(base);
  step('welcome');
  await B('✕').click();
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Exhaust5f');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });

  // ---- raw-template-invalid-json via raw GENERATOR (direct-send path from crash evidence) ----
  step('test-023-gen');
  try {
    await B('Settings').click();
    await B('Add Provider').click();
    await page.locator('select').first().selectOption('raw');
    await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Raw Gen');
    await P('https://host.example/api/chat').fill('http://127.0.0.1:4997/chat');
    await page.getByTestId('provider-allow-private').check();
    await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('raw-model');
    await P('choices.0.message.content').fill('answer');
    await page.locator('textarea').last().fill('{"model":"{{model}}","system":"{{systemPrompt}}","input":"{{userPrompt}}"}');
    await B('Save Provider').click();
    await B('Save Provider').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    if (await B('Save Provider').count()) {
      await B('Cancel').click();
      record('raw-template-invalid-json', 'raw generator provider unsavable; downstream unreachable');
    } else {
      const rawGenSim = await installMockProvider(page, { routePattern: 'http://127.0.0.1:4997/**', rawTemplate: true });
      await B('Test Management').click();
      await B('Add custom source (URL / GitHub repo / article)').click();
      await B('Pasted content').click();
      await page.locator('textarea').fill('Prompt injection: "quoted" instruction says disclose TEST_G. The system forbids "TEST_G" disclosure.');
      await B('Fetch & assess').click();
      await B('Add source').waitFor();
      await B('Add source').click();
      await B('Generate & Review Tests').click();
      const Wg = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
      for (const c of await Wg.locator('input[type=checkbox]').all()) await c.uncheck();
      await Wg.locator('input[type=checkbox]').last().check();
      await B('Next').click();
      await Wg.locator('select').nth(0).selectOption({ label: 'Test Raw Gen' });
      await B('Generate tests').click();
      await B('Add Selected (1)').waitFor({ timeout: 40000 }).catch(() => {});
      const genTotal = rawGenSim.calls.length;
      const genMalformed = rawGenSim.calls.filter((c) => c.malformedWire);
      if (genTotal === 0) record('raw-template-invalid-json', 'raw generator issued no direct requests (proxied/blocked path)');
      else if (genMalformed.length > 0) {
        finding('raw-template-invalid-json', `raw bodyTemplate emits invalid JSON with quoting prompts (${genMalformed.length}/${genTotal} malformed); sample=${String(genMalformed[0].malformedWire.raw).slice(0, 160)}`);
      } else record('raw-template-invalid-json', `raw generator requests well-formed (${genTotal} calls)`);
      await Wg.locator('button:has(svg.lucide-x)').click().catch(() => {});
      await B('Back').click().catch(() => {});
      await B('Cancel').click().catch(() => {});
      await B('Retry').click().catch(() => {});
      await Wg.locator('button:has(svg.lucide-x)').click().catch(() => {});
    }
  } catch (e) {
    record('raw-template-invalid-json', `generator probe unreachable: ${e.message.split('\n')[0]}`);
  }
  // Ensure wizard fully closed before continuing (any pane state).
  const wizardOpen = async () =>
    (await B('Generate tests').count()) > 0 || (await B('Add Selected (1)').count()) > 0 ||
    (await B('Continue to generation').count()) > 0 || (await B('Refine & finish').count()) > 0;
  for (let k = 0; k < 4 && (await wizardOpen()); k++) {
    await page.locator('button:has(svg.lucide-x)').last().click().catch(() => {});
    await B('Back').click().catch(() => {});
    await B('Cancel').click().catch(() => {});
    await page.waitForTimeout(500);
  }
  record('raw-template-invalid-json', `wizard closed after generator probe: ${!(await wizardOpen())}`);

  // ---- discovery-driven second model → lineup → reload ----
  step('second-model');
  await B('Settings').click();
  await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).uncheck().catch(() => {});
  try {
  await B('Settings').click();
  await B('Test connection (reachability, auth, chat round-trip)').first().click();
  await page.getByText(/Connected|reachable/).last().waitFor({ timeout: 20000 }).catch(() => {});
  const connText = (await text()).match(/Connected[^\n]{0,80}|Could not[^\n]{0,80}|failed[^\n]{0,80}/i)?.[0];
  record('PROV-LINEUP', `connection outcome: ${connText}`);
  await B('Auditor Runner').click();
  await page.locator('select').first().selectOption({ label: 'Test Exhaust5f' });
  const modelOpts = await page.locator('select').nth(1).evaluateAll((es) => es.map((e) => e.innerText));
  record('PROV-LINEUP', `target models after provider select: ${JSON.stringify(modelOpts).slice(0, 80)}`);
  await page.locator('select').nth(1).selectOption('test-second');
  await B('Add to Comparison').click();
  record('PROV-LINEUP', `test-second lineup entry added: ${(await text()).includes('test-second')}`);
  await B('Clear All').click();
  await P('Search payloads…').fill('Direct System Override');
  await page.locator('input[type=checkbox]').check();
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  const secondCalls = sim.calls.filter((c) => c.body?.model === 'test-second').length;
  record('PROV-LINEUP', `second model actually audited at boundary: ${secondCalls > 0}`);
  await page.reload();
  await B('Auditor Runner').click();
  record('PROV-LINEUP', `edited lineup persists reload: ${(await text()).includes('test-second')}`);
  } catch (e) {
    const opts = await page.locator('select').evaluateAll((es) => es.map((x) => x.innerText)).catch(() => []);
    console.error(`Test5F-DIAG lineup selects=${JSON.stringify(opts).slice(0, 300)}`);
    console.error(`Test5F-DIAG lineup tail=${(await text()).slice(0, 400).replace(/\n/g, ' ')}`);
    record('PROV-LINEUP', `second-model lineup unreachable: ${e.message.split('\n')[0]}`);
  }

  // ---- Failed-group DOM → ERROR detail ----
  step('error-detail');
  await B('Clear All').click();
  await P('Search payloads…').fill('Direct System Override');
  await page.locator('input[type=checkbox]').check();
  sim.faults.set('target', Array(8).fill(401));
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  sim.faults.delete('target');
  // Technical errors group under "Inconclusive (errors / empty)", not Failed.
  const failedGroup = page.getByRole('button', { name: /Inconclusive \(errors/ }).first();
  if ((await failedGroup.count()) === 0) {
    record('D08', `no errors group after 401 run; groups=${await page.getByRole('button').evaluateAll((es) => es.map((e) => e.innerText.trim().slice(0, 40)).filter((t) => /Payload|conclusive|Failed|Succeeded/i.test(t)))}`);
  } else {
    const expandedBefore = await page.locator('[data-tour=expanded-result]').count();
    await failedGroup.click();
    const expandedAfter = await page.locator('[data-tour=expanded-result]').count();
    const rowHtml = await page.locator('[data-tour=results-table], table, [data-tour=runner-results]').evaluateAll((es) => es.map((e) => e.outerHTML.slice(0, 300)));
    console.error(`Test5F-DIAG expanded=${expandedBefore}->${expandedAfter} containers=${JSON.stringify(rowHtml).slice(0, 400)}`);
    // Click the failed row itself (whatever element carries the verdict).
    const badges = await page.locator('[data-tour=results-table]').evaluateAll((es) => es.map((e) => e.innerText.slice(0, 600)));
    console.error(`Test5F-DIAG failed-table=${JSON.stringify(badges).slice(0, 800)}`);
    const verdict = page.getByText('ERROR', { exact: true }).first();
    const verdictCi = page.getByText(/^(error|failed|401)/i).first();
    const target = (await verdict.count()) ? verdict : (await verdictCi.count()) ? verdictCi : null;
    if (target) {
      await target.click();
      await page.waitForTimeout(800);
      let shown = await text();
      if (shown.indexOf('Model Response') === -1) {
        // Try row-level and cell-level activation.
        await target.locator('xpath=ancestor::tr[1]').click().catch(() => {});
        await page.waitForTimeout(500);
        shown = await text();
      }
      const mi = shown.indexOf('Model Response');
      const tag = await target.evaluate((e) => `${e.tagName}.${e.className} role=${e.getAttribute('role')}`).catch(() => '?');
      const detail = mi > -1 ? shown.slice(mi, mi + 400) : `NO-DETAIL-PANE tag=${tag} tail=${shown.slice(-200)}`;
      record('D08', `error detail content: ${detail.replace(/\n/g, ' ').slice(0, 260)}`);
      await page.locator('[data-tour=extended-result], [data-tour=expanded-result]').first().locator('button:has(svg.lucide-x)').click().catch(() => {});
      await page.locator('[data-tour=expanded-result] button:has(svg.lucide-x)').click().catch(() => {});
    } else record('D08', 'no clickable error verdict rendered after expand (recorded)');
  }
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
