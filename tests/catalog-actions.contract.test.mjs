// Contract: the test-catalog orchestration actions — resetTestSuite
// (confirm dialog, custom/disabled/persistence/NEW-marker reset, base suite
// re-selection), openAddTest (blank customForm shape), toggleTest and
// selectAllTests — have ONE definition site: src/context/TestsContext.jsx,
// exposed as TestsProvider context actions. App.jsx consumes them via
// useTests() and defines none of them; TestsView / RunnerView consume them
// directly from useTests() instead of receiving them as props. resetTestSuite
// composes PRESET_TESTS + generateTestsForMatrix (same ids selected) and the
// localStorage keys are unchanged: atlas_custom_tests / atlas_disabled_tests
// end up REMOVED (via the context-owned clearCatalogPersistence) and
// atlas_recent_ai_tests is removed.
//
// The NEW-marker state (recentlyGeneratedIds / aiGeneratedCount) stays
// App-owned (AIGenProvider mounts below TestsProvider in main.jsx), so App
// registers its resetter into the provider through the setNewMarkerReset
// bridge — the same up-call pattern as the existing setCatalogMatrix bridge —
// and resetTestSuite invokes it between the persistence clear and the
// atlas_recent_ai_tests removal.
//
// Sections:
//   1. Grep gate over src/ — the four actions are defined ONLY in
//      TestsContext.
//   2. TestsContext pins — the moved bodies keep their exact semantics, the
//      NEW-marker bridge is exposed, and the provider value serves all of it.
//   3. Consumer adoption pins — App destructures the actions (+ registers the
//      NEW-marker resetter); both views consume them from useTests() and keep
//      every pinned call site; App keeps every other prop wiring unchanged and
//      shrinks.
//   4. Runtime behavioral — the REAL TestsProvider is mounted (rolldown
//      bundle under bare node --test, same technique as
//      tests/history-verdict.contract.test.mjs) and the full
//      catalog-action contract is exercised against live context state and
//      real localStorage keys.
//
// Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const TESTS_CTX_PATH = 'src/context/TestsContext.jsx';
const TESTS_VIEW_PATH = 'src/components/views/TestsView.jsx';
const RUNNER_VIEW_PATH = 'src/components/views/RunnerView.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', testsCtx = '', testsView = '', runnerView = '';
try {
  app = readSource(APP_PATH);
  testsCtx = readSource(TESTS_CTX_PATH);
  testsView = readSource(TESTS_VIEW_PATH);
  runnerView = readSource(RUNNER_VIEW_PATH);
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);
const valueSlice = (ctx) => {
  const start = idx(ctx, 'const value = {');
  return start < 0 ? '' : ctx.slice(start, idx(ctx, '};', start));
};

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (body, label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
  return cursor;
};

// Extracts a component-level handler (2-space indent): from its declaration
// line to the handler-closing `  };` line, so trailing comments are excluded.
function regionOf(source, name) {
  const re = new RegExp(`^  const ${name} = `, 'm');
  const m = re.exec(source);
  assert.ok(m, `declaration of ${name} not found at the component-body indent`);
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    buf.push(lines[i]);
    if (lines[i] === '  };' || lines[i] === '  });') return buf.join('\n');
  }
  assert.fail(`handler ${name} has no closing line`);
}
const bodyOf = (source, name) => norm(regionOf(source, name));

// ---------------------------------------------------------------------------
// 1. grep gate: the four orchestration actions live in exactly one file
// ---------------------------------------------------------------------------

test('Grep gate — `const toggleTest/selectAllTests/openAddTest/resetTestSuite =` exist ONLY in TestsContext across src/', () => {
  const srcDir = join(root, 'src');
  const files = readdirSync(srcDir, { recursive: true })
    .map((p) => p.split(sep).join('/'))
    .filter((p) => /\.(js|jsx)$/.test(p) && statSync(join(srcDir, p)).isFile());
  assert.ok(files.includes('context/TestsContext.jsx'), 'the src walk sees the context directory');
  const sites = { toggleTest: [], selectAllTests: [], openAddTest: [], resetTestSuite: [] };
  for (const rel of files) {
    const src = readSource(join('src', rel));
    for (const name of Object.keys(sites)) {
      if (new RegExp(`const ${name} = `).test(src)) sites[name].push(rel);
    }
  }
  for (const name of Object.keys(sites)) {
    assert.deepEqual(sites[name], ['context/TestsContext.jsx'], `${name} is defined in exactly one file: TestsContext.jsx`);
    assert.equal(countIn(testsCtx, new RegExp(`const ${name} = `, 'g')), 1, `exactly one ${name} definition in TestsContext`);
    assert.equal(countIn(app, new RegExp(`const ${name} = `, 'g')), 0, `App.jsx has no local ${name}`);
  }
  assert.equal(countIn(testsView, /const (toggleTest|selectAllTests|openAddTest|resetTestSuite) = /g), 0, 'TestsView defines none of the actions');
  assert.equal(countIn(runnerView, /const (toggleTest|selectAllTests|openAddTest|resetTestSuite) = /g), 0, 'RunnerView defines none of the actions');
});

// ---------------------------------------------------------------------------
// 2. TestsContext pins: the bodies keep their exact semantics
// ---------------------------------------------------------------------------

test('TestsContext owns the exact catalog-action bodies (byte-compatible move)', () => {
  assert.equal(bodyOf(testsCtx, 'toggleTest'),
    'const toggleTest = (testId) => { setSelectedTests(prev => prev.includes(testId) ? prev.filter(id => id !== testId) : [...prev, testId] ); };',
    'toggleTest keeps the exact array-membership flip');
  assert.equal(bodyOf(testsCtx, 'selectAllTests'),
    'const selectAllTests = (select) => { setSelectedTests(select ? allTests.map(t => t.id) : []); };',
    'selectAllTests keeps the exact enabled-suite fill / empty semantics');
  assert.equal(bodyOf(testsCtx, 'openAddTest'),
    "const openAddTest = () => { setEditingTestId(null); setCustomForm({ name: '', techniqueId: '', techniqueName: '', tactic: '', description: '', systemPrompt: '', userPrompt: '', failKeywords: '', refusalKeywords: '' }); setShowAddCustom(true); };",
    'openAddTest keeps the exact blank customForm shape + modal open');
});

test('ResetTestSuite keeps its exact orchestration order and rides the NEW-marker bridge', () => {
  const body = bodyOf(testsCtx, 'resetTestSuite');
  assert.ok(body, 'TestsContext defines resetTestSuite');
  ordered(body, 'ctx.resetTestSuite', [
    "if (!(await askConfirm('Reset the test suite to the predefined payloads?\\n\\nThis removes all custom and AI-generated tests, restores any removed tests, and clears NEW markers. Your saved sources are kept.'))) return;",
    'setCustomTests([]);',
    'setDisabledTestIds([]);',
    'clearCatalogPersistence();',
    'newMarkerResetRef.current',
    "localStorage.removeItem('atlas_recent_ai_tests');",
    '...generateTestsForMatrix(atlasMatrix, new Set(PRESET_TESTS.map(t => t.techniqueId)))',
    'setSelectedTests(baseTests.map(t => t.id));',
    "addToast('Test suite reset to the predefined payloads.');"
  ]);
  assert.doesNotMatch(body, /setRecentlyGeneratedIds|setAiGeneratedCount/,
    'the App-owned NEW-marker state is NOT written directly by the context (it rides the bridge)');
  assert.ok(idx(testsCtx, 'const resetTestSuite = ') > idx(testsCtx, 'const newMarkerResetRef = useRef(null);'),
    'the bridge ref is declared before the action uses it');
});

test('The NEW-marker bridge is exposed and the provider value serves all five members', () => {
  assert.match(testsCtx, /const newMarkerResetRef = useRef\(null\);/, 'the bridge ref is provider-owned');
  assert.match(testsCtx, /const setNewMarkerReset = useCallback\(\(fn\) => \{/, 'the registration setter is stable (useCallback)');
  const valueBlock = valueSlice(testsCtx);
  assert.ok(valueBlock.length > 0, 'TestsProvider builds a value object');
  for (const name of ['toggleTest', 'selectAllTests', 'openAddTest', 'resetTestSuite', 'setNewMarkerReset']) {
    assert.match(valueBlock, new RegExp(`\\b${name}\\b`), `the provider value exposes ${name}`);
  }
  const valueStart = idx(testsCtx, 'const value = {');
  for (const name of ['toggleTest', 'selectAllTests', 'openAddTest', 'resetTestSuite']) {
    assert.ok(idx(testsCtx, `const ${name} = `) < valueStart, `${name} is defined inside the provider, before the value object`);
  }
  assert.doesNotMatch(valueBlock, /setRecentlyGeneratedIds|setAiGeneratedCount/,
    'the App-owned marker state itself never enters the provider value');
});

// ---------------------------------------------------------------------------
// 3. anchors: App + both views consume the context actions; the call sites
//    keep their exact shapes; App keeps the rest of its wiring
// ---------------------------------------------------------------------------

test('App consumes the four actions from useTests() and registers the NEW-marker reset', () => {
  assert.match(app, /= useTests\(\)/, 'App still drives the catalog through useTests()');
  const destructureStart = idx(app, '= useTests()');
  const destructure = app.slice(Math.max(0, destructureStart - 2000), destructureStart);
  for (const name of ['resetTestSuite', 'openAddTest', 'toggleTest', 'selectAllTests', 'setNewMarkerReset']) {
    assert.match(destructure, new RegExp(`\\b${name},`), `App destructures ${name} from useTests()`);
  }
  // The NEW-marker state stays App-owned; App registers its resetter into the
  // provider (mount-once bridge) so resetTestSuite keeps clearing the markers.
  const regIdx = idx(app, 'setNewMarkerReset(() => {');
  assert.ok(regIdx > destructureStart, 'App registers the NEW-marker resetter through the context bridge');
  const registration = app.slice(regIdx, idx(app, '});', regIdx));
  assert.match(registration, /setRecentlyGeneratedIds\(\[\]\);/, 'the registration clears the recent NEW-marker list');
  assert.match(registration, /setAiGeneratedCount\(0\);/, 'the registration resets the AI-generated counter');
  assert.match(app, /useEffect\(\(\) => \{\s*\n\s*setNewMarkerReset\(\(\) => \{/, 'the registration runs in a mount-once effect');
});

test('App drops the duplicated orchestration block and the moved prop wiring', () => {
  assert.doesNotMatch(app, /Reset the test suite to the predefined payloads\?/, 'the confirm copy left App.jsx (it lives with the definition now)');
  assert.doesNotMatch(app, /Test suite reset to the predefined payloads\./, 'the reset toast copy left App.jsx');
  assert.doesNotMatch(app, /localStorage\.removeItem\('atlas_recent_ai_tests'\)/, 'the NEW-marker key removal left App.jsx (the context action owns it)');
  assert.doesNotMatch(app, /setCustomTests\(\[\]\);/, 'no inlined catalog-clear copy remains in App');
  const tvStart = idx(app, '<TestsView');
  assert.ok(tvStart >= 0, 'App.jsx mounts <TestsView');
  const tvWire = app.slice(tvStart, idx(app, '\n          />', tvStart));
  for (const removed of ['resetTestSuite={resetTestSuite}', 'openAddTest={openAddTest}', 'toggleTest={toggleTest}', 'selectAllTests={selectAllTests}']) {
    assert.ok(!tvWire.includes(removed), `TestsView no longer receives ${removed}`);
  }
  for (const kept of ['recentlyGeneratedIds={recentlyGeneratedIds}', 'effectiveGenConfig={effectiveGenConfig}',
    'openBulkImport={openBulkImport}', 'openAiWizard={openAiWizard}', 'clearNewMarkers={clearNewMarkers}',
    'toggleAiGenSource={toggleAiGenSource}', 'toggleAiGenUrl={toggleAiGenUrl}', 'removeAiGenUrl={removeAiGenUrl}']) {
    assert.ok(tvWire.includes(kept), `TestsView keeps ${kept}`);
  }
  // The chip prop resolves from either side of the component move — bare
  // render-helper identifier, or inline component-mount wrapper.
  assert.ok(tvWire.includes('renderActiveModelChip={renderActiveModelChip}') || tvWire.includes('renderActiveModelChip={(label, cfg) => ('),
    'TestsView keeps its chip prop (helper identifier pre-T08, inline component-mount wrapper post-T08)');
  const rvStart = idx(app, '<RunnerView');
  assert.ok(rvStart >= 0, 'App.jsx mounts <RunnerView');
  const rvWire = app.slice(rvStart, idx(app, '\n          />', rvStart));
  assert.ok(!rvWire.includes('toggleTest={toggleTest}'), 'RunnerView no longer receives toggleTest as a prop');
  assert.ok(!rvWire.includes('selectAllTests={selectAllTests}'), 'RunnerView no longer receives selectAllTests as a prop');
  for (const kept of ['targets={targets}', 'addTarget={addTarget}', 'removeTarget={removeTarget}', 'runSecurityAudit={runSecurityAudit}',
    'stopSecurityAudit={stopSecurityAudit}', 'printRunReport={printRunReport}', 'handleResultOverride={handleResultOverride}']) {
    assert.ok(rvWire.includes(kept), `RunnerView keeps ${kept}`);
  }
});

test('TestsView consumes the actions from useTests() and keeps its exact call sites', () => {
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(testsView);
  assert.ok(testsBlock, 'TestsView destructures useTests()');
  for (const name of ['resetTestSuite', 'openAddTest', 'toggleTest', 'selectAllTests']) {
    assert.match(testsBlock[1], new RegExp(`\\b${name}\\b`), `TestsView consumes ${name} from useTests()`);
  }
  const tvProps = testsView.slice(idx(testsView, 'export function TestsView({'), idx(testsView, '}) {'));
  assert.doesNotMatch(tvProps, /^  (resetTestSuite|openAddTest|toggleTest|selectAllTests),$/m, 'the actions left the TestsView props signature');
  ordered(testsView, 'TestsView buttons', [
    '<button onClick={() => selectAllTests(true)} className="btn-secondary"',
    '<button onClick={() => selectAllTests(false)} className="btn-secondary"',
    '<button onClick={resetTestSuite} disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    '<button onClick={openAddTest} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary"',
    'onChange={() => toggleTest(test.id)}'
  ]);
});

test('RunnerView consumes the selection ops from useTests() and keeps its exact call sites', () => {
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(runnerView);
  assert.ok(testsBlock, 'RunnerView destructures useTests()');
  assert.match(testsBlock[1], /\btoggleTest\b/, 'RunnerView consumes toggleTest from useTests()');
  assert.match(testsBlock[1], /\bselectAllTests\b/, 'RunnerView consumes selectAllTests from useTests()');
  const rvProps = runnerView.slice(idx(runnerView, 'export function RunnerView({'), idx(runnerView, '}) {'));
  assert.doesNotMatch(rvProps, /^  (toggleTest|selectAllTests),$/m, 'the selection ops left the RunnerView props signature');
  ordered(runnerView, 'RunnerView buttons', [
    'onClick={() => selectAllTests(true)} className="btn-secondary" style={{ padding: \'4px 8px\', fontSize: \'0.7rem\' }}>Select All</button>',
    'onClick={() => selectAllTests(false)} className="btn-secondary" style={{ padding: \'4px 8px\', fontSize: \'0.7rem\' }}>Clear All</button>',
    'onChange={() => toggleTest(test.id)}'
  ]);
});

test('App.jsx is net-smaller than the T03 baseline (3234 lines)', () => {
  const appLines = app.split('\n').length;
  assert.ok(appLines < 3234, `App.jsx shrank below the 3234-line T03 baseline; got ${appLines}`);
});

// ---------------------------------------------------------------------------
// 4. Runtime behavioral: the REAL TestsProvider, mounted, serves actions that
//    meet the exact contract
// ---------------------------------------------------------------------------

let ctxBundle = null;
let ctxBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't03-catalog-actions-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { UIProvider } from '${abs('src/context/UIContext.jsx')}';`,
    `export { useUI } from '${abs('src/context/useUI.js')}';`,
    `export { TestsProvider, useTests } from '${abs('src/context/TestsContext.jsx')}';`
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'ctx-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  ctxBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  ctxBundleError = err;
}

const { PRESET_TESTS, generateTestsForMatrix, ATLAS_TACTICS } = await import('../src/data/payloads.js');
const expectedBaseIds = [
  ...PRESET_TESTS,
  ...generateTestsForMatrix(ATLAS_TACTICS, new Set(PRESET_TESTS.map(t => t.techniqueId)))
].map(t => t.id);

const BLANK_FORM = {
  name: '', techniqueId: '', techniqueName: '', tactic: '', description: '',
  systemPrompt: '', userPrompt: '', failKeywords: '', refusalKeywords: ''
};
const BLANK_FORM_KEYS = ['name', 'techniqueId', 'techniqueName', 'tactic', 'description', 'systemPrompt', 'userPrompt', 'failKeywords', 'refusalKeywords'];

// Mounts the real UIProvider > TestsProvider tree under jsdom and returns the
// live context values through a probe component. `seed` entries are written
// to localStorage before the mount (provider boot reads them).
const mountTestsProvider = async ({ seed = {} } = {}) => {
  assert.ok(!ctxBundleError, `the context bundle must build under rolldown: ${ctxBundleError?.stack || ctxBundleError}`);
  const { UIProvider, useUI, TestsProvider, useTests } = ctxBundle;
  const { JSDOM } = await import('jsdom');
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  localStorage.clear();
  for (const [k, v] of Object.entries(seed)) {
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'Node', 'Element', 'getComputedStyle', 'customElements']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const sink = {};
  /* oxlint-disable react/immutability -- node:test harness sink: captured outside a real React tree */
  function Probe() {
    sink.tests = useTests();
    sink.ui = useUI();
    return null;
  }
  /* oxlint-enable react/immutability */
  let mountRoot;
  await act(async () => {
    mountRoot = createRoot(document.getElementById('root'));
    mountRoot.render(
      React.createElement(UIProvider, null,
        React.createElement(TestsProvider, null,
          React.createElement(Probe)
        )
      )
    );
    await new Promise((r) => setTimeout(r, 120));
  });
  const cleanup = async () => {
    await act(async () => { mountRoot.unmount(); });
    try { dom.window.close(); } catch { /* jsdom window cleanup is best-effort */ }
  };
  return { sink, act, mountRoot, dom, cleanup };
};

// Runs `run()` (which awaits askConfirm), captures the exact dialog copy,
// resolves it with `answer`, and awaits the action's completion. Two act
// cycles: the dialog-open update is a default-lane setState whose render
// flush React 19's act defers mid-callback (UIContext.resolveDialog resolves
// inside a setConfirmState updater — src/context/UIContext.jsx:123-128), so
// the copy is observed after the first act scope flushes and the captured
// promise is resolved in a second act cycle, which also flushes the action's
// mutation renders before `await done` returns. Harness plumbing only — every
// assertion stays byte-identical.
const driveConfirm = async (sink, act, run, answer) => {
  let message = null;
  let done;
  await act(async () => {
    done = run();
    await new Promise((r) => setTimeout(r, 0));
  });
  message = sink.ui.confirmState ? sink.ui.confirmState.message : null;
  await act(async () => {
    sink.ui.confirmState?.resolve(answer);
    await done;
  });
  return message;
};

test('Runtime: the mounted TestsProvider serves the catalog actions meeting the PRE contract', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    for (const name of ['toggleTest', 'selectAllTests', 'openAddTest', 'resetTestSuite', 'setNewMarkerReset']) {
      assert.equal(typeof sink.tests[name], 'function', `useTests() exposes ${name} as a context action`);
    }

    // Boot parity: the initial selection is the exact PRESET_TESTS +
    // generateTestsForMatrix composition over the bundled matrix.
    assert.deepEqual(sink.tests.selectedTests, expectedBaseIds, 'boot selection == the base-suite composition the reset must restore');

    // selectAllTests: false empties, true refills from the enabled suite.
    await act(async () => { sink.tests.selectAllTests(false); });
    assert.deepEqual(sink.tests.selectedTests, [], 'selectAllTests(false) empties the selection');
    await act(async () => { sink.tests.selectAllTests(true); });
    assert.deepEqual(sink.tests.selectedTests, sink.tests.allTests.map(t => t.id), 'selectAllTests(true) fills from the enabled suite');
    assert.deepEqual(sink.tests.selectedTests, expectedBaseIds, 'with a fresh catalog the enabled suite IS the base suite');

    // toggleTest: remove, re-add (array semantics, appends at the end).
    const firstId = expectedBaseIds[0];
    await act(async () => { sink.tests.toggleTest(firstId); });
    assert.deepEqual(sink.tests.selectedTests, expectedBaseIds.slice(1), 'toggling a selected id removes exactly that id');
    await act(async () => { sink.tests.toggleTest(firstId); });
    assert.deepEqual(sink.tests.selectedTests, [...expectedBaseIds.slice(1), firstId], 'toggling an unselected id appends it at the end');

    // openAddTest: create-mode modal with the exact blank form.
    await act(async () => { sink.tests.openAddTest(); });
    assert.equal(sink.tests.editingTestId, null, 'openAddTest resets editingTestId to null');
    assert.equal(sink.tests.showAddCustom, true, 'openAddTest opens the add-custom modal');
    assert.deepEqual(sink.tests.customForm, BLANK_FORM, 'openAddTest resets customForm to the exact 9-key blank shape');
    assert.deepEqual(Object.keys(sink.tests.customForm), BLANK_FORM_KEYS, 'the blank form keeps the exact key order');
    await act(async () => { sink.tests.setShowAddCustom(false); });
  } finally {
    await cleanup();
  }
});

test('Runtime: resetTestSuite decline is a full no-op (confirm gate, exact dialog copy)', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    await act(async () => {
      sink.tests.setCustomTests([{ id: 'custom_x', name: 'Custom X', techniqueId: 'AML.T0034' }]);
      sink.tests.setDisabledTestIds(['direct_override']);
    });
    const selectionBefore = [...sink.tests.selectedTests];
    const spyCalls = [];
    await act(async () => { sink.tests.setNewMarkerReset(() => { spyCalls.push('markers'); }); });

    const message = await driveConfirm(sink, act, () => sink.tests.resetTestSuite(), false);
    assert.match(message ?? '', /^Reset the test suite to the predefined payloads\?\n\nThis removes all custom and AI-generated tests, restores any removed tests, and clears NEW markers\. Your saved sources are kept\.$/,
      'the confirm dialog copy is exact (all three effects + the sources guarantee)');
    assert.deepEqual(sink.tests.customTests, [{ id: 'custom_x', name: 'Custom X', techniqueId: 'AML.T0034' }], 'custom tests untouched');
    assert.deepEqual(sink.tests.disabledTestIds, ['direct_override'], 'removed tests untouched');
    assert.deepEqual(sink.tests.selectedTests, selectionBefore, 'selection untouched');
    assert.equal(localStorage.getItem('atlas_custom_tests'), JSON.stringify([{ id: 'custom_x', name: 'Custom X', techniqueId: 'AML.T0034' }]), 'atlas_custom_tests survives a declined reset');
    assert.equal(localStorage.getItem('atlas_recent_ai_tests'), null, 'no NEW-marker key write on decline');
    assert.deepEqual(spyCalls, [], 'the NEW-marker resetter is NOT invoked on decline');
  } finally {
    await cleanup();
  }
});

test('Runtime: resetTestSuite accept performs the exact reset contract against real localStorage keys', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    await act(async () => {
      sink.tests.setCustomTests([{ id: 'custom_x', name: 'Custom X', techniqueId: 'AML.T0034' }]);
      sink.tests.setDisabledTestIds(['direct_override']);
      sink.tests.setSelectedTests(['stale', 'ids']);
    });
    localStorage.setItem('atlas_recent_ai_tests', JSON.stringify(['ai_1']));
    const spyCalls = [];
    await act(async () => { sink.tests.setNewMarkerReset(() => { spyCalls.push('markers'); }); });

    const message = await driveConfirm(sink, act, () => sink.tests.resetTestSuite(), true);
    assert.match(message ?? '', /^Reset the test suite to the predefined payloads\?/, 'the confirm dialog opens with the reset copy');
    assert.deepEqual(sink.tests.customTests, [], 'custom tests emptied');
    assert.deepEqual(sink.tests.disabledTestIds, [], 'removed tests restored (disabled ids emptied)');
    assert.deepEqual(spyCalls, ['markers'], 'the NEW-marker resetter is invoked exactly once');
    assert.equal(localStorage.getItem('atlas_custom_tests'), null, 'atlas_custom_tests is REMOVED, not set to "[]"');
    assert.equal(localStorage.getItem('atlas_disabled_tests'), null, 'atlas_disabled_tests is REMOVED, not set to "[]"');
    assert.equal(localStorage.getItem('atlas_recent_ai_tests'), null, 'atlas_recent_ai_tests is REMOVED (keys unchanged, removal semantics)');
    assert.deepEqual(sink.tests.selectedTests, expectedBaseIds, 'the base suite is re-selected with the same ids the PRE suite pinned');
    const toast = sink.ui.toasts.find(t => t.message === 'Test suite reset to the predefined payloads.');
    assert.ok(toast, 'the exact reset toast is surfaced through the UI context');
  } finally {
    await cleanup();
  }
});

test('Runtime: resetTestSuite composes off the provider-owned live matrix (the setCatalogMatrix bridge flows in)', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    const bridged = [
      ...ATLAS_TACTICS,
      { id: 'TA9CAT', name: 'Catalog Bridge Tactic', description: 'probe',
        techniques: [{ id: 'AML.T9CAT', name: 'Catalog Bridge Probe', description: 'probe technique' }] }
    ];
    await act(async () => { sink.tests.setCatalogMatrix(bridged); });
    await act(async () => { sink.tests.setNewMarkerReset(() => {}); });
    await driveConfirm(sink, act, () => sink.tests.resetTestSuite(), true);
    assert.ok(sink.tests.selectedTests.includes('auto_AML.T9CAT'), 'the auto test for the bridged-matrix technique is re-selected');
    assert.equal(sink.tests.selectedTests.length, expectedBaseIds.length + 1, 'exactly one extra id versus the bundled-matrix composition');
    assert.deepEqual(sink.tests.selectedTests.filter(id => !id.startsWith('auto_')), expectedBaseIds.filter(id => !id.startsWith('auto_')),
      'the preset portion of the selection is unchanged by the matrix');
  } finally {
    await cleanup();
  }
});
