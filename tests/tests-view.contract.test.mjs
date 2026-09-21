// Contract: the real TestsView. The `{activeTab === 'tests' && (…)}`
// JSX region of src/App.jsx — the AI Generation card (sources, busy panel,
// Generate & Review), the Test Cases management table (sort/filter/checkboxes,
// edit/delete, bulk actions) and the Test Presets card — renders from
// src/components/views/TestsView.jsx consuming useTests()/useAIGen()/
// useProviders()/useUI() directly, while the App-owned orchestration
// (openAiWizard, clearNewMarkers, openBulkImport and the
// import/wizard/add-custom modals) stays in src/App.jsx and is wired into the
// view.
//
// Domain ownership: resetTestSuite/openAddTest/toggleTest/selectAllTests are
// TestsProvider context actions consumed from useTests(); openAiWizard is a
// useAIGeneration hook-bound action App binds and wires in; the
// recentlyGeneratedIds state is declared in AIGenContext, with App/hook
// writers and a read-only view wiring.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see the sibling hook suites,
// tests/audit-engine.contract.test.mjs, tests/source-intake.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/TestsView.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '', settingsCtx = '', hook = '', runnerView = '', wizardModal = '', wizardResults = '', testsCtx = '';
try {
  app = readSource(APP_PATH);
  settingsCtx = readSource('src/context/SettingsContext.jsx');
  view = readSource(VIEW_PATH);
  hook = readSource(HOOK_PATH);
  runnerView = readSource('src/components/views/RunnerView.jsx');
  wizardModal = readSource('src/components/modals/AiGenWizardModal.jsx');
  wizardResults = readSource('src/components/modals/AiGenWizardResults.jsx');
  testsCtx = readSource('src/context/TestsContext.jsx');
} catch { /* missing files fail their first assertion */ }

// The active-model chip definition home and its call-site form resolve from
// either side of the shared ModelSelectors.jsx / ActiveModelChip.jsx split.
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
const modelSelectors = readIfExists('src/components/ModelSelectors.jsx') || readIfExists('src/components/ActiveModelChip.jsx');
const chipIsComponent = modelSelectors.includes('export function ActiveModelChip(');
// Chip usage in either form the contract accepts: the render-prop call or the
// JSX component render.
const chipUses = (source) => countIn(source, 'renderActiveModelChip(') + countIn(source, '<ActiveModelChip');
// The add-custom-test dialog region resolves from either side of the
// CustomTestFormModal.jsx extraction; the bulk-import modal state + handlers
// get the same tolerance (BulkImportModal) so the modal-boundary pins are
// green regardless of sibling landing order.
const addCustomModal = readIfExists('src/components/modals/CustomTestFormModal.jsx');
const bulkImportModal = readIfExists('src/components/modals/BulkImportModal.jsx');

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const pair = app + '\n' + view;
const hookPair = app + '\n' + hook;

// The <TestsView … /> wiring block inside App.jsx (from the opening tag to the
// first self-closing `/>`), used to prove App passes its App-owned handlers
// and state down to the view.
function wiringBlock() {
  const start = app.indexOf('<TestsView');
  assert.ok(start >= 0, 'App.jsx mounts <TestsView … />');
  // App mount blocks can nest self-closing component mounts — the outer close
  // is the `/>` at the mount tag's own indentation level.
  const tagIndent = /^[\t ]*/.exec(app.slice(app.lastIndexOf('\n', start) + 1))[0];
  const end = app.indexOf(`\n${tagIndent}/>`, start);
  assert.ok(end > start, 'the mount closes at its own indentation level');
  return app.slice(start, end + `\n${tagIndent}/>`.length);
}
// A name reaches the view either through App's wiring block or through a local
// definition inside the view component (2-space component-body indent).
const reachesView = (name) => {
  if (new RegExp(`^  const ${name} = `, 'm').test(view)) return 'local';
  if (wiringBlock().includes(name)) return 'wired';
  return null;
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
// The view is real, mounted, context-consuming; the region left App.jsx
// ---------------------------------------------------------------------------

test('TestsView.jsx is the real view — named + default export, real cards, placeholder gone', () => {
  assert.match(view, /export function TestsView\(/, 'TestsView is exported (parameterless stub export replaced)');
  assert.match(view, /export default TestsView;/, 'the default export stays for direct App composition');
  for (const marker of ['data-tour="ai-gen-pane"', 'data-tour="test-cases"', 'data-tour="test-presets"']) {
    assert.ok(view.includes(marker), `the view renders ${marker}`);
  }
  assert.ok(!view.includes('Test Management view - Test table with filtering, sorting, and custom test creation'), 'the stub placeholder text is gone');
  assert.doesNotMatch(view, /\buseState\s*\(/, 'the view introduces no parallel local state — everything comes from contexts and props');
  assert.ok(view.split('\n').length > 380, `the view carries the moved region (baseline stub was 31 lines); got ${view.split('\n').length}`);
});

test('App mounts <TestsView and the tests-region markers leave App.jsx', () => {
  const wire = wiringBlock();
  assert.ok(wire.length > 10, 'the mount is wired with props');
  for (const marker of [
    'data-tour="ai-gen-pane"',
    'data-tour="test-cases"',
    'data-tour="test-presets"',
    'Test Cases (',
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Test Presets</h3>',
    'Manage the full suite: add, edit, or remove payloads. Edited presets become overrides, removed tests can be restored. Click a column header to sort.',
    "localStorage.setItem('atlas_ai_gen_collapsed'",
    "localStorage.setItem('atlas_tests_collapsed'",
    'Search name, technique, source…',
    'No presets yet. Save a selection as a preset to get started.'
  ]) {
    assert.ok(!app.includes(marker), `region marker left App.jsx: ${marker}`);
    assert.equal(countIn(pair, marker), 1, `moved copy exists exactly once across App + view: ${marker}`);
  }
  assert.doesNotMatch(app, /\{\/\* 2b\. TEST MANAGEMENT VIEW \*\/\}/, 'the 2b region comment is gone');
  assert.match(app, /import TestsView from '\.\/components\/views\/TestsView';|import \{ TestsView \} from '\.\/components\/views\/TestsView';|const TestsView = lazy\(/, 'App imports (or lazy-loads) the view component');
});

test('The view consumes useTests(), useAIGen(), useProviders() and useUI() directly (no prop drilling of context state)', () => {
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  const aiBlock = /const \{([\s\S]*?)\} = useAIGen\(\);/.exec(view);
  assert.ok(testsBlock, 'the view destructures useTests()');
  assert.ok(aiBlock, 'the view destructures useAIGen()');
  for (const name of [
    'allTests', 'allTestsWithDisabled', 'filteredSortedTests', 'sortedTests', 'testFilterOptions',
    'testFilterQ', 'setTestFilterQ', 'testFilterTechnique', 'setTestFilterTechnique',
    'testFilterSource', 'setTestFilterSource', 'testFilterEnabled', 'setTestFilterEnabled',
    'testSortIndicator', 'clickTestSort', 'disabledTestIds', 'selectedTests',
    'openEditTest', 'deleteTest', 'presets', 'savePresets', 'applyPreset', 'saveCurrentAsPreset', 'removePreset'
  ]) {
    assert.match(testsBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from TestsContext`);
  }
  for (const name of [
    'aiGenCollapsed', 'setAiGenCollapsed', 'testsCollapsed', 'setTestsCollapsed',
    'aiGenerating', 'aiGenStage', 'aiGenStageDetail', 'aiGenMode',
    'aiSourceProfiles', 'expandedSourceIds', 'toggleSourceExpanded', 'aiGeneratedCount',
    'aiGenUrls', 'aiGenSourceKeys', 'openAddSourceDialog'
  ]) {
    assert.match(aiBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from AIGenContext`);
  }
  assert.match(view, /\} = useUI\(\);/, 'the view consumes the UI context');
  assert.match(view, /\bsetActiveTab\b/, 'the view uses setActiveTab (preset Apply switches to the runner tab)');
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view) || /const \{([\s\S]*?)\} = providersCtx;/.exec(view);
  assert.ok(providersBlock, 'the view consumes the providers context');
  for (const name of ['vaultLocked', 'vaultPassphraseSet']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from ProvidersContext`);
  }
});

test('View module imports — DEFAULT_PRESET_ID, payload data, and the lucide icon set', () => {
  const ctxImport = /import \{([^}]*)\} from '\.\.\/\.\.\/context\/TestsContext(\.jsx)?';/.exec(view);
  assert.ok(ctxImport, 'the view imports from TestsContext');
  assert.match(ctxImport[1], /\bDEFAULT_PRESET_ID\b/, 'DEFAULT_PRESET_ID comes from the shared context module');
  const payloadImport = /import \{([^}]*)\} from '\.\.\/\.\.\/data\/payloads(\.js)?';/.exec(view);
  assert.ok(payloadImport, 'the view imports from data/payloads');
  assert.match(payloadImport[1], /\bPROMPT_SOURCING_INFO\b/, 'PROMPT_SOURCING_INFO for the bundled source rows');
  assert.match(payloadImport[1], /\bPRESET_TESTS\b/, 'PRESET_TESTS for the Default-preset restore');
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(view);
  assert.ok(lucide, 'the view imports its icons from lucide-react');
  for (const icon of ['Wand2', 'ChevronDown', 'ChevronUp', 'RefreshCw', 'Plus', 'X', 'Check', 'RotateCcw', 'Upload', 'Edit3', 'Trash2', 'Play']) {
    assert.match(lucide[1], new RegExp(`\\b${icon}\\b`), `icon ${icon} imported`);
  }
});

test('Cross-region copy is not duplicated — the wizard\u2019s overlapping literals stay unique to App', () => {
  assert.ok(view.includes('AI Test Generation'), 'the card title moves into the view');
  // The Helper Models card (with the gen-config explainer carrying the
  // "AI Test Generation" mention) resolves across SettingsView.jsx and
  // HelperModelsCard.jsx — count the union to prove the literal stays unique.
  const settingsView = readSource('src/components/views/SettingsView.jsx');
  const helperCard = readIfExists('src/components/views/settings/HelperModelsCard.jsx');
  assert.equal(countIn(app + '\n' + settingsView + '\n' + helperCard, 'AI Test Generation'), 1, 'the cross-region "AI Test Generation" literal stays unique (helper-card-local after the T08 split)');
  assert.ok(view.includes("aiGenMode === 'deep' ? 'Deep (analyze → generate → critique)' : 'Fast (single pass)'"), 'the deep/fast note moves into the view');
  // The wizard's own deep/fast copy renders results-side.
  assert.equal(countIn(app, "Deep (analyze → generate → critique)"), 0, 'App keeps no wizard copy of the deep/fast note (moved by T18)');
  assert.equal(countIn(wizardResults, "Deep (analyze → generate → critique)"), 1, 'the wizard copy of the deep/fast note renders results-side (moved by T18)');
});

// ---------------------------------------------------------------------------
// The moved JSX keeps its copy and bindings — AI Generation card
// ---------------------------------------------------------------------------

test('AI-gen collapse toggle + busy panel + stage machine keep baseline copy in the view', () => {
  const v = norm(view);
  ordered(v, 'view.ai-gen collapse', [
    'setAiGenCollapsed(prev => {',
    "localStorage.setItem('atlas_ai_gen_collapsed', next ? '1' : '0');",
    'title={aiGenCollapsed ? \'Expand AI generation options\' : \'Collapse AI generation options\'}',
    '{aiGenCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}'
  ]);
  ordered(v, 'view.busy panel', [
    '{aiGenerating ? (',
    "aiGenStage === 'analyzing' && 'Analyzing sources…'",
    "aiGenStage === 'generating' && 'Generating test payloads…'",
    "aiGenStage === 'critiquing' && 'Critiquing & refining tests…'",
    '!aiGenStage && `Generating with ${effectiveGenConfig.provider} AI…`',
    '{aiGenStageDetail && <div',
    "aiGenMode === 'deep' ? 'Deep (analyze → generate → critique)' : 'Fast (single pass)'"
  ]);
});

test('Source rows, badge ladders and expansion keep baseline semantics in the view', () => {
  const v = norm(view);
  ordered(v, 'view.status ladder', [
    "status === 'declined' ? 'PROXY DECLINED — INFERRING'",
    "status === 'proxyFailed' ? 'PROXY FAILED — INFERRING'",
    "status === 'pasted' ? 'PASTED'",
    "status === 'fetched' ? 'CONTENT FETCHED'",
    "status === 'corsBlocked' ? 'CORS-BLOCKED — INFERRING'",
    ": 'BUNDLED'"
  ]);
  const defRows = norm("const defRows = Object.entries(PROMPT_SOURCING_INFO).map(([key, info]) => ({ id: key, tag: 'DEFAULT', title: info.origin, url: info.url, desc: info.description, fetchNote: info.fetchNote, assessment: info.assessment, profile: aiSourceProfiles[key], enabled: aiGenSourceKeys.includes(key), onToggle: () => toggleAiGenSource(key), status: 'bundled' }));");
  const customRows = norm("const customRows = aiGenUrls.map(s => ({ id: s.id, tag: 'CUSTOM', title: s.title || s.url || 'Untitled source', url: s.kind === 'paste' ? null : s.url, pasteChars: s.kind === 'paste' ? s.excerpt.length : null, desc: s.description, fetchNote: s.fetchNote, assessing: s.assessing, assessment: s.assessment, profile: aiSourceProfiles[s.id], enabled: s.enabled, onToggle: () => toggleAiGenUrl(s.id), status: s.declined ? 'declined' : s.proxyFailed ? 'proxyFailed' : s.kind === 'paste' ? 'pasted' : s.excerpt ? 'fetched' : 'corsBlocked', onRemove: () => removeAiGenUrl(s.id) }));");
  assert.ok(v.includes(defRows), 'defRows maps PROMPT_SOURCING_INFO verbatim');
  assert.ok(v.includes(customRows), 'customRows maps aiGenUrls verbatim (toggle/remove via the intake handlers)');
  ordered(v, 'view.row expansion', [
    'const expanded = expandedSourceIds.has(row.id);',
    'onClick={() => toggleSourceExpanded(row.id)}',
    '{row.onRemove && (',
    'disabled={vaultLocked && (vaultPassphraseSet ?? false)}'
  ]);
});

test('Add custom source + Generate & Review keep the read-only vault gates in the view', () => {
  ordered(norm(view), 'view.action row', [
    '<button onClick={openAddSourceDialog} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ whiteSpace: \'nowrap\' }}>',
    '<Plus size={14} /> Add custom source (URL / GitHub repo / article)',
    '<button onClick={openAiWizard} disabled={vaultLocked && (vaultPassphraseSet ?? false)} data-tour="ai-generate" className="btn-primary"',
    '<Wand2 size={16} /> Generate &amp; Review Tests'
  ]);
});

// ---------------------------------------------------------------------------
// The moved JSX keeps its copy and bindings — Test Cases table
// ---------------------------------------------------------------------------

test('Test Cases header counts and NEW-badge copy move into the view', () => {
  ordered(norm(view), 'view.test cases header', [
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Test Cases ({allTests.length} active{allTestsWithDisabled.length > allTests.length ? ` · ${allTestsWithDisabled.length - allTests.length} removed` : \'\'})</h3>',
    '{recentlyGeneratedIds.length > 0 && (',
    '{recentlyGeneratedIds.length} newly added test(s) are marked with a NEW badge.',
    '{aiGeneratedCount > 0 && recentlyGeneratedIds.length === 0 && (',
    'Last AI run added {aiGeneratedCount} new test(s).',
    'Manage the full suite: add, edit, or remove payloads. Edited presets become overrides, removed tests can be restored. Click a column header to sort.'
  ]);
});

test('Table collapse + bulk-action buttons (Select all/none, Reset Suite, Add Custom Test, Bulk Import) move into the view', () => {
  ordered(norm(view), 'view.bulk actions', [
    'setTestsCollapsed(prev => {',
    "localStorage.setItem('atlas_tests_collapsed', next ? '1' : '0');",
    '<button onClick={clearNewMarkers} className="btn-secondary" style={{ fontSize: \'0.8rem\', padding: \'8px 14px\' }}>',
    '<button onClick={() => selectAllTests(true)} className="btn-secondary"',
    '<Check size={15} /> Select all',
    '<button onClick={() => selectAllTests(false)} className="btn-secondary"',
    '<X size={15} /> Select none',
    '<button onClick={resetTestSuite} disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    '<RotateCcw size={15} /> Reset Suite',
    '<button onClick={openAddTest} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary"',
    '<Plus size={15} /> Add Custom Test',
    '<button onClick={openBulkImport} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary"',
    'title="Bulk import tests from native JSON/YAML (or JSONL/CSV) test-case files"',
    '<Upload size={15} /> Bulk Import'
  ]);
});

test('The filter rail keeps the exact option copy and the shown counter in the view', () => {
  ordered(norm(view), 'view.filter rail', [
    'value={testFilterQ}',
    'onChange={(e) => setTestFilterQ(e.target.value)}',
    'placeholder="Search name, technique, source…"',
    'value={testFilterTechnique}',
    '<option value="all">All techniques</option>',
    '{testFilterOptions.techniques.map(t => <option key={t} value={t}>{t}</option>)}',
    'value={testFilterSource}',
    '<option value="all">All sources</option>',
    '{testFilterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}',
    'value={testFilterEnabled}',
    '<option value="all">All (enabled & removed)</option>',
    '<option value="enabled">Enabled only</option>',
    '<option value="disabled">Removed only</option>',
    '{filteredSortedTests.length} of {sortedTests.length} shown'
  ]);
});

test('Sortable headers — name/techniqueId/source with cursor-pointer and testSortIndicator — move into the view', () => {
  ordered(norm(view), 'view.sort headers', [
    "<th onClick={() => clickTestSort('name')} style={{ padding: '8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>",
    'Test Name{testSortIndicator(\'name\')}',
    "<th onClick={() => clickTestSort('techniqueId')}",
    'Technique{testSortIndicator(\'techniqueId\')}',
    "<th onClick={() => clickTestSort('source')}",
    'Source{testSortIndicator(\'source\')}'
  ]);
  assert.ok(!app.includes("clickTestSort('name')"), 'the sort bindings left App.jsx');
});

test('Table rows — runner checkbox, NEW/auto/custom/removed badges, vault-gated edit/delete — move into the view', () => {
  ordered(norm(view), 'view.row rendering', [
    '{filteredSortedTests.map(test => {',
    'const isDisabled = disabledTestIds.includes(test.id);',
    "const isCustom = test.origin?.includes('User') || test.id.startsWith('custom_') || test.id.startsWith('ai_');",
    'const isNew = recentlyGeneratedIds.includes(test.id);',
    "background: isNew ? 'rgba(168,85,247,0.10)' : isDisabled ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',",
    'opacity: isDisabled ? 0.55 : 1',
    'checked={selectedTests.includes(test.id)}',
    'onChange={() => toggleTest(test.id)}',
    'title="Include in runner"',
    '{isNew && <span className="badge badge-primary"',
    '{test.isAuto && <span className="badge badge-secondary"',
    '{isCustom && <span className="badge badge-primary"',
    '{isDisabled && <span className="badge badge-vulnerable"',
    '<button onClick={() => openEditTest(test)} disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    'title="Edit test"',
    '<button onClick={() => deleteTest(test.id)} disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    "title={isDisabled ? 'Restore test' : 'Remove test'}",
    '<Trash2 size={13} />'
  ]);
});

// ---------------------------------------------------------------------------
// The moved JSX keeps its copy and bindings — Test Presets card
// ---------------------------------------------------------------------------

test('Presets card — save-current, Default restore, tab-switch-then-apply, delete — move into the view', () => {
  ordered(norm(view), 'view.presets card', [
    '<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Test Presets</h3>',
    'Curated groups of tests you can apply in the Auditor Runner\'s "Attack Payloads Selection". The Default',
    '<button onClick={saveCurrentAsPreset} className="btn-secondary"',
    '<Plus size={15} /> Save current selection as preset',
    '{presets.length === 0 && (',
    'No presets yet. Save a selection as a preset to get started.',
    '{!presets.some(p => p.id === DEFAULT_PRESET_ID) && (',
    "onClick={() => savePresets([...presets, { id: DEFAULT_PRESET_ID, name: 'Default', testIds: PRESET_TESTS.map(t => t.id) }])}",
    '<RotateCcw size={14} /> Restore Default preset',
    '{presets.map(p => (',
    '{p.id === DEFAULT_PRESET_ID && (',
    '{p.testIds.length} test(s) · {p.testIds.filter(id => allTests.some(t => t.id === id)).length} currently available',
    "onClick={() => { setActiveTab('runner'); applyPreset(p); }}",
    '<Play size={12} /> Apply',
    '<button onClick={() => removePreset(p.id)}',
    'title="Delete preset"'
  ]);
  const v = norm(view);
  assert.ok(v.indexOf("setActiveTab('runner'); applyPreset(p);") >= 0, 'Apply still switches to the runner tab BEFORE applying (ordering pin)');
  assert.ok(!app.includes('<h3 style={{ fontSize: \'1.15rem\', fontWeight: 800 }}>Test Presets</h3>'), 'the presets card markup left App.jsx');
  assert.ok(!app.includes('No presets yet. Save a selection as a preset to get started.'), 'the empty-presets copy left App.jsx');
});

// ---------------------------------------------------------------------------
// App-owned collaborators reach the view — no second source of truth
// ---------------------------------------------------------------------------

test('Selection + add-test handlers resolve into the view with exactly one definition across the trio (T03: context-owned)', () => {
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(testsBlock, 'the view destructures useTests()');
  for (const name of ['toggleTest', 'selectAllTests', 'openAddTest']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(testsBlock[1]), `${name} reaches the view through useTests() (context action, T03)`);
    assert.equal(countIn(app + '\n' + testsCtx + '\n' + view, `const ${name} = `), 1, `${name} has exactly one definition across App.jsx + TestsContext.jsx + TestsView.jsx`);
    assert.equal(countIn(testsCtx, `const ${name} = `), 1, `${name} is defined in TestsContext.jsx (the single definition site, T03)`);
    assert.equal(countIn(wiringBlock(), `${name}={${name}}`), 0, `App no longer wires ${name} as a prop (context action, T03)`);
  }
});

test('App-owned orchestration handlers keep their exact bodies and are wired into the view (openAiWizard domain-side since T05)', () => {
  // openAiWizard is a useAIGeneration hook-bound action; App binds it from the
  // hook destructure and still wires it into the view.
  assert.match(hook, /^  const openAiWizard = /m, 'openAiWizard is defined hook-side (T05 moved it into the AI-gen domain)');
  assert.doesNotMatch(app, /^  const openAiWizard = /m, 'openAiWizard is no longer App-defined (T05)');
  const hookDestructure = /const \{([\s\S]*?)\} = useAIGeneration\(\{/.exec(app);
  assert.ok(hookDestructure && /\bopenAiWizard\b/.test(hookDestructure[1]), 'App binds openAiWizard from useAIGeneration()');
  assert.equal(reachesView('openAiWizard'), 'wired', 'openAiWizard is still wired into <TestsView as a prop');
  assert.doesNotMatch(view, /^  const openAiWizard = /m, 'openAiWizard is NOT redefined inside the view');
  assert.match(app, /^  const clearNewMarkers = /m, 'clearNewMarkers stays defined App-side (it writes App-owned state)');
  assert.equal(reachesView('clearNewMarkers'), 'wired', 'clearNewMarkers is wired into <TestsView as a prop');
  assert.doesNotMatch(view, /^  const clearNewMarkers = /m, 'clearNewMarkers is NOT redefined inside the view');
  // resetTestSuite is a TestsProvider context action; the view consumes it
  // from useTests() while App neither defines nor wires it. Its exact body is
  // pinned by tests/catalog-actions.contract.test.mjs.
  assert.equal(countIn(app, 'const resetTestSuite = '), 0, 'resetTestSuite is no longer defined App-side (T03 moved it into TestsContext)');
  assert.equal(countIn(testsCtx, 'const resetTestSuite = '), 1, 'resetTestSuite is defined exactly once, TestsContext-side (T03)');
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(testsBlock && /\bresetTestSuite\b/.test(testsBlock[1]), 'the view consumes resetTestSuite from useTests()');
  assert.equal(countIn(wiringBlock(), 'resetTestSuite={resetTestSuite}'), 0, 'App no longer wires resetTestSuite as a prop (context action, T03)');
  assert.equal(
    bodyOf(hook, 'openAiWizard'),
    "const openAiWizard = () => { setAiWizardError(''); setAiWizardStep(aiPreview && aiPreview.tests.length ? 'results' : 'sources'); setAiWizardOpen(true); };"
  );
  assert.equal(
    bodyOf(app, 'clearNewMarkers'),
    "const clearNewMarkers = () => { setRecentlyGeneratedIds([]); localStorage.setItem('atlas_recent_ai_tests', JSON.stringify([])); };"
  );
});

test('The bulk-import entry button lives in the view; the import modal and parser stay in-App', () => {
  assert.equal(reachesView('openBulkImport'), 'wired', 'openBulkImport is wired into <TestsView as a prop');
  assert.match(app, /^  const openBulkImport = \(\) => \{/m, 'openBulkImport stays defined App-side');
  assert.doesNotMatch(view, /^  const openBulkImport = /m, 'the view does not reimplement openBulkImport');
  assert.ok(view.includes('title="Bulk import tests from native JSON/YAML (or JSONL/CSV) test-case files"'), 'the entry button (with its exact title) renders from the view');
  // The import modal JSX + its state/handler definitions resolve from either
  // side of the BulkImportModal extraction, green in every sibling landing
  // order.
  const importSurface = app + '\n' + bulkImportModal;
  assert.ok(importSurface.includes('{importOpen && ('), 'the import modal JSX is still rendered (App-side pre-T13, BulkImportModal.jsx post-T13)');
  assert.match(importSurface, /^  const parseImportText = \(\) => \{/m, 'parseImportText stays App-side (pre-T13) or lives in BulkImportModal.jsx (post-T13)');
  const importerSurface = app + '\n' + bulkImportModal;
  assert.match(importerSurface, /utils\/testImporter';/, 'the importer module stays consumed (App-side pre-T13, module-side post-T13)');
  assert.doesNotMatch(view, /parseBulkTests|importOpen/, 'the view touches neither the parser nor the modal state');
});

test('RecentlyGeneratedIds is context-owned (AIGenContext since T04); its writers split across App+hook; the view only reads it', () => {
  assert.ok(readSource('src/context/AIGenContext.jsx').includes("const [recentlyGeneratedIds, setRecentlyGeneratedIds] = useState(() => readStoredArray('atlas_recent_ai_tests'));"), 'the state is declared context-side (T04 consolidation)');
  assert.doesNotMatch(app, /const \[recentlyGeneratedIds,/, 'App no longer declares the state (it destructures it from useAIGen)');
  // The wizard commit has success + partial-marker outcomes (hook), alongside
  // clearNewMarkers + the NEW-marker reset registration (App).
  assert.equal([...hookPair.matchAll(/setRecentlyGeneratedIds\(/g)].length, 4, 'four writers across the App+hook pair: clearNewMarkers + the T03 reset registration (App) and the two wizard-commit outcomes (hook)');
  assert.equal(countIn(hook, /setRecentlyGeneratedIds\(/g), 2, 'the hook contributes the success + partial-marker commit writers');
  assert.equal(reachesView('recentlyGeneratedIds'), 'wired', 'recentlyGeneratedIds is wired into <TestsView as a read-only prop');
  assert.doesNotMatch(view, /setRecentlyGeneratedIds/, 'the view never writes the recent list');
  assert.doesNotMatch(view, /atlas_recent_ai_tests/, 'the view never touches the persistence key');
});

test('EffectiveGenConfig and renderActiveModelChip stay App-owned (other regions consume them) and are wired into the view', () => {
  assert.ok(settingsCtx.includes('const effectiveGenConfig = genConfig || judgeConfig;'), 'effectiveGenConfig is derived provider-side (moved there by T06)');
  assert.ok(app.includes('effectiveGenConfig'), 'App keeps consuming the shared effective config (passed into the view)');
  // The chip definition home resolves from either side of the ModelSelectors
  // move: an App-local render helper or the shared component, whose render
  // prop is absent from src/.
  if (chipIsComponent) {
    assert.equal(countIn(modelSelectors, 'export function ActiveModelChip('), 1, 'ActiveModelChip is the shared chip component (T08 move)');
    assert.equal(countIn(app, 'const renderActiveModelChip'), 0, 'App sheds the chip const definition (T08 move; the wirings become inline component mounts)');
  } else {
    assert.match(app, /^  const renderActiveModelChip = \(label, cfg\) => \(/m, 'renderActiveModelChip stays defined App-side');
  }
  assert.equal(reachesView('effectiveGenConfig'), 'wired', 'effectiveGenConfig is wired into <TestsView as a prop');
  assert.doesNotMatch(view, /^  const effectiveGenConfig = /m, 'effectiveGenConfig is not redefined in the view');
  // TestsView stays prop-fed either way — the App wiring is the bare
  // render-helper identifier or an inline component-mount wrapper.
  assert.equal(reachesView('renderActiveModelChip'), 'wired', 'renderActiveModelChip is wired into <TestsView as a prop (pre-T08 helper or post-T08 inline component-mount wrapper)');
  assert.doesNotMatch(view, /^  const renderActiveModelChip = /m, 'renderActiveModelChip is not redefined in the view');
  // Chip call sites: the runner chip renders in RunnerView.jsx, the
  // config-step chip in the wizard modal and the running-step chip in
  // AiGenWizardResults.jsx — 0 remain in App, 1 modal-side, 1 results-side and
  // 1 in the runner view, in either call form. App hosts exactly its two
  // inline pass-through mounts (the TestsView + RunnerView wirings).
  assert.equal(chipUses(app), chipIsComponent ? 2 : 0, 'App hosts no chip call site pre-T08; post-T08 exactly its two inline pass-through mounts (TestsView + RunnerView wiring)');
  assert.equal(chipUses(wizardResults), 1, 'the running-step chip call site renders results-side (moved by T18)');
  assert.equal(chipUses(wizardModal), 1, 'the config-step chip call site renders modal-side (moved by T17)');
  assert.equal(chipUses(runnerView), 1, 'the runner chip call site renders from RunnerView.jsx (moved by T12)');
});

test('The intake toggle handlers reach the view — wired props or a view-side useAIGeneration call, never duplicated', () => {
  for (const name of ['toggleAiGenSource', 'toggleAiGenUrl', 'removeAiGenUrl']) {
    assert.ok(view.includes(name), `${name} is referenced inside TestsView.jsx`);
    assert.ok(countIn(pair, `const ${name} = `) <= 1, `${name} has at most one definition across the pair (its canonical definition lives in the useAIGeneration hook)`);
    if (reachesView(name) === null) {
      assert.match(view, /useAIGeneration\(\{/, 'if not wired as props, the view resolves the intake handlers by calling useAIGeneration itself');
    }
  }
  assert.doesNotMatch(view, /^  const toggleAiGenSource = |^  const toggleAiGenUrl = |^  const removeAiGenUrl = /m, 'the view never redefines the intake handlers inline');
});

test('Modal boundaries — the wizard, add-custom and import modals stay App-rendered', () => {
  assert.ok(app.includes('{aiWizardOpen && ('), 'the AI wizard modal JSX stays App-side');
  // The add-custom-test dialog JSX resolves from either side of the
  // CustomTestFormModal extraction (App gate or module).
  assert.ok(app.includes('{showAddCustom && (') || addCustomModal.includes('{showAddCustom && ('), 'the add-custom-test modal JSX stays App-rendered (App gate pre-T14, CustomTestFormModal.jsx post-T14)');
  // The import modal JSX resolves from either side of the BulkImportModal
  // extraction, ordering-agnostic with its siblings.
  assert.ok(app.includes('{importOpen && (') || bulkImportModal.includes('{importOpen && ('), 'the import modal JSX stays App-rendered (App gate pre-T13, BulkImportModal.jsx post-T13)');
  assert.ok(!view.includes('aiWizardOpen') || !view.includes('{aiWizardOpen && ('), 'the view does not render the wizard modal');
});

// ---------------------------------------------------------------------------
// Acceptance greps — App loses the region; gates
// ---------------------------------------------------------------------------

test('App.jsx loses the tests-view JSX region (shrink gate)', () => {
  const appLines = app.split('\n').length;
  assert.ok(appLines < 7050, `App.jsx shrinks below 7050 lines (baseline 7255; region ≈ 406 lines out minus mount wiring); got ${appLines}`);
  const viewLines = view.split('\n').length;
  assert.ok(viewLines > 380, `TestsView.jsx grows past 380 lines with the moved region (baseline 31); got ${viewLines}`);
});

test('Acceptance greps — flow markers live only in the view; App keeps its engine/settings/runner regions', () => {
  for (const marker of [
    'data-tour="test-cases"',
    "clickTestSort('techniqueId')",
    "onClick={() => { setActiveTab('runner'); applyPreset(p); }}",
    "localStorage.setItem('atlas_tests_collapsed'",
    'const customRows = aiGenUrls.map(s => ({'
  ]) {
    assert.ok(!app.includes(marker), `tests-view marker left App.jsx: ${marker}`);
    assert.ok(view.includes(marker), `tests-view marker lives in the view: ${marker}`);
  }
  assert.ok(view.includes('onChange={() => toggleTest(test.id)}'), 'the runner-inclusion checkbox moves into the view');
  // The runner checkbox binding renders from RunnerView.jsx — App keeps 0, the
  // runner view carries the call site.
  assert.equal(countIn(app, 'onChange={() => toggleTest(test.id)}'), 0, 'the runner checkbox binding left App.jsx (moved by T12)');
  assert.ok(runnerView.includes('onChange={() => toggleTest(test.id)}'), 'the runner checkbox binding lives in RunnerView.jsx (moved by T12)');
  assert.ok(view.includes('onClick={() => deleteTest(test.id)}'), 'the table delete binding moves into the view');
  // The matrix detail pane renders from MatrixView.jsx — App keeps no
  // deleteTest binding; the view-side matrix occurrence is exactly one.
  assert.equal(countIn(app, 'onClick={() => deleteTest(test.id)}'), 0, 'App keeps no deleteTest binding (the matrix pane moved into MatrixView.jsx by T16)');
  assert.ok(readSource('src/components/views/MatrixView.jsx').includes('onClick={() => deleteTest(test.id)}'), 'the matrix delete binding lives in MatrixView.jsx (T16)');
  assert.ok(app.includes('{activeTab === \'runner\' && ('), 'the runner region is untouched in App.jsx');
  assert.ok(readSource('src/context/AIGenContext.jsx').includes('const [recentlyGeneratedIds, setRecentlyGeneratedIds]'), 'the recent-list state lives in AIGenContext (T04 consolidation)');
});
