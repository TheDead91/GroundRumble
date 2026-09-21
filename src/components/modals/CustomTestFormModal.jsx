import { X } from 'lucide-react';

import { useTests } from '../../context/TestsContext';

export function CustomTestFormModal() {
  const {
    showAddCustom, setShowAddCustom, editingTestId, setEditingTestId,
    customForm, setCustomForm, handleAddCustomTest
  } = useTests();

  return (
    <>
      {showAddCustom && (
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
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{editingTestId ? 'Edit test payload' : 'Create custom diagnostic prompt'}</h3>
              <button onClick={() => { setShowAddCustom(false); setEditingTestId(null); }} className="btn-secondary icon-btn" data-tip="Close" style={{ padding: '6px' }}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddCustomTest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Test Case Name *</label>
                <input 
                  type="text" 
                  value={customForm.name} 
                  onChange={(e) => setCustomForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Jailbreak Adversarial Suffix"
                  className="form-input"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="form-label">Technique ID</label>
                  <input 
                    type="text" 
                    value={customForm.techniqueId} 
                    onChange={(e) => setCustomForm(p => ({ ...p, techniqueId: e.target.value }))}
                    placeholder="e.g. AML.T0034"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Technique Name</label>
                  <input 
                    type="text" 
                    value={customForm.techniqueName} 
                    onChange={(e) => setCustomForm(p => ({ ...p, techniqueName: e.target.value }))}
                    placeholder="e.g. LLM Prompt Injection"
                    className="form-input"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Tactic</label>
                <select 
                  value={customForm.tactic} 
                  onChange={(e) => setCustomForm(p => ({ ...p, tactic: e.target.value }))}
                  className="form-input"
                >
                  <option value="Reconnaissance">Reconnaissance</option>
                  <option value="ML Model Access">ML Model Access</option>
                  <option value="Execution">Execution</option>
                  <option value="Defense Evasion">Defense Evasion</option>
                  <option value="Exfiltration">Exfiltration</option>
                  <option value="Impact">Impact</option>
                </select>
              </div>

              <div>
                <label className="form-label">Description / Rationale</label>
                <textarea 
                  value={customForm.description} 
                  onChange={(e) => setCustomForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Explain the security threat vector tested by this prompt."
                  className="form-input"
                  style={{ minHeight: '60px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label className="form-label">System Prompt / Instructions</label>
                <textarea 
                  value={customForm.systemPrompt} 
                  onChange={(e) => setCustomForm(p => ({ ...p, systemPrompt: e.target.value }))}
                  placeholder="Developer settings or constraints set on the target model."
                  className="form-input"
                  style={{ minHeight: '60px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label className="form-label">Attacker Prompt Payload *</label>
                <textarea 
                  value={customForm.userPrompt} 
                  onChange={(e) => setCustomForm(p => ({ ...p, userPrompt: e.target.value }))}
                  placeholder="The malicious injection payload designed to override system guidelines."
                  className="form-input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label className="form-label">Failure Indicators (Comma separated)</label>
                  <input 
                    type="text" 
                    value={customForm.failKeywords} 
                    onChange={(e) => setCustomForm(p => ({ ...p, failKeywords: e.target.value }))}
                    placeholder="e.g. code, script, override"
                    className="form-input"
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Keywords indicating the attack succeeded.
                  </span>
                </div>
                <div>
                  <label className="form-label">Refusal Indicators (Comma separated)</label>
                  <input 
                    type="text" 
                    value={customForm.refusalKeywords} 
                    onChange={(e) => setCustomForm(p => ({ ...p, refusalKeywords: e.target.value }))}
                    placeholder="e.g. sorry, cannot, policy"
                    className="form-input"
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Keywords indicating the attack was resisted.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => { setShowAddCustom(false); setEditingTestId(null); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingTestId ? 'Update Test' : 'Save Payload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default CustomTestFormModal;
