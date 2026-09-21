// Contract: the AI pipeline state is consolidated into AIGenContext and the
// useAIGeneration props bag is collapsed.
//
// resetTestSuite is a TestsProvider context action — the reset-region pin is
// anchored to TestsContext (markers cleared via the App-registered NEW-marker
// reset bridge; the writers count and the clearNewMarkers body pin are
// unchanged).
//
//   src/context/AIGenContext.jsx → single source of truth for aiPreview /
//                                  aiPreviewSelected / recentlyGeneratedIds
//                                  (atlas_recent_ai_tests readStoredArray
//                                  hydration) alongside the aiGen* cluster
//   src/hooks/useAIGeneration.js → consumes useAIGen()/useTests()/
//                                  useSettings()/useProviders()/useUI()
//                                  directly; its parameter object collapses
//                                  to the slim deps contract (only true
//                                  cross-domain non-context values)
//   src/App.jsx                  → destructures the three states from
//                                  useAIGen(), binds UI handlers, and passes
//                                  ONLY the slim deps to the hook
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (see tests/source-intake.contract.test.mjs and
// tests/tests-context.contract.test.mjs). The readStoredArray hydration
// section is behavioral — it drives the REAL src/utils/storage.js behind an
// in-memory localStorage (hermetic; no dev server, no network).
//
// Acceptance mapping:
//   Sections 1-2 → state consolidation + hydration + exactly-once scan
//   Section 3    → slim deps grep gate + direct context consumption
//   Section 4    → recent-marker marking byte-compatible
//   Section 5    → shrink gates: App.jsx + hook signature net-smaller
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';
const CTX_PATH = 'src/context/AIGenContext.jsx';
const TESTS_CTX_PATH = 'src/context/TestsContext.jsx';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', hook = '', ctx = '', testsCtx = '';
try {
  app = sourceOf(APP_PATH);
  hook = sourceOf(HOOK_PATH);
  ctx = sourceOf(CTX_PATH);
  testsCtx = sourceOf(TESTS_CTX_PATH);
} catch { /* a missing file fails its first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const countStr = (source, needle) => source.split(needle).length - 1;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else if (/\.(jsx|js|mjs)$/.test(entry.name)) files.push(abs);
  }
  return files;
}

// The hook's declared parameter names (one per line at 2-space indent).
const hookSigStart = idx(hook, 'export function useAIGeneration({');
const hookSigEnd = idx(hook, '}) {', hookSigStart);
const hookSig = hookSigEnd > hookSigStart ? hook.slice(hookSigStart, hookSigEnd) : '';
const extractParams = (sig) => [...sig.matchAll(/^ {2}([A-Za-z_$][\w$]*),$/gm)].map(m => m[1]);

// App's useAIGeneration call-site slice (call opener → its closer).
const callStart = idx(app, 'useAIGeneration({');
const callEnd = idx(app, '\n  });', callStart);
const callSite = callEnd > callStart ? app.slice(callStart, callEnd) : '';

// The slim deps contract: ONLY true cross-domain non-context values. Every
// aiGen*/aiPreview* state+setter, the TestsContext catalog
// bindings, and the settings/providers/ui state leave the signature — they
// arrive through the consumed contexts instead.
const SLIM_DEPS = [
  'aiGenAbortRef',      // App-owned abort ref, aborted App-side (cancel path)
  'aiRunCtxRef',        // App-owned run-context ref, cleared App-side
  'atlasMatrix',        // matrix catalog shared with other App regions
  'allTests',           // derived suite snapshot shared with other App regions
  'buildJudge',         // judge factory (src/utils/judge-config.js)
  'judgeConfig',        // shared judge config
  'effectiveGenConfig', // shared generator config (genConfig || judgeConfig)
  'getPrompt',
  'getPromptOverrides',
  'runWithTimeout',     // shared runner (src/utils/call-timeout.js)
  'addToast',           // ui callbacks
  'askConfirm',
  'askInput'
];
const FORBIDDEN_IN_SIG = /\b(setAiGen\w*|setAiPreview\w*|setRecentlyGeneratedIds|aiGenSourceKeys|aiGenUrls|aiGenUrlInput|aiGenTitleInput|aiGenDescInput|aiSourceDraft|aiSourceAssessing|aiSourceAssessment|aiGenCount|aiGenCountInput|commitAiGenCount|updateAiGenCountInput|aiGenCollapsed|testsCollapsed|aiGenerating|aiGenStage|aiGenStageDetail|aiGenProgress|aiGenMode|aiPasteInput|aiPasteTitle|aiSourceProfiles|expandedSourceIds|toggleSourceExpanded|aiAddSourceOpen|aiAddSourceKind|aiAddStep|aiAddError|aiAddBusy|openAddSourceDialog|closeAddSourceDialog|aiGeneratedCount|aiWizardOpen|aiWizardStep|aiFineTune|aiRefining|aiWizardError|aiUsedGuidance|aiUsedFineTune|aiDraft|aiProfileEdits|aiProfileExpanded|aiGenBatch|aiGenBudget|aiAdvancedMode|aiGenElapsed|aiPreview|aiPreviewSelected|recentlyGeneratedIds|customTests|setCustomTests|setSelectedTests|validTechniqueIds|vaultLocked|vaultPassphraseSet|providers)\b/;

// ---------------------------------------------------------------------------
// 1. the three pipeline states are consolidated into AIGenContext
// ---------------------------------------------------------------------------

test('The three states + setters are declared exactly once tree-wide, in AIGenContext', () => {
  const sites = new Map();
  for (const absPath of listSourceFiles(join(root, 'src'))) {
    const relPath = absPath.slice(root.length + 1);
    const src = sourceOf(relPath);
    for (const name of ['aiPreview', 'aiPreviewSelected', 'recentlyGeneratedIds']) {
      const n = countIn(src, new RegExp(`const \\[${name},\\s`, 'g'));
      if (n > 0) sites.set(name, [...(sites.get(name) || []), `${relPath} (${n}x)`]);
    }
  }
  for (const name of ['aiPreview', 'aiPreviewSelected', 'recentlyGeneratedIds']) {
    assert.deepEqual(sites.get(name), [`${CTX_PATH} (1x)`],
      `${name} must be declared exactly once, in ${CTX_PATH}`);
  }
});

test('The context declares them with the exact baseline initializers (hydration included)', () => {
  assert.ok(ctx.includes('const [aiPreview, setAiPreview] = useState(null);'),
    'aiPreview keeps the null initializer ({ tests: [...] } awaiting confirmation)');
  assert.ok(ctx.includes('const [aiPreviewSelected, setAiPreviewSelected] = useState(null);'),
    'aiPreviewSelected keeps the null initializer (Set of test ids)');
  assert.ok(ctx.includes("const [recentlyGeneratedIds, setRecentlyGeneratedIds] = useState(() => readStoredArray('atlas_recent_ai_tests'));"),
    'recentlyGeneratedIds hydrates from atlas_recent_ai_tests via readStoredArray');
  assert.match(ctx, /^import \{ readStoredArray \} from '\.\.\/utils\/storage';$/m,
    'the context imports the hydration helper (extensionless, like HistoryContext)');
});

test('The context value exposes the six names and App destructures them from useAIGen()', () => {
  const valueStart = idx(ctx, 'const value = {');
  const valueEnd = idx(ctx, '};', valueStart);
  const value = valueEnd > valueStart ? ctx.slice(valueStart, valueEnd) : '';
  for (const name of ['aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected', 'recentlyGeneratedIds', 'setRecentlyGeneratedIds']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(value), `the context value exposes ${name}`);
  }
  const destructure = /const \{([^}]*)\}\s*=\s*useAIGen\(\)/.exec(app);
  assert.ok(destructure, 'App destructures useAIGen()');
  for (const name of ['aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected', 'recentlyGeneratedIds', 'setRecentlyGeneratedIds']) {
    assert.match(destructure[1], new RegExp(`\\b${name}\\b`), `App binds ${name} from the context`);
  }
});

// ---------------------------------------------------------------------------
// 2. the hydration contract (behavioral, real storage module)
// ---------------------------------------------------------------------------

const { readStoredArray } = await import('../src/utils/storage.js');

test('The atlas_recent_ai_tests hydration contract round-trips ids and tolerates corrupt/foreign payloads', () => {
  const KEY = 'atlas_recent_ai_tests';
  localStorage.setItem(KEY, JSON.stringify(['ai_1', 'ai_2']));
  assert.deepEqual(readStoredArray(KEY), ['ai_1', 'ai_2']);
  localStorage.removeItem(KEY);
  assert.deepEqual(readStoredArray(KEY), []);
  localStorage.setItem(KEY, JSON.stringify([]));
  assert.deepEqual(readStoredArray(KEY), []);
  for (const junk of ['{oops', 'null', '42', '"str"', '{"a":1}', 'undefined']) {
    localStorage.setItem(KEY, junk);
    assert.deepEqual(readStoredArray(KEY), [], `${junk} → [] (boot never throws)`);
  }
  localStorage.setItem(KEY, '[1,2]');
  assert.deepEqual(readStoredArray(KEY), [1, 2], 'non-id arrays pass through verbatim (Array.isArray gate only)');
});

// ---------------------------------------------------------------------------
// 3. the hook consumes the five contexts directly; the bag is the slim deps
// ---------------------------------------------------------------------------

test('The hook imports and calls the five context hooks directly — exactly once each', () => {
  assert.match(hook, /^import \{ useAIGen \} from '\.\.\/context\/useAIGen';$/m, 'useAIGen import');
  assert.match(hook, /^import \{ useTests \} from '\.\.\/context\/TestsContext';$/m, 'useTests import');
  assert.match(hook, /^import \{ useSettings \} from '\.\.\/context\/SettingsContext';$/m, 'useSettings import');
  assert.match(hook, /^import \{ useProviders \} from '\.\.\/context\/ProvidersContext';$/m, 'useProviders import');
  assert.match(hook, /^import \{ useUI \} from '\.\.\/context\/useUI';$/m, 'useUI import');
  for (const contextHook of ['useAIGen', 'useTests', 'useSettings', 'useProviders', 'useUI']) {
    assert.equal(countIn(hook, new RegExp(`\\b${contextHook}\\(\\)`, 'g')), 1,
      `the hook calls ${contextHook}() exactly once`);
  }
});

test('The signature carries ZERO aiGen*/aiPreview* state or setters — slim deps only', () => {
  assert.ok(hookSigStart >= 0, 'the hook still exports useAIGeneration({ ... })');
  assert.doesNotMatch(hookSig, FORBIDDEN_IN_SIG, 'no aiGen*/aiPreview*/catalog/settings/provider names may ride the signature');
  assert.doesNotMatch(hookSig, /\bset[A-Z]/, 'no setter of any kind rides the signature');
  const params = extractParams(hookSig);
  assert.deepEqual([...params].sort(), [...SLIM_DEPS].sort(),
    'the slim deps contain ONLY true cross-domain non-context values (roadmap A2)');
  assert.equal(params.length, 13, 'the bag collapses from 111 names to the 13 slim deps');
});

test('The prompt-overrides dep stays contract-bound and lint-clean (guard directive, not deletion)', () => {
  const pinned = extractParams(hookSig);
  assert.ok(pinned.includes('getPromptOverrides'), 'getPromptOverrides still rides the slim-deps contract');
  assert.equal(countIn(hook, /\/\/ oxlint-disable-next-line no-unused-vars\n  getPromptOverrides,\n/g), 1,
    'the still-unused param is lint-suppressed in place with the repo disable-directive pattern');
});

test('The hook defines none of the consumed state locally (the context stays the single source of truth)', () => {
  for (const name of ['aiPreview', 'aiPreviewSelected', 'recentlyGeneratedIds']) {
    assert.doesNotMatch(hook, new RegExp(`const \\[${name},\\s`), `the hook must not declare state ${name}`);
  }
  for (const name of ['aiGenUrls', 'aiSourceProfiles', 'aiDraft', 'aiWizardStep']) {
    assert.doesNotMatch(hook, new RegExp(`const \\[${name},\\s`), `the hook must not shadow ${name}`);
  }
});

test('The App call site passes only the slim deps — no state or setters ride it anymore', () => {
  assert.ok(callStart >= 0, 'App still calls useAIGeneration exactly once with a deps object');
  assert.equal(countIn(app, /useAIGeneration\(\s*\{/g), 1, 'exactly one hook call');
  for (const name of SLIM_DEPS) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(callSite), `the call site passes ${name}`);
  }
  assert.doesNotMatch(callSite, FORBIDDEN_IN_SIG, 'no consolidated state rides the call site');
  assert.doesNotMatch(callSite, /\bset[A-Z]/, 'no setter rides the call site');
  assert.doesNotMatch(callSite, /\bvalidTechniqueIds\b/, 'the technique allow-list is hook-derived now');
});

test('ValidTechniqueIds is derived hook-side from the atlasMatrix dep; aiGenAbortRef stays App-owned', () => {
  assert.match(hook, /const validTechniqueIds = new Set\(\(atlasMatrix \|\| \[\]\)\.flatMap\(t => \(t\.techniques \|\| \[\]\)\.map\(tech => tech\.id\)\)\);/,
    'the hook derives the technique allow-list from atlasMatrix');
  assert.equal(countIn(app, /const validTechniqueIds = /g), 0, 'App drops the derivation (net-smaller)');
  const refSites = [];
  for (const absPath of listSourceFiles(join(root, 'src'))) {
    const relPath = absPath.slice(root.length + 1);
    const n = countIn(sourceOf(relPath), /const aiGenAbortRef = useRef\(null\);/g);
    if (n > 0) refSites.push(`${relPath} (${n}x)`);
  }
  assert.deepEqual(refSites, [`${APP_PATH} (1x)`],
    'aiGenAbortRef stays the App-owned cross-domain ref (aborted App-side, armed hook-side)');
});

// ---------------------------------------------------------------------------
// 4. the recentlyGeneratedIds marking stays byte-compatible
// ---------------------------------------------------------------------------

test('The wizard commit keeps the prepend + persist marking; the clears keep their exact bodies', () => {
  // The commit is persistence-first — the merged marker list is written
  // through the catalog boundary before visible state commits, so a storage
  // failure cannot silently drop NEW markers.
  assert.ok(hook.includes('const recentNext = [...chosen.map(t => t.id), ..._recentlyGeneratedIds];'),
    'the commit prepends the chosen ids to the existing markers');
  assert.ok(hook.includes("tryPersistCatalogArray(CATALOG_KEYS.recentAiTests, recentNext)"),
    'the commit persists the merged list through the catalog boundary');
  // resetTestSuite lives in TestsProvider as a context action; it clears the
  // markers and the key there — the markers through the App-registered
  // NEW-marker reset bridge (newMarkerResetRef), the key directly. The exact
  // orchestration order is pinned by tests/catalog-actions.contract.test.mjs.
  const reset = testsCtx.slice(idx(testsCtx, 'const resetTestSuite = '), idx(testsCtx, 'const baseTests = '));
  assert.ok(idx(testsCtx, 'const resetTestSuite = ') >= 0, 'resetTestSuite is TestsContext-owned (T03 move)');
  assert.ok(reset.includes('newMarkerResetRef.current') && reset.includes("localStorage.removeItem('atlas_recent_ai_tests');"),
    'resetTestSuite clears the markers (via the bridge) and the key');
  assert.ok(app.includes(`const clearNewMarkers = () => {
    setRecentlyGeneratedIds([]);
    localStorage.setItem('atlas_recent_ai_tests', JSON.stringify([]));
  };`), 'clearNewMarkers body survives verbatim');
  const pair = app + '\n' + hook;
  assert.equal([...pair.matchAll(/setRecentlyGeneratedIds\(/g)].length, 4,
    'writers: clearNewMarkers + the T03 NEW-marker reset registration (App) and the two wizard-commit outcomes (hook success/partial)');
  assert.equal(countStr(pair, "localStorage.setItem('atlas_recent_ai_tests'"), 1,
    'only clearNewMarkers writes the key directly now; the wizard commit rides the persistence boundary');
  assert.ok(hook.includes('const confirmAiPreview = '), 'confirmAiPreview stays hook-defined');
});

// ---------------------------------------------------------------------------
// 5. shrink gates — App.jsx + the hook signature net-smaller
// ---------------------------------------------------------------------------

test('App.jsx shrinks below its 3280-line T04 baseline; the hook signature collapses to the slim deps', () => {
  const appLines = app.split('\n').length;
  assert.ok(appLines < 3280, `App.jsx shrank below the 3280-line T04 baseline (landed ${appLines})`);
  const sigLines = hookSig.split('\n').length;
  assert.ok(sigLines < 40, `the hook signature collapsed from 121 lines to the slim deps (landed ${sigLines})`);
});
