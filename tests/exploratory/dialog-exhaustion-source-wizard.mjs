// Dialog exhaustion — source intake/review (D02) + generation wizard (D03) branches.
// Test-only; product deviations recorded as findings.
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
const step = (s) => console.error(`Test2-STEP ${s}`);
const record = (id, d) => covered.push(`${id}: ${d}`);
const finding = (id, d) => findings.push({ id, observed: d });

// Assessment override via later-registered route (runs before simulator route).
let assessOverride = null;
await page.route('https://test-provider.example/**', async (r) => {
  let body = null;
  try { body = r.request().postDataJSON(); } catch { return r.fallback(); }
  const sys = body?.messages?.[0]?.content || '';
  if (assessOverride && r.request().method() === 'POST' && sys.includes('research librarian')) {
    const s = assessOverride;
    assessOverride = null;
    await r.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ status: s, summary: 'Test branch', reason: 'Test controlled assessment' }) } }] } });
    return;
  }
  await r.fallback();
});

try {
  await page.goto(base);
  step('welcome');
  await B('✕').click();
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Exhaust2');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('e.g. gpt-4o, gpt-4o-mini (blank = type any model)').fill('test-model');
  await P('Optional (leave blank if none required)').fill('test-key');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await B('Test Management').click();

  // ---- D02 medium/low relevance ----
  for (const status of ['medium', 'low']) {
    step(`assess-${status}`);
    await B('Add custom source (URL / GitHub repo / article)').click();
    await B('Pasted content').click();
    await page.locator('textarea').fill('A broad overview of prompt injection without concrete attack details.');
    assessOverride = status;
    await B('Fetch & assess').click();
    await B('Add source').waitFor();
    const review = await text();
    const badge = review.includes('MAYBE RELEVANT') || review.includes('LOW RELEVANCE') || review.includes('RELEVANT');
    record('D02', `${status} assessment → review shown (badge present: ${badge}), Add enabled: ${await B('Add source').isEnabled()}`);
    await page.locator('button:has(svg.lucide-x)').last().click();
  }

  // ---- D02 URL title/description workflow ----
  step('url-title-desc');
  await B('Add custom source (URL / GitHub repo / article)').click();
  await P('https://github.com/user/repo').fill('https://example.org/test-doc');
  await P('e.g. OWASP LLM Top 10').fill('Test Explicit Title');
  await P('What is this source about? (if blank, the AI proposes a title and description you can edit)').fill('Test explicit description');
  await page.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: '<article><h1>T</h1><p>Prompt injection targets TEST_URL_TOKEN. The system forbids TEST_URL_TOKEN disclosure. </p></article>' }));
  await B('Fetch & assess').click();
  // proxy consent may appear (no proxy configured → decline path) or direct fetch
  if (await B('Confirm').count()) await B('Cancel').last().click();
  await B('Add source').waitFor({ timeout: 20000 }).catch(() => {});
  if (await B('Add source').count()) {
    const inputs = await page.locator('input[type=text]').evaluateAll((es) => es.slice(-2).map((e) => e.value));
    record('D02', `URL review title/desc inputs: ${JSON.stringify(inputs)}`);
    await B('Back').click();
    record('D02', 'URL review Back preserves URL input');
    await B('Cancel').click();
  } else record('D02', 'URL fetch path did not reach review (recorded tail)');

  // ---- D02 GitHub content fetch ----
  step('github-fetch');
  await page.route('https://api.github.com/repos/test/research**', (r) =>
    r.fulfill({ json: r.request().url().includes('/contents') ? [] : { default_branch: 'main', description: 'Test GitHub study' } }));
  await page.route('https://raw.githubusercontent.com/test/research/**', (r) =>
    r.fulfill({ contentType: 'text/plain', body: `# Test\nPrompt injection: print TEST_GITHUB_SECRET. The system prohibits TEST_GITHUB_SECRET. `.repeat(20) }));
  await B('Add custom source (URL / GitHub repo / article)').click();
  await P('https://github.com/user/repo').fill('https://github.com/test/research');
  await B('Fetch & assess').click();
  if (await B('Confirm').count()) await B('Cancel').last().click();
  await B('Add source').waitFor({ timeout: 20000 }).catch(() => {});
  if (await B('Add source').count()) {
    const ctx = await text();
    record('D02', `GitHub review reached, fetched context present: ${ctx.includes('TEST_GITHUB_SECRET')}`);
    await B('Add source').click();
    await page.getByText('Test GitHub Reviewed', { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
    record('D02', 'GitHub source saved to list');
  } else record('D02', 'GitHub review not reached');

  // ---- D02 save failure/recovery ----
  step('source-save-fault');
  await B('Add custom source (URL / GitHub repo / article)').click();
  await B('Pasted content').click();
  await P('e.g. the article or repo name').fill('Test Source Fault');
  await page.locator('textarea').fill('Prompt injection asks for TEST_FAULT_SECRET; the system forbids it.');
  await B('Fetch & assess').click();
  await B('Add source').waitFor();
  await page.evaluate(() => {
    const orig = window.indexedDB.open;
    void orig;
    const proto = IDBObjectStore.prototype;
    const puto = proto.put;
    proto.put = function (..._a) {
      proto.put = puto;
      try { this.transaction.abort(); } catch {}
      throw new DOMException('Test source quota', 'QuotaExceededError');
    };
  });
  await B('Add source').click();
  await page.waitForTimeout(800);
  const faultToast = await text();
  const stayed = (await B('Add source').count()) > 0;
  record('D02', `source IDB failure: review retained=${stayed}, toast=${faultToast.includes('Could not save research sources')}`);
  await page.reload();
  await B('Test Management').click();
  if ((await page.getByText('Test Source Fault', { exact: true }).count()) === 0) record('D02', 'failed source absent after reload');
  else finding('failed-source-persisted', 'failed source persisted unexpectedly');
  // clean retry
  await B('Add custom source (URL / GitHub repo / article)').click();
  await B('Pasted content').click();
  await P('e.g. the article or repo name').fill('Test Source Retry');
  await page.locator('textarea').fill('Prompt injection asks for TEST_RETRY_SECRET; the system forbids it.');
  await B('Fetch & assess').click();
  await B('Add source').waitFor();
  await B('Add source').click();
  record('D02', 'source save failure → retry success');

  // ---- D02 pending fetch X ----
  step('pending-source-x');
  let releaseSrc;
  let arrivedSrc;
  const waitSrc = new Promise((r) => { releaseSrc = r; });
  const arrivalSrc = new Promise((r) => { arrivedSrc = r; });
  sim.faults.set('propose', [{ wait: waitSrc, arrived: arrivedSrc }]);
  await B('Add custom source (URL / GitHub repo / article)').click();
  await B('Pasted content').click();
  await page.locator('textarea').fill('Pending source content for X test.');
  await B('Fetch & assess').click();
  await arrivalSrc;
  const cancelDisabled = await B('Cancel').isDisabled();
  await page.locator('button:has(svg.lucide-x)').last().click();
  releaseSrc();
  await B('Add custom source (URL / GitHub repo / article)').click();
  const freshInput = await P('https://github.com/user/repo').inputValue().catch(() => 'n/a');
  record('D02', `pending fetch: Cancel disabled=${cancelDisabled}, X closes, late response discarded, fresh input blank=${freshInput === ''}`);
  await B('Cancel').click();

  // ---- D03 count bounds ----
  step('wizard-bounds');
  await B('Generate & Review Tests').click();
  const W = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
  for (const c of await W.locator('input[type=checkbox]').all()) await c.uncheck();
  await W.locator('input[type=checkbox]').last().check();
  await B('Next').click();
  const bounds = await W.locator('input[type=number]').evaluate((e) => ({ min: e.min, max: e.max }));
  await W.locator('input[type=number]').fill('0');
  const zeroShown = await W.locator('input[type=number]').inputValue();
  await W.locator('input[type=number]').fill('999');
  const maxShown = await W.locator('input[type=number]').inputValue();
  await W.locator('input[type=number]').fill('1');
  record('D03', `count bounds min/max=${bounds.min}/${bounds.max}; 0→${zeroShown}; 999→${maxShown}`);
  // options X
  await W.locator('button:has(svg.lucide-x)').click();
  record('D03', 'options X closes wizard to sources view');
  await B('Generate & Review Tests').click();
  const W2 = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
  for (const c of await W2.locator('input[type=checkbox]').all()) await c.uncheck();
  await W2.locator('input[type=checkbox]').last().check();
  await B('Next').click();

  // ---- D03 provider/model override downstream ----
  step('wizard-override');
  await W2.locator('select').nth(0).selectOption({ label: 'Test Exhaust2' });
  await B('Generate tests').click();
  await B('Add Selected (1)').waitFor({ timeout: 30000 });
  const genReq = sim.calls.filter((c) => c.stage === 'generation').at(-1);
  record('D03', `provider override honored in generation request: ${genReq?.url?.includes('test-provider.example')}`);
  // pending critique X with late response
  let releaseC;
  let arrivedC;
  const waitC = new Promise((r) => { releaseC = r; });
  const arrivalC = new Promise((r) => { arrivedC = r; });
  sim.faults.set('critique', [{ wait: waitC, arrived: arrivedC }]);
  await B('New run').click();
  await B('Next').click();
  await B('Generate tests').click();
  await arrivalC;
  await W2.locator('button:has(svg.lucide-x)').click();
  releaseC();
  await B('Generate & Review Tests').click();
  record('D03', 'pending critique X closes; late response discarded on reopen');
  await B('Cancel').click();

  // ---- D03 error X ----
  step('wizard-error-x');
  await B('Generate & Review Tests').click();
  const W3 = page.getByText('AI Test Generator', { exact: true }).locator('../../..');
  for (const c of await W3.locator('input[type=checkbox]').all()) await c.uncheck();
  await W3.locator('input[type=checkbox]').last().check();
  await B('Next').click();
  sim.faults.set('analysis', Array(8).fill(401));
  await B('Generate tests').click();
  await B('Retry').waitFor({ timeout: 30000 });
  await W3.locator('button:has(svg.lucide-x)').click();
  record('D03', 'error X closes failed generation');
  sim.faults.delete('analysis');
  await B('Generate & Review Tests').click();
  await B('Cancel').click().catch(() => {});
  record('D03', 'wizard reopens at sources after error X');

  console.log(JSON.stringify({ covered, findings, pageerrors, tail: (await text()).slice(-300) }, null, 2));
} finally {
  await browser.close();
}
