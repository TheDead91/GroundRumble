import { AlertTriangle, RefreshCw, Check, Layers, ChevronUp, ChevronDown, Plus, Trash2, Sparkles, Wand2, RotateCcw } from 'lucide-react';
import { useAIGen } from '../../context/useAIGen';
import { useSettings } from '../../context/SettingsContext';
import { useProviders } from '../../context/ProvidersContext';
import { ActiveModelChip } from '../ActiveModelChip';

// The AI generation wizard's downstream surface: the running, profiles, draft
// and results step bodies plus their four footer branches. The shared
// useWizardResultsState() hook pulls every context-owned name straight from
// AIGenContext (useAIGen), the shared generator config from SettingsContext and
// the vault flag + chip formatter from ProvidersContext, receives the
// App-owned bindings as props, and locally defines the seven pure
// state-transform handlers; the orchestration handlers that touch App-local
// preview state and the abort refs stay App-side and arrive as props. The
// default export renders the four step bodies inside the modal's body
// container; the named footer export renders the footer chain's final branch —
// its unguarded aiPreview.tests read is safe because the earlier branches
// short-circuit and the modal renders it as the chain's final branch. The
// running-step chip renders through the shared ActiveModelChip component.

function useWizardResultsState({
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
}) {
  const {
    aiWizardStep, aiWizardError, setAiWizardStep, setAiWizardOpen, setAiWizardError,
    aiGenerating, aiGenStage, aiGenStageDetail, aiGenProgress, aiGenMode,
    aiGenElapsed, aiDraft, setAiDraft, aiProfileEdits, setAiProfileEdits,
    aiProfileExpanded, setAiProfileExpanded, aiFineTune, setAiFineTune,
    aiRefining, aiUsedGuidance, aiRunCtxRef, setAiSourceProfiles,
  } = useAIGen();
  const { effectiveGenConfig } = useSettings();
  const { vaultLocked, providerLabel } = useProviders();

  // Editable draft tests (pre-refinement checkpoint).
  const updateAiDraftTest = (id, patch) => setAiDraft(prev => ({ ...prev, tests: prev.tests.map(t => t.id === id ? { ...t, ...patch } : t) }));
  const removeAiDraftTest = (id) => setAiDraft(prev => ({ ...prev, tests: prev.tests.filter(t => t.id !== id) }));

  // Editable threat profiles (profiles checkpoint).
  const updateAiProfile = (key, patch) => setAiProfileEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const updateAiProfileVector = (key, idx, patch) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: (prev[key]?.vectors || []).map((v, i) => i === idx ? { ...v, ...patch } : v) }
  }));
  const addAiProfileVector = (key) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: [...(prev[key]?.vectors || []), { name: 'New vector', description: '', payloadShape: '', techniqueId: '', techniqueName: '', evidence: '' }] }
  }));
  const removeAiProfileVector = (key, idx) => setAiProfileEdits(prev => ({
    ...prev,
    [key]: { ...prev[key], vectors: (prev[key]?.vectors || []).filter((_, i) => i !== idx) }
  }));
  const toggleAiProfileExpand = (key) => setAiProfileExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return {
    aiWizardStep, aiWizardError, setAiWizardStep, setAiWizardOpen, setAiWizardError,
    aiGenerating, aiGenStage, aiGenStageDetail, aiGenProgress, aiGenMode,
    aiGenElapsed, aiDraft, aiProfileEdits, aiProfileExpanded,
    aiFineTune, setAiFineTune, aiRefining, aiUsedGuidance, aiRunCtxRef,
    setAiSourceProfiles, effectiveGenConfig, vaultLocked, providerLabel,
    cancelAiGeneration, finalizeAiDraft, refineAiTests,
    toggleAiPreviewItem, runAiGeneration, startAiGeneration, confirmAiPreview,
    aiPreview, setAiPreview, aiPreviewSelected, setAiPreviewSelected,
    updateAiDraftTest, removeAiDraftTest, updateAiProfile, updateAiProfileVector,
    addAiProfileVector, removeAiProfileVector, toggleAiProfileExpand,
  };
}

export default function AiGenWizardResults(props) {
  const {
    aiWizardStep, aiWizardError, aiGenerating, aiGenStage, aiGenStageDetail,
    aiGenProgress, aiGenMode, aiGenElapsed, aiDraft, aiProfileEdits,
    aiProfileExpanded, aiFineTune, setAiFineTune, aiRefining, aiUsedGuidance,
    aiRunCtxRef, effectiveGenConfig, vaultLocked, providerLabel,
    aiPreview, aiPreviewSelected,
    refineAiTests, toggleAiPreviewItem,
    updateAiDraftTest, removeAiDraftTest, updateAiProfile, updateAiProfileVector,
    addAiProfileVector, removeAiProfileVector, toggleAiProfileExpand,
  } = useWizardResultsState(props);

  return (
    <>
              {aiWizardStep === 'running' && (
                aiWizardError && !aiGenerating ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', padding: '28px 12px' }}>
                    <AlertTriangle size={28} color="var(--color-vulnerable)" />
                    <div style={{ color: 'var(--color-vulnerable)', fontSize: '0.9rem', fontWeight: 700 }}>Generation failed</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '560px', textAlign: 'center' }}>{aiWizardError}</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <RefreshCw size={24} className="animate-spin-custom" color="var(--color-primary)" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          {aiGenStage === 'analyzing' && 'Analyzing sources…'}
                          {aiGenStage === 'generating' && 'Generating test payloads…'}
                          {aiGenStage === 'critiquing' && 'Critiquing & refining tests…'}
                          {!aiGenStage && `Generating with ${effectiveGenConfig.provider} AI…`}
                        </div>
                        {aiGenStageDetail && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{aiGenStageDetail}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ height: '9px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        <div style={{
                          height: '100%', borderRadius: '999px',
                          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                          width: `${aiGenProgress}%`,
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span>{aiGenMode === 'deep' ? 'Analyze → Generate → Critique' : 'Single pass'}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{aiGenProgress}%</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { id: 'analyzing', label: 'Analyze sources into threat profiles' },
                        { id: 'generating', label: 'Generate test payloads' },
                        { id: 'critiquing', label: 'Critique & refine' }
                      ]
                        .filter(ph => aiGenMode === 'deep' || ph.id === 'generating')
                        .map(ph => {
                          const order = ['analyzing', 'generating', 'critiquing'];
                          const cur = order.indexOf(aiGenStage);
                          const state = cur === -1 ? (aiGenerating ? 'running' : 'todo') : order.indexOf(ph.id) === cur ? 'active' : order.indexOf(ph.id) < cur ? 'done' : 'todo';
                          return (
                            <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: state === 'todo' ? 0.45 : 1 }}>
                              <div style={{
                                width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.68rem', fontWeight: 800, flexShrink: 0,
                                background: state === 'done' ? 'var(--color-secure)' : state === 'active' ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                                color: state === 'todo' ? 'var(--text-muted)' : '#fff'
                              }}>
                                {state === 'done' ? <Check size={12} /> : state === 'active' ? <RefreshCw size={12} className="animate-spin-custom" /> : order.indexOf(ph.id) + 1}
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: state === 'active' ? 700 : 500 }}>{ph.label}</span>
                            </div>
                          );
                        })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <ActiveModelChip label="Generating with" cfg={effectiveGenConfig} providerLabel={providerLabel} />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {aiGenMode === 'deep' ? 'Deep (analyze → generate → critique)' : 'Fast (single pass)'} — this can take a minute
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        Elapsed: {aiGenElapsed}s
                      </span>
                    </div>
                  </div>
                )
              )}

              {aiWizardStep === 'profiles' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                    The AI analyzed your sources into <b>threat profiles</b>. Review and edit them — they ground the
                    generated tests. Sources without a usable profile fall back to their raw content.
                  </p>
                  {/* oxlint-disable-next-line react/refs -- read-only snapshot render; context state (aiSourceProfiles) intentionally mirrors it in TestsView */}
                  {(aiRunCtxRef.current?.sources || []).map(src => {
                    const p = aiProfileEdits[src.key];
                    const open = aiProfileExpanded[src.key] === true;
                    return (
                      <div
                        key={src.key}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: p ? 'pointer' : 'default' }}
                        onClick={() => p && toggleAiProfileExpand(src.key)}
                      >
                        <Layers size={15} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div style={{ flexGrow: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={src.title}>{src.title}</span>
                            {p ? (
                              <>
                                <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{p.vulnerabilityClass || 'Unclassified'}</span>
                                <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>weight {p.weight ?? 1}</span>
                                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                              </>
                            ) : (
                              <span className="badge badge-warning" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>No profile — raw content</span>
                            )}
                          </div>
                          {p && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {(p.vectors || []).length} attack vector(s)
                            </div>
                          )}
                          {open && p && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                                <input className="form-input" value={p.vulnerabilityClass || ''} onChange={(e) => updateAiProfile(src.key, { vulnerabilityClass: e.target.value })} placeholder="Vulnerability class" />
                                <input type="number" min={1} max={3} className="form-input" value={p.weight ?? 1} onChange={(e) => updateAiProfile(src.key, { weight: Math.max(1, Math.min(3, Number(e.target.value) || 1)) })} />
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="form-label" style={{ margin: 0 }}>Attack vectors</span>
                                <button onClick={(e) => { e.stopPropagation(); addAiProfileVector(src.key); }} className="btn-secondary" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                                  <Plus size={12} style={{ marginRight: '4px' }} /> Vector
                                </button>
                              </div>
                              {(p.vectors || []).map((v, idx) => (
                                <div key={idx} style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input className="form-input" placeholder="Vector name" value={v.name || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { name: e.target.value })} style={{ flexGrow: 1 }} />
                                    <input className="form-input" placeholder="Technique id" value={v.techniqueId || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { techniqueId: e.target.value })} style={{ width: '150px' }} />
                                    <button onClick={(e) => { e.stopPropagation(); removeAiProfileVector(src.key, idx); }} className="btn-secondary" style={{ padding: '4px' }}><Trash2 size={13} /></button>
                                  </div>
                                  <input className="form-input" placeholder="Technique name" value={v.techniqueName || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { techniqueName: e.target.value })} />
                                  <textarea className="form-input" rows={1} placeholder="Payload shape (concrete example attack)" value={v.payloadShape || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { payloadShape: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />
                                  <textarea className="form-input" rows={1} placeholder="Description / evidence" value={v.description || ''} onChange={(e) => updateAiProfileVector(src.key, idx, { description: e.target.value })} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {aiWizardStep === 'draft' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    The AI generated {aiDraft.tests.length} test(s). Review and edit them before finalizing.
                    {aiDraft.failures > 0 && (
                      <span style={{ display: 'block', marginTop: '4px', color: 'var(--color-warning)' }}>
                        <AlertTriangle size={12} /> {aiDraft.failures} generation call(s) failed and were retried/skipped — partial results were kept.
                      </span>
                    )}
                  </div>
                  {aiDraft.tests.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-vulnerable)' }}>
                      No tests were generated. Go back and try fewer tests or different sources.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {aiDraft.tests.map((t, i) => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px', flexShrink: 0 }}>{i + 1}.</span>
                          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <input className="form-input" value={t.name || ''} onChange={(e) => updateAiDraftTest(t.id, { name: e.target.value })} style={{ flexGrow: 1, minWidth: '140px', fontWeight: 600 }} placeholder="Test name" />
                              <input className="form-input" value={t.techniqueId || ''} onChange={(e) => updateAiDraftTest(t.id, { techniqueId: e.target.value })} style={{ width: '130px' }} placeholder="Technique id" />
                              <input className="form-input" value={t.techniqueName || ''} onChange={(e) => updateAiDraftTest(t.id, { techniqueName: e.target.value })} style={{ width: '180px' }} placeholder="Technique name" />
                              <button onClick={() => removeAiDraftTest(t.id)} className="btn-secondary" style={{ padding: '4px' }}><Trash2 size={13} /></button>
                            </div>
                            <input className="form-input" value={t.description || ''} onChange={(e) => updateAiDraftTest(t.id, { description: e.target.value })} placeholder="Description" />
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', wordBreak: 'break-word' }}>Source: {t.sourceTitle || '—'}</div>
                            {t.sourceReasoning && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>Reasoning:</span> {t.sourceReasoning}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label className="form-label" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-secondary)' }}>Context (system prompt)</label>
                              <textarea className="form-input" rows={2} value={t.systemPrompt || ''} onChange={(e) => updateAiDraftTest(t.id, { systemPrompt: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <label className="form-label" style={{ margin: 0, fontSize: '0.68rem', color: 'var(--color-vulnerable)' }}>Payload (user prompt)</label>
                              <textarea className="form-input" rows={2} value={t.userPrompt || ''} onChange={(e) => updateAiDraftTest(t.id, { userPrompt: e.target.value })} style={{ fontSize: '0.72rem', fontFamily: 'monospace' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <input className="form-input" placeholder="Fail keywords (comma-separated)" value={(t.failKeywords || []).join(', ')} onChange={(e) => updateAiDraftTest(t.id, { failKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} style={{ flex: '1 1 220px', fontSize: '0.72rem' }} />
                              <input className="form-input" placeholder="Refusal keywords (comma-separated)" value={(t.refusalKeywords || []).join(', ')} onChange={(e) => updateAiDraftTest(t.id, { refusalKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} style={{ flex: '1 1 220px', fontSize: '0.72rem' }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {aiWizardStep === 'results' && aiPreview && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-secondary)' }}>
                      <Sparkles size={14} /> Fine-tune these tests with another AI pass
                    </div>
                    <textarea
                      value={aiFineTune}
                      onChange={(e) => setAiFineTune(e.target.value)}
                      placeholder="e.g. Make the payloads shorter and more subtle. Add a variant that works when the model only replies with emojis."
                      className="form-input"
                      style={{ width: '100%', minHeight: '64px', fontSize: '0.8rem', marginTop: '8px', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        onClick={refineAiTests}
                        disabled={aiRefining || vaultLocked || !aiFineTune.trim()}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem' }}
                        title={vaultLocked ? 'Disabled in read-only mode — unlock your API keys' : undefined}
                      >
                        {aiRefining ? <><RefreshCw size={13} className="animate-spin-custom" /> Refining…</> : <><Wand2 size={13} /> Refine with AI</>}
                      </button>
                    </div>
                    {aiRefining && aiGenStageDetail && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>{aiGenStageDetail}</div>
                    )}
                    {aiWizardError && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-vulnerable)', marginTop: '6px' }}>{aiWizardError}</div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    The AI generated {aiPreview.tests.length} test(s). Select the ones you want to add to the suite.
                    {aiUsedGuidance.trim() && (
                      <span style={{ display: 'block', marginTop: '2px', color: 'var(--color-warning)' }}>Guidance applied: &ldquo;{aiUsedGuidance}&rdquo;</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {aiPreview.tests.map((t, i) => {
                      const checked = aiPreviewSelected.has(t.id);
                      return (
                        <label key={t.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                          background: checked ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${checked ? 'rgba(168,85,247,0.35)' : 'var(--border-subtle)'}`,
                          borderRadius: '8px', cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAiPreviewItem(t.id)}
                            style={{ accentColor: 'var(--color-primary)', marginTop: '3px' }}
                          />
                          <div style={{ flexGrow: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {t.name}
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.techniqueId}</span>
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.tactic}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.description}</div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px', wordBreak: 'break-word' }}>
                              Source: {t.sourceTitle}
                            </div>
                            {t.sourceReasoning && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>Reasoning:</span> {t.sourceReasoning}
                              </div>
                            )}
                            {t.sourceExtract && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', maxHeight: '80px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                <span style={{ color: 'var(--color-secondary)' }}>Extract:</span> {t.sourceExtract}
                              </div>
                            )}
                            {t.systemPrompt && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', maxHeight: '60px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                <span style={{ color: 'var(--color-secondary)' }}>Context (system prompt):</span> {t.systemPrompt}
                              </div>
                            )}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', maxHeight: '60px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              <span style={{ color: 'var(--color-vulnerable)' }}>Payload (user prompt):</span> {t.userPrompt}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
    </>
  );
}

export function AiGenWizardResultsFooter(props) {
  const {
    aiWizardStep, aiWizardError, aiGenerating, aiGenProgress, aiGenMode,
    aiUsedGuidance, aiProfileEdits, aiPreview, aiPreviewSelected, aiRefining,
    setAiWizardStep, setAiWizardOpen, setAiWizardError, setAiPreview,
    setAiPreviewSelected, setAiSourceProfiles, cancelAiGeneration,
    finalizeAiDraft, runAiGeneration, startAiGeneration, confirmAiPreview,
  } = useWizardResultsState(props);

  return (
              aiWizardStep === 'running' ? (
                <>
                  <button onClick={cancelAiGeneration} className="btn-secondary" title="Interrupt generation and go back">Back</button>
                  {aiWizardError && !aiGenerating && (
                    <button onClick={() => startAiGeneration(aiUsedGuidance)} className="btn-primary"><RefreshCw size={15} /> Retry</button>
                  )}
                </>
              ) : aiWizardStep === 'profiles' ? (
                <>
                  <button onClick={cancelAiGeneration} className="btn-secondary">Back</button>
                  <button
                    onClick={() => { setAiSourceProfiles(aiProfileEdits); runAiGeneration(); }}
                    disabled={aiGenerating}
                    className="btn-primary"
                    title="Continue with the (possibly edited) threat profiles"
                  >
                    {aiGenerating ? (
                      <>
                        <RefreshCw size={15} className="animate-spin-custom" />
                        Generating… {aiGenProgress}%
                      </>
                    ) : (
                      'Continue to generation'
                    )}
                  </button>
                </>
              ) : aiWizardStep === 'draft' ? (
                <>
                  <button onClick={() => setAiWizardStep(aiGenMode === 'deep' ? 'profiles' : 'config')} className="btn-secondary">Back</button>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => finalizeAiDraft(false)} className="btn-secondary">
                      Add without refining
                    </button>
                    {aiGenMode === 'deep' && (
                      <button onClick={() => finalizeAiDraft(true)} disabled={aiGenerating} className="btn-primary">
                        {aiGenerating ? (
                          <>
                            <RefreshCw size={15} className="animate-spin-custom" />
                            Refining… {aiGenProgress}%
                          </>
                        ) : (
                          <><Wand2 size={15} /> Refine & finish</>
                        )}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {aiPreviewSelected ? aiPreviewSelected.size : 0} of {aiPreview.tests.length} selected
                  </span>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { if (aiRefining) return; setAiWizardStep('sources'); setAiWizardError(''); }}
                      disabled={aiRefining}
                      className="btn-secondary"
                      title="Start a fresh run (your guidance is kept)"
                    >
                      <RotateCcw size={14} /> New run
                    </button>
                    <button onClick={() => { cancelAiGeneration(); setAiWizardOpen(false); setAiPreview(null); setAiPreviewSelected(null); setAiWizardError(''); }} className="btn-secondary">
                      {aiRefining ? 'Stop' : 'Cancel'}
                    </button>
                    <button onClick={confirmAiPreview} className="btn-primary">
                      <Plus size={15} /> Add Selected ({aiPreviewSelected ? aiPreviewSelected.size : 0})
                    </button>
                  </div>
                </>
              )
  );
}
