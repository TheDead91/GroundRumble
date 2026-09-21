import React, { useState, useEffect } from 'react';
import { Info, X, ShieldCheck, AlertTriangle, Plus, Layers } from 'lucide-react';
import { useTests } from '../../context/TestsContext';
import { useSettings } from '../../context/SettingsContext';
import { useUI } from '../../context/useUI';
import { useProviders } from '../../context/ProvidersContext';

/**
 * MatrixView - MITRE ATLAS Matrix tab view. Renders the tactic-column
 * technique grid, the "No matrix loaded yet" empty state, the
 * selected-technique detail pane (recommended mitigations + mapped diagnostic
 * prompts) and the last-synced version note off the shared contexts. App
 * governs mounting via its tab conditional; selection changes are reported
 * back through onSelectedTechniqueChange so the guided tour's App-side
 * waitFor keeps working.
 */
export function MatrixView({ onSelectedTechniqueChange }) {
  const { allTests, setSelectedTests, setEditingTestId, setCustomForm, setShowAddCustom, deleteTest } = useTests();
  const { atlasMatrix, atlasSyncStatus } = useSettings();
  const { setActiveTab } = useUI();
  const { vaultLocked, vaultPassphraseSet } = useProviders();
  const [selectedTechnique, setSelectedTechnique] = useState(null);

  // Mapping test payloads directly to selected technique in the matrix
  const getMappedTestsForTechnique = (techId) => {
    return allTests.filter(t => t.techniqueId === techId);
  };

  // Report selection changes to App so the guided tour's waitFor (App-side,
  // closed over selectedTechniqueRef) keeps working.
  useEffect(() => {
    onSelectedTechniqueChange?.(selectedTechnique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTechnique]);

  return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {atlasMatrix.length > 0 ? (
            /* Matrix Columns */
            <div data-tour="matrix-grid" style={{ overflowX: 'auto', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '20px', minWidth: '1200px' }}>
                {atlasMatrix.map((tactic) => (
                  <div key={tactic.id} style={{ 
                    flex: '1 1 200px', 
                    minWidth: '180px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    background: 'rgba(255,255,255,0.01)',
                    borderRadius: '12px',
                    padding: '12px 10px',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 700, 
                      color: 'var(--color-primary)', 
                      borderBottom: '2px solid var(--border-subtle)',
                      paddingBottom: '8px', 
                      marginBottom: '4px' 
                    }}>
                      <div style={{ lineHeight: 1.3 }}>{tactic.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '3px' }}>{tactic.id}</div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                      {tactic.techniques.map((tech) => {
                        const isSelected = selectedTechnique?.id === tech.id;
                        const mappedTests = getMappedTestsForTechnique(tech.id);
                        const hasTests = mappedTests.length > 0;
                        
                        return (
                          <div 
                            key={tech.id} 
                            onClick={() => setSelectedTechnique(tech)}
                            className={`technique-card ${isSelected ? 'active' : ''}`}
                            style={{ 
                              padding: '10px', 
                              border: isSelected ? '1px solid var(--color-secondary)' : hasTests ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                              background: isSelected ? 'rgba(168, 85, 247, 0.08)' : hasTests ? 'rgba(59, 130, 246, 0.03)' : 'var(--bg-card)'
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '0.78rem', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{tech.name}</span>
                              {hasTests && (
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} title="Mapped Test Prompt available" />
                              )}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{tech.id}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            ) : (
              <div className="glass-card" style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <Info size={32} color="var(--text-muted)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No matrix loaded yet</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
                  Nothing has been downloaded yet. Go to <b>Settings</b> → MITRE ATLAS Framework Database and click
                  <b> Sync Live ATLAS</b> to pull the official MITRE ATLAS framework — the matrix, technique details, and
                  auto-generated coverage tests will appear here.
                </p>
              </div>
            )}

            {/* Detailed Pane for selected technique */}
            {selectedTechnique ? (
              <div className="glass-card" data-tour="technique-detail" style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="badge badge-primary" style={{ marginBottom: '6px' }}>{selectedTechnique.id}</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedTechnique.name}</h3>
                  </div>
                  <button onClick={() => setSelectedTechnique(null)} className="btn-secondary" style={{ padding: '6px' }}>
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>Description</h4>
                  <p style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{selectedTechnique.description}</p>
                </div>

                {selectedTechnique.subtechniques && selectedTechnique.subtechniques.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>Sub-techniques</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedTechnique.subtechniques.map(sub => (
                        <span key={sub.id} className="badge badge-secondary" style={{ textTransform: 'none', fontSize: '0.7rem' }} title={sub.description}>
                          {sub.id}: {sub.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginTop: '8px' }}>
                  {/* Mitigations */}
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-secure)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} /> Recommended Mitigations
                    </h4>
                    {selectedTechnique.mitigations && selectedTechnique.mitigations.length > 0 ? (
                      <ul style={{ fontSize: '0.8rem', paddingLeft: '16px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedTechnique.mitigations.map(mit => (
                          <li key={mit.id}>
                            <strong>{mit.id} - {mit.name}</strong>: {mit.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      // Local fallback mitigations if not synced
                      <ul style={{ fontSize: '0.8rem', paddingLeft: '16px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedTechnique.id === 'AML.T0034' && (
                          <>
                            <li>Use pre-evaluation guardrails (Llama Guard, NeMo Guardrails) to audit incoming prompts.</li>
                            <li>Separate developer instructions from user content using structured roles.</li>
                            <li>Apply strict XML/JSON delimiters around user variables inside the system layout.</li>
                          </>
                        )}
                        {selectedTechnique.id === 'AML.T0015' && (
                          <>
                            <li>Adversarial alignment during training via RLHF (Reinforcement Learning from Human Feedback).</li>
                            <li>Deploy low-latency classifier checks to identify malicious jailbreak payloads.</li>
                            <li>Enforce strict token-length boundaries to limit nesting instruction vectors.</li>
                          </>
                        )}
                        {!['AML.T0034', 'AML.T0015'].includes(selectedTechnique.id) && (
                          <li>Standard system prompt filtering, output classification boundaries, and administrative authorization gates.</li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Associated preset / custom tests */}
                  <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-vulnerable)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> Mapped Diagnostic Prompts
                      </h4>
                      <button 
                        onClick={() => {
                          setEditingTestId(null);
                          setCustomForm(prev => ({ 
                            ...prev, 
                            techniqueId: selectedTechnique.id, 
                            techniqueName: selectedTechnique.name 
                          }));
                          setShowAddCustom(true);
                        }} 
                        disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                      >
                        <Plus size={12} /> Add Prompt
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minHeight: 0, overflowY: 'auto' }}>
                      {getMappedTestsForTechnique(selectedTechnique.id).map(test => (
                        <div key={test.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>{test.name}</span>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{test.origin}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
{test.id.startsWith('custom_') && (
                                <button 
                                  onClick={() => deleteTest(test.id)} 
disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                                  className="btn-secondary" 
                                  style={{ padding: '4px', color: 'var(--color-vulnerable)' }}
                                >
                                  <X size={12} />
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  setSelectedTests([test.id]);
                                  setActiveTab('runner');
                                }}
                                disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                                className="btn-primary" 
                                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                              >
                                Run
                              </button>
                          </div>
                        </div>
                      ))}
                      {getMappedTestsForTechnique(selectedTechnique.id).length === 0 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                          No test prompts mapped to this technique. Click "Add Prompt" above to create one.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Layers size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>Click any technique in the matrix above to view descriptions, mitigations, and run associated prompts.</p>
              </div>
            )}

            {/* Last-synced version note */}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '-12px' }}>
              {atlasSyncStatus}
            </div>
          </div>
  );
}

export default MatrixView;
