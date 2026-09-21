// Contract: the "Update with AI" prompt-update dialog lives in
// src/components/modals/PromptUpdateDialog.jsx as a props-in/events-out
// component over the eleven-contract props (promptUpdate, setPromptUpdate,
// closePromptUpdate, applyPromptUpdate, rerunPromptUpdateCanaries,
// runPromptUpdate, refinePromptUpdate, promptDraft, getPromptOverrides,
// vaultLocked, vaultPassphraseSet), importing
// PROMPT_LABELS/DEFAULT_PROMPTS module-side from utils/prompts; App keeps the
// usePromptUpdate adoption, the promptDraft state, and the
// `{promptUpdate && (<PromptUpdateDialog … />)}` mount.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/add-source-dialog.contract.test.mjs).
// Every dialog-body pin is a normalized (trim per line, blank-free) needle, so
// re-indentation cannot flip a pin for the wrong reason; the body must stay
// byte-compatible line-for-line (DOM/testids unchanged).
// Hermetic under bare `node --test`: no dev server, no network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const DIALOG_PATH = 'src/components/modals/PromptUpdateDialog.jsx';
const CANARY_PATH = 'src/components/modals/CanaryPreview.jsx';
const WORKSPACE_PATH = 'src/components/views/prompts/PromptWorkspace.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const normalize = (src) => src.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const countStr = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

let app = '', dialog = '', canary = '', workspace = '';
try {
  app = readSource(APP_PATH);
} catch { /* missing App fails its first assertion */ }
try {
  dialog = readSource(DIALOG_PATH);
} catch { /* a missing dialog fails its first assertion */ }
try {
  canary = readSource(CANARY_PATH);
} catch { /* fallback when the preview still lives inside the dialog */ }
try {
  workspace = readSource(WORKSPACE_PATH);
} catch { /* fallback when the workspace is not extracted */ }
const workspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(workspace);
const normDialog = normalize(dialog);
const normCanary = normalize(canary);

// The eleven contract props, in order: the seven usePromptUpdate ops
// plus the state/resolver/vault surface the dialog JSX reads.
const PROPS = [
  'promptUpdate', 'setPromptUpdate', 'closePromptUpdate', 'applyPromptUpdate',
  'rerunPromptUpdateCanaries', 'runPromptUpdate', 'refinePromptUpdate',
  'promptDraft', 'getPromptOverrides', 'vaultLocked', 'vaultPassphraseSet',
];

// The exact dialog needles: every needle below must appear EXACTLY ONCE in the
// dialog module unless a count is stated (byte-compatible body).
const DIALOG_NEEDLES = [
  // shell
  "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 143,",
  "background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',",
  "width: '100%', maxWidth: '720px', maxHeight: '86vh',",
  // header ternary (all four arms)
  '? `Update ${PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} with AI`',
  '? \'Rewriting the prompt…\'',
  '? \'Fine-tuning the prompt…\'',
  ': `Review the updated ${PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} prompt`}',
  '<button onClick={closePromptUpdate} className="btn-secondary" style={{ padding: \'6px\' }}>',

  // feedback branch
  '{promptUpdate.state === \'feedback\' && (',
  'Tell the model how this prompt should behave differently. It will rewrite the prompt to incorporate',
  '<label className="form-label">Current {PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} prompt</label>',
  '<label className="form-label">Your feedback</label>',
  'value={promptUpdate.feedback}',
  'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, feedback: e.target.value } : prev)}',
  'placeholder="e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…"',
  'checked={promptUpdate.skipCanaries === true}',
  'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, skipCanaries: e.target.checked } : prev)}',
  'Skip canary preview',
  '<button onClick={runPromptUpdate} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary">',
  '<Sparkles size={15} /> Update with AI',

  // loading / refining branches
  'The model is rewriting the prompt based on your feedback…',
  'The model is fine-tuning the prompt with your additional instructions…',

  // error branch
  'Could not update the prompt: {promptUpdate.error}',
  "onClick={() => setPromptUpdate(prev => prev ? { ...prev, state: 'feedback' } : prev)}",

  // preview branch
  '{promptUpdate.state === \'preview\' && (',
  '<label className="form-label">Previous prompt (read-only)</label>',
  '<label className="form-label">New prompt (editable — the AI\'s updated version)</label>',
  'value={promptUpdate.next}',
  'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, next: e.target.value } : prev)}',
  '{promptUpdate.rejected && (',
  '<AlertTriangle size={14} style={{ flexShrink: 0, marginTop: \'2px\' }} />',
  '<span>{promptUpdate.rejected}</span>',

  // placeholder-contract note (truthful, state-dependent copy)
  '<ShieldCheck size={14} style={{ flexShrink: 0, marginTop: \'2px\' }} color="var(--color-secondary)" />',
  'This rewrite keeps required placeholders, but verdict behavior was not automatically validated — review the canary preview before applying.',
  'This rewrite keeps required placeholders, but it was flagged as possibly forcing a fixed outcome — review it before applying.',
  "This rewrite was checked to keep the prompt's required placeholders; instructions forcing a fixed outcome were rejected. Review it before applying.",

  // fine-tune card
  '<span className="form-label" style={{ margin: 0 }}>Fine-tune with another AI pass</span>',
  'value={promptUpdate.fineTuneFeedback || \'\'}',
  'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}',
  'placeholder="e.g. Keep it shorter, be stricter about ambiguous refusals, prefer explicit JSON-only output…"',
  '<button onClick={refinePromptUpdate} disabled={promptUpdate.refining} className="btn-secondary" style={{ fontSize: \'0.75rem\', padding: \'6px 12px\' }}>',
  '{promptUpdate.refining ? <><RefreshCw size={11} className="animate-spin-custom" style={{ marginRight: \'6px\' }} /> Fine-tuning…</> : \'Fine-tune with another AI pass\'}',
];

// ---------------------------------------------------------------------------
// the module is real, props-in/events-out, no hooks, no context reach
// ---------------------------------------------------------------------------

test('PromptUpdateDialog.jsx is the real dialog — named default export at the TARGET_PATH', () => {
  assert.ok(dialog.length > 0, 'src/components/modals/PromptUpdateDialog.jsx exists and is non-empty');
  assert.match(dialog, /export default function PromptUpdateDialog\(/, 'named default export PromptUpdateDialog (JudgeMergeDialog/AddSourceDialog precedent)');
});

test('The props-in contract is exactly the eleven roadmap names, in order', () => {
  const sig = /export default function PromptUpdateDialog\(\{([^}]*)\}\)/.exec(dialog);
  assert.ok(sig, 'the dialog signature is a destructured props bag');
  const names = sig[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(names, PROPS, 'exactly the eleven contract props, in order');
});

test('The dialog imports PROMPT_LABELS/DEFAULT_PROMPTS module-side from utils/prompts and its five icons from lucide-react', () => {
  const promptsImport = /import \{([^}]*)\} from '\.\.\/\.\.\/utils\/prompts';/.exec(dialog);
  assert.ok(promptsImport, "the dialog imports from '../../utils/prompts'");
  for (const name of ['PROMPT_LABELS', 'DEFAULT_PROMPTS']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(promptsImport[1]), `the prompts import carries ${name}`);
  }
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(dialog);
  assert.ok(lucide, 'the dialog imports its icons from lucide-react');
  for (const icon of ['X', 'Sparkles', 'RefreshCw', 'AlertTriangle', 'ShieldCheck']) {
    assert.ok(new RegExp(`\\b${icon}\\b`).test(lucide[1]), `the lucide import carries ${icon}`);
  }
});

test('The dialog declares no hooks, consumes no contexts, does no I/O, never imports App', () => {
  assert.ok(dialog.length > 0, 'src/components/modals/PromptUpdateDialog.jsx exists');
  assert.doesNotMatch(dialog, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b/, 'the dialog declares no hooks — state stays in the usePromptUpdate hook + App');
  assert.doesNotMatch(dialog, /useUI\(|useProviders\(|useVaultActions\(|usePromptUpdate\(|useHistory\(|useTests\(/, 'the dialog consumes no contexts or hooks — props only');
  assert.doesNotMatch(dialog, /\bfetch\(|localStorage/, 'the dialog does no I/O');
  assert.doesNotMatch(dialog, /import .*App/, 'the dialog never imports App');
});

// ---------------------------------------------------------------------------
// the dialog body — every needle exactly once (byte-compatible)
// ---------------------------------------------------------------------------

test('The moved dialog body carries every App-inline needle verbatim — exactly once each', () => {
  for (const needle of DIALOG_NEEDLES) {
    assert.equal(countStr(normDialog, needle), 1, `the dialog carries exactly once: ${needle.slice(0, 80)}…`);
  }
});

test('The canary preview stays pinned across the pre/post-T21 dialog ∪ shared-component seam', () => {
  const surface = normDialog + '\n' + normCanary;
  for (const needle of [
    'Canary preview (does this prompt still classify obvious cases correctly?)',
    'Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.',
    "{c.diverged ? '✗' : '✓'}",
    "{c.expected === 'SECURE' ? 'badge-secure' : c.expected === 'VULNERABLE' ? 'badge-vulnerable' : ''}",
    "{c.status === 'SECURE' ? 'badge-secure' : c.status === 'VULNERABLE' ? 'badge-vulnerable' : ''}",
  ]) assert.equal(countStr(surface, needle), 1, `dialog ∪ CanaryPreview carries ${needle}`);
  if (canary) {
    assert.equal(countStr(dialog, '<CanaryPreview'), 1, 'the dialog delegates to CanaryPreview once');
    assert.equal(countStr(dialog, 'onRerun={rerunPromptUpdateCanaries}'), 1, 'the existing callback is forwarded unchanged');
  } else {
    assert.equal(countStr(dialog, 'onClick={rerunPromptUpdateCanaries}'), 1, 'pre-T21 callback remains directly wired');
  }
});

test('The draft-or-override resolution moved with both textarea sites; branch counts preserved', () => {
  const RES = 'value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}';
  assert.equal(countStr(normDialog, RES), 2, 'the draft-or-override-or-default resolution appears exactly twice (current-prompt + previous-prompt)');
  const branches = { 'feedback': 2, 'loading': 2, 'refining': 2, 'error': 1, 'preview': 1 };
  for (const [state, count] of Object.entries(branches)) {
    assert.equal(countStr(normDialog, `promptUpdate.state === '${state}'`), count, `state branch '${state}' rendered ${count} time(s)`);
  }
  assert.equal(countStr(normDialog.replace(/^\/\/.*$/gm, ''), '{promptUpdate && ('), 0, 'the dialog does not re-gate on promptUpdate — the App mount gate governs');
});

test('The wiring arity holds dialog-side — close x3, each op x1, both Cancel footers', () => {
  assert.equal(countStr(normDialog, 'onClick={closePromptUpdate}'), 3, 'close wired on the header X and both Cancel buttons');
  for (const handler of ['runPromptUpdate', 'refinePromptUpdate', 'applyPromptUpdate']) {
    assert.equal(countStr(normDialog, `onClick={${handler}}`), 1, `JSX wires ${handler} exactly once`);
  }
  assert.equal(countStr(normDialog, '<button onClick={closePromptUpdate} className="btn-secondary">Cancel</button>'), 2, 'both Cancel footers verbatim');
  assert.equal(countStr(normDialog, '<button onClick={applyPromptUpdate} className="btn-primary">\nApply prompt\n</button>'), 1, 'Apply prompt button + copy as one block');
  assert.equal(countStr(normDialog, 'Fine-tune with another AI pass'), 2, 'fine-tune copy = card label + idle button label');
});

// ---------------------------------------------------------------------------
// the App seam — the import, the mount, the shed markers, the trims
// ---------------------------------------------------------------------------

test('App imports the dialog and keeps the `{promptUpdate && (` mount gate with all eleven props wired', () => {
  if (workspaceLanded) {
    assert.equal(countStr(app, "import PromptUpdateDialog from './components/modals/PromptUpdateDialog';"), 0, 'App no longer imports the prompt dialog directly');
    assert.equal(countStr(app, '<PromptUpdateDialog'), 0, 'App no longer mounts the prompt dialog directly');
    assert.equal(countStr(workspace, "import PromptUpdateDialog from '../../modals/PromptUpdateDialog';"), 1, 'the workspace imports the dialog exactly once');
    assert.equal(countStr(workspace, '{promptUpdate && ('), 1, 'the prompt dialog gate is workspace-owned');
    assert.equal(countStr(workspace, '<PromptUpdateDialog'), 1, 'the workspace mounts the dialog exactly once');
    const mountStart = workspace.indexOf('<PromptUpdateDialog');
    const mount = workspace.slice(mountStart, workspace.indexOf('/>', mountStart) + 2);
    assert.equal(
      mount.replace(/\s+/g, ' ').trim(),
      `<PromptUpdateDialog ${PROPS.map((prop) => `${prop}={${prop}}`).join(' ')} />`,
      'the workspace dialog mount wires exactly the eleven roadmap props, in order',
    );
    return;
  }
  assert.equal(countStr(app, "import PromptUpdateDialog from './components/modals/PromptUpdateDialog';"), 1, 'App imports the dialog extensionlessly, like its sibling modals');
  assert.equal(countStr(app, '{promptUpdate && ('), 1, 'the mount gate stays App-side exactly once');
  const mountStart = app.indexOf('<PromptUpdateDialog');
  assert.ok(mountStart > 0, 'App mounts <PromptUpdateDialog');
  const mount = app.slice(mountStart, app.indexOf('/>', mountStart) + 2);
  for (const prop of PROPS) {
    assert.ok(mount.includes(`${prop}={${prop}}`), `the mount wires ${prop}={${prop}}`);
  }
  assert.ok(app.includes('{/* 8. AI PROMPT UPDATE DIALOG'), 'the section comment stays App-side (judge-merge-dialog-port adjacency pin)');
});

test('App sheds the moved markers — overlay, copy, updaters and resolution are dialog-side only', () => {
  assert.equal(countStr(app, 'zIndex: 143,'), 0, 'the overlay left App.jsx');
  for (const needle of [
    'Tell the model how this prompt should behave differently.',
    'Could not update the prompt: {promptUpdate.error}',
    'Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.',
    'Canary preview (does this prompt still classify obvious cases correctly?)',
    'This rewrite keeps required placeholders, but verdict behavior was not automatically validated',
    'Skip canary preview (the prompt will still be checked when you apply it)',
    '<Sparkles size={15} /> Update with AI',
    'checked={promptUpdate.skipCanaries === true}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, feedback: e.target.value } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, skipCanaries: e.target.checked } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, next: e.target.value } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}',
    "onClick={() => setPromptUpdate(prev => prev ? { ...prev, state: 'feedback' } : prev)}",
    '<button onClick={runPromptUpdate} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary">',
    'value={promptUpdate.next}',
    'value={promptUpdate.fineTuneFeedback || \'\'}',
    'PROMPT_LABELS[promptUpdate.key] || promptUpdate.key',
  ]) {
    assert.equal(countStr(app, needle), 0, `region marker left App.jsx: ${needle.slice(0, 72)}…`);
  }
  const RES = 'value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}';
  assert.equal(countStr(app, RES) + countStr(normDialog, RES), 2, 'the draft-or-override resolution exists exactly twice across App ∪ dialog — both moved');
});

test('App keeps promptDraft, the hook adoption and its shared imports; the dialog-only imports move', () => {
  if (workspaceLanded) {
    assert.equal(countStr(app, 'const [promptDraft, setPromptDraft] = useState({});'), 0, 'promptDraft leaves App');
    assert.equal(countStr(workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'the workspace owns promptDraft exactly once');
    assert.equal(countStr(app, '= usePromptUpdate({'), 0, 'the hook adoption leaves App');
    assert.equal(countStr(workspace, '= usePromptUpdate({'), 1, 'the workspace adopts usePromptUpdate exactly once');
    assert.doesNotMatch(app, /import \{ usePromptUpdate \}/, 'App no longer imports usePromptUpdate');
    assert.match(workspace, /import \{ usePromptUpdate \} from '\.\.\/\.\.\/\.\.\/hooks\/usePromptUpdate';/, 'the workspace imports usePromptUpdate');
    const appPromptsImport = /import \{([^}]*)\} from '\.\/utils\/prompts';/.exec(app);
    assert.ok(appPromptsImport && !/\bsetPrompt\b/.test(appPromptsImport[1]), 'setPrompt leaves the App prompts import');
    assert.match(workspace, /import \{[^}]*\bsetPrompt\b[^}]*\} from '\.\.\/\.\.\/\.\.\/utils\/prompts';/, 'the workspace owns the setPrompt dependency');
    return;
  }
  assert.equal(countStr(app, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'App still declares promptDraft exactly once (A3 pin)');
  assert.ok(app.includes('= usePromptUpdate({'), 'App keeps the usePromptUpdate adoption');
  const promptsImport = /import \{([^}]*)\} from '\.\/utils\/prompts';/.exec(app);
  assert.ok(promptsImport, 'App still imports from ./utils/prompts');
  for (const kept of ['DEFAULT_PROMPTS', 'getPrompt', 'getPromptOverrides', 'setPrompt']) {
    assert.ok(new RegExp(`\\b${kept}\\b`).test(promptsImport[1]), `App keeps ${kept} (the hook adoption + useJudgeMerge still consume it)`);
  }
  assert.ok(!/\bPROMPT_LABELS\b/.test(promptsImport[1]), 'PROMPT_LABELS left App\u2019s utils/prompts import (the dialog consumes it module-side now)');
  const lucide = /import \{([^}]*)\} from 'lucide-react';/.exec(app);
  assert.ok(lucide, 'App still imports from lucide-react');
  for (const kept of ['X', 'Sparkles', 'AlertTriangle']) {
    assert.ok(new RegExp(`\\b${kept}\\b`).test(lucide[1]), `App keeps ${kept} (used outside the moved region)`);
  }
  for (const trimmed of ['RefreshCw', 'ShieldCheck']) {
    assert.ok(!new RegExp(`\\b${trimmed}\\b`).test(lucide[1]), `the dialog-only icon ${trimmed} left App\u2019s lucide import`);
  }
});

test('App.jsx is strictly net-smaller; the dialog carries the moved region', () => {
  assert.ok(lineCount(app) < 1290, `App.jsx sheds the ~185-line dialog region (landed ${lineCount(app)} lines)`);
  assert.ok(lineCount(dialog) > 160, `the dialog carries the moved region (landed ${lineCount(dialog)} lines)`);
});
