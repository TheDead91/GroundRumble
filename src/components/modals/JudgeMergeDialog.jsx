import { X, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { extractVerdictTokens } from '../../utils/prompts';
import CanaryPreview from './CanaryPreview';

export default function JudgeMergeDialog({ judgeMerge, setJudgeMerge, closeJudgeMerge, applyJudgeMerge, applyJudgeMergeAndReevaluate, rerunJudgeEvaluation, rerunJudgeCanaries, refineJudgeMerge, history }) {
  if (!judgeMerge) return null;

  return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 142,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%', maxWidth: '760px', maxHeight: '86vh',
            display: 'flex', flexDirection: 'column', padding: '22px', gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                {judgeMerge.state === 'loading' ? 'Updating the AI Judge reasoning…' : judgeMerge.state === 'refining' ? 'Fine-tuning the AI Judge prompt…' : 'Review the updated AI Judge prompt'}
              </h3>
              <button onClick={closeJudgeMerge} className="btn-secondary" style={{ padding: '6px' }}>
                <X size={14} />
              </button>
            </div>

            {judgeMerge.state === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin-custom" />
                The AI Judge is merging your feedback into its evaluation prompt and re-evaluating this result…
              </div>
            )}

            {judgeMerge.state === 'error' && (
              <div style={{ padding: '14px 16px', background: 'rgba(127,29,29,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-vulnerable)' }}>
                Could not update the AI Judge prompt: {judgeMerge.error}
              </div>
            )}

            {judgeMerge.state === 'reevaluating' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <RefreshCw size={18} className="animate-spin-custom" color="var(--color-primary)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Re-evaluating all model responses with new prompt…</span>
                </div>
                {judgeMerge.reevaluationProgress && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Progress</span>
                      <span>{judgeMerge.reevaluationProgress.current} / {judgeMerge.reevaluationProgress.total}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'var(--color-primary)', borderRadius: '3px', transition: 'width 0.3s', width: `${Math.round((judgeMerge.reevaluationProgress.current / judgeMerge.reevaluationProgress.total) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {judgeMerge.reevaluationError && (
                  <div style={{ color: 'var(--color-vulnerable)', fontSize: '0.75rem' }}>Error: {judgeMerge.reevaluationError}</div>
                )}
              </div>
            )}

            {judgeMerge.state === 'refining' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin-custom" />
                The AI Judge is fine-tuning the prompt with your additional instructions…
              </div>
            )}

            {judgeMerge.state === 'ready' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">Previous prompt (read-only)</label>
                  <textarea
                    readOnly
                    value={judgeMerge.previous}
                    rows={6}
                    spellCheck={false}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">New prompt (editable — the AI Judge's updated reasoning)</label>
                  <textarea
                    value={judgeMerge.next}
                    onChange={(e) => setJudgeMerge(prev => prev ? { ...prev, next: e.target.value } : prev)}
                    rows={8}
                    spellCheck={false}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />
                  {(() => {
                    const tokens = extractVerdictTokens(judgeMerge.next);
                    return tokens.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.68rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Verdict language detected:</span>
                        {tokens.map(t => (
                          <span key={t} style={{ background: 'var(--border-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>{t}</span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>

                {judgeMerge.rejected && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(127,29,29,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--color-vulnerable)', lineHeight: 1.5 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{judgeMerge.rejected}</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: '2px' }} color="var(--color-secondary)" />
                  <span>The test case and the target model response were treated as <strong>untrusted evidence</strong>, and this rewrite was scanned for instructions that would force a fixed verdict. If a verdict-forcing rewrite was detected it is flagged above — the text is still editable and you may apply it, but only as a conscious decision. Review before applying.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="form-label" style={{ margin: 0 }}>New evaluation with this prompt</span>
                    <button
                      onClick={rerunJudgeEvaluation}
                      disabled={judgeMerge.evaluating}
                      className="btn-secondary"
                      style={{ fontSize: '0.68rem', padding: '4px 10px' }}
                    >
                      {judgeMerge.evaluating ? <><RefreshCw size={11} className="animate-spin-custom" style={{ marginRight: '6px' }} /> Re-evaluating…</> : 'Re-run evaluation'}
                    </button>
                  </div>
                  {judgeMerge.evaluating ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={13} className="animate-spin-custom" /> The AI Judge is re-evaluating with the current prompt…
                    </div>
                  ) : judgeMerge.evaluation ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', opacity: judgeMerge.evalSource != null && judgeMerge.evalSource !== judgeMerge.next ? 0.55 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${judgeMerge.evaluation.status === 'SECURE' ? 'badge-secure' : 'badge-vulnerable'}`}>
                          {judgeMerge.evaluation.status}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>verdict with the proposed prompt</span>
                      </div>
                      {judgeMerge.evalSource != null && judgeMerge.evalSource !== judgeMerge.next && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)' }}>
                          Stale — the prompt was edited after this evaluation ran. Re-run the evaluation to validate the current text.
                        </span>
                      )}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
                        {judgeMerge.evaluation.reasoning}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-vulnerable)' }}>
                      {judgeMerge.evalError ? `Evaluation failed: ${judgeMerge.evalError}` : 'No evaluation available.'}
                    </div>
                  )}
                </div>

                <CanaryPreview
                  canaries={judgeMerge.canaries}
                  canarySource={judgeMerge.canarySource}
                  prompt={judgeMerge.next}
                  rerunning={judgeMerge.rerunning}
                  onRerun={rerunJudgeCanaries}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px' }}>
                  <span className="form-label" style={{ margin: 0 }}>Fine-tune with another AI pass</span>
                  <textarea
                    value={judgeMerge.fineTuneFeedback || ''}
                    onChange={(e) => setJudgeMerge(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}
                    placeholder="e.g. Be stricter about ambiguous refusals, keep the reasoning concise…"
                    rows={2}
                    spellCheck={false}
                    className="prompt-editor"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={refineJudgeMerge} disabled={judgeMerge.refining} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                      {judgeMerge.refining ? <><RefreshCw size={11} className="animate-spin-custom" style={{ marginRight: '6px' }} /> Fine-tuning…</> : 'Fine-tune with another AI pass'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0, paddingTop: '4px' }}>
                  <button onClick={closeJudgeMerge} className="btn-secondary">Cancel</button>
                  <button onClick={applyJudgeMerge} className="btn-primary">
                    Apply prompt
                  </button>
                  <button onClick={applyJudgeMergeAndReevaluate} className="btn-primary" disabled={!history.length}>
                    Apply prompt and re-evaluate all models
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
