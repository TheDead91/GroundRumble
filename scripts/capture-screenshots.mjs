// Capture UI screenshots for the ReadTheDocs documentation.
//
// Boots the Vite dev server, seeds a realistic demo state (sandbox on, sample
// targets, cached ATLAS matrix, Default preset, demo history), syncs the live
// matrix, runs one sandbox audit so the results table is populated, and saves
// PNGs into docs/assets/img/.
//
// Usage: npm run screenshots
//
// Shared seeding + server + fake-generator helpers live in demo-lib.mjs.

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import {
  VIEWPORT,
  PANE_VIEWPORT,
  seedFor,
  applySeed,
  goto,
  nav,
  startServer,
  stopServer,
  interceptGenerator,
  expandMain,
  scrollTo,
  syncMatrix
} from './demo-lib.mjs';

const OUT = path.resolve(process.cwd(), 'docs', 'assets', 'img');

mkdirSync(OUT, { recursive: true });

async function shot(page, name, { fullPage = true } = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage, animations: 'disabled' });
  console.log(`captured ${name}.png`);
}

// Capture just a single pane/element (e.g. a settings card or the results
// matrix), not the whole viewport.
async function elementShot(page, name, selector) {
  await page.locator(selector).first().screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });
  console.log(`captured ${name}.png`);
}

const main = async () => {
  const ONLY = process.env.VS_ONLY || ''; // 'preview' | 'main' | '' (all)
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    // --- Onboarding (clean context, wizard visible) ---
    if (!ONLY) {
      const ctx = await browser.newContext({ viewport: VIEWPORT });
      const page = await ctx.newPage();
      await applySeed(page, seedFor({ onboardingDone: false }));
      await goto(page);
      await page.waitForSelector('text=Let\'s get started', { timeout: 20000 });
      await page.waitForTimeout(600);
      await shot(page, 'onboarding', { fullPage: false });
      await ctx.close();
    }

    // --- Seeded app ---
    if (ONLY !== 'preview') {
    const ctx = await browser.newContext({ viewport: PANE_VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await applySeed(page, seedFor());
    await goto(page);
    await page.waitForSelector('[data-tour="nav-dashboard"]', { timeout: 20000 });
    await page.waitForTimeout(600);

    // Dashboard
    await expandMain(page);
    await shot(page, 'dashboard');

    // Matrix (sync the live matrix first, then click a technique)
    await nav(page, 'matrix').click();
    await page.waitForTimeout(600);
    await syncMatrix(page);
    await page.locator('.technique-card').first().click();
    await page.waitForTimeout(600);
    await expandMain(page);
    await shot(page, 'matrix');

    // Tests (top of the tab: toolbar, filters, and the table)
    await nav(page, 'tests').click();
    await page.waitForTimeout(600);
    await shot(page, 'tests', { fullPage: false });

    // AI Test Generation — the whole pane (sources + fetched/assessed URL)
    await elementShot(page, 'ai-generation', '[data-tour="ai-gen-pane"]');

    // Runner (before run: lineup + payloads)
    await nav(page, 'runner').click();
    await page.waitForTimeout(600);
    await shot(page, 'runner', { fullPage: false });

    // Run a sandbox audit that mixes failures and successes: the curated Default
    // preset (vulnerable in sandbox) plus two auto-coverage payloads (refused →
    // SECURE by default). Then capture the results matrix and a failed-test detail.
    await page.selectOption('[data-tour="preset-select"]', 'default');
    await page.waitForTimeout(300);
    const autoRows = page.locator('[data-tour="payload-selection"] label:has-text("[Auto]")');
    if (await autoRows.count() >= 2) {
      await autoRows.nth(0).click();
      await autoRows.nth(1).click();
    }
    await page.waitForTimeout(300);
    await page.locator('[data-tour="run-audit"]').click();
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-tour="run-audit"]');
      return b && !b.disabled;
    }, null, { timeout: 240000 });
    await page.waitForTimeout(800);

    // Expand the "Succeeded" group so both failures and successes are visible,
    // then capture just the Comparison Results pane.
    await page.locator('button:has-text("Succeeded Attack Payloads")').first().click();
    await page.waitForTimeout(400);
    await elementShot(page, 'results', '[data-tour="results-table"]');

    // Open the first vulnerable result to show the full failed-test detail.
    await page.locator('[data-tour="results-table"] button:has-text("VULNERABLE")').first().click();
    await page.waitForTimeout(500);
    await elementShot(page, 'result-detail', '[data-tour="expanded-result"]');

    // Settings
    await nav(page, 'settings').click();
    await page.waitForTimeout(600);
    await scrollTo(page, '[data-tour="credentials-panel"]');
    await shot(page, 'settings', { fullPage: false });
    await elementShot(page, 'sandbox', '[data-tour="sandbox-config"]');
    await elementShot(page, 'vault', '[data-tour="key-vault"]');
    await elementShot(page, 'backup', '[data-tour="backup-card"]');

    await ctx.close();
    }

    // --- AI-led proposal of test cases (generator intercepted) ---
    if (ONLY !== 'main') {
      const ctx2 = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page2 = await ctx2.newPage();
      await applySeed(page2, seedFor({ generator: true }));
      await interceptGenerator(page2);
      page2.on('dialog', (d) => console.log('DIALOG:', d.message()));
      page2.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
      await goto(page2);
      await page2.waitForSelector('[data-tour="nav-tests"]', { timeout: 20000 });
      await page2.waitForTimeout(600);
      await nav(page2, 'tests').click();
      await page2.waitForTimeout(600);
      await scrollTo(page2, '[data-tour="ai-generate"]');
      await page2.locator('[data-tour="ai-generate"]').click();
      await page2.getByRole('button', { name: 'Next', exact: true }).click();
      await page2.getByRole('button', { name: /Generate tests/ }).click();
      await page2.waitForSelector('text=Select the ones you want to add', { timeout: 120000 });
      await page2.waitForTimeout(500);
      await shot(page2, 'ai-generation-preview', { fullPage: false });
      await ctx2.close();
    }
  } finally {
    await browser.close();
    stopServer(server);
  }
  console.log('Done. Screenshots saved to', OUT);
};

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exitCode = 1;
});
