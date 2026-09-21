// Contract: the TOUR_STEPS build — the buildTourSteps({...}) invocation in
// App's function body — is a single useMemo keyed by exactly the factory input
// set, so <Tour>'s steps prop identity is stable across unrelated re-renders
// (toasts, confirms, run-state flips routed through UIContext/AuditContext)
// instead of being rebuilt (19-element array + closures) on every single App
// render.
//
// Levels (same mixed technique as tests/custom-test-form-modal.contract.test.mjs):
// - source-text pins: the useMemo adoption wraps buildTourSteps and its dep
//   array is EXACTLY the eleven names the factory reads (set equality — no
//   missing dep, no speculative extra); App holds exactly ONE useMemo (no
//   speculative memoization beyond this measured site) and the two inline
//   chip mounts stay byte-exact (no chip speculation); the <Tour> mount keeps
//   consuming TOUR_STEPS.
// - rolldown/jsdom runtime: the REAL App is bundled (aliased './utils/
//   tour-steps' counting shim) and mounted inside the real provider stack:
//   two UNRELATED addToast re-renders reproduce ZERO additional
//   buildTourSteps invocations, the computed steps array identity is
//   preserved across them (Object.is), its content is still the
//   byte-compatible 19-step tour, the runtime deps are still exactly the
//   factory's input set, and the initial data-tour anchor surface is
//   unchanged.
//
// Hermetic: bare node:test, no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();
installFakeIndexedDB();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8').replace(/\r\n/g, '\n');

const countIn = (source, needle) => source.split(needle).length - 1;

const DEP_NAMES = [
  'setActiveTab', 'selectedTechniqueRef', 'targets', 'presets',
  'DEFAULT_PRESET_ID', 'allTests', 'selectedTests', 'running',
  'results', 'expandedCell', 'useDemoMode'
];

const EXPECTED_TARGETS = [
  '[data-tour="nav-settings"]',
  '[data-tour="credentials-panel"]',
  '[data-tour="judge-config"]',
  '[data-tour="nav-matrix"]',
  '[data-tour="matrix-grid"]',
  '[data-tour="technique-detail"]',
  '[data-tour="nav-tests"]',
  '[data-tour="ai-generate"]',
  '[data-tour="add-target"]',
  '[data-tour="preset-select"]',
  '[data-tour="run-audit"]',
  '[data-tour="show-console"]',
  '[data-tour="results-table"]',
  '[data-tour="expanded-result"]',
  '[data-tour="nav-dashboard"]',
  '[data-tour="dash-overall"]',
  '[data-tour="resilience-by-model"]',
  '[data-tour="audit-history"]',
  '[data-tour="sandbox-config"]'
];

// Exact chip-mount JSX (from tests/model-selector.contract): the inline mounts
// must not be memoized — they stay byte-exact.
const CHIP_MOUNT = [
  'renderActiveModelChip={(label, cfg) => (',
  '<ActiveModelChip label={label} cfg={cfg} providerLabel={providerLabel} />'
];

// ---------------------------------------------------------------------------
// Source pins: the memo adoption, exactly once, exactly these deps.
// ---------------------------------------------------------------------------

test('TOUR_STEPS becomes a useMemo around the exact same buildTourSteps call', () => {
  assert.match(
    app,
    /const TOUR_STEPS = useMemo\(\s*\(\) => buildTourSteps\(\{/,
    'the TOUR_STEPS binding is now a useMemo whose factory computes via buildTourSteps({...})'
  );
  assert.match(app, /import\s*\{[^}]*buildTourSteps[^}]*\}\s*from\s*'\.\/utils\/tour-steps(\.js)?';/, 'App still imports the factory from ./utils/tour-steps');
  assert.match(app, /<Tour steps=\{TOUR_STEPS\}/, 'the <Tour> mount keeps consuming TOUR_STEPS (wiring unchanged)');
});

test('The useMemo dep array is EXACTLY the factory input set (set equality, eleven names)', () => {
  const match = /const TOUR_STEPS = useMemo\(\s*\(\) => buildTourSteps\(\{([\s\S]*?)\}\)\s*,\s*\[([^\]]*)\]\s*\)/.exec(app);
  assert.ok(match, 'the memo carries a dep array after the deps-object call');
  const [depsBody, depArray] = match;
  for (const name of DEP_NAMES) {
    assert.ok(depsBody.includes(name), `the memoized factory call still passes ${name}`);
  }
  const declared = depArray.split(',').map((s) => s.trim()).filter(Boolean).sort();
  assert.deepEqual(declared, [...DEP_NAMES].sort(),
    `the dep array declares exactly the eleven factory inputs in some order; got [${declared.join(', ')}]`);
});

test('No speculative memoization — App gains exactly this ONE useMemo', () => {
  assert.equal(countIn(app, 'useMemo('), 1, `the measured site is the only memoization in App.jsx; found ${countIn(app, 'useMemo(')} useMemo usages`);
});

test('The two inline chip mounts stay verbatim (no speculative chip memoization either)', () => {
  assert.equal(countIn(app, CHIP_MOUNT[0]), 2, 'both renderActiveModelChip inline mounts (TestsView + RunnerView) stay unwrapped');
  assert.equal(countIn(app, CHIP_MOUNT[1]), 2, 'both chip mounts still render <ActiveModelChip label={label} cfg={cfg} providerLabel={providerLabel} />');
});

// ---------------------------------------------------------------------------
// Runtime: the measured after-count — zero rebuilds on unrelated re-renders.
// ---------------------------------------------------------------------------

let appBundle = null;
let bundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 'tour-steps-memo-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const SHIM = join(dir, 'tour-steps-shim.mjs');
  writeFileSync(SHIM, [
    `import { buildTourSteps as rawFactory } from '${abs('src/utils/tour-steps.js')}';`,
    'export function buildTourSteps(deps) {',
    '  const g = (globalThis.__tourStepsMemo = globalThis.__tourStepsMemo || { builds: 0, last: null, lastDeps: null });',
    '  g.builds += 1;',
    '  g.lastDeps = Object.keys(deps || {}).sort();',
    '  const steps = rawFactory(deps);',
    '  g.last = steps;',
    '  return steps;',
    '}',
    ''
  ].join('\n'));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { UIProvider } from '${abs('src/context/UIContext.jsx')}';`,
    `export { useUI } from '${abs('src/context/useUI.js')}';`,
    `export { ProvidersProvider } from '${abs('src/context/ProvidersContext.jsx')}';`,
    `export { TestsProvider } from '${abs('src/context/TestsContext.jsx')}';`,
    `export { HistoryProvider } from '${abs('src/context/HistoryContext.jsx')}';`,
    `export { AuditProvider } from '${abs('src/context/AuditContext.jsx')}';`,
    `export { AIGenProvider } from '${abs('src/context/AIGenContext.jsx')}';`,
    `export { SettingsProvider } from '${abs('src/context/SettingsContext.jsx')}';`,
    `import * as appNs from '${abs('src/App.jsx')}';`,
    'export { appNs };'
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'], alias: { './utils/tour-steps': pathToFileURL(SHIM).href } },
    moduleTypes: { '.jsx': 'jsx', '.css': 'empty' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'app-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  appBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  bundleError = err;
}

// Real App + provider stack + counting shim, then two UNRELATED addToast
// re-renders.
const mountAppAndToastTwice = async () => {
  assert.ok(!bundleError, `the App bundle must build under rolldown: ${bundleError?.stack || bundleError}`);
  const { JSDOM } = await import('jsdom');
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Node', 'Element', 'getComputedStyle', 'customElements', 'Event']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.Element.prototype.scrollIntoView = () => {};

  const { UIProvider, ProvidersProvider, TestsProvider, HistoryProvider, AuditProvider, AIGenProvider, SettingsProvider, appNs, useUI } = appBundle;
  const App = appNs.default ?? appNs.App;
  const sink = { toast: null };
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    const ui = useUI();
    sink.toast = ui.addToast;
    return null;
  }
  /* oxlint-enable react/immutability */

  let mountRoot;
  await act(async () => {
    mountRoot = createRoot(document.getElementById('root'));
    mountRoot.render(
      React.createElement(UIProvider, null,
        React.createElement(ProvidersProvider, null,
          React.createElement(TestsProvider, null,
            React.createElement(HistoryProvider, null,
              React.createElement(AuditProvider, null,
                React.createElement(AIGenProvider, null,
                  React.createElement(SettingsProvider, null,
                    React.createElement(App),
                    React.createElement(Probe)
                  )
                )
              )
            )
          )
        )
      )
    );
    await new Promise((r) => setTimeout(r, 300));
  });
  const cleanup = async () => {
    // Unmount inside act so pending toast/ATLAS timers settle on an unmounted
    // tree (no outside-act update). Globals are intentionally left for the
    // next mount in this file: restoring them here would break still-pending
    // provider-hydration continuations that reference window.
    await act(async () => { mountRoot.unmount(); });
    try { dom.window.close(); } catch { /* jsdom window cleanup is best-effort */ }
  };
  return { sink, act, dom, globe: globalThis.__tourStepsMemo, cleanup, mountRoot };
};

test('Zero buildTourSteps invocations across UNRELATED re-renders; steps identity stable', async () => {
  const { sink, act, globe, cleanup } = await mountAppAndToastTwice();
  try {
    assert.equal(typeof sink.toast, 'function', 'the App tree exposes addToast for the unrelated re-render');
    assert.ok(globe.last, 'the memo computed the steps array on first render');
    const identityBefore = globe.last;
    const before = globe.builds;
    await act(async () => { sink.toast('unrelated toast 1'); await new Promise((r) => setTimeout(r, 150)); });
    await act(async () => { sink.toast('unrelated toast 2'); await new Promise((r) => setTimeout(r, 150)); });
    assert.equal(globe.builds - before, 0,
      `two UNRELATED addToast re-renders must trigger ZERO additional buildTourSteps invocations; measured delta: ${globe.builds - before}`);
    assert.ok(Object.is(identityBefore, globe.last), 'the steps array identity is stable (the SAME object feeds <Tour> across unrelated re-renders)');
  } finally {
    await cleanup();
  }
});

test('Tour behavior and DOM surface unchanged — same 19 steps, same anchors', async () => {
  const { globe, cleanup } = await mountAppAndToastTwice();
  try {
    assert.equal(globe.last.length, 19, '19 steps');
    assert.deepEqual(globe.last.map((s) => s.target), EXPECTED_TARGETS, 'the tour target sequence is byte-identical to baseline');
    if (globe.lastDeps) {
      assert.deepEqual(globe.lastDeps, [...DEP_NAMES].sort(), 'the runtime deps stay exactly the factory input set');
    }
    const anchors = [...document.querySelectorAll('[data-tour]')].map((n) => n.getAttribute('data-tour'));
    assert.deepEqual(anchors, [
      'nav-dashboard', 'nav-matrix', 'nav-tests', 'nav-runner', 'nav-prompts', 'nav-settings',
      'dash-overall', 'resilience-by-model', 'audit-history'
    ], 'the 9 data-tour anchors at first paint are unchanged (no DOM change)');
  } finally {
    await cleanup();
  }
});
