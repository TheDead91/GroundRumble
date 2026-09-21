import { Download, Trash2, X, ChevronUp, ChevronDown } from 'lucide-react';
import { resultOverrideKey } from '../../context/HistoryContext';
import { summarizeVerdicts } from '../../utils/verdict-summary';

/**
 * AuditDetailModal - historical audit record detail view. Props-in/events-out:
 * App owns selectedAudit, expandedDetailIds and the handlers.
 */
export default function AuditDetailModal({
  selectedAudit,
  expandedDetailIds,
  onToggleDetail,
  onClose,
  onDelete: handleDeleteAudit,
  onPrintReport: printRunReport,
  onResultOverride: handleResultOverride,
  effectiveDetails,
  modelTargetLabel,
  overrides,
  vaultLocked,
  vaultPassphraseSet,
  addToast,
}) {
  if (!selectedAudit) return null;
  const auditDetails = (selectedAudit.details || []).map(effectiveDetails);
        const {
          secure: auditSecure,
          vulnerable: auditVuln,
          valid: auditValid,
          resilience: auditScore,
        } = summarizeVerdicts(auditDetails);
        void auditSecure;
        void auditVuln;
        void auditValid;
        const modelList = selectedAudit.targets?.map(t => modelTargetLabel(t.provider, t.model)) || [];
        const statusColor = (s) => s === 'VULNERABLE' ? 'var(--color-vulnerable)' : s === 'SECURE' ? 'var(--color-secure)' : s === 'EMPTY' ? 'var(--text-muted)' : 'var(--color-warning)';
        const detailKey = (d) => `${d.timestamp}-${d.targetUid}-${d.testId}`;
  // Unencrypted history intentionally retains only summaries. A missing
  // evidence field with no passphrase set means "not retained by privacy
  // policy", not "no evidence existed" — word it accordingly without exposing
  // or reconstructing anything sensitive.
  const evidenceText = (value, emptyLabel) =>
    value || ((vaultPassphraseSet ?? false) ? emptyLabel : 'Detailed evidence not stored in unencrypted history.');
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
            zIndex: 115,
            padding: '20px'
          }}>
            <div className="glass-card" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Audit Details</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {(vaultPassphraseSet ?? false)
                      ? 'Full record of the selected historical run, including payloads and model responses.'
                      : 'Summary record of the selected historical run. Detailed evidence is not stored in unencrypted history.'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => printRunReport(auditDetails, {
                      title: 'GroundRumble Security Audit Report',
                      subtitle: `${selectedAudit.isDemo ? 'Simulation' : 'Live API'} Audit — ${new Date(selectedAudit.timestamp).toLocaleString()}`,
                      meta: [`Targets: ${modelList.length > 0 ? modelList.join(' · ') : (selectedAudit.model || '—')}`]
                    })}
                    disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                    className="btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                  >
                    <Download size={14} style={{ marginRight: '6px' }} />
                    Download Report
                  </button>
                  <button onClick={() => handleDeleteAudit(selectedAudit.id)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary icon-btn" data-tip="Delete" style={{ padding: '8px 10px', fontSize: '0.75rem', color: 'var(--color-vulnerable)', whiteSpace: 'nowrap' }}>
                    <Trash2 size={14} />
                  </button>
                  <button onClick={onClose} className="btn-secondary icon-btn" data-tip="Close" style={{ padding: '6px' }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Summary metadata */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '10px', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{new Date(selectedAudit.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Targets</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{modelList.length > 0 ? modelList.join(' · ') : (selectedAudit.model || '—')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mode</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{selectedAudit.isDemo ? 'Simulation' : 'Live API'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evaluations</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{auditDetails.length}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resilience</div>
                  {auditScore === null ? (
                    <span className="badge badge-secondary" style={{ marginTop: '2px' }} title="No valid (secure or vulnerable) verdicts in this run.">—</span>
                  ) : (
                    <span className={`badge ${auditScore > 70 ? 'badge-secure' : auditScore > 40 ? 'badge-warning' : 'badge-vulnerable'}`} style={{ marginTop: '2px' }}>
                      {auditScore}%
                    </span>
                  )}
                </div>
              </div>

              {/* Evaluations list */}
              <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                {auditDetails.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>This audit record has no evaluation details.</div>
                ) : (
                  auditDetails.map((d, i) => {
                    const expanded = expandedDetailIds.has(detailKey(d));
                    return (
                      <div key={detailKey(d)} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.85rem', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {d.testName}
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{d.techniqueId}</span>
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{d.tactic}</span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {modelTargetLabel(d.provider, d.model)} · {d.techniqueName}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span className="badge" style={{ color: statusColor(d.status), border: `1px solid ${statusColor(d.status)}` }}>{d.status}</span>
                            <button onClick={() => { if (vaultLocked) { addToast('Unlock your API keys to view evaluation details.'); return; } onToggleDetail(detailKey(d)); }} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', whiteSpace: 'nowrap' }}>
                              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {expanded ? 'Hide' : 'View'}
                            </button>
                          </div>
                        </div>

                        {expanded && !vaultLocked && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                            <div>
                              <div className="form-label" style={{ marginBottom: '4px' }}>System Prompt (context)</div>
                              <div className="code-box" style={{ maxHeight: '150px', overflowY: 'auto', padding: '8px', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {evidenceText(d.systemPrompt, '(none)')}
                              </div>
                            </div>
                            <div>
                              <div className="form-label" style={{ marginBottom: '4px' }}>Attack Payload (user prompt)</div>
                              <div className="code-box" style={{ maxHeight: '150px', overflowY: 'auto', padding: '8px', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {evidenceText(d.userPrompt, '(none)')}
                              </div>
                            </div>
                            <div>
                              <div className="form-label" style={{ marginBottom: '4px' }}>Model Response</div>
                              <div className="code-box" style={{ maxHeight: '220px', overflowY: 'auto', padding: '8px', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {d.response ?? ((vaultPassphraseSet ?? false) ? '(no response)' : 'Detailed evidence not stored in unencrypted history.')}
                              </div>
                            </div>
                            <div>
                              <div className="form-label" style={{ marginBottom: '4px' }}>Evaluation Reasoning</div>
                              <div className="code-box" style={{ maxHeight: '120px', overflowY: 'auto', padding: '8px', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {evidenceText(d.reasoning, '(none)')}
                              </div>
                            </div>
                            <div>
                              <div className="form-label" style={{ marginBottom: '6px' }}>Override verdict</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button onClick={() => handleResultOverride(d, 'SECURE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'SECURE' ? 'var(--color-secure)' : undefined }}>Secure</button>
                                <button onClick={() => handleResultOverride(d, 'VULNERABLE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'VULNERABLE' ? 'var(--color-vulnerable)' : undefined }}>Vulnerable</button>
                                <button onClick={() => handleResultOverride(d, 'INCONCLUSIVE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(d)]?.verdict === 'INCONCLUSIVE' ? 'var(--color-warning)' : undefined }}>Inconclusive</button>
                                {overrides[resultOverrideKey(d)] && (
                                  <button onClick={() => handleResultOverride(d, null)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Clear override</button>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              {new Date(d.timestamp).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {auditDetails.length} evaluation{auditDetails.length === 1 ? '' : 's'}
                </span>
                <button onClick={onClose} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
  );
}
