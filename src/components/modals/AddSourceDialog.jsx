import { X, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { useAIGen } from '../../context/useAIGen';

export default function AddSourceDialog({ handleAddSourceSubmit, saveAiSourceDraft, updateSourceDraft }) {
  const { aiGenUrlInput, setAiGenUrlInput, aiGenTitleInput, setAiGenTitleInput, aiGenDescInput, setAiGenDescInput, aiPasteInput, setAiPasteInput, aiPasteTitle, setAiPasteTitle, aiSourceDraft, setAiSourceDraft, aiSourceAssessing, aiSourceAssessment, setAiSourceAssessment, aiAddSourceKind, setAiAddSourceKind, aiAddStep, setAiAddStep, aiAddError, setAiAddError, aiAddBusy, closeAddSourceDialog } = useAIGen();

  return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 135,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '560px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                {aiAddStep === 'review' ? 'Review new source' : 'Add custom source'}
              </h3>
              <button onClick={closeAddSourceDialog} className="btn-secondary" style={{ padding: '6px' }}>
                <X size={14} />
              </button>
            </div>

            {aiAddStep === 'input' && (
              <>
                <div>
                  <span className="form-label">Source type</span>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    {[['url', 'URL / GitHub repo / article'], ['paste', 'Pasted content']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setAiAddSourceKind(val)}
                        disabled={aiAddBusy}
                        className="btn-secondary"
                        style={{
                          flex: '1 1 auto', fontSize: '0.78rem', justifyContent: 'center',
                          background: aiAddSourceKind === val ? 'rgba(59,130,246,0.15)' : undefined,
                          borderColor: aiAddSourceKind === val ? 'rgba(59,130,246,0.4)' : undefined,
                          color: aiAddSourceKind === val ? '#fff' : undefined
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {aiAddSourceKind === 'url' ? (
                  <>
                    <div>
                      <label className="form-label">URL (required)</label>
                      <input
                        type="text"
                        value={aiGenUrlInput}
                        onChange={(e) => { setAiGenUrlInput(e.target.value); if (aiAddError) setAiAddError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSourceSubmit(); } }}
                        placeholder="https://github.com/user/repo"
                        className="form-input"
                        autoFocus
                        disabled={aiAddBusy}
                        style={{ borderColor: aiAddError && aiAddSourceKind === 'url' ? 'rgba(239,68,68,0.6)' : undefined }}
                      />
                    </div>
                    <div>
                      <label className="form-label">Title (optional)</label>
                      <input
                        type="text"
                        value={aiGenTitleInput}
                        onChange={(e) => setAiGenTitleInput(e.target.value)}
                        placeholder="e.g. OWASP LLM Top 10"
                        className="form-input"
                        disabled={aiAddBusy}
                      />
                    </div>
                    <div>
                      <label className="form-label">Description (optional)</label>
                      <textarea
                        value={aiGenDescInput}
                        onChange={(e) => setAiGenDescInput(e.target.value)}
                        placeholder="What is this source about? (if blank, the AI proposes a title and description you can edit)"
                        className="form-input"
                        style={{ minHeight: '70px', resize: 'vertical', fontSize: '0.8rem' }}
                        disabled={aiAddBusy}
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      The source is fetched and assessed before being added. Client-side fetching may be blocked by CORS
                      for some sites, in which case the URL itself is used as context.
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="form-label">Title (optional)</label>
                      <input
                        type="text"
                        value={aiPasteTitle}
                        onChange={(e) => setAiPasteTitle(e.target.value)}
                        placeholder="e.g. the article or repo name"
                        className="form-input"
                        disabled={aiAddBusy}
                      />
                    </div>
                    <div>
                      <label className="form-label">Content (required)</label>
                      <textarea
                        value={aiPasteInput}
                        onChange={(e) => { setAiPasteInput(e.target.value); if (aiAddError) setAiAddError(''); }}
                        placeholder="Paste the full article, research paper, or README text here — the AI analyzes it directly, no CORS limits."
                        className="form-input"
                        style={{ minHeight: '130px', resize: 'vertical', fontSize: '0.8rem', borderColor: aiAddError && aiAddSourceKind === 'paste' ? 'rgba(239,68,68,0.6)' : undefined }}
                        autoFocus
                        disabled={aiAddBusy}
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      The pasted text is assessed before being added, and the AI proposes a title and description you can edit.
                    </div>
                  </>
                )}

                {aiAddError && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--color-vulnerable)' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>{aiAddError}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={closeAddSourceDialog} className="btn-secondary" disabled={aiAddBusy}>Cancel</button>
                  <button onClick={handleAddSourceSubmit} className="btn-primary" disabled={aiAddBusy}>
                    {aiAddBusy ? <><RefreshCw size={15} className="animate-spin-custom" /> Fetching &amp; assessing…</> : <><Plus size={15} /> Fetch &amp; assess</>}
                  </button>
                </div>
              </>
            )}

            {aiAddStep === 'review' && aiSourceDraft && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span className="badge" style={{ fontSize: '0.58rem', background: aiSourceDraft.kind === 'paste' ? 'rgba(59,130,246,0.15)' : 'rgba(22,163,74,0.15)', color: aiSourceDraft.kind === 'paste' ? 'var(--color-primary)' : 'var(--color-secure)', border: '1px solid var(--border-subtle)' }}>
                    {aiSourceDraft.kind === 'paste' ? 'PASTED CONTENT' : 'URL SOURCE'}
                  </span>
                  <span className="badge" style={{ fontSize: '0.58rem', background: 'rgba(22,163,74,0.15)', color: 'var(--color-secure)', border: '1px solid var(--border-subtle)' }}>
                    {aiSourceDraft.kind === 'paste'
                      ? `${(aiSourceDraft.excerpt || '').length.toLocaleString()} characters`
                      : (aiSourceDraft.declined ? 'PROXY DECLINED — INFERRING' : aiSourceDraft.proxyFailed ? 'PROXY FAILED — INFERRING' : aiSourceDraft.excerpt ? 'CONTENT FETCHED' : 'CORS-BLOCKED — INFERRING')}
                  </span>
                  {aiSourceDraft.kind !== 'paste' && aiSourceDraft.url && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{aiSourceDraft.url}</span>
                  )}
                </div>

                <div>
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    value={aiSourceDraft.title || ''}
                    onChange={(e) => updateSourceDraft({ title: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <textarea
                    value={aiSourceDraft.description || ''}
                    onChange={(e) => updateSourceDraft({ description: e.target.value })}
                    className="form-input"
                    style={{ minHeight: '70px', resize: 'vertical', fontSize: '0.8rem' }}
                  />
                </div>

                <div>
                  <span className="form-label">Relevance assessment</span>
                  <div style={{ marginTop: '6px' }}>
                    {aiSourceAssessing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <RefreshCw size={14} className="animate-spin-custom" /> Assessing relevance with the Test Generator model…
                      </div>
                    ) : aiSourceAssessment ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>
                          {(() => {
                            const meta = {
                              high: ['RELEVANT · HIGH', 'var(--color-secure)', 'rgba(22,163,74,0.15)'],
                              medium: ['MAYBE RELEVANT', 'var(--color-warning)', 'rgba(245,158,11,0.15)'],
                              low: ['LOW RELEVANCE', 'var(--color-vulnerable)', 'rgba(239,68,68,0.15)'],
                              irrelevant: ['IRRELEVANT', 'var(--color-vulnerable)', 'rgba(239,68,68,0.18)']
                            }[aiSourceAssessment.status] || ['ASSESSED', 'var(--text-muted)', 'rgba(255,255,255,0.05)'];
                            const [label, color, bg] = meta;
                            return <span className="badge" style={{ fontSize: '0.62rem', background: bg, color, border: '1px solid var(--border-subtle)' }}>{label}</span>;
                          })()}
                        </span>
                        {aiSourceAssessment.summary && <div>{aiSourceAssessment.summary}</div>}
                        {aiSourceAssessment.reason && <div>{aiSourceAssessment.reason}</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Assessment unavailable (no Test Generator model configured). The source can still be added.
                      </div>
                    )}
                  </div>
                </div>

                {aiSourceDraft.excerpt && (
                  <div>
                    <span className="form-label">Fetched context</span>
                    <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '8px', maxHeight: '140px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-muted)' }}>
                      {aiSourceDraft.excerpt}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => { setAiAddStep('input'); setAiSourceDraft(null); setAiSourceAssessment(null); setAiAddError(''); }} className="btn-secondary">Back</button>
                  <button onClick={() => { saveAiSourceDraft(); closeAddSourceDialog(); }} className="btn-primary">
                    <Plus size={15} /> Add source
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
  );
}
