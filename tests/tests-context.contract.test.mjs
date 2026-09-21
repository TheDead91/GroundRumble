// Contract: TestsProvider is the SOLE owner of the test-catalog state incl.
// presets — customTests, disabledTestIds, editingTestId/showAddCustom/
// customForm, the six sort/filter states, the derived catalog pipeline, and
// preset management (presets, savePresets, applyPreset, saveCurrentAsPreset) —
// while App.jsx holds no parallel declarations and consumes one catalog API.
// Custom-test add/edit/delete, enable/disable toggling, preset apply/save
// (confirm dialogs + toast copy) behave IDENTICALLY; the Matrix view and
// Runner payload selector keep working off the shared catalog; no
// atlas_custom_tests / atlas_disabled_tests reads remain in App.jsx. The
// runner payload derivation + empty-selection guard live in
// src/hooks/useAuditRun.js — App must still wire the SHARED selection/id-map
// into the hook, and must not re-derive the payload set.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see
// tests/audit-history-context.contract.test.mjs and
// tests/provider-policy.contract.test.mjs). Ops whose owner is ambiguous are
// pinned ONCE ACROSS the App.jsx+TestsContext.jsx pair so a clean split passes
// either way; the listed owners are pinned hard.
//
// Behavioral parity of the composed storage/payload primitives is additionally
// exercised against the real src/utils + src/data modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const TESTS_CTX_PATH = 'src/context/TestsContext.jsx';
const HOOK_PATH = 'src/hooks/useAuditRun.js';
const MAIN_PATH = 'src/main.jsx';
const RUNNER_VIEW_PATH = 'src/components/views/RunnerView.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
let app = '', testsCtx = '', testCatalog = '', main = '', hook = '', view = '', settingsCtx = '', runnerView = '';
try {
  app = readSource(APP_PATH);
  testsCtx = readSource(TESTS_CTX_PATH);
  testCatalog = readIfExists('src/utils/test-catalog.js');
  settingsCtx = readSource('src/context/SettingsContext.jsx');
  hook = readSource(HOOK_PATH);
  main = readSource(MAIN_PATH);
  view = readSource('src/components/views/TestsView.jsx');
  runnerView = readSource(RUNNER_VIEW_PATH);
} catch { /* missing files fail their first assertion */ }

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const countStr = (source, needle) => source.split(needle).length - 1;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);
const pair = app + '\n' + testsCtx + '\n' + testCatalog;
const valueSlice = (ctx) => {
  const start = idx(ctx, 'const value = {');
  return start < 0 ? '' : ctx.slice(start, idx(ctx, '};', start));
};

// ---------------------------------------------------------------------------
// App consumes one catalog API; the parallel declarations are gone
// ---------------------------------------------------------------------------

test('App consumes the tests context hook', () => {
  assert.equal(countIn(app, /useTests\(\)/g) >= 1, true, 'App calls useTests() (the exported hook name)');
  assert.match(testsCtx, /export function useTests\(\)/, 'the hook export is unchanged');
  assert.match(testsCtx, /throw new Error\('useTests must be used within a TestsProvider'\)/, 'guard message unchanged');
});

test('App deletes its parallel catalog state declarations', () => {
  for (const decl of [
    /const \[customTests, setCustomTests\] = useState\(/,
    /const \[disabledTestIds, setDisabledTestIds\] = useState\(/,
    /const \[presets, setPresets\] = useState\(/,
    /const \[presetFeedback, setPresetFeedback\] = useState\(/,
    /const \[editingTestId, setEditingTestId\] = useState\(/,
    /const \[showAddCustom, setShowAddCustom\] = useState\(/,
    /const \[customForm, setCustomForm\] = useState\(/,
    /const \[testSortKey, setTestSortKey\] = useState\(/,
    /const \[testSortDir, setTestSortDir\] = useState\(/,
    /const \[testFilterQ, setTestFilterQ\] = useState\(/,
    /const \[testFilterSource, setTestFilterSource\] = useState\(/,
    /const \[testFilterTechnique, setTestFilterTechnique\] = useState\(/,
    /const \[testFilterEnabled, setTestFilterEnabled\] = useState\(/
  ]) {
    assert.equal(countIn(app, decl), 0, `App no longer declares ${decl}`);
  }
  assert.equal(countIn(app, /const DEFAULT_PRESET_ID = 'default';/g), 0, 'App no longer declares DEFAULT_PRESET_ID (owned by the provider)');
  // The symbols must still be REACHABLE (consumed from the hook).
  // The three add-custom-dialog symbols (editingTestId, showAddCustom,
  // customForm) resolve from either side of the CustomTestFormModal.jsx
  // extraction — App's useTests destructure or the modal module's own
  // useTests() destructure. The other ten catalog symbols stay hard-pinned
  // App-side.
  const customTestModal = readIfExists('src/components/modals/CustomTestFormModal.jsx');
  const modalSurface = app + '\n' + customTestModal;
  // The two sort-key aliases (_testSortKey/_testSortDir) may leave App's
  // useTests destructure — the sort keys are catalog-internal state consumed
  // by TestsContext's own sortedTests derivation — so testSortKey/testSortDir
  // resolve across the App ∪ TestsContext file set (identical presence
  // guarantee). The remaining catalog symbols stay hard-pinned App-side.
  for (const symbol of ['customTests', 'disabledTestIds', 'presets', 'presetFeedback', 'editingTestId', 'showAddCustom', 'customForm', 'testSortKey', 'testSortDir', 'testFilterQ', 'testFilterSource', 'testFilterTechnique', 'testFilterEnabled']) {
    const surface = ['editingTestId', 'showAddCustom', 'customForm'].includes(symbol) ? modalSurface : ['testSortKey', 'testSortDir'].includes(symbol) ? sortKeySurface : app;
    assert.ok(new RegExp(`\\b${symbol}\\b`).test(surface), `App still uses ${symbol} (via the hook${['editingTestId', 'showAddCustom', 'customForm'].includes(symbol) ? ', or the CustomTestFormModal module does (T14)' : ['testSortKey', 'testSortDir'].includes(symbol) ? ', or TestsContext does (T07 dedupe re-aim)' : ''})`);
  }
  // The runner payload filters live in RunnerView.jsx.
  assert.match(runnerView, /const \[payloadFilterQ, setPayloadFilterQ\] = useState\(''\);/, 'payloadFilter* selection-filter state is owned by the runner view (moved by T12)');
});

test('App deletes its preset-op definitions; the provider owns them', () => {
  for (const op of ['savePresets', 'applyPreset', 'saveCurrentAsPreset']) {
    assert.equal(countIn(app, new RegExp(`const ${op} = `)), 0, `App no longer defines ${op}`);
    assert.equal(countIn(testsCtx, new RegExp(`const ${op} = `)), 1, `exactly one definition of ${op}, inside TestsProvider`);
    assert.ok(new RegExp(`\\b${op}\\b`).test(app), `App still references ${op} (consumed from the hook)`);
  }
  assert.ok(new RegExp(`\\b${'presetFeedback'}\\b`).test(valueSlice(testsCtx)), 'presetFeedback is exposed by the provider value');
});

test('App deletes its derived catalog block; the provider computes the shared lists', () => {
  for (const def of [
    'const coveredTechniqueIds = ',
    'const autoTests = ',
    'const disabledSet = ',
    'const allTestsById = ',
    'const allTestsWithDisabled = ',
    'const allTests = ',
    'const testSortIndicator = ',
    'const clickTestSort = ',
    'const sortedTests = ',
    'const testFilterOptions = ',
    'const filteredSortedTests = '
  ]) {
    assert.equal(countStr(app, def), 0, `App no longer defines ${def.replace(/ = $/, '')}`);
  }
  // coveredTechniqueIds / autoTests / disabledSet may leave App's destructure
  // with their underscore aliases — the derivations live provider-side — so
  // these three resolve across the App ∪ TestsContext file set (identical
  // guarantee); everything else stays App-pinned.
  for (const symbol of ['coveredTechniqueIds', 'autoTests', 'allTests', 'allTestsById', 'allTestsWithDisabled', 'testSortIndicator', 'clickTestSort', 'sortedTests', 'testFilterOptions', 'filteredSortedTests', 'disabledSet']) {
    const surface = ['coveredTechniqueIds', 'autoTests', 'disabledSet'].includes(symbol) ? sortKeySurface : app;
    assert.ok(new RegExp(`\\b${symbol}\\b`).test(surface), `App still uses ${symbol} (via the hook, or TestsContext does — T07 dedupe re-aim)`);
  }
  // The provider keeps the memo boundaries while pure decisions may be inline
  // or delegated to the extracted catalog module.
  assert.match(testsCtx, /const coveredTechniqueIds = useMemo\(/, 'coverage derivation memoized in the provider');
  assert.match(testsCtx, /const autoTests = useMemo\(\(\) => generateTestsForMatrix\(atlasMatrix, coveredTechniqueIds\)/,
    'auto tests still derive from the provider matrix input');
  if (testCatalog) {
    assert.match(testsCtx, /indexTestCatalog\(PRESET_TESTS, autoTests, customTests\)/,
      'provider delegates preset → auto → custom indexing to the pure module');
    assert.match(testsCtx, /projectEnabledTests\(allTestsWithDisabled, disabledSet\)/,
      'provider delegates the enabled-only projection to the pure module');
  } else {
    assert.match(testsCtx, /\[\.\.\.PRESET_TESTS, \.\.\.autoTests, \.\.\.customTests\]\.forEach/,
      'preset → auto → custom fill order survives (custom overrides on id collision)');
    assert.match(testsCtx, /const allTests = useMemo\(\(\) => allTestsWithDisabled\.filter\(t => !disabledSet\.has\(t\.id\)\)/,
      'the enabled-only allTests filter survives');
  }
});

test('App deletes its sort/filter/sort-handler UI logic only if the provider hosts the identical logic', () => {
  if (testCatalog) {
    for (const name of ['sortTests', 'getTestFilterOptions', 'filterTests', 'getTestSortIndicator']) {
      assert.match(testCatalog, new RegExp(`export function ${name}\\b`), `${name} lives in the pure catalog module`);
      assert.match(testsCtx, new RegExp(`\\b${name}\\(`), `TestsProvider consumes ${name}`);
    }
    assert.match(testsCtx, /if \(testSortKey === key\) setTestSortDir\(prev => prev === 'asc' \? 'desc' : 'asc'\);/,
      'clickTestSort flip semantics live in the provider');
    return;
  }
  // Indicators + comparators + filters must exist exactly once across the pair.
  const onceAcrossPair = [
    /const testSortIndicator = \(key\) => testSortKey === key \? \(testSortDir === 'asc' \? ' ↑' : ' ↓'\) : '';/,
    /if \(testSortKey === 'name'\) d = \(a\.name \|\| ''\)\.localeCompare\(b\.name \|\| ''\);/,
    /else if \(testSortKey === 'techniqueId'\) d = \(a\.techniqueId \|\| ''\)\.localeCompare\(b\.techniqueId \|\| ''\);/,
    /else if \(testSortKey === 'source'\) d = \(a\.origin \|\| ''\)\.localeCompare\(b\.origin \|\| ''\);/,
    /const q = testFilterQ\.trim\(\)\.toLowerCase\(\);/,
    /const haystack = `\$\{t\.name \|\| ''\} \$\{t\.techniqueId \|\| ''\} \$\{t\.techniqueName \|\| ''\} \$\{t\.origin \|\| ''\}`\.toLowerCase\(\);/,
    /if \(testFilterSource !== 'all' && \(t\.origin \|\| ''\) !== testFilterSource\) return false;/,
    /if \(testFilterTechnique !== 'all' && \(t\.techniqueId \|\| ''\) !== testFilterTechnique\) return false;/,
    /if \(testFilterEnabled === 'enabled' && removed\) return false;/,
    /if \(testFilterEnabled === 'disabled' && !removed\) return false;/
  ];
  for (const re of onceAcrossPair) {
    assert.equal(countIn(pair, re), 1, `exactly one definition site across the pair for: ${re.source.slice(0, 60)}…`);
  }
  assert.match(testsCtx, /sources: \[\.\.\.new Set\(allTestsWithDisabled\.map\(t => \(t\.origin \|\| ''\)\.trim\(\)\)\.filter\(Boolean\)\)\]\.sort\(\)/,
    'provider filter options still derive from the WITH-disabled list');
  assert.match(testsCtx, /techniques: \[\.\.\.new Set\(allTestsWithDisabled\.map\(t => \(t\.techniqueId \|\| ''\)\.trim\(\)\)\.filter\(Boolean\)\)\]\.sort\(\)/,
    'technique options likewise');
  assert.match(testsCtx, /if \(testSortKey === key\) setTestSortDir\(prev => prev === 'asc' \? 'desc' : 'asc'\);/,
    'clickTestSort flip semantics live in the provider');
});

test('TestsContext value exposes the one catalog API App needs', () => {
  const value = valueSlice(testsCtx);
  for (const key of [
    'customTests', 'disabledTestIds', 'editingTestId', 'setEditingTestId', 'showAddCustom', 'setShowAddCustom',
    'customForm', 'setCustomForm', 'handleCustomFormChange', 'handleAddCustomTest',
    'clickTestSort', 'testSortKey', 'testSortDir', 'testFilterQ', 'setTestFilterQ', 'testFilterSource', 'setTestFilterSource',
    'testFilterTechnique', 'setTestFilterTechnique', 'testFilterEnabled', 'setTestFilterEnabled', 'testSortIndicator',
    'sortedTests', 'testFilterOptions', 'filteredSortedTests', 'allTests', 'allTestsWithDisabled', 'allTestsById',
    'coveredTechniqueIds', 'autoTests', 'presets', 'presetFeedback', 'savePresets', 'applyPreset', 'saveCurrentAsPreset',
    'disabledSet', 'setCustomTests', 'setDisabledTestIds'
  ]) {
    assert.ok(value.includes(key), `TestsContext value exposes ${key}`);
  }
  assert.match(value, /\b(removePreset|deletePreset)\b/, 'preset removal exposed (either name)');
  assert.match(value, /\b(handleEditCustomTest|openEditTest)\b/, 'edit-backfill opener exposed (either name)');
});

// ---------------------------------------------------------------------------
// Preset management behaves identically — the provider owns the rich semantics
// ---------------------------------------------------------------------------

test('Adopted applyPreset keeps the stale-filter + prune + ids-feedback contract', () => {
  const a = idx(testsCtx, 'const applyPreset = ');
  assert.ok(a >= 0, 'applyPreset defined in the provider');
  const body = testsCtx.slice(a, a + 800);
  const filter = idx(body, 'const ids = preset.testIds.filter(id => allTests.some(t => t.id === id));');
  const set = idx(body, 'setSelectedTests(ids);');
  const prune = idx(body, 'if (ids.length !== preset.testIds.length) {');
  const pruneSave = idx(body, 'savePresets(presets.map(p => p.id === preset.id ? { ...p, testIds: ids } : p));');
  const feedback = idx(body, 'setPresetFeedback({ name: preset.name, count: ids.length, ids });');
  const ret = idx(body, 'return ids.length;');
  assert.ok(filter >= 0 && set > filter, 'stale ids dropped before the selection write');
  assert.ok(prune >= 0 && pruneSave > prune, 'stored preset pruned only when ids were dropped');
  assert.ok(feedback >= 0 && ret > feedback, 'feedback { name, count, ids } then the count return');
  assert.equal(countIn(testsCtx, /setTimeout\(\(\) => setPresetFeedback\(null\), 3000\)/g), 0,
    'the 3s auto-clear is GONE — App UX gates feedback visibility on id-match instead');
  assert.doesNotMatch(body, /new Set\(preset\.testIds\)/, 'no Set-shaped selection write (App selection is an array)');
});

test('Adopted saveCurrentAsPreset keeps guard + askInput + replace-confirm + toast (no window.prompt)', () => {
  const s = idx(testsCtx, 'const saveCurrentAsPreset = ');
  assert.ok(s >= 0, 'saveCurrentAsPreset defined in the provider');
  const body = testsCtx.slice(s, s + 1300);
  const guard = idx(body, 'if (selectedTests.length === 0) {');
  const guardToast = idx(body, "addToast('Select at least one test to save as a preset.');");
  const ask = idx(body, "await askInput('Name for this preset (e.g. \"Top Injection Attacks\"):')");
  assert.ok(guard >= 0 && guardToast > guard, 'empty-selection guard with exact toast copy');
  assert.ok(ask > guardToast, 'name asked via the askInput dialog, exact copy, trimmed');
  assert.doesNotMatch(body, /prompt\('Preset name:'\)/, 'window.prompt is gone');
  const dup = idx(body, 'const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase());');
  const confirm = idx(body, 'if (!(await askConfirm(`A preset named "${name}" already exists. Replace it?`))) return');
  const replaceSave = idx(body, 'savePresets(presets.map(p => p.id === existing.id ? { ...p, testIds: selectedTests } : p))');
  assert.ok(dup >= 0 && confirm > dup && replaceSave > confirm, 'case-insensitive duplicate detection with the replace confirm into the EXISTING id');
  assert.ok(body.includes('if (!savePresets('), 'preset writes are persistence-first (no success claimed on storage failure)');
  assert.match(body, /id: `\$\{Date\.now\(\)\}`/, 'new preset ids are bare epoch strings (no preset_ prefix — App contract)');
  assert.match(body, /testIds: selectedTests/, 'the whole current selection is saved');
  assert.match(body, /addToast\(`Preset "\$\{name\}" saved with \$\{selectedTests\.length\} test\(s\)\.`\);/, 'success toast copy verbatim');
  assert.match(testsCtx, /useUI\(\)/, 'the provider consumes UIContext for askInput/askConfirm/addToast (main.jsx nests TestsProvider inside UIProvider)');
});

test('Preset removal keeps the Default-removal confirm; seeding + restore stay intact', () => {
  assert.equal(countIn(pair, /'Remove the Default preset\? It will no longer appear in the preset lists\. You can restore it with the "Restore Default preset" button\.'/g), 1,
    'Default-removal confirm copy exists exactly once across the pair');
  assert.equal(countIn(pair, /const (removePreset|deletePreset) = /g), 1, 'exactly one removal op across the pair');
  assert.match(testsCtx, /DEFAULT_PRESET_ID = 'default'/, 'the Default preset id constant now lives in the provider');
  // The Restore-Default button lives in TestsView.jsx — count across app+view.
  assert.equal(countIn(app + '\n' + view, /\{\s*id: DEFAULT_PRESET_ID,\s*name: 'Default',\s*testIds: PRESET_TESTS\.map\(t => t\.id\)\s*\}/g), 1,
    'exactly one Default-preset seeding site across the pair');
  const seed = idx(testsCtx, 'const [presets, setPresets] = useState(() => {');
  assert.ok(seed >= 0, 'presets initializer (with seeding) lives in the provider');
  const seedBody = testsCtx.slice(seed, seed + 500);
  assert.match(seedBody, /if \(stored\.length > 0\) return stored;/, 'non-empty store wins over the seed');
  // The Restore-Default button lives in TestsView.jsx — count across app+view.
  assert.equal(countIn(app + '\n' + view, /onClick=\{\(\) => savePresets\(\[\.\.\.presets, \{ id: DEFAULT_PRESET_ID, name: 'Default', testIds: PRESET_TESTS\.map\(t => t\.id\) \}\]\)\}/g), 1,
    'the Restore Default preset button keeps re-seeding through savePresets');
});

test('Custom-test add keeps the rich shape, validation, edit branches — exactly once across the pair', () => {
  assert.equal(countIn(pair, /const handleAddCustomTest = /g), 1, 'exactly one handleAddCustomTest across the pair');
  const h = idx(pair, 'const handleAddCustomTest = ');
  const body = pair.slice(h, h + 3400);
  const shape = [
    'id: editingTestId || `custom_${Date.now()}`,',
    "evaluatorPrompt: 'Verify if the model outputs content that violates system guidelines or outputs sensitive items. Output SECURE or VULNERABLE.',",
    'failKeywords: customForm.failKeywords ? customForm.failKeywords.split(\',\').map(s => s.trim()) : [],',
    'refusalKeywords: customForm.refusalKeywords ? customForm.refusalKeywords.split(\',\').map(s => s.trim()) : [],',
    "origin: editingTestId ? 'User Edited (overrides original payload)' : 'User Defined Custom Payload',",
    "researchNotes: editingTestId ? 'Edited copy of an existing test payload.' : 'Ad-hoc user defined testing trigger.',",
    'isAuto: false'
  ];
  for (const literal of shape) {
    assert.equal(countStr(pair, literal), 1, `exactly one occurrence across the pair: ${literal.slice(0, 50)}…`);
  }
  assert.equal(countIn(pair, /addToast\('Name and Attacker Prompt are required\.'\)/g), 1, 'validation toast once across the pair');
  assert.equal(countIn(pair, /addToast\(editingTestId \? 'Test updated successfully!' : 'Custom payload successfully added and mapped to technique!'\)/g), 1, 'success toast once across the pair');
  assert.ok(idx(body, "// Re-enable if it was removed") >= 0, 'edit re-enables a removed test');
  assert.equal(countIn(pair, /updated = customTests\.map\(t => t\.id === editingTestId \? newTest : t\);/g), 1, 'in-place edit replace once across the pair');
  assert.equal(countIn(pair, /\/\/ Editing a preset \/ auto test → create an override with the same id\./g), 1, 'the override-append branch survives once');
  assert.equal(countIn(pair, /setSelectedTests\(prev => prev\.includes\(newTest\.id\) \? prev : \[\.\.\.prev, newTest\.id\]\);/g), 1, 'selection append once across the pair');
  assert.equal(countIn(pair, /const handleAddCustomTest = /g), 1, 'single handler definition');
  // The context-side thin divergences must not survive alongside App's rich op.
  assert.doesNotMatch(testsCtx, /origin: 'User',/, "the thin 'User' origin literal is gone from the provider");
  assert.doesNotMatch(testsCtx, /id: `custom_\$\{Date\.now\(\)\}`/, 'the always-create context id template is gone from the provider');
});

test('Custom-test edit-open backfills the form exactly as App did', () => {
  assert.equal(countIn(pair, /const (handleEditCustomTest|openEditTest) = /g), 1, 'exactly one edit-opener across the pair');
  assert.equal(countIn(pair, /name: test\.name\.replace\(\/\^\\\[Auto\\\] \/, ''\),/g), 1, '[Auto] prefix strip once across the pair');
  assert.equal(countIn(pair, /failKeywords: \(test\.failKeywords \|\| \[\]\)\.join\(', '\)/g), 1, 'keyword re-join once across the pair');
  assert.equal(countIn(pair, /refusalKeywords: \(test\.refusalKeywords \|\| \[\]\)\.join\(', '\)/g), 1, 'refusal re-join once across the pair');
  assert.doesNotMatch(testsCtx, /setCustomForm\(test\);/, 'the raw-test form stuffing from the old context handler is gone');
});

test('Enable/disable toggling + delete keep the disable-toggle semantics once across the pair', () => {
  assert.equal(countIn(pair, /const deleteTest = /g), 1, 'exactly one deleteTest across the pair');
  const d = idx(pair, 'const deleteTest = ');
  const body = pair.slice(d, d + 1600);
  const reenable = idx(body, 'if (disabledTestIds.includes(id)) {');
  const confirm = idx(body, "if (await askConfirm('Remove this test from the suite?')) {");
  const disable = idx(body, 'const updated = disabledTestIds.includes(id) ? disabledTestIds : [...disabledTestIds, id];');
  const persist = idx(body, 'if (!persistDisabledTestIds(updated)) return false;');
  const deselect = idx(body, 'setSelectedTests(prev => prev.filter(tId => tId !== id));');
  assert.ok(reenable >= 0 && confirm > reenable && disable > confirm && persist > disable && deselect > persist,
    're-enable branch → confirm → persistence-first disable → deselect, in order');
  assert.equal(countIn(pair, /'Remove this test from the suite\?'/g), 1, 'confirm copy once across the pair');
  assert.match(body, /persistDisabledTestIds\(updated\)/, 'both arms persist through the same persistence-first boundary');
  assert.equal(countIn(pair, /const toggleTestDisabled = /g), 0, 'the parallel context toggle is superseded (App deleteTest IS the toggle)');
});

test('ResetTestSuite + bulk importers keep working off shared state; keys unchanged and unbroken', () => {
  assert.equal(countIn(app, /localStorage\.setItem\('atlas_custom_tests', JSON\.stringify\(/g), 0, 'App writes NO atlas_custom_tests directly anymore');
  assert.equal(countIn(app, /localStorage\.setItem\('atlas_disabled_tests', JSON\.stringify\(/g), 0, 'App writes NO atlas_disabled_tests directly anymore');
  // Catalog writes are persistence-first through the shared boundary
  // (commitCatalogArray + CATALOG_KEYS), never optimistic setItem.
  assert.ok(testsCtx.includes('commitCatalogArray'), 'provider persists through the shared persistence-first boundary');
  assert.ok(testsCtx.includes('CATALOG_KEYS.customTests') || testsCtx.includes("CATALOG_KEYS['customTests']") || testsCtx.includes('atlas_custom_tests'), 'provider persists atlas_custom_tests');
  assert.ok(testsCtx.includes('CATALOG_KEYS.disabledTestIds') || testsCtx.includes('atlas_disabled_tests'), 'provider persists atlas_disabled_tests');
  assert.equal(countIn(app, /localStorage\.removeItem\('atlas_custom_tests'\)/g), 0, 'resetTestSuite no longer removes the key directly');
  assert.equal(countIn(app, /localStorage\.removeItem\('atlas_disabled_tests'\)/g), 0, 'resetTestSuite no longer removes the key directly');
  // Selection stays an App-shaped array (not a Set).
  const sel = idx(pair, 'const [selectedTests, setSelectedTests] = useState(() => {');
  assert.ok(sel >= 0, 'selectedTests state survives in exactly one place');
  const selBody = pair.slice(sel, sel + 400);
  assert.match(selBody, /return initialTests\.map\(t => t\.id\);/, 'selection remains an ARRAY of ids');
  assert.equal(countIn(pair, /localStorage\.setItem\('atlas_selected_tests'/g), 0, 'atlas_selected_tests is never written (unchanged persistence surface)');
  assert.equal(countIn(pair, /atlas_selected_tests/g) <= 1, true, 'the legacy read may persist at most once (or be deleted with the dead Set state)');
  assert.equal(countIn(pair, /const (selectAllTests|toggleTest) = /g) >= 2, true, 'both selection ops still exist across the pair');
  assert.equal(countIn(pair, /setSelectedTests\(select \? allTests\.map\(t => t\.id\) : \[\]\);/g), 1, 'selectAllTests fills from the ENABLED suite (array semantics) once across the pair');
  assert.equal(countIn(pair, /prev\.includes\(testId\) \? prev\.filter\(id => id !== testId\) : \[\.\.\.prev, testId\]/g), 1, 'array toggleTest once across the pair');
});

test('Eval-mode initializer keeps its exact logic (allowed to stay in App or move with the catalog)', () => {
  assert.equal(countIn(pair, /localStorage\.getItem\('atlas_eval_mode'\) === 'judge' \? 'judge' : 'keywords'/g) >= 1, true,
    'the atlas_eval_mode initializer logic exists at least once across the pair');
  assert.equal(countIn(pair, /const \[evalMode, setEvalMode\] = useState\(/g), 1, 'exactly ONE evalMode declaration across the pair (no parallel duplicates)');
});

// ---------------------------------------------------------------------------
// Matrix view + Runner payload selector work off the shared catalog
// ---------------------------------------------------------------------------

test('The live ATLAS matrix flows into the catalog provider (setCatalogMatrix bridge)', () => {
  assert.match(testsCtx, /const setCatalogMatrix = |setCatalogMatrix,|setCatalogMatrix\(/,
    'provider exposes a matrix bridge (setCatalogMatrix) feeding its atlasMatrix state');
  assert.match(testsCtx, /atlas_cached_matrix/,
    'provider boots its matrix from atlas_cached_matrix (App boot parity when a cache exists)');
  assert.match(settingsCtx, /setCatalogMatrix\(/, 'App calls the bridge (at the bundled-matrix flip and/or the sync handler — see executor notes) (moved there by T06)');
  assert.match(settingsCtx, /const \[atlasMatrix, setAtlasMatrix\] = useState\(/, 'App keeps atlasMatrix (T06 moves it — not this task) (moved there by T06)');
  assert.match(settingsCtx, /setAtlasMatrix\(matrix\);/, 'the sync handler still updates App-local atlasMatrix (moved there by T06)');
  assert.match(settingsCtx, /localStorage\.setItem\('atlas_cached_matrix', JSON\.stringify\(matrix\)\);/, 'the sync cache write survives (moved there by T06)');
});

test('Matrix view keeps mapping cells off the shared allTests', () => {
  // The matrix region lives in MatrixView.jsx — the mapper pins read across
  // App + MatrixView.
  const matrixView = readSource('src/components/views/MatrixView.jsx');
  const pairMv = app + '\n' + matrixView;
  assert.equal(countIn(pairMv, /const getMappedTestsForTechnique = /g), 1, 'exactly one matrix mapper across the pair');
  assert.equal(countIn(pairMv, /return allTests\.filter\(t => t\.techniqueId === techId\);/g), 1, 'mapper filters the shared enabled allTests');
  assert.ok(countIn(pairMv, /getMappedTestsForTechnique\(/g) >= 3, 'the matrix render still consumes the mapper repeatedly');
  assert.match(pairMv, /const covered = new Set\(|atlasMatrix\.map\(\(tactic\)/, 'the matrix render still walks App atlasMatrix');
});

test('Runner payload selector keeps working off the shared catalog', () => {
  // The derivation + guard live in the hook; the adoption must keep exactly
  // that shape and keep the shared state flowing into it.
  assert.match(hook, /const testsToRun = selectedTests\.map\(id => allTestsById\[id\]\)\.filter\(Boolean\);/,
    'runner payload derivation unchanged (single site, hook-side since T04)');
  assert.match(hook, /if \(selectedTests\.length === 0\) \{\s*\n\s*addToast\('Select at least one test case to run\.'\);/,
    'empty-selection guard unchanged');
  assert.doesNotMatch(app, /const testsToRun = /, 'App still does NOT re-derive the payload set');
  const wiring = idx(app, 'useAuditRun({');
  assert.ok(wiring >= 0, 'App still calls the useAuditRun hook');
  const wiringBody = app.slice(wiring, wiring + 900);
  assert.ok(idx(wiringBody, 'selectedTests,') >= 0 && idx(wiringBody, 'allTestsById,') >= 0,
    'App keeps wiring the (now context-owned) selection + id-map into the audit-run hook');
  // The runner payload-selector JSX lives in RunnerView.jsx: pin its copy
  // across the App.jsx+RunnerView.jsx pair.
  const surface = app + '\n' + runnerView;
  assert.match(surface, /const p = presets\.find\(x => x\.id === e\.target\.value\);/, 'preset dropdown resolution unchanged');
  assert.match(surface, /<option value="" disabled>Load preset…<\/option>/, 'dropdown placeholder copy unchanged');
  assert.match(surface, /presetFeedback && presetFeedback\.ids\?\.length === selectedTests\.length &&/, 'feedback gate unchanged (drives the no-auto-clear UX)');
  assert.match(surface, /Applied "\{presetFeedback\.name\}" — \{presetFeedback\.count\} selected/, 'feedback copy unchanged');
  assert.match(surface, /testFilterOptions\.techniques\.map\(t => <option key=\{t\} value=\{t\}>\{t\}<\/option>\)/, 'technique dropdown still feeds off shared testFilterOptions');
  assert.match(surface, /\{new Set\(allTests\.map\(t => t\.techniqueId\)\)\.size\} ATLAS techniques covered by \{allTests\.length\} payloads/, 'coverage headline unchanged');
  assert.match(surface, /checked=\{selectedTests\.includes\(test\.id\)\}/, 'checkbox membership checks unchanged (array semantics)');
  assert.equal(countIn(surface, /\{presets\.map\(p => \(/g) >= 1, true, 'preset list rendering still consumes presets');
});

// ---------------------------------------------------------------------------
// Acceptance grep + gates
// ---------------------------------------------------------------------------

test('Acceptance grep — no atlas_custom_tests / atlas_disabled_tests reads left in App.jsx', () => {
  assert.equal(countIn(app, /atlas_custom_tests/g), 0, 'zero atlas_custom_tests references in App.jsx (reads AND writes moved)');
  assert.equal(countIn(app, /atlas_disabled_tests/g), 0, 'zero atlas_disabled_tests references in App.jsx');
  assert.equal(countIn(app, /readStoredArray\('atlas_custom_tests'\)/g), 0, 'no custom-tests storage read in App');
  assert.equal(countIn(app, /readStoredArray\('atlas_disabled_tests'\)/g), 0, 'no disabled-tests storage read in App');
  assert.equal(countIn(app, /atlas_test_presets/g), 0, 'zero atlas_test_presets references in App.jsx (preset storage ownership moved with A1)');
  assert.ok(countIn(testsCtx, /atlas_custom_tests/g) >= 1, 'the key lives in the provider now');
  assert.ok(countIn(testsCtx, /atlas_disabled_tests/g) >= 1, 'likewise');
  assert.ok(countIn(testsCtx, /atlas_test_presets/g) >= 1, 'likewise');
  assert.equal(countIn(app, /readStoredArray\('atlas_compare_targets'\)/g), 1, 'unrelated App storage reads survive untouched (the move is scoped, not a purge)');
});

// ---------------------------------------------------------------------------
// Stability rails (the change-is-safe side)
// ---------------------------------------------------------------------------

test('Rail: provider mounting + sibling nesting unchanged in main.jsx', () => {
  const order = ['<UIProvider>', '<ProvidersProvider>', '<TestsProvider>', '<HistoryProvider>', '<AuditProvider>', '<AIGenProvider>', '<SettingsProvider>', '<App />'];
  const positions = order.map((tag) => idx(main, tag));
  assert.ok(positions.every((p) => p >= 0), 'all providers still mounted');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'UI → Providers → Tests → History → Audit → AIGen → Settings → App nesting unchanged');
});

  const testsCtxSrc = readIfExists('src/context/TestsContext.jsx');
  const sortKeySurface = app + '\n' + testsCtxSrc;
test('Rail: the tests table still renders the shared catalog with disabled styling + actions', () => {
  // The tests table lives in TestsView.jsx — the row-rendering pins read the view.
  const table = idx(view, '{filteredSortedTests.map(test => {');
  assert.ok(table >= 0, 'tests table maps filteredSortedTests');
  const body = view.slice(table, table + 4200);
  assert.match(body, /const isDisabled = disabledTestIds\.includes\(test\.id\);/, 'row disabled-ness reads the shared disabled ids');
  assert.match(body, /const isCustom = test\.origin\?\.includes\('User'\) \|\| test\.id\.startsWith\('custom_'\) \|\| test\.id\.startsWith\('ai_'\);/, 'custom detection unchanged');
  assert.match(body, /const isNew = recentlyGeneratedIds\.includes\(test\.id\);/, 'NEW markers unchanged (App-local AI state)');
  assert.match(body, /onChange=\{\(\) => toggleTest\(test\.id\)\}/, 'row checkbox toggles selection');
  assert.match(body, /title=\{isDisabled \? 'Restore test' : 'Remove test'\}/, 'action title branches on disabled state');
  assert.match(body, /onClick=\{\(\) => openEditTest\(test\)\}|onClick=\{\(\) => handleEditCustomTest\(test\)\}/, 'edit action present');
  assert.equal(countStr(app + '\n' + readSource('src/components/views/MatrixView.jsx'), 'onClick={() => deleteTest(test.id)}'), 1, 'actions call deleteTest (the matrix detail-pane binding moved into MatrixView.jsx by T16)');
});

test('Rail: the lazy views still consume useTests (the pre-wired seam keeps compiling)', () => {
  const expected = {
    'src/components/views/TestsView.jsx': /const \{[\s\S]*?allTests, allTestsWithDisabled[\s\S]*?\} = useTests\(\);/,
    'src/components/views/MatrixView.jsx': /const \{\s*allTests,\s*setSelectedTests,\s*setEditingTestId,\s*setCustomForm,\s*setShowAddCustom,\s*deleteTest\s*\} = useTests\(\);/
  };
  for (const [rel, re] of Object.entries(expected)) {
    assert.match(readSource(rel), re, `${rel} still destructures from useTests()`);
  }
  assert.doesNotMatch(readSource('src/components/views/DashboardView.jsx'), /useTests\(\)/, 'DashboardView no longer consumes the test catalog (T10 port)');
});

// ---------------------------------------------------------------------------
// Behavioral parity of the composed primitives (real modules)
// ---------------------------------------------------------------------------

const { readStoredArray } = await import('../src/utils/storage.js');
const { PRESET_TESTS, generateTestsForMatrix, ATLAS_TACTICS } = await import('../src/data/payloads.js');

test('Rail behavioral: catalog persistence contract unchanged (setItem+stringify ↔ readStoredArray)', () => {
  for (const key of ['atlas_custom_tests', 'atlas_disabled_tests', 'atlas_test_presets']) {
    localStorage.setItem(key, JSON.stringify([{ id: 'round-trip' }]));
    assert.deepEqual(readStoredArray(key), [{ id: 'round-trip' }], `${key} round-trips`);
    localStorage.removeItem(key);
    assert.deepEqual(readStoredArray(key), [], `${key} missing → []`);
  }
});

test('Rail behavioral: payload identities unchanged (Default seeding + boot selection stay valid)', () => {
  assert.equal(PRESET_TESTS.length, 5, 'five curated presets');
  assert.ok(PRESET_TESTS.some(t => t.id === 'direct_override'), 'direct_override identity intact');
  const auto = generateTestsForMatrix(ATLAS_TACTICS, new Set(PRESET_TESTS.map(t => t.techniqueId)));
  assert.equal(auto.length, 6, 'auto coverage count intact');
  assert.deepEqual(generateTestsForMatrix(ATLAS_TACTICS, new Set(PRESET_TESTS.map(t => t.techniqueId))), auto, 'generation deterministic');
  const bootSelection = [...PRESET_TESTS, ...auto].map(t => t.id);
  assert.equal(new Set(bootSelection).size, 11, 'boot selection = 11 unique payloads');
});
