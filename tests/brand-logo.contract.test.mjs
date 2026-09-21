// Characterization pins for the GroundRumble brand-logo component.
//
// Deliberately layout-agnostic: wherever the component is defined in src/,
// every definition site must carry ONE canonical JSX body, each instance must
// derive a per-instance gradient id via useId(), and both mount points keep
// their pinned sizes. Single- versus multi-site ownership is pinned by the
// companion tests/brand-logo-sites.contract.test.mjs suite.
//
// Source-text level (Node cannot import JSX), mirroring the conventions of
// tests/provider-policy.contract.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The canonical arrow-function body, byte-pinned. Leading file comments are not
// part of this pin; everything from `const` to the closing `};` is.
const CANONICAL_BODY = [
  'const GroundRumbleLogo = ({ size = 40 }) => {',
  '  const gradId = useId();',
  '  return (',
  '    <svg',
  '      width={size}',
  '      height={size}',
  '      viewBox="0 0 48 48"',
  '      fill="none"',
  '      xmlns="http://www.w3.org/2000/svg"',
  "      style={{ display: 'block', filter: 'drop-shadow(0 0 10px var(--color-primary-glow))' }}",
  '      role="img"',
  '      aria-label="GroundRumble logo"',
  '    >',
  '      <defs>',
  '        <linearGradient id={gradId} x1="8" y1="3" x2="41" y2="45" gradientUnits="userSpaceOnUse">',
  '          <stop stopColor="hsl(210, 100%, 55%)" />',
  '          <stop offset="1" stopColor="hsl(280, 85%, 65%)" />',
  '        </linearGradient>',
  '      </defs>',
  '      {/* Shield outline */}',
  '      <path',
  '        d="M24 3.5 40 9.2v14.7c0 9.8-6.5 17.2-16 20.3C14.5 41.1 8 33.7 8 23.9V9.2L24 3.5Z"',
  '        fill={`url(#${gradId})`}',
  '      />',
  '      {/* Shield inner highlight */}',
  '      <path',
  '        d="M24 7.2 36.5 11.6v12.4c0 7.6-5 13.6-12.5 16.3C16.5 37.6 11.5 31.6 11.5 24V11.6L24 7.2Z"',
  '        fill="rgba(255,255,255,0.08)"',
  '      />',
  '      {/* Signal pulse line */}',
  '      <path',
  '        d="M12 25.5h6.2l3-6.8 3.6 12 3.2-5.2H36"',
  '        stroke="#fff"',
  '        strokeWidth="2.6"',
  '        strokeLinecap="round"',
  '        strokeLinejoin="round"',
  '      />',
  '      {/* LLM node */}',
  '      <circle cx="37.5" cy="10.5" r="2.2" fill="#fff" />',
  '      <circle cx="37.5" cy="10.5" r="4.6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />',
  '    </svg>',
  '  );',
  '};'
].join('\n');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.jsx?$/.test(entry.name)) yield p;
  }
}

const definitionRe = /^[ \t]*(?:export )?const GroundRumbleLogo = \(\{ size = 40 \}\) => \{/gm;

const sites = [];
for (const file of walk(join(root, 'src'))) {
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(definitionRe)) {
    const end = source.indexOf('\n};', m.index);
    assert.ok(end !== -1, `${relative(root, file)}: GroundRumbleLogo definition has no closing "\\n};"`);
    // Strip an optional `export ` prefix so module-local copies and the shared
    // module's named export compare equal against CANONICAL_BODY.
    const body = source.slice(m.index, end + 3).replace(/^export /, '');
    sites.push({ path: relative(root, file), body });
  }
}

test('every GroundRumbleLogo definition site carries one canonical, byte-pinned JSX body', () => {
  assert.ok(sites.length >= 1, 'GroundRumbleLogo must be defined somewhere under src/');
  for (const site of sites) {
    assert.equal(site.body, CANONICAL_BODY, `${site.path} must carry the canonical logo body verbatim`);
  }
});

test('the canonical body keeps its accessible identity, geometry and glow', () => {
  assert.match(CANONICAL_BODY, /role="img"/, 'the logo announces itself as an image');
  assert.match(CANONICAL_BODY, /aria-label="GroundRumble logo"/, 'accessible name is pinned');
  assert.match(CANONICAL_BODY, /viewBox="0 0 48 48"/, 'geometry viewport is pinned');
  assert.match(
    CANONICAL_BODY,
    /filter: 'drop-shadow\(0 0 10px var\(--color-primary-glow\)\)'/,
    'the primary-glow drop shadow is pinned'
  );
  assert.deepEqual(
    CANONICAL_BODY.match(/stopColor="[^"]+"/g),
    ['stopColor="hsl(210, 100%, 55%)"', 'stopColor="hsl(280, 85%, 65%)"'],
    'both gradient stops are pinned'
  );
});

test('each instance derives a per-instance gradient id via useId and paints the shield with it', () => {
  assert.match(CANONICAL_BODY, /const gradId = useId\(\);/, 'useId is called inside the component');
  assert.match(CANONICAL_BODY, /fill=\{`url\(#\$\{gradId\}\)`\}/, 'the shield fill references the per-instance id');
});

test('both mount points keep their pinned sizes exactly once', () => {
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  const sidebar = readFileSync(join(root, 'src/components/Sidebar.jsx'), 'utf8');
  // The size-44 mount may live in src/components/modals/OnboardingModal.jsx
  // (the first-run onboarding wizard), so the size-44 pin resolves over the
  // App ∪ onboarding-modal file set (identical guarantee on both sides).
  const onboardingPath = join(root, 'src/components/modals/OnboardingModal.jsx');
  const onboardingModal = existsSync(onboardingPath) ? readFileSync(onboardingPath, 'utf8') : '';
  assert.equal((app + '\n' + onboardingModal).match(/<GroundRumbleLogo size=\{44\} \/>/g)?.length, 1, 'App.jsx ∪ OnboardingModal.jsx renders the logo at size 44 exactly once (T05 seam: the mount lives module-side post-T05)');
  assert.equal(sidebar.match(/<GroundRumbleLogo size=\{40\} \/>/g)?.length, 1, 'Sidebar renders the logo at size 40 exactly once');
});
