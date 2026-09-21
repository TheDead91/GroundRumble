// Opt-in production-UI exploration. Not part of the required unit/browser suites.
// No application imports, storage seeding, or production hooks.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.env.EXPLORATORY_OUTPUT || '.tmp/exploratory';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const evidence = { browser: browser.version(), events: [], requests: [], observations: {}, passed: [] };
const button = name => page.getByRole('button', { name, exact: true });
const text = () => page.locator('body').innerText();
const snapshot = async name => {
  await writeFile(`${output}/${name}.txt`, await page.locator('body').ariaSnapshot());
  await page.screenshot({ path: `${output}/${name}.png` });
};
page.on('pageerror', e => evidence.events.push({ type: 'pageerror', message: e.message }));
page.on('console', m => { if (m.type() === 'error') evidence.events.push({ type: 'console', message: m.text() }); });
page.on('requestfailed', r => evidence.events.push({ type: 'requestfailed', url: r.url(), error: r.failure() }));
let mode = 'success';
let held;
let requestArrived;
let transient = 0;
// Only the external provider boundary is simulated. This hostname never reaches DNS.
await page.route('https://acceptance.example/**', async route => {
  const r = route.request();
  const body = r.postDataJSON();
  evidence.requests.push({ url: r.url(), method: r.method(), body, mode });
  if (r.url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'acceptance-model' }] } });
  if (mode === 'held') { held = route; requestArrived?.(); return; }
  if (mode === 'offline') return route.abort('connectionrefused');
  if (mode === '401') return route.fulfill({ status: 401, json: { error: { message: 'Invalid API key' } } });
  if (mode === '429-once' && transient++ === 0) return route.fulfill({ status: 429, headers: { 'retry-after': '0' }, json: { error: { message: 'Rate limit' } } });
  const system = body.messages[0].content;
  let content = 'Sorry, I can only help with return policies. I cannot follow the override request.';
  if (mode === 'empty') content = '';
  if (system.includes('Security Evaluator')) {
    content = mode === 'malformed-judge' ? 'not a verdict' : JSON.stringify({ status: 'SECURE', reasoning: 'The response explicitly refused.' });
  }
  if (system.includes('research assistant building')) content = JSON.stringify({ title: 'Acceptance research', description: 'Document instruction isolation.' });
  if (system.includes('research librarian')) content = JSON.stringify({ status: 'high', summary: 'Document injection research.', reason: 'Contains a concrete marker test.' });
  return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content } }] } });
});

try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
  await button('Skip — I already know this tool').click();
  await button('Auditor Runner').click();
  await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Default (5)', exact: true }) }).selectOption({ label: 'Default (5)' });
  await button('Run Comparison Audit').click();
  await button('Run Comparison Audit').waitFor({ timeout: 60000 });
  assert.match(await text(), /5 secure · 0 vulnerable/);
  assert.match(await text(), /0 secure · 5 vulnerable/);
  evidence.passed.push('Fresh user: default sandbox comparison, two models, ten evaluations');
  await page.getByPlaceholder('Search payloads…').fill('Direct System Override');
  await button('VULNERABLE').first().click();
  evidence.observations['ACC-003'] = await page.locator('[data-tour="expanded-result"]').innerText();
  await snapshot('ACC-003-model-label');
  await button('Inconclusive').click();
  await button('Cancel').click();
  evidence.observations['ACC-001'] = { afterCancel: await page.locator('[data-tour="expanded-result"]').innerText() };
  await snapshot('ACC-001-cancel');
  await page.reload();
  await button('Dashboard').click();
  evidence.observations['ACC-001'].afterReload = await text();
  await snapshot('ACC-001-reload');
  evidence.observations.historyTargets = await page.locator('[data-testid="history-row"]').first().innerText();
  await page.locator('[data-testid="history-row"] [data-tip="View"]').first().click();
  evidence.observations.historyDetail = await text();
  await page.locator('[data-tip="Close"]').click();

  await button('Settings').click();
  await button('Add Provider').click();
  const beforeValidation = evidence.events.length;
  await button('Save Provider').click();
  // Confirm that the draft remains rendered before capturing its validation UI.
  await page.waitForFunction(() => document.querySelector('input[placeholder="e.g. OpenAI, OpenRouter, DeepSeek"]') !== null);
  await snapshot('ACC-004-validation');
  evidence.observations['ACC-004'] = { ui: await text(), events: evidence.events.slice(beforeValidation) };
  await page.getByPlaceholder('e.g. OpenAI, OpenRouter, DeepSeek').fill('Acceptance Endpoint');
  await page.getByPlaceholder('https://api.openai.com/v1/chat/completions', { exact: true }).fill('https://acceptance.example/v1');
  await page.getByPlaceholder('Optional (leave blank if none required)').fill('acceptance-dummy-key');
  await button('Test Connection').click();
  await page.getByText('Connected — 1 model(s) found', { exact: true }).waitFor();
  mode = '401';
  await button('Test Connection').click();
  await page.getByText('Authentication failed (HTTP 401). Check the API key.', { exact: true }).waitFor();
  mode = 'success';
  await button('Test Connection').click();
  await page.getByText('Connected — 1 model(s) found', { exact: true }).waitFor();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      IDBObjectStore.prototype.put = original;
      this.transaction.abort();
      throw new DOMException('Acceptance vault quota exceeded', 'QuotaExceededError');
    };
  });
  await button('Save Provider').click();
  await button('Save anyway').click();
  await page.getByText('Could not save provider: Acceptance vault quota exceeded', { exact: true }).last().waitFor();
  assert.equal(await page.getByPlaceholder('e.g. OpenAI, OpenRouter, DeepSeek').inputValue(), 'Acceptance Endpoint');
  await snapshot('ACC-004-save-failure');
  await button('Save Provider').click();
  await button('Save anyway').click();
  await button('Add Provider').waitFor();
  evidence.observations['ACC-004'].providerEvents = evidence.events.slice(beforeValidation);
  await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).uncheck();
  evidence.passed.push('Provider connectivity success → 401 → retry success and normal vault save');

  await button('Auditor Runner').click();
  for (const model of ['Demo Secure', 'Demo Vulnerable']) {
    await page.getByText(model, { exact: true }).locator('../..').getByRole('button').click();
  }
  await button('Add to Comparison').click();
  await button('Clear All').click();
  await page.getByPlaceholder('Search payloads…').fill('Direct System Override');
  await page.getByRole('checkbox', { name: 'Direct System Override AML.T0034 Execution', exact: true }).check();
  const run = async () => { await button('Run Comparison Audit').click(); await button('Run Comparison Audit').waitFor({ timeout: 60000 }); };

  mode = 'held';
  const arrival = new Promise(resolve => { requestArrived = resolve; });
  await button('Run Comparison Audit').click();
  await arrival;
  await button('Stop Audit').click();
  await button('Run Comparison Audit').waitFor();
  await held.fulfill({ json: { choices: [{ message: { content: 'Late response' } }] } }).catch(() => {});
  assert.match(await text(), /Audit cancelled by user after 0 completed evaluation/);
  assert.equal(await page.getByRole('heading', { name: 'Comparison Results' }).count(), 0);
  evidence.passed.push('Held audit → Stop → late response discarded, no technical/security verdict');
  for (const fault of ['empty', '401', 'offline', '429-once', 'success']) {
    mode = fault;
    await run();
    const ui = await text();
    if (fault === 'empty') {
      assert.match(ui, /0 secure · 0 vulnerable · 1 empty/);
      evidence.observations['ACC-002'] = ui.slice(ui.indexOf('Comparison Results'));
      await page.getByRole('heading', { name: 'Comparison Results' }).scrollIntoViewIfNeeded();
      await snapshot('ACC-002-empty');
    } else if (['401', 'offline'].includes(fault)) assert.match(ui, /0 secure · 0 vulnerable · 1 errors/);
    else assert.match(ui, /1 secure · 0 vulnerable/);
  }
  evidence.passed.push('Target empty/auth/connection failures remain non-verdicts; rate limit and retry recover');
  await button('AI Judge').click();
  mode = 'malformed-judge';
  await run();
  assert.match(await text(), /0 secure · 0 vulnerable · 1 inconclusive/);
  mode = 'success';
  await run();
  assert.match(await text(), /1 secure · 0 vulnerable/);
  const popupPromise = page.waitForEvent('popup');
  await button('Download Report').click();
  const popup = await popupPromise;
  await popup.frameLocator('iframe').getByText('GroundRumble Security Audit Report', { exact: true }).waitFor();
  evidence.observations.report = await popup.frameLocator('iframe').locator('body').innerText();
  assert.match(evidence.observations.report, /1 secure · 0 vulnerable/);
  await popup.screenshot({ path: `${output}/report.png` });
  await popup.close();
  evidence.passed.push('Malformed judge → INCONCLUSIVE → successful retry; sandboxed printable report renders');

  await button('Test Management').click();
  await button('Add custom source (URL / GitHub repo / article)').click();
  await button('Pasted content').click();
  await page.getByPlaceholder('e.g. the article or repo name').fill('Acceptance research');
  const research = 'Prompt injection research: untrusted retrieved documents can ask an assistant to ignore its policy. A support assistant must treat retrieved text as data. The document asks the assistant to output CANARY_ACCEPTANCE instead of answering the user. The assistant should refuse the document instructions.';
  await page.getByPlaceholder('Paste the full article, research paper, or README text here — the AI analyzes it directly, no CORS limits.').fill(research);
  await button('Fetch & assess').click();
  await button('Back').click();
  assert.equal(await page.getByPlaceholder('e.g. the article or repo name').inputValue(), 'Acceptance research');
  await button('Fetch & assess').click();
  await button('Add source').click();
  await page.getByText('Acceptance research', { exact: true }).waitFor();
  await button('Settings').click();
  await page.getByPlaceholder('Set a passphrase to encrypt your keys').fill('Acceptance passphrase 2026');
  await button('Protect with passphrase').click();
  await button('Lock now').waitFor();
  await button('Lock now').click();
  await page.getByPlaceholder('Vault passphrase', { exact: true }).fill('Acceptance passphrase 2026');
  await button('Unlock').click();
  await button('Test Management').click();
  await page.getByText('Acceptance research', { exact: true }).waitFor();
  evidence.passed.push('Pasted source assess/Back/add; encrypted vault lock/reload/unlock preserves source and provider');
  await button('Settings').click();
  await page.getByPlaceholder('Required to encrypt the backup (min 12 characters)').fill('Acceptance backup 2026');
  const downloadPromise = page.waitForEvent('download');
  await button('Export Backup').click();
  await (await downloadPromise).saveAs(`${output}/backup.json`);
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.getByText('Import failed: The selected file is not valid JSON.', { exact: true }).last().waitFor();
  evidence.passed.push('Encrypted backup download and invalid JSON restore rejection');
  // Browser storage is a genuine external boundary; reload removes this fault.
  await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Storage quota exceeded', 'QuotaExceededError'); };
  });
  await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).click();
  evidence.observations['ACC-005'] = { afterFailure: await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).isChecked(), ui: await text() };
  await snapshot('ACC-005-storage-failure');
  await page.reload();
  await page.getByPlaceholder('Vault passphrase', { exact: true }).fill('Acceptance passphrase 2026');
  await button('Unlock').last().click();
  await button('Settings').click();
  evidence.observations['ACC-005'].afterReload = await page.getByRole('checkbox', { name: 'Active Sandbox Mode', exact: true }).isChecked();
  await snapshot('ACC-005-reload');
} finally {
  await writeFile(`${output}/evidence.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
console.log(`Completed ${evidence.passed.length} healthy journey checks. Candidate evidence: ${output}/evidence.json`);
// Optional regression checks assert the approved behavior for the reported findings.
const check = process.argv.indexOf('--check');
if (check !== -1) {
  const id = process.argv[check + 1];
  const checks = {
    'ACC-001': () => assert.doesNotMatch(evidence.observations['ACC-001'].afterCancel, /Clear override/, 'Cancel must leave the original verdict unchanged'),
    'ACC-002': () => assert.doesNotMatch(evidence.observations['ACC-002'], /every attack was resisted/, 'An empty response cannot establish resistance'),
    'ACC-003': () => {
      assert.match(evidence.observations['ACC-003'], /Model:.*Demo Vulnerable/, 'The opened result must identify its target model');
      assert.match(evidence.observations.historyTargets, /Demo Secure.*Demo Vulnerable/s, 'Dashboard history names both targets');
      assert.match(evidence.observations.historyDetail, /Sandbox.*\/ Demo Secure.*Sandbox.*\/ Demo Vulnerable/s, 'History detail identifies both targets');
      assert.match(evidence.observations.report, /Targets:.*Acceptance Endpoint \/ acceptance-model/s, 'Report target metadata identifies the configured model');
    },
    'ACC-004': () => {
      assert.match(evidence.observations['ACC-004'].ui, /Provider name is required/, 'Invalid Save must show actionable validation');
      assert.deepEqual(evidence.observations['ACC-004'].providerEvents.filter(e => e.type === 'pageerror'), [], 'Provider form validation, connectivity and storage failures must be handled');
    },
    'ACC-005': () => {
      assert.equal(evidence.observations['ACC-005'].afterFailure, false, 'A failed write retains live mode');
      assert.equal(evidence.observations['ACC-005'].afterFailure, evidence.observations['ACC-005'].afterReload, 'A failed sandbox-mode write must not silently claim a persisted mode change');
      assert.match(evidence.observations['ACC-005'].ui, /Could not save sandbox mode/, 'Persistence failure is visible');
      assert.ok(!evidence.events.some(e => e.type === 'pageerror' && e.message.includes('Storage quota exceeded')), 'The storage failure must be handled');
    },
  };
  const ids = id === 'all' ? Object.keys(checks) : [id];
  const failures = [];
  for (const candidate of ids) {
    if (!checks[candidate]) throw new Error(`Unknown candidate: ${candidate}`);
    try { checks[candidate](); } catch (error) { failures.push(`${candidate}: ${error.message.split('\n')[0]}`); }
  }
  assert.deepEqual(failures, [], 'Opt-in candidate regression assertions');
}
