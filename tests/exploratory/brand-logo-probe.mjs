// Browser-level probe for the GroundRumble brand logo. Layout-agnostic by
// design: wherever the component is defined in src/, the served module must
// export GroundRumbleLogo with the pinned svg body, and a first-run boot must
// mount TWO instances at once — Sidebar's size-40 brand mark plus App's
// size-44 onboarding hero — each with its OWN gradient id from useId(),
// painting its shield with it, keeping the pinned geometry, gradient stops,
// accessible name and glow filter.
//
// NB: Vite's SPA fallback answers missing paths with HTTP 200 text/html, so
// the module-phase gate checks the JavaScript content-type, not just status.
//
// Usage: TEST_URL=http://localhost:5173/ node tests/exploratory/brand-logo-probe.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const testUrl = process.env.TEST_URL || 'http://localhost:5173/';

const ATLAS_MINIMAL_YAML = [
  'format-version: 2026.01',
  'tactics:',
  '  AML.TA0001: { name: "Execution", description: "d" }',
  'techniques:',
  '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
  'relationships: {}',
  'mitigations: {}'
].join('\n');

// --- Phase 1: module phase, vacuous until the shared module is served -------
const moduleUrl = new URL('src/components/GroundRumbleLogo.jsx', testUrl).href;
const moduleRes = await fetch(moduleUrl);
const moduleType = moduleRes.headers.get('content-type') || '';
if (moduleRes.status === 200 && moduleType.includes('javascript')) {
  const moduleJs = await moduleRes.text();
  assert.match(moduleJs, /export\s+const\s+GroundRumbleLogo\b/, 'the served logo module must export GroundRumbleLogo');
  assert.match(moduleJs, /["']?aria-label["']?\s*[:=]\s*["']GroundRumble logo["']/, 'the served module keeps the accessible name');
  assert.match(moduleJs, /["']?viewBox["']?\s*[:=]\s*["']0 0 48 48["']/, 'the served module keeps the pinned viewBox');
} else {
  console.log(
    `[brand-logo-probe] ${moduleUrl} -> HTTP ${moduleRes.status} (${moduleType || 'no content-type'}); ` +
    'module-phase assertions are vacuous until src/components/GroundRumbleLogo.jsx exists.'
  );
}

// Both eras must transform both consumer modules cleanly.
for (const consumerPath of ['src/App.jsx', 'src/components/Sidebar.jsx']) {
  const res = await fetch(new URL(consumerPath, testUrl).href);
  assert.equal(res.status, 200, `/src/${consumerPath.replace(/^src\//, '')} must transform cleanly`);
}

// --- Phase 2: render phase — two live instances, per-instance gradients -----
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error));

  // Hermetic session: stub the MITRE ATLAS sync so startup never hits GitHub.
  await page.route(/raw\.githubusercontent\.com\/mitre-atlas\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/x-yaml', body: ATLAS_MINIMAL_YAML });
  });

  // A fresh context has no atlas_onboarding_done flag, so App's first-run
  // onboarding opens on top of the app shell -> BOTH logo instances mount.
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#root *').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('svg[aria-label="GroundRumble logo"]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(500);

  const audit = await page.evaluate(() => {
    return [...document.querySelectorAll('svg[aria-label="GroundRumble logo"]')].map(svg => ({
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      role: svg.getAttribute('role'),
      viewBox: svg.getAttribute('viewBox'),
      fillNone: svg.getAttribute('fill'),
      filterStyle: svg.style.filter,
      gradIds: [...svg.querySelectorAll('linearGradient')].map(g => g.getAttribute('id')),
      firstPathFill: svg.querySelector('path')?.getAttribute('fill') ?? null,
      stops: [...svg.querySelectorAll('stop')].map(s => s.getAttribute('stop-color'))
    }));
  });

  assert.equal(pageErrors.length, 0, pageErrors.map(error => error.message).join('\n'));
  assert.equal(audit.length, 2, 'a first-run boot must mount exactly two logo instances (sidebar + onboarding)');

  for (const [i, svg] of audit.entries()) {
    assert.equal(svg.role, 'img', `instance ${i}: role=img is kept`);
    assert.equal(svg.viewBox, '0 0 48 48', `instance ${i}: viewBox is kept`);
    assert.equal(svg.fillNone, 'none', `instance ${i}: svg fill=none is kept`);
    assert.equal(
      svg.filterStyle,
      'drop-shadow(0 0 10px var(--color-primary-glow))',
      `instance ${i}: the primary-glow drop-shadow is kept`
    );
    assert.deepEqual(svg.stops, ['hsl(210, 100%, 55%)', 'hsl(280, 85%, 65%)'], `instance ${i}: gradient stops are kept`);
  }

  const sizes = audit.map(svg => `${svg.width}x${svg.height}`).sort();
  assert.deepEqual(sizes, ['40x40', '44x44'], 'the sidebar renders size 40 and the onboarding hero size 44');

  const allGradIds = audit.flatMap(svg => svg.gradIds);
  assert.equal(audit.every(svg => svg.gradIds.length === 1), true, 'each instance owns exactly one linearGradient');
  assert.equal(new Set(allGradIds).size, allGradIds.length, 'useId() must give every mounted instance a DISTINCT gradient id');
  for (const [i, svg] of audit.entries()) {
    assert.equal(
      svg.firstPathFill,
      `url(#${svg.gradIds[0]})`,
      `instance ${i}: the shield path must be painted with its own per-instance gradient`
    );
  }

  console.log('[brand-logo-probe] all phases passed.');
} finally {
  await browser.close();
}
