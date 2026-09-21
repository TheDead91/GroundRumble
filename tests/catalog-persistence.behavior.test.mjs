import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let ctxBundle = null;
let ctxBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 'catalog-persistence-failure-bundle');
  mkdirSync(dir, { recursive: true });
  const abs = (p) => join(root, p).split(sep).join('/');
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, [
    `export { UIProvider } from '${abs('src/context/UIContext.jsx')}';`,
    `export { useUI } from '${abs('src/context/useUI.js')}';`,
    `export { TestsProvider, useTests } from '${abs('src/context/TestsContext.jsx')}';`,
  ].join('\n'));
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } },
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'ctx-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  ctxBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  ctxBundleError = err;
}

const mountTestsProvider = async ({ seed = {} } = {}) => {
  assert.ok(!ctxBundleError, `context bundle must build: ${ctxBundleError?.stack || ctxBundleError}`);
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
      React.createElement(UIProvider, null, React.createElement(TestsProvider, null, React.createElement(Probe))),
    );
    await new Promise((r) => setTimeout(r, 120));
  });
  const cleanup = async () => {
    // Unmount inside act so the 6s toast-dismiss timer settles on an
    // unmounted tree instead of firing outside act on a live tree.
    // Globals are left for the next mount in this file (see tour-steps memo).
    await act(async () => { mountRoot.unmount(); });
    try { dom.window.close(); } catch { /* jsdom window cleanup is best-effort */ }
  };
  return { sink, act, mountRoot, dom, cleanup };
};

const driveConfirm = async (sink, act, run, answer) => {
  let done;
  await act(async () => {
    done = run();
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    sink.ui.confirmState?.resolve(answer);
    await done;
  });
};

const installStorageFault = (keys) => {
  const orig = localStorage.setItem;
  const failKeys = new Set(keys);
  localStorage.setItem = (k, v) => {
    if (failKeys.has(k)) throw new DOMException('Test catalog quota', 'QuotaExceededError');
    return orig.call(localStorage, k, v);
  };
  return () => { localStorage.setItem = orig; };
};

const withStorageFault = (keys, fn) => {
  const restore = installStorageFault(keys);
  let result;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
};

const VALID_FORM = {
  name: 'Probe Test', techniqueId: 'AML.T0034', techniqueName: 'LLM Prompt Injection',
  tactic: 'Execution', description: 'd', systemPrompt: 'sys', userPrompt: 'attack!',
  failKeywords: '', refusalKeywords: '',
};

test('catalog persistence helper never throws and reports failure', async () => {
  const { tryPersistCatalogArray, tryWriteCatalogKey, tryRemoveCatalogKey } = await import('../src/utils/catalog-persistence.js');
  assert.deepEqual(tryWriteCatalogKey('k1', 'v1'), { ok: true });
  assert.equal(localStorage.getItem('k1'), 'v1');
  const res = await withStorageFault(['k2'], () => tryWriteCatalogKey('k2', 'v2'));
  assert.equal(res.ok, false);
  assert.ok(res.error);
  const res2 = await withStorageFault(['atlas_custom_tests'], () => tryPersistCatalogArray('atlas_custom_tests', [{ id: 'x' }]));
  assert.equal(res2.ok, false);
  assert.deepEqual(tryRemoveCatalogKey('k1'), { ok: true });
});

test('Create failure commits nothing, preserves draft, retry succeeds', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    await act(async () => {
      sink.tests.setCustomForm({ ...VALID_FORM });
      sink.tests.setEditingTestId(null);
      sink.tests.setShowAddCustom(true);
    });
    const beforeToastCount = sink.ui.toasts.length;
    let ok;
    await withStorageFault(['atlas_custom_tests'], async () => {
      await act(async () => {
        ok = sink.tests.handleAddCustomTest({ preventDefault() {} });
      });
    });
    assert.equal(ok, false, 'create reports failure');
    assert.deepEqual(sink.tests.customTests, [], 'no optimistic commit');
    assert.equal(localStorage.getItem('atlas_custom_tests'), null, 'storage untouched');
    assert.equal(sink.tests.showAddCustom, true, 'modal stays open for retry');
    assert.equal(sink.tests.customForm.name, 'Probe Test', 'draft preserved');
    assert.ok(sink.ui.toasts.length > beforeToastCount, 'actionable failure feedback shown');
    assert.ok(!sink.ui.toasts.some((t) => t.message.includes('successfully added')), 'no false success');

    await act(async () => {
      ok = sink.tests.handleAddCustomTest({ preventDefault() {} });
    });
    assert.equal(ok, true, 'retry succeeds');
    assert.equal(sink.tests.customTests.length, 1, 'test committed after retry');
    assert.equal(sink.tests.showAddCustom, false, 'modal closes on success');
    const stored = JSON.parse(localStorage.getItem('atlas_custom_tests'));
    assert.equal(stored.length, 1, 'reload state agrees with committed state');
    assert.equal(stored[0].name, 'Probe Test');
  } finally {
    await cleanup();
  }
});

test('Edit failure preserves previous test and input for retry', async () => {
  const seed = [{ id: 'custom_1', name: 'Original', techniqueId: 'AML.T0034', userPrompt: 'orig' }];
  const { sink, act, cleanup } = await mountTestsProvider({ seed: { atlas_custom_tests: seed } });
  try {
    assert.equal(sink.tests.customTests[0].name, 'Original');
    await act(async () => {
      sink.tests.setCustomForm({ ...VALID_FORM, name: 'Edited' });
      sink.tests.setEditingTestId('custom_1');
      sink.tests.setShowAddCustom(true);
    });
    let ok;
    await withStorageFault(['atlas_custom_tests'], async () => {
      await act(async () => {
        ok = sink.tests.handleAddCustomTest({ preventDefault() {} });
      });
    });
    assert.equal(ok, false);
    assert.equal(sink.tests.customTests[0].name, 'Original', 'previous state preserved');
    assert.equal(JSON.parse(localStorage.getItem('atlas_custom_tests'))[0].name, 'Original', 'reload restores previous state');
    assert.equal(sink.tests.showAddCustom, true, 'editor stays open');
    assert.equal(sink.tests.customForm.name, 'Edited', 'edited input preserved for retry');
    await act(async () => {
      ok = sink.tests.handleAddCustomTest({ preventDefault() {} });
    });
    assert.equal(ok, true);
    assert.equal(sink.tests.customTests[0].name, 'Edited');
    assert.equal(JSON.parse(localStorage.getItem('atlas_custom_tests'))[0].name, 'Edited');
  } finally {
    await cleanup();
  }
});

test('Preset save failure preserves previous presets with retry', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    const before = [...sink.tests.presets];
    let ok;
    await withStorageFault(['atlas_test_presets'], async () => {
      await act(async () => {
        ok = sink.tests.savePresets([...before, { id: 'p_new', name: 'New', testIds: [] }]);
      });
    });
    assert.equal(ok, false);
    assert.deepEqual(sink.tests.presets, before, 'presets unchanged on failure');
    assert.equal(localStorage.getItem('atlas_test_presets'), null, 'no partial write');
    assert.ok(sink.ui.toasts.some((t) => /Could not save presets/.test(t.message)), 'failure feedback shown');
    await act(async () => {
      ok = sink.tests.savePresets([...before, { id: 'p_new', name: 'New', testIds: [] }]);
    });
    assert.equal(ok, true);
    assert.equal(sink.tests.presets.length, before.length + 1);
    assert.equal(JSON.parse(localStorage.getItem('atlas_test_presets')).length, before.length + 1, 'reload agrees');
  } finally {
    await cleanup();
  }
});

test('Bulk import failure preserves prior catalog with retry (import is atomic)', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.ok(app.includes('if (!setCustomTests(updated)) return false;'), 'import commits UI/success only after persistence');
  const { sink, act, cleanup } = await mountTestsProvider({
    seed: { atlas_custom_tests: [{ id: 'custom_keep', name: 'Keep', techniqueId: 'AML.T0034' }] },
  });
  try {
    const chosen = [{ id: 'import_1', name: 'Imported', techniqueId: 'AML.T0034' }];
    let ok;
    const restore = installStorageFault(['atlas_custom_tests']);
    try {
      await act(async () => {
        ok = sink.tests.setCustomTests([...sink.tests.customTests, ...chosen]);
      });
    } finally {
      restore();
    }
    assert.equal(ok, false, 'failed import write reports failure');
    assert.deepEqual(sink.tests.customTests.map((t) => t.id), ['custom_keep'], 'prior catalog preserved');
    assert.deepEqual(JSON.parse(localStorage.getItem('atlas_custom_tests')).map((t) => t.id), ['custom_keep'], 'reload agrees with prior catalog');
    await act(async () => {
      ok = sink.tests.setCustomTests([...sink.tests.customTests, ...chosen]);
    });
    assert.equal(ok, true, 'retry succeeds');
    assert.deepEqual(JSON.parse(localStorage.getItem('atlas_custom_tests')).map((t) => t.id), ['custom_keep', 'import_1'], 'retry commits atomically');
  } finally {
    await cleanup();
  }
});

test('Generated-test acceptance failure preserves review state with retry', async () => {
  const { readFileSync } = await import('node:fs');
  const hook = readFileSync(join(root, 'src/hooks/useAIGeneration.js'), 'utf8');
  assert.ok(hook.includes('if (!setCustomTests(updated)) return false;'), 'generated acceptance keeps preview on persistence failure');
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    const chosen = [{ id: 'ai_1', name: 'AI Test', techniqueId: 'AML.T0034' }];
    let ok;
    const restore = installStorageFault(['atlas_custom_tests']);
    try {
      await act(async () => {
        ok = sink.tests.setCustomTests([...sink.tests.customTests, ...chosen]);
      });
    } finally {
      restore();
    }
    assert.equal(ok, false, 'failed acceptance write reports failure');
    assert.deepEqual(sink.tests.customTests, [], 'generated tests not committed');
    assert.equal(localStorage.getItem('atlas_custom_tests'), null, 'reload shows absence of uncommitted tests, matching UI');
    await act(async () => {
      ok = sink.tests.setCustomTests([...sink.tests.customTests, ...chosen]);
    });
    assert.equal(ok, true, 'retry without regenerating succeeds');
    assert.equal(JSON.parse(localStorage.getItem('atlas_custom_tests')).length, 1);
  } finally {
    await cleanup();
  }
});

test('Remove failure keeps test visible, stays mounted, retry works', async () => {
  const { sink, act, cleanup } = await mountTestsProvider();
  try {
    const targetId = sink.tests.allTestsWithDisabled[0].id;
    assert.ok(!sink.tests.disabledTestIds.includes(targetId), 'precondition: test enabled');
    await withStorageFault(['atlas_disabled_tests'], async () => {
      await driveConfirm(sink, act, () => sink.tests.deleteTest(targetId), true);
    });
    // deleteTest returns via confirm flow; failure is signaled by unchanged state + toast, no throw.
    assert.ok(!sink.tests.disabledTestIds.includes(targetId), 'test remains immediately (no optimistic hide)');
    assert.ok(sink.tests.allTests.some((t) => t.id === targetId), 'test still in enabled suite');
    assert.ok(sink.ui.toasts.some((t) => /Could not save test removal/.test(t.message)), 'visible failure feedback');
    assert.ok(sink.tests, 'provider still mounted and usable after sustained failure (no unmount)');
    // Storage still holds the prior durable state.
    assert.equal(localStorage.getItem('atlas_disabled_tests'), null);
    // Retry succeeds and the removal becomes durable.
    await driveConfirm(sink, act, () => sink.tests.deleteTest(targetId), true);
    assert.ok(sink.tests.disabledTestIds.includes(targetId), 'retry commits removal');
    assert.deepEqual(JSON.parse(localStorage.getItem('atlas_disabled_tests')), [targetId], 'reload agrees with committed removal');
  } finally {
    await cleanup();
  }
});
