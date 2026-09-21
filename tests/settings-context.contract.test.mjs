// Contract: SettingsContext is the sole owner of the settings domain incl. the
// judge/gen helper-model configs.
//
// Node cannot import the JSX modules, so — exactly like
// tests/ai-gen-context.contract.test.mjs — every assertion here works at
// source-text level against:
//
//   src/App.jsx                    (the consumer emptied of the settings cluster)
//   src/context/SettingsContext.jsx (the single source of truth)
//   src/main.jsx                   (the provider-mount seam)
//   src/components/views/MatrixView.jsx (the context consumer)
//
// Contract coverage:
//   - SettingsProvider owns demo mode, proxy config, collapse map, ATLAS
//     sync trio + live sync, and the judge/gen helper-model configs
//     (state + effective memo + save handlers); App consumes useSettings()
//   - the setProxyConfig side-effect wiring travels with the proxy state
//     (secret-scan + apply + persist, incl. addToast); the demo-mode toggle
//     gates DEMO_TARGETS seeding and simulated runs
//   - judge/generator model pickers, the ATLAS sync status line and the
//     settings-card collapse states keep their exact render/persist wiring
//   - the grep gates: zero localStorage reads for
//     atlas_demo_mode/atlas_proxy/atlas_settings_collapsed in App.jsx
//     and zero local judgeConfig/genConfig useState declarations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const CTX_PATH = 'src/context/SettingsContext.jsx';
const MAIN_PATH = 'src/main.jsx';
const MATRIX_PATH = 'src/components/views/MatrixView.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
// The selector component files may not exist (the union reads resolve from
// either side of the split).
const readIfExists = (relPath) => { try { return sourceOf(relPath); } catch { return ''; } };
const genComponent = readIfExists('src/components/GenModelSelector.jsx');
const judgeComponent = readIfExists('src/components/JudgeModelSelector.jsx');
// The Providers card + the shared card header may live in these files (the
// pins resolve across the union file set).
const providersCard = readIfExists('src/components/views/settings/ProvidersCard.jsx');
const cardHeader = readIfExists('src/components/views/settings/SettingsCardHeader.jsx');

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(...listSourceFiles(join(dir, entry.name)));
    else files.push(join(dir, entry.name));
  }
  return files;
}

// The names App binds from useSettings(). Deliberately minimal: only what App
// still references (setters owned by the provider internals are NOT
// destructured, and backupPassphrase MUST stay out — App binds that name from
// useBackupFlow, and a second binding would be a redeclaration error).
//
// The ATLAS sync trio minus the status line (syncLiveATLAS, loadingATLAS) and
// the whole proxy cluster (proxyEnabled/proxyUrl/proxyMode/proxyCategories +
// their setters) are bound by SettingsView (VIEW_BINDING below).
// atlasSyncStatus is consumed by MatrixView. collapsedSettings +
// toggleSettingsCard are consumed by the SettingsCardHeader component (it
// reads the collapse state itself) — App's destructure omits the pair.
const APP_BINDING = [
  'useDemoMode', 'setUseDemoMode',
  'judgeConfig', 'saveJudgeConfig',
  'saveGenConfig', 'effectiveGenConfig',
  'atlasMatrix'
];

// The names SettingsView binds from its own useSettings() destructure.
const VIEW_PATH = 'src/components/views/SettingsView.jsx';
const VIEW_BINDING = [
  'syncLiveATLAS',
  'loadingATLAS',
  'atlasSyncStatus',
  'proxyEnabled', 'setProxyEnabled',
  'proxyUrl', 'setProxyUrl',
  'proxyMode', 'setProxyMode',
  'proxyCategories', 'setProxyCategories',
  'collapsedSettings'
];

// The full value surface the context exposes.
const CONTEXT_SURFACE = [
  'useDemoMode', 'setUseDemoMode',
  'proxyEnabled', 'setProxyEnabled', 'proxyUrl', 'setProxyUrl',
  'proxyMode', 'setProxyMode', 'proxyCategories', 'setProxyCategories',
  'proxyTest', 'setProxyTest', 'handleProxyTest',
  'backupPassphrase', 'setBackupPassphrase',
  'collapsedSettings', 'toggleSettingsCard',
  'judgeConfig', 'setJudgeConfig', 'saveJudgeConfig',
  'genConfig', 'setGenConfig', 'saveGenConfig', 'effectiveGenConfig',
  'atlasMatrix', 'setAtlasMatrix',
  'loadingATLAS', 'setLoadingATLAS',
  'atlasSyncStatus', 'setAtlasSyncStatus',
  'syncLiveATLAS'
];

// ---------------------------------------------------------------------------
// App.jsx is emptied of the parallel settings cluster
// ---------------------------------------------------------------------------

test('A4: App.jsx holds zero localStorage reads for atlas_demo_mode (the roadmap grep gate)', () => {
  const app = sourceOf(APP_PATH);
  assert.doesNotMatch(app, /localStorage\.getItem\('atlas_demo_mode'\)/, 'demo-mode reads must come from the context value');
  assert.doesNotMatch(app, /readStoredJSON\('atlas_demo_mode'/, 'no helper-based demo-mode reads either');
});

test('A4: App.jsx holds zero localStorage reads for atlas_proxy (the roadmap grep gate)', () => {
  const app = sourceOf(APP_PATH);
  assert.doesNotMatch(app, /localStorage\.getItem\('atlas_proxy'\)/, 'proxy reads must come from the context');
  assert.doesNotMatch(app, /localStorage\.setItem\('atlas_proxy'/, 'the persist side moved with the state into the provider');
});

test('A4: App.jsx holds zero localStorage reads/writes for atlas_settings_collapsed (the roadmap grep gate)', () => {
  const app = sourceOf(APP_PATH);
  assert.doesNotMatch(app, /localStorage\.getItem\('atlas_settings_collapsed'\)/, 'collapse-map reads must come from the context');
  assert.doesNotMatch(app, /localStorage\.setItem\('atlas_settings_collapsed'/, 'collapse persistence lives in the provider toggle');
});

test('A4: App.jsx holds zero local judgeConfig/genConfig useState declarations (the roadmap grep gate)', () => {
  const app = sourceOf(APP_PATH);
  assert.doesNotMatch(app, /const \[judgeConfig,/, 'judgeConfig must come from the context');
  assert.doesNotMatch(app, /const \[genConfig,/, 'genConfig must come from the context');
  assert.doesNotMatch(app, /readStoredObject\('atlas_judge_config'/, 'no judge-config initializer left in App');
  assert.doesNotMatch(app, /readStoredObject\('atlas_gen_config'/, 'no gen-config initializer left in App');
  assert.doesNotMatch(app, /const effectiveGenConfig = genConfig \|\| judgeConfig;/, 'the effective memo is the provider\'s now');
  assert.doesNotMatch(app, /localStorage\.setItem\('atlas_judge_config'/, 'save handlers moved');
  assert.doesNotMatch(app, /localStorage\.(setItem|removeItem)\('atlas_gen_config'/, 'save handlers moved');
});

test('A1: App.jsx holds zero local declarations of the moved proxy/collapse/ATLAS cluster', () => {
  const app = sourceOf(APP_PATH);
  for (const name of [
    'collapsedSettings', 'proxyEnabled', 'proxyUrl', 'proxyMode', 'proxyCategories',
    'useDemoMode', 'atlasMatrix', 'loadingATLAS', 'atlasSyncStatus'
  ]) {
    assert.doesNotMatch(app, new RegExp(`const \\[${name},\\s`), `App.jsx must no longer declare state ${name}`);
  }
  for (const stmt of [
    'const toggleSettingsCard = (key) => {',
    'const syncLiveATLAS = async ({ silent = false } = {}) => {',
    'const saveJudgeConfig = (cfg) => {',
    'const saveGenConfig = (cfg) => {'
  ]) {
    assert.ok(!app.includes(stmt), `App.jsx must no longer define: ${stmt}`);
  }
});

test('A1: App consumes useSettings() exactly once, via the canonical import and the full destructure', () => {
  const app = sourceOf(APP_PATH);
  assert.match(app, /import \{ useSettings \} from '\.\/context\/SettingsContext';/, 'canonical hook import present');
  assert.equal(app.match(/=\s*useSettings\(\)/g)?.length, 1, 'exactly one useSettings() call');
  const block = /const \{([^}]*)\}\s*=\s*useSettings\(\)/.exec(app);
  assert.ok(block, 'App destructures the hook result with unchanged identifier names');
  for (const name of APP_BINDING) {
    assert.match(block[1], new RegExp(`\\b${name}\\b`), `destructure binds ${name} from context`);
  }
  assert.doesNotMatch(block[1], /\bbackupPassphrase\b/, 'backupPassphrase must NOT be bound from SettingsContext (App binds it from useBackupFlow)');
  assert.doesNotMatch(block[1], /\bgenConfig\b/, 'App reads the gen config through effectiveGenConfig');
  assert.doesNotMatch(block[1], /\bsetCollapsedSettings\b/, 'collapse mutation is the provider toggle\'s job');
  // The sync pair + proxy cluster are bound by the view.
  const view = sourceOf(VIEW_PATH);
  const viewBlock = /const \{([^}]*)\}\s*=\s*useSettings\(\)/.exec(view);
  assert.ok(viewBlock, 'SettingsView destructures useSettings()');
  for (const name of VIEW_BINDING) {
    assert.match(viewBlock[1], new RegExp(`\\b${name}\\b`), `view destructure binds ${name} from context`);
  }
});

test('A3: tree-wide single source of truth — every settings-domain state is declared exactly once across src/, in SettingsContext.jsx', () => {
  const sites = new Map();
  for (const absPath of listSourceFiles(join(root, 'src'))) {
    const relPath = absPath.slice(root.length + 1);
    const source = sourceOf(relPath);
    for (const name of [
      'judgeConfig', 'genConfig', 'collapsedSettings',
      'proxyEnabled', 'proxyUrl', 'proxyMode', 'proxyCategories',
      'useDemoMode', 'atlasMatrix', 'loadingATLAS', 'atlasSyncStatus'
    ]) {
      const count = source.match(new RegExp(`const \\[${name},\\s`))?.length ?? 0;
      if (count > 0) {
        if (!sites.has(name)) sites.set(name, []);
        sites.get(name).push(`${relPath} (${count}x)`);
      }
    }
  }
  // NOTE: TestsContext.jsx keeps its own catalog-side `const [atlasMatrix,
  // setCatalogMatrix]` (a separate lifecycle, not a settings-domain mirror).
  // It is the one allowed second site.
  const EXTRA_SITE = { atlasMatrix: 'src/context/TestsContext.jsx (1x)' };
  for (const name of [
    'judgeConfig', 'genConfig', 'collapsedSettings',
    'proxyEnabled', 'proxyUrl', 'proxyMode', 'proxyCategories',
    'useDemoMode', 'atlasMatrix', 'loadingATLAS', 'atlasSyncStatus'
  ]) {
    const expected = [`${CTX_PATH} (1x)`];
    if (EXTRA_SITE[name]) expected.push(EXTRA_SITE[name]);
    assert.deepEqual(sites.get(name), expected, `${name} must be declared exactly once for the settings domain, in ${CTX_PATH}`);
  }
});

// ---------------------------------------------------------------------------
// The provider owns the bodies verbatim
// ---------------------------------------------------------------------------

test('A1: SettingsProvider gains the judge/gen helper-model configs (initializers, memo, save handlers)', () => {
  const ctx = sourceOf(CTX_PATH);
  assert.ok(ctx.includes("const [judgeConfig, setJudgeConfig] = useState(() =>\n    readStoredObject('atlas_judge_config', { provider: '', model: '' })\n  );"), 'judgeConfig initializer unchanged');
  assert.ok(ctx.includes("const [genConfig, setGenConfig] = useState(() =>\n    readStoredObject('atlas_gen_config', { provider: '', model: '' })\n  );"), 'genConfig initializer unchanged');
  assert.ok(ctx.includes('const effectiveGenConfig = genConfig || judgeConfig;'), 'effective memo unchanged');
  assert.ok(ctx.includes("const saveJudgeConfig = (cfg) => {\n    setJudgeConfig(cfg);\n    localStorage.setItem('atlas_judge_config', JSON.stringify(cfg));\n  };"), 'saveJudgeConfig body unchanged');
  assert.ok(ctx.includes("const saveGenConfig = (cfg) => {\n    setGenConfig(cfg);\n    if (cfg) localStorage.setItem('atlas_gen_config', JSON.stringify(cfg));\n    else localStorage.removeItem('atlas_gen_config');\n  };"), 'saveGenConfig body unchanged');
  assert.match(ctx, /import \{ readStoredJSON, readStoredObject \} from '\.\.\/utils\/storage';/, 'readStoredObject import added');
});

test('A2: the setProxyConfig side-effect wiring moved with the proxy state (secret scan, apply, persist)', () => {
  const ctx = sourceOf(CTX_PATH);
  const app = sourceOf(APP_PATH);
  assert.ok(ctx.includes("const url = proxyUrl.trim();"), 'effect body reads the live proxyUrl');
  assert.ok(ctx.includes("const secretParam = findSecretQueryParam(url);\n    if (secretParam) {\n      setProxyUrl('');\n      addToast(`The proxy URL embeds a likely secret (?${secretParam}=…). Move it into a header or remove it.`);\n      return;\n    }"), 'secret-scan guard moved verbatim (clears URL + toasts)');
  assert.ok(ctx.includes('setProxyConfig({ enabled: proxyEnabled, baseUrl: url, mode: proxyMode, categories: proxyCategories });'), 'api-layer apply moved verbatim');
  assert.ok(ctx.includes("localStorage.setItem('atlas_proxy', JSON.stringify({ enabled: proxyEnabled, url: proxyUrl.trim(), mode: proxyMode, categories: proxyCategories }));"), 'persist moved verbatim');
  assert.ok(ctx.includes('}, [proxyEnabled, proxyUrl, proxyMode, proxyCategories, addToast]);'), 'deps moved verbatim (addToast from useUI)');
  assert.ok(!ctx.includes('setProxyConfig({ enabled: cfg.enabled, baseUrl: cfg.url, mode: cfg.mode, categories: cfg.categories });'), 'the old mount-only localStorage effect is gone');
  assert.doesNotMatch(app, /findSecretQueryParam\(url\)/, 'no duplicate effect left in App');
  assert.match(ctx, /const \{ addToast \} = useUI\(\);/, 'provider consumes useUI for the toast');
  assert.match(ctx, /import \{ fetchATLASFramework, findSecretQueryParam, testProxyConnection \} from '\.\.\/utils\/api';/, 'secret-scan and proxy-test helpers imported from the shared api barrel');
});

test('A1: SettingsProvider owns the ATLAS live-sync action and the quiet auto-sync', () => {
  const ctx = sourceOf(CTX_PATH);
  const app = sourceOf(APP_PATH);
  assert.ok(ctx.includes("const syncLiveATLAS = async ({ silent = false } = {}) => {\n    setLoadingATLAS(true);\n    setAtlasSyncStatus('Fetching YAML from MITRE GitHub...');"), 'busy + fetching status moved verbatim');
  assert.ok(ctx.includes('setAtlasMatrix(matrix);\n      setCatalogMatrix(matrix);'), 'success updates both matrices');
  assert.ok(ctx.includes("localStorage.setItem('atlas_cached_matrix', JSON.stringify(matrix));\n      const meta = { updatedAt: Date.now(), version: version || 'unknown' };\n      localStorage.setItem('atlas_matrix_meta', JSON.stringify(meta));"), 'cache + meta persistence moved verbatim');
  assert.ok(ctx.includes('const newAuto = generateTestsForMatrix(matrix, coveredTechniqueIds).map(t => t.id);\n        setSelectedTests(prev => [...new Set([...prev, ...newAuto])]);'), 'non-silent sync auto-selects coverage tests');
  assert.ok(ctx.includes('addToast(`MITRE ATLAS Matrix updated live (v${version || \'unknown\'}) with all official tactics and techniques!`);'), 'success toast moved verbatim');
  assert.ok(ctx.includes("setAtlasSyncStatus(localStorage.getItem('atlas_cached_matrix')\n        ? `Sync failed (${err.message}) — showing the last cached version.`\n        : `Sync failed (${err.message}) — showing the preloaded version.`);"), 'failure branch moved verbatim');
  assert.ok(ctx.includes('addToast(`Error fetching MITRE ATLAS: ${redactSensitiveText(err.message)}. You can retry the sync in Settings.`);'), 'failure toast moved verbatim (redacted)');
  assert.ok(ctx.includes("const t = setTimeout(() => { syncLiveATLAS({ silent: true }); }, 800);"), 'quiet auto-sync 800ms after mount moved verbatim');
  assert.doesNotMatch(app, /syncLiveATLAS = async/, 'no duplicate sync body left in App');
  assert.match(ctx, /import \{ redactSensitiveText \} from '\.\.\/utils\/redact';/, 'redaction helper imported');
  assert.match(ctx, /const \{ setCatalogMatrix, coveredTechniqueIds, setSelectedTests \} = useTests\(\);/, 'provider consumes TestsContext for the sync collaboration');
});

test('A2: the bundled-matrix bridge moved with the ATLAS trio (both matrices hydrated, status upgraded once)', () => {
  const ctx = sourceOf(CTX_PATH);
  const app = sourceOf(APP_PATH);
  assert.ok(ctx.includes("import('../data/atlas-bundled').then(({ BUNDLED_ATLAS_VERSION, BUNDLED_ATLAS_MATRIX }) => {"), 'dynamic import re-pointed one level up');
  assert.ok(ctx.includes("if (!localStorage.getItem('atlas_cached_matrix')) {\n        setAtlasMatrix(BUNDLED_ATLAS_MATRIX);\n        setCatalogMatrix(BUNDLED_ATLAS_MATRIX);\n      }"), 'hydrates both matrices when nothing is cached');
  assert.ok(ctx.includes("setAtlasSyncStatus(current => current.startsWith('Loading preloaded')\n        ? `Preloaded (v${BUNDLED_ATLAS_VERSION}) — sync in Settings for the latest`\n        : current);"), 'status upgrade moved verbatim');
  assert.ok(ctx.includes("// setCatalogMatrix is a stable provider-side useState setter (mount-once bridge).\n  }, [setCatalogMatrix]);"), 'effect deps moved verbatim');
  assert.doesNotMatch(app, /BUNDLED_ATLAS_MATRIX/, 'no duplicate bridge left in App');
});

test('A1: the context value exposes the full settings surface (baseline 19 names + the 11 moved names)', () => {
  const ctx = sourceOf(CTX_PATH);
  const valueMatch = /const value = \{([\s\S]*?)\};\n\n  return \(/.exec(ctx);
  assert.ok(valueMatch, 'context value object found');
  for (const name of CONTEXT_SURFACE) {
    assert.match(valueMatch[1], new RegExp(`\\b${name}\\b`), `context value exposes ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Behavior-bearing usage sites in App.jsx survive
// ---------------------------------------------------------------------------

test('A2: the collapse toggle keeps its providerDraft guard semantics (guard lives in the provider now)', () => {
  const ctx = sourceOf(CTX_PATH);
  assert.ok(ctx.includes("const toggleSettingsCard = useCallback((key) => {\n    // While a provider is being added/edited, keep the Providers card expanded\n    // so the form stays inside the section.\n    if (key === 'providers' && providerDraft) return;\n    setCollapsedSettings(prev => {\n      const next = { ...prev, [key]: !prev[key] };\n      localStorage.setItem('atlas_settings_collapsed', JSON.stringify(next));\n      return next;\n    });\n  }, [providerDraft]);"), 'guarded toggle body moved verbatim with the providerDraft dependency');
  assert.match(ctx, /const \{ providerDraft \} = useProviders\(\);/, 'the guard input comes from ProvidersContext');
});

test('A3: the settings-card header keeps its exact collapse rendering against the shared map', () => {
  const app = sourceOf(APP_PATH);
  // The header body resolves from either side of the component move — the App
  // render-prop (key) or the SettingsCardHeader component (settingKey) —
  // identical rendering either way.
  if (app.includes('const settingsCardHeader = ')) {
    assert.ok(app.includes('title={collapsedSettings[key] ? \'Expand card\' : \'Collapse card\'}'), 'expand/collapse affordance survives');
    assert.ok(app.includes('aria-expanded={!collapsedSettings[key]}'), 'aria-expanded survives');
    assert.ok(app.includes('onClick={(e) => { e.stopPropagation(); toggleSettingsCard(key); }}'), 'stopPropagation toggle binding survives');
  } else {
    assert.ok(cardHeader.includes("title={collapsedSettings[settingKey] ? 'Expand card' : 'Collapse card'}"), 'expand/collapse affordance survives (component-side after T09)');
    assert.ok(cardHeader.includes('aria-expanded={!collapsedSettings[settingKey]}'), 'aria-expanded survives (component-side after T09)');
    assert.ok(cardHeader.includes('onClick={(e) => { e.stopPropagation(); toggleSettingsCard(settingKey); }}'), 'stopPropagation toggle binding survives (component-side after T09)');
  }
});

test('A2: demo-mode toggle still persists and still gates the sandbox seeds', () => {
  const app = sourceOf(APP_PATH);
  assert.ok(app.includes("localStorage.setItem('atlas_demo_mode', String(v));\n      setUseDemoMode(v);"), 'EAT-005: persist before committing the sandbox mode');
  assert.ok(app.includes('const [selectedProvider, setSelectedProvider] = useState(() => (\n    useDemoMode ? SANDBOX_PROVIDER_ID : \'\'\n  ));'), 'selectedProvider now seeds off the context value (same demo-default semantics)');
  assert.ok(app.includes('return useDemoMode ? DEMO_TARGETS : [];'), 'targets seeding now keyed off the context value');
  assert.ok(app.includes("if (localStorage.getItem('atlas_compare_targets') !== null) {\n      return readStoredArray('atlas_compare_targets');\n    }"), 'persisted-targets short-circuit survives (deleting all targets never re-seeds)');
  // The sandbox toggle's binding may live in SettingsView.jsx or
  // ProvidersCard.jsx with the sandbox card — evaluate it against the
  // App + view + providers-card union.
  const appAndView = app + '\n' + sourceOf(VIEW_PATH) + '\n' + providersCard;
  assert.ok(appAndView.includes('onChange={(e) => setDemoMode(e.target.checked)}'), 'the demo toggle binding survives');
});

test('A3: judge/generator model pickers keep their exact save-handler wiring', () => {
  const app = sourceOf(APP_PATH);
  // The judge model pickers may live in SettingsView.jsx with the Helper
  // Models card, in the shared selector components, or in
  // HelperModelsCard.jsx — the counts resolve across the App ∪ view ∪
  // helper-card ∪ shared-component set either way.
  const helperCard = readIfExists('src/components/views/settings/HelperModelsCard.jsx');
  const appAndView = app + '\n' + sourceOf(VIEW_PATH) + '\n' + helperCard + '\n' + genComponent + '\n' + judgeComponent;
  const saveGen = appAndView.match(/onChange=\{\(e\) => saveGenConfig\(([^)]*(?:\([^)]*\))?[^)]*)\)\}/g) || [];
  assert.ok(saveGen.length >= 4, 'generator pickers still call saveGenConfig');
  assert.ok(appAndView.includes("onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}"), 'judge provider picker unchanged');
  assert.equal(appAndView.match(/onChange=\{\(e\) => saveJudgeConfig\(\{ \.\.\.judgeConfig, model: e\.target\.value \}\)\}/g)?.length, 6, 'all six judge model pickers unchanged');
  assert.ok(appAndView.includes("onChange={(e) => saveGenConfig({ ...effectiveGenConfig, model: e.target.value })}"), 'gen model pickers fall back through the effective config');
});

test('A3: the ATLAS sync button and status line keep their exact wiring', () => {
  // The sync button/status wiring may live in SettingsView.jsx or
  // src/components/views/settings/AtlasSyncCard.jsx — the wiring pins resolve
  // across the view ∪ atlas-card file set; the wiring itself is unchanged.
  const view = sourceOf(VIEW_PATH);
  const atlasCard = readIfExists('src/components/views/settings/AtlasSyncCard.jsx');
  const atlasUnion = view + '\n' + atlasCard;
  assert.ok(atlasUnion.includes('onClick={syncLiveATLAS}'), 'Settings sync button binds the context action');
  assert.ok(atlasUnion.includes('disabled={loadingATLAS}'), 'button stays disabled while syncing');
  assert.ok(atlasUnion.includes('<RefreshCw size={14} className={loadingATLAS ? \'animate-spin-custom\' : \'\'} style={{ marginRight: \'6px\' }} />'), 'spinner keeps its live class binding');
  assert.ok(atlasUnion.includes('{atlasSyncStatus}'), 'status line renders the shared value');
});

test('A1: connectivity-test operations read the shared configs through the extracted judge helpers (T02)', () => {
  const app = sourceOf(APP_PATH);
  // buildJudge/pingModel live in src/utils/judge-config.js and are imported by
  // App (or by the model-ping hook). testJudge/testGenerator may live in
  // src/hooks/useModelPingTests.js, so the handlers' pins resolve across the
  // App ∪ model-ping-hook union (byte-identical bodies either way).
  const pingHook = readIfExists('src/hooks/useModelPingTests.js');
  const appUnionHook = `${app}\n${pingHook}`;
  assert.ok(/^import \{ buildJudge(, pingModel)? \} from '\.\/utils\/judge-config';$/m.test(app), 'buildJudge (and pre-T05 pingModel) arrive from the judge-config module');
  assert.ok(!app.includes('const buildJudge = (cfg) => {') && !app.includes('const pingModel = async (cfg, label) => {'), 'App holds no local helper re-declarations');
  assert.ok(appUnionHook.includes('const testJudge = async () => {'), 'testJudge stays in the App ∪ hook union');
  assert.ok(appUnionHook.includes('const testGenerator = async () => {'), 'testGenerator stays in the App ∪ hook union');
  assert.ok(appUnionHook.includes("const reply = await pingModel(judgeConfig, 'AI Judge', providers);"), 'testJudge reads the shared judge config');
  assert.ok(appUnionHook.includes("const reply = await pingModel(effectiveGenConfig, 'Test Generator', providers);"), 'testGenerator reads the shared effective config');
});

test('seam intact: main.jsx still mounts SettingsProvider around App and MatrixView keeps consuming the context', () => {
  const main = sourceOf(MAIN_PATH);
  assert.match(main, /import \{ SettingsProvider \} from '\.\/context\/SettingsContext'/);
  assert.match(main, /<AIGenProvider>\n\s*<SettingsProvider>\n\s*<App \/>\n\s*<\/SettingsProvider>\n\s*<\/AIGenProvider>/, 'SettingsProvider stays the innermost wrapper');
  const view = sourceOf(MATRIX_PATH);
  assert.match(view, /const \{\s*atlasMatrix,\s*atlasSyncStatus\s*\} = useSettings\(\);/, 'MatrixView keeps its matrix bindings (the T16 real view replaces the stub)');
});
