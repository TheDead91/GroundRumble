// Browser probe for the runner config surface —
// the Model Comparison Lineup panel, the Attack Payloads Selection card, the
// run-audit controls with the inline diagnostic console, the comparison
// results grid and the expanded-cell detail — plus a 1-payload × 2-model demo
// audit completing end-to-end through it.
//
// DOM-anchor-driven (data-tour / data-testid only) and never references where
// the runner JSX lives.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/runner-view-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // The app auto-syncs MITRE ATLAS shortly after load; serve it hermetically.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: [
      'format-version: 2026.01',
      'tactics:',
      '  AML.TA0001: { name: "Execution", description: "d" }',
      'techniques:',
      '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
      'relationships: {}',
      'mitigations: {}'
    ].join('\n') });
  });

  // Fresh demo-mode session with NO persisted lineup: App must seed the two
  // sandbox DEMO_TARGETS itself (and not write atlas_compare_targets back).
  const script = {
    content: `(() => {
      if (!sessionStorage.getItem('__grSeeded')) {
        sessionStorage.setItem('__grSeeded', '1');
        localStorage.setItem('atlas_onboarding_done', '1');
        localStorage.setItem('atlas_demo_mode', 'true');
        localStorage.removeItem('atlas_compare_targets');
      }
    })();`
  };
  await page.context().addInitScript(script);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

  // --- A1: the runner config surface renders from the extracted view ---
  await page.getByRole('button', { name: 'Auditor Runner', exact: true }).click();

  const seeded = await page.evaluate(() => localStorage.getItem('atlas_compare_targets'));
  assert.equal(seeded, null, 'fresh demo session must not persist atlas_compare_targets');

  const lineup = page.locator('[data-tour="runner-lineup"]');
  await lineup.getByText('Comparison Lineup (2)').waitFor({ state: 'visible', timeout: 10000 });
  await lineup.getByText('Demo Secure', { exact: true }).locator('visible=true').first().waitFor({ state: 'visible' });
  await lineup.getByText('Demo Vulnerable', { exact: true }).locator('visible=true').first().waitFor({ state: 'visible' });

  for (const marker of ['runner-lineup', 'add-target', 'payload-selection', 'preset-select', 'run-audit', 'show-console']) {
    assert.ok(await page.locator(`[data-tour="${marker}"]`).count() === 1, `the config surface carries data-tour="${marker}"`);
  }
  await page.getByRole('button', { name: 'Run Comparison Audit', exact: true }).waitFor({ state: 'visible' });

  // --- A2: 1-payload × 2-model demo audit completes end-to-end ---
  const payloads = page.locator('[data-tour="payload-selection"]');
  await payloads.getByRole('button', { name: 'Clear All', exact: true }).click();
  await payloads.locator('label').filter({ hasText: 'System Prompt Extraction' }).locator('input[type="checkbox"]').check();

  // Console opens idle BEFORE the run, then streams timestamped lines during it.
  await page.getByRole('button', { name: 'Show Console', exact: true }).click();
  await page.getByText('Console idle. Run a Comparison Audit to stream logs here...').waitFor({ state: 'visible' });

  await page.getByTestId('audit-run').click();
  await page.getByText('Comparison Results', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="audit-run"]')?.disabled);

  const resultsCard = page.locator('[data-tour="results-table"]');
  assert.equal(await resultsCard.getByText(/1 tests × 2 models/).count(), 1, 'result header must report 1 test × 2 models');
  await resultsCard.waitFor({ state: 'visible' });

  const tsLines = page.getByText(/^\[\d{1,2}:\d{2}/);
  assert.ok(await tsLines.count() >= 2, 'the inline console streamed non-idle timestamped log lines');

  const row = page.getByTestId('result-row-system_prompt_leak');
  await row.waitFor({ state: 'attached' });
  assert.equal(await row.locator('button').count(), 2, 'the row needs exactly the two per-target result cells');
  assert.equal(await row.locator('button').filter({ hasText: 'SECURE' }).count(), 1, 'Demo Secure cell must be SECURE');
  assert.equal(await row.locator('button').filter({ hasText: 'VULNERABLE' }).count(), 1, 'Demo Vulnerable cell must be VULNERABLE');

  // --- A2/A3: expanded-cell detail with (Simulated) reasoning + override buttons ---
  await row.locator('button').filter({ hasText: 'VULNERABLE' }).click();
  const detail = page.locator('[data-tour="expanded-result"]');
  await detail.waitFor({ state: 'visible' });
  const vulnText = await detail.textContent();
  assert.match(vulnText, /System Prompt Extraction/, 'expanded panel names the audited payload');
  assert.match(vulnText, /\(Simulated\)/, 'demo reasoning prefix must render in the expanded cell');
  assert.match(vulnText, /Auditor Evaluation Reasoning:/, 'the reasoning section renders');
  for (const override of ['Secure', 'Vulnerable', 'Inconclusive']) {
    assert.ok(await detail.getByRole('button', { name: override, exact: true }).count() === 1,
      `the expanded cell carries the ${override} override button`);
  }

  assert.equal(pageErrors.length, 0, pageErrors.map(error => error.message).join('\n'));
} finally {
  await browser.close();
}
