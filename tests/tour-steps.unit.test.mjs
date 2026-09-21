// Contract: src/utils/tour-steps.js (TARGET_PATH) owns the
// guided-tour step definitions — the 19-step array — behind the pure factory
// buildTourSteps(deps).
//
// Byte-compatible step array: same order, data-tour targets, titles, bodies,
// onEnter tab switches, waitFor closures and autoAdvance flags.
// Deps object: every App-state closure — selectedTechniqueRef, targets,
// presets/DEFAULT_PRESET_ID/allTests/selectedTests, running, results,
// expandedCell, useDemoMode, setActiveTab — arrives via the single deps
// parameter; the module imports NOTHING (no React, no contexts, no DOM) and
// is node-testable under bare node:test (this file imports it directly).
// Structural parity (count/order/targets/arity) + copy snapshot for the
// settings / matrix / runner steps.
// App.jsx adopts through buildTourSteps({ … }) and sheds the array
// (net-smaller); the companion pins in
// tests/matrix-view.contract.test.mjs stay green on both sides.
//
// Standalone hermetic run: node --test tests/tour-steps.unit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTourSteps } from '../src/utils/tour-steps.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const moduleSrc = readFileSync(join(root, 'src/utils/tour-steps.js'), 'utf8').replace(/\r\n/g, '\n');
let app = '';
try {
  app = readFileSync(join(root, 'src/App.jsx'), 'utf8').replace(/\r\n/g, '\n');
} catch { /* App.jsx pins fail their own assertions */ }

const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const countIn = (source, needle) => source.split(needle).length - 1;

const DEP_NAMES = [
  'setActiveTab', 'selectedTechniqueRef', 'targets', 'presets',
  'DEFAULT_PRESET_ID', 'allTests', 'selectedTests', 'running',
  'results', 'expandedCell', 'useDemoMode'
];

// Deterministic deps fixtures -------------------------------------------------

const makeDeps = (overrides = {}) => ({
  setActiveTab: () => {},
  selectedTechniqueRef: { current: null },
  targets: [{ uid: 'p1::m1', provider: 'p1', model: 'm1' }],
  presets: [],
  DEFAULT_PRESET_ID: 'default',
  allTests: [],
  selectedTests: [],
  running: false,
  results: [],
  expandedCell: null,
  useDemoMode: true,
  ...overrides
});

const withTabSpy = (overrides = {}) => {
  const tabs = [];
  return { tabs, deps: makeDeps({ setActiveTab: (tab) => tabs.push(tab), ...overrides }) };
};

const EXPECTED_ON_ENTER = {
  0: 'settings',
  3: 'matrix',
  4: 'matrix',
  6: 'tests',
  8: 'runner',
  14: 'dashboard',
  18: 'settings'
};

const EXPECTED_AUTO_ADVANCE = [4, 8, 9, 10, 11, 12];
const EXPECTED_WAIT_FOR = [4, 8, 9, 10, 11, 12, 18];

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

const EXPECTED_TITLES = [
  'Settings',
  'Providers',
  'AI Judge Model',
  'MITRE ATLAS Matrix',
  'Explore a technique',
  'Technique details & mapped prompts',
  'Test Management',
  'AI test generation',
  'Model Comparison Lineup',
  'Attack Payloads Selection',
  'Run Comparison Audit',
  'Show Console',
  'Comparison Results',
  'The executed test in detail',
  'Dashboard',
  'Overall results',
  'Resilience Score by Model',
  'Audit Logs History',
  'Disable the sandbox'
];

// the module is a pure, import-free, node-testable factory ---------------------

test('Src/utils/tour-steps.js exists as a pure factory module (named export, zero imports)', () => {
  assert.match(moduleSrc, /export\s+function\s+buildTourSteps\s*\(/, 'the module exports buildTourSteps as a function');
  assert.doesNotMatch(moduleSrc, /^import\s/m, 'the module imports NOTHING (pure data + closures)');
  assert.doesNotMatch(moduleSrc, /require\s*\(/, 'no CJS require — plain ESM');
  assert.doesNotMatch(moduleSrc, /from\s+['"]react['"]/, 'no React import');
  assert.doesNotMatch(moduleSrc, /useTests|useSettings|useUI|useProviders|useContext/, 'no context deep-reach');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'sessionStorage', 'fetch(', 'setTimeout', 'setInterval']) {
    assert.ok(!moduleSrc.includes(forbidden), `the module stays pure: no ${forbidden}`);
  }
});

test('The factory takes exactly one deps object carrying the eleven App-state closures', () => {
  const src = moduleSrc.replace(/\/\/.*$/gm, '');
  const params = /export\s+function\s+buildTourSteps\s*\(\{([\s\S]*?)\}\)\s*\{/.exec(src);
  assert.ok(params, 'buildTourSteps takes a single destructured deps object');
  for (const name of DEP_NAMES) {
    assert.match(params[1], new RegExp(`\\b${name}\\b`), `the deps object carries ${name}`);
  }
  assert.match(src, /return\s+\[/, 'the factory returns the step array literal');
});

test('Calling the returned closures with a minimal deps object never leaks free identifiers', () => {
  const steps = buildTourSteps(makeDeps());
  for (const step of steps) {
    if (typeof step.waitFor === 'function') assert.doesNotThrow(() => step.waitFor(), `${step.target} waitFor is deps-complete`);
    if (typeof step.onEnter === 'function') assert.doesNotThrow(() => step.onEnter(), `${step.target} onEnter is deps-complete`);
  }
});

// byte-compatible step array --------------------------------------------------

test('BuildTourSteps(deps) returns exactly 19 steps in the fixed order', () => {
  const steps = buildTourSteps(makeDeps());
  assert.equal(steps.length, 19, `exactly 19 steps; got ${steps.length}`);
  assert.deepEqual(
    steps.map((s) => s.target),
    EXPECTED_TARGETS,
    'the data-tour target sequence is byte-compatible (order matters: settings → matrix → tests → runner → dashboard)'
  );
});

test('The title sequence is byte-compatible', () => {
  const steps = buildTourSteps(makeDeps());
  assert.deepEqual(steps.map((s) => s.title), EXPECTED_TITLES);
});

test('Every step keeps the six-key shape', () => {
  const steps = buildTourSteps(makeDeps());
  const ALLOWED = ['target', 'onEnter', 'title', 'body', 'waitFor', 'autoAdvance'];
  steps.forEach((step, i) => {
    for (const key of Object.keys(step)) {
      assert.ok(ALLOWED.includes(key), `step ${i} (${step.target}) has only known keys, found "${key}"`);
    }
    assert.equal(typeof step.title, 'string', `step ${i} title is a string`);
    assert.ok(step.title.length > 0, `step ${i} title non-empty`);
    assert.equal(typeof step.body, 'string', `step ${i} body is a string`);
    assert.ok(step.body.length >= 40, `step ${i} body is real copy (>= 40 chars)`);
    assert.match(step.target, /^\[data-tour="[a-z0-9-]+"\]$/, `step ${i} target is a data-tour selector`);
  });
});

test('OnEnter switches tabs exactly where expected, arity-0, nowhere else', () => {
  const steps = buildTourSteps(makeDeps());
  steps.forEach((step, i) => {
    if (i in EXPECTED_ON_ENTER) {
      assert.equal(typeof step.onEnter, 'function', `step ${i} (${step.target}) has an onEnter`);
      assert.equal(step.onEnter.length, 0, `step ${i} onEnter is arity-0`);
      const { tabs, deps } = withTabSpy();
      buildTourSteps(deps)[i].onEnter();
      assert.deepEqual(tabs, [EXPECTED_ON_ENTER[i]], `step ${i} onEnter switches to '${EXPECTED_ON_ENTER[i]}' and nothing else`);
    } else {
      assert.equal(step.onEnter, undefined, `step ${i} has no onEnter`);
    }
  });
});

test('WaitFor closures are arity-0 and exist only on the seven waiting steps', () => {
  const steps = buildTourSteps(makeDeps());
  steps.forEach((step, i) => {
    if (EXPECTED_WAIT_FOR.includes(i)) {
      assert.equal(typeof step.waitFor, 'function', `step ${i} (${step.target}) has a waitFor`);
      assert.equal(step.waitFor.length, 0, `step ${i} waitFor is arity-0`);
    } else {
      assert.equal(step.waitFor, undefined, `step ${i} has no waitFor`);
    }
  });
});

test('Matrix-grid waitFor reads the selectedTechniqueRef dep', () => {
  const ref = { current: null };
  const deps = makeDeps({ selectedTechniqueRef: ref });
  const steps = buildTourSteps(deps);
  assert.equal(steps[4].waitFor(), false, 'no selected technique → not ready');
  ref.current = { id: 'T1001' };
  assert.equal(steps[4].waitFor(), true, 'a selected technique (via the injected ref) → ready');
});

test('Add-target waitFor flips exactly at 2 targets', () => {
  const deps = makeDeps();
  assert.equal(buildTourSteps(deps)[8].waitFor(), false, '1 target → not ready');
  deps.targets.push({ uid: 'p2::m2', provider: 'p2', model: 'm2' });
  assert.equal(buildTourSteps(deps)[8].waitFor(), true, '2 targets → ready');
});

test('Preset-select waitFor demands the Default preset fully applied', () => {
  const mk = (presets, allTests, selectedTests) =>
    buildTourSteps(makeDeps({ presets, allTests, selectedTests }))[9].waitFor;

  assert.equal(mk([], [], [])(), true, 'no Default preset defined → do not block the tour');
  const def = { id: 'default', testIds: ['a', 'b'] };
  const other = { id: 'other', testIds: ['z'] };
  const catalog = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(mk([other, def], catalog, ['a', 'b'])(), true, 'Default preset ids all selected (order-free) → ready');
  assert.equal(mk([def], catalog, ['a'])(), false, 'only part of the Default preset selected → not ready');
  assert.equal(mk([def], catalog, [])(), false, 'nothing selected → not ready');
  assert.equal(mk([def], [{ id: 'a' }], ['a'])(), true, 'ids are intersected with the live catalog: missing test shrinks the demand');
  assert.equal(mk([def], catalog, ['a', 'b', 'c'])(), false, 'over-selection (extra ids) → not ready');
});

test('Run-audit waitFor mirrors the running dep', () => {
  const deps = makeDeps();
  assert.ok(!buildTourSteps(deps)[10].waitFor(), 'idle → not ready');
  deps.running = true;
  assert.ok(buildTourSteps(deps)[10].waitFor(), 'audit running → ready');
});

test('Show-console waitFor demands finished run with results', () => {
  const deps = makeDeps({ running: true, results: [] });
  assert.ok(!buildTourSteps(deps)[11].waitFor(), 'still running → not ready');
  deps.running = false;
  assert.ok(!buildTourSteps(deps)[11].waitFor(), 'finished but no results → not ready');
  deps.results.push({ uid: 'r1' });
  assert.ok(buildTourSteps(deps)[11].waitFor(), 'finished with results → ready');
});

test('Results-table waitFor mirrors the expandedCell dep', () => {
  const deps = makeDeps();
  assert.equal(buildTourSteps(deps)[12].waitFor(), false, 'no expanded cell → not ready');
  deps.expandedCell = { row: 0, col: 1 };
  assert.equal(buildTourSteps(deps)[12].waitFor(), true, 'expanded cell → ready');
});

test('Sandbox-config waitFor demands sandbox mode OFF (and no autoAdvance)', () => {
  const deps = makeDeps({ useDemoMode: true });
  const steps = buildTourSteps(deps);
  assert.equal(steps[18].waitFor(), false, 'sandbox still on → not ready');
  deps.useDemoMode = false;
  assert.equal(buildTourSteps(deps)[18].waitFor(), true, 'sandbox off → ready');
  assert.equal(steps[18].autoAdvance, undefined, 'the final step waits for the user, it does not auto-advance');
});

test('AutoAdvance is true on exactly the six waiting steps', () => {
  const steps = buildTourSteps(makeDeps());
  steps.forEach((step, i) => {
    if (EXPECTED_AUTO_ADVANCE.includes(i)) {
      assert.equal(step.autoAdvance, true, `step ${i} (${step.target}) auto-advances`);
    } else {
      assert.equal(step.autoAdvance, undefined, `step ${i} does not auto-advance`);
    }
  });
});

// isolation — fresh closures per factory call, deps read at call scope ---------

test('Each factory call yields independent closures (no module-level singletons)', () => {
  const first = withTabSpy();
  const second = withTabSpy();
  buildTourSteps(first.deps)[0].onEnter();
  buildTourSteps(second.deps)[0].onEnter();
  assert.deepEqual(first.tabs, ['settings'], 'the first deps spy saw only its own call');
  assert.deepEqual(second.tabs, ['settings'], 'the second deps spy saw only its own call');
});

test('Closures read the deps values from their creation scope (App re-renders rebuild the array)', () => {
  const deps = makeDeps({ running: false });
  const steps = buildTourSteps(deps);
  deps.running = true;
  assert.ok(!steps[10].waitFor(), 'the captured closure keeps its creation-time value');
  assert.ok(buildTourSteps(deps)[10].waitFor(), 'the rebuilt array observes the new value');
});

// copy snapshot for the settings / matrix / runner steps -----------------------

test('Copy snapshot — the settings step', () => {
  const [step] = buildTourSteps(makeDeps());
  assert.equal(step.title, 'Settings');
  assert.equal(
    step.body,
    "This is Settings — every configuration card lives here: Providers (with the sandbox), " +
    "Helper Models (AI Judge + Test Generator), the MITRE ATLAS sync, the proxy, Account & Data, and Help. " +
    "Cards are collapsible. (The AI Prompts editor has its own section in the sidebar.) Let's set up your first provider."
  );
});

test('Copy snapshot — the matrix step', () => {
  const step = buildTourSteps(makeDeps())[3];
  assert.equal(step.title, 'MITRE ATLAS Matrix');
  assert.equal(
    step.body,
    'GroundRumble is built on the MITRE ATLAS framework — the official adversarial threat model for AI systems. ' +
    'This tab shows every tactic and technique, and each test payload in the suite maps back to one of them.'
  );
});

test('Copy snapshot — the runner lineup step', () => {
  const step = buildTourSteps(makeDeps())[8];
  assert.equal(step.title, 'Model Comparison Lineup');
  assert.equal(
    step.body,
    "Now let's build your comparison lineup. Two demo targets (Sandbox/Demo Secure and Sandbox/Demo Vulnerable) " +
    'are pre-loaded so you can run a first audit immediately — replace them with your own provider + model by ' +
    'picking one here and clicking "Add to Comparison"; we need at least 2 models. We will auto-advance as soon as you have 2 targets.'
  );
});

// App.jsx adopts the factory and sheds the array -------------------------------

test('App.jsx imports the factory, adopts it with the full deps object, and sheds the array', () => {
  assert.match(app, /import\s*\{[^}]*buildTourSteps[^}]*\}\s*from\s*'\.\/utils\/tour-steps(\.js)?';/, 'App imports buildTourSteps from ./utils/tour-steps');
  assert.doesNotMatch(app, /^ {2}const TOUR_STEPS = \[/m, 'the TOUR_STEPS array literal left App.jsx');
  // App adopts the factory into the same TOUR_STEPS binding (Tour.jsx wiring
  // unchanged). It may call buildTourSteps directly or wrap that call in a
  // useMemo; both shapes are accepted.
  const directAdoption = app.includes('const TOUR_STEPS = buildTourSteps({');
  const memoAdoption = /const TOUR_STEPS = useMemo\(\s*\(\) => buildTourSteps\(\{/.test(app);
  assert.ok(directAdoption || memoAdoption, 'App adopts the factory into the same TOUR_STEPS binding (Tour.jsx wiring unchanged)');
  const callStart = app.indexOf('buildTourSteps({');
  assert.ok(callStart >= 0, 'the adoption call exists');
  const call = app.slice(callStart, app.indexOf('});', callStart) + 3);
  for (const dep of DEP_NAMES) {
    assert.ok(call.includes(dep), `App passes ${dep} into buildTourSteps`);
  }
  assert.ok(app.includes('const selectedTechniqueRef = useRef(null);'), 'the selection mirror ref stays App-owned');
  assert.equal(countIn(app, 'const selectedTechniqueRef = useRef(null);'), 1, 'the mirror ref is declared exactly once');
  assert.ok(app.includes('<Tour steps={TOUR_STEPS}'), 'the <Tour> mount keeps consuming TOUR_STEPS');
});

test('App.jsx is net-smaller than baseline (the ~128-line array moved out)', () => {
  assert.ok(lineCount(app) < 2538, `App.jsx must shed the tour array (baseline 2638; simulated adoption landed 2522); got ${lineCount(app)}`);
});
