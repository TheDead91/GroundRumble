// Contract: the wizard's running/profiles/draft/results panes
// plus their four footer branches are implemented INSIDE
// src/components/modals/AiGenWizardResults.jsx, composed inside
// src/components/modals/AiGenWizardModal.jsx: the default export renders the
// four step bodies inside the modal's body container, the named
// AiGenWizardResultsFooter export renders the footer chain's final branch, and
// a shared useWizardResultsState() hook pulls every context-owned name
// straight from AIGenContext (useAIGen), the shared generator config from
// SettingsContext and the vault flag from ProvidersContext, while locally
// defining the seven pure state-transform handlers. App.jsx keeps the
// conditional mount and does not define the panes, the footer branches or the
// seven handlers; the App-owned bindings reach the results surface through the
// modal's resultsBindings forwarding object.
//
// Ownership is pinned across the possible homes: the preview state lives in
// AIGenContext (App destructures it from useAIGen() and forwards it to the
// modal), and the orchestration handlers (finalizeAiDraft, refineAiTests,
// cancelAiGeneration, toggleAiPreviewItem) may be hook-bound in
// useAIGeneration (exactly-once hook-side, absent App-side). The forwarded
// bindings and every body are pinned unchanged.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/ai-wizard-modal.contract.test.mjs).
// Pins are whitespace-normalized so re-indentation cannot stale them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const MODAL_PATH = 'src/components/modals/AiGenWizardModal.jsx';
const RESULTS_PATH = 'src/components/modals/AiGenWizardResults.jsx';
const HOOK_PATH = 'src/hooks/useAIGeneration.js';
const VIEW_PATH = 'src/components/views/TestsView.jsx';
const PROVIDERS_PATH = 'src/context/ProvidersContext.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

const app = readSource(APP_PATH);
const modal = readSource(MODAL_PATH);
const results = readSource(RESULTS_PATH);
const hook = readSource(HOOK_PATH);
const view = readSource(VIEW_PATH);

// The guided-tour step definitions may live in the pure factory module
// src/utils/tour-steps.js — the App-side tour-copy pin resolves from either
// side (App.jsx or the factory module).
let tour = '';
try { tour = readSource('src/utils/tour-steps.js'); } catch { /* module absent — tolerant read */ }
// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (either
// home may own it).
const appTour = app + '\n' + tour;
const providers = readSource(PROVIDERS_PATH);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const has = (source, needle, msg) => { assert.ok(source.includes(needle), msg); };
const hasN = (source, needle, msg) => { assert.ok(norm(source).includes(norm(needle)), msg); };
const countIn = (source, needle) => source.split(needle).length - 1;
// Comment-stripped source for "code may not touch it" assertions.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Every state name the JSX drives that the results surface reads from
// AIGenContext — the shared hook's own useAIGen() destructure, never props.
const CTX_NAMES = [
  'aiWizardStep', 'setAiWizardStep', 'setAiWizardOpen', 'setAiWizardError',
  'aiGenerating', 'aiGenStage', 'aiGenStageDetail', 'aiGenProgress', 'aiGenMode',
  'aiGenElapsed', 'aiDraft', 'setAiDraft', 'aiProfileEdits', 'setAiProfileEdits',
  'aiProfileExpanded', 'setAiProfileExpanded',
  'aiFineTune', 'setAiFineTune', 'aiRefining', 'aiUsedGuidance', 'aiRunCtxRef',
  'setAiSourceProfiles',
];

// The App-owned bindings the modal forwards to both results exports.
// The chip binding resolves from either side of the component move — a
// forwarded binding or the component import.
const FORWARDED = [
  'cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests',
  'toggleAiPreviewItem', 'runAiGeneration', 'startAiGeneration', 'confirmAiPreview',
  'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected',
];

test('AiGenWizardResults.jsx is the real results module — both exports, direct context consumption, exact prop contract', () => {
  assert.match(results, /export default function AiGenWizardResults\(/, 'the panes component is the file\'s default export');
  assert.match(results, /export function AiGenWizardResultsFooter\(/, 'the footer branches are the named AiGenWizardResultsFooter export');
  assert.ok(results.includes("import { useAIGen } from '../../context/useAIGen';"), 'the results surface consumes AIGenContext directly');
  assert.ok(results.includes("import { useSettings } from '../../context/SettingsContext';"), 'the results surface reads the shared generator config from SettingsContext');
  assert.ok(results.includes("import { useProviders } from '../../context/ProvidersContext';"), 'the results surface reads the vault flag from ProvidersContext');
  assert.ok(results.includes('} = useAIGen();'), 'the wizard state comes from the shared hook\'s own useAIGen() destructure');
  const destructure = results.slice(results.indexOf('  const {'), results.indexOf('} = useAIGen();'));
  for (const name of CTX_NAMES) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(destructure), `the results destructure carries ${name} from useAIGen()`);
  }
  assert.ok(/\} = useSettings\(\);/.test(results), 'the results surface consumes useSettings() directly');
  const settingsDestructure = results.slice(results.indexOf('const { effectiveGenConfig }'), results.indexOf('} = useSettings();'));
  assert.ok(settingsDestructure.includes('effectiveGenConfig'), 'effectiveGenConfig comes from the shared hook\'s own useSettings() destructure');
  // The chip component adds providerLabel to the same destructure.
  assert.ok(/const \{ vaultLocked(, providerLabel)? \} = useProviders\(\);/.test(results), 'vaultLocked comes from the shared hook\'s own useProviders() destructure');
  assert.ok(providers.includes('const [vaultLocked, setVaultLocked] = useState(false);'), 'ProvidersContext still owns vaultLocked (no state migration)');
  // The prop contract: exactly the twelve App-owned bindings — the context
  // state must never be re-plumbed as props.
  const propsMatch = results.match(/function useWizardResultsState\(\{([\s\S]*?)\}\) \{/);
  assert.ok(propsMatch, 'the shared useWizardResultsState() hook declares its prop contract inline');
  const propList = propsMatch[1];
  for (const prop of FORWARDED) {
    assert.ok(new RegExp(`\\b${prop}\\b`).test(propList), `the results surface takes ${prop} as a prop`);
  }
  for (const foreign of ['aiWizardStep', 'aiDraft', 'aiProfileEdits', 'aiGenStage', 'aiGenMode', 'aiGenElapsed', 'vaultLocked', 'effectiveGenConfig']) {
    assert.ok(!new RegExp(`\\b${foreign}\\b`).test(propList), `${foreign} is NOT a prop (it comes from the contexts)`);
  }
  // Both exports share the hook — no duplicated context plumbing.
  assert.equal(countIn(results, 'useWizardResultsState(props)'), 2, 'both exports consume the shared state hook exactly once each');
});

test('The running pane renders from AiGenWizardResults (error surface, stage labels, progress bar, phase rail, chip, elapsed)', () => {
  hasN(results, `aiWizardStep === 'running' && (
                aiWizardError && !aiGenerating ? (`, 'the running error pane gates on error && !generating');
  hasN(results, `<AlertTriangle size={28} color="var(--color-vulnerable)" />`, 'the error pane renders the AlertTriangle icon');
  hasN(results, `<div style={{ color: 'var(--color-vulnerable)', fontSize: '0.9rem', fontWeight: 700 }}>Generation failed</div>`, 'the Generation failed headline moved verbatim');
  hasN(results, `{aiWizardError}`, 'the error pane renders the wizard error text');
  hasN(results, `{aiGenStage === 'analyzing' && 'Analyzing sources…'}
                          {aiGenStage === 'generating' && 'Generating test payloads…'}
                          {aiGenStage === 'critiquing' && 'Critiquing & refining tests…'}
                          {!aiGenStage && \`Generating with \${effectiveGenConfig.provider} AI…\`}`, 'the four stage headlines (incl. the config-fallback template) moved verbatim');
  hasN(results, `{aiGenStageDetail && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{aiGenStageDetail}</div>}`, 'the stage detail line renders when present');
  hasN(results, `background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                          width: \`\${aiGenProgress}%\`,
                          transition: 'width 0.4s ease'`, 'the progress bar drives its width from aiGenProgress with the 0.4s ease transition');
  hasN(results, `<span>{aiGenMode === 'deep' ? 'Analyze → Generate → Critique' : 'Single pass'}</span>`, 'the pipeline-mode caption mirrors aiGenMode');
  hasN(results, `<span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{aiGenProgress}%</span>`, 'the numeric percentage caption moved verbatim');
  hasN(results, `{ id: 'analyzing', label: 'Analyze sources into threat profiles' },
                        { id: 'generating', label: 'Generate test payloads' },
                        { id: 'critiquing', label: 'Critique & refine' }`, 'the three phase labels moved verbatim');
  hasN(results, `.filter(ph => aiGenMode === 'deep' || ph.id === 'generating')`, 'the rail hides analysis phases in fast mode');
  hasN(results, `const order = ['analyzing', 'generating', 'critiquing'];
                          const cur = order.indexOf(aiGenStage);
                          const state = cur === -1 ? (aiGenerating ? 'running' : 'todo') : order.indexOf(ph.id) === cur ? 'active' : order.indexOf(ph.id) < cur ? 'done' : 'todo';`, 'the phase state machine moved verbatim (unknown stage falls back to running/todo)');
  hasN(results, `{state === 'done' ? <Check size={12} /> : state === 'active' ? <RefreshCw size={12} className="animate-spin-custom" /> : order.indexOf(ph.id) + 1}`, 'done phases render Check, active render the spinner, todo render their 1-based index');
  hasN(results, `background: state === 'done' ? 'var(--color-secure)' : state === 'active' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)'`, 'the phase dot colors moved verbatim');
  hasN(results, `<span style={{ fontSize: '0.8rem', fontWeight: state === 'active' ? 700 : 500 }}>{ph.label}</span>`, 'the active phase label bolds');
  // The chip renders in either form (render-prop call or shared component).
  assert.equal(countIn(results, "{renderActiveModelChip('Generating with', effectiveGenConfig)}") + countIn(results, '<ActiveModelChip label="Generating with" cfg={effectiveGenConfig} providerLabel={providerLabel} />'), 1, 'the running pane renders the shared model chip with the shared config (either form)');
  hasN(results, `{aiGenMode === 'deep' ? 'Deep (analyze → generate → critique)' : 'Fast (single pass)'} — this can take a minute`, 'the deep/fast runtime note moved verbatim');
  hasN(results, `Elapsed: {aiGenElapsed}s`, 'the elapsed counter renders aiGenElapsed seconds');
  hasN(results, `<RefreshCw size={24} className="animate-spin-custom" color="var(--color-primary)" />`, 'the pane header spinner moved verbatim');
});

test('The profiles pane renders from AiGenWizardResults (per-source cards, badges, expand/collapse, vector editor)', () => {
  hasN(results, 'The AI analyzed your sources into <b>threat profiles</b>. Review and edit them — they ground the', 'the profiles intro copy moved verbatim');
  hasN(results, 'Sources without a usable profile fall back to their raw content.', 'the raw-content fallback explainer moved verbatim');
  hasN(results, '{(aiRunCtxRef.current?.sources || []).map(src => {', 'the profiles map walks the run-context sources (null-safe, hook-owned ref)');
  hasN(results, `const p = aiProfileEdits[src.key];
                    const open = aiProfileExpanded[src.key] === true;`, 'each card reads its profile edit + expanded flag');
  hasN(results, `onClick={() => p && toggleAiProfileExpand(src.key)}`, 'card click toggles expansion only when a profile exists');
  hasN(results, `<Layers size={15} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />`, 'the Layers card icon moved verbatim');
  hasN(results, `{p ? (
                              <>
                                <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{p.vulnerabilityClass || 'Unclassified'}</span>
                                <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>weight {p.weight ?? 1}</span>`, 'the class/weight badges render only with a profile (fallback copy pinned)');
  hasN(results, `{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}`, 'the chevron mirrors the expanded flag');
  hasN(results, `<span className="badge badge-warning" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>No profile — raw content</span>`, 'profile-less sources carry the raw-content badge');
  hasN(results, `{(p.vectors || []).length} attack vector(s)`, 'the vector-count line moved verbatim');
  hasN(results, `<input className="form-input" value={p.vulnerabilityClass || ''} onChange={(e) => updateAiProfile(src.key, { vulnerabilityClass: e.target.value })} placeholder="Vulnerability class" />`, 'the class input routes through the results-local updateAiProfile');
  hasN(results, `<input type="number" min={1} max={3} className="form-input" value={p.weight ?? 1} onChange={(e) => updateAiProfile(src.key, { weight: Math.max(1, Math.min(3, Number(e.target.value) || 1)) })} />`, 'the weight input clamps 1..3 through updateAiProfile');
  hasN(results, `<button onClick={(e) => { e.stopPropagation(); addAiProfileVector(src.key); }} className="btn-secondary" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>`, 'the add-vector button stops propagation and routes through addAiProfileVector');
  hasN(results, `<Plus size={12} style={{ marginRight: '4px' }} /> Vector`, 'the add-vector button copy moved verbatim');
  hasN(results, `<input className="form-input" placeholder="Vector name" value={v.name || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { name: e.target.value })} style={{ flexGrow: 1 }} />`, 'the vector-name input routes through updateAiProfileVector');
  hasN(results, `<input className="form-input" placeholder="Technique id" value={v.techniqueId || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { techniqueId: e.target.value })} style={{ width: '150px' }} />`, 'the vector technique-id input moved verbatim');
  hasN(results, `<button onClick={(e) => { e.stopPropagation(); removeAiProfileVector(src.key, idx); }} className="btn-secondary" style={{ padding: '4px' }}><Trash2 size={13} /></button>`, 'the remove-vector button stops propagation and routes through removeAiProfileVector');
  hasN(results, `<input className="form-input" placeholder="Technique name" value={v.techniqueName || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { techniqueName: e.target.value })} />`, 'the vector technique-name input moved verbatim');
  hasN(results, `<textarea className="form-input" rows={1} placeholder="Payload shape (concrete example attack)" value={v.payloadShape || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { payloadShape: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />`, 'the payload-shape textarea moved verbatim');
  hasN(results, `<textarea className="form-input" rows={1} placeholder="Description / evidence" value={v.description || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { description: e.target.value })} />`, 'the evidence textarea moved verbatim');
});

test('The draft pane renders from AiGenWizardResults (count headline, failures summary, per-test editor, keywords)', () => {
  hasN(results, `The AI generated {aiDraft.tests.length} test(s). Review and edit them before finalizing.`, 'the draft count headline moved verbatim');
  hasN(results, `{aiDraft.failures > 0 && (
                      <span style={{ display: 'block', marginTop: '4px', color: 'var(--color-warning)' }}>
                        <AlertTriangle size={12} /> {aiDraft.failures} generation call(s) failed and were retried/skipped — partial results were kept.
                      </span>
                    )}`, 'the failures summary renders only when calls failed');
  hasN(results, `No tests were generated. Go back and try fewer tests or different sources.`, 'the empty-draft copy moved verbatim');
  hasN(results, '{aiDraft.tests.map((t, i) => (', 'the draft rows map aiDraft.tests with their index');
  hasN(results, `<span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px', flexShrink: 0 }}>{i + 1}.</span>`, 'draft rows carry their 1-based ordinal');
  hasN(results, `<input className="form-input" value={t.name || ''} onChange={(e) => updateAiDraftTest(t.id, { name: e.target.value })} style={{ flexGrow: 1, minWidth: '140px', fontWeight: 600 }} placeholder="Test name" />`, 'the name input routes through the results-local updateAiDraftTest');
  hasN(results, `<input className="form-input" value={t.techniqueId || ''} onChange={(e) => updateAiDraftTest(t.id, { techniqueId: e.target.value })} style={{ width: '130px' }} placeholder="Technique id" />`, 'the technique-id input moved verbatim');
  hasN(results, `<input className="form-input" value={t.techniqueName || ''} onChange={(e) => updateAiDraftTest(t.id, { techniqueName: e.target.value })} style={{ width: '180px' }} placeholder="Technique name" />`, 'the technique-name input moved verbatim');
  hasN(results, `<button onClick={() => removeAiDraftTest(t.id)} className="btn-secondary" style={{ padding: '4px' }}><Trash2 size={13} /></button>`, 'the remove-test button routes through removeAiDraftTest');
  hasN(results, `<input className="form-input" value={t.description || ''} onChange={(e) => updateAiDraftTest(t.id, { description: e.target.value })} placeholder="Description" />`, 'the description input moved verbatim');
  hasN(results, `<div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', wordBreak: 'break-word' }}>Source: {t.sourceTitle || '—'}</div>`, 'the source title fallback is an em dash');
  hasN(results, `{t.sourceReasoning && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>Reasoning:</span> {t.sourceReasoning}
                              </div>
                            )}`, 'the reasoning line renders conditionally with the warning-toned label');
  hasN(results, `<label className="form-label" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-secondary)' }}>Context (system prompt)</label>`, 'the system-prompt label moved verbatim');
  hasN(results, `<textarea className="form-input" rows={2} value={t.systemPrompt || ''} onChange={(e) => updateAiDraftTest(t.id, { systemPrompt: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />`, 'the system-prompt textarea routes through updateAiDraftTest');
  hasN(results, `<label className="form-label" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-vulnerable)' }}>Payload (user prompt)</label>`, 'the user-prompt label moved verbatim');
  hasN(results, `<textarea className="form-input" rows={2} value={t.userPrompt || ''} onChange={(e) => updateAiDraftTest(t.id, { userPrompt: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />`, 'the user-prompt textarea routes through updateAiDraftTest');
  hasN(results, `<input className="form-input" placeholder="Fail keywords (comma-separated)" value={(t.failKeywords || []).join(', ')} onChange={(e) => updateAiDraftTest(t.id, { failKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} style={{ flex: '1 1 220px', fontSize: '0.72rem' }} />`, 'the fail-keywords input round-trips a comma-joined array');
  hasN(results, `<input className="form-input" placeholder="Refusal keywords (comma-separated)" value={(t.refusalKeywords || []).join(', ')} onChange={(e) => updateAiDraftTest(t.id, { refusalKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} style={{ flex: '1 1 220px', fontSize: '0.72rem' }} />`, 'the refusal-keywords input round-trips a comma-joined array');
});

test('The results pane renders from AiGenWizardResults (fine-tune card, selection list, per-test badges)', () => {
  hasN(results, `{aiWizardStep === 'results' && aiPreview && (`, 'the results body stays gated on the forwarded aiPreview');
  hasN(results, `<Sparkles size={14} /> Fine-tune these tests with another AI pass`, 'the fine-tune card header moved verbatim');
  hasN(results, `value={aiFineTune}
                      onChange={(e) => setAiFineTune(e.target.value)}`, 'the fine-tune textarea binds aiFineTune from context');
  hasN(results, `placeholder="e.g. Make the payloads shorter and more subtle. Add a variant that works when the model only replies with emojis."`, 'the fine-tune placeholder moved verbatim');
  hasN(results, `onClick={refineAiTests}
                        disabled={aiRefining || vaultLocked || !aiFineTune.trim()}`, 'the refine button gates on refining + vault lock + non-empty guidance');
  hasN(results, `title={vaultLocked ? 'Disabled in read-only mode — unlock your API keys' : undefined}`, 'the refine button explains the vault lock');
  hasN(results, `{aiRefining ? <><RefreshCw size={13} className="animate-spin-custom" /> Refining…</> : <><Wand2 size={13} /> Refine with AI</>}`, 'the refine button label mirrors aiRefining');
  hasN(results, `{aiRefining && aiGenStageDetail && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>{aiGenStageDetail}</div>
                    )}`, 'the refine progress line renders only while refining');
  hasN(results, `{aiWizardError && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-vulnerable)', marginTop: '6px' }}>{aiWizardError}</div>
                    )}`, 'refine errors surface inside the fine-tune card');
  hasN(results, `The AI generated {aiPreview.tests.length} test(s). Select the ones you want to add to the suite.`, 'the results count headline moved verbatim');
  hasN(results, `{aiUsedGuidance.trim() && (
                      <span style={{ display: 'block', marginTop: '2px', color: 'var(--color-warning)' }}>Guidance applied: &ldquo;{aiUsedGuidance}&rdquo;</span>
                    )}`, 'the applied-guidance line renders only when guidance was used');
  hasN(results, '{aiPreview.tests.map((t, i) => {', 'the results rows map the forwarded aiPreview');
  hasN(results, `const checked = aiPreviewSelected.has(t.id);`, 'row selection reads the forwarded aiPreviewSelected');
  hasN(results, `background: checked ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)'`, 'selected rows highlight');
  hasN(results, `<input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAiPreviewItem(t.id)}`, 'row checkboxes route through the forwarded toggleAiPreviewItem');
  hasN(results, `<span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {t.name}`, 'rows render their ordinal + test name');
  hasN(results, `<span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.techniqueId}</span>
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.tactic}</span>`, 'the techniqueId + tactic badges moved verbatim');
  hasN(results, `<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.description}</div>`, 'the row description moved verbatim');
  hasN(results, `Source: {t.sourceTitle}
                            </div>`, 'the row source title moved verbatim');
  hasN(results, `<span style={{ color: 'var(--color-secondary)' }}>Extract:</span> {t.sourceExtract}`, 'the source extract block renders conditionally');
  hasN(results, `<span style={{ color: 'var(--color-secondary)' }}>Context (system prompt):</span> {t.systemPrompt}`, 'the row system-prompt block moved verbatim');
  hasN(results, `<span style={{ color: 'var(--color-vulnerable)' }}>Payload (user prompt):</span> {t.userPrompt}`, 'the row payload block moved verbatim');
});

test('The four footer branches render from AiGenWizardResultsFooter (Back/Retry, profiles commit, draft routes, results actions)', () => {
  const footerIdx = results.indexOf('export function AiGenWizardResultsFooter(');
  assert.ok(footerIdx > 0, 'the footer export exists');
  const footer = results.slice(footerIdx);
  // Running: Back cancels; Retry re-runs with the remembered guidance.
  hasN(footer, `aiWizardStep === 'running' ? (
                <>
                  <button onClick={cancelAiGeneration} className="btn-secondary" title="Interrupt generation and go back">Back</button>
                  {aiWizardError && !aiGenerating && (
                    <button onClick={() => startAiGeneration(aiUsedGuidance)} className="btn-primary"><RefreshCw size={15} /> Retry</button>
                  )}
                </>
              )`, 'the running footer: Back (cancel + explainer title) and the error-gated Retry re-running with aiUsedGuidance');
  // Profiles: Back cancels; Continue commits the edits and resumes generation.
  hasN(footer, `<button onClick={cancelAiGeneration} className="btn-secondary">Back</button>`, 'the profiles footer Back button moved verbatim');
  hasN(footer, `<button
                    onClick={() => { setAiSourceProfiles(aiProfileEdits); runAiGeneration(); }}
                    disabled={aiGenerating}
                    className="btn-primary"
                    title="Continue with the (possibly edited) threat profiles"
                  >`, 'the profiles Continue button commits aiProfileEdits into the shared catalog and resumes the run');
  hasN(footer, `Generating… {aiGenProgress}%`, 'the profiles busy label shows live progress');
  hasN(footer, `'Continue to generation'`, 'the profiles idle label moved verbatim');
  // Draft: mode-aware Back; Add without refining; deep-only Refine & finish.
  hasN(footer, `<button onClick={() => setAiWizardStep(aiGenMode === 'deep' ? 'profiles' : 'config')} className="btn-secondary">Back</button>`, 'the draft Back button is mode-aware (deep → profiles, fast → config)');
  hasN(footer, `<button onClick={() => finalizeAiDraft(false)} className="btn-secondary">
                      Add without refining
                    </button>`, 'the Add-without-refining button routes finalizeAiDraft(false)');
  hasN(footer, `<button onClick={() => finalizeAiDraft(true)} disabled={aiGenerating} className="btn-primary">`, 'the Refine & finish button routes finalizeAiDraft(true) and gates on the busy flag');
  hasN(footer, `{aiGenMode === 'deep' && (`, 'the Refine & finish button renders only in deep mode');
  hasN(footer, `<><Wand2 size={15} /> Refine & finish</>`, 'the Refine & finish idle label moved verbatim');
  // Results: selected counter, New run, Cancel/Stop, Add Selected.
  hasN(footer, `{aiPreviewSelected ? aiPreviewSelected.size : 0} of {aiPreview.tests.length} selected`, 'the selected counter reads aiPreviewSelected.size against the preview length (null-guarded count only)');
  hasN(footer, `<button
                      onClick={() => { if (aiRefining) return; setAiWizardStep('sources'); setAiWizardError(''); }}
                      disabled={aiRefining}
                      className="btn-secondary"
                      title="Start a fresh run (your guidance is kept)"
                    >
                      <RotateCcw size={14} /> New run
                    </button>`, 'the New run button restarts at sources, blocked while refining, keeping the guidance');
  hasN(footer, `<button onClick={() => { cancelAiGeneration(); setAiWizardOpen(false); setAiPreview(null); setAiPreviewSelected(null); setAiWizardError(''); }} className="btn-secondary">
                      {aiRefining ? 'Stop' : 'Cancel'}
                    </button>`, 'the Cancel/Stop button tears down the run + preview state through the forwarded setters');
  hasN(footer, `<button onClick={confirmAiPreview} className="btn-primary">
                      <Plus size={15} /> Add Selected ({aiPreviewSelected ? aiPreviewSelected.size : 0})
                    </button>`, 'the Add Selected button routes confirmAiPreview with the live count');
  // The footer stays a component (not a lazily-evaluated JSX prop): the
  // unguarded aiPreview.tests read is safe only because the ternary chain
  // short-circuits and the modal renders it as the final footer branch.
  assert.match(footer, /aiWizardStep === 'running' \? \(/, 'the footer keeps its ternary-chain shape');
});

test('The seven pure state-transform handlers move into AiGenWizardResults — defined exactly once, zero App-side', () => {
  for (const name of ['const updateAiDraftTest = ', 'const removeAiDraftTest = ', 'const updateAiProfile = ', 'const updateAiProfileVector = ', 'const addAiProfileVector = ', 'const removeAiProfileVector = ', 'const toggleAiProfileExpand = ']) {
    assert.equal(countIn(results, name), 1, `${name.trim()} is defined exactly once results-side`);
    assert.equal(countIn(app, name), 0, `${name.trim()} is gone App-side (T18 moved it)`);
    assert.equal(countIn(modal, name), 0, `${name.trim()} is not redefined modal-side`);
  }
  hasN(results, `const updateAiDraftTest = (id, patch) => setAiDraft(prev => ({ ...prev, tests: prev.tests.map(t => t.id === id ? { ...t, ...patch } : t) }));`, 'updateAiDraftTest patches by id over the context state');
  hasN(results, `const removeAiDraftTest = (id) => setAiDraft(prev => ({ ...prev, tests: prev.tests.filter(t => t.id !== id) }));`, 'removeAiDraftTest filters by id');
  hasN(results, `const updateAiProfile = (key, patch) => setAiProfileEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));`, 'updateAiProfile shallow-merges the patch');
  hasN(results, `const updateAiProfileVector = (key, idx, patch) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: (prev[key]?.vectors || []).map((v, i) => i === idx ? { ...v, ...patch } : v) }
  }));`, 'updateAiProfileVector patches the vector at idx (null-safe)');
  hasN(results, `const addAiProfileVector = (key) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: [...(prev[key]?.vectors || []), { name: 'New vector', description: '', payloadShape: '', techniqueId: '', techniqueName: '', evidence: '' }] }
  }));`, 'addAiProfileVector appends the seeded blank vector');
  hasN(results, `const removeAiProfileVector = (key, idx) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: (prev[key]?.vectors || []).filter((_, i) => i !== idx) }
  }));`, 'removeAiProfileVector filters the vector at idx (null-safe)');
  hasN(results, `const toggleAiProfileExpand = (key) => setAiProfileExpanded(prev => ({ ...prev, [key]: !prev[key] }));`, 'toggleAiProfileExpand flips the per-source flag');
  // The orchestration handlers may live in useAIGeneration (the AI-gen domain
  // owns the preview ops + the refine abort ref) — defined exactly once each
  // hook-side, still forwarded to the results surface.
  for (const name of ['const finalizeAiDraft = ', 'const refineAiTests = ', 'const cancelAiGeneration = ', 'const toggleAiPreviewItem = ']) {
    assert.equal(countIn(hook, name), 1, `${name.trim()} is defined exactly once hook-side (T05)`);
    assert.equal(countIn(app, name), 0, `${name.trim()} is gone App-side (T05 moved it)`);
    assert.equal(countIn(results, name), 0, `${name.trim()} is not redefined results-side`);
  }
  hasN(hook, `const finalizeAiDraft = (refine) => {
    if (aiDraft.tests.length === 0) { setAiWizardError('There are no tests to continue with — go back and regenerate.'); return; }
    if (refine) { runAiCritique(); return; }
    setAiPreview({ tests: aiDraft.tests });
    setAiPreviewSelected(new Set(aiDraft.tests.map(t => t.id)));
    setAiWizardStep('results');
  };`, 'finalizeAiDraft keeps its exact body (empty-draft guard, refine route, preview commit; hook-side since T05)');
  has(hook, `const toggleAiPreviewItem = (id) => {`, 'toggleAiPreviewItem is defined hook-side (T05)');
  assert.equal(countIn(hook, 'const cancelAiGeneration = '), 1, 'cancelAiGeneration is defined exactly once hook-side (abort refs, T05)');
});

test('The state the panes drive keeps its owners — contexts own the preview state, App binds and forwards it, hook bindings untouched', () => {
  // The preview state is context-owned; App binds it from useAIGen() (the
  // setters do not migrate into the hook bag — the hook consumes the context
  // directly).
  has(readSource('src/context/AIGenContext.jsx'), 'const [aiPreview, setAiPreview] = useState(null);', 'aiPreview is context-owned useState(null)');
  has(readSource('src/context/AIGenContext.jsx'), 'const [aiPreviewSelected, setAiPreviewSelected] = useState(null);', 'aiPreviewSelected is context-owned useState(null)');
  const aiGenDestructure = /const \{([^}]*)\}\s*=\s*useAIGen\(\)/.exec(app);
  assert.ok(aiGenDestructure, 'App destructures useAIGen()');
  for (const name of ['aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected']) {
    assert.match(aiGenDestructure[1], new RegExp(`\\b${name}\\b`), `App binds ${name} from the context (T04)`);
  }
  assert.ok(hook.includes('const confirmAiPreview = '), 'confirmAiPreview is still hook-defined (T09)');
  assert.ok(hook.includes('const startAiGeneration = '), 'startAiGeneration is still hook-defined (T09)');
  // Context-provided names are NOT duplicated as module state in the results file.
  assert.equal(countIn(results, 'useState('), 0, 'the results file defines no useState of its own');
  assert.equal(countIn(results, 'createContext'), 0, 'the results file defines no context of its own');
  // The vault flag: still read via useProviders (no prop shadowing) and used
  // only for the refine gate + its explainer title.
  assert.ok(providers.includes('const [vaultLocked, setVaultLocked] = useState(false);'), 'ProvidersContext owns vaultLocked');
  has(results, `disabled={aiRefining || vaultLocked || !aiFineTune.trim()}`, 'the refine gate still consumes vaultLocked');
  has(results, `title={vaultLocked ? 'Disabled in read-only mode — unlock your API keys' : undefined}`, 'the refine button title still explains the vault lock');
});

test('The modal composes the results surface — body panes after config, footer branch final, one forwarding object', () => {
  assert.ok(modal.includes("import AiGenWizardResults, { AiGenWizardResultsFooter } from './AiGenWizardResults';"), 'the modal imports both results exports');
  const bodyIdx = modal.indexOf("<div style={{ flexGrow: 1, overflowY: 'auto'");
  const configIdx = modal.indexOf("{aiWizardStep === 'config' && (");
  const resultsIdx = modal.indexOf('<AiGenWizardResults {...resultsBindings} />');
  const footerIdx = modal.indexOf('{/* footer */}');
  assert.ok(bodyIdx >= 0 && configIdx > bodyIdx && resultsIdx > configIdx && footerIdx > resultsIdx,
    'modal body order: body container → sources → config → <AiGenWizardResults …/> → close → footer');
  const chainIdx = modal.indexOf(") : aiWizardStep === 'config' ? (");
  const footerCallIdx = modal.indexOf('<AiGenWizardResultsFooter {...resultsBindings} />');
  assert.ok(chainIdx >= 0 && footerCallIdx > chainIdx, 'the footer chain ends in the results footer component');
  hasN(modal, `) : (
            <AiGenWizardResultsFooter {...resultsBindings} />
          )}`, 'the footer chain\'s final branch renders the results footer');
  assert.equal(countIn(modal, '<AiGenWizardResults {...resultsBindings} />'), 1, 'the results body is composed exactly once modal-side');
  assert.equal(countIn(modal, '<AiGenWizardResultsFooter {...resultsBindings} />'), 1, 'the results footer is composed exactly once modal-side');
  assert.equal(countIn(modal, 'const resultsBindings = {'), 1, 'resultsBindings is defined exactly once modal-side');
  const bindings = modal.slice(modal.indexOf('const resultsBindings = {'), modal.indexOf('};', modal.indexOf('const resultsBindings = {')));
  for (const binding of FORWARDED) {
    assert.ok(new RegExp(`\\b${binding}\\b`).test(bindings), `resultsBindings forwards ${binding}`);
  }
  if (bindings.includes('renderActiveModelChip')) {
    assert.ok(true, 'resultsBindings forwards renderActiveModelChip (pre-T08)');
  } else {
    assert.ok(results.includes("import { ActiveModelChip } from '../ActiveModelChip';"), 'the chip reaches the results surface via the component import (T08)');
    assert.doesNotMatch(results, /renderActiveModelChip,/, 'the results state hook drops the chip binding (T08)');
  }
  // The extraSteps/renderExtraFooter slots are absent modal- and App-side.
  assert.doesNotMatch(modal, /\bextraSteps\b/, 'the extraSteps slot is gone modal-side');
  assert.doesNotMatch(modal, /\brenderExtraFooter\b/, 'the renderExtraFooter slot is gone modal-side');
  assert.equal(countIn(app, 'extraSteps'), 0, 'the extraSteps slot is gone App-side');
  assert.equal(countIn(app, 'renderExtraFooter'), 0, 'the renderExtraFooter slot is gone App-side');
  // The modal still reads none of the downstream pane state in code.
  const modalCode = stripComments(modal);
  assert.doesNotMatch(modalCode, /\baiDraft\b|\baiProfileEdits\b|\baiProfileExpanded\b|\baiFineTune\b/, 'the modal reads none of the downstream pane state (the results file does)');
  // The conditional mount stays App-side with bare-identifier props.
  assert.equal(countIn(app, '{aiWizardOpen && ('), 1, 'exactly one conditional wizard mount remains in App.jsx');
  // The modal mount resolves from either side of the component move —
  // render-helper props or gen sync derivations + chip formatter.
  if (app.includes('          renderGenSelector={renderGenSelector}')) {
    hasN(app, `<AiGenWizardModal
          renderGenSelector={renderGenSelector}
          renderActiveModelChip={renderActiveModelChip}
          toggleAiGenSource={toggleAiGenSource}
          toggleAiGenUrl={toggleAiGenUrl}
          startAiGeneration={startAiGeneration}`, 'the mount keeps the five shell bindings as bare-identifier props');
  } else {
    hasN(app, `<AiGenWizardModal
          selectedGenProvider={selectedGenProvider}
          genModelList={genModelList}
          saveGenConfig={saveGenConfig}
          providers={providers}
          helperProviderSelectable={helperProviderSelectable}
          providerLabel={providerLabel}
          toggleAiGenSource={toggleAiGenSource}
          toggleAiGenUrl={toggleAiGenUrl}
          startAiGeneration={startAiGeneration}`, 'the mount keeps the shell bindings as bare-identifier props (T08 component era)');
  }
  for (const binding of ['cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests', 'toggleAiPreviewItem', 'runAiGeneration', 'confirmAiPreview', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected']) {
    assert.ok(app.includes(`          ${binding}={${binding}}`), `the mount forwards ${binding} as a bare-identifier prop`);
  }
  assert.doesNotMatch(modal, /\baiWizardOpen\b/, 'the modal still never reads aiWizardOpen (App owns the conditional)');
});

test('Step order inside the results file matches the wizard flow (running → profiles → draft → results)', () => {
  const bodyIdx = results.indexOf('export default function AiGenWizardResults(');
  const footerIdx = results.indexOf('export function AiGenWizardResultsFooter(');
  const runningIdx = results.indexOf("aiWizardStep === 'running' && (", bodyIdx);
  const profilesIdx = results.indexOf("aiWizardStep === 'profiles' && (", bodyIdx);
  const draftIdx = results.indexOf("aiWizardStep === 'draft' && (", bodyIdx);
  const resultsIdx = results.indexOf("aiWizardStep === 'results' && aiPreview && (", bodyIdx);
  assert.ok(runningIdx > bodyIdx && runningIdx < footerIdx, 'the running pane lives in the body export');
  assert.ok(profilesIdx > runningIdx && draftIdx > profilesIdx && resultsIdx > draftIdx && resultsIdx < footerIdx,
    'body order is: running → profiles → draft → results (results gated on aiPreview)');
  assert.ok(results.indexOf("aiWizardStep === 'running' ? (") > footerIdx, 'the footer branches live in the footer export');
  // The step bodies exist exactly once tree-wide.
  assert.equal(countIn(app, "aiWizardStep === 'running' && ("), 0, 'the running conditional is gone App-side');
  assert.equal(countIn(results, "aiWizardStep === 'running' && ("), 1, 'the running conditional exists exactly once results-side');
  assert.equal(countIn(results, "aiWizardStep === 'results' && aiPreview && ("), 1, 'the results conditional exists exactly once results-side');
});

test('App.jsx loses the wizard panes (shrink + exactly-once gates)', () => {
  const appLines = app.split('\n').length;
  const resultsLines = results.split('\n').length;
  assert.ok(appLines < 3450, `App.jsx shrank below 3450 lines (baseline 3761, simulated port landed ${appLines})`);
  assert.ok(resultsLines > 330, `the results file carries the moved surface (simulated port landed ${resultsLines} lines)`);
  // The step-body markers are absent App-side, present exactly once results-side.
  for (const marker of ['Generation failed', 'Add Selected', 'Continue to generation', 'Refine & finish', 'Fine-tune these tests with another AI pass', 'No profile — raw content', 'No tests were generated. Go back and try fewer tests']) {
    assert.equal(countIn(app, marker), 0, `App no longer renders "${marker}"`);
    assert.equal(countIn(results, marker), 1, `the results file renders "${marker}" exactly once`);
  }
  // The shared render helpers keep their exactly-once homes and split call
  // sites. Definition homes + call-site forms resolve from either side of the
  // selector-component move (App render helpers or shared components; the App
  // wirings become inline component mounts).
  const genComponent = readIfExists('src/components/GenModelSelector.jsx');
  const chipComponent = readIfExists('src/components/ActiveModelChip.jsx');
  assert.equal(countIn(app, 'const renderGenSelector =') + countIn(genComponent, 'export function GenModelSelector('), 1, 'the gen selector keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  const settingsView = readSource('src/components/views/SettingsView.jsx');
  // The Helper Models card may live in HelperModelsCard.jsx — the selector
  // call site resolves across the view ∪ helper-card set either way.
  const helperCard = readIfExists('src/components/views/settings/HelperModelsCard.jsx');
  assert.equal(countIn(app + '\n' + settingsView + '\n' + helperCard, '{renderGenSelector()}') + countIn(settingsView + '\n' + helperCard, '<GenModelSelector'), 1, 'the helper-models gen selector renders exactly once across the view ∪ helper card (either form)');
  assert.equal(countIn(modal, '{renderGenSelector()}') + countIn(modal, '<GenModelSelector'), 1, 'the config step gen selector renders modal-side exactly once (either form)');
  assert.equal(countIn(app, 'const renderActiveModelChip =') + countIn(chipComponent, 'export function ActiveModelChip('), 1, 'the chip keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.equal([...app.matchAll(/renderActiveModelChip\(/g)].length + [...app.matchAll(/<ActiveModelChip /g)].length, chipComponent ? 2 : 0, 'App hosts no chip call site pre-T08; post-T08 exactly its two inline pass-through mounts (T08)');
  assert.equal([...results.matchAll(/renderActiveModelChip\(/g)].length + [...results.matchAll(/<ActiveModelChip /g)].length, 1, 'the running-step chip renders results-side exactly once (either form)');
  assert.equal([...modal.matchAll(/renderActiveModelChip\(/g)].length + [...modal.matchAll(/<ActiveModelChip /g)].length, 1, 'the config-step chip renders modal-side exactly once (either form)');
  // The hook's pipeline ops and draft commit stay untouched.
  assert.ok(hook.includes('const confirmAiPreview = '), 'confirmAiPreview stays hook-defined');
  assert.ok(hook.includes("setAiWizardStep('draft');"), 'the hook still lands generation on the draft step');
  assert.ok(hook.includes("setAiWizardStep('profiles');"), 'the hook still pauses at the profiles checkpoint');
  assert.ok(hook.includes("if (!aiAdvancedMode) setAiWizardStep('running');"), 'the hook still advances simple mode straight to running');
});

test('The tour anchor split is preserved and the results file carries no anchors', () => {
  assert.equal(countIn(stripComments(results), 'data-tour'), 0, 'the results file introduces zero data-tour anchors');
  assert.ok(appTour.includes(`target: '[data-tour="ai-generate"]'`), 'the tour config keeps the ai-generate step (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.ok(view.includes('data-tour="ai-generate"'), 'the ai-generate anchor still lives on the TestsView button (T11)');
});
