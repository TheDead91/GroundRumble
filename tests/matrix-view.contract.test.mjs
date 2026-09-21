// Contract: the matrix view lives in src/components/views/MatrixView.jsx.
// The `{activeTab === 'matrix' && (…)}` JSX region of src/App.jsx — the
// tactic-column technique grid (data-tour="matrix-grid"), the "No matrix
// loaded yet" empty state, the selected-technique detail pane
// (data-tour="technique-detail") with description / sub-techniques /
// recommended mitigations incl. the local fallbacks / mapped diagnostic
// prompts (add / delete / run with their vault gates) and the last-synced
// version note — renders from src/components/views/MatrixView.jsx consuming
// useTests()/useSettings()/useUI()/useProviders() directly, while App keeps
// the tab conditional, the guided-tour config, and a selection-ref mirror
// reported by the view via onSelectedTechniqueChange.
//
// A union pin counts the vault-gate idiom across the App ∪ AuditDetailModal ∪
// PromptUpdateDialog union (branch-degraded to the App ∪ modal pair while the
// dialog is absent), and the ShieldCheck icon pin resolves across the App ∪
// dialog pair, so the suite is green with or without the extracted pieces.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/tests-view.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/MatrixView.jsx';
const TOUR_PATH = 'src/utils/tour-steps.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '', settingsCtx = '', wizardResults = '', tour = '', auditModal = '', promptUpdateDialog = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
  settingsCtx = readSource('src/context/SettingsContext.jsx');
  wizardResults = readSource('src/components/modals/AiGenWizardResults.jsx');
  // The TOUR_STEPS array lives in the pure factory module; when absent `tour`
  // stays ''.
  tour = readSource(TOUR_PATH);
  // The audit-detail modal carries two of App's vault gates after its
  // extraction; read tolerantly so `auditModal` stays '' when absent.
  try { auditModal = readSource('src/components/modals/AuditDetailModal.jsx'); } catch { /* absent */ }
  // The prompt-update dialog carries the AI-rewrite button's vault gate after
  // its extraction; read tolerantly so `promptUpdateDialog` stays '' when
  // absent (union counts preserved).
  try { promptUpdateDialog = readSource('src/components/modals/PromptUpdateDialog.jsx'); } catch { /* absent */ }
} catch { /* missing files fail their first assertion */ }

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const pair = app + '\n' + view;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// Tour-config selector strings ('[data-tour="…"]') stay App-side on purpose —
// strip them before checking which data-tour ANCHORS still live in App.
const appNoTourSelectors = app.replace(/\[data-tour="[^"]+"\]/g, '');

// The <MatrixView … /> wiring block inside App.jsx (from the opening tag to
// the first self-closing `/>`), used to prove App wires the selection mirror.
function wiringBlock() {
  const start = app.indexOf('<MatrixView');
  assert.ok(start >= 0, 'App.jsx mounts <MatrixView … />');
  const end = app.indexOf('/>', start);
  assert.ok(end > start, 'the <MatrixView mount is self-closed');
  return app.slice(start, end + 2);
}

// Extracts a component-level declaration block (2-space indent): from its
// declaration line to the block-closing line (`  };`, `  });`, `  );` or a
// dependency-array close), so trailing comments are excluded.
function regionOf(source, name, decl = null) {
  const re = decl ? new RegExp(decl, 'm') : new RegExp(`^  const ${name} = `, 'm');
  const m = re.exec(source);
  assert.ok(m, `declaration of ${name} not found at the component-body indent`);
  const lines = source.slice(m.index).split('\n');
  const buf = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    buf.push(lines[i]);
    if (/^  \}(;|\)|,)/.test(lines[i]) || lines[i] === '  );') return buf.join('\n');
  }
  assert.fail(`block ${name} has no closing line`);
}
const bodyOf = (source, name) => norm(regionOf(source, name));

// TOUR_STEPS is an array literal closing with a 2-space `  ];` — extract by bracket.
function tourStepsBlock(source) {
  const marker = '  const TOUR_STEPS = [';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, 'TOUR_STEPS array found at the 2-space component-body indent');
  const end = source.indexOf('\n  ];', start);
  assert.ok(end > start, 'TOUR_STEPS array closes with a 2-space `  ];`');
  return source.slice(start, end + 5);
}

// The tour step definitions resolve from either App or the pure factory module
// src/utils/tour-steps.js (buildTourSteps(deps)) so the tour pins hold on
// either side of the extraction boundary (union pins).
function tourStepsSource() {
  if (app.includes('  const TOUR_STEPS = [')) return tourStepsBlock(app);
  assert.ok(tour, 'tour steps live App-side (pre-T10) or in src/utils/tour-steps.js (post-T10)');
  return tour;
}

const tourIsModularized = () => !app.includes('  const TOUR_STEPS = [');

// ---------------------------------------------------------------------------
// The view is real, mounted, context-consuming; the region left App.jsx
// ---------------------------------------------------------------------------

test('MatrixView.jsx is the real view — named + default export, real surface, broken stub gone', () => {
  assert.match(view, /export function MatrixView\(/, 'MatrixView is exported (the parameterless stub export is replaced)');
  assert.match(view, /export default MatrixView;/, 'the default export stays for direct App composition');
  for (const marker of [
    'data-tour="matrix-grid"',
    'data-tour="technique-detail"',
    'className={`technique-card ${isSelected ? \'active\' : \'\'}`}',
    'title="Mapped Test Prompt available"',
    'No matrix loaded yet',
    'Recommended Mitigations',
    'Mapped Diagnostic Prompts',
    '<Plus size={12} /> Add Prompt',
    'Click any technique in the matrix above to view descriptions, mitigations, and run associated prompts.'
  ]) {
    assert.ok(view.includes(marker), `the view renders ${marker}`);
  }
  // The stub (and its parse errors) is gone.
  assert.ok(!view.includes('MatrixView - ATLAS Matrix tab view'), 'the stub placeholder comment is gone');
  assert.ok(!view.includes("fontWeight: 600', background: 'rgba(34, 197, 94, 0.15)'"), 'stub line 170 malformed style string is gone');
  assert.ok(!view.includes("fontWeight: 600', background: 'rgba(239, 68, 68, 0.15)'"), 'stub line 174 malformed style string is gone');
  assert.ok(!view.includes("fontWeight: 700' }"), 'stub line 200 malformed style string is gone');
  assert.doesNotMatch(view, /if \(activeTab !== 'matrix'\) return null;/, 'the stub\u2019s activeTab early-return is gone — App\u2019s conditional governs mounting');
  assert.ok(!view.includes('Search techniques...') && !view.includes('<table'), 'the stub\u2019s search/table surface is gone — the real view is the tactic-column grid');
  // The real view is the tactic-column layout, not a table.
  assert.ok(view.includes("<div style={{ display: 'flex', gap: '20px', minWidth: '1200px' }}>"), 'tactic columns render in a flex row (minWidth 1200px)');
  assert.ok(lineCount(view) > 240, `the view carries the moved region (baseline stub was 226 lines); got ${lineCount(view)}`);
});

test('App mounts <MatrixView and the matrix markers leave App.jsx', () => {
  const wire = wiringBlock();
  assert.ok(wire.includes('onSelectedTechniqueChange'), 'App wires onSelectedTechniqueChange into the view');
  assert.ok(app.includes("import MatrixView from './components/views/MatrixView';"), 'App imports the view');
  for (const marker of [
    'data-tour="matrix-grid"',
    'data-tour="technique-detail"',
    'className={`technique-card ${isSelected ? \'active\' : \'\'}`}',
    'No matrix loaded yet',
    'getMappedTestsForTechnique',
    'const [selectedTechnique, setSelectedTechnique] = useState(null);'
  ]) {
    assert.ok(!appNoTourSelectors.includes(marker), `region marker left App.jsx: ${marker}`);
  }
  // 'Mapped Diagnostic Prompts' / 'Recommended Mitigations' appear exactly
  // once — in the guided tour's step copy (App or src/utils/tour-steps.js),
  // not as rendered JSX.
  const stepsRaw = tourStepsSource();
  const appMinusSteps = tourIsModularized() ? app : app.replace(stepsRaw, '');
  for (const copy of ['Mapped Diagnostic Prompts', 'Recommended Mitigations']) {
    assert.ok(stepsRaw.includes(`"${copy}"`), `${copy} survives inside the tour step copy`);
    assert.equal(countIn(appMinusSteps, copy), 0, `${copy} is a tour-body mention only — no region leftover outside the tour steps`);
    assert.ok(view.includes(copy), `the view renders ${copy}`);
  }
  // App keeps the tab shell: the matrix conditional governs mounting; the
  // neighbouring regions are untouched.
  assert.ok(app.includes("{activeTab === 'matrix' && ("), 'the matrix conditional stays in App');
  assert.ok(app.includes("{activeTab === 'dashboard' && ("), 'the dashboard region stays');
  assert.ok(app.includes("{activeTab === 'tests' && ("), 'the tests region stays');
});

test('The view consumes useTests(), useSettings(), useUI() and useProviders() directly', () => {
  assert.match(view, /useTests\(\)/, 'the view calls useTests() itself');
  assert.match(view, /useSettings\(\)/, 'the view calls useSettings() itself');
  assert.match(view, /useUI\(\)/, 'the view calls useUI() itself');
  assert.match(view, /useProviders\(\)/, 'the view calls useProviders() itself');
  const viewTests = /const \{([\s\S]*?)\} = useTests\(\);/.exec(view);
  assert.ok(viewTests, 'the view destructures useTests()');
  for (const name of ['allTests', 'setSelectedTests', 'setEditingTestId', 'setCustomForm', 'setShowAddCustom', 'deleteTest']) {
    assert.match(viewTests[1], new RegExp(`\\b${name}\\b`), `the view consumes TestsContext\u2019s ${name}`);
  }
  const viewSettings = /const \{([\s\S]*?)\} = useSettings\(\);/.exec(view);
  assert.ok(viewSettings, 'the view destructures useSettings()');
  for (const name of ['atlasMatrix', 'atlasSyncStatus']) {
    assert.match(viewSettings[1], new RegExp(`\\b${name}\\b`), `the view consumes SettingsContext\u2019s ${name}`);
  }
  const viewUI = /const \{([\s\S]*?)\} = useUI\(\);/.exec(view);
  assert.ok(viewUI, 'the view destructures useUI()');
  assert.match(viewUI[1], /\bsetActiveTab\b/, 'the view consumes UIContext\u2019s setActiveTab (the Run button\u2019s jump)');
  const viewProviders = /const \{([\s\S]*?)\} = useProviders\(\);/.exec(view);
  assert.ok(viewProviders, 'the view destructures useProviders()');
  for (const name of ['vaultLocked', 'vaultPassphraseSet']) {
    assert.match(viewProviders[1], new RegExp(`\\b${name}\\b`), `the view consumes ProvidersContext\u2019s ${name}`);
  }
  assert.doesNotMatch(view, /import .*App/, 'the view never imports App — everything arrives via contexts and props');
});

test('Definition ownership — selection state + mapper are view-local, exactly once across the pair', () => {
  assert.equal(countIn(view, 'const [selectedTechnique, setSelectedTechnique] = useState(null);'), 1, 'selectedTechnique state lives in the view');
  assert.equal(countIn(app, 'const [selectedTechnique, setSelectedTechnique] = useState(null);'), 0, 'App\u2019s parallel selection state is deleted');
  assert.equal(countIn(pair, 'const getMappedTestsForTechnique = '), 1, 'the mapper keeps exactly one definition across App + view');
  assert.equal(countIn(app, 'const getMappedTestsForTechnique = '), 0, 'the mapper definition left App.jsx');
  const mapper = bodyOf(view, 'getMappedTestsForTechnique');
  assert.ok(mapper.includes('return allTests.filter(t => t.techniqueId === techId);'), 'the mapper filters the shared enabled allTests (unchanged semantics)');
  assert.ok(countIn(view, 'getMappedTestsForTechnique(') >= 3, 'the view consumes the mapper repeatedly (grid cards + detail listing + empty check)');
  // App still pulls atlasMatrix from SettingsContext (the sync trio stays
  // App-side; the validTechniqueIds allow-list is hook-derived, not an
  // App-bound alias).
  const appSettings = /const \{([\s\S]*?)\n  \} = useSettings\(\);/.exec(app);
  assert.ok(appSettings, 'App still destructures useSettings()');
  assert.match(appSettings[1], /\batlasMatrix\b/, 'App keeps its atlasMatrix binding (the sync seam + validTechniqueIds stay App-side)');
  assert.doesNotMatch(appSettings[1], /\batlasSyncStatus\b/, 'App drops atlasSyncStatus — its last App consumer (the matrix note) moved; the view and the T15 sync card consume it from context now');
  // The guard is atlasMatrix-only: it stays bound App-side in exactly its two
  // slots (the useSettings destructure + the useAIGen deps bag).
  assert.equal([...app.matchAll(/\batlasMatrix\b/g)].length, 2, 'App keeps its atlasMatrix binding exactly in its two slots (useSettings destructure + useAIGeneration deps bag) — the adopted t16 binding survives (T07 re-aim)');
});

// ---------------------------------------------------------------------------
// Mapped prompts pane, mitigations, vault gates — identical behavior
// ---------------------------------------------------------------------------

test('The mapped-prompts pane add/delete/run flows moved into the view intact', () => {
  assert.ok(view.includes('<AlertTriangle size={14} /> Mapped Diagnostic Prompts'), 'pane header moved');
  assert.ok(view.includes('setEditingTestId(null);'), 'add flow clears the edit target');
  assert.ok(view.includes('setCustomForm(prev => ({ '), 'add flow merges into the existing custom form');
  assert.ok(view.includes('techniqueId: selectedTechnique.id, '), 'add flow stamps the technique id');
  assert.ok(view.includes('techniqueName: selectedTechnique.name '), 'add flow stamps the technique name');
  assert.ok(view.includes('setShowAddCustom(true);'), 'add flow opens the add-custom dialog');
  assert.ok(view.includes("{test.id.startsWith('custom_') && ("), 'delete renders only for custom tests');
  assert.ok(view.includes('onClick={() => deleteTest(test.id)} '), 'delete wires deleteTest from TestsContext');
  assert.ok(view.includes('setSelectedTests([test.id]);'), 'run selects exactly this test');
  assert.ok(view.includes("setActiveTab('runner');"), 'run navigates to the runner via UIContext');
  assert.ok(norm(view).includes('> Run </button>'), 'run button label');
  const gates = countIn(view, 'disabled={vaultLocked && (vaultPassphraseSet ?? false)}');
  assert.equal(gates, 3, `add/delete/run buttons gate on the locked vault (found ${gates} gates)`);
  // The gate idiom is shared across App's other regions: three gates remain
  // after the Providers card's three edit/delete/add gates and the AI-Prompts
  // view's two gates (Reset-to-default + Update-with-AI) moved out; the
  // audit-detail modal carries two (report download + record delete) and the
  // prompt-update dialog carries "Update with AI". Count the idiom across the
  // App ∪ AuditDetailModal ∪ PromptUpdateDialog union so the moves neither
  // duplicate nor drop any gate on either side.
  if (promptUpdateDialog) {
    assert.equal(countIn(app + '\n' + auditModal + '\n' + promptUpdateDialog, 'disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 3, 'App\u2019s other regions keep their 3 vault gates across the App ∪ AuditDetailModal ∪ PromptUpdateDialog union (App + AuditDetailModal pre-T01, three-way union after)');
  } else {
    assert.equal(countIn(app + '\n' + auditModal, 'disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 3, 'App\u2019s other regions keep their 3 vault gates (App-side pre-T02, App + AuditDetailModal union after)');
  }
  assert.ok(view.includes('getMappedTestsForTechnique(selectedTechnique.id).map(test => ('), 'listing maps the shared allTests through the mapper');
  assert.ok(view.includes('{test.name}') && view.includes('{test.origin}'), 'listing shows test name + origin');
  assert.ok(view.includes('No test prompts mapped to this technique. Click "Add Prompt" above to create one.'), 'empty mapped-list copy');
});

test('Mitigation list keeps the synced branch and the local fallbacks', () => {
  assert.ok(view.includes('selectedTechnique.mitigations && selectedTechnique.mitigations.length > 0 ? ('), 'synced mitigations branch');
  assert.ok(view.includes('<strong>{mit.id} - {mit.name}</strong>: {mit.description}'), 'synced mitigation item copy');
  assert.ok(view.includes("selectedTechnique.id === 'AML.T0034' && ("), 'fallback branch for AML.T0034');
  assert.ok(view.includes('Use pre-evaluation guardrails (Llama Guard, NeMo Guardrails) to audit incoming prompts.'), 'AML.T0034 fallback 1');
  assert.ok(view.includes('Separate developer instructions from user content using structured roles.'), 'AML.T0034 fallback 2');
  assert.ok(view.includes('Apply strict XML/JSON delimiters around user variables inside the system layout.'), 'AML.T0034 fallback 3');
  assert.ok(view.includes("selectedTechnique.id === 'AML.T0015' && ("), 'fallback branch for AML.T0015');
  assert.ok(view.includes('Adversarial alignment during training via RLHF (Reinforcement Learning from Human Feedback).'), 'AML.T0015 fallback 1');
  assert.ok(view.includes('Deploy low-latency classifier checks to identify malicious jailbreak payloads.'), 'AML.T0015 fallback 2');
  assert.ok(view.includes('Enforce strict token-length boundaries to limit nesting instruction vectors.'), 'AML.T0015 fallback 3');
  assert.ok(view.includes("!['AML.T0034', 'AML.T0015'].includes(selectedTechnique.id) && ("), 'generic fallback branch');
  assert.ok(view.includes('Standard system prompt filtering, output classification boundaries, and administrative authorization gates.'), 'generic fallback copy');
  // Detail-pane identity copy renders unchanged.
  assert.ok(view.includes('<span className="badge badge-primary" style={{ marginBottom: \'6px\' }}>{selectedTechnique.id}</span>'), 'detail pane badges the technique id');
  assert.ok(view.includes('<h3 style={{ fontSize: \'1.25rem\', fontWeight: 800 }}>{selectedTechnique.name}</h3>'), 'detail pane titles the technique name');
  assert.ok(view.includes('onClick={() => setSelectedTechnique(null)} className="btn-secondary"'), 'detail pane close button');
  assert.ok(view.includes('selectedTechnique.subtechniques && selectedTechnique.subtechniques.length > 0 && ('), 'sub-techniques block gated on presence');
  assert.ok(view.includes('title={sub.description}') && view.includes('{sub.id}: {sub.name}'), 'sub-technique badge copy + tooltip');
});

test('Sync status reflects SettingsContext in the last-synced note', () => {
  assert.ok(view.includes('{/* Last-synced version note */}'), 'the note block moved');
  assert.ok(view.includes("style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '-12px' }}"), 'note styling');
  assert.equal(countIn(view, '{atlasSyncStatus}'), 1, 'the status renders exactly once in the view');
  // SettingsContext still owns the status string + the cached-matrix persistence.
  assert.ok(settingsCtx.includes("localStorage.setItem('atlas_cached_matrix', JSON.stringify(matrix));"), 'SettingsContext persists the synced matrix');
  assert.ok(settingsCtx.includes("setAtlasSyncStatus(`Last synced ${new Date().toLocaleString()} · version ${version || 'unknown'}`);"), 'SettingsContext owns the "Last synced …" status copy');
});

// ---------------------------------------------------------------------------
// The guided tour keeps targeting the moved anchors
// ---------------------------------------------------------------------------

test('The tour\u2019s matrix steps keep targeting the moved anchors and wait through the selection mirror', () => {
  const stepsSource = tourStepsSource();
  assert.ok(stepsSource.includes("'[data-tour=\"nav-matrix\"]'"), 'tour still targets the matrix nav item');
  assert.ok(stepsSource.includes("'[data-tour=\"matrix-grid\"]'"), 'tour still targets the moved grid');
  assert.ok(stepsSource.includes("'[data-tour=\"technique-detail\"]'"), 'tour still targets the moved detail pane');
  const steps = norm(stepsSource);
  assert.ok(steps.includes("target: '[data-tour=\"matrix-grid\"]',"), 'the matrix-grid step stays in the tour steps');
  assert.ok(steps.includes('onEnter: () => setActiveTab(\'matrix\'),'), 'the step still switches to the matrix tab');
  // The waitFor reads the App-side ref the view reports into instead of App
  // state (otherwise Tour.jsx's try/catch would swallow the ReferenceError and
  // the step would never auto-advance).
  assert.ok(steps.includes('waitFor: () => !!selectedTechniqueRef.current,'), 'the step waits through selectedTechniqueRef');
  assert.ok(steps.includes('autoAdvance: true,'), 'the step still auto-advances');
  assert.ok(app.includes('const selectedTechniqueRef = useRef(null);'), 'App declares the selection mirror ref');
  assert.equal(countIn(app, 'const selectedTechniqueRef = useRef(null);'), 1, 'the mirror ref is declared exactly once');
  if (tourIsModularized()) {
    // When the array lives in the pure factory module, App adopts through the
    // deps object and the selection mirror ref stays App-owned.
    assert.ok(tour.length > 0, 'src/utils/tour-steps.js owns the tour step definitions');
    assert.match(app, /import\s*\{[^}]*buildTourSteps[^}]*\}\s*from\s*'\.\/utils\/tour-steps(\.js)?';/, 'App imports buildTourSteps from the factory module');
    const callStart = app.indexOf('buildTourSteps(');
    assert.ok(callStart >= 0, 'App adopts the buildTourSteps factory');
    const call = app.slice(callStart, app.indexOf('});', callStart) + 3);
    for (const dep of ['setActiveTab', 'selectedTechniqueRef', 'targets', 'presets', 'DEFAULT_PRESET_ID', 'allTests', 'selectedTests', 'running', 'results', 'expandedCell', 'useDemoMode']) {
      assert.ok(call.includes(dep), `App passes ${dep} into buildTourSteps`);
    }
  }
  assert.ok(wiringBlockSafe(app).includes('onSelectedTechniqueChange='), 'the view reports selection changes through the wired callback');
  assert.match(view, /onSelectedTechniqueChange\?\.\(/, 'the view calls the wired callback (optional-chained)');
  assert.match(view, /useEffect\(\(\) => \{/, 'the view reports via an effect on selection changes');
});

// wiringBlock without assert noise for reuse inside other tests
function wiringBlockSafe(source) {
  const start = source.indexOf('<MatrixView');
  if (start < 0) return '';
  const end = source.indexOf('/>', start);
  return end > start ? source.slice(start, end + 2) : '';
}

// ---------------------------------------------------------------------------
// App.jsx loses the region; the broken-stub hazards are resolved
// ---------------------------------------------------------------------------

test('App.jsx loses the matrix JSX region (shrink gate)', () => {
  const appLines = lineCount(app);
  const viewLines = lineCount(view);
  assert.ok(appLines < 4800, `App.jsx must shed the moved region (baseline 4919; simulated port landed 4698); got ${appLines}`);
  assert.ok(viewLines > 240, `the view must carry the moved region (simulated port landed 277); got ${viewLines}`);
});

test('App-side deleteTest binding count and the stale App-local helpers are resolved', () => {
  // Count the deleteTest binding across App + MatrixView: exactly one binding
  // across the pair, none in App alone.
  assert.equal(countIn(app, 'onClick={() => deleteTest(test.id)}'), 0, 'App keeps no matrix delete binding');
  assert.equal(countIn(pair, 'onClick={() => deleteTest(test.id)}'), 1, 'exactly one matrix delete binding across the pair (view-side)');
  assert.ok(!app.includes('// Mapping test payloads directly to selected technique in the matrix'), 'the mapper\u2019s App-side comment left with the body');
  // App imports no icons for the moved region; the five icons stay used
  // elsewhere in App, so this pins the import balance.
  for (const icon of ['Info', 'X', 'AlertTriangle', 'Plus']) {
    assert.ok(new RegExp(`\\b${icon}\\b`).exec(app), `App still uses ${icon} elsewhere (no import churn)`);
  }
  // The ShieldCheck placeholder-note icon (in the prompt-update dialog)
  // survives across the App ∪ PromptUpdateDialog pair, the same union
  // precedent as Layers below.
  assert.ok(new RegExp('\\bShieldCheck\\b').exec(app + '\n' + promptUpdateDialog), 'ShieldCheck survives across the App + prompt-update-dialog pair (dialog-side since T01)');
  // Layers' last App use (the profiles-pane card icon) renders from
  // AiGenWizardResults.jsx — the icon survives across the App + results pair.
  assert.ok(new RegExp('\\bLayers\\b').exec(app + '\n' + wizardResults), 'Layers survives across the App + wizard-results pair (results-side since T18)');
});
