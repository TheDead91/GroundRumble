import { Wand2, X, Cpu, Terminal, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { PROMPT_SOURCING_INFO } from '../../data/payloads';
import { useAIGen } from '../../context/useAIGen';
import { useSettings } from '../../context/SettingsContext';
import AiGenWizardResults, { AiGenWizardResultsFooter } from './AiGenWizardResults';
import { GenModelSelector } from '../GenModelSelector';
import { ActiveModelChip } from '../ActiveModelChip';

// The AI Test Generation wizard shell: the fixed overlay, the glass-card frame
// with the header + advanced/simple step indicator + close button, the sources
// step and the config step (including the four persisted localStorage toggles).
// App.jsx owns the conditional mount, so this component is only mounted while
// the wizard is open, never reads the open flag itself, and defines no state or
// handlers of its own: wizard state comes straight from AIGenContext, the
// effective generator config from SettingsContext, the hook bindings and the
// gen sync derivations + chip formatter arrive as props, and the shared
// GenModelSelector/ActiveModelChip components render the picker and the
// config-step chip. The running/profiles/draft/results panes and their footer
// branches render from AiGenWizardResults: both exports receive the same
// resultsBindings forwarding object, and the footer component renders as the
// footer chain's final branch (its unguarded aiPreview.tests read stays safe
// because the earlier branches short-circuit first).
export default function AiGenWizardModal({
  selectedGenProvider,
  genModelList,
  saveGenConfig,
  providers,
  helperProviderSelectable,
  providerLabel,
  toggleAiGenSource,
  toggleAiGenUrl,
  startAiGeneration,
  cancelAiGeneration,
  finalizeAiDraft,
  refineAiTests,
  toggleAiPreviewItem,
  runAiGeneration,
  confirmAiPreview,
  aiPreview,
  setAiPreview,
  aiPreviewSelected,
  setAiPreviewSelected,
}) {
  const {
    aiWizardStep, setAiWizardStep, setAiWizardOpen, setAiWizardError,
    aiAdvancedMode, setAiAdvancedMode, aiGenSourceKeys, aiGenUrls,
    aiGenCountInput, updateAiGenCountInput, commitAiGenCount,
    aiGenBatch, setAiGenBatch, aiGenBudget, setAiGenBudget,
    aiGenMode, setAiGenMode, aiGenerating, aiGenStage, aiGenProgress
  } = useAIGen();
  const { effectiveGenConfig } = useSettings();

  // The App-owned bindings forwarded to both results exports.
  const resultsBindings = {
    cancelAiGeneration,
    finalizeAiDraft,
    refineAiTests,
    toggleAiPreviewItem,
    runAiGeneration,
    startAiGeneration,
    confirmAiPreview,
    aiPreview,
    setAiPreview,
    aiPreviewSelected,
    setAiPreviewSelected,
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 110,
      padding: '20px'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '960px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wand2 size={18} color="var(--color-primary)" /> AI Test Generator
            </h3>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
              {(
                aiAdvancedMode
                  ? [['sources', '1. Sources'], ['config', '2. Options'], ['profiles', '3. Profiles'], ['draft', '4. Screening'], ['results', '5. Review & add']]
                  : [['sources', '1. Sources'], ['config', '2. Options'], ['running', '3. Generate'], ['results', '4. Review & add']]
              ).map(([s, label]) => (
                <span key={s} style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  padding: '3px 10px', borderRadius: '999px',
                  color: aiWizardStep === s ? '#fff' : 'var(--text-muted)',
                  background: aiWizardStep === s ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => { setAiWizardOpen(false); setAiWizardError(''); }} className="btn-secondary" style={{ padding: '6px' }}>
            <X size={14} />
          </button>
        </div>

        {/* body */}
        <div style={{ flexGrow: 1, overflowY: 'auto', marginTop: '14px', paddingRight: '4px' }}>
          {aiWizardStep === 'sources' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
                  Select sources for this run ({aiGenSourceKeys.length + aiGenUrls.filter(s => s.enabled).length} selected)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Object.entries(PROMPT_SOURCING_INFO).map(([key, info]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', cursor: 'pointer', padding: '5px 8px', background: aiGenSourceKeys.includes(key) ? 'rgba(59,130,246,0.08)' : 'transparent', border: '1px solid transparent', borderRadius: '6px' }}>
                      <input type="checkbox" checked={aiGenSourceKeys.includes(key)} onChange={() => toggleAiGenSource(key)} style={{ accentColor: 'var(--color-primary)' }} />
                      <span className="badge" style={{ fontSize: '0.5rem', background: 'rgba(96,165,250,0.15)', color: 'var(--color-primary)', border: '1px solid var(--border-subtle)' }}>DEFAULT</span>
                      <span>{info.origin}</span>
                    </label>
                  ))}
                  {aiGenUrls.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', cursor: 'pointer', padding: '5px 8px', background: s.enabled ? 'rgba(168,85,247,0.08)' : 'transparent', border: '1px solid transparent', borderRadius: '6px' }}>
                      <input type="checkbox" checked={s.enabled} onChange={() => toggleAiGenUrl(s.id)} style={{ accentColor: 'var(--color-primary)' }} />
                      <span className="badge" style={{ fontSize: '0.5rem', background: 'rgba(168,85,247,0.15)', color: 'var(--color-secondary)', border: '1px solid var(--border-subtle)' }}>CUSTOM</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || s.url || 'Untitled source'}</span>
                    </label>
                  ))}
                </div>
                {aiGenSourceKeys.length === 0 && aiGenUrls.filter(s => s.enabled).length === 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-warning)', marginTop: '8px' }}>
                    No sources selected — tick at least one above (or add one in the panel on the Test Management tab).
                  </div>
                )}
              </div>

            </div>
          )}

          {aiWizardStep === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Generator model */}
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Cpu size={16} color="var(--color-primary)" />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Generator model</span>
                  <span style={{ marginLeft: 'auto' }}><ActiveModelChip label="" cfg={effectiveGenConfig} providerLabel={providerLabel} /></span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Overrides the Settings default for this run.
                </div>
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '8px 10px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)',
                  borderRadius: '8px', fontSize: '0.72rem', color: 'var(--color-warning)', lineHeight: 1.45
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Test quality depends on the model — weak models can produce malformed or nonsensical tests.
                    Use a capable model and review the results before adding them to your suite.
                  </span>
                </div>
                <GenModelSelector
                  effectiveGenConfig={effectiveGenConfig}
                  selectedGenProvider={selectedGenProvider}
                  genModelList={genModelList}
                  saveGenConfig={saveGenConfig}
                  providers={providers}
                  helperProviderSelectable={helperProviderSelectable}
                />
              </div>

              {/* Generation options */}
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.85rem' }}>
                  <Terminal size={16} color="var(--color-primary)" />
                  <span>Generation options</span>
                </div>

                {/* Advanced mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '120px', flexShrink: 0 }}>Advanced mode</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[['off', 'Simple'], ['on', 'Advanced']].map(([val, label]) => {
                      const on = val === 'on';
                      const active = on ? aiAdvancedMode : !aiAdvancedMode;
                      return (
                        <button
                          key={val}
                          onClick={() => { setAiAdvancedMode(on); localStorage.setItem('atlas_ai_gen_advanced', on ? '1' : '0'); }}
                          className="btn-secondary"
                          style={{
                            flex: '1 1 auto', justifyContent: 'center', fontSize: '0.75rem', padding: '8px 14px',
                            background: active ? 'rgba(59,130,246,0.15)' : undefined,
                            borderColor: active ? 'rgba(59,130,246,0.45)' : undefined,
                            color: active ? '#fff' : undefined
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: '1 1 200px', minWidth: 0 }}>
                    Simple = analysis, generation and refinement run autonomously and you only review the final
                    tests. Advanced = review the Profiles &amp; Screening steps along the way.
                  </span>
                </div>

                {/* How many tests */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '120px', flexShrink: 0 }}>How many tests</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={aiGenCountInput}
                    onChange={(e) => updateAiGenCountInput(e.target.value)}
                    onBlur={() => commitAiGenCount(aiGenCountInput)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAiGenCount(aiGenCountInput); } }}
                    className="form-input"
                    style={{ width: '80px', padding: '8px 10px', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: '1 1 200px', minWidth: 0 }}>
                    The critique pass may return fewer after filtering weak or duplicate tests.
                  </span>
                </div>

                {/* Tests per call (batching) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '120px', flexShrink: 0 }}>Tests per call</span>
                  <select
                    value={aiGenBatch}
                    onChange={(e) => { const v = Math.max(1, Math.min(5, Number(e.target.value) || 1)); setAiGenBatch(v); localStorage.setItem('atlas_ai_gen_batch', String(v)); }}
                    className="form-input"
                    style={{ width: '120px', padding: '8px 10px', fontSize: '0.9rem', fontWeight: 600, flexShrink: 0 }}
                  >
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: '1 1 200px', minWidth: 0 }}>
                    How many tests to ask for per AI call. 1 = most diverse but more calls; higher = fewer calls,
                    less quota and fewer chances to fail (malformed responses are retried and skipped, never fatal).
                  </span>
                </div>

                {/* Response size (max tokens) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '120px', flexShrink: 0 }}>Response size</span>
                  <select
                    value={aiGenBudget}
                    onChange={(e) => { const v = Number(e.target.value) || 2048; setAiGenBudget(v); localStorage.setItem('atlas_ai_gen_budget', String(v)); }}
                    className="form-input"
                    style={{ width: '120px', padding: '8px 10px', fontSize: '0.9rem', fontWeight: 600, flexShrink: 0 }}
                  >
                    {[1024, 2048, 4096, 8192].map(n => <option key={n} value={n}>{n} tokens</option>)}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: '1 1 200px', minWidth: 0 }}>
                    Max output tokens per call. Smaller = faster, snappier responses (and less truncation of the
                    JSON); larger = roomier but slower.
                  </span>
                </div>

                <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

                {/* Generation mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Generation mode</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[['fast', 'Fast'], ['deep', 'Deep (recommended)']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => { setAiGenMode(val); localStorage.setItem('atlas_ai_gen_mode', val); }}
                        className="btn-secondary"
                        style={{
                          flex: '1 1 auto', justifyContent: 'center', fontSize: '0.75rem', padding: '8px 14px',
                          background: aiGenMode === val ? 'rgba(59,130,246,0.15)' : undefined,
                          borderColor: aiGenMode === val ? 'rgba(59,130,246,0.45)' : undefined,
                          color: aiGenMode === val ? '#fff' : undefined
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {aiGenMode === 'deep'
                    ? 'Analyzes each source, then critiques the result — better quality, more API calls.'
                    : 'Single pass — fewer API calls, faster, slightly lower quality.'}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.68rem', color: 'var(--text-muted)', padding: '8px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', lineHeight: 1.5 }}>
                  <Info size={13} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Deep mode makes a few API calls per generation (batched source analysis + generate + critique) — on free tiers with per-minute/day limits this consumes quota quickly.
                  </span>
                </div>
              </div>
            </div>
          )}
          <AiGenWizardResults {...resultsBindings} />

        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '12px', flexWrap: 'wrap' }}>
          {aiWizardStep === 'sources' ? (
            <>
              <button onClick={() => setAiWizardOpen(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => setAiWizardStep('config')}
                disabled={aiGenSourceKeys.length === 0 && aiGenUrls.filter(s => s.enabled).length === 0}
                className="btn-primary"
                title="Select at least one source, then configure the run"
              >
                Next
              </button>
            </>
          ) : aiWizardStep === 'config' ? (
            <>
              <button onClick={() => setAiWizardStep('sources')} className="btn-secondary">Back</button>
              <button
                onClick={() => { startAiGeneration(''); }}
                disabled={aiGenerating}
                className="btn-primary"
                title={aiGenerating ? 'Generating — please wait' : 'Start generating tests with the selected sources'}
              >
                {aiGenerating ? (
                  <>
                    <RefreshCw size={15} className="animate-spin-custom" />
                    {aiGenStage === 'generating' || aiGenStage === 'critiquing' ? 'Generating…' : 'Analyzing…'} {aiGenProgress}%
                  </>
                ) : (
                  <><Wand2 size={15} /> Generate tests</>
                )}
              </button>
            </>
          ) : (
            <AiGenWizardResultsFooter {...resultsBindings} />
          )}
        </div>
      </div>
    </div>
  );
}
