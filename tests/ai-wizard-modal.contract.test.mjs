// Contract: the AI generation wizard shell (overlay, glass-card frame, header,
// step indicator, close button) plus the sources step and the config step of
// App.jsx's `{/* 4b. AI TEST GENERATION WIZARD */}` region are implemented
// inside src/components/modals/AiGenWizardModal.jsx — the modal consumes the
// AIGenContext state directly (useAIGen) and the shared effective generator
// config (useSettings), receives the hook bindings and the App-local render
// helpers as props, and renders the App-supplied running/profiles/draft/results
// slots; App.jsx keeps the conditional mount ({aiWizardOpen && ...}) and the
// frame/config JSX lives modal-side.
//
// Domain ownership: the downstream step-navigation checkpoint ops
// (openAiWizard/finalizeAiDraft/cancelAiGeneration) are useAIGeneration
// hook-bound actions, so those pins follow the bodies hook-side.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/source-intake.contract.test.mjs
// and tests/settings-platform-cards.contract.test.mjs). Pins are
// whitespace-normalized so any re-indentation cannot stale them.
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

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };

const app = readSource(APP_PATH);
const modal = readSource(MODAL_PATH);
const results = readSource(RESULTS_PATH);
const hook = readSource(HOOK_PATH);
const view = readSource(VIEW_PATH);
const pair = app + '\n' + modal;

// The guided-tour step definitions live in the pure factory module
// src/utils/tour-steps.js — the App-side tour-copy pin resolves from either
// side (App.jsx or the module, which may be absent).
let tour = '';
try { tour = readSource('src/utils/tour-steps.js'); } catch { /* absent */ }
// App-side tour copy resolves across App.jsx ∪ src/utils/tour-steps.js (the
// factory module may own it; the file may be absent).
const appTour = app + '\n' + tour;

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hasN = (source, needle, msg) => { assert.ok(norm(source).includes(norm(needle)), msg); };
const countIn = (source, needle) => source.split(needle).length - 1;

// Every state name the moved JSX drives — the modal must read them from the
// AIGenContext destructure, not receive them as props.
const CTX_NAMES = [
  'aiWizardStep', 'setAiWizardStep', 'setAiWizardOpen', 'setAiWizardError',
  'aiAdvancedMode', 'setAiAdvancedMode', 'aiGenSourceKeys', 'aiGenUrls',
  'aiGenCountInput', 'updateAiGenCountInput', 'commitAiGenCount',
  'aiGenBatch', 'setAiGenBatch', 'aiGenBudget', 'setAiGenBudget',
  'aiGenMode', 'setAiGenMode', 'aiGenerating', 'aiGenStage', 'aiGenProgress',
];

test('AiGenWizardModal.jsx is the real modal — named + default export, direct context consumption, exact prop contract', () => {
  assert.match(modal, /export default function AiGenWizardModal\(\{/, 'the component is the file\'s default export');
  assert.ok(modal.includes("import { useAIGen } from '../../context/useAIGen';"), 'the modal consumes AIGenContext directly');
  assert.ok(modal.includes("import { useSettings } from '../../context/SettingsContext';"), 'the modal reads the shared generator config from SettingsContext');
  assert.ok(modal.includes("import { PROMPT_SOURCING_INFO } from '../../data/payloads';"), 'the modal imports the bundled source catalog itself');
  assert.ok(modal.includes("} = useAIGen();"), 'the wizard state comes from the modal\'s own useAIGen() destructure');
  const destructure = modal.slice(modal.indexOf('  const {'), modal.indexOf('} = useAIGen();'));
  for (const name of CTX_NAMES) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(destructure), `the modal destructure carries ${name} from useAIGen()`);
  }
  assert.ok(/\} = useSettings\(\);/.test(modal), 'the modal consumes useSettings() directly');
  const settingsDestructure = modal.slice(modal.indexOf('  const { effectiveGenConfig'), modal.indexOf('} = useSettings();'));
  assert.ok(settingsDestructure.includes('effectiveGenConfig'), 'effectiveGenConfig comes from the modal\'s own useSettings() destructure');
  // The prop contract: five shell bindings + the App-owned bindings forwarded
  // to the results surface — nothing else. The two render-prop bindings
  // resolve from either side of the component move — the modal either takes
  // the App render helpers or the gen sync derivations + the chip formatter
  // and imports the components itself.
  if (modal.includes('  renderGenSelector,')) {
    for (const prop of ['renderGenSelector', 'renderActiveModelChip', 'toggleAiGenSource', 'toggleAiGenUrl', 'startAiGeneration', 'cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests', 'toggleAiPreviewItem', 'runAiGeneration', 'confirmAiPreview', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected']) {
      assert.ok(modal.includes(`  ${prop},`), `the modal takes ${prop} as a prop`);
    }
  } else {
    for (const prop of ['selectedGenProvider', 'genModelList', 'saveGenConfig', 'providers', 'helperProviderSelectable', 'providerLabel', 'toggleAiGenSource', 'toggleAiGenUrl', 'startAiGeneration', 'cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests', 'toggleAiPreviewItem', 'runAiGeneration', 'confirmAiPreview', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected']) {
      assert.ok(modal.includes(`  ${prop},`), `the modal takes ${prop} as a prop (T08 component era)`);
    }
    assert.ok(modal.includes("import { GenModelSelector } from '../GenModelSelector';"), 'the modal imports the shared generator selector (T08)');
    assert.ok(modal.includes("import { ActiveModelChip } from '../ActiveModelChip';"), 'the modal imports the shared chip (T08)');
  }
  assert.doesNotMatch(modal, /aiGenCount\b/, 'the modal drives the committed count through the context API (update/commit), not raw state');
});

test('The wizard frame renders from the modal (overlay, glass-card, header, step indicator, close)', () => {
  hasN(modal, `position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)'`, 'the fixed full-screen overlay block moved verbatim');
  hasN(modal, `zIndex: 110,
          padding: '20px'`, 'the overlay sits at zIndex 110 with 20px padding');
  hasN(modal, `<div className="glass-card" style={{ width: '100%', maxWidth: '960px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>`, 'the glass-card frame moved verbatim');
  hasN(modal, `<Wand2 size={18} color="var(--color-primary)" /> AI Test Generator`, 'the header title renders the Wand2 icon + AI Test Generator copy');
  hasN(modal, `<button onClick={() => { setAiWizardOpen(false); setAiWizardError(''); }} className="btn-secondary" style={{ padding: '6px' }}>
                <X size={14} />
              </button>`, 'the header close button clears open+error state');
  hasN(modal, `aiAdvancedMode
                      ? [['sources', '1. Sources'], ['config', '2. Options'], ['profiles', '3. Profiles'], ['draft', '4. Screening'], ['results', '5. Review & add']]
                      : [['sources', '1. Sources'], ['config', '2. Options'], ['running', '3. Generate'], ['results', '4. Review & add']]`,
    'the step indicator lists the advanced (5-chip) and simple (4-chip) orders');
  hasN(modal, `color: aiWizardStep === s ? '#fff' : 'var(--text-muted)',
                      background: aiWizardStep === s ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-subtle)'`, 'the active chip styling moved verbatim');
  hasN(modal, `<div style={{ flexGrow: 1, overflowY: 'auto', marginTop: '14px', paddingRight: '4px' }}>`, 'the scrollable body container moved verbatim');
  hasN(modal, `<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '12px', flexWrap: 'wrap' }}>`, 'the footer container moved verbatim');
});

test('The sources step renders from the modal (rows, badges, toggles, counts, warning)', () => {
  hasN(modal, `{aiWizardStep === 'sources' && (`, 'the sources step conditional opens modal-side');
  hasN(modal, 'Select sources for this run ({aiGenSourceKeys.length + aiGenUrls.filter(s => s.enabled).length} selected)', 'the selected-count headline moved verbatim');
  hasN(modal, '{Object.entries(PROMPT_SOURCING_INFO).map(([key, info]) => (', 'the predefined rows map the modal\'s own PROMPT_SOURCING_INFO import');
  hasN(modal, `<input type="checkbox" checked={aiGenSourceKeys.includes(key)} onChange={() => toggleAiGenSource(key)} style={{ accentColor: 'var(--color-primary)' }} />`, 'the predefined-row checkbox routes through the toggleAiGenSource prop');
  hasN(modal, '<span className="badge" style={{ fontSize: \'0.5rem\', background: \'rgba(96,165,250,0.15)\', color: \'var(--color-primary)\', border: \'1px solid var(--border-subtle)\' }}>DEFAULT</span>', 'the DEFAULT badge moved verbatim');
  hasN(modal, '{aiGenUrls.map(s => (', 'the custom rows map aiGenUrls');
  hasN(modal, `<input type="checkbox" checked={s.enabled} onChange={() => toggleAiGenUrl(s.id)} style={{ accentColor: 'var(--color-primary)' }} />`, 'the custom-row checkbox routes through the toggleAiGenUrl prop');
  hasN(modal, '<span className="badge" style={{ fontSize: \'0.5rem\', background: \'rgba(168,85,247,0.15)\', color: \'var(--color-secondary)\', border: \'1px solid var(--border-subtle)\' }}>CUSTOM</span>', 'the CUSTOM badge moved verbatim');
  hasN(modal, `{s.title || s.url || 'Untitled source'}`, 'the custom-row title fallback moved verbatim');
  hasN(modal, 'No sources selected — tick at least one above (or add one in the panel on the Test Management tab).', 'the zero-sources warning copy moved verbatim');
});

test('The config step renders from the modal (generator model picker + advanced/count/batch/budget/mode options)', () => {
  hasN(modal, `{aiWizardStep === 'config' && (`, 'the config step conditional opens modal-side');
  hasN(modal, `<Cpu size={16} color="var(--color-primary)" />`, 'the generator-model card header icon moved');
  hasN(modal, `<span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Generator model</span>`, 'the Generator model title moved verbatim');
  // The chip renders in either accepted form (render-prop call or shared
  // component).
  assert.equal(countIn(modal, "{renderActiveModelChip('', effectiveGenConfig)}") + countIn(modal, '<ActiveModelChip label="" cfg={effectiveGenConfig} providerLabel={providerLabel} />'), 1, 'the active-model chip renders modal-side exactly once (either form) with the modal\'s own useSettings config');
  hasN(modal, 'Overrides the Settings default for this run.', 'the override explainer copy moved verbatim');
  hasN(modal, 'Test quality depends on the model — weak models can produce malformed or nonsensical tests.', 'the model-quality warning copy moved verbatim');
  // The gen selector renders in either accepted form (render-prop call or
  // shared component).
  assert.equal(countIn(modal, '{renderGenSelector()}') + countIn(modal, '<GenModelSelector'), 1, 'the generator provider/model picker renders modal-side exactly once (either form)');
  hasN(modal, `<Terminal size={16} color="var(--color-primary)" />`, 'the generation-options card header icon moved');
  hasN(modal, `<span>Generation options</span>`, 'the Generation options title moved verbatim');
  // Persisted toggles — each setItem is written exactly once across the pair.
  hasN(modal, `{[['off', 'Simple'], ['on', 'Advanced']].map(([val, label]) => {`, 'the advanced-mode toggle maps Simple/Advanced');
  hasN(modal, `onClick={() => { setAiAdvancedMode(on); localStorage.setItem('atlas_ai_gen_advanced', on ? '1' : '0'); }}`, 'the advanced toggle still persists atlas_ai_gen_advanced');
  hasN(modal, 'Simple = analysis, generation and refinement run autonomously and you only review the final', 'the simple/advanced explainer copy moved verbatim');
  hasN(modal, `<span style={{ fontSize: '0.8rem', fontWeight: 600, width: '120px', flexShrink: 0 }}>How many tests</span>`, 'the count label moved verbatim');
  hasN(modal, `onChange={(e) => updateAiGenCountInput(e.target.value)}
                        onBlur={() => commitAiGenCount(aiGenCountInput)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAiGenCount(aiGenCountInput); } }}`, 'the count input wiring moved verbatim (live clamp on change, clamp+mirror on blur/Enter)');
  hasN(modal, 'min="1"', 'the count input clamps at 1');
  hasN(modal, 'max="20"', 'the count input clamps at 20');
  hasN(modal, 'The critique pass may return fewer after filtering weak or duplicate tests.', 'the count explainer copy moved verbatim');
  hasN(modal, `<select
                        value={aiGenBatch}`, 'the batch select reads aiGenBatch');
  hasN(modal, `onChange={(e) => { const v = Math.max(1, Math.min(5, Number(e.target.value) || 1)); setAiGenBatch(v); localStorage.setItem('atlas_ai_gen_batch', String(v)); }}`, 'the batch onChange still clamps 1..5 and persists atlas_ai_gen_batch');
  hasN(modal, '{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}', 'the batch options are 1..5');
  hasN(modal, '1 = most diverse but more calls; higher = fewer calls,', 'the batch explainer copy moved verbatim');
  hasN(modal, `<select
                        value={aiGenBudget}`, 'the budget select reads aiGenBudget');
  hasN(modal, `onChange={(e) => { const v = Number(e.target.value) || 2048; setAiGenBudget(v); localStorage.setItem('atlas_ai_gen_budget', String(v)); }}`, 'the budget onChange still defaults 2048 and persists atlas_ai_gen_budget');
  hasN(modal, '{[1024, 2048, 4096, 8192].map(n => <option key={n} value={n}>{n} tokens</option>)}', 'the budget options are 1024..8192 tokens');
  hasN(modal, `{[['fast', 'Fast'], ['deep', 'Deep (recommended)']].map(([val, label]) => (`, 'the mode toggle maps Fast/Deep');
  hasN(modal, `onClick={() => { setAiGenMode(val); localStorage.setItem('atlas_ai_gen_mode', val); }}`, 'the mode toggle still persists atlas_ai_gen_mode');
  hasN(modal, `aiGenMode === 'deep'
                        ? 'Analyzes each source, then critiques the result — better quality, more API calls.'
                        : 'Single pass — fewer API calls, faster, slightly lower quality.'`, 'the mode explainer ternary moved verbatim');
  hasN(modal, 'Deep mode makes a few API calls per generation (batched source analysis + generate + critique)', 'the deep-mode quota warning copy moved verbatim');
  for (const key of ['atlas_ai_gen_advanced', 'atlas_ai_gen_batch', 'atlas_ai_gen_budget', 'atlas_ai_gen_mode']) {
    assert.equal(countIn(modal, `localStorage.setItem('${key}'`), 1, `${key} is persisted exactly once modal-side`);
    assert.equal(countIn(app, `localStorage.setItem('${key}'`), 0, `${key} is no longer persisted App-side`);
  }
});

test('Sources/config footer buttons and their validation gates moved verbatim', () => {
  hasN(modal, `<button onClick={() => setAiWizardOpen(false)} className="btn-secondary">Cancel</button>`, 'the sources Cancel button moved verbatim');
  hasN(modal, `<button
                    onClick={() => setAiWizardStep('config')}`, 'the sources Next button advances to config');
  hasN(modal, `disabled={aiGenSourceKeys.length === 0 && aiGenUrls.filter(s => s.enabled).length === 0}`, 'the Next button stays disabled with zero selected sources');
  hasN(modal, `title="Select at least one source, then configure the run"`, 'the Next button carries the gate explainer');
  hasN(modal, `<button onClick={() => setAiWizardStep('sources')} className="btn-secondary">Back</button>`, 'the config Back button returns to sources');
  hasN(modal, `<button
                    onClick={() => { startAiGeneration(''); }}`, 'the config Generate button starts the run with empty guidance');
  hasN(modal, `disabled={aiGenerating}`, 'the Generate button gates on the busy flag');
  hasN(modal, `title={aiGenerating ? 'Generating — please wait' : 'Start generating tests with the selected sources'}`, 'the Generate button title mirrors the busy flag');
  hasN(modal, `{aiGenStage === 'generating' || aiGenStage === 'critiquing' ? 'Generating…' : 'Analyzing…'} {aiGenProgress}%`, 'the busy label shows stage + progress');
  // Exactly-once across App + modal for the moved wirings.
  assert.equal(countIn(pair, "onChange={() => toggleAiGenSource(key)}"), 1, 'the predefined-row checkbox binding exists exactly once across the pair');
  assert.equal(countIn(pair, "onChange={() => toggleAiGenUrl(s.id)}"), 1, 'the custom-row checkbox binding exists exactly once across the pair');
  assert.equal(countIn(pair, 'Select sources for this run ({aiGenSourceKeys.length + aiGenUrls.filter(s => s.enabled).length} selected)'), 1, 'the selected-count headline exists exactly once across the pair');
  assert.equal(countIn(pair, 'disabled={aiGenSourceKeys.length === 0 && aiGenUrls.filter(s => s.enabled).length === 0}'), 1, 'the zero-source disable guard exists exactly once across the pair');
  assert.equal(countIn(pair, "onClick={() => { startAiGeneration(''); }}"), 1, 'the Generate-button wiring exists exactly once across the pair');
});

test('The downstream step-navigation chain behaves identically (results + hook owners; checkpoint ops domain-side since T05)', () => {
  // The wizard checkpoint ops (openAiWizard/finalizeAiDraft/
  // cancelAiGeneration) are useAIGeneration hook-bound — the pins follow the
  // bodies.
  hasN(hook, `const openAiWizard = () => {
    setAiWizardError('');
    setAiWizardStep(aiPreview && aiPreview.tests.length ? 'results' : 'sources');
    setAiWizardOpen(true);
  };`, 'openAiWizard still resumes a pending results run (hook-side since T05, body unchanged)');
  hasN(hook, `setAiWizardStep('results');`, 'finalizeAiDraft still advances to the results step');
  hasN(hook, `setAiWizardError('There are no tests to continue with — go back and regenerate.')`, 'the empty-draft guard still blocks finalize');
  assert.equal(countIn(hook, 'const cancelAiGeneration = '), 1, 'cancelAiGeneration stays defined exactly once (hook-side since T05)');
  assert.equal(countIn(app, 'const cancelAiGeneration = '), 0, 'cancelAiGeneration is no longer App-defined (T05)');
  // The downstream footer branches render from AiGenWizardResults.jsx.
  hasN(results, `<button onClick={() => setAiWizardStep(aiGenMode === 'deep' ? 'profiles' : 'config')} className="btn-secondary">Back</button>`, 'the draft Back button is still mode-aware (results-side since T18)');
  hasN(results, `onClick={() => { if (aiRefining) return; setAiWizardStep('sources'); setAiWizardError(''); }}`, 'the results New run button still restarts at sources (results-side since T18)');
  hasN(results, `<button
                    onClick={() => { setAiSourceProfiles(aiProfileEdits); runAiGeneration(); }}`, 'the profiles Continue button still commits edits and resumes generation (results-side since T18)');
  hasN(results, `onClick={() => startAiGeneration(aiUsedGuidance)}`, 'the Retry button still re-runs with the remembered guidance (results-side since T18)');
  // Hook-side routing stays put.
  assert.ok(hook.includes("if (!aiAdvancedMode) setAiWizardStep('running');"), 'simple mode still advances straight to the running step (hook-side)');
  assert.ok(hook.includes("setAiWizardStep('profiles');"), 'advanced mode still pauses at the profiles checkpoint (hook-side)');
  assert.ok(hook.includes("setAiWizardStep('draft');"), 'generation still lands on the draft step (hook-side)');
  // The downstream step bodies render from AiGenWizardResults.
  hasN(results, `{aiWizardStep === 'running' && (`, 'the running step body is results-side');
  hasN(results, `{aiWizardStep === 'profiles' && (`, 'the profiles step body is results-side');
  hasN(results, `{aiWizardStep === 'draft' && (`, 'the draft step body is results-side');
  hasN(results, `{aiWizardStep === 'results' && aiPreview && (`, 'the results step body is results-side');
  assert.ok(results.includes('.filter(ph => aiGenMode === \'deep\' || ph.id === \'generating\')'), 'the running rail still hides analysis in fast mode (results-side since T18)');
  assert.ok(results.includes('Elapsed: {aiGenElapsed}s'), 'the running screen still renders elapsed seconds (results-side since T18)');
});

test('Tour anchors preserved — the modal carries none, the ai-generate anchor stays view-side', () => {
  assert.equal(countIn(modal, 'data-tour'), 0, 'the extracted modal introduces zero data-tour anchors');
  assert.ok(appTour.includes(`target: '[data-tour="ai-generate"]'`), 'the tour config keeps the ai-generate step (App-side pre-T10, src/utils/tour-steps.js after)');
  assert.ok(view.includes('data-tour="ai-generate"'), 'the ai-generate anchor still lives on the TestsView button (T11)');
});

test('The modal mounts only when open — conditional render preserved, closed-wizard cost zero', () => {
  assert.equal(countIn(app, '{aiWizardOpen && ('), 1, 'exactly one conditional wizard mount remains in App.jsx');
  assert.ok(app.includes("import AiGenWizardModal from './components/modals/AiGenWizardModal';"), 'App imports the modal');
  // The modal mount resolves from either side of the component move —
  // render-helper props, or gen sync derivations + chip formatter.
  if (app.includes('          renderGenSelector={renderGenSelector}')) {
    hasN(app, `{aiWizardOpen && (
        <AiGenWizardModal
          renderGenSelector={renderGenSelector}
          renderActiveModelChip={renderActiveModelChip}
          toggleAiGenSource={toggleAiGenSource}
          toggleAiGenUrl={toggleAiGenUrl}
          startAiGeneration={startAiGeneration}`, 'the mount passes the five bindings as bare-identifier props');
  } else {
    hasN(app, `{aiWizardOpen && (
        <AiGenWizardModal
          selectedGenProvider={selectedGenProvider}
          genModelList={genModelList}
          saveGenConfig={saveGenConfig}
          providers={providers}
          helperProviderSelectable={helperProviderSelectable}
          providerLabel={providerLabel}
          toggleAiGenSource={toggleAiGenSource}
          toggleAiGenUrl={toggleAiGenUrl}
          startAiGeneration={startAiGeneration}`, 'the mount passes the component-era data bindings as bare-identifier props (T08)');
  }
  // The modal never reads the open flag and never early-returns: App owns the gating.
  assert.doesNotMatch(modal, /\baiWizardOpen\b/, 'the modal does not read aiWizardOpen (App owns the conditional)');
  assert.doesNotMatch(modal, /if \(!.*\) return null;/, 'the modal has no null-gate early return');
  // The results surface composes into the right containers: the panes
  // component renders after the config conditional inside the body, and the
  // footer component renders as the footer chain's final branch.
  const bodyIdx = modal.indexOf("<div style={{ flexGrow: 1, overflowY: 'auto'");
  const configIdx = modal.indexOf("{aiWizardStep === 'config' && (");
  const resultsIdx = modal.indexOf('<AiGenWizardResults {...resultsBindings} />');
  const footerIdx = modal.indexOf('{/* footer */}');
  assert.ok(bodyIdx >= 0 && configIdx > bodyIdx && resultsIdx > configIdx && footerIdx > resultsIdx,
    'body order is: body container → sources → config → <AiGenWizardResults …/> → close → footer');
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
  for (const binding of ['cancelAiGeneration', 'finalizeAiDraft', 'refineAiTests', 'toggleAiPreviewItem', 'runAiGeneration', 'startAiGeneration', 'confirmAiPreview', 'aiPreview', 'setAiPreview', 'aiPreviewSelected', 'setAiPreviewSelected']) {
    assert.ok(new RegExp(`\\b${binding}\\b`).test(bindings), `resultsBindings forwards ${binding}`);
  }
  // The chip binding resolves from either side of the component move — a
  // forwarded binding or the component import.
  if (bindings.includes('renderActiveModelChip')) {
    assert.ok(true, 'resultsBindings forwards renderActiveModelChip (pre-T08)');
  } else {
    assert.ok(modal.includes("import { ActiveModelChip } from '../ActiveModelChip';"), 'the chip reaches the results surface via the component import (T08)');
  }
  assert.doesNotMatch(modal, /\bextraSteps\b/, 'the extraSteps slot is gone modal-side (T18)');
  assert.doesNotMatch(modal, /\brenderExtraFooter\b/, 'the renderExtraFooter slot is gone modal-side (T18)');
});

test('App.jsx loses the wizard frame/config JSX (shrink + exactly-once gates)', () => {
  const appLines = app.split('\n').length;
  const modalLines = modal.split('\n').length;
  assert.ok(appLines < 4550, `App.jsx shrank below 4550 lines (baseline 4698, simulated port landed ${appLines})`);
  assert.ok(modalLines > 250, `the modal carries the moved surface (simulated port landed ${modalLines} lines)`);
  // The moved markers are gone App-side, present exactly once modal-side.
  for (const marker of ['AI Test Generator', '<span>Generation options</span>', 'Select sources for this run', 'Generator model</span>']) {
    assert.equal(countIn(app, marker), 0, `App no longer renders "${marker}"`);
    assert.equal(countIn(modal, marker), 1, `the modal renders "${marker}" exactly once`);
  }
  // The shared render helpers keep their exactly-once homes and split call
  // sites. Definition homes + call-site forms resolve from either side of the
  // selector-component move (App render helpers or shared components; the App
  // wirings become inline component mounts).
  const genComponent = readIfExists('src/components/GenModelSelector.jsx');
  const chipComponent = readIfExists('src/components/ActiveModelChip.jsx');
  assert.equal(countIn(app, 'const renderGenSelector =') + countIn(genComponent, 'export function GenModelSelector('), 1, 'the gen selector keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  // The helper-models call site lives in SettingsView.jsx — count across App
  // + the SettingsView to prove it stays unique (either form). The Helper
  // Models card lives in HelperModelsCard.jsx, so the selector call site
  // resolves across the view ∪ helper-card set either way.
  const settingsView = readSource('src/components/views/SettingsView.jsx');
  const helperCard = readIfExists('src/components/views/settings/HelperModelsCard.jsx');
  assert.equal(countIn(app + '\n' + settingsView + '\n' + helperCard, '{renderGenSelector()}') + countIn(settingsView + '\n' + helperCard, '<GenModelSelector'), 1, 'the helper-models gen selector renders exactly once across the view ∪ helper card (either form)');
  assert.equal(countIn(modal, '{renderGenSelector()}') + countIn(modal, '<GenModelSelector'), 1, 'the config step gen selector renders modal-side exactly once (either form)');
  assert.equal(countIn(app, 'const renderActiveModelChip =') + countIn(chipComponent, 'export function ActiveModelChip('), 1, 'the chip keeps exactly one definition (App render-prop pre-T08, component post-T08)');
  assert.equal([...app.matchAll(/renderActiveModelChip\(/g)].length + [...app.matchAll(/<ActiveModelChip /g)].length, chipComponent ? 2 : 0, 'App hosts no chip call site pre-T08; post-T08 exactly its two inline pass-through mounts (TestsView + RunnerView wiring)');
  assert.equal([...results.matchAll(/renderActiveModelChip\(/g)].length + [...results.matchAll(/<ActiveModelChip /g)].length, 1, 'the running-step chip renders results-side exactly once (either form, T18)');
  assert.equal([...modal.matchAll(/renderActiveModelChip\(/g)].length + [...modal.matchAll(/<ActiveModelChip /g)].length, 1, 'the config-step chip renders modal-side exactly once (either form)');
  // The payload import split: the catalog specifiers leave App's payload
  // import, and the byte-pin accepts either shape (catalogs present or shed).
  assert.match(app, /^import \{ ATLAS_TACTICS(?:, PRESET_TESTS, generateTestsForMatrix)? \} from '\.\/data\/payloads';$/m, 'App payload import keeps ATLAS_TACTICS (PROMPT_SOURCING_INFO stays gone; catalog specifiers shed by the T07 dedupe or present pre-dedupe)');
  assert.equal(countIn(app, 'PROMPT_SOURCING_INFO'), 0, 'PROMPT_SOURCING_INFO is fully App-pruned');
  assert.ok(modal.includes("import { PROMPT_SOURCING_INFO } from '../../data/payloads';"), 'the modal imports PROMPT_SOURCING_INFO from the shared catalog');
  assert.ok(hook.includes('Object.entries(PROMPT_SOURCING_INFO)'), 'the T08 profile seeding in the hook is untouched');
});
