// Contract: the AI Prompts tab view — the four group
// configs (AI Judge / Source Analysis / Test Generation / Test Critique with
// their tour anchors), the per-key textarea draft-or-override editors, the
// Reset-to-default and "Update with AI" buttons with their vaultLocked gates
// and the placeholders footer card — renders from
// src/components/views/PromptsView.jsx as a props-in/events-out component
// (promptDraft, setPromptDraft, setPromptUpdate, getPromptOverrides,
// vaultLocked, vaultPassphraseSet, addToast), while App keeps the promptDraft
// state (shared with the prompt-update dialog), the tab conditional, and the
// prompt-update dialog mount (the dialog JSX itself lives in
// src/components/modals/PromptUpdateDialog.jsx — the shared-dialog pins below
// count over the App ∪ dialog union and hold green in both states).
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/tests-view.contract.test.mjs,
// tests/matrix-view.contract.test.mjs). Hermetic: no dev server, no network,
// no browser, deterministic only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROMPTS, PROMPT_LABELS, PROMPT_DESCRIPTIONS } from '../src/utils/prompts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const VIEW_PATH = 'src/components/views/PromptsView.jsx';
const DIALOG_PATH = 'src/components/modals/PromptUpdateDialog.jsx';
const WORKSPACE_PATH = 'src/components/views/prompts/PromptWorkspace.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', view = '';
try {
  app = readSource(APP_PATH);
  view = readSource(VIEW_PATH);
} catch { /* missing files fail their first assertion */ }
// The prompt-update dialog module may be absent (the JSX App-inline); read
// tolerantly so the shared-dialog union pins below hold green in both states.
let dialog = '';
try { dialog = readSource(DIALOG_PATH); } catch { /* dialog absent */ }
let workspace = '';
try { workspace = readSource(WORKSPACE_PATH); } catch { /* workspace absent */ }
const workspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(workspace);
const appDlg = app + '\n' + dialog;

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;
const body = norm(view);

// The seven prompt keys the view renders, in group order.
const GROUPS = [
  { title: 'AI Judge', tour: 'ai-prompts-judge', icon: 'Cpu', keys: ['judge_system', 'judge_user'] },
  { title: 'Source Analysis', tour: 'ai-prompts-source', icon: 'Database', keys: ['propose_system', 'assess_system', 'analyzer_system'] },
  { title: 'Test Generation', tour: 'ai-prompts-generation', icon: 'Wand2', keys: ['generator_system'] },
  { title: 'Test Critique', tour: 'ai-prompts-critique', icon: 'ShieldCheck', keys: ['critic_system'] },
];
const ALL_KEYS = GROUPS.flatMap(g => g.keys);

// Ordered-substring helper over a normalized region: pins presence AND order.
const ordered = (label, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
};

// ---------------------------------------------------------------------------
// the view is real, props-in/events-out, no context reach, no hooks
// ---------------------------------------------------------------------------

test('PromptsView.jsx is the real view — named + default export, real surface, stub gone', () => {
  assert.match(view, /export function PromptsView\(\{/, 'the view takes the props bag (the parameterless stub export is replaced)');
  assert.match(view, /export default PromptsView;/, 'the default export stays for direct App composition');
  assert.ok(!view.includes('AI Prompts view - Manage and test prompt templates'), 'the stub placeholder copy is gone');
  assert.doesNotMatch(view, /import \{ useUI \} from '\.\.\/\.\.\/context\/UIContext';/, 'the stub\u2019s UIContext import is gone');
  assert.doesNotMatch(view, /if \(activeTab !== 'prompts'\) return null;/, 'the stub\u2019s activeTab early-return is gone — App\u2019s conditional governs mounting');
  for (const marker of ["title: 'AI Judge'", 'prompt-editor', 'Reset to default', 'Update with AI', 'Available placeholders:']) {
    assert.ok(view.includes(marker), `the view renders ${marker}`);
  }
  assert.ok(lineCount(view) > 110, `the view carries the moved region (baseline stub was 27 lines); got ${lineCount(view)}`);
});

test('The props-in contract is exactly the eight roadmap names — no hooks, no context reach, no I/O', () => {
  const sig = /export function PromptsView\(\{([^}]*)\}\)/.exec(view);
  assert.ok(sig, 'the view signature is a destructured props bag');
  const names = sig[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(names, ['promptDraft', 'setPromptDraft', 'setPromptUpdate', 'getPromptOverrides', 'vaultLocked', 'vaultPassphraseSet', 'addToast', 'judgeConfigured'], 'exactly the eight roadmap props, in order');
  assert.doesNotMatch(view, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b/, 'the view declares no hooks — state stays App-side');
  assert.doesNotMatch(view, /useUI\(|useProviders\(|useTests\(|useSettings\(|usePromptUpdate\(|useVaultActions\(|useJudgeMerge\(/, 'the view consumes no contexts or hooks — props only');
  assert.doesNotMatch(view, /\bfetch\(|localStorage/, 'the view does no I/O');
  assert.doesNotMatch(view, /import .*App/, 'the view never imports App');
});

test('The view imports the moved module surface exactly once — prompts utils + the thirteen lucide icons', () => {
  assert.match(view, /import \{ setPrompt, resetPrompt, DEFAULT_PROMPTS, PROMPT_LABELS, PROMPT_DESCRIPTIONS \} from '\.\.\/\.\.\/utils\/prompts';/, 'the utils/prompts import carries the derivation surface');
  assert.equal(countIn(view, "from '../../utils/prompts';"), 1, 'exactly one utils/prompts import');
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(view);
  assert.ok(lucide, 'the view imports its icons from lucide-react');
  const icons = lucide[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(icons, ['Cpu', 'Database', 'Wand2', 'ShieldCheck', 'Scale', 'ScrollText', 'Tag', 'BadgeCheck', 'Brain', 'Hammer', 'Filter', 'RotateCcw', 'Sparkles'], 'exactly the thirteen moved icons');
});

// ---------------------------------------------------------------------------
// the moved region — byte-exact needles, presence AND order
// ---------------------------------------------------------------------------

test('The four group configs moved verbatim, in order, with exact titles/icons/keys/descs', () => {
  const descs = {
    'AI Judge': 'Evaluates whether each target response resisted or fell for an attack.',
    'Source Analysis': 'Ingests research sources: proposes titles, assesses relevance/quality, and builds threat profiles.',
    'Test Generation': 'Drafts grounded attack payloads from the derived threat profiles.',
    'Test Critique': 'Reviews generated tests and drops weak or duplicate ones.',
  };
  ordered('groups', GROUPS.flatMap(g => [`title: '${g.title}'`, `tour: '${g.tour}'`, `icon: ${g.icon},`, `desc: '${descs[g.title]}',`, `keys: [${g.keys.map(k => `'${k}'`).join(', ')}]`]));
});

test('Every data-tour anchor moved — four group cards + the placeholders footer', () => {
  for (const anchor of ['ai-prompts-judge', 'ai-prompts-source', 'ai-prompts-generation', 'ai-prompts-critique']) {
    assert.equal(countIn(view, `tour: '${anchor}'`), 1, `the ${anchor} tour anchor is declared exactly once in the view`);
  }
  assert.equal(countIn(view, 'data-tour={group.tour}'), 1, 'the group cards bind their anchor through data-tour={group.tour}');
  assert.equal(countIn(view, 'data-tour="ai-prompts-placeholders"'), 1, 'the placeholders footer card carries its anchor exactly once');
});

test('The label/icon derivation moved verbatim — titlecase fallback, seven-entry keyIcon map in key order', () => {
  assert.ok(body.includes("const label = (key) => PROMPT_LABELS[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');"), 'the label fn falls back to titlecased key segments');
  const keyIconOrder = [
    'judge_system: Scale,', 'judge_user: ScrollText,', 'propose_system: Tag,', 'assess_system: BadgeCheck,',
    'analyzer_system: Brain,', 'generator_system: Hammer,', 'critic_system: Filter',
  ];
  ordered('keyIcon map', keyIconOrder);
  assert.ok(body.includes('const KeyIcon = keyIcon[key];'), 'each key resolves its icon through the keyIcon map');
  assert.ok(body.includes('const GroupIcon = group.icon;'), 'each group resolves its icon');
});

test('The textarea resolution moved byte-exactly — draft-or-override-or-default, onChange, onBlur persist', () => {
  ordered('textarea', [
    '<textarea',
    'value={promptDraft[key] !== undefined ? promptDraft[key] : getPromptOverrides()[key] ?? def}',
    'onChange={(e) => setPromptDraft(prev => ({ ...prev, [key]: e.target.value }))}',
    'onBlur={() => { setPrompt(key, promptDraft[key] !== undefined ? promptDraft[key] : def); }}',
    'rows="6"',
    'className="prompt-editor"',
  ]);
  assert.equal(countIn(view, 'value={promptDraft[key] !== undefined ? promptDraft[key] : getPromptOverrides()[key] ?? def}'), 1, 'the draft-or-override resolution appears exactly once');
  assert.equal(countIn(view, 'const def = DEFAULT_PROMPTS[key];'), 1, 'the per-key default resolves through DEFAULT_PROMPTS');
});

test('Reset-to-default and Update with AI moved byte-exactly with their vaultLocked and helper-model gates', () => {
  assert.equal(countIn(view, "onClick={() => { resetPrompt(key); setPromptDraft(prev => ({ ...prev, [key]: def })); addToast('Prompt reset to default.'); }}"), 1, 'reset clears the override, drafts the default and toasts');
  assert.equal(countIn(view, "onClick={() => setPromptUpdate({ key, state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' })}"), 1, 'the AI-update opener keeps the exact opening shape');
  assert.equal(countIn(view, 'disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 1, 'the reset button gates on the locked vault');
  assert.equal(countIn(view, 'disabled={(vaultLocked && (vaultPassphraseSet ?? false)) || !judgeConfigured}'), 1, 'the AI-update button also gates on the configured AI Judge helper model');
  assert.ok(body.includes('<RotateCcw size={15} /> Reset to default'), 'reset button copy + icon');
  assert.ok(body.includes('title="Feed feedback and have the AI rewrite this prompt"'), 'AI-update tooltip');
  assert.ok(body.includes('<Sparkles size={15} /> Update with AI'), 'AI-update button copy + icon');
});

test('The placeholders footer card moved with its eight placeholders in order', () => {
  ordered('placeholders card', [
    'Available placeholders:',
    "'{{techniqueCatalog}}'", "'{{count}}'", "'{{techniqueName}}'", "'{{techniqueId}}'",
    "'{{systemPrompt}}'", "'{{userPrompt}}'", "'{{modelResponse}}'", "'{{evaluatorPrompt}}'",
  ]);
});

test('The derivation surface it consumes is complete (runtime pin over utils/prompts)', () => {
  for (const key of ALL_KEYS) {
    assert.ok(PROMPT_LABELS[key], `PROMPT_LABELS covers ${key} (the label fn consults it before the titlecase fallback)`);
    assert.ok(typeof PROMPT_DESCRIPTIONS[key] === 'string' && PROMPT_DESCRIPTIONS[key].length > 0, `PROMPT_DESCRIPTIONS covers ${key}`);
    assert.ok(typeof DEFAULT_PROMPTS[key] === 'string' && DEFAULT_PROMPTS[key].length > 0, `DEFAULT_PROMPTS covers ${key}`);
  }
  assert.equal(PROMPT_LABELS.judge_system, 'Judge System', 'label copy (view renders it verbatim)');
  assert.equal(PROMPT_LABELS.critic_system, 'Critic System', 'label copy (view renders it verbatim)');
});

// ---------------------------------------------------------------------------
// the App wiring — the mount, the kept state, the shed markers, the trims
// ---------------------------------------------------------------------------

test('App imports the view and mounts it under the prompts tab with all eight props wired', () => {
  if (workspaceLanded) {
    assert.equal(countIn(app, "import PromptWorkspace from './components/views/prompts/PromptWorkspace';"), 1, 'App imports PromptWorkspace exactly once');
    assert.equal(countIn(app, '<PromptWorkspace'), 1, 'App mounts PromptWorkspace exactly once');
    const workspaceMountStart = app.indexOf('<PromptWorkspace');
    const workspaceMount = app.slice(workspaceMountStart, app.indexOf('/>', workspaceMountStart) + 2);
    assert.ok(workspaceMount.includes("active={activeTab === 'prompts'}"), 'App passes prompt-tab visibility to the always-mounted workspace');
    assert.equal(countIn(app, "import PromptsView from './components/views/PromptsView';"), 0, 'App no longer imports PromptsView directly');
    assert.equal(countIn(app, '<PromptsView'), 0, 'App no longer mounts PromptsView directly');
    assert.equal(countIn(workspace, "import PromptsView from '../PromptsView';"), 1, 'the workspace imports PromptsView exactly once');
    assert.equal(countIn(workspace, '<PromptsView'), 1, 'the workspace mounts PromptsView exactly once');
    assert.equal(countIn(workspace, '{active && ('), 1, 'the workspace gates the view on active');
    const mountStart = workspace.indexOf('<PromptsView');
    const mount = workspace.slice(mountStart, workspace.indexOf('/>', mountStart) + 2);
    assert.equal(
      norm(mount),
      '<PromptsView promptDraft={promptDraft} setPromptDraft={setPromptDraft} setPromptUpdate={setPromptUpdate} getPromptOverrides={getPromptOverrides} vaultLocked={vaultLocked} vaultPassphraseSet={vaultPassphraseSet} addToast={addToast} judgeConfigured={judgeConfigured} />',
      'the workspace view mount wires exactly the eight roadmap props, in order',
    );
    return;
  }
  assert.ok(app.includes("import PromptsView from './components/views/PromptsView';"), 'App imports the view');
  assert.ok(app.includes("{activeTab === 'prompts' && ("), 'the prompts conditional stays in App');
  const mountStart = app.indexOf('<PromptsView');
  assert.ok(mountStart > 0, 'App mounts <PromptsView');
  const mount = app.slice(mountStart, app.indexOf('/>', mountStart) + 2);
  for (const prop of ['promptDraft={promptDraft}', 'setPromptDraft={setPromptDraft}', 'setPromptUpdate={setPromptUpdate}', 'getPromptOverrides={getPromptOverrides}', 'vaultLocked={vaultLocked}', 'vaultPassphraseSet={vaultPassphraseSet}', 'addToast={addToast}']) {
    assert.ok(mount.includes(prop), `the mount wires ${prop}`);
  }
  // The neighbouring regions are untouched.
  assert.ok(app.includes("{/* 5. SETTINGS VIEW */}"), 'the settings section marker stays');
  assert.ok(app.includes("{activeTab === 'runner' && ("), 'the runner region stays');
});

test('App keeps promptDraft state and the prompt-update dialog that shares it', () => {
  if (workspaceLanded) {
    assert.equal(countIn(app + '\n' + workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'exactly one promptDraft state exists across App and workspace');
    assert.equal(countIn(app, 'const [promptDraft, setPromptDraft] = useState({});'), 0, 'promptDraft leaves App after workspace extraction');
    assert.equal(countIn(workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'the always-mounted workspace owns promptDraft');
    assert.equal(countIn(app, '{promptUpdate && ('), 0, 'the prompt dialog gate leaves App');
    assert.equal(countIn(workspace, '{promptUpdate && ('), 1, 'the workspace owns the prompt dialog gate independently of active');
    return;
  }
  assert.equal(countIn(app, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'App still declares promptDraft exactly once');
  const RES = 'value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}';
  assert.equal(countIn(appDlg, RES), 2, 'the dialog textareas keep the draft-or-override resolution exactly twice across App ∪ dialog (App-side pre-T01, dialog module-side after)');
  assert.equal(countIn(app, '{promptUpdate && ('), 1, 'the prompt-update dialog mount stays App-side');
});

test('The moved markers leave App.jsx — group configs, editors, buttons, placeholders card', () => {
  for (const marker of [
    "title: 'AI Judge'",
    "title: 'Source Analysis'",
    "title: 'Test Generation'",
    "title: 'Test Critique'",
    "tour: 'ai-prompts-judge'",
    "tour: 'ai-prompts-source'",
    "tour: 'ai-prompts-generation'",
    "tour: 'ai-prompts-critique'",
    'value={promptDraft[key] !== undefined ? promptDraft[key] : getPromptOverrides()[key] ?? def}',
    "onClick={() => { resetPrompt(key); setPromptDraft(prev => ({ ...prev, [key]: def })); addToast('Prompt reset to default.'); }}",
    'Available placeholders:',
    'const KeyIcon = keyIcon[key];',
  ]) {
    assert.equal(countIn(app, marker), 0, `region marker left App.jsx: ${marker}`);
  }
  assert.ok(!app.includes("const [activeTab, setActiveTab] = useState('prompts');"), 'sanity: nothing re-declares activeTab');
});

test('App\u2019s imports are trimmed of the region-only surface and keep the shared surface', () => {
  const promptsImport = /import \{([^}]*)\} from '\.\/utils\/prompts';/.exec(app);
  assert.ok(promptsImport, 'App still imports from ./utils/prompts');
  assert.ok(!/\bresetPrompt\b/.test(promptsImport[1]), 'resetPrompt left App\u2019s utils/prompts import (view consumes it now)');
  assert.ok(!/\bPROMPT_DESCRIPTIONS\b/.test(promptsImport[1]), 'PROMPT_DESCRIPTIONS left App\u2019s utils/prompts import (view consumes it now)');
  for (const kept of workspaceLanded ? ['DEFAULT_PROMPTS', 'getPrompt', 'getPromptOverrides'] : ['DEFAULT_PROMPTS', 'getPrompt', 'getPromptOverrides', 'setPrompt']) {
    assert.ok(new RegExp(`\\b${kept}\\b`).test(promptsImport[1]), `App keeps ${kept} (the prompt-update hooks + useJudgeMerge still consume it)`);
  }
  if (workspaceLanded) {
    assert.ok(!/\bsetPrompt\b/.test(promptsImport[1]), 'setPrompt leaves App with the prompt-update hook adoption');
    assert.match(workspace, /import \{[^}]*\bsetPrompt\b[^}]*\} from '\.\.\/\.\.\/\.\.\/utils\/prompts';/, 'the workspace imports setPrompt for usePromptUpdate');
  }
  // The prompt-update dialog (which consumes PROMPT_LABELS module-side) lives
  // in src/components/modals/PromptUpdateDialog.jsx — pin exactly one
  // utils/prompts import of PROMPT_LABELS across App ∪ dialog.
  const dlgPromptsImport = dialog ? /import \{([^}]*)\} from '\.\.\/\.\.\/utils\/prompts';/.exec(dialog) : null;
  const labelHomes = (/\bPROMPT_LABELS\b/.test(promptsImport[1]) ? 1 : 0)
    + (dlgPromptsImport && /\bPROMPT_LABELS\b/.test(dlgPromptsImport[1]) ? 1 : 0);
  assert.equal(labelHomes, 1, 'PROMPT_LABELS is imported from utils/prompts exactly once across App ∪ dialog (App-side pre-T01, dialog module-side after T01)');
  for (const trimmed of ['Database', 'Wand2', 'RotateCcw', 'Scale', 'ScrollText', 'Tag', 'BadgeCheck', 'Brain', 'Hammer', 'Filter', 'Cpu']) {
    assert.doesNotMatch(app, new RegExp(`^\\s*${trimmed},?\\s*$`, 'm'), `the region-only icon ${trimmed} left App\u2019s lucide import`);
  }
  for (const kept of ['Sparkles']) {
    assert.ok(new RegExp(`\\b${kept}\\b`).exec(app), `App keeps ${kept} (used outside the moved region)`);
  }
  // The ShieldCheck note icon lives in the dialog — union pin.
  assert.ok(/\bShieldCheck\b/.test(app) || /\bShieldCheck\b/.test(dialog), 'ShieldCheck survives the T01 dialog move (App-side pre-T01, dialog module-side after)');
});

test('App.jsx sheds the region (net-smaller gate)', () => {
  assert.ok(lineCount(app) < 2350, `App.jsx must shed the moved region (baseline 2350); got ${lineCount(app)}`);
  assert.ok(lineCount(view) > 110, `the view must carry the moved region; got ${lineCount(view)}`);
});
