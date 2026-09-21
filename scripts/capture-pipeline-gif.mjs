// Captures a GIF showing the whole GroundRumble pipeline for the README.
//
// Boots the dev server, seeds the demo state (sandbox on, sample targets,
// cached matrix, Default preset, demo history), intercepts the generator so
// the AI wizard runs offline, and walks: source -> threat profile -> generated
// tests -> screening -> model roster -> running audit -> results matrix.
//
// Usage: node scripts/capture-pipeline-gif.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  seedFor,
  applySeed,
  goto,
  nav,
  startServer,
  stopServer,
  interceptGenerator,
  scrollTo,
  expandMain
} from './demo-lib.mjs';

const OUT = path.resolve(process.cwd(), 'docs', 'assets', 'img');
const FRAMES = path.resolve(process.cwd(), '.tmp', 'pipeline-frames');
const GIF = path.join(OUT, 'pipeline.gif');

mkdirSync(FRAMES, { recursive: true });

async function frame(page, label) {
  await page.waitForTimeout(700);
  const file = path.join(FRAMES, `${label}.png`);
  await page.screenshot({ path: file, animations: 'disabled' });
  console.log('frame', label);
}

const main = async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await applySeed(page, seedFor({ generator: true }));
    await interceptGenerator(page, 350);
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.split('\n')[0]));
    await goto(page);
    await page.waitForSelector('[data-tour="nav-tests"]', { timeout: 20000 });
    await page.waitForTimeout(500);

    // 1. Source: AI Test Generation pane with the fetched + assessed URL source.
    await nav(page, 'tests').click();
    await page.waitForTimeout(700);
    await scrollTo(page, '[data-tour="ai-gen-pane"]');
    await expandMain(page);
    await frame(page, '01-source');

    // 2. Threat profile: start the wizard and run analysis/generation.
    await scrollTo(page, '[data-tour="ai-generate"]');
    await page.locator('[data-tour="ai-generate"]').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Generate tests/ }).click();
    await page.waitForTimeout(1500);
    await expandMain(page);
    await frame(page, '02-threat-profiles');

    // 3. Generated tests + screening: the review screen after the pipeline.
    await page.waitForSelector('text=Select the ones you want to add', { timeout: 120000 });
    await page.waitForTimeout(800);
    await expandMain(page);
    await frame(page, '03-generated-tests');

    // Close the wizard modal so the sidebar is reachable again.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {
      page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const c = btns.find(b => b.textContent.trim() === 'Cancel');
        if (c) c.click();
      });
    });
    await page.waitForTimeout(600);

    // 4. Model roster: switch to the Auditor Runner with the lineup + payloads.
    console.log('step: nav runner');
    await nav(page, 'runner').click();
    await page.waitForTimeout(800);
    console.log('step: select preset');
    await page.selectOption('[data-tour="preset-select"]', 'default');
    await page.waitForTimeout(400);
    console.log('step: scroll run-audit');
    await scrollTo(page, '[data-tour="run-audit"]');
    await page.waitForTimeout(400);
    await frame(page, '04-model-roster');

    // 5. Running audit: fire every payload at every target, capture mid-run.
    console.log('step: run audit');
    await page.locator('[data-tour="run-audit"]').click({ force: true }).catch(async () => {
      await page.evaluate(() => {
        const b = document.querySelector('[data-tour="run-audit"]');
        if (b) b.click();
      });
    });
    await page.waitForTimeout(2500);
    await expandMain(page);
    await frame(page, '05-running-audit');

    // 6. Results: wait for the audit to finish, then capture the matrix.
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-tour="run-audit"]');
      return b && !b.disabled;
    }, null, { timeout: 240000 });
    await page.waitForTimeout(900);
    await page.locator('button:has-text("Succeeded Attack Payloads")').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await expandMain(page);
    await frame(page, '06-results');

    await ctx.close();
  } finally {
    await browser.close();
    stopServer(server);
  }

  // Stitch frames into a looping GIF (each frame held ~1.2s).
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', '1',
    '-pattern_type', 'glob',
    '-i', path.join(FRAMES, '*.png'),
    '-vf', "scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse",
    '-loop', '0',
    '-r', '1',
    GIF
  ]);
  console.log('GIF written to', GIF);
};

main().catch((err) => {
  console.error('GIF capture failed:', err.message);
  process.exit(1);
});
