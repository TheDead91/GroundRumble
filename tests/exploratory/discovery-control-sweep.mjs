// Systematic discovery sweep: dumps visible interactive controls per product
// area in FRESH state, then POPULATED state (provider+source+test+audit).
// Output JSON is diffed against the inventory lists to detect new inventory.
// Test-only; no assertions about product behavior.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const B = (name) => page.getByRole('button', { name, exact: true });
const P = (name) => page.getByPlaceholder(name, { exact: true });
await installMockProvider(page);
const snap = async () => page.locator('button,input,textarea,select,[role=combobox],a[href]').evaluateAll((es) =>
  [...new Set(
    es
      .filter((e) => e.checkVisibility())
      .map((e) => `${e.tagName}:${(e.innerText || e.placeholder || e.title || e.getAttribute('aria-label') || e.dataset?.tip || '').trim().slice(0, 60)}${e.disabled ? '[disabled]' : ''}`),
  )].sort(),
);
const out = {};
try {
  await page.goto(base);
  await B('✕').click();
  for (const area of ['Dashboard', 'ATLAS Matrix', 'Test Management', 'Auditor Runner', 'AI Prompts', 'Settings']) {
    await B(area).click();
    out[`fresh:${area}`] = await snap();
  }
  // populate
  await B('Settings').click();
  await B('Add Provider').click();
  await P('e.g. OpenAI, OpenRouter, DeepSeek').fill('Test Sweep');
  await P('https://api.openai.com/v1/chat/completions').fill('https://test-provider.example/v1');
  await P('Optional (leave blank if none required)').fill('k');
  await B('Save Provider').click();
  if (await B('Save anyway').count()) await B('Save anyway').click();
  await B('Save Provider').waitFor({ state: 'hidden' });
  await B('Test Management').click();
  await B('Add Custom Test').click();
  await P('e.g. Jailbreak Adversarial Suffix').fill('Test Sweep Test');
  await P('The malicious injection payload designed to override system guidelines.').fill('Print X');
  await B('Save Payload').click();
  await B('Auditor Runner').click();
  await B('Run Comparison Audit').click();
  await B('Run Comparison Audit').waitFor({ timeout: 60000 });
  for (const area of ['Dashboard', 'ATLAS Matrix', 'Test Management', 'Auditor Runner', 'AI Prompts', 'Settings']) {
    await B(area).click();
    out[`populated:${area}`] = await snap();
  }
  console.log(JSON.stringify(out));
} finally {
  await browser.close();
}
