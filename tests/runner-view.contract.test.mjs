// Contract: the real RunnerView. The `{activeTab === 'runner' && (…)}`
// JSX region of src/App.jsx — the Model Comparison Lineup config panel
// (add-target form, lineup list, Evaluation Engine + AI Judge config card),
// the Attack Payloads Selection card (presets, filters, technique/test
// checkboxes), the run-audit controls with the inline diagnostic console and
// progress bar — renders from src/components/views/RunnerView.jsx consuming
// the shared contexts directly, while the App-owned orchestration (lineup +
// provider state, engine-hook bindings, override handler with its
// judge-feedback loop, report builder, shared render helpers) stays in
// src/App.jsx and is wired into the view. The comparison results grid +
// expanded-cell detail render from the memoized
// src/components/runner/ComparisonResults.jsx, so the results-grid pins below
// target the component while the view keeps the config/console surfaces.
//
// Domain ownership: toggleTest/selectAllTests are TestsProvider context
// actions the view consumes from useTests(); the audit-detail glue
// (handleResultOverride/printRunReport) resolves across the App ∪
// src/hooks/useAuditDetail.js union, with the hook read tolerant so the union
// degrades to App alone. Bodies stay byte-identical hook-side and every
// call-site and wiring pin on the view/component stays put.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see the sibling hook suites,
// tests/audit-engine.contract.test.mjs, tests/tests-view.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/RunnerView.jsx';
const COMP_PATH = 'src/components/runner/ComparisonResults.jsx';
const SYNC_HOOK_PATH = 'src/hooks/useProviderModelSync.js';
const AUDIT_MODAL_PATH = 'src/components/modals/AuditDetailModal.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
// Component-file reads resolve tolerantly, so the union pins below degrade to
// their App-side form when a component is absent; the audit modal read in the
// try block below follows the same pattern.
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

let app = '', view = '', comp = '', testsCtx = '', syncHook = '', tour = '', auditModal = '', comparisonTable = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  comp = readSource(COMP_PATH);
  testsCtx = readSource('src/context/TestsContext.jsx');
  syncHook = readSource(SYNC_HOOK_PATH);
  // The guided-tour step definitions live in the pure factory module
  // src/utils/tour-steps.js; when absent `tour` stays ''.
  tour = readSource('src/utils/tour-steps.js');
  // The audit-detail modal carries the four `handleResultOverride(d, ` call
  // sites after its extraction; read tolerantly so `auditModal` stays '' when
  // absent.
  try { auditModal = readSource(AUDIT_MODAL_PATH); } catch { /* absent */ }
  try { comparisonTable = readSource('src/utils/comparison-table.js'); } catch { /* absent */ }
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (the
// factory module may own it; the file may be absent).
const appTour = app + '\n' + tour;
// The audit-detail orchestration resolves across App ∪
// src/hooks/useAuditDetail.js (tolerant: the union degrades to App alone when
// the hook is absent).
const appAudit = app + '\n' + readIfExists('src/hooks/useAuditDetail.js');
const triple = appTour + '\n' + view + '\n' + comp;

// The <RunnerView … /> wiring block inside App.jsx (from the opening tag to
// the first self-closing `/>`), used to prove App passes its App-owned state
// and handlers down to the view.
function wiringBlock() {
  const start = app.indexOf('<RunnerView');
  assert.ok(start >= 0, 'App.jsx mounts <RunnerView … />');
  // App mount blocks can nest self-closing component mounts — the outer close
  // is the `/>` at the mount tag's own indentation level.
  const tagIndent = /^[\t ]*/.exec(app.slice(app.lastIndexOf('\n', start) + 1))[0];
  const end = app.indexOf(`\n${tagIndent}/>`, start);
  assert.ok(end > start, 'the mount closes at its own indentation level');
  return app.slice(start, end + `\n${tagIndent}/>`.length);
}
// A name reaches the view either through App's wiring block or through a
// local definition inside the view component (2-space component-body indent).
const reachesView = (name) => {
  if (new RegExp(`^  const ${name} = `, 'm').test(view)) return 'local';
  if (wiringBlock().includes(name)) return 'wired';
  return null;
};

// Ordered-substring helper over a normalized body: pins presence AND order.
// Both the body and every needle are whitespace-normalized, so multi-line
// JSX needles match regardless of indentation.
const ordered = (rawBody, label, needles) => {
  const body = norm(rawBody);
  let cursor = -1;
  for (const rawNeedle of needles) {
    const needle = norm(rawNeedle);
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

// The model-list/selection machinery resolves from whichever source owns it
// (App.jsx or src/hooks/useProviderModelSync.js). Exactly-once across the pair
// is asserted at the call sites via syncUnion.
const syncUnion = app + '\n' + syncHook;
const syncBodyOf = (name) => {
  if (countIn(app, `  const ${name} = `) > 0) return bodyOf(app, name);
  return bodyOf(syncHook, name);
};

// ---------------------------------------------------------------------------
// The view is real, mounted, context-consuming; the region left App.jsx
// ---------------------------------------------------------------------------

test('RunnerView.jsx is the real view — named + default export, real cards, placeholder gone', () => {
  assert.match(view, /export function RunnerView\(/, 'RunnerView is exported (parameterless stub export replaced by the props-taking component)');
  assert.match(view, /export default RunnerView;/, 'the default export stays for direct App composition');
  for (const marker of [
    'data-tour="runner-lineup"',
    'data-tour="add-target"',
    'data-tour="payload-selection"',
    'data-tour="preset-select"',
    'data-tour="run-audit"',
    'data-tour="show-console"',
    'data-testid="audit-run"',
    'data-testid="audit-stop"'
  ]) {
    assert.ok(view.includes(marker), `the view renders ${marker}`);
  }
  // The results region lives in ComparisonResults.jsx — its three markers go
  // with it.
  for (const marker of ['data-tour="results-table"', 'data-tour="expanded-result"', 'data-testid="run-report"']) {
    assert.ok(comp.includes(marker), `the component renders ${marker}`);
  }
  assert.ok(!view.includes('Auditor Runner view - Configure targets, select tests, run audits'), 'the stub placeholder text is gone');
  assert.ok(view.split('\n').length > 400, `the view carries the runner config (T13 shrank it below 600); got ${view.split('\n').length}`);
  assert.ok(comp.split('\n').length > 300, `ComparisonResults.jsx carries the moved results region; got ${comp.split('\n').length}`);
});

test('App mounts <RunnerView and the runner-region markers leave App.jsx', () => {
  const wire = wiringBlock();
  assert.ok(wire.length > 10, 'the mount is wired with props');
  // Region-EXCLUSIVE markers: they leave App.jsx entirely and exist exactly once across App + view + component.
  for (const marker of [
    'data-tour="runner-lineup"',
    'data-tour="payload-selection"',
    'data-testid="audit-run"',
    'data-testid="audit-stop"',
    'data-testid="run-report"',
    'Console idle. Run a Comparison Audit to stream logs here...',
    'No results yet. Run a Comparison Audit to see the payload × model matrix here.',
    'Failed Attack Payloads',
    'Inconclusive (errors / empty)',
    'Succeeded Attack Payloads',
    'data-testid={`result-row-${testId}`}',
    'data-testid={`model-summary-${t.uid}`}',
    "subtitle: 'Auditor Runner — Comparison Run'"
  ]) {
    assert.ok(!app.includes(marker), `region marker left App.jsx: ${marker}`);
    assert.equal(countIn(triple, marker), 1, `moved copy exists exactly once across App + view + component: ${marker}`);
  }
  // Tour-anchored markers: the onboarding tour (App-side) targets them with
  // bracket selectors, so App keeps exactly its tour copy while the real
  // anchor JSX moves into the view (triple count 2 = view + tour).
  for (const marker of [
    'data-tour="add-target"',
    'data-tour="preset-select"',
    'data-tour="run-audit"',
    'data-tour="show-console"'
  ]) {
    assert.equal(countIn(view, marker), 1, `the view carries the anchor: ${marker}`);
    assert.equal(countIn(appTour, marker), 1, `App keeps exactly its tour copy: ${marker}`);
    assert.equal(countIn(triple, marker), 2, `triple count (view anchor + tour reference): ${marker}`);
  }
  // The results-table anchor lives in the component (comp 1 / App 1 / view 0).
  assert.equal(countIn(comp, 'data-tour="results-table"'), 1, 'the component carries the results-table anchor');
  assert.equal(countIn(appTour, 'data-tour="results-table"'), 1, 'App keeps exactly its tour copy (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.equal(countIn(view, 'data-tour="results-table"'), 0, 'the view no longer renders the results-table anchor');
  // Headline copy is pinned as the full <h3> element so a doc comment in the
  // view cannot satisfy it; App's copy is the tour title string. The
  // Comparison Results headline lives in the component.
  for (const [h3, tourCopy] of [
    ["<h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Model Comparison Lineup</h3>", 'Model Comparison Lineup'],
    ["<h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Attack Payloads Selection</h3>", 'Attack Payloads Selection']
  ]) {
    assert.equal(countIn(view, h3), 1, `the view carries the headline: ${h3}`);
    assert.equal(countIn(appTour, tourCopy), 1, `App keeps exactly its tour copy: ${tourCopy}`);
  }
  assert.equal(countIn(comp, "<h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Comparison Results</h3>"), 1, 'the component carries the Comparison Results headline');
  assert.equal(countIn(appTour, 'Comparison Results'), 1, 'App keeps exactly its tour copy: Comparison Results');
  // 'expanded-result' additionally appears in the component's own
  // scroll-into-view effect.
  assert.equal(countIn(comp, 'data-tour="expanded-result"'), 2, 'the component carries the anchor + its scroll-effect selector');
  assert.equal(countIn(view, 'data-tour="expanded-result"'), 0, 'the view no longer carries the anchor or the effect');
  assert.equal(countIn(appTour, 'data-tour="expanded-result"'), 1, 'App keeps exactly its tour copy (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.equal(countIn(triple, 'data-tour="expanded-result"'), 3, 'triple count (anchor + effect + tour)');
  // 'Run Comparison Audit' also appears twice in the App tour step (title + body).
  assert.equal(countIn(view, 'Run Comparison Audit'), 1, 'the view carries the Run button copy');
  assert.equal(countIn(appTour, 'Run Comparison Audit'), 2, 'App keeps exactly its tour title + body copy (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.doesNotMatch(app, /\{\/\* 3\. RUNNER VIEW \*\/\}/, 'the 3. RUNNER VIEW region comment is gone');
  assert.ok(!app.includes('{/* Comparison Results */}'), 'the results-grid comment moved with the region');
  assert.match(app, /import RunnerView from '\.\/components\/views\/RunnerView';/, 'App imports the view component');
});

test('The view consumes useAudit(), useUI(), useTests(), useProviders() and useSettings() directly (no prop drilling of context state)', () => {
  const auditBlock = /const \{([\s\S]*?)\} = useAudit\(\);/.exec(view);
  assert.ok(auditBlock, 'the view destructures useAudit() (AuditContext, since T03)');
  for (const name of ['running', 'stopping', 'progress', 'consoleLogs', 'currentTestName']) {
    assert.match(auditBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from AuditContext`);
  }
  assert.doesNotMatch(auditBlock[1], /\bresults\b/, 'the view no longer consumes results (T13 moved the grid into ComparisonResults)');
  const uiBlock = /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  assert.ok(uiBlock, 'the view destructures useUI()');
  for (const name of ['terminalOpen', 'setTerminalOpen']) {
    assert.match(uiBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from UIContext (console state lives there)`);
  }
  // HistoryContext lives in the component, so the view drops it entirely.
  assert.ok(!view.includes('useHistory'), 'the view drops HistoryContext entirely (overrides/results reads moved to the component)');
  assert.ok(!view.includes('resultOverrideKey'), 'the view drops resultOverrideKey (the override buttons moved)');
  const compHistoryBlock = /const \{([\s\S]*?)\} = useHistory\(\);/.exec(comp);
  assert.ok(compHistoryBlock, 'the component destructures useHistory()');
  assert.match(compHistoryBlock[1], /\boverrides\b/, 'the component takes overrides from HistoryContext');
  assert.match(comp, /import \{ useHistory, resultOverrideKey \} from '\.\.\/\.\.\/context\/HistoryContext';/, 'resultOverrideKey comes from the shared HistoryContext module');
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(testsBlock, 'the view destructures useTests()');
  for (const name of ['allTests', 'selectedTests', 'presets', 'applyPreset', 'saveCurrentAsPreset', 'presetFeedback', 'testFilterOptions', 'evalMode', 'setEvalMode']) {
    assert.match(testsBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from TestsContext`);
  }
  const providersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(providersBlock, 'the view destructures useProviders()');
  for (const name of ['providers', 'providerModelFetching', 'syncProviderModels', 'providerLabel']) {
    assert.match(providersBlock[1], new RegExp(`\\b${name}\\b`), `the view keeps ${name} from ProvidersContext`);
  }
  assert.doesNotMatch(providersBlock[1], /\bmodelTargetLabel\b/, 'the view drops modelTargetLabel (report meta + expanded cell moved)');
  const compProvidersBlock = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(comp);
  assert.ok(compProvidersBlock, 'the component destructures useProviders()');
  for (const name of ['vaultLocked', 'vaultPassphraseSet', 'providerLabel', 'modelTargetLabel']) {
    assert.match(compProvidersBlock[1], new RegExp(`\\b${name}\\b`), `the component takes ${name} from ProvidersContext`);
  }
  const settingsBlock = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(settingsBlock, 'the view destructures useSettings()');
  for (const name of ['useDemoMode', 'judgeConfig']) {
    assert.match(settingsBlock[1], new RegExp(`\\b${name}\\b`), `the view takes ${name} from SettingsContext`);
  }
});

test('View module imports — deriveModelsEndpoint, the sandbox ids, and the lucide icon set', () => {
  assert.match(view, /import \{[^}]*deriveModelsEndpoint[^}]*\} from '\.\.\/\.\.\/utils\/api';/, 'deriveModelsEndpoint comes from utils/api');
  const sandboxImport = /import \{([^}]*)\} from '\.\.\/\.\.\/data\/app-config';/.exec(view);
  assert.ok(sandboxImport, 'the view imports the sandbox id from data/app-config');
  assert.match(sandboxImport[1], /\bSANDBOX_PROVIDER_ID\b/, 'SANDBOX_PROVIDER_ID imported (the sandbox pseudo-provider option)');
  assert.ok(!view.includes('SANDBOX_MODELS'), 'SANDBOX_MODELS stays App-side (only getActiveModelList consumes it) — keeps the view lint-clean');
  const react = /import React, \{([^}]*)\} from 'react';/.exec(view);
  assert.ok(react, 'the view imports React hooks');
  for (const hook of ['useState', 'useRef', 'useEffect']) {
    assert.match(react[1], new RegExp(`\\b${hook}\\b`), `React hook ${hook} imported`);
  }
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(view);
  assert.ok(lucide, 'the view imports its icons from lucide-react');
  for (const icon of ['RefreshCw', 'Plus', 'X', 'Shield', 'Play', 'HelpCircle', 'Terminal']) {
    assert.match(lucide[1], new RegExp(`\\b${icon}\\b`), `icon ${icon} imported`);
  }
  // The results surface lives in ComparisonResults.jsx — the eight moved icons
  // plus the two shared ones (X, HelpCircle) live there.
  const compLucide = /import \{([^}]*)\} from 'lucide-react';/.exec(comp);
  assert.ok(compLucide, 'the component imports its icons from lucide-react');
  for (const icon of ['Info', 'ChevronDown', 'ChevronUp', 'ShieldCheck', 'ShieldAlert', 'AlertTriangle', 'Download', 'Lock', 'X', 'HelpCircle']) {
    assert.match(compLucide[1], new RegExp(`\\b${icon}\\b`), `icon ${icon} imported`);
  }
  const compReact = /import React, \{([^}]*)\} from 'react';/.exec(comp);
  assert.ok(compReact, 'the component imports React hooks');
  for (const hook of ['useState', 'useEffect', 'memo']) {
    assert.match(compReact[1], new RegExp(`\\b${hook}\\b`), `React hook ${hook} imported`);
  }
});

test('The view\u2019s local UI state is exactly the two payload-filter atoms plus the console ref — the five results-UI atoms moved with the grid', () => {
  assert.equal(countIn(view, 'useState('), 2, `exactly two useState atoms stay view-side (payload filters); got ${countIn(view, 'useState(')}`);
  assert.ok(view.includes("const [payloadFilterQ, setPayloadFilterQ] = useState('');"), 'payloadFilterQ moves');
  assert.ok(view.includes("const [payloadFilterTechnique, setPayloadFilterTechnique] = useState('all');"), 'payloadFilterTechnique moves');
  assert.ok(view.includes('const consoleScrollRef = useRef(null);'), 'the console scroll ref moves into the view');
  // The five results-UI atoms live in the component (exact bodies).
  for (const decl of [
    "const [sortKey, setSortKey] = useState('name');",
    "const [sortDir, setSortDir] = useState('asc');",
    'const [showFailedGroup, setShowFailedGroup] = useState(true);',
    'const [showInconclusiveGroup, setShowInconclusiveGroup] = useState(false);',
    'const [showSucceededGroup, setShowSucceededGroup] = useState(false);'
  ]) {
    assert.ok(comp.includes(decl), `the component owns ${decl}`);
    assert.ok(!view.includes(decl), `the view lost ${decl}`);
  }
  assert.equal(countIn(comp, 'useState('), 5, `exactly five useState atoms in the component; got ${countIn(comp, 'useState(')}`);
  ordered(view, 'console auto-scroll effect', [
    'if (consoleScrollRef.current) {',
    'consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;',
    '}, [consoleLogs]);'
  ]);
  ordered(comp, 'expanded-cell scroll-into-view effect', [
    "const el = document.querySelector('[data-tour=\"expanded-result\"]');",
    "if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });",
    '}, [expandedCell]);'
  ]);
  // The engine hook still owns the audit lifecycle and App owns the lineup:
  // neither surface writes engine/lineup state (the wired setters it CALLS —
  // setSelectedProvider/setSelectedModel/setExpandedCell — are props, not state).
  for (const forbidden of ['setRunning', 'setStopping', 'setProgress', 'setResults', 'setCurrentTestName', 'addConsoleLog', 'setTargets', 'useState(() =>']) {
    assert.ok(!view.includes(forbidden) && !comp.includes(forbidden), `neither the view nor the component writes ${forbidden} — lifecycle/lineup state stays App-owned`);
  }
});

test('App wires its App-owned state/handlers into the view', () => {
  for (const name of [
    'targets', 'addTarget', 'removeTarget',
    'selectedProvider', 'setSelectedProvider', 'selectedModel', 'setSelectedModel',
    'activeModels', 'selectedProviderObj', 'providerSelectable',
    'expandedCell', 'setExpandedCell',
    'runSecurityAudit', 'stopSecurityAudit',
    'renderJudgeSelector', 'renderActiveModelChip',
    'printRunReport', 'handleResultOverride'
  ]) {
    assert.equal(reachesView(name), 'wired', `App wires ${name} into the view`);
  }
  // toggleTest/selectAllTests are TestsProvider context actions — the view
  // consumes them from useTests() and App does not wire them as props.
  const testsBlock = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(testsBlock, 'the view destructures useTests()');
  assert.match(testsBlock[1], /\btoggleTest\b/, 'the view consumes toggleTest from useTests() (context action, T03)');
  assert.match(testsBlock[1], /\bselectAllTests\b/, 'the view consumes selectAllTests from useTests() (context action, T03)');
  assert.ok(!wiringBlock().includes('toggleTest={toggleTest}'), 'App no longer wires toggleTest as a prop (context action, T03)');
  assert.ok(!wiringBlock().includes('selectAllTests={selectAllTests}'), 'App no longer wires selectAllTests as a prop (context action, T03)');
});

test('App keeps the App-owned state the runner depends on; the T09 sync machinery stays defined exactly once across App + hook', () => {
  assert.equal(bodyOf(app, 'addTarget'), "const addTarget = () => { if (!selectedModel) { addToast('Select a model to add to the comparison lineup.'); return; } const existing = targets.find(t => t.provider === selectedProvider && t.model === selectedModel); if (existing) { addToast('This model is already in the comparison lineup.'); return; } const updated = [...targets, { uid: `${selectedProvider}::${selectedModel}`, provider: selectedProvider, model: selectedModel }]; setTargets(updated); localStorage.setItem('atlas_compare_targets', JSON.stringify(updated)); };");
  assert.equal(bodyOf(app, 'removeTarget'), "const removeTarget = (uid) => { setTargets(prev => { const updated = prev.filter(t => t.uid !== uid); localStorage.setItem('atlas_compare_targets', JSON.stringify(updated)); return updated; }); };");
  assert.ok(norm(app).includes(norm("const DEMO_TARGETS = [\n  { uid: 'sandbox::demo-secure', provider: SANDBOX_PROVIDER_ID, model: 'Demo Secure' },\n  { uid: 'sandbox::demo-vulnerable', provider: SANDBOX_PROVIDER_ID, model: 'Demo Vulnerable' }\n];")), 'DEMO_TARGETS stays App-side (module scope)');
  assert.ok(app.includes('return useDemoMode ? DEMO_TARGETS : [];'), 'demo seeding stays in the App targets initializer');
  assert.ok(app.includes('const [expandedCell, setExpandedCell] = useState(null);'), 'expandedCell stays App-side (the engine hook receives setExpandedCell)');
  assert.equal(syncBodyOf('getActiveModelList'), 'const getActiveModelList = () => { if (selectedProvider === SANDBOX_PROVIDER_ID) return SANDBOX_MODELS; const cp = providers.find(p => p.id === selectedProvider); return cp ? providerModelsFor(cp) : []; };');
  assert.equal(countIn(syncUnion, 'const getActiveModelList = () => {'), 1, 'getActiveModelList is defined exactly once across App + sync hook (T09: hook-owned post-extraction)');
  assert.equal(syncBodyOf('providerSelectable'), 'const providerSelectable = (p) => { if (p === SANDBOX_PROVIDER_ID) return useDemoMode; return providers.some(cp => cp.id === p && cp.enabled !== false); };');
  assert.equal(countIn(syncUnion, 'const providerSelectable = (p) => {'), 1, 'providerSelectable is defined exactly once across App + sync hook (T09: hook-owned post-extraction)');
  assert.equal(countIn(syncUnion, 'const activeModels = getActiveModelList();'), 1, 'activeModels derives exactly once across App + sync hook (the fallback effects read it)');
  assert.equal(countIn(syncUnion, 'const selectedProviderObj = providers.find(p => p.id === selectedProvider);'), 1, 'selectedProviderObj derives exactly once across App + sync hook');
  ordered(syncUnion, 'selected-provider fallback effect', [
    'if (providerSelectable(selectedProvider)) return;',
    'const options = useDemoMode ? [SANDBOX_PROVIDER_ID] : [];',
    'if (options.length > 0) setSelectedProvider(options[0]);'
  ]);
  ordered(syncUnion, 'selected-model fallback effect', [
    'if (activeModels.length > 0) {',
    'if (!activeModels.find(m => m.id === selectedModel)) {',
    'setSelectedModel(activeModels[0].id);'
  ]);
});

// ---------------------------------------------------------------------------
// The moved JSX keeps its copy and bindings — config panel
// ---------------------------------------------------------------------------

test('The lineup config panel keeps baseline copy in the view', () => {
  ordered(view, 'view.lineup card', [
    'Model Comparison Lineup',
    'Add the models you want to compare. Every selected attack payload is run against each model side-by-side.',
    'data-tour="add-target"',
    '<label className="form-label">Provider</label>',
    '{!useDemoMode && !providerSelectable(selectedProvider) && (',
    '<option value={selectedProvider} disabled>Provider not configured — add one in Settings → Providers</option>',
    '{providerSelectable(SANDBOX_PROVIDER_ID) && <option value={SANDBOX_PROVIDER_ID}>Sandbox (demo, simulated)</option>}',
    '{providers.filter(cp => cp.enabled !== false).map(cp => (',
    '<label className="form-label">Model</label>',
    '{selectedProviderObj && !(selectedProviderObj.models?.length) ? (',
    'placeholder="e.g. gpt-4o"',
    "title=\"Fetch models from endpoint\"",
    'disabled={running || activeModels.length === 0}',
    '{activeModels.map(m => (',
    'Custom endpoint: {selectedProviderObj.endpoint} · Rate limit: {selectedProviderObj.rpm} req/min',
    'No models available. Add a provider in Settings → Providers to pick models.',
    'onClick={addTarget}',
    '<Plus size={16} /> Add to Comparison'
  ]);
  ordered(view, 'view.lineup list', [
    'Comparison Lineup ({targets.length})',
    'No models added yet. Use the form above to add at least one target model.',
    '{targets.map(t => (',
    '{t.model}',
    '{providerLabel(t.provider)}',
    'onClick={() => removeTarget(t.uid)}',
    '<X size={12} />'
  ]);
});

test('The eval-mode + judge-config card keeps baseline copy and persistence in the view', () => {
  ordered(view, 'view.eval-mode', [
    "[['keywords', 'Heuristic Keywords'], ['judge', 'AI Judge']].map(([val, label]) => (",
    "onClick={() => { setEvalMode(val); localStorage.setItem('atlas_eval_mode', val); }}",
    "background: evalMode === val ? 'rgba(59,130,246,0.15)' : undefined,",
    'Sandbox is active — this run simulates responses, but you can still pick the judge for later.'
  ]);
  ordered(view, 'view.judge card', [
    "opacity: evalMode !== 'judge' ? 0.55 : 1",
    '<Shield size={16} color="var(--color-primary)" />',
    'AI Judge Provider',
    "{evalMode !== 'judge' ? 'Select \u201CAI Judge\u201D to enable' : 'Evaluates every response before scoring'}",
    "{renderJudgeSelector(evalMode !== 'judge')}"
  ]);
});

test('The payload selector keeps baseline semantics in the view', () => {
  ordered(view, 'view.payload actions', [
    '{selectedTests.length} selected',
    '{new Set(allTests.map(t => t.techniqueId)).size} ATLAS techniques covered by {allTests.length} payloads',
    "onClick={() => selectAllTests(true)} className=\"btn-secondary\" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Select All</button>",
    "onClick={() => selectAllTests(false)} className=\"btn-secondary\" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Clear All</button>",
    'onChange={(e) => {\n                      const p = presets.find(x => x.id === e.target.value);\n                      if (p) applyPreset(p);\n                      e.target.value = \'\';\n                    }}',
    '<option value="" disabled>Load preset…</option>',
    '<option key={p.id} value={p.id}>{p.name} ({p.testIds.length})</option>',
    'title="Save the current selection as a reusable preset"',
    '<Plus size={12} /> Save as preset',
    '{presetFeedback && presetFeedback.ids?.length === selectedTests.length &&',
    'Applied "{presetFeedback.name}" — {presetFeedback.count} selected'
  ]);
  ordered(view, 'view.payload filter + rows', [
    'value={payloadFilterQ}',
    'placeholder="Search payloads…"',
    'value={payloadFilterTechnique}',
    '<option value="all">All techniques</option>',
    '{testFilterOptions.techniques.map(t => <option key={t} value={t}>{t}</option>)}',
    'shown',
    "const q = payloadFilterQ.trim().toLowerCase();\n                      if (q && !`${t.name} ${t.techniqueId} ${t.techniqueName}`.toLowerCase().includes(q)) return false;\n                      if (payloadFilterTechnique !== 'all' && t.techniqueId !== payloadFilterTechnique) return false;\n                      return true;\n                    })",
    'checked={selectedTests.includes(test.id)} \n                          onChange={() => toggleTest(test.id)}',
    'disabled={running}',
    "<span className=\"badge badge-secondary\" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>auto</span>",
    "{(test.origin?.includes('User') || test.id.startsWith('custom_') || test.id.startsWith('ai_')) && (",
    'title={`Source: ${test.origin}\\n\\nNotes: ${test.researchNotes}`}',
    '{test.techniqueId}',
    '{test.tactic}'
  ]);
});

test('Run controls + inline console keep baseline copy in the view (start/stop drive the T04 engine hook bindings)', () => {
  ordered(view, 'view.run controls', [
    'data-testid="audit-run"',
    'onClick={runSecurityAudit}',
    "className={`btn-primary ${running ? 'glow-active' : ''}`}",
    'Auditing: {currentTestName}...',
    '<button data-testid="audit-stop" onClick={stopSecurityAudit} disabled={stopping}',
    "{stopping ? 'Stopping…' : 'Stop Audit'}",
    'Progress: {progress}%',
    "{running && renderActiveModelChip( evalMode === 'judge' ? (judgeConfig && judgeConfig.provider ? 'Judge:' : 'Judge: Not configured') : 'Heuristic Keywords (offline)', evalMode === 'judge' ? judgeConfig : { provider: '', model: '' } )}"
  ]);
  ordered(view, 'view.progress bar', [
    'width: `${running ? progress : 0}%`,',
    "background: running ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',",
    "transition: 'width 0.25s ease'"
  ]);
  ordered(view, 'view.console', [
    'onClick={() => setTerminalOpen(v => !v)}',
    'data-tour="show-console"',
    "{terminalOpen ? 'Hide Console' : 'Show Console'}",
    "{consoleLogs.filter(l => l.includes('✗') || l.includes('ERROR')).length > 0 && (",
    '<div ref={consoleScrollRef} className="code-box"',
    'Console idle. Run a Comparison Audit to stream logs here...',
    "color: logStr.includes('✓') ? 'var(--color-secure)' :",
    "logStr.includes('✗') || logStr.includes('Verdict: VULNERABLE') ? 'var(--color-vulnerable)' :",
    "logStr.includes('Evaluation:') ? 'var(--color-warning)' : '#c9d1d9'"
  ]);
});

test('The comparison results grid keeps baseline math, groupings, sort, badges and summaries (T13: now in ComparisonResults.jsx)', () => {
  if (comparisonTable) {
    for (const name of ['buildComparisonRows', 'classifyComparisonRows', 'selectWorstResult', 'sortComparisonRows', 'summarizeModelResults']) {
      assert.ok(comp.includes(name), `ComparisonResults adopts ${name}`);
    }
  } else {
    ordered(comp, 'baseline comparison grid derivation', [
      "const statusWeight = (s) => s === 'VULNERABLE' ? 0 : s === 'SECURE' ? 1 : 2;",
      'const cellRes = targets.map(t => results.find(r => r.testId === testId && r.targetUid === t.uid));',
      "const worst = Math.min(...cellRes.map(r => (r ? statusWeight(eff(r)) : 3)));",
      "else if (sortKey === 'result') d = (b.vulnCount - a.vulnCount) || (a.worst - b.worst);",
      'const failedRows = rows.filter(r => r.vulnCount > 0).sort(cmp);'
    ]);
  }
  ordered(comp, 'component.grid table', [
    'Attack Payload{sortIndicator(\'name\')}',
    'Technique{sortIndicator(\'technique\')}',
    'Result{sortIndicator(\'result\')}',
    'data-testid={`result-row-${testId}`}',
    '{test ? test.name : testId}',
    "return s === 'SECURE' ? (\n                                <span className=\"badge badge-secure\"><ShieldCheck size={12} /> SECURE</span>\n                              ) : s === 'VULNERABLE' ? (\n                                <span className=\"badge badge-vulnerable\"><ShieldAlert size={12} /> VULNERABLE</span>\n                              ) : s === 'EMPTY' ? (\n                                <span className=\"badge badge-secondary\"><Info size={12} /> EMPTY</span>\n                              ) : s === 'INCONCLUSIVE' ? (\n                                <span className=\"badge badge-warning\"><HelpCircle size={12} /> INCONCLUSIVE</span>\n                              ) : ("
  ]);
  ordered(comp, 'component.groupings', [
    "groupHeader('Failed Attack Payloads', failedRows.length, showFailedGroup, '239, 68, 68', () => setShowFailedGroup(prev => !prev))",
    'No vulnerable results recorded.',
    "groupHeader('Inconclusive (errors / empty)', inconclusiveRows.length, showInconclusiveGroup, '245, 158, 11', () => setShowInconclusiveGroup(prev => !prev))",
    "groupHeader('Succeeded Attack Payloads', succeededRows.length, showSucceededGroup, '34, 197, 94', () => setShowSucceededGroup(prev => !prev))",
    'No succeeded payloads.'
  ]);
  ordered(comp, 'component.report button', [
    'data-testid="run-report"',
    "title: 'GroundRumble Security Audit Report',",
    "subtitle: 'Auditor Runner — Comparison Run',",
    'meta: [`Targets: ${targets.map(t => modelTargetLabel(t.provider, t.model)).join(\' · \')}`]',
    'disabled={vaultLocked && (vaultPassphraseSet ?? false)}',
    '<Download size={14} style={{ marginRight: \'6px\' }} />',
    'Download Report'
  ]);
  if (!comparisonTable) ordered(comp, 'baseline comparison model summaries', [
    'const modelResults = results.map(effectiveDetails).filter(r => r.targetUid === t.uid);',
    "const score = valid > 0 ? Math.round((secure / valid) * 100) : null;"
  ]);
  ordered(comp, 'component.model summary rendering', [
    'data-testid={`model-summary-${t.uid}`}',
    "{score === null ? '—' : `${score}%`}",
    '{secure} secure</span> · <span style={{ color: \'var(--color-vulnerable)\' }}>{vuln} vulnerable</span>'
  ]);
  if (comparisonTable) assert.match(comp, /from ['"]\.\.\/\.\.\/utils\/comparison-table(?:\.js)?['"];/, 'component imports the T20 model');
  assert.ok(
    comp.includes("const score = valid > 0 ? Math.round((secure / valid) * 100) : null;")
      || comp.includes('summarizeVerdicts(modelResults)')
      || comp.includes('summarizeModelResults(results, t.uid, effectiveDetails)'),
    'model summary is baseline-inline or delegated to an extracted summary utility',
  );
  ordered(comp, 'component.empty state', [
    '{results.length === 0 && !running && (',
    'No results yet. Run a Comparison Audit to see the payload × model matrix here.'
  ]);
});

test('The expanded cell keeps override wiring and the vault-locked inspection notice (T13: now in ComparisonResults.jsx)', () => {
  ordered(comp, 'component.expanded cell', [
    "onClick={() => setExpandedCell(active ? null : { testId, targetUid: t.uid })}",
    '{expandedCell && (() => {',
    'const res = results.find(r => r.testId === expandedCell.testId && r.targetUid === expandedCell.targetUid);',
    'const effStatus = effectiveStatus(res);',
    'data-tour="expanded-result"',
    'onClick={() => setExpandedCell(null)}',
    "onClick={() => handleResultOverride(res, 'SECURE')}",
    "onClick={() => handleResultOverride(res, 'VULNERABLE')}",
    "onClick={() => handleResultOverride(res, 'INCONCLUSIVE')}",
    "onClick={() => handleResultOverride(res, null)} className=\"btn-secondary\" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Clear override</button>",
    'Vault locked — unlock your API keys to inspect prompts, responses, and reasoning.',
    'Model System Settings Context',
    'Attacker Payload Input',
    'Model Response Output',
    'Auditor Evaluation Reasoning:'
  ]);
  // The override buttons read the override map through the shared key template.
  assert.match(comp, /overrides\[resultOverrideKey\(res\)\]\?\.verdict === 'SECURE'/, 'the Secure override button colors off the canonical verdict');
  assert.match(comp, /const \{ overrides, effectiveStatus, effectiveDetails \} = useHistory\(\);/, 'the component consumes the override-aware selectors from HistoryContext (single definition site, T01)');
});

// ---------------------------------------------------------------------------
// Vault redirect + definition-ownership guards
// ---------------------------------------------------------------------------

test('The vault-locked redirect away from the runner tab stays enforced App-side; the view never redirects', () => {
  ordered(app, 'vault redirect effect', [
    "if (!vaultLoading && vaultLocked && (vaultPassphraseSet ?? false) && !unlockPromptOpen && (activeTab === 'runner' || activeTab === 'prompts' || activeTab === 'settings')) {",
    "setActiveTab('dashboard');"
  ]);
  assert.doesNotMatch(view, /\bsetActiveTab\b/, 'the view never switches tabs itself');
});

test('Definition ownership — handlers shared with other regions stay App-defined exactly once', () => {
  // toggleTest/selectAllTests are TestsProvider context actions; each keeps
  // exactly one definition there, App holds none, and the view consumes them
  // from useTests() (its call sites are pinned above).
  assert.equal(countIn(app + '\n' + testsCtx, 'const toggleTest = '), 1, 'toggleTest is defined once across App + TestsContext (TestsContext-side since T03)');
  assert.equal(countIn(testsCtx, 'const toggleTest = '), 1, 'toggleTest is defined in TestsContext.jsx (the single definition site, T03)');
  assert.ok(!view.includes('const toggleTest = '), 'the view does not redefine toggleTest');
  assert.equal(countIn(app + '\n' + testsCtx, 'const selectAllTests = '), 1, 'selectAllTests is defined once across App + TestsContext (TestsContext-side since T03)');
  assert.equal(countIn(testsCtx, 'const selectAllTests = '), 1, 'selectAllTests is defined in TestsContext.jsx (the single definition site, T03)');
  assert.ok(!view.includes('const selectAllTests = '), 'the view does not redefine selectAllTests');
  assert.match(appAudit, /^  const handleResultOverride = async \(r, status\) => \{/m, 'handleResultOverride is defined exactly once — App today; src/hooks/useAuditDetail.js after T06 (the history detail modal calls it too)');
  // The audit-detail modal (and its four override call sites) resolves from
  // either side of the AuditDetailModal extraction — count the call sites
  // across the App + modal pair (union pin; the handler definition itself
  // stays App-owned).
  assert.equal(countIn(app + '\n' + auditModal, 'handleResultOverride(d, '), 4, 'the history detail modal keeps its four override call sites (App-side pre-T02, AuditDetailModal.jsx after)');
  // The selector helpers resolve from either side of the component move —
  // App-local render helpers or components defined exactly once in their own
  // files (the App wiring becomes an inline component mount).
  const judgeComponent = readIfExists('src/components/JudgeModelSelector.jsx');
  const chipComponent = readIfExists('src/components/ActiveModelChip.jsx');
  assert.equal(countIn(app, 'const renderJudgeSelector = (disabled = false) => (') + countIn(judgeComponent, 'export function JudgeModelSelector('), 1, 'the judge selector keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.equal(countIn(app, 'renderJudgeSelector('), 0, 'the runner call site moved into the view (App keeps only the wiring + prop contract)');
  assert.equal(countIn(app, 'const renderActiveModelChip = (label, cfg) => (') + countIn(chipComponent, 'export function ActiveModelChip('), 1, 'the active-model chip keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.match(appAudit, /^  const printRunReport = \(results, \{ title, subtitle, meta \} = \{\}\) => \{/m, 'printRunReport is defined exactly once — App today; src/hooks/useAuditDetail.js after T06 (history + audit-details call sites)');
  assert.match(app, /effectiveStatus,\n    effectiveDetails,\n  \} = useHistory\(\)/, 'App keeps effectiveStatus + effectiveDetails (consumed from HistoryContext; engine hook + history still need them)');
  assert.ok(app.includes('const [selectedProvider, setSelectedProvider] = useState(() => (\n    useDemoMode ? SANDBOX_PROVIDER_ID : \'\'\n  ));'), 'selectedProvider state stays App-side');
  assert.ok(app.includes("const [selectedModel, setSelectedModel] = useState('');"), 'selectedModel state stays App-side');
});

// ---------------------------------------------------------------------------
// Shrink gates + engine-hook continuity
// ---------------------------------------------------------------------------

test('App.jsx loses the runner-config JSX region (shrink gate)', () => {
  const appLines = app.split('\n').length;
  const viewLines = view.split('\n').length;
  const compLines = comp.split('\n').length;
  assert.ok(appLines < 5700, `App.jsx shrank below 5700 lines (baseline 6358); got ${appLines}`);
  assert.ok(viewLines < 600, `RunnerView.jsx shrank below 600 lines (T13 extracted the results region); got ${viewLines}`);
  assert.ok(compLines > 300, `ComparisonResults.jsx carries the moved results region; got ${compLines}`);
  // The moved view state declarations leave App.jsx.
  for (const decl of [
    'const [payloadFilterQ, setPayloadFilterQ]',
    'const [payloadFilterTechnique, setPayloadFilterTechnique]',
    'const [sortKey, setSortKey]',
    'const [sortDir, setSortDir]',
    'const [showFailedGroup, setShowFailedGroup]',
    'const [showInconclusiveGroup, setShowInconclusiveGroup]',
    'const [showSucceededGroup, setShowSucceededGroup]',
    'const consoleScrollRef = useRef(null);'
  ]) {
    assert.ok(!app.includes(decl), `App lost the moved declaration: ${decl}`);
  }
  assert.ok(!app.includes('// Attack Payloads Selection filters (Auditor Runner)'), 'the runner-state comment block left App.jsx');
  assert.ok(!app.includes('consoleScrollRef.current.scrollTop'), 'the console auto-scroll effect left App.jsx');
});

test('The T04 engine-hook wiring stays intact and the view drives it through the wired bindings', () => {
  const auditRunBlock = /const \{([\s\S]*?)\n  \} = useAuditRun\(\{([\s\S]*?)\n  \}\);/.exec(app);
  assert.ok(auditRunBlock, 'App still binds the T04 engine hook');
  assert.ok(/runAudit: runSecurityAudit,\n    stopAudit: stopSecurityAudit,/.test(auditRunBlock[1]), 'runAudit/stopAudit stay aliased to runSecurityAudit/stopSecurityAudit');
  for (const param of ['targets', 'selectedTests', 'evalMode', 'setExpandedCell', 'effectiveStatus', 'effectiveDetails', 'useDemoMode', 'judgeConfig', 'providers']) {
    assert.match(auditRunBlock[2], new RegExp(`\\b${param}\\b`), `the engine hook still receives ${param}`);
  }
  const wire = wiringBlock();
  assert.ok(wire.includes('runSecurityAudit={runSecurityAudit}'), 'the Run button drives the engine hook through the view');
  assert.ok(wire.includes('stopSecurityAudit={stopSecurityAudit}'), 'the Stop button drives the engine hook through the view');
});
