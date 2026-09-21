// Browser coverage for the MITRE ATLAS Matrix tab — the tactic-column
// technique grid with mapped-test dots, the selected-technique detail pane
// (description, recommended mitigations incl. the local fallbacks, mapped
// diagnostic prompts with add/delete/run and their vault gates) and the
// last-synced version note.
//
// DOM-anchor-driven (data-tour / data-testid / visible copy only) and never
// references where the JSX lives.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/matrix-view.browser.test.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startBrowserCoverage } from './helpers/browser-coverage.mjs';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

// The app silently auto-syncs MITRE ATLAS ~800ms after mount (SettingsContext
// effect). Serve the v6 pointer + document hermetically so the matrix settles
// on a deterministic single-tactic fixture: version 9.9.9, one tactic
// (AML.TA0002 "Execution") holding one technique (AML.T0034 "LLM Prompt
// Injection") with NO synced mitigations — which engages the detail pane's
// local fallback mitigation list.
const v6Yaml = [
  'version: 9.9.9',
  'tactics:',
  '  AML.TA0002: { name: "Execution", description: "The adversary is trying to get malicious code to run." }',
  'techniques:',
  '  AML.T0034: { name: "LLM Prompt Injection", description: "Crafting inputs to overwrite or bypass the system instructions and force the LLM to execute unintended actions.", platforms: [] }',
  'relationships:',
  '  AML.T0034:',
  '    achieves:',
  '      - target: AML.TA0002',
  '    mitigates: []',
  'mitigations: {}'
].join('\n');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const saveCoverage = await startBrowserCoverage(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    const url = route.request().url();
    if (/ATLAS-latest\.yaml$/.test(url)) {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '9.9.9.yaml' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: v6Yaml });
    }
  });

  // Fresh session with onboarding done and demo mode on (the shipped default
  // experience); no providers, no judge/gen config, and NO cached matrix —
  // the bundled preloaded matrix renders first, then the silent sync swaps in
  // the fixture above.
  await page.context().addInitScript(() => {
    if (!sessionStorage.getItem('__grSeeded')) {
      sessionStorage.setItem('__grSeeded', '1');
      localStorage.setItem('atlas_onboarding_done', '1');
      localStorage.setItem('atlas_demo_mode', 'true');
      localStorage.removeItem('atlas_providers');
      localStorage.removeItem('atlas_judge_config');
      localStorage.removeItem('atlas_gen_config');
      localStorage.removeItem('atlas_settings_collapsed');
      localStorage.removeItem('atlas_cached_matrix');
      localStorage.removeItem('atlas_matrix_meta');
    }
  });
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });

  // --- A1/A3: the matrix tab renders the tactic-column grid ---
  await page.locator('[data-tour="nav-matrix"]').click();
  const grid = page.locator('[data-tour="matrix-grid"]');
  await grid.waitFor({ state: 'visible', timeout: 10000 });

  // The bundled preloaded matrix renders immediately (fallback path), then the
  // silent sync swaps in the fixture — wait for the fixture's tactic column.
  await grid.getByText('Execution', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  const techniqueCard = grid.locator('.technique-card', { hasText: 'LLM Prompt Injection' });
  await techniqueCard.waitFor({ state: 'visible', timeout: 15000 });
  await techniqueCard.getByText('AML.T0034').waitFor({ state: 'visible' });
  // The mapped-preset dot marks the technique card (Direct System Override maps to AML.T0034).
  await techniqueCard.locator('[title="Mapped Test Prompt available"]').waitFor({ state: 'visible' });

  // --- A2: sync status reflects SettingsContext (silent sync version) ---
  await page.getByText(/Last synced .*version 9\.9\.9/).waitFor({ state: 'visible', timeout: 15000 });

  // --- A1/A2: the detail pane — identity, description, fallback mitigations ---
  await techniqueCard.click();
  const detail = page.locator('[data-tour="technique-detail"]');
  await detail.waitFor({ state: 'visible', timeout: 5000 });
  await detail.getByText('AML.T0034', { exact: true }).first().waitFor({ state: 'visible' });
  await detail.locator('h3', { hasText: 'LLM Prompt Injection' }).waitFor({ state: 'visible' });
  await detail.getByText('Description', { exact: true }).waitFor({ state: 'visible' });
  await detail.getByText(/Crafting inputs to overwrite or bypass the system instructions/).waitFor({ state: 'visible' });
  await detail.getByText('Recommended Mitigations').waitFor({ state: 'visible' });
  // The fixture carries no synced mitigations → the AML.T0034 fallback list renders.
  await detail.getByText('Use pre-evaluation guardrails (Llama Guard, NeMo Guardrails) to audit incoming prompts.').waitFor({ state: 'visible' });
  await detail.getByText('Separate developer instructions from user content using structured roles.').waitFor({ state: 'visible' });
  await detail.getByText('Apply strict XML/JSON delimiters around user variables inside the system layout.').waitFor({ state: 'visible' });

  // --- A2: mapped diagnostic prompts — the preset mapping is listed and runnable ---
  await detail.getByText('Mapped Diagnostic Prompts').waitFor({ state: 'visible' });
  await detail.getByText('Direct System Override', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  await detail.getByText('OWASP Top 10 for LLM Applications (LLM01: Direct Prompt Injection)').first().waitFor({ state: 'visible' });
  // Exactly one mapped row → exactly one Run affordance; no empty-state copy.
  assert.equal(await detail.getByRole('button', { name: 'Run', exact: true }).count(), 1, 'the single mapped row carries exactly one Run button');
  assert.equal(await detail.getByText('No test prompts mapped to this technique. Click "Add Prompt" above to create one.').count(), 0, 'the empty-mapped-list copy is hidden');

  // --- A2: Add Prompt seeds the custom form with the technique and opens the dialog ---
  // (while the pane is still open — the spec deliberately never pins the
  // selection's lifetime across tab switches)
  await detail.getByRole('button', { name: 'Add Prompt' }).click();
  const dialog = page.getByText('Create custom diagnostic prompt');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  // The dialog's Technique ID input arrives pre-seeded with the selected technique.
  const seededValue = await page.locator('div:has(> label.form-label:text-is("Technique ID")) input').first().inputValue();
  assert.equal(seededValue, 'AML.T0034', `Add Prompt seeds the technique id into the custom form (got ${seededValue})`);
  await page.locator('[data-tip="Close"]').last().click();
  await dialog.waitFor({ state: 'hidden', timeout: 5000 });

  // --- A2: Run jumps to the runner with exactly this test selected ---
  await detail.getByRole('button', { name: 'Run', exact: true }).click();
  await page.locator('[data-testid="audit-run"]').waitFor({ state: 'visible', timeout: 10000 });
  // The runner's payload selector reflects the selection (selectedTests is
  // intentionally NOT persisted to localStorage).
  await page.getByText('1 selected', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('input[type="checkbox"]:checked').first().waitFor({ state: 'visible', timeout: 5000 });

  // The browser session must stay clean: no uncaught page errors anywhere.
  assert.deepEqual(pageErrors, [], 'no uncaught page errors during the whole flow');
  await saveCoverage('matrix-view');
} finally {
  await browser.close();
}
