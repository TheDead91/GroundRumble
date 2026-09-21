// Contract: the AI Judge feedback-merge dialog lives in
// src/components/modals/JudgeMergeDialog.jsx as a presentation-only component
// fed by the useJudgeMerge hook API — props in, events out, ZERO internal
// state (the hook owns the whole machine; the module owns pixels). App.jsx
// keeps the hook binding (including setJudgeMerge, which the dialog consumes
// for its two editable textareas) and the handleResultOverride entry delegate,
// and mounts <JudgeMergeDialog /> unconditionally. The judgeMerge gate lives
// module-side (`if (!judgeMerge) return null;` — the module is hook-free, so
// an unconditional App mount keeps hook order trivially stable while the
// dialog stays gated on judgeMerge presence).
//
// handleResultOverride (including the `openMergeWithFeedback(r,
// explanation.trim());` entry delegate this test counts) may live in
// src/hooks/useAuditDetail.js. The delegate count resolves at the App ∪
// useAuditDetail union (the hook read is tolerant — when absent, the union
// degrades to App alone). Exactly-once preserved; the hook's deps bag carries
// openMergeWithFeedback from App, so the delegate line lives byte-identical
// hook-side.
//
// Mixed levels: source-text pins (Node cannot import JSX/extensionless
// specifiers under bare node:test) for the module shape, the structural parity
// of the dialog JSX and the App wiring, plus a rolldown/jsdom runtime section
// that mounts the REAL module and drives every state branch and interaction
// (same technique as tests/bulk-import-modal.contract.test.mjs). The runtime
// bundle stubs the utils/prompts specifier with a deterministic verdict-token
// kernel (the real kernel is pinned by tests/shared-helpers.unit.test.mjs) so
// the dialog bundle stays hermetic and small. Hermetic: no dev server, no
// network, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIALOG_PATH = 'src/components/modals/JudgeMergeDialog.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
// Independent reads: a missing TARGET module must not blank the other
// sources (absence-only pins would otherwise pass vacuously).
const readOrEmpty = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
const dialog = readOrEmpty(DIALOG_PATH);
const canary = readOrEmpty('src/components/modals/CanaryPreview.jsx');
const app = readOrEmpty('src/App.jsx');
const workspace = readOrEmpty('src/components/views/prompts/PromptWorkspace.jsx');
const promptDialog = readOrEmpty('src/components/modals/PromptUpdateDialog.jsx');
const workspaceLanded = /export (?:default )?function PromptWorkspace\(\{/.test(workspace);
// The audit-detail glue (incl. handleResultOverride's delegate) resolves
// across App ∪ src/hooks/useAuditDetail.js.
const auditHook = readOrEmpty('src/hooks/useAuditDetail.js');
const appAudit = app + '\n' + auditHook;

const countIn = (source, needle) => source.split(needle).length - 1;
const norm = (text) => text.replace(/\s+/g, ' ').trim();
const lineCount = (source) => source.replace(/\r\n/g, '\n').trimEnd().split('\n').length;

// The module's JSX region: from the component return to EOF.
const jsxNorm = () => norm(dialog.slice(dialog.indexOf('  return (')));

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

// ---------------------------------------------------------------------------
// The module contract — presentation-only, props-in/events-out from the hook API
// ---------------------------------------------------------------------------

test('Module header — default-export contract is exactly the useJudgeMerge hook API + the history array', () => {
  assert.ok(dialog.length > 0, 'precondition: the module exists (this absence-only gate must never pass vacuously)');
  assert.equal(countIn(dialog, 'export default function JudgeMergeDialog('), 1, 'the module carries exactly one default export');
  assert.ok(
    dialog.includes('export default function JudgeMergeDialog({ judgeMerge, setJudgeMerge, closeJudgeMerge, applyJudgeMerge, applyJudgeMergeAndReevaluate, rerunJudgeEvaluation, rerunJudgeCanaries, refineJudgeMerge, history }) {'),
    'the props-in contract is exactly { judgeMerge, setJudgeMerge, closeJudgeMerge, applyJudgeMerge, applyJudgeMergeAndReevaluate, rerunJudgeEvaluation, rerunJudgeCanaries, refineJudgeMerge, history }'
  );
});

test('Presentation-only — zero hooks, zero context reach, zero network/persistence; the two content imports move with the JSX', () => {
  assert.ok(dialog.length > 0, 'precondition: the module exists');
  assert.doesNotMatch(dialog, /\buse(State|Effect|Ref|Memo|Callback|Context)\b/, 'the module declares NO react hooks (no local logic beyond presentation)');
  for (const hook of ['useJudgeMerge(', 'useUI(', 'useHistory(', 'useTests(', 'useSettings(', 'useAIGen(', 'useProviders(']) {
    assert.ok(!dialog.includes(hook), `the module takes everything via props — no ${hook} context/hook reach`);
  }
  assert.ok(!/\bfetch\(/.test(dialog) && !dialog.includes('localStorage'), 'the module performs no I/O of its own');
  assert.equal(
    countIn(dialog, "import { X, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';"),
    1,
    'the icon set moves with the JSX (X, RefreshCw, AlertTriangle, ShieldCheck)'
  );
  assert.equal(
    countIn(dialog, "import { extractVerdictTokens } from '../../utils/prompts';"),
    1,
    'the verdict-token kernel is consumed from utils/prompts, dialog-side, exactly once'
  );
});

test('The judgeMerge gate lives module-side (`if (!judgeMerge) return null;`) before the JSX — the App mount stays unconditional', () => {
  assert.ok(dialog.length > 0, 'precondition: the module exists');
  const guard = dialog.indexOf('if (!judgeMerge) return null;');
  assert.ok(guard > 0, 'the module carries the `if (!judgeMerge) return null;` guard');
  const jsx = dialog.indexOf('  return (');
  assert.ok(jsx > guard, 'the JSX return sits after the guard');
  assert.equal(countIn(dialog, '\n  if (!judgeMerge) return null;'), 1, 'exactly one gate at component-body indent (no other null-returning branch)');
});

// ---------------------------------------------------------------------------
// Structural parity — every constant locked against the module body as
// ordered normalized needles
// ---------------------------------------------------------------------------

test('Dialog shell — fixed overlay on layer 142, 760px glass card, state-driven title, X close via closeJudgeMerge', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.shell', [
    "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 142,",
    "background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',",
    "maxWidth: '760px', maxHeight: '86vh',",
    "{judgeMerge.state === 'loading' ? 'Updating the AI Judge reasoning…' : judgeMerge.state === 'refining' ? 'Fine-tuning the AI Judge prompt…' : 'Review the updated AI Judge prompt'}",
    '<X size={14} />',
  ]);
  assert.equal(countIn(m, 'zIndex: 142,'), 1, 'the overlay keeps its layering slot (142) exactly once');
  assert.equal(countIn(m, 'onClick={closeJudgeMerge}'), 2, 'exactly two close affordances (header X + footer Cancel), both via the closeJudgeMerge event');
});

test('Loading / error / reevaluating / refining branches — exact copy and progress plumbing', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.branches', [
    "{judgeMerge.state === 'loading' && (",
    'The AI Judge is merging your feedback into its evaluation prompt and re-evaluating this result…',
    "{judgeMerge.state === 'error' && (",
    'Could not update the AI Judge prompt: {judgeMerge.error}',
    "{judgeMerge.state === 'reevaluating' && (",
    'Re-evaluating all model responses with new prompt…',
    '{judgeMerge.reevaluationProgress && (',
    '<span>Progress</span>',
    '{judgeMerge.reevaluationProgress.current} / {judgeMerge.reevaluationProgress.total}',
    'Math.round((judgeMerge.reevaluationProgress.current / judgeMerge.reevaluationProgress.total) * 100)}%',
    '{judgeMerge.reevaluationError && (',
    'Error: {judgeMerge.reevaluationError}',
    "{judgeMerge.state === 'refining' && (",
    'The AI Judge is fine-tuning the prompt with your additional instructions…',
    "{judgeMerge.state === 'ready' && (",
  ]);
});

test('Ready branch — previous/new textareas keep the exact monospace contract and emit through the setJudgeMerge prop', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.textareas', [
    '<label className="form-label">Previous prompt (read-only)</label>',
    'readOnly',
    'value={judgeMerge.previous}',
    'rows={6}',
    'spellCheck={false}',
    'value={judgeMerge.next}',
    'onChange={(e) => setJudgeMerge(prev => prev ? { ...prev, next: e.target.value } : prev)}',
    'rows={8}',
    "fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'",
  ]);
  assert.equal(countIn(m, 'onChange={(e) => setJudgeMerge(prev => prev ? { ...prev, next: e.target.value } : prev)}'), 1, 'exactly one next-prompt updater, emitted via the prop');
  assert.equal(countIn(m, 'onChange={(e) => setJudgeMerge(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}'), 1, 'exactly one fine-tune-feedback updater, emitted via the prop');
});

test('Verdict-token chips — the kernel runs on the live next text with a chips-only-when-detected ternary', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.chips', [
    'const tokens = extractVerdictTokens(judgeMerge.next);',
    'return tokens.length > 0 ? (',
    'Verdict language detected:',
    '{tokens.map(t => (',
    '<span key={t}',
    'fontWeight: 500 }}>{t}</span>',
    ') : null;',
  ]);
  assert.equal(countIn(m, 'extractVerdictTokens(judgeMerge.next)'), 1, 'the kernel is consulted exactly once, on the live next-prompt text');
});

test('Rejected banner + untrusted-evidence notice — exact copy, ordered before the evaluation panel', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.notices', [
    '{judgeMerge.rejected && (',
    '<AlertTriangle size={14} style={{ flexShrink: 0, marginTop: \'2px\' }} />',
    '<span>{judgeMerge.rejected}</span>',
    '<ShieldCheck size={14} style={{ flexShrink: 0, marginTop: \'2px\' }} color="var(--color-secondary)" />',
    'The test case and the target model response were treated as <strong>untrusted evidence</strong>, and this rewrite was scanned for instructions that would force a fixed verdict. If a verdict-forcing rewrite was detected it is flagged above — the text is still editable and you may apply it, but only as a conscious decision. Review before applying.',
  ]);
});

test('Re-evaluation panel — label, re-run button with evaluating ternary, three-way evaluation display', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.evaluation', [
    'New evaluation with this prompt',
    'onClick={rerunJudgeEvaluation}',
    'disabled={judgeMerge.evaluating}',
    "{judgeMerge.evaluating ? <><RefreshCw size={11} className=\"animate-spin-custom\" style={{ marginRight: '6px' }} /> Re-evaluating…</> : 'Re-run evaluation'}",
    'The AI Judge is re-evaluating with the current prompt…',
    ') : judgeMerge.evaluation ? (',
    "judgeMerge.evaluation.status === 'SECURE' ? 'badge-secure' : 'badge-vulnerable'",
    '{judgeMerge.evaluation.status}',
    'verdict with the proposed prompt',
    '{judgeMerge.evaluation.reasoning}',
    "{judgeMerge.evalError ? `Evaluation failed: ${judgeMerge.evalError}` : 'No evaluation available.'}",
  ]);
});

test('Canary panel — stale detection (opacity + banner), re-run button with rerunning ternary, per-canary expected/got badge ladder', () => {
  const m = norm(canary || dialog);
  if (canary) {
    ordered(jsxNorm(), 'dialog.ready.canary-delegate', [
      '<CanaryPreview',
      'canaries={judgeMerge.canaries}',
      'canarySource={judgeMerge.canarySource}',
      'prompt={judgeMerge.next}',
      'rerunning={judgeMerge.rerunning}',
      'onRerun={rerunJudgeCanaries}',
    ]);
  }
  ordered(m, 'dialog.ready.canaries', [
    'Canary preview (does this prompt still classify obvious cases correctly?)',
    canary ? 'onClick={onRerun}' : 'onClick={rerunJudgeCanaries}',
    canary ? 'disabled={rerunning}' : 'disabled={judgeMerge.rerunning}',
    'Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.',
    canary ? '{canaries.map((c) => (' : '{judgeMerge.canaries.map((c) => (',
    "{c.diverged ? '✗' : '✓'}",
    '{c.name} — expected',
    "{c.expected === 'SECURE' ? 'badge-secure' : c.expected === 'VULNERABLE' ? 'badge-vulnerable' : ''}",
    '<span style={{ color: \'var(--text-muted)\' }}>got</span>',
    "{c.status === 'SECURE' ? 'badge-secure' : c.status === 'VULNERABLE' ? 'badge-vulnerable' : ''}",
    '{c.diverged && <span style={{ color: \'var(--color-vulnerable)\' }}>diverged</span>}',
  ]);
});

test('Fine-tune box — label, bound textarea with the exact placeholder, refine button with refining ternary', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.fine-tune', [
    'Fine-tune with another AI pass',
    'value={judgeMerge.fineTuneFeedback || \'\'}',
    'placeholder="e.g. Be stricter about ambiguous refusals, keep the reasoning concise…"',
    'rows={2}',
    'className="prompt-editor"',
    'onClick={refineJudgeMerge}',
    'disabled={judgeMerge.refining}',
    "{judgeMerge.refining ? <><RefreshCw size={11} className=\"animate-spin-custom\" style={{ marginRight: '6px' }} /> Fine-tuning…</> : 'Fine-tune with another AI pass'}",
  ]);
});

test('Footer — Cancel / Apply prompt / Apply prompt and re-evaluate all models with the disabled={!history.length} gate', () => {
  const m = jsxNorm();
  ordered(m, 'dialog.ready.footer', [
    '<button onClick={closeJudgeMerge} className="btn-secondary">Cancel</button>',
    '<button onClick={applyJudgeMerge} className="btn-primary">',
    'Apply prompt',
    '<button onClick={applyJudgeMergeAndReevaluate} className="btn-primary" disabled={!history.length}>',
    'Apply prompt and re-evaluate all models',
  ]);
  assert.equal(countIn(m, 'disabled={!history.length}'), 1, 'the re-evaluate-all gate keeps its byte-exact expression on the history prop');
});

// ---------------------------------------------------------------------------
// The App wiring — App sheds the inline dialog, keeps the hook binding and
// mounts the module
// ---------------------------------------------------------------------------

test('App sheds the inline dialog — zero dialog JSX, zero dialog copy strings, zero inline gate', () => {
  assert.ok(dialog.length > 0, 'precondition: the module exists (this absence-only gate must never pass vacuously)');
  for (const copy of [
    // NOTE: the sibling prompt-update dialog shares three labels with this
    // dialog ('Previous prompt (read-only)', the 'Canary preview (…)' header
    // and 'Fine-tune with another AI pass'), so those are NOT shed-pinnable —
    // they are locked dialog-side by the structural pins instead.
    'Review the updated AI Judge prompt',
    'Could not update the AI Judge prompt',
    'The AI Judge is merging your feedback',
    'Re-evaluating all model responses with new prompt',
    'The AI Judge is fine-tuning the prompt with your additional instructions',
    'New prompt (editable — the AI Judge\'s updated reasoning)',
    'Verdict language detected',
    'New evaluation with this prompt',
    'Apply prompt and re-evaluate all models',
    'untrusted evidence',
  ]) {
    assert.equal(countIn(app, copy), 0, `App sheds the dialog copy ${JSON.stringify(copy)}`);
  }
  assert.equal(countIn(app, '{judgeMerge && ('), 0, 'the inline gated JSX region is gone from App');
  assert.equal(countIn(app, 'extractVerdictTokens'), 0, 'App sheds the verdict-token kernel import (consumed dialog-side now)');
});

test('App keeps the hook binding (setJudgeMerge included — the dialog needs it) and the handleResultOverride entry delegate', () => {
  assert.equal(countIn(app, 'useJudgeMerge({ historyRef, replaceAuditHistory, buildJudge, judgeConfig, askConfirm, addToast, getPromptOverrides, DEFAULT_PROMPTS })'), 1, 'the hook stays instantiated in App with its exact deps object');
  for (const name of ['judgeMerge', 'setJudgeMerge', 'closeJudgeMerge', 'applyJudgeMerge', 'applyJudgeMergeAndReevaluate', 'rerunJudgeEvaluation', 'rerunJudgeCanaries', 'refineJudgeMerge', 'openMergeWithFeedback']) {
    assert.equal(countIn(app, `\n    ${name},`), 1, `the hook binding keeps destructuring ${name}`);
  }
  assert.equal(countIn(appAudit, 'openMergeWithFeedback(r, choice.reason);'), 1, "EAT-001 retains the established Judge-feedback entry delegate");
});

test('App mounts <JudgeMergeDialog /> exactly once, unconditionally, with the exact nine-contract props', () => {
  assert.equal(countIn(app, "import JudgeMergeDialog from './components/modals/JudgeMergeDialog';"), 1, 'the dialog is imported exactly once');
  assert.equal(countIn(app, '<JudgeMergeDialog'), 1, 'exactly one mount site');
  const start = app.indexOf('<JudgeMergeDialog');
  const block = norm(app.slice(start, app.indexOf('/>', start) + 2));
  assert.equal(
    block,
    '<JudgeMergeDialog judgeMerge={judgeMerge} setJudgeMerge={setJudgeMerge} closeJudgeMerge={closeJudgeMerge} applyJudgeMerge={applyJudgeMerge} applyJudgeMergeAndReevaluate={applyJudgeMergeAndReevaluate} rerunJudgeEvaluation={rerunJudgeEvaluation} rerunJudgeCanaries={rerunJudgeCanaries} refineJudgeMerge={refineJudgeMerge} history={history} />',
    'the mount wires exactly the nine-contract props (hook API + history)'
  );
  if (workspaceLanded) {
    assert.equal(countIn(app, '<JudgeMergeDialog'), 1, 'App retains exactly one JudgeMergeDialog mount');
    assert.equal(countIn(workspace, '<PromptUpdateDialog'), 1, 'the workspace owns exactly one PromptUpdateDialog mount');
    assert.equal(countIn(app, '<PromptUpdateDialog'), 0, 'App has no direct PromptUpdateDialog mount');
    assert.equal(countIn(dialog, 'zIndex: 142,'), 1, 'JudgeMergeDialog remains on layer 142');
    assert.equal(countIn(promptDialog, 'zIndex: 143,'), 1, 'PromptUpdateDialog remains above it on layer 143');
  } else {
    const promptUpdateRegion = app.indexOf('{/* 8. AI PROMPT UPDATE DIALOG');
    assert.ok(promptUpdateRegion > start, 'the mount sits at the former judge-merge region (before the prompt-update dialog)');
  }
  assert.ok(lineCount(app) < 2499, `App.jsx is strictly net-smaller than the 2499-line baseline (got ${lineCount(app)})`);
});

// ---------------------------------------------------------------------------
// Runtime: the REAL module bundled under rolldown and driven in jsdom —
// every state branch, both editable textareas (functional setJudgeMerge
// updaters), the verdict chips, the three-way evaluation display, the stale
// canary detection, the fine-tune box, and the full footer dispatch including
// the disabled={!history.length} gate. The utils/prompts specifier is stubbed
// at bundle time with a deterministic kernel twin (the REAL kernel is pinned
// by tests/shared-helpers.unit.test.mjs).
// ---------------------------------------------------------------------------

const STUB_SPECIFIER = '../../utils/prompts';

let dialogBundle = null;
let dialogBundleError = null;
try {
  const { rolldown } = await import('rolldown');
  const dir = join(root, '.tmp', 't16-dialog-bundle');
  mkdirSync(dir, { recursive: true });
  const stubAbs = join(dir, 'prompts-stub.mjs').split(sep).join('/');
  writeFileSync(stubAbs, [
    "// Deterministic twin of utils/prompts extractVerdictTokens for the runtime",
    "// section only: same first-seen-order, case-insensitive-dedupe contract for",
    "// the verdict tokens the dialog chips render.",
    'const VERDICT_RE = /SECURE|VULNERABLE|INCONCLUSIVE/g;',
    'export const extractVerdictTokens = (text) => {',
    '  if (text == null || text === \'\') return [];',
    '  const seen = new Set();',
    '  for (const m of String(text).matchAll(VERDICT_RE)) if (!seen.has(m[0])) seen.add(m[0]);',
    '  return [...seen];',
    '};',
    '',
  ].join('\n'));
  // Patch the module's prompts specifier onto the stub (the source-level pin
  // guarantees the exact specifier this replace targets). The extracted
  // preview also needs an absolute path because this patched copy lives in .tmp.
  const patchedAbs = join(dir, 'dialog-patched.jsx').split(sep).join('/');
  const canaryAbs = join(root, 'src/components/modals/CanaryPreview.jsx').split(sep).join('/');
  writeFileSync(patchedAbs, dialog.replace(STUB_SPECIFIER, stubAbs).replace('./CanaryPreview', canaryAbs));
  const entry = join(dir, 'entry.mjs');
  writeFileSync(entry, `import JudgeMergeDialog from '${patchedAbs}';\nexport default JudgeMergeDialog;\n`);
  const bundle = await rolldown({
    input: entry,
    external: [/^react(-dom)?(\/|$)/, /^lucide-react$/],
    resolve: { extensions: ['.jsx', '.js', '.mjs'] },
    moduleTypes: { '.jsx': 'jsx' },
    transform: { jsx: { runtime: 'automatic' } }
  });
  const { output } = await bundle.generate({ format: 'esm', exports: 'named', codeSplitting: false });
  const bundlePath = join(dir, 'dialog-bundle.mjs');
  writeFileSync(bundlePath, output[0].code);
  await bundle.close();
  dialogBundle = await import(pathToFileURL(bundlePath).href);
} catch (err) {
  dialogBundleError = err;
}

const setupDom = async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:4173/' });
  for (const k of ['window', 'document', 'HTMLElement', 'Node', 'Element', 'getComputedStyle']) {
    globalThis[k] = dom.window[k];
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
};

// A ready-state judgeMerge fixture the runtime tests mutate per scenario.
const readyMerge = (over = {}) => ({
  state: 'ready', previous: 'PREV-PROMPT-TEXT', next: 'NEXT-PROMPT-TEXT', rejected: null,
  evaluating: false, evaluation: null, evalError: null,
  canaries: null, canarySource: null, rerunning: false,
  fineTuneFeedback: '', refining: false,
  reevaluationProgress: null, reevaluationError: null, error: null,
  ...over,
});

// Mounts the REAL bundled module with a faithful mini-Host: judgeMerge state +
// the exact functional-updater semantics the hook's setJudgeMerge exposes,
// every event recorded in `log`. Returns the handles the scenarios need.
const mountDialog = async (initialJudgeMerge, history) => {
  const dom = await setupDom();
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const JudgeMergeDialog = dialogBundle.default;

  const log = { close: 0, apply: 0, applyAndReeval: 0, rerunEval: 0, rerunCanaries: 0, refine: 0, setJudgeMerge: 0 };
  let setMergeRef = null;
  /* oxlint-disable react/globals, react/immutability -- node:test harness: captures the setter + mutates the log sink outside a real React tree */
  function Host() {
    const [judgeMerge, setJudgeMerge] = React.useState(initialJudgeMerge);
    setMergeRef = setJudgeMerge;
    return React.createElement(JudgeMergeDialog, {
      judgeMerge,
      setJudgeMerge: (updater) => { log.setJudgeMerge += 1; setJudgeMerge((prev) => (typeof updater === 'function' ? updater(prev) : updater)); },
      closeJudgeMerge: () => { log.close += 1; setJudgeMerge(null); },
      applyJudgeMerge: () => { log.apply += 1; },
      applyJudgeMergeAndReevaluate: () => { log.applyAndReeval += 1; },
      rerunJudgeEvaluation: () => { log.rerunEval += 1; },
      rerunJudgeCanaries: () => { log.rerunCanaries += 1; },
      refineJudgeMerge: () => { log.refine += 1; },
      history,
    });
  }
  /* oxlint-enable react/globals, react/immutability */

  let container;
  await act(async () => {
    container = document.getElementById('root');
    createRoot(container).render(React.createElement(Host));
    await new Promise((r) => setTimeout(r, 50));
  });
  return { dom, act, container, log, setMergeRef };
};

const typeInto = async (dom, act, el, text) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, text);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};

test('Runtime: judgeMerge=null renders null (the unconditional App mount stays gated on judgeMerge presence)', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const { container } = await mountDialog(null, []);
  assert.equal(container.textContent, '', 'the gated-off dialog renders null');
});

test('Runtime: loading / error / reevaluating / refining branches — byte-exact copy, progress interpolation, width math, error passthrough', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);

  // loading: title flips, the merging copy renders, the footer does not exist yet.
  let h = await mountDialog({ state: 'loading' }, []);
  assert.ok(h.container.textContent.includes('Updating the AI Judge reasoning…'), 'the loading title renders');
  assert.ok(h.container.textContent.includes('The AI Judge is merging your feedback into its evaluation prompt and re-evaluating this result…'), 'the loading copy renders byte-exact');
  assert.ok(!h.container.textContent.includes('Apply prompt'), 'no footer in the loading state');

  // error: the message passes through the banner.
  h = await mountDialog({ state: 'error', error: 'judge exploded' }, []);
  assert.ok(h.container.textContent.includes('Could not update the AI Judge prompt: judge exploded'), 'the error banner interpolates judgeMerge.error verbatim');

  // reevaluating: header copy, Progress label, current/total interpolation,
  // the width percentage math, and the reevaluationError passthrough.
  h = await mountDialog({ state: 'reevaluating', reevaluationProgress: { current: 2, total: 5 }, reevaluationError: 'partial failure' }, []);
  const text = h.container.textContent;
  assert.ok(text.includes('Re-evaluating all model responses with new prompt…'), 'the reevaluating copy renders');
  assert.ok(text.includes('Progress') && text.includes('2 / 5'), 'the progress counter interpolates current/total');
  const bar = [...h.container.querySelectorAll('div')].find((d) => d.style.width.includes('%') && d.style.width !== '100%');
  assert.ok(bar && bar.style.width === '40%', 'the progress bar width is Math.round(current/total*100)% = 40%');
  assert.ok(text.includes('Error: partial failure'), 'the reevaluationError passes through');

  // refining: the fine-tuning copy renders.
  h = await mountDialog({ state: 'refining' }, []);
  assert.ok(h.container.textContent.includes('Fine-tuning the AI Judge prompt…'), 'the refining title renders');
  assert.ok(h.container.textContent.includes('The AI Judge is fine-tuning the prompt with your additional instructions…'), 'the refining copy renders byte-exact');
});

test('Runtime: ready shell — previous textarea is read-only, both textareas carry their exact values', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const { container } = await mountDialog(readyMerge(), []);
  assert.ok(container.textContent.includes('Review the updated AI Judge prompt'), 'the ready title renders');
  const areas = [...container.querySelectorAll('textarea')];
  assert.equal(areas.length, 3, 'three textareas render: previous, next, fine-tune');
  const prev = areas.find((a) => a.readOnly);
  assert.ok(prev, 'the previous-prompt textarea is readOnly');
  assert.equal(prev.value, 'PREV-PROMPT-TEXT', 'the previous prompt renders its value');
  assert.ok(container.textContent.includes('Previous prompt (read-only)'), 'the read-only label renders');
  assert.ok(container.textContent.includes("New prompt (editable — the AI Judge's updated reasoning)"), 'the editable label renders');
  const next = areas.find((a) => !a.readOnly && !a.placeholder);
  assert.ok(next, 'the next-prompt textarea is the editable one without a placeholder');
  assert.equal(next.value, 'NEXT-PROMPT-TEXT', 'the next prompt renders its value');
});

test('Runtime: typing in the next textarea emits the functional setJudgeMerge updater and the verdict chips react to the real wiring', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const { dom, act, container, log, setMergeRef } = await mountDialog(readyMerge(), []);

  // Chips-only-when-detected: the initial next text has no verdict language.
  assert.ok(!container.textContent.includes('Verdict language detected:'), 'no chip row for token-free text');

  const next = [...container.querySelectorAll('textarea')].find((a) => !a.readOnly && !a.placeholder);
  await typeInto(dom, act, next, 'Verdict: VULNERABLE first, then SECURE later, then vulnerable again.');

  assert.equal(log.setJudgeMerge, 1, 'exactly one setJudgeMerge emission per keystroke');
  const seen = {};
  await act(async () => setMergeRef((prev) => { seen.after = prev; return prev; }));
  assert.equal(seen.after.next, 'Verdict: VULNERABLE first, then SECURE later, then vulnerable again.', 'the emitted updater is the exact functional {...prev, next: value} shape the hook consumes');
  assert.ok(container.textContent.includes('Verdict language detected:'), 'the chip row appears once tokens are detected');
  assert.ok(container.textContent.includes('VULNERABLE') && container.textContent.includes('SECURE'), 'the detected tokens render as chips (first-seen casing, deduped)');
});

test('Runtime: rejected banner + untrusted-evidence notice render their byte-exact copy in the ready state', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const { container } = await mountDialog(readyMerge({ rejected: 'this rewrite demands a fixed verdict' }), []);
  assert.ok(container.textContent.includes('this rewrite demands a fixed verdict'), 'the rejected reason renders in the banner');
  assert.ok(container.textContent.includes('The test case and the target model response were treated as untrusted evidence'), 'the untrusted-evidence notice renders');
});

test('Runtime: re-evaluation panel — three-way display (evaluating spinner / evaluation badge + reasoning / evalError and empty fallback) and the re-run dispatch', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);

  // evaluating: the spinner copy + a disabled re-run button.
  let h = await mountDialog(readyMerge({ evaluating: true }), []);
  assert.ok(h.container.textContent.includes('The AI Judge is re-evaluating with the current prompt…'), 'the evaluating copy renders');
  assert.ok(h.container.textContent.includes('Re-evaluating…'), 'the re-run button flips to its evaluating label');
  const rerunBtn = [...h.container.querySelectorAll('button')].find((b) => b.textContent.includes('Re-evaluating…'));
  assert.ok(rerunBtn.disabled, 'the re-run button is disabled while evaluating');
  assert.equal(h.log.rerunEval, 0, 'no re-run dispatch while evaluating');

  // evaluation present: status badge + reasoning.
  h = await mountDialog(readyMerge({ evaluation: { status: 'SECURE', reasoning: 'clean reasoning trace' } }), []);
  assert.ok(h.container.textContent.includes('SECURE'), 'the evaluation status badge renders');
  assert.ok(h.container.textContent.includes('verdict with the proposed prompt'), 'the evaluation caption renders');
  assert.ok(h.container.textContent.includes('clean reasoning trace'), 'the evaluation reasoning renders');
  const rerunBtn2 = [...h.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Re-run evaluation');
  await h.act(async () => rerunBtn2.click());
  assert.equal(h.log.rerunEval, 1, 'the re-run evaluation button dispatches its event');

  // evalError: the failure interpolation; empty: the fallback copy.
  h = await mountDialog(readyMerge({ evalError: 'timeout' }), []);
  assert.ok(h.container.textContent.includes('Evaluation failed: timeout'), 'the evalError interpolates');
  h = await mountDialog(readyMerge(), []);
  assert.ok(h.container.textContent.includes('No evaluation available.'), 'the empty-evaluation fallback renders');
});

test('Runtime: canary panel — expected/got badge ladder, diverged marker, stale detection flips opacity and renders the banner, re-run dispatches', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const canaries = [
    { name: 'obvious refusal', expected: 'VULNERABLE', status: 'SECURE', diverged: true },
    { name: 'benign question', expected: 'SECURE', status: 'SECURE', diverged: false },
  ];
  // Stale: the prompt was edited after the canaries ran.
  const h = await mountDialog(readyMerge({ canaries, canarySource: 'the pre-edit prompt text' }), []);
  const text = h.container.textContent;
  assert.ok(text.includes('Canary preview (does this prompt still classify obvious cases correctly?)'), 'the canary label renders');
  assert.ok(text.includes('Stale — the prompt was edited after these canaries ran. Re-run them to validate the current text.'), 'the stale banner renders byte-exact');
  assert.ok(text.includes('obvious refusal — expected') && text.includes('got'), 'each canary row renders name — expected … got');
  assert.ok(text.includes('✗') && text.includes('✓'), 'diverged rows render ✗, clean rows render ✓');
  assert.ok(text.includes('diverged'), 'the diverged marker renders for the diverged row');
  const panel = [...h.container.querySelectorAll('div')].find((d) => d.style.opacity === '0.5');
  assert.ok(panel, 'the stale panel is dimmed to opacity 0.5');
  const rerunBtn = [...h.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Re-run canaries');
  await h.act(async () => rerunBtn.click());
  assert.equal(h.log.rerunCanaries, 1, 'the re-run canaries button dispatches its event');

  // Fresh canaries (canarySource === next): no stale banner, full opacity.
  const h2 = await mountDialog(readyMerge({ canaries, canarySource: 'NEXT-PROMPT-TEXT' }), []);
  assert.ok(!h2.container.textContent.includes('Stale —'), 'no stale banner when the canaries match the current text');
  assert.ok(![...h2.container.querySelectorAll('div')].some((d) => d.style.opacity === '0.5'), 'the panel keeps full opacity');
});

test('Runtime: fine-tune box — typing emits the functional updater, the button dispatches refineJudgeMerge', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);
  const { dom, act, container, log } = await mountDialog(readyMerge(), []);
  const fineTune = [...container.querySelectorAll('textarea')].find((a) => a.placeholder.includes('Be stricter about ambiguous refusals'));
  assert.ok(fineTune, 'the fine-tune textarea carries its exact placeholder');
  assert.equal(fineTune.value, '', 'the fine-tune box starts empty (fineTuneFeedback || \'\')');
  await typeInto(dom, act, fineTune, 'Be stricter.');
  assert.equal(log.setJudgeMerge, 1, 'typing emits one setJudgeMerge emission');
  const refineBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Fine-tune with another AI pass'));
  assert.ok(!refineBtn.disabled, 'the refine button is enabled while not refining');
  await act(async () => refineBtn.click());
  assert.equal(log.refine, 1, 'the refine button dispatches its event');

  const h2 = await mountDialog(readyMerge({ refining: true, fineTuneFeedback: 'keep it terse' }), []);
  assert.ok(h2.container.textContent.includes('Fine-tuning…'), 'the refine button flips to its refining label');
  assert.ok([...h2.container.querySelectorAll('textarea')].some((a) => a.value === 'keep it terse'), 'the fine-tune value renders');
});

test('Runtime: footer — the disabled={!history.length} gate, and Cancel / Apply prompt / Apply-and-reevaluate dispatch their events', async () => {
  assert.ok(!dialogBundleError, `the dialog module must build under rolldown: ${dialogBundleError?.stack || dialogBundleError}`);

  // Empty history: the re-evaluate-all button is disabled and dispatches nothing.
  let h = await mountDialog(readyMerge(), []);
  const applyAllEmpty = [...h.container.querySelectorAll('button')].find((b) => b.textContent.includes('Apply prompt and re-evaluate all models'));
  assert.ok(applyAllEmpty.disabled, 'the re-evaluate-all button is disabled for an empty history');
  await h.act(async () => applyAllEmpty.click());
  assert.equal(h.log.applyAndReeval, 0, 'the disabled button dispatches nothing');

  // Non-empty history: enabled; all three footer buttons dispatch; close unmounts.
  h = await mountDialog(readyMerge(), [{ id: 'r1' }]);
  const applyAll = [...h.container.querySelectorAll('button')].find((b) => b.textContent.includes('Apply prompt and re-evaluate all models'));
  assert.ok(!applyAll.disabled, 'the re-evaluate-all button enables once history has entries');
  const applyBtn = [...h.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Apply prompt');
  const cancelBtn = [...h.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
  assert.ok(applyBtn && cancelBtn, 'the footer renders both remaining buttons');
  await h.act(async () => applyBtn.click());
  assert.equal(h.log.apply, 1, 'Apply prompt dispatches applyJudgeMerge');
  assert.equal(h.log.applyAndReeval, 0, 'Apply prompt does NOT dispatch the re-evaluate-all event');
  await h.act(async () => applyAll.click());
  assert.equal(h.log.applyAndReeval, 1, 'the re-evaluate-all button dispatches applyJudgeMergeAndReevaluate');
  await h.act(async () => cancelBtn.click());
  assert.equal(h.log.close, 1, 'Cancel dispatches closeJudgeMerge');
  assert.equal(h.container.textContent, '', 'the close event unmounts the dialog (Host clears judgeMerge)');
});
