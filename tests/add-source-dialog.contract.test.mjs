// Contract: the add-custom-source dialog lives in
// src/components/modals/AddSourceDialog.jsx as a props-in/events-out component
// over the AIGenContext intake surface; App keeps the render gate
// `{aiAddSourceOpen && <AddSourceDialog … />}` and mounts the dialog instead of
// inlining its JSX.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/source-intake.contract.test.mjs).
// Every pin is a normalized (trim per line, blank-free) needle, so indentation
// cannot flip a pin for the wrong reason.
//
// The handler trio handleAddSourceSubmit / saveAiSourceDraft / updateSourceDraft
// is bound by the useAIGeneration hook contract (the context does not expose
// them), so the dialog receives them as props or from useAIGen(); the JSX
// needles are byte-identical either way, so the pins here never discriminate
// the source. The state surface (aiGen*/aiPaste*/aiSource*/aiAdd*) MUST come
// from useAIGen() inside the dialog — prop-drilling it is a contract violation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const DIALOG_PATH = 'src/components/modals/AddSourceDialog.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const normalize = (src) => src.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const countStr = (source, needle) => source.split(needle).length - 1;
const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const has = (source, needle, msg) => { assert.ok(source.includes(needle), msg); };

let app = '', dialog = '';
try {
  app = readSource(APP_PATH);
  dialog = readSource(DIALOG_PATH);
} catch { /* a missing dialog file fails its first assertion */ }
const normDialog = normalize(dialog);

// The context-fed intake surface: every state/setter the dialog JSX touches
// must arrive from useAIGen() destructured INSIDE the dialog.
const CONTEXT_SURFACE = [
  'aiGenUrlInput', 'setAiGenUrlInput', 'aiGenTitleInput', 'setAiGenTitleInput',
  'aiGenDescInput', 'setAiGenDescInput', 'aiPasteInput', 'setAiPasteInput',
  'aiPasteTitle', 'setAiPasteTitle', 'aiSourceDraft', 'aiSourceAssessing',
  'aiSourceAssessment', 'aiAddSourceKind', 'setAiAddSourceKind', 'aiAddStep',
  'setAiAddStep', 'aiAddError', 'setAiAddError', 'aiAddBusy', 'closeAddSourceDialog'
];

// The hook-bound handler trio: props or context, never redeclared.
const HANDLER_TRIO = ['handleAddSourceSubmit', 'saveAiSourceDraft', 'updateSourceDraft'];

test('AddSourceDialog.jsx is the real dialog — named default export at the TARGET_PATH', () => {
  assert.ok(dialog.length > 0, 'src/components/modals/AddSourceDialog.jsx exists and is non-empty');
  assert.match(dialog, /export default function AddSourceDialog\(/, 'named default export AddSourceDialog (JudgeMergeDialog precedent)');
});

test('The dialog consumes the AIGenContext intake surface itself — zero prop-drilled state', () => {
  assert.match(dialog, /import \{ useAIGen \} from '\.\.\/\.\.\/context\/useAIGen';/, 'useAIGen imported from the hook module');
  const destructure = /const \{([^}]*)\}\s*=\s*useAIGen\(\);/.exec(dialog);
  assert.ok(destructure, 'the dialog destructures useAIGen() inside its body');
  for (const name of CONTEXT_SURFACE) {
    assert.match(destructure[1], new RegExp(`\\b${name}\\b`), `the useAIGen() destructure binds ${name}`);
  }
  assert.equal(countIn(dialog, /useAIGeneration/), 0, 'the dialog never imports the useAIGeneration hook (the hook contract stays App-side)');
  const sig = /^export default function AddSourceDialog\(\{([^}]*)\}\)/.exec(dialog);
  if (sig) {
    for (const name of CONTEXT_SURFACE) {
      assert.ok(!new RegExp(`\\b${name}\\b`).test(sig[1]), `${name} is not prop-drilled (roadmap A2: context state comes from useAIGen())`);
    }
    for (const name of HANDLER_TRIO) {
      assert.match(sig[1], new RegExp(`\\b${name}\\b`), `${name} rides the props bag (hook-bound handler)`);
    }
  }
});

test('The hook-bound handler trio reaches the dialog without being redeclared', () => {
  for (const name of HANDLER_TRIO) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(dialog), `${name} is bound in the dialog (prop or context — either is contract-clean)`);
    assert.equal(countIn(dialog, new RegExp(`const ${name} = `)), 0, `the dialog never redeclares ${name}`);
  }
  assert.ok(/\{aiAddSourceOpen && <AddSourceDialog/.test(app), 'App keeps the `{aiAddSourceOpen && <AddSourceDialog` mount gate');
  assert.match(app, /import AddSourceDialog from '\.\/components\/modals\/AddSourceDialog';/, 'App imports the dialog extensionlessly, like its sibling modals');
});

test('The moved dialog bindings survive verbatim in the dialog file — exactly once each', () => {
  has(normDialog, "onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSourceSubmit(); } }}", 'Enter submits');
  assert.equal(countStr(normDialog, '<button onClick={handleAddSourceSubmit} className="btn-primary" disabled={aiAddBusy}>'), 1, 'submit button + busy, exactly once');
  assert.equal(countStr(normDialog, 'onChange={(e) => updateSourceDraft({ title: e.target.value })}'), 1, 'title edit binding, exactly once');
  assert.equal(countStr(normDialog, 'onChange={(e) => updateSourceDraft({ description: e.target.value })}'), 1, 'description edit binding, exactly once');
  assert.equal(countStr(normDialog, '<button onClick={() => { saveAiSourceDraft(); closeAddSourceDialog(); }} className="btn-primary">'), 1, 'save + close (T07-pinned), exactly once');
  assert.equal(countStr(normDialog, "aiAddStep === 'review' && aiSourceDraft &&"), 1, 'review gate, exactly once');
  assert.equal(countStr(normDialog, "? 'PASTED CONTENT' : 'URL SOURCE'"), 1, 'badge copy, exactly once');
  assert.equal(countStr(normDialog, ": (aiSourceDraft.declined ? 'PROXY DECLINED — INFERRING' : aiSourceDraft.proxyFailed ? 'PROXY FAILED — INFERRING' : aiSourceDraft.excerpt ? 'CONTENT FETCHED' : 'CORS-BLOCKED — INFERRING')}"), 1, 'four-state excerpt badge copy, exactly once');
});

test('The dialog shell moved whole — overlay, card, header, kind toggle, both field branches', () => {
  has(normDialog, "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 135,", 'fixed overlay at zIndex 135');
  has(normDialog, `<div className="glass-card" style={{ width: '100%', maxWidth: '560px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>`, '560px glass-card shell');
  has(normDialog, "{aiAddStep === 'review' ? 'Review new source' : 'Add custom source'}", 'header title switch');
  has(normDialog, '<button onClick={closeAddSourceDialog} className="btn-secondary" style={{ padding: \'6px\' }}>', 'header X close');
  has(normDialog, "{aiAddStep === 'input' && (", 'input step gate');
  has(normDialog, "{[['url', 'URL / GitHub repo / article'], ['paste', 'Pasted content']].map(([val, label]) => (", 'kind options in order');
  has(normDialog, 'onClick={() => setAiAddSourceKind(val)}', 'kind click binding');
  has(normDialog, '{aiAddSourceKind === \'url\' ? (', 'url/paste branch dispatch');
});

test('Both field branches moved with their error-clearing wiring and copy', () => {
  has(normDialog, 'value={aiGenUrlInput}', 'URL input binds aiGenUrlInput');
  has(normDialog, 'onChange={(e) => { setAiGenUrlInput(e.target.value); if (aiAddError) setAiAddError(\'\'); }}', 'URL typing clears aiAddError');
  has(normDialog, 'placeholder="https://github.com/user/repo"', 'URL placeholder');
  has(normDialog, 'placeholder="e.g. OWASP LLM Top 10"', 'title placeholder');
  has(normDialog, 'value={aiGenDescInput}', 'description binds aiGenDescInput');
  has(normDialog, 'placeholder="What is this source about? (if blank, the AI proposes a title and description you can edit)"', 'description placeholder');
  has(normDialog, "borderColor: aiAddError && aiAddSourceKind === 'url' ? 'rgba(239,68,68,0.6)' : undefined", 'URL error border tint');
  has(normDialog, 'The source is fetched and assessed before being added. Client-side fetching may be blocked by CORS', 'CORS note copy');
  has(normDialog, 'value={aiPasteTitle}', 'paste title binds aiPasteTitle');
  has(normDialog, 'value={aiPasteInput}', 'paste textarea binds aiPasteInput');
  has(normDialog, 'onChange={(e) => { setAiPasteInput(e.target.value); if (aiAddError) setAiAddError(\'\'); }}', 'paste typing clears aiAddError');
  has(normDialog, 'placeholder="Paste the full article, research paper, or README text here — the AI analyzes it directly, no CORS limits."', 'paste placeholder');
  has(normDialog, "borderColor: aiAddError && aiAddSourceKind === 'paste' ? 'rgba(239,68,68,0.6)' : undefined", 'paste error border tint');
  has(normDialog, 'The pasted text is assessed before being added, and the AI proposes a title and description you can edit.', 'paste note copy');
});

test('The error box, input footer, relevance assessment, and review footer moved whole', () => {
  has(normDialog, '{aiAddError && (', 'error box gate');
  has(normDialog, '<span>{aiAddError}</span>', 'error copy node');
  has(normDialog, '<button onClick={closeAddSourceDialog} className="btn-secondary" disabled={aiAddBusy}>Cancel</button>', 'Cancel busy-gated');
  has(normDialog, '{aiAddBusy ? <><RefreshCw size={15} className="animate-spin-custom" /> Fetching &amp; assessing…</> : <><Plus size={15} /> Fetch &amp; assess</>}', 'busy/label swap verbatim');
  has(normDialog, '<span className="form-label">Relevance assessment</span>', 'relevance label');
  has(normDialog, 'Assessing relevance with the Test Generator model…', 'assessing copy');
  has(normDialog, "high: ['RELEVANT · HIGH', 'var(--color-secure)', 'rgba(22,163,74,0.15)'],", 'high meta row');
  has(normDialog, "medium: ['MAYBE RELEVANT', 'var(--color-warning)', 'rgba(245,158,11,0.15)'],", 'medium meta row');
  has(normDialog, "low: ['LOW RELEVANCE', 'var(--color-vulnerable)', 'rgba(239,68,68,0.15)'],", 'low meta row');
  has(normDialog, "irrelevant: ['IRRELEVANT', 'var(--color-vulnerable)', 'rgba(239,68,68,0.18)']", 'irrelevant meta row');
  has(normDialog, "}[aiSourceAssessment.status] || ['ASSESSED', 'var(--text-muted)', 'rgba(255,255,255,0.05)'];", 'fallback meta row');
  has(normDialog, 'Assessment unavailable (no Test Generator model configured). The source can still be added.', 'unavailable copy');
  has(normDialog, '{aiSourceDraft.excerpt && (', 'fetched-context gate');
  has(normDialog, '<span className="form-label">Fetched context</span>', 'fetched-context label');
  has(normDialog, '<button onClick={() => { setAiAddStep(\'input\'); setAiSourceDraft(null); setAiSourceAssessment(null); setAiAddError(\'\'); }} className="btn-secondary">Back</button>', 'Back reset chain verbatim');
  has(normDialog, '<Plus size={15} /> Add source', 'save button label');
});

test('App slimmed by the move — the overlay JSX and its needles are gone from App.jsx', () => {
  assert.equal(countStr(app, 'zIndex: 135,'), 0, 'the dialog overlay left App.jsx');
  assert.equal(countStr(app, "? 'PASTED CONTENT' : 'URL SOURCE'"), 0, 'the kind badge left App.jsx');
  assert.equal(countStr(app, 'Assessing relevance with the Test Generator model…'), 0, 'the assessing copy left App.jsx');
  assert.equal(countStr(app, "<button onClick={() => { saveAiSourceDraft(); closeAddSourceDialog(); }} className=\"btn-primary\">"), 0, 'the save+close button left App.jsx');
  assert.equal(countStr(normDialog, 'zIndex: 135,'), 1, 'the overlay lives exactly once — in the dialog file');
});

test('Binding arity holds in the dialog — close x2, submit x2, patches x1', () => {
  assert.equal(countStr(normDialog, 'onClick={closeAddSourceDialog}'), 2, 'closeAddSourceDialog bound exactly twice (header X + Cancel)');
  assert.equal(countStr(normDialog, 'handleAddSourceSubmit();'), 1, 'Enter path submits once');
  assert.equal(countStr(normDialog, '<button onClick={handleAddSourceSubmit}'), 1, 'button path submits once');
  assert.equal(countStr(normDialog, 'onClick={() => setAiAddSourceKind(val)}'), 1, 'kind toggle bound once');
  assert.equal(countStr(normDialog, 'updateSourceDraft({ title:'), 1, 'title patch bound once');
  assert.equal(countStr(normDialog, 'updateSourceDraft({ description:'), 1, 'description patch bound once');
  assert.equal(countStr(normDialog, 'saveAiSourceDraft(); closeAddSourceDialog();'), 1, 'save+close bound once');
});
