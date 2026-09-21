import { X, Sparkles, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { PROMPT_LABELS, DEFAULT_PROMPTS } from '../../utils/prompts';
import CanaryPreview from './CanaryPreview';

export default function PromptUpdateDialog({ promptUpdate, setPromptUpdate, closePromptUpdate, applyPromptUpdate, rerunPromptUpdateCanaries, runPromptUpdate, refinePromptUpdate, promptDraft, getPromptOverrides, vaultLocked, vaultPassphraseSet }) {
  const isJudgePrompt = promptUpdate.key === 'judge_system' || promptUpdate.key === 'judge_user';
  return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 143,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%', maxWidth: '720px', maxHeight: '86vh',
            display: 'flex', flexDirection: 'column', padding: '22px', gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                {promptUpdate.state === 'feedback'
                  ? `Update ${PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} with AI`
                  : promptUpdate.state === 'loading'
                    ? 'Rewriting the prompt…'
                    : promptUpdate.state === 'refining'
                      ? 'Fine-tuning the prompt…'
                      : `Review the updated ${PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} prompt`}
              </h3>
              <button onClick={closePromptUpdate} className="btn-secondary" style={{ padding: '6px' }}>
                <X size={14} />
              </button>
            </div>

            {promptUpdate.state === 'feedback' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  Tell the model how this prompt should behave differently. It will rewrite the prompt to incorporate
                  your feedback, keeping its placeholders and output contract intact.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">Current {PROMPT_LABELS[promptUpdate.key] || promptUpdate.key} prompt</label>
                  <textarea
                    readOnly
                    value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}
                    rows={5}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">Your feedback</label>
                  <textarea
                    value={promptUpdate.feedback}
                    onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, feedback: e.target.value } : prev)}
                    placeholder="e.g. Be stricter about ambiguous refusals, prefer explicit JSON-only output, ignore off-topic sources…"
                    rows={4}
                    className="prompt-editor"
                  />
                </div>
                {isJudgePrompt && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={promptUpdate.skipCanaries === true}
                      onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, skipCanaries: e.target.checked } : prev)}
                    />
                    Skip canary preview
                  </label>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={closePromptUpdate} className="btn-secondary">Cancel</button>
                  <button onClick={runPromptUpdate} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary">
                    <Sparkles size={15} /> Update with AI
                  </button>
                </div>
              </div>
            )}

            {promptUpdate.state === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin-custom" />
                The model is rewriting the prompt based on your feedback…
              </div>
            )}

            {promptUpdate.state === 'refining' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '18px 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin-custom" />
                The model is fine-tuning the prompt with your additional instructions…
              </div>
            )}

            {promptUpdate.state === 'error' && (
              <div style={{ padding: '14px 16px', background: 'rgba(127,29,29,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-vulnerable)' }}>
                Could not update the prompt: {promptUpdate.error}
                <div style={{ marginTop: '12px' }}>
                  <button onClick={() => setPromptUpdate(prev => prev ? { ...prev, state: 'feedback' } : prev)} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {promptUpdate.state === 'preview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">Previous prompt (read-only)</label>
                  <textarea
                    readOnly
                    value={promptDraft[promptUpdate.key] !== undefined ? promptDraft[promptUpdate.key] : getPromptOverrides()[promptUpdate.key] ?? DEFAULT_PROMPTS[promptUpdate.key]}
                    rows={5}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label">New prompt (editable — the AI's updated version)</label>
                  <textarea
                    value={promptUpdate.next}
                    onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, next: e.target.value } : prev)}
                    rows={8}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical', fontSize: '0.8rem', lineHeight: 1.45, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />
                </div>
                {promptUpdate.rejected && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(127,29,29,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--color-vulnerable)', lineHeight: 1.5 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{promptUpdate.rejected}</span>
                  </div>
                )}
                <CanaryPreview
                  canaries={promptUpdate.canaries}
                  canarySource={promptUpdate.canarySource}
                  prompt={promptUpdate.next}
                  rerunning={promptUpdate.rerunning}
                  onRerun={rerunPromptUpdateCanaries}
                />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: '2px' }} color="var(--color-secondary)" />
                  <span>{isJudgePrompt
                    ? (promptUpdate.rejected
                      ? "This rewrite keeps required placeholders, but it was flagged as possibly forcing a fixed outcome — review it before applying."
                      : "This rewrite keeps required placeholders, but verdict behavior was not automatically validated — review the canary preview before applying.")
                    : "This rewrite was checked to keep the prompt's required placeholders; instructions forcing a fixed outcome were rejected. Review it before applying."}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px' }}>
                  <span className="form-label" style={{ margin: 0 }}>Fine-tune with another AI pass</span>
                  <textarea
                    value={promptUpdate.fineTuneFeedback || ''}
                    onChange={(e) => setPromptUpdate(prev => prev ? { ...prev, fineTuneFeedback: e.target.value } : prev)}
                    placeholder="e.g. Keep it shorter, be stricter about ambiguous refusals, prefer explicit JSON-only output…"
                    rows={2}
                    className="prompt-editor"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={refinePromptUpdate} disabled={promptUpdate.refining} className="btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                      {promptUpdate.refining ? <><RefreshCw size={11} className="animate-spin-custom" style={{ marginRight: '6px' }} /> Fine-tuning…</> : 'Fine-tune with another AI pass'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={closePromptUpdate} className="btn-secondary">Cancel</button>
                  <button onClick={applyPromptUpdate} className="btn-primary">
                    Apply prompt
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
