// Contract: src/hooks/useProviderModelSync.js owns
// the provider/model sync + selection-guard machinery — the three autoload
// effects (vault-unlock, runner-tab entry, per-provider refresh), the
// model-list/selection helper block and the four fallback/validity effects
// (selectedProvider, judgeConfig, genConfig, selectedModel) — carried out of
// App.jsx; App.jsx keeps the two selection STATES (selectedProvider
// / selectedModel stay App-owned, handed to the hook through the deps object)
// plus the hook adoption, and keeps its App-local JSX render helpers
// (renderGenSelector / renderJudgeSelector / renderActiveModelChip).
//
// The deps-object shape is the contract: the selection pair, the demo flag,
// the judge/gen config quadruple, the providers context pieces
// (providers, autoLoadProviderModels, providerModelsFor) and the vault/
// tab gates (vaultLocked, vaultLoading, activeTab). The hook body performs no
// context deep-reach (no useUI/useProviders/useSettings calls) and imports the
// sandbox constants directly from src/data/app-config.js. It returns exactly
// the eight derived/consumable names and NEVER the state setters — the states
// stay App-owned.
//
// Source-text assertions + a behavioral runtime that evaluates the hook source
// with its collaborators injected and a dep-tracking useEffect
// simulator — Node cannot import JSX / extensionless specifiers under bare
// node:test (repo convention: the sibling bundled-entry suites). The
// behavioral scenarios mirror the App.jsx bodies the hook carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_PROVIDER_ID, SANDBOX_MODELS } from '../src/data/app-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK_PATH = 'src/hooks/useProviderModelSync.js';
const APP_PATH = 'src/App.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

let hook = '';
let app = '';
try {
  hook = readSource(HOOK_PATH);
  app = readSource(APP_PATH);
} catch { /* missing target files fail their first assertion */ }

const countIn = (source, needle) => source.split(needle).length - 1;

// ---------------------------------------------------------------------------
// Extraction machinery (brace-aware, comment/string/template safe)
// ---------------------------------------------------------------------------

function scanGroup(src, i) {
  const closeOf = { '{': '}', '(': ')', '[': ']', "'": "'", '"': '"', '`': '`' };
  const open = src[i];
  const close = closeOf[open];
  if (!close) throw new Error(`scanGroup: not an opener at ${i}: ${JSON.stringify(open)}`);
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (open === '`' || open === "'" || open === '"') {
      if (c === open) return i + 1;
      if (open === '`' && c === '$' && src[i + 1] === '{') { i = scanGroup(src, i + 1); continue; }
      i += 1; continue;
    }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i); i = end < 0 ? src.length : end + 2; continue; }
    if (closeOf[c]) { i = scanGroup(src, i); continue; }
    if (c === close) return i + 1;
    i += 1;
  }
  throw new Error('scanGroup: unbalanced source');
}

function extractHookFunctionSource(src, name) {
  const m = src.match(new RegExp(`export function ${name}\\(`));
  assert.ok(m, `${name} must be exported from the hook module source`);
  let i = m.index + `export function ${name}`.length;
  while (/\s/.test(src[i])) i += 1;
  i = scanGroup(src, i);
  while (/\s/.test(src[i])) i += 1;
  i = scanGroup(src, i);
  return src.slice(m.index + 'export '.length, i);
}

// ---------------------------------------------------------------------------
// the hook module owns the machinery; App keeps only states + adoption
// ---------------------------------------------------------------------------

test('The hook module exists and exports useProviderModelSync', () => {
  assert.match(hook, /export (default )?(function|const) useProviderModelSync\b/, 'a named (or default) useProviderModelSync export is the public entry');
});

test('Every extracted concern has exactly one definition site — inside the hook', () => {
  const ownedDeclarations = [
    'const getActiveModelList = ',
    'const activeModels = getActiveModelList();',
    'const selectedProviderObj = providers.find(p => p.id === selectedProvider);',
    'const selectedJudgeProvider = providers.find(p => p.id === judgeConfig.provider);',
    'const judgeModelList = (() => {',
    'const selectedGenProvider = providers.find(cp => cp.id === effectiveGenConfig.provider);',
    'const genModelList = (() => {',
    'const providerSelectable = ',
    'const helperProviderSelectable = '
  ];
  for (const decl of ownedDeclarations) {
    assert.equal(countIn(hook, decl), 1, `${HOOK_PATH} defines ${JSON.stringify(decl)}`);
    assert.equal(countIn(app, decl), 0, `${APP_PATH} no longer declares ${JSON.stringify(decl)}`);
  }
  const effectGuards = [
    'if (!vaultLocked && !vaultLoading) {',
    "if (activeTab !== 'runner') return;",
    'if (providers.some(p => p.id === selectedProvider)) {',
    'if (providerSelectable(selectedProvider)) return;',
    'if (helperProviderSelectable(judgeConfig.provider)) return;',
    'if (helperProviderSelectable(effectiveGenConfig.provider)) return;',
    'if (!activeModels.find(m => m.id === selectedModel)) {'
  ];
  for (const guard of effectGuards) {
    assert.equal(countIn(hook, guard), 1, `${HOOK_PATH} owns the effect guard ${JSON.stringify(guard)}`);
    assert.equal(countIn(app, guard), 0, `${APP_PATH} no longer carries the effect guard ${JSON.stringify(guard)}`);
  }
});

test('The two selection states stay App-owned — the hook neither declares nor returns them', () => {
  assert.equal(countIn(app, "const [selectedProvider, setSelectedProvider] = useState(() => (\n    useDemoMode ? SANDBOX_PROVIDER_ID : ''\n  ));"), 1,
    'selectedProvider remains App state with the demo-mode initializer');
  assert.equal(countIn(app, "const [selectedModel, setSelectedModel] = useState('');"), 1,
    'selectedModel remains App state');
  assert.equal(countIn(hook, 'useState('), 0, 'the hook owns no state of its own');
  const returnBlock = hook.slice(hook.lastIndexOf('return {'));
  for (const forbidden of ['setSelectedProvider', 'setSelectedModel']) {
    assert.ok(!returnBlock.includes(forbidden), `the hook never returns ${forbidden} — the selection setters stay App-owned`);
  }
});

test('The hook takes the full cross-domain deps object, imports only the sandbox constants, and never deep-reaches a context', () => {
  const paramList = (() => {
    const m = hook.match(/export function useProviderModelSync\(/);
    assert.ok(m, 'the hook entry exists');
    let i = m.index + 'export function useProviderModelSync'.length;
    while (/\s/.test(hook[i])) i += 1;
    const end = scanGroup(hook, i);
    return hook.slice(i + 1, end - 1);
  })();
  for (const dep of [
    'selectedProvider', 'setSelectedProvider', 'selectedModel', 'setSelectedModel',
    'useDemoMode', 'judgeConfig', 'effectiveGenConfig', 'saveJudgeConfig', 'saveGenConfig',
    'providers', 'autoLoadProviderModels', 'providerModelsFor',
    'vaultLocked', 'vaultLoading', 'activeTab'
  ]) {
    assert.match(paramList, new RegExp(`\\b${dep}\\b`), `the deps object carries ${dep}`);
  }
  assert.match(hook, /import \{[^}]*SANDBOX_PROVIDER_ID[^}]*SANDBOX_MODELS[^}]*\} from '\.\.\/data\/app-config(\.js)?';/,
    "the sandbox constants are imported from '../data/app-config'");
  const importLines = hook.split('\n').filter((l) => /^\s*import\b/.test(l));
  for (const line of importLines) {
    assert.ok(!/providerModelsFor|autoLoadProviderModels|useUI|useProviders|useSettings/.test(line),
      `the hook injects collaborators via deps instead of importing/reaching them: ${line.trim()}`);
  }
  for (const contextHook of ['useUI(', 'useProviders(', 'useSettings(', 'useHistory(', 'useAudit(', 'useAIGen(', 'useTests(']) {
    assert.ok(!hook.includes(contextHook), `the hook body does not deep-reach ${contextHook}`);
  }
});

test('The hook returns exactly the A2 surface; App adopts it and keeps the render helpers + view wiring', () => {
  const returnBlock = hook.slice(hook.lastIndexOf('return {'));
  for (const name of ['activeModels', 'selectedProviderObj', 'selectedJudgeProvider', 'judgeModelList', 'selectedGenProvider', 'genModelList', 'providerSelectable', 'helperProviderSelectable']) {
    assert.match(returnBlock, new RegExp(`\\b${name}\\b`), `the hook returns ${name}`);
  }
  const adoptIdx = app.indexOf('= useProviderModelSync({');
  assert.ok(adoptIdx >= 0, 'App.jsx adopts the hook through an explicit deps object');
  const destructure = app.slice(app.lastIndexOf('const {', adoptIdx), adoptIdx);
  for (const name of ['activeModels', 'selectedProviderObj', 'selectedJudgeProvider', 'judgeModelList', 'selectedGenProvider', 'genModelList', 'providerSelectable', 'helperProviderSelectable']) {
    assert.match(destructure, new RegExp(`\\b${name}\\b`), `App destructures ${name} from the hook`);
  }
  for (const wiring of [
    'activeModels={activeModels}',
    'selectedProviderObj={selectedProviderObj}',
    'providerSelectable={providerSelectable}',
    'selectedJudgeProvider={selectedJudgeProvider}',
    'judgeModelList={judgeModelList}'
  ]) {
    assert.ok(app.includes(wiring), `the view mounts still receive ${wiring} through the hook-adopted identifiers`);
  }
  // The selector helpers resolve from either side: App-local, or components
  // defined exactly once in their own files. Either way each helper keeps
  // exactly one definition.
  const genComponent = readIfExists('src/components/GenModelSelector.jsx');
  const judgeComponent = readIfExists('src/components/JudgeModelSelector.jsx');
  const chipComponent = readIfExists('src/components/ActiveModelChip.jsx');
  assert.equal(countIn(app, 'const renderGenSelector = () => (') + countIn(genComponent, 'export function GenModelSelector('), 1, 'the gen selector keeps exactly one definition (App-local pre-T08, component post-T08)');
  assert.equal(countIn(app, 'const renderJudgeSelector = (disabled = false) => (') + countIn(judgeComponent, 'export function JudgeModelSelector('), 1, 'the judge selector keeps exactly one definition (App-local pre-T08, component post-T08)');
  assert.equal(countIn(app, 'const renderActiveModelChip = (label, cfg) => (') + countIn(chipComponent, 'export function ActiveModelChip('), 1, 'the chip keeps exactly one definition (App-local pre-T08, component post-T08)');
});

// ---------------------------------------------------------------------------
// Behavioral battery: the hook source, driven with the same scenarios and
// dep-tracking semantics.
// ---------------------------------------------------------------------------

let hookFnSource = null;
try {
  hookFnSource = extractHookFunctionSource(hook, 'useProviderModelSync');
} catch { /* behavioral tests fail with a clear message when the hook is missing */ }

const makeEnv = (overrides = {}) => {
  const env = {
    activeTab: 'dashboard',
    vaultLocked: true,
    vaultLoading: true,
    useDemoMode: false,
    providers: [],
    judgeConfig: { provider: '', model: '' },
    genConfig: { provider: '', model: '' },
    selectedProvider: '',
    selectedModel: '',
    SANDBOX_PROVIDER_ID,
    SANDBOX_MODELS,
    providerModelsFor: (cp) => (cp.models || []).map(m => ({ id: m, name: m })),
    ...overrides
  };
  if (overrides.effectiveGenConfig === undefined) {
    env.effectiveGenConfig = env.genConfig || env.judgeConfig; // SettingsContext: genConfig || judgeConfig
  }
  return env;
};

function makeHarness(overrides = {}) {
  assert.ok(hookFnSource, 'the hook module must export useProviderModelSync for the behavioral contract');
  const env = makeEnv(overrides);
  const calls = [];
  const setters = {
    setSelectedProvider: (v) => { calls.push(['setSelectedProvider', v]); env.selectedProvider = v; },
    setSelectedModel: (v) => { calls.push(['setSelectedModel', v]); env.selectedModel = v; },
    autoLoadProviderModels: (...args) => { calls.push(['autoLoadProviderModels', ...args]); },
    saveJudgeConfig: (cfg) => { calls.push(['saveJudgeConfig', cfg]); env.judgeConfig = cfg; },
    saveGenConfig: (cfg) => { calls.push(['saveGenConfig', cfg]); env.genConfig = cfg; }
  };
  // The hook source references useEffect and the sandbox constants as free
  // variables (the real module imports them) — bind them per render through an
  // outer-scope closure, the same way the sibling hook suites bind hook-module
  // imports.
  let currentEffects = [];
  let lastApi = null;
  let prevDeps = null;
  const renderInstance = () => {
    if (overrides.effectiveGenConfig === undefined) {
      env.effectiveGenConfig = env.genConfig || env.judgeConfig; // SettingsContext: genConfig || judgeConfig
    }
    currentEffects = [];
    const deps = {
      ...env,
      ...setters,
      useEffect: (fn, depArr) => currentEffects.push({ fn, deps: depArr })
    };
    const paramNames = Object.keys(deps);
    const mountProviderModelSync = new Function(...paramNames, `"use strict"; return (${hookFnSource});`)
      (...paramNames.map((n) => deps[n]));
    lastApi = mountProviderModelSync(deps);
  };
  const step = () => {
    renderInstance();
    let ran = false;
    currentEffects.forEach((eff, i) => {
      const prev = prevDeps ? prevDeps[i] : undefined;
      const changed = prev === undefined
        || eff.deps.length !== prev.length
        || eff.deps.some((d, j) => !Object.is(d, prev[j]));
      if (changed) { ran = true; eff.fn(); }
    });
    prevDeps = currentEffects.map((e) => e.deps);
    return ran;
  };
  const commit = (maxPasses = 12) => {
    let guard = 0;
    while (step()) {
      if (++guard > maxPasses) throw new Error('harness did not settle');
    }
  };
  commit(); // mount pass
  const names = () => calls.map((c) => c[0]);
  return { env, calls, names, commit, api: () => lastApi };
}

test('Autoload E1: fires once per vault unlock/hydration, with no args, and never while locked or loading', () => {
  const { env, names, commit } = makeHarness(); // vaultLocked=true, vaultLoading=true
  assert.equal(names().filter((n) => n === 'autoLoadProviderModels').length, 0, 'no preload while locked+loading');
  env.vaultLoading = false; // dep change, still locked
  commit();
  assert.equal(names().filter((n) => n === 'autoLoadProviderModels').length, 0, 'still no preload while locked');
  env.vaultLocked = false; // the unlock transition
  commit();
  assert.equal(names().filter((n) => n === 'autoLoadProviderModels').length, 1, 'exactly one preload per unlock, with no args');
  env.activeTab = 'settings'; // unrelated dep change (not the runner tab — E2 owns that)
  commit();
  assert.equal(names().filter((n) => n === 'autoLoadProviderModels').length, 1, 'quiescence + unrelated deps do not repeat the preload');
  env.vaultLocked = true; // re-lock: runs but guard blocks
  commit();
  env.vaultLocked = false; // second unlock
  commit();
  assert.equal(names().filter((n) => n === 'autoLoadProviderModels').length, 2, 'one preload per unlock, not once ever');
});

test('Autoload E2: fires on runner-tab entry (mount included) and on every re-entry, never for other tabs', () => {
  const { env, calls, commit } = makeHarness(); // vault stays locked: only E2 may fire
  assert.equal(calls.filter((c) => c[0] === 'autoLoadProviderModels').length, 0, 'dashboard mount does not preload via E2');
  env.activeTab = 'runner';
  commit();
  assert.deepEqual(calls.filter((c) => c[0] === 'autoLoadProviderModels'), [['autoLoadProviderModels']], 'entering the runner tab preloads once, with no args');
  env.activeTab = 'settings';
  commit();
  assert.equal(calls.filter((c) => c[0] === 'autoLoadProviderModels').length, 1, 'leaving to a non-runner tab never preloads');
  env.activeTab = 'runner';
  commit();
  assert.equal(calls.filter((c) => c[0] === 'autoLoadProviderModels').length, 2, 're-entering the runner tab preloads again');
});

test('Autoload E3: refreshes only when the selected provider is a real configured one, passing its exact id', () => {
  const p1 = { id: 'prov-1', enabled: true, models: ['m1'] };
  const p2 = { id: 'prov-2', enabled: true, models: ['m2'] };
  const { env, calls, commit } = makeHarness({
    providers: [p1, p2], selectedProvider: 'prov-1', selectedModel: 'm1'
  }); // vault stays locked: only E3 may fire
  assert.deepEqual(calls.filter((c) => c[0] === 'autoLoadProviderModels'), [['autoLoadProviderModels', 'prov-1']],
    'mount refreshes the selected provider with its exact id');
  env.selectedProvider = 'prov-2'; // E3 dep change
  commit();
  assert.deepEqual(calls.filter((c) => c[0] === 'autoLoadProviderModels'), [['autoLoadProviderModels', 'prov-1'], ['autoLoadProviderModels', 'prov-2']],
    'switching providers refreshes the new one');
  env.selectedProvider = SANDBOX_PROVIDER_ID; // sandbox is not a configured provider
  commit();
  assert.equal(calls.filter((c) => c[0] === 'autoLoadProviderModels').length, 2, 'the sandbox pseudo-provider is never refreshed');
  env.selectedProvider = '';
  commit();
  assert.equal(calls.filter((c) => c[0] === 'autoLoadProviderModels').length, 2, 'an empty selection is never refreshed');
});

test('Helpers: the hook serves SANDBOX_MODELS in demo, providerModelsFor(cp) for real providers, [] otherwise', () => {
  const cp = { id: 'prov-1', enabled: true, models: ['m1', 'm2'] };
  const sandbox = makeHarness({ useDemoMode: true, providers: [cp], selectedProvider: SANDBOX_PROVIDER_ID });
  assert.deepEqual(sandbox.api().activeModels, SANDBOX_MODELS, 'sandbox selection serves the real SANDBOX_MODELS list');
  assert.deepEqual(sandbox.api().activeModels, [
    { id: 'Demo Secure', name: 'Demo Secure' },
    { id: 'Demo Vulnerable', name: 'Demo Vulnerable' }
  ], 'the sandbox list is exactly the two demo models');
  const real = makeHarness({ providers: [cp], selectedProvider: 'prov-1' });
  assert.deepEqual(real.api().activeModels, [{ id: 'm1', name: 'm1' }, { id: 'm2', name: 'm2' }],
    'a real provider serves its cached models mapped through providerModelsFor');
  const noModels = makeHarness({ providers: [{ id: 'prov-2', enabled: true }], selectedProvider: 'prov-2' });
  assert.deepEqual(noModels.api().activeModels, [], 'a provider without a cached list serves []');
  // The unknown-id case runs with no enabled provider in the roster, so the
  // E4 fallback has no rescue option and the unknown selection survives mount.
  const unknown = makeHarness({ providers: [{ id: 'other', enabled: false }], selectedProvider: 'ghost' });
  assert.deepEqual(unknown.api().activeModels, [], 'an unknown provider id serves []');
  assert.deepEqual(unknown.calls.filter((c) => c[0] === 'setSelectedProvider'), [], 'no rescue available for the unknown selection');
});

test('Helpers: the lookup quadruple finds exact provider objects and the model lists mirror the raw cached arrays', () => {
  const cpA = { id: 'prov-a', enabled: true, models: ['ma'] };
  const cpB = { id: 'prov-b', enabled: true, models: ['mb', 'mb2'] };
  const run = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [cpA, cpB],
    selectedProvider: 'prov-b',
    judgeConfig: { provider: 'prov-a', model: 'ma' },
    effectiveGenConfig: { provider: 'prov-b', model: 'mb2' }
  });
  const api = run.api();
  assert.strictEqual(api.selectedProviderObj, cpB, 'selectedProviderObj is the exact provider object for the selection');
  assert.strictEqual(api.selectedJudgeProvider, cpA, 'selectedJudgeProvider is the exact provider object for judgeConfig.provider');
  assert.strictEqual(api.selectedGenProvider, cpB, 'selectedGenProvider is the exact provider object for effectiveGenConfig.provider');
  assert.strictEqual(api.judgeModelList, cpA.models, 'judgeModelList IS the raw cached models array (not the mapped options)');
  assert.deepEqual(api.judgeModelList, ['ma']);
  assert.strictEqual(api.genModelList, cpB.models, 'genModelList IS the raw cached models array of the gen provider');
  assert.deepEqual(api.genModelList, ['mb', 'mb2']);
  const absent = makeHarness({ providers: [cpA], judgeConfig: { provider: 'ghost', model: '' }, effectiveGenConfig: { provider: 'ghost', model: '' } });
  assert.equal(absent.api().selectedJudgeProvider, undefined, 'an unconfigured judge provider resolves to undefined');
  assert.deepEqual(absent.api().judgeModelList, [], 'an unconfigured judge provider serves an empty model list');
  assert.deepEqual(absent.api().genModelList, [], 'an unconfigured gen provider serves an empty model list');
});

test('Helpers: providerSelectable (sandbox only in demo mode) vs helperProviderSelectable (sandbox never)', () => {
  const cp = { id: 'prov-1', enabled: true };
  const disabled = { id: 'prov-2', enabled: false };
  const implicit = { id: 'prov-3' };
  const run = makeHarness({ useDemoMode: true, providers: [cp, disabled, implicit], selectedProvider: SANDBOX_PROVIDER_ID });
  const { providerSelectable, helperProviderSelectable } = run.api();
  assert.equal(providerSelectable(SANDBOX_PROVIDER_ID), true, 'sandbox is selectable while demo mode is on');
  assert.equal(helperProviderSelectable(SANDBOX_PROVIDER_ID), false, 'sandbox is NEVER selectable for judge/generator, even in demo mode');
  assert.equal(providerSelectable('prov-1'), true, 'an enabled provider is selectable');
  assert.equal(providerSelectable('prov-2'), false, 'enabled:false is not selectable');
  assert.equal(providerSelectable('prov-3'), true, 'an undefined enabled flag counts as enabled');
  assert.equal(providerSelectable('ghost'), false, 'an unknown id is not selectable');
  assert.equal(helperProviderSelectable('prov-1'), true, 'an enabled real provider is helper-selectable');
  assert.equal(helperProviderSelectable('prov-2'), false, 'a disabled provider is not helper-selectable');
  const noDemo = makeHarness({ useDemoMode: false, providers: [cp], selectedProvider: SANDBOX_PROVIDER_ID });
  assert.equal(noDemo.api().providerSelectable(SANDBOX_PROVIDER_ID), false, 'sandbox is not selectable when demo mode is off');
  assert.equal(noDemo.api().helperProviderSelectable(SANDBOX_PROVIDER_ID), false);
});

test('Fallback E4: demo-off rescue skips disabled providers and picks the first enabled one in order', () => {
  const { calls, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }, { id: 'prov-2', enabled: false }, { id: 'prov-3', enabled: true }],
    selectedProvider: SANDBOX_PROVIDER_ID // stale sandbox selection with demo mode off
  });
  assert.deepEqual(calls.filter((c) => c[0] === 'setSelectedProvider'), [['setSelectedProvider', 'prov-1']],
    'mount rescues the stale sandbox selection to the first ENABLED provider (order-aware)');
  commit();
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 1, 'quiescence does not re-rescue');
});

test('Fallback E4: in demo mode the sandbox pseudo-provider wins the rescue order over real providers', () => {
  const { calls, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    useDemoMode: true,
    providers: [{ id: 'prov-1', enabled: true }, { id: 'prov-2', enabled: true }],
    selectedProvider: 'vanished-provider'
  });
  assert.deepEqual(calls.filter((c) => c[0] === 'setSelectedProvider'), [['setSelectedProvider', SANDBOX_PROVIDER_ID]],
    'options are [sandbox, ...enabled ids], so the removed selection falls back to sandbox first');
  commit();
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 1, 'quiescence does not re-rescue');
});

test('Fallback E4: no options means no rescue (selection is kept) and a valid selection is never touched', () => {
  const { calls, env, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: false }],
    selectedProvider: 'vanished-provider'
  });
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 0,
    'with every provider disabled the stale selection is kept as-is');
  env.providers = [{ id: 'prov-1', enabled: false }]; // new identity, same content
  commit();
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 0, 'still no rescue when options stay empty');
  const valid = makeHarness({ providers: [{ id: 'prov-1', enabled: true }], selectedProvider: 'prov-1' });
  assert.equal(valid.calls.filter((c) => c[0] === 'setSelectedProvider').length, 0, 'a valid enabled selection is left alone');
});

test('Fallback E4: the rescue triggers only on its real deps [useDemoMode, providers] — a bare selection drift does not rescue', () => {
  const { env, calls, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }],
    selectedProvider: 'prov-1'
  });
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 0, 'clean mount');
  env.selectedProvider = 'ghost'; // drift WITHOUT a providers/useDemoMode change
  commit();
  assert.equal(calls.filter((c) => c[0] === 'setSelectedProvider').length, 0,
    'selectedProvider is NOT a dep: the drift alone must not rescue');
  env.providers = [{ id: 'prov-1', enabled: true }]; // new identity — the real trigger
  commit();
  assert.deepEqual(calls.filter((c) => c[0] === 'setSelectedProvider'), [['setSelectedProvider', 'prov-1']],
    'the next providers change runs the fallback and rescues ghost → prov-1');
});

test('Fallback E5: vault-loading and vault-locked gates run before any rescue; the unlock fires it exactly once', () => {
  const { env, calls, commit } = makeHarness({
    judgeConfig: { provider: 'gone', model: 'm' },
    providers: [{ id: 'prov-1', enabled: true }]
  }); // vaultLocked=true, vaultLoading=true
  assert.equal(calls.filter((c) => c[0] === 'saveJudgeConfig').length, 0, 'no rescue while the vault is loading');
  env.vaultLoading = false; // still locked — a locked vault hides the real list
  commit();
  assert.equal(calls.filter((c) => c[0] === 'saveJudgeConfig').length, 0, 'no rescue while the vault is locked');
  env.vaultLocked = false; // unlock
  commit();
  assert.deepEqual(calls.filter((c) => c[0] === 'saveJudgeConfig'), [['saveJudgeConfig', { provider: 'prov-1', model: '' }]],
    'the unlock fires exactly one rescue to the first enabled provider, model reset to empty');
  commit();
  assert.equal(calls.filter((c) => c[0] === 'saveJudgeConfig').length, 1, 'and never again without a dep change');
});

test('Fallback E5: a valid judge config is kept; an all-disabled roster keeps the stored config; the sandbox config is rescued away', () => {
  const kept = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }],
    judgeConfig: { provider: 'prov-1', model: 'm1' }
  });
  assert.equal(kept.calls.filter((c) => c[0] === 'saveJudgeConfig').length, 0, 'a valid enabled judge config is never overwritten');
  assert.equal(kept.api().selectedJudgeProvider, kept.env.providers[0], 'the kept judge provider resolves to the real object');

  const starving = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: false }],
    judgeConfig: { provider: 'gone', model: 'm' }
  });
  assert.equal(starving.calls.filter((c) => c[0] === 'saveJudgeConfig').length, 0,
    'no options → keep the stored config (never save an empty provider)');

  const sandboxJudge = makeHarness({
    vaultLocked: false, vaultLoading: false,
    useDemoMode: true,
    providers: [{ id: 'prov-1', enabled: true }, { id: 'prov-2', enabled: true }],
    judgeConfig: { provider: SANDBOX_PROVIDER_ID, model: 'Demo Secure' }
  });
  assert.deepEqual(sandboxJudge.calls.filter((c) => c[0] === 'saveJudgeConfig'),
    [['saveJudgeConfig', { provider: 'prov-1', model: '' }]],
    'the sandbox pseudo-provider is driven out of the judge slot on the first pass (options order: enabled ids in roster order)');
});

test('Fallback E6: rescues an invalid gen config directly, resetting the model and never touching the judge config', () => {
  const { calls, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }, { id: 'prov-2', enabled: false }],
    judgeConfig: { provider: 'prov-1', model: 'judge-m' },
    genConfig: { provider: 'gone', model: 'gen-m' }
  });
  assert.deepEqual(calls.filter((c) => c[0] === 'saveGenConfig'), [['saveGenConfig', { provider: 'prov-1', model: '' }]],
    'the gen config is rescued to the first enabled provider with model reset to empty');
  assert.equal(calls.filter((c) => c[0] === 'saveJudgeConfig').length, 0, 'the valid judge config is untouched');
  commit();
  assert.equal(calls.filter((c) => c[0] === 'saveGenConfig').length, 1, 'quiescence does not re-save');
});

test('Fallback E6: vault gates and the all-disabled roster keep the stored gen config', () => {
  const { env, calls, commit } = makeHarness({
    genConfig: { provider: 'gone', model: 'gen-m' },
    providers: [{ id: 'prov-1', enabled: true }]
  }); // locked + loading
  assert.equal(calls.filter((c) => c[0] === 'saveGenConfig').length, 0, 'no rescue while loading');
  env.vaultLoading = false;
  commit();
  assert.equal(calls.filter((c) => c[0] === 'saveGenConfig').length, 0, 'no rescue while locked');
  env.providers = [{ id: 'prov-1', enabled: false }]; // roster collapses — deps change, options empty
  env.vaultLocked = false;
  commit();
  assert.equal(calls.filter((c) => c[0] === 'saveGenConfig').length, 0,
    'unlocked but no enabled provider → keep the stored gen config');
});

test('Fallback E6: a null gen config inherits the judge rescue — E6 re-runs on the judgeConfig identity change and saves the gen slot once', () => {
  const { calls, env, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }],
    judgeConfig: { provider: 'gone', model: 'jm' },
    genConfig: null // effectiveGenConfig === judgeConfig (SettingsContext: genConfig || judgeConfig)
  });
  // Mount batch: both effects run against pre-commit state — E5 rescues the
  // judge slot; E6 sees the inherited stale provider and rescues the gen slot.
  assert.deepEqual(calls.filter((c) => c[0] === 'saveJudgeConfig'), [['saveJudgeConfig', { provider: 'prov-1', model: '' }]]);
  assert.deepEqual(calls.filter((c) => c[0] === 'saveGenConfig'), [['saveGenConfig', { provider: 'prov-1', model: '' }]]);
  commit(); // settle: E6 re-runs on the new judgeConfig identity but the inherited config is now valid
  assert.equal(calls.filter((c) => c[0] === 'saveJudgeConfig').length, 1, 'no judge re-save loop');
  assert.equal(calls.filter((c) => c[0] === 'saveGenConfig').length, 1, 'no gen re-save loop — inheritance settles, it never double-saves');
  assert.deepEqual(env.genConfig, { provider: 'prov-1', model: '' }, 'the gen slot ends up owning the rescued object');
  assert.deepEqual(env.judgeConfig, { provider: 'prov-1', model: '' }, 'the judge slot ends up owning the rescued object');
});

test('Validity E7: keeps a valid selection, rescues an invalid one to the first active model, resets to empty on an empty list', () => {
  const sandbox = makeHarness({
    vaultLocked: false, vaultLoading: false,
    useDemoMode: true, providers: [],
    selectedProvider: SANDBOX_PROVIDER_ID, selectedModel: 'Demo Vulnerable'
  });
  assert.equal(sandbox.calls.filter((c) => c[0] === 'setSelectedModel').length, 0, 'a valid sandbox model selection is kept');

  const stale = makeHarness({
    vaultLocked: false, vaultLoading: false,
    useDemoMode: true, providers: [],
    selectedProvider: SANDBOX_PROVIDER_ID, selectedModel: 'stale-model'
  });
  assert.deepEqual(stale.calls.filter((c) => c[0] === 'setSelectedModel'), [['setSelectedModel', 'Demo Secure']],
    'an invalid selection over the sandbox list is rescued to the FIRST demo model');

  const real = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true, models: ['m1', 'm2'] }],
    selectedProvider: 'prov-1', selectedModel: 'm2'
  });
  assert.equal(real.calls.filter((c) => c[0] === 'setSelectedModel').length, 0, 'a valid cached-model selection is kept');

  const empty = makeHarness({
    vaultLocked: false, vaultLoading: false,
    providers: [{ id: 'prov-1', enabled: true }],
    selectedProvider: 'prov-1', selectedModel: 'orphan'
  });
  assert.deepEqual(empty.calls.filter((c) => c[0] === 'setSelectedModel'), [['setSelectedModel', '']],
    'no cached models → the selection resets to empty');
});

test('Validity E7: runs only on its real deps [selectedProvider, providers, useDemoMode] — a bare model drift does not re-validate', () => {
  const { env, calls, commit } = makeHarness({
    vaultLocked: false, vaultLoading: false,
    useDemoMode: true, providers: [],
    selectedProvider: SANDBOX_PROVIDER_ID, selectedModel: 'Demo Secure'
  });
  assert.equal(calls.filter((c) => c[0] === 'setSelectedModel').length, 0, 'clean mount');
  env.selectedModel = 'ghost-model'; // drift WITHOUT a dep change
  commit();
  assert.equal(calls.filter((c) => c[0] === 'setSelectedModel').length, 0,
    'selectedModel is NOT a dep: the drift alone must not re-validate');
  env.providers = []; // new identity — the real trigger
  commit();
  assert.deepEqual(calls.filter((c) => c[0] === 'setSelectedModel'), [['setSelectedModel', 'Demo Secure']],
    'the next dep change re-validates and rescues ghost → Demo Secure');
});
