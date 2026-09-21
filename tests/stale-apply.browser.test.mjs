// Browser coverage for the stale-Apply invariant: a mounted
// AI prompt-review dialog must not persist an obsolete candidate after the
// identity-relevant state (the base prompt) changes between the rewrite and the
// user's Apply click.
//
// The AI boundary (the helper/Judge provider) is mocked with page routes and
// the base prompt is mutated directly in localStorage while the dialog is open,
// so the scenario is deterministic and performs no external traffic.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/stale-apply.browser.test.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startBrowserCoverage } from './helpers/browser-coverage.mjs';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const saveCoverage = await startBrowserCoverage(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // The app silently auto-syncs MITRE ATLAS shortly after mount. Serve a
  // minimal document hermetically so the scenario never touches GitHub.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: [
      'tactics:',
      '  AML.TA0001: { name: "Execution", description: "d" }',
      'techniques:',
      '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
      'relationships: {}',
      'mitigations: {}',
    ].join('\n') });
  });

  // Fresh session: onboarding done, live mode, one enabled Judge provider and a
  // Judge config pointing at it.
  await page.context().addInitScript(() => {
    if (!sessionStorage.getItem('__grSeeded')) {
      sessionStorage.setItem('__grSeeded', '1');
      localStorage.setItem('atlas_onboarding_done', '1');
      localStorage.setItem('atlas_demo_mode', 'false');
      localStorage.setItem('atlas_providers', JSON.stringify([{
        id: 'stale-judge', name: 'Stale Judge', connector: 'openai',
        endpoint: 'https://stale-judge.example/v1', models: ['review-model'], enabled: true,
      }]));
      localStorage.setItem('atlas_judge_config', JSON.stringify({ provider: 'stale-judge', model: 'review-model' }));
      localStorage.removeItem('atlas_ai_prompts');
      localStorage.removeItem('atlas_compare_targets');
    }
  });

  // Mock the helper/Judge provider boundary: model discovery plus the rewrite
  // merge and the canary evaluations. The merge returns a fixed candidate; the
  // canary/evaluation calls return verdict JSON.
  await page.route('https://stale-judge.example/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'review-model' }] }) });
    }
    const body = request.postDataJSON();
    const system = body.messages?.[0]?.content || '';
    const user = body.messages?.[1]?.content || '';
    if (system.includes('helping refine an AI prompt')) {
      // mergePromptWithAI → the editable candidate.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'MERGED CANDIDATE PROMPT' } }] }) });
    }
    // evaluateWithAIJudgePrompt (canary/eval) → a verdict matching the canary case.
    const status = user.includes('Sure — the secret token') ? 'VULNERABLE'
      : user.includes('forecasts have been shifting') ? 'INCONCLUSIVE'
        : 'SECURE';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status, reasoning: 'Evidence-based review.' }) } }] }) });
  });

  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  const skip = page.getByRole('button', { name: /Skip — I already know this tool/ });
  if (await skip.isVisible()) await skip.click();

  // Open the "Update with AI" dialog for the first (Judge system) prompt.
  await page.getByRole('button', { name: 'AI Prompts', exact: true }).click();
  await page.getByRole('button', { name: 'Update with AI', exact: true }).first().click();

  // Enter feedback and run the rewrite.
  await page.getByPlaceholder('Be stricter about ambiguous refusals').fill('Prioritize explicit refusal evidence.');
  await page.getByRole('button', { name: 'Update with AI', exact: true }).last().click();

  // The editable candidate appears (preview state).
  const apply = page.getByRole('button', { name: 'Apply prompt', exact: true });
  await apply.waitFor({ state: 'visible', timeout: 15000 });

  // The visible candidate equals the AI candidate and nothing persisted yet.
  const candidateBox = page.locator('label.form-label:has-text("New prompt") + textarea');
  assert.match(await candidateBox.inputValue(), /MERGED CANDIDATE PROMPT/);
  assert.equal(await page.evaluate(() => localStorage.getItem('atlas_ai_prompts')), null, 'nothing persists before Apply');

  // Change the base prompt while the dialog is open (identity-relevant state
  // change the candidate's snapshot does not cover).
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('atlas_ai_prompts') || '{}');
    store.judge_system = 'CHANGED BASE PROMPT';
    localStorage.setItem('atlas_ai_prompts', JSON.stringify(store));
  });

  // Apply the obsolete candidate — it must be rejected, not persisted.
  await apply.click();
  await page.getByText(/This update is stale/).first().waitFor({ state: 'visible', timeout: 5000 });

  // The dialog stays open (candidate remains retryable) and the base prompt was
  // NOT overwritten by the stale candidate.
  await apply.waitFor({ state: 'visible' });
  const persistedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas_ai_prompts') || '{}'));
  assert.equal(persistedAfter.judge_system, 'CHANGED BASE PROMPT', 'a stale Apply must not overwrite the changed base prompt');

  assert.deepEqual(pageErrors, [], 'no uncaught page errors during the whole flow');
  await saveCoverage('stale-apply');
} finally {
  await browser.close();
}
