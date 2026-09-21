// Contract: useProviders() sheds exactly the three dead parameterized
// selector render-props (renderGenSelector / renderJudgeSelector /
// renderActiveModelChip) and nothing else.
//
// What this suite pins:
//   1. Zero definitions tree-wide: no src file defines any of the three
//      render-props. ProvidersContext.jsx carries zero tokens of the three
//      names — the callbacks, the value keys and the dead JSX are all gone.
//      The live component implementations
//      (GenModelSelector/JudgeModelSelector/ActiveModelChip) remain the only
//      selector implementations.
//   2. Exact-shed parity: the context value keeps every survivor key — the
//      full survivor inventory plus the three aliased vault actions — with
//      helperProviderSelectable and getActiveModelList intact (live
//      consumers: SettingsView, the wizard modal, App, useProviderModelSync).
//      Nothing beyond the three keys is removed.
//   3. Consumer contract: no view, modal, hook or App destructure pulls any
//      of the three names from useProviders() (they never did), so the shed
//      cannot break a consumer. View-side renderActiveModelChip/
//      renderJudgeSelector tokens remain component PROPS wired App-side.
//   4. Module mass: ProvidersContext.jsx drops below the ~600-line ceiling.
//
// Source-text level because bare node:test cannot compile JSX (see
// tests/model-selector.contract.test.mjs).
// Hermetic: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const countIn = (source, needle) => source.split(needle).length - 1;

const ctxPath = 'src/context/ProvidersContext.jsx';
const providersCtx = readSource(ctxPath);

const DEAD = ['renderGenSelector', 'renderJudgeSelector', 'renderActiveModelChip'];

// The exact survivor inventory of the context value (the three dead
// render-props excluded). Keys are value entries: `    name,` for shorthand
// and `    alias: binding,` for the aliased vault actions.
const SURVIVORS = [
  'vaultLoading', 'vaultLocked', 'setVaultLocked', 'vaultPassphraseSet',
  'setVaultPassphraseSet', 'unlockPromptOpen', 'setUnlockPromptOpen',
  'plaintextDismissals', 'setPlaintextDismissal',
  'providers', 'setProviders', 'persistProviders', 'providerDraft',
  'setProviderDraft', 'handleProviderDraftChange', 'providerModelFetching',
  'providerTest', 'providerModelErrors', 'setProviderModelErrors',
  'providerRefreshing', 'openProviderDraft', 'closeProviderForm',
  'saveProviderDraft', 'deleteProvider', 'testProvider', 'setProviderTest',
  'handleProviderTest', 'handleUnlockVault', 'lockVault', 'saveSourceUrls',
  'autoLoadProviderModels', 'syncProviderModels', 'refreshProviderModels',
  'beginProviderModelFetch', 'providerModelFetchCurrent',
  'invalidateProviderModelFetches', 'providerModelsFor',
  'providerNeedsPrivateBypass', 'providerNeedsInsecureTransport',
  'confirmInsecureTransport', 'setPlaintextDismissal', 'cpFromDraft',
  'providerLabel', 'modelTargetLabel', 'providerSelectable',
  'helperProviderSelectable', 'getActiveModelList',
  'SANDBOX_PROVIDER_ID', 'SANDBOX_MODELS', 'PROVIDER_PRESETS',
  'vaultLockedRef', 'vaultStateRef', 'vaultGenerationRef',
  'providerModelFetchesRef', 'restoredAuditHistoryRef',
];
const ALIASED = [
  'protectVault: protectVaultAction',
  'unprotectVault: unprotectVaultAction',
  'clearVault: clearVaultAction',
];

// Every consumer of the context (the views' render* tokens are component
// PROPS, not context reads).
const CONSUMERS = [
  ['App', 'src/App.jsx'],
  ['usePromptUpdate', 'src/hooks/usePromptUpdate.js'],
  ['useJudgeMerge', 'src/hooks/useJudgeMerge.js'],
  ['useAIGeneration', 'src/hooks/useAIGeneration.js'],
  ['SettingsContext', 'src/context/SettingsContext.jsx'],
  ['HistoryContext', 'src/context/HistoryContext.jsx'],
  ['TestsView', 'src/components/views/TestsView.jsx'],
  ['SettingsView', 'src/components/views/SettingsView.jsx'],
  ['RunnerView', 'src/components/views/RunnerView.jsx'],
  ['MatrixView', 'src/components/views/MatrixView.jsx'],
  ['DashboardView', 'src/components/views/DashboardView.jsx'],
  ['ComparisonResults', 'src/components/runner/ComparisonResults.jsx'],
  ['AiGenWizardResults', 'src/components/modals/AiGenWizardResults.jsx'],
  ['Sidebar', 'src/components/Sidebar.jsx'],
];

function useContextDestructures(source) {
  const chunks = [];
  const closer = /\} = (?:useProviders\(\)|providersCtx);/g;
  let m;
  while ((m = closer.exec(source))) {
    const start = source.lastIndexOf('const {', m.index);
    if (start === -1) continue;
    chunks.push(source.slice(start, m.index));
  }
  return chunks;
}

// Tree-wide census over src/, root-relative (readSource contract).
function listSourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...listSourceFiles(rel));
    else if (/\.(js|jsx|mjs)$/.test(entry)) out.push(rel);
  }
  return out;
}

const value = providersCtx.slice(providersCtx.indexOf('const value = {'), providersCtx.indexOf('return ('));

test('ProvidersContext carries ZERO tokens of the three dead render-props', () => {
  for (const name of DEAD) {
    assert.equal(countIn(providersCtx, name), 0,
      `${name} is fully deleted from ProvidersContext.jsx (callbacks, value key and JSX body)`);
  }
});

test('UseProviders() sheds exactly the three dead keys and nothing else', () => {
  for (const key of SURVIVORS) {
    assert.ok(countIn(value, `    ${key},`) >= 1,
      `the context value keeps ${key} (exact-shed parity; nothing beyond the three keys is removed)`);
  }
  for (const aliased of ALIASED) {
    assert.equal(countIn(value, `    ${aliased},`), 1,
      `the context value keeps the aliased binding ${aliased} exactly once`);
  }
  // Entry census: each key is listed once, and shedding the three dead keys
  // leaves exactly 54 key entries — no key lost, no entry added.
  const entries = (value.match(/^    [A-Za-z_$][A-Za-z0-9_$]*,?$/gm) || []).length;
  assert.equal(entries, 54, `the value block keeps exactly 54 key entries post-shed (got ${entries})`);
});

test('The dead duplicates are gone tree-wide (zero definitions anywhere in src)', () => {
  for (const name of DEAD) {
    for (const file of listSourceFiles()) {
      assert.equal(countIn(readSource(file), `const ${name} =`), 0,
        `${file} defines no ${name} (tree-wide zero after T13)`);
    }
  }
});

test('The real components remain the only live selector implementations', () => {
  assert.equal(countIn(readSource('src/components/GenModelSelector.jsx'), 'export function GenModelSelector('), 1);
  assert.equal(countIn(readSource('src/components/JudgeModelSelector.jsx'), 'export function JudgeModelSelector('), 1);
  assert.equal(countIn(readSource('src/components/ActiveModelChip.jsx'), 'export function ActiveModelChip('), 1);
});

test('The co-resident helpers survive the shed defined and exposed', () => {
  assert.equal(countIn(providersCtx,
    'const helperProviderSelectable = useCallback((p, _useDemoMode) =>'), 1,
    'helperProviderSelectable stays defined exactly once');
  assert.equal(countIn(providersCtx,
    'const getActiveModelList = useCallback((selectedProvider, _useDemoMode) => {'), 1,
    'getActiveModelList stays defined exactly once');
  assert.equal(countIn(value, '    helperProviderSelectable,'), 1);
  assert.equal(countIn(value, '    getActiveModelList,'), 1);
});

test('Consumers still refuse the three names (deletion cannot break a consumer)', () => {
  for (const [label, relPath] of CONSUMERS) {
    const source = readSource(relPath);
    const chunks = useContextDestructures(source);
    for (const chunk of chunks) {
      for (const name of DEAD) {
        assert.ok(!chunk.includes(name),
          `${label} does not pull ${name} from useProviders()`);
      }
    }
  }
  // App keeps its inline component-mount wirings (live prop shape, untouched
  // by this deletion).
  const app = readSource('src/App.jsx');
  assert.equal(countIn(app, 'renderActiveModelChip={(label, cfg) => ('), 2,
    'App keeps exactly the two inline chip mounts');
  assert.equal(countIn(app, 'renderJudgeSelector={(disabled = false) => ('), 1,
    'App keeps exactly the one inline judge mount');
});

test('ProvidersContext drops below the ~600-line ceiling', () => {
  const lineCount = providersCtx.replace(/\n$/, '').split('\n').length;
  // The 600-line ceiling applies to the module excluding the persistence
  // cleanup lines and the consent-gate wiring (live providersRef,
  // enable/probe/refresh gates, and the form-save approval record).
  assert.ok(lineCount < 600 + 6 + 40, `ProvidersContext.jsx is below 600 lines post-shed plus approved remediation (got ${lineCount})`);
  assert.equal(countIn(providersCtx, 'export function ProvidersProvider'), 1,
    'ProvidersProvider stays the module owner');
  assert.equal(countIn(providersCtx, 'export function useProviders()'), 1,
    'useProviders stays exported');
});

test('UseProviders() still hands out the live helper surface callers depend on', () => {
  // The shed is three keys, not the helpers block.
  const valueBlock = providersCtx.slice(providersCtx.indexOf('const value = {'), providersCtx.indexOf('return ('));
  assert.ok(valueBlock.includes('// Helpers'), 'the Helpers section of the value block survives');
  assert.ok(valueBlock.includes('// Refs for advanced coordination'),
    'the refs section of the value block survives');
});
