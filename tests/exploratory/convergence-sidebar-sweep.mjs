// Convergence sweep — sidebar chrome + notification bell discoveries.
// Test-only; per-probe records.
import { chromium } from 'playwright';
import { installMockProvider } from './mock-provider-route.mjs';

const base = process.env.EXPLORATORY_BASE_URL || 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12000);
const B = (name) => page.getByRole('button', { name, exact: true });
const text = () => page.locator('body').innerText();
await installMockProvider(page);
const covered = [];
const findings = [];
const pageerrors = [];
page.on('pageerror', (e) => pageerrors.push(e.message));
const record = (id, d) => covered.push(`${id}: ${d}`);
const probe = async (id, desc, fn) => {
  try {
    await fn();
    record(id, `${desc}: OK`);
  } catch (e) {
    record(id, `${desc}: FAILED-HARNESS ${e.message.split('\n')[0].slice(0, 120)}`);
  }
};

try {
  await page.goto(base);
  await B('✕').click();

  await probe('NAV', 'collapse sidebar hides nav labels; expand restores', async () => {
    await B('Collapse sidebar').click();
    const collapsed = await text();
    if (!/Dashboard/.test(collapsed)) throw new Error('nav text gone entirely (expected labels hidden?)');
    const expandBtn = page.getByRole('button', { name: /Expand sidebar/i }).first();
    if (await expandBtn.count()) await expandBtn.click();
    else await B('Collapse sidebar').click();
    if (!(await B('Test Management').isVisible())) throw new Error('nav not restored');
  });
  await probe('NAV', 'sidebar collapse persists reload', async () => {
    await B('Collapse sidebar').click();
    await page.reload();
    const state = await B('Test Management').isVisible().catch(() => false);
    record('NAV', `after reload nav visible=${state}`);
    const expandBtn = page.getByRole('button', { name: /Expand sidebar/i }).first();
    if (await expandBtn.count()) await expandBtn.click();
    else {
      const collapsed = !(await B('Test Management').isVisible().catch(() => true));
      if (collapsed) await B('Collapse sidebar').click();
    }
  });
  for (const section of ['Dashboard', 'ATLAS Matrix', 'Test Management', 'Auditor Runner', 'AI Prompts', 'Settings']) {
    await probe('NAV', `section toggle ${section}`, async () => {
      const t = page.getByRole('button', { name: `Show ${section} sections`, exact: true });
      if (!(await t.count())) throw new Error('toggle absent');
      await t.click();
      await page.waitForTimeout(300);
      await t.click().catch(() => {});
    });
  }
  await probe('NAV', 'notification bell empty → toast → clear', async () => {
    await B('AI Prompts').click();
    await B('Reset to default').first().click();
    await page.waitForTimeout(500);
    const bell = page.locator('button[title*="otification"], button[aria-label*="otification"]').first();
    const bellByText = B('Clear notification history');
    if (await bell.count()) await bell.click();
    else if (await bellByText.count()) await bellByText.click();
    else throw new Error('no bell control found');
    await page.waitForTimeout(400);
    const panel = await text();
    if (!/Prompt reset to default|notification/i.test(panel)) throw new Error('notification not shown');
    if (await B('Clear notification history').count()) {
      await B('Clear notification history').click();
      await page.waitForTimeout(300);
    }
  });

  console.log(JSON.stringify({ covered, findings, pageerrors }, null, 2));
} finally {
  await browser.close();
}
