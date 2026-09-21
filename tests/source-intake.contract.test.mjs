// Contract: the AI source-intake flow is implemented INSIDE the
// already-declared src/hooks/useAIGeneration.js parameter contract —
// toggleAiGenSource, addAiGenUrl, addSourceEntry, assessSource,
// saveAiSourceDraft, updateSourceDraft, toggleAiGenUrl, removeAiGenUrl,
// addPastedSourceDraft, handleAddSourceSubmit — App.jsx binds UI events only
// and holds no intake bodies, and no behavioral drift reaches assessment
// badges, excerpt capture, PROMPT_SOURCING_INFO profile seeding, or error/busy
// states.
//
// The hook consumes useAIGen() directly (the aiGen*/aiPreview* state and
// setters live in AIGenContext), so the signature carries only the
// cross-domain non-context deps and the handler bodies are unchanged.
//
// The add-source dialog JSX may live in App.jsx or in
// src/components/modals/AddSourceDialog.jsx; the dialog-binding pins are
// counted exactly-once across the App ∪ dialog union, so they hold either way.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/audit-engine.contract.test.mjs
// and tests/tests-context.contract.test.mjs). The composed API-layer
// semantics (assessSourceWithAI / proposeSourceMeta / fetchSourceExcerpt) stay
// exercised behaviorally by tests/analyzer.integration.test.mjs and
// tests/article-extraction.integration.test.mjs (the hook must call the SAME fns).
//
// Placement latitude: bodies are pinned INSIDE the hook file with
// indentation-tolerant literals; the four explanatory comment blocks are
// pinned ONCE ACROSS the App.jsx+hook pair so they may live on either side.
// The persistence boundary (`persistSourceUrls`) is pinned fully: five
// `persistSourceUrls(next);` call sites plus ONE fire-and-forget wrapper over
// the vault `saveSourceUrls` inside the hook. A dangling free identifier (five
// call sites, zero definitions) would be a latent ReferenceError that keeps the
// add-source dialog open on save and breaks toggle/remove/assessment
// persistence; the wrapper must be defined so a write failure toasts and the
// dialog closes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalStorage } from './helpers/dom.mjs';

installLocalStorage();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_PATH = 'src/App.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';
const VAULT_ACTIONS_HOOK_PATH = 'src/hooks/useVaultActions.js';
const DIALOG_PATH = 'src/components/modals/AddSourceDialog.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
let app = '', hook = '', view = '', settingsCtx = '', modal = '', vaultActionsHook = '', dialog = '';
try {
  app = readSource(APP_PATH);
  hook = readSource(HOOK_PATH);
  settingsCtx = readSource('src/context/SettingsContext.jsx');
  view = readSource('src/components/views/TestsView.jsx');
  modal = readSource('src/components/modals/AiGenWizardModal.jsx');
  vaultActionsHook = readSource(VAULT_ACTIONS_HOOK_PATH);
  dialog = readSource(DIALOG_PATH);
} catch { /* missing files fail their first assertion */ }

// The Key-Vault handler trio lives in the useVaultActions hook; the vault
// re-persist sites are counted across the App ∪ hook union.
const appPlusVaultHook = `${app}\n${vaultActionsHook}`;

const countIn = (source, re) => [...source.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].length;
const countStr = (source, needle) => source.split(needle).length - 1;
const idx = (source, needle, from = 0) => source.indexOf(needle, from);
const has = (source, needle, msg) => { assert.ok(source.includes(needle), msg); };
const pair = app + '\n' + hook;

const HANDLERS = [
  'toggleAiGenSource', 'addAiGenUrl', 'addSourceEntry', 'assessSource',
  'saveAiSourceDraft', 'updateSourceDraft', 'toggleAiGenUrl', 'removeAiGenUrl',
  'addPastedSourceDraft', 'handleAddSourceSubmit'
];

// The slim deps contract: every aiGen*/aiPreview* state+setter arrives through
// the hook's own useAIGen() destructure; the signature carries ONLY the
// cross-domain non-context deps.
const SLIM_DEPS = [
  'aiGenAbortRef', 'aiRunCtxRef', 'atlasMatrix', 'allTests', 'buildJudge',
  'judgeConfig', 'effectiveGenConfig', 'getPrompt', 'getPromptOverrides',
  'runWithTimeout', 'addToast', 'askConfirm', 'askInput'
];
const FORBIDDEN_IN_SIG = /\b(setAiGen\w*|setAiPreview\w*|aiGenSourceKeys|aiGenUrls|aiGenUrlInput|aiGenTitleInput|aiGenDescInput|aiSourceDraft|aiSourceAssessing|aiSourceAssessment|aiGenCount|aiGenCountInput|commitAiGenCount|updateAiGenCountInput|aiGenCollapsed|testsCollapsed|aiGenerating|aiGenStage|aiGenStageDetail|aiGenProgress|aiGenMode|aiPasteInput|aiPasteTitle|aiSourceProfiles|expandedSourceIds|toggleSourceExpanded|aiAddSourceOpen|aiAddSourceKind|aiAddStep|aiAddError|aiAddBusy|openAddSourceDialog|closeAddSourceDialog|aiGeneratedCount|aiWizardOpen|aiWizardStep|aiFineTune|aiRefining|aiWizardError|aiUsedGuidance|aiUsedFineTune|aiDraft|aiProfileEdits|aiProfileExpanded|aiGenBatch|aiGenBudget|aiAdvancedMode|aiGenElapsed|aiPreview|aiPreviewSelected|recentlyGeneratedIds|customTests|setCustomTests|setSelectedTests|validTechniqueIds|vaultLocked|vaultPassphraseSet|providers)\b/;

// ---------------------------------------------------------------------------
// The intake flow is implemented behind the declared hook contract
// ---------------------------------------------------------------------------

test('The intake surface keeps its deps contract — slim, context-fed, zero aiGen*/aiPreview* params', () => {
  const sigStart = idx(hook, 'export function useAIGeneration({');
  assert.ok(sigStart >= 0, 'the hook still exports its deps contract');
  const sigEnd = idx(hook, '}) {', sigStart);
  const sig = sigEnd > sigStart ? hook.slice(sigStart, sigEnd) : hook;
  assert.doesNotMatch(sig, FORBIDDEN_IN_SIG, 'no consolidated state or setter rides the signature (roadmap A2 grep gate)');
  const params = [...sig.matchAll(/^ {2}([A-Za-z_$][\w$]*),$/gm)].map(m => m[1]);
  assert.deepEqual([...params].sort(), [...SLIM_DEPS].sort(), 'the slim deps are exactly the cross-domain non-context values');
  const aiGenDestructure = /const \{([^}]*)\}\s*=\s*useAIGen\(\);/.exec(hook);
  assert.ok(aiGenDestructure, 'the hook destructures its intake state from useAIGen() (T04 consolidation)');
  for (const name of ['aiGenSourceKeys', 'setAiGenSourceKeys', 'aiGenUrls', 'setAiGenUrls', 'aiSourceDraft', 'setAiSourceDraft', 'aiAddSourceKind', 'aiAddStep', 'aiAddError', 'aiAddBusy', 'aiPasteInput', 'setAiPasteInput', 'aiPasteTitle', 'setAiPasteTitle']) {
    assert.match(aiGenDestructure[1], new RegExp(`\\b${name}\\b`), `the useAIGen() destructure binds ${name}`);
  }
});

test('The contract keeps exactly the collaborator the moved bodies need: effectiveGenConfig (slim dep since T04)', () => {
  const sigStart = idx(hook, 'export function useAIGeneration({');
  const sigEnd = idx(hook, '}) {', sigStart);
  const sig = sigEnd > sigStart ? hook.slice(sigStart, sigEnd) : '';
  assert.ok(/\beffectiveGenConfig\b/.test(sig), 'effectiveGenConfig joins the declared bag');
  assert.ok(/\beffectiveGenConfig\s*=/.test(app) || /effectiveGenConfig/.test(app), 'App still derives/passes effectiveGenConfig');
});

test('The hook defines the ten intake handlers exactly once each, in the committed order', () => {
  let prev = -1;
  for (const name of HANDLERS) {
    const re = new RegExp(`const ${name} = (async )?\\(`, 'g');
    assert.equal(countIn(hook, re), 1, `the hook defines ${name} exactly once`);
    assert.equal(countIn(app, re), 0, `App no longer defines ${name}`);
    const at = idx(hook, `const ${name} = `);
    assert.ok(at >= 0, `${name} present in the hook`);
    assert.ok(at > prev, `${name} keeps the committed definition order inside the hook`);
    prev = at;
  }
});

test('The legacy stub assessSource is REPLACED, not duplicated', () => {
  assert.equal(countIn(hook, /const assessSource = useCallback/), 0, 'the no-arg stub (read aiGenUrlInput, no-arg buildJudge) is gone');
  has(hook, 'const assessSource = async (id, source) => {', 'the moved (id, source) signature owns the name');
  assert.ok(!hook.includes("'No AI Judge configured — add one in Settings → Helper Models'"), 'the stub copy is gone from the hook');
});

test('The hook returns all ten handlers — App binds by the same names', () => {
  const retStart = idx(hook, 'return {\n    assessSource,');
  assert.ok(retStart >= 0, 'the hook has a return surface (anchored to its head, not a moved-body inner return)');
  const retEnd = idx(hook, '};', retStart);
  const ret = retEnd > retStart ? hook.slice(retStart, retEnd) : hook.slice(retStart);
  for (const name of HANDLERS) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(ret), `the hook returns ${name}`);
  }
});

test('App consumes the hook — one import, one call, slim deps wired explicitly', () => {
  assert.match(app, /import \{ useAIGeneration \} from '\.\/hooks\/useAIGeneration';/, 'App imports the hook extensionlessly, like its sibling hooks');
  assert.equal(countIn(app, /useAIGeneration\(\s*\{/g), 1, 'App calls useAIGeneration exactly once');
  const callStart = idx(app, 'useAIGeneration(');
  const callEnd = idx(app, '})', callStart);
  const call = callEnd > callStart ? app.slice(callStart, callEnd) : app.slice(callStart);
  for (const collaborator of ['aiGenAbortRef', 'aiRunCtxRef', 'atlasMatrix', 'allTests', 'buildJudge', 'judgeConfig', 'effectiveGenConfig', 'runWithTimeout', 'addToast', 'askConfirm']) {
    assert.ok(new RegExp(`\\b${collaborator}\\b`).test(call), `the call site passes ${collaborator} explicitly (slim deps contract)`);
  }
  assert.doesNotMatch(call, /\b(vaultLocked|vaultPassphraseSet|providers)\b/, 'the context-sourced collaborators no longer ride the call site (T04: the hook consumes their contexts directly)');
  assert.doesNotMatch(call, /\bset[A-Z]/, 'no setter rides the call site (T04 slim deps)');
});

test('The explanatory comment blocks and the read-only intake gate survive exactly once across the pair', () => {
  const comments = [
    '// Toggle a predefined sourcing key for AI generation',
    "// Add a URL / GitHub repo as a reusable AI generation source.",
    "// Add a \"pasted content\" source"
  ];
  for (const comment of comments) {
    assert.equal(countStr(pair, comment), 1, `exactly one copy of: ${comment.slice(0, 48)}`);
  }
  assert.equal(
    countStr(pair, "if (vaultLocked) { addToast('Unlock your API keys to add research sources.'); return null; }"),
    1,
    'the read-only intake gate is defined exactly once across the App ∪ hook pair',
  );
});

// ---------------------------------------------------------------------------
// The handler bodies keep their semantics (indentation-tolerant pins)
// ---------------------------------------------------------------------------

test('ToggleAiGenSource keeps the Set-toggle body', () => {
  has(hook, 'setAiGenSourceKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);', 'Set-toggle verbatim');
});

test('AddAiGenUrl keeps the full URL path — guards, bounded fetch, two-phase draft, proposal, assessment', () => {
  const start = idx(hook, 'const addAiGenUrl = ');
  const end = idx(hook, 'const addSourceEntry = ');
  const body = end > start ? hook.slice(start, end) : hook;
  has(body, 'aiGenUrlInput.split(/[\\s,]+/).map(u => u.trim()).filter(Boolean)', 'whitespace/comma split');
  has(body, 'if (parsed.length === 0) return false;', 'empty-input false exit');
  has(body, "if (!/^https?:\\/\\//i.test(url)) {", 'scheme guard');
  has(body, "setAiAddError('Please enter a valid URL starting with http(s)://');", 'scheme guard copy');
  has(body, 'if (aiGenUrls.some(s => s.url === url)) {', 'duplicate guard');
  has(body, "setAiAddError('This URL is already in your source list.');", 'duplicate guard copy');
  has(body, 'const sourceController = new AbortController();', 'per-add abort controller');
  has(body, 'const sourceTimer = setTimeout(() => sourceController.abort(), 30000);', '30s abort timer');
  has(body, 'const fetched = await fetchSourceExcerpt(url, 150000, sourceController.signal);', 'SAME api-layer fetch, 150k cap');
  has(body, "fetchNote = fetched.note || '';", 'fetchNote fallback');
  has(body, 'declined = !!fetched.declined;', 'declined coercion');
  has(body, 'proxyFailed = !!fetched.proxyFailed;', 'proxyFailed coercion');
  has(body, '} catch { /* fetch failed — leave empty */ } finally {', 'fetch failure swallowed');
  has(body, 'clearTimeout(sourceTimer);', 'timer cleared');
  has(body, 'setAiSourceAssessment(null);', 'assessment reset');
  has(body, 'setAiSourceAssessing(false);', 'assessing reset');
  has(body, 'setAiSourceDraft({ url, title, description, excerpt, fetchNote, declined, proxyFailed });', 'phase-1 draft');
  has(body, 'const judge = buildJudge(judgeConfig, providers);', 'proposal judge call shape verbatim');
  has(body, 'if (judge && (!title || !description)) {', 'proposal gate');
  has(body, 'const proposal = await proposeSourceMeta(judge, url, excerpt);', 'SAME api-layer proposal');
  has(body, 'if (!proposedTitle) proposedTitle = proposal.title;', 'user title wins');
  has(body, 'if (!proposedDesc) proposedDesc = proposal.description;', 'user description wins');
  has(body, "console.warn('Source metadata proposal failed', projectDiagnosticTextStrict(err));", 'strict-projected warn');
  has(body, "if (!proposedTitle) proposedTitle = url.replace(/^https?:\\/\\//i, '').split(/[/?#]/)[0] || url;", 'host fallback title');
  has(body, 'if (!proposedDesc) proposedDesc = `Research source imported from ${url}`;', 'imported-from fallback');
  has(body, 'setAiSourceDraft({ url, title: proposedTitle, description: proposedDesc, excerpt, fetchNote, declined, proxyFailed });', 'phase-2 draft');
  has(body, 'const gen = buildJudge(effectiveGenConfig, providers);', 'assessment judge call shape verbatim');
  has(body, 'setAiSourceAssessing(true);', 'assessing on');
  has(body, 'setAiSourceAssessment(await assessSourceWithAI(gen, { title: proposedTitle, description: proposedDesc, excerpt }));', 'SAME api-layer assess with proposed metadata');
  has(body, 'setAiSourceAssessing(false);', 'assessing off');
  assert.equal(countStr(body, 'return false;'), 3, 'exactly three false exits');
  has(body, 'return true;', 'resolves true');
});

test('AddSourceEntry keeps the gates, the exact entry shape, the clears, and the persist site', () => {
  const start = idx(hook, 'const addSourceEntry = ');
  const end = idx(hook, 'const saveAiSourceDraft = ');
  const body = end > start ? hook.slice(start, end) : hook;
  has(body, "if (vaultLocked) { addToast('Unlock your API keys to add research sources.'); return null; }", 'read-only gate + copy');
  has(body, 'if (entry.url && aiGenUrls.some(s => s.url === entry.url)) {', 'duplicate gate');
  has(body, "addToast('This URL is already in your source list.');", 'duplicate toast');
  has(body, "id: entry.kind === 'paste' ? `paste_${Date.now()}_${aiGenUrls.length}` : `url_${Date.now()}_${aiGenUrls.length}`,", 'id templates');
  has(body, "title: entry.title || entry.url || 'Untitled source',", 'title fallback');
  has(body, 'assessing: false,', 'starts unassessing');
  has(body, 'assessment: entry.assessment || null,', 'assessment passthrough');
  has(body, 'enabled: true', 'starts enabled');
  assert.equal(countStr(body, 'enabled: true'), 1, 'exactly one enabled flag');
  has(body, 'const next = [...aiGenUrls, newEntry];', 'append');
  has(body, 'setAiGenUrls(next);', 'state update');
  has(body, 'persistSourceUrls(next);', 'persist site survives verbatim');
  for (const clear of [
    "setAiGenUrlInput('');", "setAiGenTitleInput('');", "setAiGenDescInput('');",
    "setAiPasteInput('');", "setAiPasteTitle('');", 'setAiSourceDraft(null);'
  ]) {
    assert.equal(countStr(body, clear), 1, `the add flow clears ${clear}`);
  }
  has(body, 'return newEntry.id;', 'returns the id');
});

test('AssessSource keeps the read-only guard, generator judge, and both persisting arms', () => {
  const start = idx(hook, 'const assessSource = ');
  const end = idx(hook, 'const saveAiSourceDraft = ');
  const body = end > start ? hook.slice(start, end) : hook;
  has(body, 'if (vaultLocked) return;', 'read-only guard');
  has(body, 'const gen = buildJudge(effectiveGenConfig, providers);', 'generator judge call shape');
  has(body, 'if (!gen) return;', 'silent no-op without a model');
  has(body, 'setAiGenUrls(prev => prev.map(s => s.id === id ? { ...s, assessing: true } : s));', 'assessing flag on target only');
  has(body, 'const assessment = await assessSourceWithAI(gen, source);', 'SAME api-layer assess');
  has(body, '{ ...s, assessing: false, assessment }', 'success arm tags');
  has(body, '{ ...s, assessing: false }', 'failure arm clears');
  has(body, "console.warn('Source assessment failed', projectDiagnosticTextStrict(err));", 'strict-projected warn');
  assert.equal(countStr(body, 'persistSourceUrls(next);'), 2, 'BOTH arms keep the persist');
});

test('SaveAiSourceDraft keeps the draft guard, passthrough, and deferred assessment', () => {
  const start = idx(hook, 'const saveAiSourceDraft = ');
  const end = idx(hook, 'const updateSourceDraft = ');
  const body = end > start ? hook.slice(start, end) : hook;
  has(body, 'if (!aiSourceDraft) return;', 'draft guard');
  has(body, 'const id = addSourceEntry({', 'routes through addSourceEntry');
  has(body, "kind: aiSourceDraft.kind || 'url',", 'kind passthrough');
  has(body, "fetchNote: aiSourceDraft.fetchNote || '',", 'fetchNote passthrough');
  has(body, 'declined: !!aiSourceDraft.declined,', 'declined passthrough');
  has(body, 'proxyFailed: !!aiSourceDraft.proxyFailed,', 'proxyFailed passthrough');
  has(body, 'assessment: aiSourceAssessment', 'settled assessment rides along');
  has(body, 'if (id && !aiSourceAssessment) {', 'deferred only when none settled');
  has(body, 'assessSource(id, { title: aiSourceDraft.title, description: aiSourceDraft.description, excerpt: aiSourceDraft.excerpt });', 'deferred assess with draft metadata');
});

test('UpdateSourceDraft / toggleAiGenUrl / removeAiGenUrl keep the merge, flip, and removal', () => {
  has(hook, 'setAiSourceDraft(prev => prev ? { ...prev, ...patch } : prev);', 'merge-or-keep');
  has(hook, 'const next = prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);', 'enabled flip');
  has(hook, 'const next = prev.filter(s => s.id !== id);', 'removal by id');
  const tStart = idx(hook, 'const toggleAiGenUrl = ');
  const rStart = idx(hook, 'const removeAiGenUrl = ');
  const pStart = idx(hook, 'const addPastedSourceDraft = ');
  assert.equal(countStr(hook.slice(tStart, rStart), 'persistSourceUrls(next);'), 1, 'toggle persists inside the updater');
  assert.equal(countStr(hook.slice(rStart, pStart), 'persistSourceUrls(next);'), 1, 'remove persists inside the updater');
  has(hook.slice(tStart, rStart), 'return next;', 'toggle returns next');
  has(hook.slice(rStart, pStart), 'return next;', 'remove returns next');
});

test('AddPastedSourceDraft keeps the paste path — guard, judge proposal, dated fallback, paste copy', () => {
  const start = idx(hook, 'const addPastedSourceDraft = ');
  const end = idx(hook, 'const handleAddSourceSubmit = ');
  const body = end > start ? hook.slice(start, end) : hook;
  has(body, 'const text = aiPasteInput.trim();', 'trimmed paste input');
  has(body, "setAiAddError('Paste some content first.');", 'empty-paste guard copy');
  has(body, 'setAiSourceAssessment(null);', 'assessment reset');
  has(body, 'setAiSourceAssessing(false);', 'assessing reset');
  has(body, 'let proposedTitle = aiPasteTitle.trim();', 'user title seeds');
  has(body, "let proposedDesc = '';", 'description starts empty');
  has(body, 'const judge = buildJudge(judgeConfig, providers);', 'judge call shape');
  has(body, "const proposal = await proposeSourceMeta(judge, '', text);", 'EMPTY url + pasted text to the proposal');
  has(body, 'if (!proposedTitle) proposedTitle = proposal.title;', 'user title wins');
  has(body, 'proposedDesc = proposal.description;', 'description from proposal');
  has(body, 'if (!proposedTitle) proposedTitle = `Pasted source ${new Date().toLocaleDateString()}`;', 'dated fallback');
  has(body, "if (!proposedDesc) proposedDesc = 'Pasted content — AI infers the attack patterns from the provided text.';", 'fallback copy');
  has(body, "setAiSourceDraft({ url: '', kind: 'paste', title: proposedTitle, description: proposedDesc, excerpt: text, fetchNote: 'Pasted content — analysis from the provided text', declined: false, proxyFailed: false });", 'exact paste draft shape');
  has(body, 'setAiSourceAssessing(true);', 'assessing on');
  has(body, 'setAiSourceAssessment(await assessSourceWithAI(judge, { title: proposedTitle, description: proposedDesc, excerpt: text }));', 'judge assessment (not the generator)');
  has(body, 'setAiSourceAssessing(false);', 'assessing off');
  assert.equal(countStr(body, 'return false;'), 1, 'exactly one false exit');
  has(body, 'return true;', 'resolves true');
});

test('HandleAddSourceSubmit keeps the busy wrap, kind dispatch, and review step', () => {
  has(hook, 'setAiAddBusy(true);', 'busy on');
  has(hook, "const ok = aiAddSourceKind === 'url' ? await addAiGenUrl() : await addPastedSourceDraft();", 'kind dispatch');
  has(hook, 'setAiAddBusy(false);', 'busy off');
  has(hook, "if (ok) setAiAddStep('review');", 'review step on success');
});

test('The persistence seam is DEFINED — five call sites plus one fire-and-forget wrapper over the vault saveSourceUrls', () => {
  assert.equal(countStr(hook, 'persistSourceUrls(next);'), 5, 'exactly five call sites total (add 1, assess 2, toggle 1, remove 1)');
  assert.equal(countIn(hook, /const persistSourceUrls = \(sources\) => \{/), 1, 'the hook defines the persist wrapper exactly once (was a dangling free identifier — latent ReferenceError)');
  assert.equal(countIn(hook, /function persistSourceUrls/), 0, 'no hoisted definition');
  assert.match(hook, /import \{[^}]*saveSourceUrls[^}]*\} from '\.\.\/utils\/vault';/, 'the wrapper routes to the vault saveSourceUrls (same source of truth as loadSourceUrls/backup)');
  assert.equal(countIn(hook, /saveSourceUrls\(sources\)\.catch/), 1, 'the wrapper is fire-and-forget with an error-recovery arm');
  has(hook, "addToast('Could not save research sources — they may be lost on reload.', 'error');", 'a failed write is surfaced as a toast, never silently dropped');
});

// ---------------------------------------------------------------------------
// App binds UI events only — every binding survives byte-identical
// ---------------------------------------------------------------------------

test('The sources UI bindings survive verbatim (checkbox rows, row toggles, remove, counts)', () => {
  // The tests-view source rows live in TestsView.jsx — the row-wiring pins
  // read the view. The wizard's own checkbox bindings live in
  // src/components/modals/AiGenWizardModal.jsx — those four pins are evaluated
  // across the App + modal pair (union count semantics unchanged: each wiring
  // exists exactly once across the pair).
  const viewSrc = view;
  has(viewSrc, "enabled: aiGenSourceKeys.includes(key), onToggle: () => toggleAiGenSource(key), status: 'bundled'", 'predefined-source row wiring');
  has(viewSrc, 'enabled: s.enabled, onToggle: () => toggleAiGenUrl(s.id),', 'custom-source row enable wiring');
  has(viewSrc, 'onRemove: () => removeAiGenUrl(s.id)', 'custom-source row remove wiring');
  const wizardPair = app + '\n' + modal;
  assert.equal(countStr(wizardPair, 'onChange={() => toggleAiGenSource(key)}'), 1, 'selection checkbox (predefined, wizard sources step — modal-side since T17)');
  assert.equal(countStr(wizardPair, 'onChange={() => toggleAiGenUrl(s.id)}'), 1, 'selection checkbox (custom, wizard sources step — modal-side since T17)');
  assert.equal(countStr(wizardPair, 'Select sources for this run ({aiGenSourceKeys.length + aiGenUrls.filter(s => s.enabled).length} selected)'), 1, 'selected-count headline (modal-side since T17)');
  assert.equal(countStr(wizardPair, 'disabled={aiGenSourceKeys.length === 0 && aiGenUrls.filter(s => s.enabled).length === 0}'), 1, 'zero-source disable guard (modal-side since T17)');
});

test('The add-source dialog bindings survive verbatim (submit/enter/save/draft-edit/review copy)', () => {
  // The add-source dialog JSX lives in
  // src/components/modals/AddSourceDialog.jsx; each binding is pinned
  // exactly-once across the App ∪ dialog union (App-side or dialog-side) —
  // byte-identical needles, union count semantics.
  const dialogPair = `${app}\n${dialog}`;
  assert.equal(countStr(dialogPair, "onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSourceSubmit(); } }}"), 1, 'Enter submits, exactly once across the pair');
  assert.equal(countStr(dialogPair, '<button onClick={handleAddSourceSubmit} className="btn-primary" disabled={aiAddBusy}>'), 1, 'submit button + busy, exactly once across the pair');
  assert.equal(countStr(dialogPair, 'onChange={(e) => updateSourceDraft({ title: e.target.value })}'), 1, 'title edit binding, exactly once across the pair');
  assert.equal(countStr(dialogPair, 'onChange={(e) => updateSourceDraft({ description: e.target.value })}'), 1, 'description edit binding, exactly once across the pair');
  assert.equal(countStr(dialogPair, '<button onClick={() => { saveAiSourceDraft(); closeAddSourceDialog(); }} className="btn-primary">'), 1, 'save + close (T07-pinned), exactly once across the pair');
  assert.equal(countStr(dialogPair, "aiAddStep === 'review' && aiSourceDraft &&"), 1, 'review gate, exactly once across the pair');
  assert.equal(countStr(dialogPair, "? 'PASTED CONTENT' : 'URL SOURCE'"), 1, 'badge copy, exactly once across the pair');
  assert.equal(countStr(dialogPair, "? 'PROXY DECLINED — INFERRING' : aiSourceDraft.proxyFailed ? 'PROXY FAILED — INFERRING' : aiSourceDraft.excerpt ? 'CONTENT FETCHED' : 'CORS-BLOCKED — INFERRING'"), 1, 'four-state excerpt badge copy, exactly once across the pair');
});

test('App still consumes the intake state from useAIGen (T07 single source of truth untouched)', () => {
  has(app, 'aiGenUrls, setAiGenUrls,', 'context destructure keeps the intake state');
  // aiSourceDraft and aiAddStep may leave App's useAIGen destructure — the
  // intake flow reads them hook-side (useAIGeneration's own useAIGen
  // destructure) and dialog-side (AddSourceDialog's own destructure) — so the
  // two consumption pins resolve across the App ∪ hook ∪ dialog union
  // (identical guarantee). The useAIGen import stays.
  const dialogSrc = readSource('src/components/modals/AddSourceDialog.jsx');
  const intakeSurfaces = [app, hook, dialogSrc].join('\n');
  has(intakeSurfaces, 'aiSourceDraft, setAiSourceDraft,', 'draft state consumed from the context (App ∪ hook ∪ dialog union)');
  has(intakeSurfaces, 'aiAddStep, setAiAddStep,', 'dialog step consumed from the context (App ∪ hook ∪ dialog union)');
  has(app, "import { useAIGen } from './context/useAIGen';", 'the T07 import stays');
});

test('The hook consumes the SAME api layer through the shared barrel — no local reimplementation', () => {
  assert.match(hook, /import \{[^}]*assessSourceWithAI[^}]*\} from '\.\.\/utils\/api';/, 'assessSourceWithAI from the ../utils/api barrel');
  assert.match(hook, /import \{[^}]*proposeSourceMeta[^}]*\} from '\.\.\/utils\/api';/, 'proposeSourceMeta from the barrel');
  assert.match(hook, /import \{[^}]*fetchSourceExcerpt[^}]*\} from '\.\.\/utils\/api';/, 'fetchSourceExcerpt from the barrel');
  for (const fn of ['assessSourceWithAI', 'proposeSourceMeta', 'fetchSourceExcerpt']) {
    assert.equal(countIn(hook, new RegExp(`const ${fn} = `)), 0, `no local reimplementation of ${fn} in the hook`);
  }
  assert.match(hook, /import \{[^}]*fetchSourceExcerpt[^}]*\} from '\.\.\/utils\/api';/, 'the hook consumes the run-side refetch from the barrel (buildAiRunCtx lives hook-side since T09)');
  assert.equal(countIn(app, /fetchSourceExcerpt/), 0, 'App drops the import with the moved buildAiRunCtx body');
  assert.equal(countIn(app, /assessSourceWithAI/), 0, 'App drops the intake-only assess import (no NEW lint findings)');
  assert.equal(countIn(app, /proposeSourceMeta/), 0, 'App drops the intake-only proposal import');
});

// ---------------------------------------------------------------------------
// Scope guard — the generation pipeline belongs to the run-side hook
// ---------------------------------------------------------------------------

test('The run-side pipeline moved hook-local with T09 — buildAiRunCtx is defined exactly once across the pair', () => {
  has(hook, 'const enabledUrls = aiGenUrls.filter(s => s.enabled);', 'buildAiRunCtx keeps filtering enabled sources in the hook');
  has(hook, 'Object.entries(PROMPT_SOURCING_INFO)\n      .filter(([key]) => aiGenSourceKeys.includes(key))', 'the PROMPT_SOURCING_INFO profile seeding moved into the hook');
  has(hook, 'const fetched = await fetchSourceExcerpt(s.url, 150000, signal);', 'the run-side refetch lives in the hook');
  assert.equal(countIn(pair, /const buildAiRunCtx/), 1, 'buildAiRunCtx is defined exactly once across the App+hook pair');
  assert.equal(countIn(app, /const startAiGeneration/), 0, 'startAiGeneration left App with T09');
  assert.equal(countIn(hook, /const startAiGeneration/), 1, 'startAiGeneration is hook-local');
});

test('Acceptance greps — App shrank by the intake block and keeps its collaborators', () => {
  assert.ok(!app.includes('// Toggle a predefined sourcing key for AI generation') || countStr(pair, '// Toggle a predefined sourcing key for AI generation') === 1, 'the intake comment left App (or sits once across the pair)');
  assert.equal(countIn(app, /const addAiGenUrl = /), 0, 'App no longer declares addAiGenUrl');
  assert.equal(countIn(app, /const addSourceEntry = /), 0, 'App no longer declares addSourceEntry');
  assert.equal(countIn(app, /const handleAddSourceSubmit = /), 0, 'App no longer declares handleAddSourceSubmit');
  assert.equal(countStr(appPlusVaultHook, 'await saveSourceUrls(aiGenUrls);'), 2, 'the vault protect/unprotect re-persist sites stay exactly twice across App.jsx + the vault-actions hook (hook-side since the T08 residue absorb)');
  // App may shed pingModel from the judge-config import (its only consumers
  // live in the model-ping hook) — the import pin tolerates both shapes.
  assert.ok(
    /^import \{ buildJudge(, pingModel)? \} from '\.\/utils\/judge-config';$/m.test(app),
    "buildJudge is imported from src/utils/judge-config.js (T02; pingModel sheds to the model-ping hook since T05)"
  );
  assert.equal((app.match(/^ {4}buildJudge,$/gm) || []).length, 2, 'both pipeline dep bags still receive buildJudge');
  has(settingsCtx, 'const effectiveGenConfig = genConfig || judgeConfig;', 'the generator/judge fallback chain stays (provider-side since T06)');
});
