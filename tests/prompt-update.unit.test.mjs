// The "Update with AI" prompt flow lives in src/hooks/usePromptUpdate.js —
// the hook OWNS the promptUpdate dialog state (via useState) plus
// closePromptUpdate, runPromptUpdate, refinePromptUpdate,
// rerunPromptUpdateCanaries and applyPromptUpdate. App.jsx keeps ONLY: the
// hook adoption, the promptDraft state the settings cards read, and the dialog
// JSX mount. The dialog JSX lives in
// src/components/modals/PromptUpdateDialog.jsx (App keeps the
// `{promptUpdate && (<PromptUpdateDialog … />)}` mount), so the dialog pins
// below count over the App ∪ dialog union — green against BOTH an App-inline
// dialog and a dialog module, with every count preserved and no assertion
// weakened. The hook consumes providers via useProviders() and takes the
// explicit non-context deps (buildJudge, judgeConfig, getPrompt, setPrompt,
// setPromptDraft, confirmJudgeRewriteApply — the shared apply gate bound from
// the useJudgeMerge hook — and addToast), importing runJudgeCanaries plus
// mergePromptWithAI/redactSensitiveText. Behavior is byte-compatible: every
// guard, toast, canary-injection position (judge_system bare candidate,
// judge_user injected as the user template with the current judge_system),
// skipCanaries semantics, stale-canary canarySource bookkeeping and the refine
// pipeline's canaries-cleared-then-refreshed shape all hold.
//
// COLOR CONTRACT: RED before the hook exists by design — the hook does not
// exist yet and the ops are still App-owned — and GREEN once the hook lands.
// Each failing assertion there is a declared seam (hook missing / op not moved
// / App keeps the pipeline). The dialog union keeps every dialog pin green in
// both states.
//
// Behavioral cases compile the EXTRACTED REAL HOOK BODIES (2-space component
// indent, same mechanics as the prior characterization suite) with injected
// collaborators, and the apply path exercises the REAL confirmJudgeRewriteApply
// body compiled from src/hooks/useJudgeMerge.js — proving the end-to-end gate
// wiring is identical. Hermetic under bare `node --test`: no server, no
// network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeRewriteApplyGate } from '../src/utils/ai-judge.js';
import { redactSensitiveText } from '../src/utils/redact.js';
import { PROMPT_REWRITE_TYPE, snapshotOperationIdentity, sameOperationIdentity } from '../src/utils/ai-operation-identity.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/usePromptUpdate.js';
const MERGE_HOOK_PATH = 'src/hooks/useJudgeMerge.js';
const VIEW_PATH = 'src/components/views/PromptsView.jsx';
const DIALOG_PATH = 'src/components/modals/PromptUpdateDialog.jsx';
const WORKSPACE_PATH = 'src/components/views/prompts/PromptWorkspace.jsx';
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '';
let hook = '';
let mergeHook = '';
let view = '';
let dialog = '';
let canaryPreview = '';
let workspace = '';
try {
  app = readSource(APP_PATH);
  mergeHook = readSource(MERGE_HOOK_PATH);
  // The AI Prompts view (which carries the settings-card opener) — read
  // tolerantly so it may be absent.
  try { view = readSource(VIEW_PATH); } catch { /* view may be absent */ }
} catch { /* missing files fail their first assertion */ }
try {
  hook = readSource(HOOK_PATH);
} catch { /* the hook may be absent */ }
// The prompt-update dialog module — the JSX may be App-inline, so read
// tolerantly; the union pins below hold in both states.
try { dialog = readSource(DIALOG_PATH); } catch { /* dialog may be App-inline */ }
try { canaryPreview = readSource('src/components/modals/CanaryPreview.jsx'); } catch { /* preview may be inline */ }
try { workspace = readSource(WORKSPACE_PATH); } catch { /* workspace may be absent */ }
const workspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(workspace);
const appDlg = app + '\n' + dialog + '\n' + canaryPreview;

const countStr = (source, needle) => source.split(needle).length - 1;

// Extracts a component/hook-body member: from its `const NAME = ` declaration
// line to its closing line at the 2-space indent. Tolerates single-line arrow
// consts.
function extractMember(source, name) {
  const declRe = new RegExp(`^  const ${name} = `, 'm');
  const m = declRe.exec(source);
  assert.ok(m, `member ${name} not found at the 2-space body indent`);
  const lines = source.slice(m.index).split('\n');
  const first = lines[0];
  if (/;\s*$/.test(first)) return first;
  const buf = [first];
  const nextDecl = /^  (const \w+ = |useEffect\(|function )/;
  for (let i = 1; i < lines.length; i++) {
    if (i > 1 && nextDecl.test(lines[i])) assert.fail(`member ${name} never closed before the next declaration`);
    buf.push(lines[i]);
    if (lines[i] === '  };' || lines[i] === '  });') return buf.join('\n');
  }
  assert.fail(`member ${name} has no closing line`);
}

// Compiles an extracted member body into an invokable function. Every free
// identifier of the body is bound as a function parameter; the member's own
// params become the invocation args.
const ArrowFnEval = Function;
function compileMember(source, name, env) {
  const member = extractMember(source, name);
  const names = Object.keys(env);
  const lines = member.split('\n');
  let inner;
  let params = '';
  if (lines.length === 1) {
    const am = /^  const \w+ = \s*(?:async\s*)?(\([^)]*\))\s*=>\s*(.+);\s*$/.exec(lines[0]);
    assert.ok(am, `single-line member ${name} is not a plain arrow const`);
    params = am[1].slice(1, -1);
    inner = `return ${am[2].trim()};`;
  } else {
    const hm = /^  const \w+ = \s*(?:async\s*)?(\([^)]*\))\s*=>\s*\{$/.exec(lines[0]);
    assert.ok(hm, `member ${name} head is not an arrow const`);
    params = hm[1].slice(1, -1);
    inner = lines.slice(1, -1).join('\n');
  }
  const factory = new ArrowFnEval(...names, `'use strict';\nreturn (async (${params}) => {\n${inner}\n});`);
  return (...args) => factory(...names.map((n) => env[n]))(...args);
}

const CANARY_OK = [{ name: 'Secure refusal', expected: 'SECURE', status: 'SECURE', reasoning: 'refused', diverged: false }];
const CANARY_DIVERGED = [
  { name: 'Secure refusal', expected: 'SECURE', status: 'VULNERABLE', reasoning: 'leaked', diverged: true },
  { name: 'Vulnerable compliance', expected: 'VULNERABLE', status: 'VULNERABLE', reasoning: 'complied', diverged: false },
];

const OPEN_SHAPE = (key, over = {}) => ({ key, state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '', ...over });

// The immutable operation snapshot the hook captures at run/refine time, rebuilt
// with the same live-state values makeEnv exposes (getPrompt returns
// `PROMPT:<key>`, the judge is p1/m1) so apply-time identity re-verification
// sees a matching snapshot.
const SNAP = (key, over = {}) => snapshotOperationIdentity({
  type: PROMPT_REWRITE_TYPE,
  key,
  base: over.base !== undefined ? over.base : `PROMPT:${key}`,
  companion: over.companion !== undefined ? over.companion : (key === 'judge_user' ? 'PROMPT:judge_system' : null),
  provider: 'p1',
  model: 'm1',
});

// Live-state environment: `promptUpdate` is a getter over the current dialog
// value, setPromptUpdate applies updaters and records every transition. All
// collaborators default to deterministic fakes; per-test `over` replaces them.
const makeEnv = (over = {}) => {
  const calls = [];
  let update = over.initialPromptUpdate !== undefined ? over.initialPromptUpdate : null;
  let draft = { judge_system: 'DRAFT TEXT' };
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const judge = { provider: 'p1', model: 'm1', apiKey: 'sk-test', endpoint: 'http://127.0.0.1:9999/v1', rpm: 0 };

  const env = {};
  Object.defineProperty(env, 'promptUpdate', { enumerable: true, get: () => update });
  env.setPromptUpdate = (v) => {
    update = typeof v === 'function' ? v(update) : v;
    calls.push(['setPromptUpdate', update === null ? null : structuredClone(update)]);
  };
  Object.defineProperty(env, 'judgeMerge', { enumerable: true, get: () => null });
  env.__draft = () => draft;
  env.__calls = calls;
  env.__judge = judge;

  const collab = {
    addToast: record('addToast'),
    setPrompt: (key, value) => { record('setPrompt')(key, value); return env.__setPromptResult !== undefined ? env.__setPromptResult : true; },
    setPromptDraft: (updater) => { record('setPromptDraft')(updater); draft = updater(draft); },
    promptDraft: { judge_system: 'DRAFT TEXT' },
    getPrompt: (key) => { record('getPrompt')(key); return env.__getPromptValue !== undefined ? env.__getPromptValue : `PROMPT:${key}`; },
    getPromptOverrides: () => ({}),
    buildJudge: () => judge,
    judgeConfig: { provider: 'p1', model: 'm1' },
    providers: [{ id: 'p1', enabled: true }],
    mergePromptWithAI: async (j, key, feedback) => { record('mergePromptWithAI')(j, key, feedback); return env.__mergeResult !== undefined ? env.__mergeResult : { prompt: 'REWRITTEN_PROMPT', rejected: null }; },
    runJudgeCanaries: async (...args) => { record('runJudgeCanaries')(...args); return env.__canaries !== undefined ? env.__canaries : CANARY_OK; },
    confirmJudgeRewriteApply: async (next, canaries, canarySource) => { record('confirmJudgeRewriteApply')(next, canaries, canarySource); return env.__confirmAnswer !== undefined ? env.__confirmAnswer : true; },
    redactSensitiveText,
    judgeRewriteApplyGate,
    snapshotOperationIdentity,
    sameOperationIdentity,
    PROMPT_REWRITE_TYPE,
    opSeq: { current: 0 },
    askConfirm: async (msg) => { record('askConfirm')(msg); return env.__askConfirmAnswer !== undefined ? env.__askConfirmAnswer : true; },
  };
  Object.assign(env, collab, over);
  return env;
};

const named = (rec, name) => rec.filter(([n]) => n === name).map(([, ...a]) => a);
const assertNoCalls = (rec) => assert.equal(rec.length, 0, `expected zero calls, got ${JSON.stringify(rec)}`);
const run = (env, name) => compileMember(hook, name, env);
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

// Compiles the REAL confirmJudgeRewriteApply body (from
// src/hooks/useJudgeMerge.js) against an env so applyPromptUpdate exercises the
// actual apply-gate wiring.
const withRealGate = (env) => {
  env.confirmJudgeRewriteApply = compileMember(mergeHook, 'confirmJudgeRewriteApply', env);
  return env;
};

// ===========================================================================
// Ownership — the hook owns the state machine, App binds + delegates
// ===========================================================================

test('Src/hooks/usePromptUpdate.js exists and exports the hook contract', () => {
  assert.ok(hook.length > 0, 'src/hooks/usePromptUpdate.js does not exist yet — T07 has not landed');
  assert.match(hook, /export function usePromptUpdate\(\{/, 'the hook is exported with a parameter-bag signature');
});

test('The hook defines the promptUpdate state and all four ops exactly once; App defines none and keeps promptDraft', () => {
  assert.equal(countStr(hook, 'const [promptUpdate, setPromptUpdate] = useState(null);'), 1, 'the hook owns the promptUpdate state');
  assert.equal(countStr(app, 'const [promptUpdate, setPromptUpdate] = useState(null);'), 0, 'the state is gone from App');
  for (const name of ['closePromptUpdate', 'applyPromptUpdate', 'rerunPromptUpdateCanaries', 'runPromptUpdate', 'refinePromptUpdate']) {
    assert.equal(countStr(hook, `const ${name} = `), 1, `the hook defines ${name} exactly once`);
    assert.equal(countStr(app, `const ${name} = `), 0, `App no longer defines ${name}`);
  }
  if (workspaceLanded) {
    assert.equal(countStr(app, 'const [promptDraft, setPromptDraft] = useState({});'), 0, 'promptDraft leaves App');
    assert.equal(countStr(workspace, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'the workspace owns promptDraft exactly once');
  } else {
    assert.equal(countStr(app, 'const [promptDraft, setPromptDraft] = useState({});'), 1, 'App keeps the promptDraft state the settings cards read');
  }
});

test('The hook return surface exposes all seven names; App adopts them from the hook', () => {
  const retStart = hook.lastIndexOf('  return {');
  assert.ok(retStart > 0, 'the hook has a return surface');
  const retTail = hook.slice(retStart, retStart + 600);
  for (const name of ['promptUpdate', 'setPromptUpdate', 'closePromptUpdate', 'applyPromptUpdate', 'rerunPromptUpdateCanaries', 'runPromptUpdate', 'refinePromptUpdate']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(retTail), `the hook return surface exposes ${name}`);
  }
  const owner = workspaceLanded ? workspace : app;
  const adoption = owner.indexOf('= usePromptUpdate({');
  assert.ok(adoption > 0, `${workspaceLanded ? 'PromptWorkspace' : 'App'} adopts usePromptUpdate`);
  const destructure = owner.slice(owner.lastIndexOf('const {', adoption), owner.lastIndexOf('} = usePromptUpdate', adoption));
  for (const name of ['promptUpdate', 'setPromptUpdate', 'closePromptUpdate', 'applyPromptUpdate', 'rerunPromptUpdateCanaries', 'runPromptUpdate', 'refinePromptUpdate']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(destructure), `the owner destructure binds ${name} from the hook`);
  }
  const bag = owner.slice(adoption, owner.indexOf('});', adoption));
  for (const dep of ['buildJudge', 'judgeConfig', 'getPrompt', 'setPrompt', 'setPromptDraft', 'confirmJudgeRewriteApply', 'addToast']) {
    assert.ok(new RegExp(`\\b${dep}\\b`).test(bag), `the owner adoption passes ${dep} into the hook`);
  }
  if (workspaceLanded) assert.equal(countStr(app, '= usePromptUpdate({'), 0, 'App no longer adopts the hook directly');
});

test('The hook takes the explicit non-context deps and consumes providers via its context', () => {
  const sigStart = hook.indexOf('export function usePromptUpdate({');
  const sigEnd = hook.indexOf('}) {', sigStart);
  assert.ok(sigEnd > sigStart, 'the hook signature closes with }) {');
  const sig = hook.slice(sigStart, sigEnd);
  for (const dep of ['buildJudge', 'judgeConfig', 'getPrompt', 'setPrompt', 'setPromptDraft', 'confirmJudgeRewriteApply', 'addToast']) {
    assert.ok(new RegExp(`\\b${dep}\\b`).test(sig), `the hook takes ${dep} as an explicit non-context dep`);
  }
  assert.match(hook, /const \{([^}]*)\}\s*=\s*useProviders\(\);/, 'the hook consumes useProviders()');
  const providersDestructure = /const \{([^}]*)\}\s*=\s*useProviders\(\);/.exec(hook);
  assert.ok(providersDestructure && /\bproviders\b/.test(providersDestructure[1]), 'the useProviders() destructure binds providers');
});

test('The hook imports useState/useRef, T02 runJudgeCanaries and the merge/redact/identity primitives', () => {
  assert.match(hook, /import \{ useRef, useState \} from 'react';/, 'the hook imports useRef + useState for its owned state');
  assert.match(hook, /import \{ runJudgeCanaries \} from '\.\.\/utils\/judge-canaries(\.js)?';/, 'the hook consumes T02 runJudgeCanaries');
  assert.match(hook, /import \{[^}]*mergePromptWithAI[^}]*\} from '\.\.\/utils\/prompts(\.js)?';/, 'the hook imports mergePromptWithAI');
  assert.match(hook, /import \{[^}]*redactSensitiveText[^}]*\} from '\.\.\/utils\/redact(\.js)?';/, 'the hook imports redactSensitiveText');
  assert.match(hook, /import \{[^}]*snapshotOperationIdentity[^}]*sameOperationIdentity[^}]*\} from '\.\.\/utils\/ai-operation-identity(\.js)?';/, 'the hook imports the operation-identity helpers');
});

test('The prompt-update pipeline left App — no call sites or flow utils remain App-side', () => {
  assert.equal((app.match(/\bmergePromptWithAI\b/g) || []).length, 0, 'App no longer references mergePromptWithAI');
  // \b guards against the merge hook's rerunJudgeCanaries binding (a plain
  // substring count would match inside that identifier).
  assert.equal((app.match(/\brunJudgeCanaries\b/g) || []).length, 0, 'App no longer references runJudgeCanaries');
  // The in-flight guard belongs to runPromptUpdate:
  const guard = "if (!promptUpdate || promptUpdate.state === 'loading') return;";
  assert.equal(countStr(app, guard), 0, "the runPromptUpdate in-flight guard left App");
  assert.ok(extractMember(hook, 'runPromptUpdate').includes(guard), 'the guard moved into the hook byte-identically');
});

// ===========================================================================
// The dialog JSX: mount, state branches, handlers, copy (App ∪ dialog union)
// ===========================================================================

test('The modal is keyed on promptUpdate and renders every state branch (App ∪ dialog union — App-side pre-T01, dialog module-side after)', () => {
  if (workspaceLanded) {
    assert.equal(countStr(app, '{promptUpdate && ('), 0, 'the mount gate leaves App');
    assert.equal(countStr(workspace, '{promptUpdate && ('), 1, 'the mount gate moves to the always-mounted workspace');
  } else {
    assert.equal(countStr(app, '{promptUpdate && ('), 1, 'the mount gate stays App-side (pre-T01: the inline dialog; post-T01: the <PromptUpdateDialog mount)');
  }
  const branches = { 'feedback': 2, 'loading': 2, 'refining': 2, 'error': 1, 'preview': 1 };
  for (const [state, count] of Object.entries(branches)) {
    assert.equal(countStr(appDlg, `promptUpdate.state === '${state}'`), count, `state branch '${state}' rendered ${count} time(s) across App ∪ dialog`);
  }
});

test('Every op and updater stays wired (App ∪ dialog union) and the opening shape is pinned', () => {
  assert.equal(countStr(appDlg, 'onClick={closePromptUpdate}'), 3, 'close wired on the X and both Cancel buttons');
  for (const handler of ['runPromptUpdate', 'refinePromptUpdate', 'applyPromptUpdate']) {
    assert.equal(countStr(appDlg, `onClick={${handler}}`), 1, `JSX wires ${handler}`);
  }
  assert.equal(
    countStr(appDlg, 'onClick={rerunPromptUpdateCanaries}') + countStr(appDlg, 'onRerun={rerunPromptUpdateCanaries}'),
    1,
    'rerunPromptUpdateCanaries is wired directly before T21 or forwarded after T21',
  );
  for (const needle of [
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, feedback: e.target.value } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, skipCanaries: e.target.checked } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, next: e.target.value } : prev)}',
    'onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}',
    "onClick={() => setPromptUpdate(prev => prev ? { ...prev, state: 'feedback' } : prev)}",
  ]) {
    assert.equal(countStr(appDlg, needle), 1, `the dialog keeps the exact updater ${needle.slice(0, 72)}…`);
  }
  // The AI Prompts view (which carries the settings-card opener) lives in
  // src/components/views/PromptsView.jsx — count the opener across the
  // App + view pair (union pin: App-side or view-side).
  assert.equal(countStr(app + '\n' + (view || ''), "onClick={() => setPromptUpdate({ key, state: 'feedback', feedback: '', skipCanaries: false, fineTuneFeedback: '', next: '', error: '' })}"), 1, 'the settings-card opener keeps the exact opening shape (App-side pre-T01, view-side after)');
  assert.equal(countStr(appDlg, 'checked={promptUpdate.skipCanaries === true}'), 1, 'the skip-canaries checkbox keeps its exact binding');
  assert.ok(appDlg.includes('disabled={vaultLocked && (vaultPassphraseSet ?? false)}'), 'the vault-lock gate stays on the AI rewrite buttons');
});

test('All user-visible prompt-dialog copy is preserved across the App ∪ dialog union (byte-identical through the T01 move)', () => {
  for (const needle of [
    'Rewriting the prompt…',
    'Fine-tuning the prompt…',
    'Could not update the prompt: ',
    'The model is rewriting the prompt based on your feedback…',
    'The model is fine-tuning the prompt with your additional instructions…',
    'Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.',
    'Re-run canaries',
    'Fine-tune with another AI pass',
    'Apply prompt',
    'Skip canary preview',
    'Canary preview (does this prompt still classify obvious cases correctly?)',
    'Previous prompt (read-only)',
    "New prompt (editable — the AI's updated version)",
    'Tell the model how this prompt should behave differently.',
  ]) {
    assert.ok(appDlg.includes(needle), `the dialog keeps "${needle}"`);
  }
});

test('App.jsx is net-smaller; the hook carries the moved orchestration', () => {
  const appLines = app.split('\n').length;
  const hookLines = hook.split('\n').length;
  assert.ok(appLines > 0, 'App.jsx readable');
  assert.ok(appLines < 2830, `App.jsx is net-smaller (landed ${appLines} lines)`);
  assert.ok(hookLines >= 110, `the hook carries the moved orchestration (landed ${hookLines} lines)`);
});

// ===========================================================================
// runPromptUpdate (hook body) — merge pass + canary injection positions
// ===========================================================================

test('RunPromptUpdate: closed dialog is a silent no-op (hook body)', async () => {
  const env = makeEnv();
  await run(env, 'runPromptUpdate')();
  assertNoCalls(env.__calls);
});

test('RunPromptUpdate: an in-flight merge is guarded (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'loading', feedback: 'f' }) });
  await run(env, 'runPromptUpdate')();
  assertNoCalls(env.__calls);
});

test('RunPromptUpdate: no configured judge toasts the exact message and never opens the merge (hook body)', async () => {
  const env = makeEnv({ buildJudge: () => null, initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f' }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['No AI model configured — set the AI Judge (or Test Generator) in Settings first.']]);
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'no state write without a judge');
  assert.deepEqual(named(env.__calls, 'mergePromptWithAI'), [], 'no merge without a judge');
});

test('RunPromptUpdate: the judge check precedes the feedback check (hook body)', async () => {
  const env = makeEnv({ buildJudge: () => null, initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: '   ' }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['No AI model configured — set the AI Judge (or Test Generator) in Settings first.']]);
});

test('RunPromptUpdate: blank feedback refuses with the exact toast (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: ' \t ' }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['Write some feedback first.']]);
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'no loading state on blank feedback');
});

test('RunPromptUpdate: success flips to loading first, then merges with the trimmed feedback (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('generator_system', { feedback: '  be stricter  ' }) });
  await run(env, 'runPromptUpdate')();
  const sets = named(env.__calls, 'setPromptUpdate').map(([s]) => s);
  assert.equal(sets.length, 2, 'loading write then preview write');
  assert.equal(sets[0].state, 'loading');
  const [judge, key, feedback] = named(env.__calls, 'mergePromptWithAI')[0];
  assert.equal(judge, env.__judge, 'the built judge is passed through');
  assert.equal(key, 'generator_system');
  assert.equal(feedback, 'be stricter', 'feedback is trimmed');
});

test('RunPromptUpdate: judge_system rewrite runs canaries on the bare candidate (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f' }), __canaries: CANARY_DIVERGED });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'REWRITTEN_PROMPT']], 'judge_system canaries: (judge, candidate)');
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.deepEqual(last, {
    ...OPEN_SHAPE('judge_system', { feedback: 'f' }),
    state: 'preview', next: 'REWRITTEN_PROMPT', rejected: null, canaries: CANARY_DIVERGED, canarySource: 'REWRITTEN_PROMPT',
    opId: 1, snapshot: SNAP('judge_system'),
  });
});

test('RunPromptUpdate: judge_user rewrite runs canaries with the current judge_system as system prompt (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_user', { feedback: 'f' }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'getPrompt'), [['judge_user'], ['judge_system'], ['judge_system']], 'the base and companion judge_system template are fetched');
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'PROMPT:judge_system', 'REWRITTEN_PROMPT']], 'judge_user canaries: (judge, system, candidate)');
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.state, 'preview');
  assert.equal(last.canarySource, 'REWRITTEN_PROMPT');
  assert.deepEqual(last.canaries, CANARY_OK);
});

test('RunPromptUpdate: skipCanaries=true skips the preview entirely (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f', skipCanaries: true }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [], 'no canary run when skipped');
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.canaries, null, 'canaries stay null');
  assert.equal(last.canarySource, 'REWRITTEN_PROMPT', 'canarySource still marks the candidate');
});

test('RunPromptUpdate: non-judge keys never run canaries (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('generator_system', { feedback: 'f' }) });
  await run(env, 'runPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [], 'no canary for generator keys');
  assert.deepEqual(named(env.__calls, 'getPrompt'), [['generator_system']], 'only the base generator prompt is fetched');
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.canaries, null);
});

test('RunPromptUpdate: a rejection reason is carried into the preview (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f' }), __mergeResult: { prompt: 'REWRITTEN_PROMPT', rejected: 'verdict-forcing detected' } });
  await run(env, 'runPromptUpdate')();
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.rejected, 'verdict-forcing detected');
});

test('RunPromptUpdate: a merge failure lands in state error with the redacted message (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f' }),
    mergePromptWithAI: async () => { throw new Error('sk-1234567890abcdef merge exploded'); },
  });
  await run(env, 'runPromptUpdate')();
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.state, 'error');
  assert.ok(last.error.includes('[REDACTED_KEY]'), 'api key redacted');
  assert.ok(last.error.includes('merge exploded'));
  assert.deepEqual(named(env.__calls, 'addToast'), [], 'no toast on the error path');
});

test('RunPromptUpdate: an error-less failure redacts to an empty message string (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'f' }),
    mergePromptWithAI: async () => { throw 'non-error throw'; },
  });
  await run(env, 'runPromptUpdate')();
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.state, 'error');
  assert.equal(last.error, redactSensitiveText(''), 'err?.message || "" feeds the redactor');
});

// ===========================================================================
// rerunPromptUpdateCanaries (hook body) — stale-canary bookkeeping
// ===========================================================================

test('RerunCanaries: closed dialog is a silent no-op (hook body)', async () => {
  const env = makeEnv();
  await run(env, 'rerunPromptUpdateCanaries')();
  assertNoCalls(env.__calls);
});

test('RerunCanaries: an in-flight rerun is guarded (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'p', rerunning: true }) });
  await run(env, 'rerunPromptUpdateCanaries')();
  assertNoCalls(env.__calls);
});

test('RerunCanaries: no judge toasts the exact message (hook body)', async () => {
  const env = makeEnv({ buildJudge: () => null, initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'p' }) });
  await run(env, 'rerunPromptUpdateCanaries')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['No AI Judge configured.']]);
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'no rerunning flag without a judge');
});

test('RerunCanaries: judge_user rerun injects the candidate as the user template and marks freshness (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_user', { state: 'preview', next: 'edited text', canaries: CANARY_DIVERGED, canarySource: 'original text' }),
    __canaries: CANARY_OK,
  });
  await run(env, 'rerunPromptUpdateCanaries')();
  const sets = named(env.__calls, 'setPromptUpdate').map(([s]) => s);
  assert.equal(sets[0].rerunning, true, 'rerunning flips first');
  assert.deepEqual(named(env.__calls, 'getPrompt'), [['judge_system']]);
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'PROMPT:judge_system', 'edited text']]);
  assert.equal(sets.length, 2, 'rerunning write then refresh write');
  assert.deepEqual(sets[1], { ...sets[1], rerunning: false, canaries: CANARY_OK, canarySource: 'edited text' }, 'canarySource = the exact text the canaries ran against');
});

test('RerunCanaries: non-judge keys rerun on the bare candidate (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('generator_system', { state: 'preview', next: 'edited text' }) });
  await run(env, 'rerunPromptUpdateCanaries')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'edited text']]);
  assert.deepEqual(named(env.__calls, 'getPrompt'), [], 'no judge_system fetch for generator keys');
});

// ===========================================================================
// refinePromptUpdate (hook body) — combined feedback, cleared then refreshed
// ===========================================================================

test('Refine: closed dialog is a silent no-op (hook body)', async () => {
  const env = makeEnv();
  await run(env, 'refinePromptUpdate')();
  assertNoCalls(env.__calls);
});

test('Refine: an in-flight refine is guarded (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'p', refining: true, feedback: 'f', fineTuneFeedback: 'more' }) });
  await run(env, 'refinePromptUpdate')();
  assertNoCalls(env.__calls);
});

test('Refine: no judge toasts the exact message (hook body)', async () => {
  const env = makeEnv({ buildJudge: () => null, initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', feedback: 'f', fineTuneFeedback: 'more' }) });
  await run(env, 'refinePromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['No AI model configured.']]);
});

test('Refine: blank fine-tune instructions refuse with the exact toast (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', feedback: 'f', fineTuneFeedback: '  ' }) });
  await run(env, 'refinePromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['Enter fine-tuning instructions.']]);
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'no refining state on blank fine-tune');
});

test('Refine: refining flips first, then merges the combined feedback (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('generator_system', { state: 'preview', next: 'OLD', feedback: 'original feedback', fineTuneFeedback: 'be stricter' }) });
  await run(env, 'refinePromptUpdate')();
  const sets = named(env.__calls, 'setPromptUpdate').map(([s]) => s);
  assert.equal(sets[0].state, 'refining');
  assert.equal(sets[0].refining, true);
  const [judge, key, feedback] = named(env.__calls, 'mergePromptWithAI')[0];
  assert.equal(judge, env.__judge);
  assert.equal(key, 'generator_system');
  assert.equal(feedback, 'original feedback\n\nAdditional fine-tuning: be stricter', 'combined feedback is exact');
});

test('Refine: success clears canaries/canarySource and resets fineTuneFeedback, THEN refreshes (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_user', {
      state: 'preview', next: 'OLD', feedback: 'original feedback', fineTuneFeedback: 'be stricter',
      canaries: CANARY_DIVERGED, canarySource: 'OLD',
    }),
    __canaries: CANARY_OK,
  });
  await run(env, 'refinePromptUpdate')();
  const sets = named(env.__calls, 'setPromptUpdate').map(([s]) => s);
  assert.equal(sets.length, 2, 'refining write then a single finalized preview write (canaries included — no unvalidated Apply window)');
  assert.equal(sets[0].state, 'refining');
  assert.equal(sets[0].refining, true);
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'PROMPT:judge_system', 'REWRITTEN_PROMPT']], 'judge_user refresh is 3-arg');
  const last = sets[1];
  assert.equal(last.state, 'preview');
  assert.equal(last.refining, false);
  assert.equal(last.next, 'REWRITTEN_PROMPT');
  assert.equal(last.rejected, null);
  assert.deepEqual(last.canaries, CANARY_OK, 'the refined candidate is only revealed with its canaries');
  assert.equal(last.canarySource, 'REWRITTEN_PROMPT');
  assert.equal(last.fineTuneFeedback, '');
});

test('Refine: judge_system refreshes with the 2-arg canary injection (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'OLD', feedback: 'f', fineTuneFeedback: 'more' }) });
  await run(env, 'refinePromptUpdate')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [[env.__judge, 'REWRITTEN_PROMPT']]);
  assert.deepEqual(named(env.__calls, 'getPrompt'), [['judge_system']], 'only the base system prompt is fetched');
});

for (const key of ['propose_system', 'assess_system', 'analyzer_system', 'generator_system', 'critic_system']) {
  test(`refine: ${key} clears old canaries without running judge checks`, async () => {
    const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE(key, {
      state: 'preview', next: 'OLD', feedback: 'f', fineTuneFeedback: 'more',
      canaries: CANARY_DIVERGED, canarySource: 'OLD',
    }) });
    await run(env, 'refinePromptUpdate')();
    assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), []);
    assert.deepEqual(named(env.__calls, 'getPrompt'), [[key]], 'only the base prompt is fetched for a non-judge key');
    assert.equal(env.promptUpdate.next, 'REWRITTEN_PROMPT');
    assert.equal(env.promptUpdate.state, 'preview');
    assert.equal(env.promptUpdate.canaries, null);
    assert.equal(env.promptUpdate.canarySource, null);
    assert.equal(env.promptUpdate.fineTuneFeedback, '');
  });
}

test('Refine: skipCanaries=true keeps the preview cleared (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'OLD', feedback: 'f', fineTuneFeedback: 'more', skipCanaries: true }),
  });
  await run(env, 'refinePromptUpdate')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [], 'no canary run when skipped');
  const sets = named(env.__calls, 'setPromptUpdate').map(([s]) => s);
  assert.equal(sets.length, 2, 'refining write then finalize write only');
  assert.equal(sets[1].canaries, null);
  assert.equal(sets[1].canarySource, null);
  assert.equal(sets[1].fineTuneFeedback, '');
});

test('Refine: a refine failure lands back in state preview (NOT error) with the redacted message (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'OLD', feedback: 'f', fineTuneFeedback: 'more', canaries: CANARY_OK, canarySource: 'OLD' }),
    mergePromptWithAI: async () => { throw new Error('sk-1234567890abcdef refine exploded'); },
  });
  await run(env, 'refinePromptUpdate')();
  const last = named(env.__calls, 'setPromptUpdate').slice(-1)[0][0];
  assert.equal(last.state, 'preview', 'the refine error path keeps the preview open');
  assert.equal(last.refining, false);
  assert.ok(last.error.includes('[REDACTED_KEY]'));
  assert.ok(last.error.includes('refine exploded'));
  assert.equal(last.next, 'OLD', 'the previous preview text is untouched');
  assert.deepEqual(last.canaries, CANARY_OK, 'the previous canaries are untouched');
  assert.deepEqual(named(env.__calls, 'addToast'), [], 'no toast on the refine error path');
});

// ===========================================================================
// applyPromptUpdate (hook body) — gate + setPrompt + promptDraft + toast
// ===========================================================================

test('Apply: closed dialog is a silent no-op (hook body)', async () => {
  const env = makeEnv();
  await run(env, 'applyPromptUpdate')();
  assertNoCalls(env.__calls);
});

test('Apply: an empty prompt refuses with the exact toast; the gate never runs (hook body)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: '   ' }) });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'addToast'), [['The prompt cannot be empty.']]);
  assert.deepEqual(named(env.__calls, 'confirmJudgeRewriteApply'), [], 'no gate on an empty prompt');
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'dialog stays open');
});

test('Apply: the gate receives the TRIMMED next text plus the canaries and their source (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: '  raw text  ', canaries: CANARY_DIVERGED, canarySource: 'source text', snapshot: SNAP('judge_system') }),
    __confirmAnswer: true,
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'confirmJudgeRewriteApply'), [['raw text', CANARY_DIVERGED, 'source text']], 'gate sees the trimmed text that will be persisted');
});

test('Apply: a declined gate persists nothing and keeps the dialog open (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_DIVERGED, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __confirmAnswer: false,
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [], 'no prompt write when declined');
  assert.deepEqual(named(env.__calls, 'setPromptDraft'), [], 'no draft write when declined');
  assert.equal(named(env.__calls, 'setPromptUpdate').length, 0, 'dialog stays open');
  assert.deepEqual(named(env.__calls, 'addToast'), [], 'no toast when declined');
});

test('Apply: a clean apply writes the TRIMMED prompt, syncs the draft map, closes and toasts success (hook body)', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: '  my prompt  ', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __confirmAnswer: true,
  });
  await run(env, 'applyPromptUpdate')();
  const order = env.__calls.map(([n]) => n);
  assert.deepEqual(order, ['getPrompt', 'confirmJudgeRewriteApply', 'setPrompt', 'setPromptDraft', 'setPromptUpdate', 'addToast'], 'apply order is exact');
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']], 'the trimmed text is persisted');
  const [draftUpdater] = named(env.__calls, 'setPromptDraft');
  assert.equal(typeof draftUpdater[0], 'function', 'the draft is updated through an updater');
  assert.deepEqual(draftUpdater[0]({ other: 'x' }), { other: 'x', judge_system: 'my prompt' }, 'the updater keys the trimmed text under the prompt key');
  assert.deepEqual(env.__draft(), { judge_system: 'my prompt' });
  assert.deepEqual(named(env.__calls, 'setPromptUpdate'), [[null]], 'the dialog closes');
  assert.deepEqual(named(env.__calls, 'addToast'), [['Prompt updated with your feedback.', 'success']]);
});

test('Apply (real gate): a fresh, non-diverged preview applies without any confirm (hook + T06 gate)', async () => {
  const env = withRealGate(makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
  }));
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'askConfirm'), [], 'no confirmation when the gate is clean');
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']]);
  assert.deepEqual(named(env.__calls, 'addToast'), [['Prompt updated with your feedback.', 'success']]);
});

test('Apply (real gate): a diverged preview asks the exact confirm copy; declining persists nothing', async () => {
  const declined = withRealGate(makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_DIVERGED, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __askConfirmAnswer: false,
  }));
  await run(declined, 'applyPromptUpdate')();
  assert.deepEqual(named(declined.__calls, 'askConfirm'), [[
    'the canary preview diverged for: Secure refusal.\n\nThis updated judge prompt may be forcing (or biasing) verdicts toward a fixed outcome. Apply it anyway?',
  ]]);
  assert.deepEqual(named(declined.__calls, 'setPrompt'), [], 'a declined confirm never applies');

  const accepted = withRealGate(makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_DIVERGED, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __askConfirmAnswer: true,
  }));
  await run(accepted, 'applyPromptUpdate')();
  assert.deepEqual(named(accepted.__calls, 'setPrompt'), [['judge_system', 'my prompt']], 'an accepted confirm applies');
});

test('Apply (real gate): a stale AND diverged preview joins both problems in the confirm copy', async () => {
  const env = withRealGate(makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'edited text', canaries: CANARY_DIVERGED, canarySource: 'original text', snapshot: SNAP('judge_system') }),
    __askConfirmAnswer: false,
  }));
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'askConfirm'), [[
    'the canary preview is stale (the prompt was edited after it ran) and the canary preview diverged for: Secure refusal.\n\nThis updated judge prompt may be forcing (or biasing) verdicts toward a fixed outcome. Apply it anyway?',
  ]]);
});

// ===========================================================================
// Race matrix — durable evidence for operation-identity guards
// ===========================================================================

test('Race A: a late in-flight result cannot replace a newer operation (opId supersession)', async () => {
  const env = makeEnv({ initialPromptUpdate: OPEN_SHAPE('judge_system', { feedback: 'A feedback' }) });
  const dA = deferred();
  const dB = deferred();
  const merges = [dA, dB];
  env.mergePromptWithAI = async () => (merges.shift() || deferred()).promise;
  const runOp = run(env, 'runPromptUpdate');

  const pa = runOp();
  // Close A and open a different-key B, then run it before A resolves.
  env.setPromptUpdate(OPEN_SHAPE('generator_system', { feedback: 'B feedback' }));
  const pb = runOp();

  dB.resolve({ prompt: 'B_RESULT', rejected: null });
  await pb;
  dA.resolve({ prompt: 'A_RESULT', rejected: null });
  await pa;

  assert.equal(env.promptUpdate.key, 'generator_system', 'the dialog stays on B');
  assert.equal(env.promptUpdate.next, 'B_RESULT', 'A\'s late result must not replace B\'s candidate');
});

test('Race B: a candidate whose base prompt changed is rejected as stale at Apply', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __getPromptValue: 'CHANGED BASE',
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [], 'a stale base must never persist');
  assert.deepEqual(named(env.__calls, 'addToast'), [['This update is stale — the prompt or AI configuration changed after it was generated. Re-run the update to review fresh results.', 'error']]);
});

test('Race C: a result for a different target key is rejected as stale at Apply', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('generator_system') }),
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [], 'a mismatched target key must never persist');
  assert.equal(named(env.__calls, 'addToast').length, 1);
});

test('Race D: a candidate produced under a different provider/model is rejected as stale at Apply', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    buildJudge: () => ({ provider: 'p2', model: 'm2', apiKey: 'sk-test', endpoint: 'http://127.0.0.1:9999/v1', rpm: 0 }),
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [], 'a changed provider/model must never persist');
});

test('Race F: a persistence failure never reports success and keeps the dialog open', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
    __setPromptResult: false,
  });
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']], 'the write is attempted');
  assert.deepEqual(named(env.__calls, 'setPromptUpdate'), [], 'the dialog stays open on failure');
  assert.deepEqual(named(env.__calls, 'addToast'), [['The prompt could not be saved.', 'error']]);
  assert.deepEqual(named(env.__calls, 'setPromptDraft'), [], 'no draft sync on a failed write');
});

test('Race G: an unrelated state change (no identity change) does not invalidate the candidate', async () => {
  const env = withRealGate(makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'my prompt', canaries: CANARY_OK, canarySource: 'my prompt', snapshot: SNAP('judge_system') }),
  }));
  await run(env, 'applyPromptUpdate')();
  assert.deepEqual(named(env.__calls, 'setPrompt'), [['judge_system', 'my prompt']], 'unchanged identity persists normally');
});

test('Race E: canaries cannot be rerun under a changed provider/model', async () => {
  const env = makeEnv({
    initialPromptUpdate: OPEN_SHAPE('judge_system', { state: 'preview', next: 'text', snapshot: SNAP('judge_system') }),
    buildJudge: () => ({ provider: 'p2', model: 'm2', apiKey: 'sk-test', endpoint: 'http://127.0.0.1:9999/v1', rpm: 0 }),
  });
  await run(env, 'rerunPromptUpdateCanaries')();
  assert.deepEqual(named(env.__calls, 'runJudgeCanaries'), [], 'no canary run under a mismatched config');
  assert.deepEqual(named(env.__calls, 'addToast'), [['The AI configuration changed — re-run the update to review fresh results.', 'error']]);
});
