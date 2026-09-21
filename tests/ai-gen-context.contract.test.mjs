// Acceptance contract for AIGenContext adoption: the mirrored AI-wizard state
// block is deleted from App.jsx and every consumer resolves it from the
// context.
//
// The consolidated AI pipeline states (aiPreview, aiPreviewSelected,
// recentlyGeneratedIds — incl. the atlas_recent_ai_tests readStoredArray
// hydration) are folded into the same adoption gates: declared exactly once in
// AIGenContext, zero mirrored useState in App, destructured by every consumer.
//
// The openAiWizard action, the run-context clear split (one App-side, one
// hook-side in cancelAiGeneration), the Key-Vault lock arm source reset, and
// the add-source dialog JSX each resolve across their owning file union, so
// every pin holds whether the code is App-local or extracted.
//
// Node cannot import the JSX modules, so — exactly like
// tests/provider-policy.contract.test.mjs — every assertion here works at
// source-text level against:
//
//   src/App.jsx                 (the module the adoption empties)
//   src/context/AIGenContext.jsx (the surviving single source of truth)
//   src/main.jsx                (the provider-mount site)
//
// Acceptance mapping:
//   Adoption -> cluster deleted from App.jsx, App consumes useAIGen()
//   Semantics -> every mirrored name resolves from context with identical
//         semantics (lazy localStorage initializers byte-pinned), collapse
//         states persist
//   Single source -> zero aiGen* useState declarations remain in App.jsx;
//         single source of truth tree-wide; wizard/expand/count usage sites
//         survive verbatim
//   Gates -> exercised by the lint/build/test gates
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const CTX_PATH = 'src/context/AIGenContext.jsx';
const MAIN_PATH = 'src/main.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';

const STATES = [
  'aiGenSourceKeys', 'aiGenUrls', 'aiGenUrlInput', 'aiGenTitleInput', 'aiGenDescInput',
  'aiSourceDraft', 'aiSourceAssessing', 'aiSourceAssessment', 'aiGenCount', 'aiGenCountInput',
  'aiGenCollapsed', 'testsCollapsed', 'aiGenerating', 'aiGenStage', 'aiGenStageDetail',
  'aiGenProgress', 'aiGenMode', 'aiPasteInput', 'aiPasteTitle', 'aiSourceProfiles',
  'expandedSourceIds', 'aiAddSourceOpen', 'aiAddSourceKind', 'aiAddStep', 'aiAddError',
  'aiAddBusy', 'aiGeneratedCount', 'aiWizardOpen', 'aiWizardStep', 'aiFineTune',
  'aiRefining', 'aiWizardError', 'aiUsedGuidance', 'aiUsedFineTune', 'aiDraft',
  'aiProfileEdits', 'aiProfileExpanded', 'aiGenBatch', 'aiGenBudget', 'aiAdvancedMode',
  'aiGenElapsed',
  // The AI pipeline states belong to the context.
  'aiPreview', 'aiPreviewSelected', 'recentlyGeneratedIds'
];
const HANDLERS = [
  'commitAiGenCount', 'updateAiGenCountInput', 'toggleSourceExpanded',
  'openAddSourceDialog', 'closeAddSourceDialog'
];
const REF_NAME = 'aiRunCtxRef';
const setterOf = (n) => `set${n[0].toUpperCase()}${n.slice(1)}`;

// Every identifier App consumes for this cluster (40 setters:
// expandedSourceIds has none in the context, its toggle is the exposed API).
const DESTRUCTURE_NAMES = [
  ...STATES,
  ...STATES.filter((n) => n !== 'expandedSourceIds').map(setterOf),
  ...HANDLERS,
  REF_NAME
];
// App's useAIGen destructure need not carry underscore-aliased mirror entries
// (no consumer reads them) and keeps the consumed names. The surviving set
// resolves whether or not those aliases are present, so the pin below holds
// either way — the exact-set gate lives in
// tests/results-summary.contract.test.mjs.
const SURVIVING_DESTRUCTURE = [
  'aiGenUrls', 'setAiGenUrls', 'aiAddSourceOpen', 'setAiGeneratedCount',
  'aiWizardOpen', 'aiPreview', 'setAiPreview', 'aiPreviewSelected',
  'setAiPreviewSelected', 'recentlyGeneratedIds', 'setRecentlyGeneratedIds',
  REF_NAME
];

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(...listSourceFiles(join(dir, entry.name)));
    else files.push(join(dir, entry.name));
  }
  return files;
}

function scanSkip(source, i) {
  const ch = source[i];
  if (ch === "'" || ch === '"' || ch === '`') {
    for (let j = i + 1; j < source.length; j++) {
      if (source[j] === '\\') { j++; continue; }
      if (source[j] === ch) return j;
    }
  }
  if (ch === '/' && source[i + 1] === '/') {
    const nl = source.indexOf('\n', i);
    return nl === -1 ? source.length - 1 : nl;
  }
  if (ch === '/' && source[i + 1] === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length - 1 : end + 1;
  }
  return null;
}

// Full `const NAME = ...;` / `const [NAME, SETTER] = ...;` statement text.
function extractStatement(source, name) {
  const decl = new RegExp(`const (?:\\[${name},\\s|${name}\\b)`);
  const m = decl.exec(source);
  assert.ok(m, `declaration of ${name} not found`);
  let depth = 0;
  for (let i = m.index + 'const '.length; i < source.length; i++) {
    const skip = scanSkip(source, i);
    if (skip !== null) { i = skip; continue; }
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return source.slice(m.index, i + 1);
  }
  assert.fail(`statement for ${name} never terminates`);
}

const initOf = (source, name) => {
  const stmt = extractStatement(source, name);
  return stmt.slice(stmt.indexOf('=') + 1).replace(/;\s*$/, '');
};
const norm = (text) => text.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// The mirrored cluster is absent from App.jsx
// ---------------------------------------------------------------------------

test('A3: App.jsx holds zero mirrored useState declarations (the roadmap grep gate)', () => {
  const app = sourceOf(APP_PATH);
  for (const name of STATES) {
    assert.doesNotMatch(
      app,
      new RegExp(`const \\[${name},\\s`),
      `App.jsx must no longer declare state ${name}`
    );
  }
});

test('A1: App.jsx holds zero local handler definitions and the aiRunCtxRef', () => {
  const app = sourceOf(APP_PATH);
  for (const name of HANDLERS) {
    assert.doesNotMatch(app, new RegExp(`const ${name}\\b`), `App.jsx must not define ${name} locally anymore`);
  }
  assert.doesNotMatch(app, new RegExp(`const ${REF_NAME}\\b`), `${REF_NAME} must come from context`);
});

test('A3: tree-wide single source of truth — every mirrored state/handler/ref is declared exactly once across src/, in AIGenContext.jsx', () => {
  const sites = new Map();
  for (const absPath of listSourceFiles(join(root, 'src'))) {
    const relPath = absPath.slice(root.length + 1);
    const source = sourceOf(relPath);
    for (const name of [...STATES, ...HANDLERS, REF_NAME]) {
      const count = source.match(new RegExp(`const (?:\\[${name},\\s|${name}\\b)`))?.length ?? 0;
      if (count > 0) {
        if (!sites.has(name)) sites.set(name, []);
        sites.get(name).push(`${relPath} (${count}x)`);
      }
    }
  }
  for (const name of [...STATES, ...HANDLERS, REF_NAME]) {
    assert.deepEqual(
      sites.get(name),
      [`${CTX_PATH} (1x)`],
      `${name} must be declared exactly once, in ${CTX_PATH}`
    );
  }
});

test('A1: App consumes useAIGen() exactly once, via the canonical import and a full destructure', () => {
  const app = sourceOf(APP_PATH);
  assert.match(app, /import \{ useAIGen \} from '\.\/context\/useAIGen';/, 'canonical hook import present');
  assert.equal(app.match(/useAIGen\(\)/g)?.length, 1, 'exactly one useAIGen() call');
  const block = /const \{([^}]*)\}\s*=\s*useAIGen\(\)/.exec(app);
  assert.ok(block, 'App destructures the hook result with unchanged identifier names');
  // The destructure-pin list is the surviving binding set (every surviving
  // name resolves, zero mirrored useState, single useAIGen() call);
  // values/context pins below keep the full DESTRUCTURE_NAMES so the context
  // surface is never weakened.
  for (const name of SURVIVING_DESTRUCTURE) {
    assert.match(block[1], new RegExp(`\\b${name}\\b`), `destructure binds ${name} from context`);
  }
  assert.doesNotMatch(block[1], /\bsetExpandedSourceIds\b/, 'setExpandedSourceIds is not exposed by the context and must not be destructured');
});

// ---------------------------------------------------------------------------
// Identical semantics in the surviving context module
// (src/context/AIGenContext.jsx)
// ---------------------------------------------------------------------------

test('A2: lazy localStorage initializers survive byte-identical in AIGenContext', () => {
  const ctx = sourceOf(CTX_PATH);
  const pinned = [
    "const [aiGenCollapsed, setAiGenCollapsed] = useState(() => localStorage.getItem('atlas_ai_gen_collapsed') === '1');",
    "const [testsCollapsed, setTestsCollapsed] = useState(() => localStorage.getItem('atlas_tests_collapsed') === '1');",
    "const [aiGenMode, setAiGenMode] = useState(() => localStorage.getItem('atlas_ai_gen_mode') === 'fast' ? 'fast' : 'deep');",
    "const [aiAdvancedMode, setAiAdvancedMode] = useState(() => localStorage.getItem('atlas_ai_gen_advanced') === '1');",
    "const [aiGenSourceKeys, setAiGenSourceKeys] = useState(() => Object.keys(PROMPT_SOURCING_INFO));",
    "const [recentlyGeneratedIds, setRecentlyGeneratedIds] = useState(() => readStoredArray('atlas_recent_ai_tests'));"
  ];
  // The preview states keep their null initializers and the hydration helper
  // is imported extensionlessly (HistoryContext convention).
  assert.ok(ctx.includes('const [aiPreview, setAiPreview] = useState(null);'), 'AIGenContext owns aiPreview with the null initializer');
  assert.ok(ctx.includes('const [aiPreviewSelected, setAiPreviewSelected] = useState(null);'), 'AIGenContext owns aiPreviewSelected with the null initializer');
  assert.match(ctx, /^import \{ readStoredArray \} from '\.\.\/utils\/storage';$/m, 'AIGenContext imports the hydration helper');
  for (const stmt of pinned) {
    assert.ok(ctx.includes(stmt), `AIGenContext must keep: ${stmt}`);
  }
});

test('A2: batch/budget clamping and profile-seeding initializer bodies keep baseline semantics', () => {
  const ctx = sourceOf(CTX_PATH);
  const batch = norm(initOf(ctx, 'aiGenBatch'));
  assert.equal(
    batch,
    norm("useState(() => { const v = parseInt(localStorage.getItem('atlas_ai_gen_batch') || '1', 10); return Number.isFinite(v) && v >= 1 && v <= 5 ? v : 1; })"),
    'aiGenBatch initializer unchanged'
  );
  const budget = norm(initOf(ctx, 'aiGenBudget'));
  assert.equal(
    budget,
    norm("useState(() => { const v = parseInt(localStorage.getItem('atlas_ai_gen_budget') || '4096', 10); return [1024, 2048, 4096, 8192].includes(v) ? v : 4096; })"),
    'aiGenBudget initializer unchanged'
  );
  const profiles = norm(initOf(ctx, 'aiSourceProfiles'));
  assert.match(profiles, /Object\.entries\(PROMPT_SOURCING_INFO\)\.forEach\(\(\[key, info\]\) => \{ if \(info\.profile\) seeded\[key\] = info\.profile; \}\); return seeded;/, 'profile seeding loop unchanged');
});

test('A2: the five handler bodies keep baseline semantics in AIGenContext (clamp 1..20, reset sequences, Set toggle)', () => {
  const ctx = sourceOf(CTX_PATH);
  const pinnedBodies = {
    commitAiGenCount: 'const commitAiGenCount = useCallback((raw) => { const n = Math.min(20, Math.max(1, Number(raw) || 1)); setAiGenCount(n); setAiGenCountInput(String(n)); }, []);',
    updateAiGenCountInput: "const updateAiGenCountInput = useCallback((raw) => { setAiGenCountInput(raw); if (raw !== '' && !Number.isNaN(Number(raw))) setAiGenCount(Math.min(20, Math.max(1, Number(raw) || 1))); }, []);",
    toggleSourceExpanded: 'const toggleSourceExpanded = useCallback((id) => setExpandedSourceIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);'
  };
  for (const [name, expected] of Object.entries(pinnedBodies)) {
    assert.equal(norm(extractStatement(ctx, name)), expected, `${name} body unchanged`);
  }
  for (const name of ['openAddSourceDialog', 'closeAddSourceDialog']) {
    const body = norm(extractStatement(ctx, name));
    for (const reset of ["setAiAddStep('input');", "setAiGenUrlInput('');", "setAiGenTitleInput('');", "setAiGenDescInput('');", "setAiPasteInput('');", "setAiPasteTitle('');", 'setAiSourceDraft(null);', 'setAiSourceAssessment(null);', 'setAiSourceAssessing(false);', 'setAiAddBusy(false);']) {
      assert.ok(body.includes(reset), `${name} keeps reset ${reset}`);
    }
  }
  assert.match(norm(extractStatement(ctx, 'openAddSourceDialog')), /setAiAddSourceKind\('url'\);/, 'open keeps the kind reset');
  assert.match(norm(extractStatement(ctx, 'openAddSourceDialog')), /setAiAddSourceOpen\(true\);/, 'open keeps opening');
  assert.match(norm(extractStatement(ctx, 'closeAddSourceDialog')), /setAiAddSourceOpen\(false\);/, 'close keeps closing');
});

test('A2: context value still exposes the full mirrored surface', () => {
  const ctx = sourceOf(CTX_PATH);
  const valueMatch = /const value = \{([\s\S]*?)\};\n\n  return \(/.exec(ctx);
  assert.ok(valueMatch, 'context value object found');
  for (const name of DESTRUCTURE_NAMES) {
    assert.match(valueMatch[1], new RegExp(`\\b${name}\\b`), `context value exposes ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Behavior-bearing usage sites survive verbatim
// ---------------------------------------------------------------------------

test('A2: collapse-state persistence wiring survives in the tests view (toggle writes what the context initializer reads)', () => {
  // The tests-view JSX (both collapse toggles with it) lives in
  // src/components/views/TestsView.jsx; the toggle bodies survive verbatim there.
  const view = sourceOf('src/components/views/TestsView.jsx');
  assert.match(view, /setAiGenCollapsed\(prev => \{\n\s*const next = !prev;\n\s*localStorage\.setItem\('atlas_ai_gen_collapsed', next \? '1' : '0'\);\n\s*return next;\n\s*\}\);/, 'AI-generation card toggle still persists atlas_ai_gen_collapsed');
  assert.match(view, /setTestsCollapsed\(prev => \{\n\s*const next = !prev;\n\s*localStorage\.setItem\('atlas_tests_collapsed', next \? '1' : '0'\);\n\s*return next;\n\s*\}\);/, 'tests table toggle still persists atlas_tests_collapsed');
});

test('A3: count inputs still behave identically (live clamp on change, clamp+mirror on blur/Enter)', () => {
  // The wizard config step (with the How-many-tests input) lives in
  // src/components/modals/AiGenWizardModal.jsx; the wiring is byte-identical
  // and the multi-line pin is a whitespace-tolerant regex evaluated modal-side.
  const modal = sourceOf('src/components/modals/AiGenWizardModal.jsx');
  assert.match(modal, /onChange=\{\(e\) => updateAiGenCountInput\(e\.target\.value\)\}\s*onBlur=\{\(\) => commitAiGenCount\(aiGenCountInput\)\}\s*onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); commitAiGenCount\(aiGenCountInput\); \} \}\}/, 'the How-many-tests input wiring survives verbatim (modal-side since T17)');
  assert.ok(modal.includes('<span style={{ fontSize: \'0.8rem\', fontWeight: 600, width: \'120px\', flexShrink: 0 }}>How many tests</span>'), 'the count input label stays');
});

test('A3: sources expand/collapse and the add-source dialog flow behave identically', () => {
  const app = sourceOf(APP_PATH);
  // The tests-view source rows (and their per-row expand toggle) live in
  // TestsView.jsx; the add-source dialog JSX lives in
  // src/components/modals/AddSourceDialog.jsx, so the save+close wiring is
  // counted exactly-once across the App ∪ dialog union (App-side or
  // dialog-side).
  const view = sourceOf('src/components/views/TestsView.jsx');
  const dialogSrc = (() => { try { return sourceOf('src/components/modals/AddSourceDialog.jsx'); } catch { return ''; } })();
  assert.ok(view.includes('onClick={() => toggleSourceExpanded(row.id)}'), 'per-row expand toggle binding survives (in TestsView.jsx since T11)');
  const flowPair = `${app}\n${dialogSrc}`;
  assert.equal(flowPair.split('onClick={() => { saveAiSourceDraft(); closeAddSourceDialog(); }}').length - 1, 1, 'save-source still closes the dialog (exactly once across the App ∪ dialog union)');
});

test('A3: wizard open/close still behave identically (results step resumes a pending run)', () => {
  const app = sourceOf(APP_PATH);
  // openAiWizard lives in useAIGeneration; the body survives verbatim there.
  assert.ok(sourceOf(HOOK_PATH).includes(`const openAiWizard = () => {
    setAiWizardError('');
    setAiWizardStep(aiPreview && aiPreview.tests.length ? 'results' : 'sources');
    setAiWizardOpen(true);
  };`), 'openAiWizard body survives verbatim (hook-side since T05)');
  // The wizard sources step (with its Cancel button) lives in
  // src/components/modals/AiGenWizardModal.jsx; the binding is evaluated
  // across the App + modal pair and still exists exactly once.
  const pair = app + '\n' + sourceOf('src/components/modals/AiGenWizardModal.jsx');
  assert.equal(pair.split('<button onClick={() => setAiWizardOpen(false)} className="btn-secondary">Cancel</button>').length - 1, 1, 'wizard cancel binding survives (modal-side since T17)');
});

test('A2: vault-backed source state keeps its lifecycle (reset on lock, hydrate+persist on add)', () => {
  const app = sourceOf(APP_PATH);
  // The lock arm lives in the useVaultActions hook; the App.jsx + hook union
  // keeps the reset at exactly one definition site.
  const appPlusVaultHook = app + '\n' + sourceOf('src/hooks/useVaultActions.js');
  assert.ok(appPlusVaultHook.includes('setProviders([]);\n    setAiGenUrls([]);'), 'locking the vault still clears sources');
  assert.ok(sourceOf(HOOK_PATH).includes(`const next = [...aiGenUrls, newEntry];
    setAiGenUrls(next);
    persistSourceUrls(next);`), 'adding a source still appends and persists (addSourceEntry lives in useAIGeneration since T08)');
  const pair = app + '\n' + sourceOf(HOOK_PATH);
  assert.equal(pair.match(/aiRunCtxRef\.current = \{ \.\.\.ctx, controller, signal: controller\.signal \};/g)?.length, 1, 'run-context capture site survives (hook-side since T09)');
  assert.equal(pair.match(/const ctx = aiRunCtxRef\.current;/g)?.length, 3, 'the three run-context reads survive (hook-side since T09)');
  // cancelAiGeneration (with one of the two clears) lives in the hook; the
  // lock-path clear lives in the vault-actions hook. Each clear survives
  // exactly once at its own site.
  assert.equal(appPlusVaultHook.match(/aiRunCtxRef\.current = null;/g)?.length, 1, 'the lock-path run-context clear survives (vault-actions hook-side since the residue absorb)');
  assert.equal(sourceOf(HOOK_PATH).match(/aiRunCtxRef\.current = null;/g)?.length, 1, 'the cancel-side run-context clear survives hook-side (T05)');
});

test('seam intact: main.jsx still mounts AIGenProvider around App and App keeps its PROMPT_SOURCING_INFO import', () => {
  const main = sourceOf(MAIN_PATH);
  assert.match(main, /import \{ AIGenProvider \} from '\.\/context\/AIGenContext'/);
  assert.match(main, /<AIGenProvider>\n\s*<SettingsProvider>\n\s*<App \/>\n\s*<\/SettingsProvider>\n\s*<\/AIGenProvider>/);
  const app = sourceOf(APP_PATH);
  // The two unused catalog specifiers (PRESET_TESTS/generateTestsForMatrix,
  // zero live refs) may be shed; the byte-pin accepts either shape while
  // ATLAS_TACTICS stays pinned App-side.
  assert.match(app, /^import \{ ATLAS_TACTICS(?:, PRESET_TESTS, generateTestsForMatrix)? \} from '\.\/data\/payloads';$/m, 'App payload import keeps ATLAS_TACTICS (catalog specifiers shed by the T07 dedupe or present pre-dedupe)');
  assert.ok(sourceOf('src/components/modals/AiGenWizardModal.jsx').includes("import { PROMPT_SOURCING_INFO } from '../../data/payloads';"), 'the wizard modal imports PROMPT_SOURCING_INFO itself (since T17)');
});
