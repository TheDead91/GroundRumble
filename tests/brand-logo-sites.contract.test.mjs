// Structural pins: the brand-logo component lives in EXACTLY ONE shared
// module, src/components/GroundRumbleLogo.jsx, and both consumers re-point
// to it via imports.
//
// Source-text level (Node cannot import JSX), mirroring the conventions of
// tests/provider-policy.contract.test.mjs. Rendered-output equivalence is
// pinned continuously by tests/exploratory/brand-logo-probe.mjs and
// tests/brand-logo.contract.test.mjs (both layout-agnostic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULE_PATH = 'src/components/GroundRumbleLogo.jsx';
const APP_PATH = 'src/App.jsx';
const SIDEBAR_PATH = 'src/components/Sidebar.jsx';
// The first-run onboarding wizard (the logo's other App.jsx consumer) lives in
// this file.
const ONBOARDING_MODAL_PATH = 'src/components/modals/OnboardingModal.jsx';

// The mandated file content, byte-pinned (LF endings, single trailing
// newline). Any re-indentation, re-quoting or attribute drift fails here.
const EXPECTED_MODULE = [
"import { useId } from 'react';",
"",
"/**",
" * Brand logo: a shield marking LLM security with a signal pulse line.",
" * Filled with the tool's primary→secondary gradient and the primary glow.",
" */",
"export const GroundRumbleLogo = ({ size = 40 }) => {",
"  const gradId = useId();",
"  return (",
"    <svg",
"      width={size}",
"      height={size}",
"      viewBox=\"0 0 48 48\"",
"      fill=\"none\"",
"      xmlns=\"http://www.w3.org/2000/svg\"",
"      style={{ display: 'block', filter: 'drop-shadow(0 0 10px var(--color-primary-glow))' }}",
"      role=\"img\"",
"      aria-label=\"GroundRumble logo\"",
"    >",
"      <defs>",
"        <linearGradient id={gradId} x1=\"8\" y1=\"3\" x2=\"41\" y2=\"45\" gradientUnits=\"userSpaceOnUse\">",
"          <stop stopColor=\"hsl(210, 100%, 55%)\" />",
"          <stop offset=\"1\" stopColor=\"hsl(280, 85%, 65%)\" />",
"        </linearGradient>",
"      </defs>",
"      {/* Shield outline */}",
"      <path",
"        d=\"M24 3.5 40 9.2v14.7c0 9.8-6.5 17.2-16 20.3C14.5 41.1 8 33.7 8 23.9V9.2L24 3.5Z\"",
"        fill={`url(#${gradId})`}",
"      />",
"      {/* Shield inner highlight */}",
"      <path",
"        d=\"M24 7.2 36.5 11.6v12.4c0 7.6-5 13.6-12.5 16.3C16.5 37.6 11.5 31.6 11.5 24V11.6L24 7.2Z\"",
"        fill=\"rgba(255,255,255,0.08)\"",
"      />",
"      {/* Signal pulse line */}",
"      <path",
"        d=\"M12 25.5h6.2l3-6.8 3.6 12 3.2-5.2H36\"",
"        stroke=\"#fff\"",
"        strokeWidth=\"2.6\"",
"        strokeLinecap=\"round\"",
"        strokeLinejoin=\"round\"",
"      />",
"      {/* LLM node */}",
"      <circle cx=\"37.5\" cy=\"10.5\" r=\"2.2\" fill=\"#fff\" />",
"      <circle cx=\"37.5\" cy=\"10.5\" r=\"4.6\" stroke=\"rgba(255,255,255,0.5)\" strokeWidth=\"1.4\" />",
"    </svg>",
"  );",
"};",
].join('\n') + '\n';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(entry.name)) yield p;
  }
}

test('The shared logo module exists with the mandated verbatim content', () => {
  assert.equal(sourceOf(MODULE_PATH), EXPECTED_MODULE, MODULE_PATH + ' must match R1.1 byte-for-byte (LF, one trailing newline)');
});

test('Exactly one definition site remains across src/, inside the shared module', () => {
  const definitionRe = /^[ \t]*(?:export )?const GroundRumbleLogo[ \t]*=/gm;
  const hits = [];
  for (const file of walk(join(root, 'src'))) {
    const count = (readFileSync(file, 'utf8').match(definitionRe) ?? []).length;
    if (count > 0) hits.push({ path: relative(root, file), count });
  }
  assert.deepEqual(hits, [{ path: MODULE_PATH, count: 1 }], 'GroundRumbleLogo must be defined exactly once, in the shared module');
});

test('Neither consumer keeps a useId binding after the relocation', () => {
  for (const relPath of [APP_PATH, SIDEBAR_PATH]) {
    const hits = sourceOf(relPath).match(/\buseId\b/g) ?? [];
    assert.deepEqual(hits, [], relPath + ' must carry zero useId references anymore');
  }
});

test("App.jsx drops its local copy and sources the shared module right after Tour (T05 seam: or the extracted onboarding modal does)", () => {
  const lines = sourceOf(APP_PATH).replace(/\r\n/g, '\n').split('\n');
  assert.equal(
    lines.filter((l) => /^[ \t]*(?:export )?const GroundRumbleLogo[ \t]*=/.test(l)).length,
    0,
    'no local logo copy may remain in App.jsx'
  );
  // The logo's only App.jsx consumer is the first-run onboarding JSX, which
  // lives in src/components/modals/OnboardingModal.jsx. The shared-module
  // sourcing pins resolve over the App ∪ onboarding-modal file set: App
  // imports the module right after the Tour import, or the onboarding modal
  // imports it sibling-relatively and App's './components/*' group closes
  // with the Tour import. Identical guarantee on both sides.
  const onboardingModal = existsSync(join(root, ONBOARDING_MODAL_PATH))
    ? sourceOf(ONBOARDING_MODAL_PATH).replace(/\r\n/g, '\n')
    : '';
  const appReferrals = lines.filter((l) => l.includes("'./components/GroundRumbleLogo'")).length;
  const modalReferrals = onboardingModal.split('\n').filter((l) => l.includes("'../GroundRumbleLogo'")).length;
  assert.equal(
    appReferrals + modalReferrals,
    1,
    "exactly one file in the App ∪ OnboardingModal set references the shared module in exactly one import"
  );
  if (appReferrals === 1) {
    const tourIdx = lines.findIndex((l) => l.includes("'./components/Tour'"));
    assert.ok(tourIdx !== -1, "the './components/Tour' import anchor stays put");
    assert.equal(
      lines[tourIdx + 1],
      "import { GroundRumbleLogo } from './components/GroundRumbleLogo';",
      "exactly one import line sits IMMEDIATELY after the Tour import, keeping the './components/*' group contiguous"
    );
  } else {
    assert.ok(
      onboardingModal.split('\n').some((l) => l === "import { GroundRumbleLogo } from '../GroundRumbleLogo';"),
      'the extracted onboarding modal sources the shared logo module sibling-relatively'
    );
  }
});

test("App.jsx sheds the unused useId binding from its react import", () => {
  assert.match(
    sourceOf(APP_PATH),
    /^import React, \{ useState, useEffect, useRef, useCallback \} from 'react';$/m,
    'the react import keeps its other bindings but drops useId'
  );
});

test('DEMO_TARGETS closes with exactly one blank line before the App() declaration', () => {
  const app = sourceOf(APP_PATH).replace(/\r\n/g, '\n');
  assert.equal(
    app.match(/\n\];\n\nexport default function App\(\) \{/)?.length,
    1,
    "exactly one blank line separates DEMO_TARGETS's closing bracket from the App() declaration"
  );
});

test("Sidebar.jsx drops its local copy and keeps exactly one blank line above the NAV_ITEMS seam", () => {
  const lines = sourceOf(SIDEBAR_PATH).replace(/\r\n/g, '\n').split('\n');
  assert.equal(
    lines.filter((l) => /^[ \t]*(?:export )?const GroundRumbleLogo[ \t]*=/.test(l)).length,
    0,
    'no local logo copy may remain in Sidebar.jsx'
  );
  const navCommentIdx = lines.findIndex((l) => l === '// Sidebar navigation items (icon + label)');
  assert.ok(navCommentIdx > 0, 'the NAV_ITEMS comment seam stays put');
  assert.equal(lines[navCommentIdx - 1], '', 'exactly one blank line precedes the NAV_ITEMS comment');
  assert.match(
    lines[navCommentIdx - 2],
    /^import\b/,
    'the blank line still directly follows an import'
  );
  assert.doesNotMatch(sourceOf(SIDEBAR_PATH), /\/\*\*\n \* Brand logo:/, 'the JSDoc-branded copy is gone, not commented out');
});

test("Sidebar.jsx sources the sibling module beside ProvidersContext and sheds useId from its react import", () => {
  const lines = sourceOf(SIDEBAR_PATH).replace(/\r\n/g, '\n').split('\n');
  assert.equal(lines[0], "import React from 'react';", "Sidebar's react import shrinks to the default binding");
  const ctxIdx = lines.findIndex((l) => l.includes("'../context/ProvidersContext'"));
  assert.ok(ctxIdx !== -1, "the '../context/ProvidersContext' import anchor stays put");
  assert.equal(
    lines[ctxIdx + 1],
    "import { GroundRumbleLogo } from './GroundRumbleLogo';",
    'exactly one sibling-module import sits IMMEDIATELY after the providers-context import'
  );
  assert.equal(
    lines.filter((l) => l.includes("'./GroundRumbleLogo'")).length,
    1,
    "Sidebar references the shared module in exactly one import"
  );
});
