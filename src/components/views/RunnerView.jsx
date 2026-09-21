import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, X, Shield, Play, HelpCircle, Terminal } from 'lucide-react';
import { useAudit } from '../../context/AuditContext';
import { useUI } from '../../context/useUI';
import { useTests } from '../../context/TestsContext';
import { useProviders } from '../../context/ProvidersContext';
import { useSettings } from '../../context/SettingsContext';
import { deriveModelsEndpoint } from '../../utils/api';
import { SANDBOX_PROVIDER_ID } from '../../data/app-config';
import ComparisonResults from '../runner/ComparisonResults';

/**
 * RunnerView - Auditor Runner tab view (Model Comparison Lineup config panel,
 * Attack Payloads Selection card, run-audit controls with the inline
 * diagnostic console). The comparison-results grid + expanded-cell detail
 * render from the memoized ComparisonResults component. Consumes the shared
 * contexts directly and receives App-owned orchestration handlers as props.
 */
export function RunnerView({
  targets,
  addTarget,
  removeTarget,
  selectedProvider,
  setSelectedProvider,
  selectedModel,
  setSelectedModel,
  activeModels,
  selectedProviderObj,
  providerSelectable,
  expandedCell,
  setExpandedCell,
  runSecurityAudit,
  stopSecurityAudit,
  renderJudgeSelector,
  renderActiveModelChip,
  printRunReport,
  handleResultOverride,
}) {
  const { running, stopping, progress, consoleLogs, currentTestName } = useAudit();
  const { terminalOpen, setTerminalOpen } = useUI();
  const { allTests, selectedTests, presets, applyPreset, saveCurrentAsPreset, presetFeedback, testFilterOptions, evalMode, setEvalMode, toggleTest, selectAllTests } = useTests();
  const { providers, providerModelFetching, syncProviderModels, providerLabel } = useProviders();
  const { useDemoMode, judgeConfig } = useSettings();

  // Attack Payloads Selection filters (Auditor Runner)
  const [payloadFilterQ, setPayloadFilterQ] = useState('');
  const [payloadFilterTechnique, setPayloadFilterTechnique] = useState('all');
  const consoleScrollRef = useRef(null);

  // Auto-scroll the console container to the latest log WITHOUT moving the rest
  // of the page (scrolling into view would yank focus away from the results).
  useEffect(() => {
    if (consoleScrollRef.current) {
      consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
              
              {/* Configuration panel */}
              <div className="glass-card" data-tour="runner-lineup" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Model Comparison Lineup</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Add the models you want to compare. Every selected attack payload is run against each model side-by-side.
                  </p>
                </div>

                {/* Add target form */}
                <div data-tour="add-target" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label">Provider</label>
                      <select 
                        value={selectedProvider} 
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="form-input"
                        disabled={running}
                      >
                        {!useDemoMode && !providerSelectable(selectedProvider) && (
                          <option value={selectedProvider} disabled>Provider not configured — add one in Settings → Providers</option>
                        )}
                        {providerSelectable(SANDBOX_PROVIDER_ID) && <option value={SANDBOX_PROVIDER_ID}>Sandbox (demo, simulated)</option>}
                        {providers.filter(cp => cp.enabled !== false).map(cp => (
                          <option key={cp.id} value={cp.id}>{cp.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label">Model</label>
                      </div>

                      {selectedProviderObj && !(selectedProviderObj.models?.length) ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            value={selectedModel} 
                            onChange={(e) => setSelectedModel(e.target.value)}
                            placeholder="e.g. gpt-4o"
                            className="form-input"
                            disabled={running}
                          />
                          {deriveModelsEndpoint(selectedProviderObj) && (
                            <button 
                              onClick={() => syncProviderModels(selectedProviderObj)} 
                              className="btn-secondary"
                              disabled={providerModelFetching || running}
                              style={{ padding: '10px' }}
                              title="Fetch models from endpoint"
                            >
                              <RefreshCw size={16} className={providerModelFetching ? 'animate-spin-custom' : ''} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select 
                            value={selectedModel} 
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="form-input"
                            disabled={running || activeModels.length === 0}
                            style={{ flex: 1 }}
                          >
                            {activeModels.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                          {selectedProviderObj && deriveModelsEndpoint(selectedProviderObj) && (
                            <button 
                              onClick={() => syncProviderModels(selectedProviderObj)} 
                              className="btn-secondary"
                              disabled={providerModelFetching || running}
                              style={{ padding: '10px' }}
                              title="Fetch models from endpoint"
                            >
                              <RefreshCw size={16} className={providerModelFetching ? 'animate-spin-custom' : ''} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedProviderObj && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Custom endpoint: {selectedProviderObj.endpoint} · Rate limit: {selectedProviderObj.rpm} req/min
                    </span>
                  )}
                  {!useDemoMode && activeModels.length === 0 && !selectedProviderObj && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-vulnerable)' }}>
                      No models available. Add a provider in Settings → Providers to pick models.
                    </span>
                  )}

                  <button onClick={addTarget} className="btn-primary" disabled={running} style={{ justifyContent: 'center' }}>
                    <Plus size={16} /> Add to Comparison
                  </button>
                </div>

                {/* Lineup list */}
                <div>
                  <label className="form-label">Comparison Lineup ({targets.length})</label>
                  {targets.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px 0' }}>
                      No models added yet. Use the form above to add at least one target model.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {targets.map(t => (
                        <div key={t.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px' }}>
                          <div style={{ fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 600 }}>{t.model}</div>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{providerLabel(t.provider)}</span>
                          </div>
                          <button onClick={() => removeTarget(t.uid)} className="btn-secondary" disabled={running} style={{ padding: '4px', color: 'var(--color-vulnerable)' }}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="form-label">Evaluation Engine</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {[['keywords', 'Heuristic Keywords'], ['judge', 'AI Judge']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => { setEvalMode(val); localStorage.setItem('atlas_eval_mode', val); }}
                        className="btn-secondary"
                        style={{
                          flex: '1 1 auto', justifyContent: 'center', fontSize: '0.78rem', padding: '9px 12px',
                          background: evalMode === val ? 'rgba(59,130,246,0.15)' : undefined,
                          borderColor: evalMode === val ? 'rgba(59,130,246,0.45)' : undefined,
                          color: evalMode === val ? '#fff' : undefined
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {useDemoMode && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-warning)', display: 'block', marginTop: '6px' }}>
                      Sandbox is active — this run simulates responses, but you can still pick the judge for later.
                    </span>
                  )}

                  {/* AI Judge config — styled like the Generator model card; disabled unless AI Judge is selected */}
                  <div style={{
                    marginTop: '12px', padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-subtle)', borderRadius: '12px',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                    opacity: evalMode !== 'judge' ? 0.55 : 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <Shield size={16} color="var(--color-primary)" />
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>AI Judge Provider</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {evalMode !== 'judge' ? 'Select “AI Judge” to enable' : 'Evaluates every response before scoring'}
                      </span>
                    </div>
                    {renderJudgeSelector(evalMode !== 'judge')}
                  </div>
                </div>
              </div>

              {/* Payload Selector */}
              <div className="glass-card" data-tour="payload-selection" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Attack Payloads Selection</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {selectedTests.length} selected
                  </span>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '-8px' }}>
                  {new Set(allTests.map(t => t.techniqueId)).size} ATLAS techniques covered by {allTests.length} payloads
                  ({allTests.filter(t => t.isAuto).length} auto-generated).
                </p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => selectAllTests(true)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Select All</button>
                  <button onClick={() => selectAllTests(false)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Clear All</button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>·</span>
                  <select
                    value=""
                    data-tour="preset-select"
                    onChange={(e) => {
                      const p = presets.find(x => x.id === e.target.value);
                      if (p) applyPreset(p);
                      e.target.value = '';
                    }}
                    className="form-input"
                    style={{ padding: '4px 8px', fontSize: '0.7rem', width: 'auto' }}
                  >
                    <option value="" disabled>Load preset…</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.testIds.length})</option>
                    ))}
                  </select>
                  <button onClick={saveCurrentAsPreset} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} title="Save the current selection as a reusable preset">
                    <Plus size={12} /> Save as preset
                  </button>
                  {presetFeedback && presetFeedback.ids?.length === selectedTests.length &&
                    presetFeedback.ids.every(id => selectedTests.includes(id)) && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-secure)' }}>
                      Applied "{presetFeedback.name}" — {presetFeedback.count} selected
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={payloadFilterQ}
                    onChange={(e) => setPayloadFilterQ(e.target.value)}
                    placeholder="Search payloads…"
                    className="form-input"
                    style={{ flex: '1 1 160px', padding: '4px 8px', fontSize: '0.7rem' }}
                  />
                  <select
                    value={payloadFilterTechnique}
                    onChange={(e) => setPayloadFilterTechnique(e.target.value)}
                    className="form-input"
                    style={{ flex: '1 1 140px', padding: '4px 8px', fontSize: '0.7rem' }}
                  >
                    <option value="all">All techniques</option>
                    {testFilterOptions.techniques.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {allTests.filter(t => {
                      const q = payloadFilterQ.trim().toLowerCase();
                      if (q && !`${t.name} ${t.techniqueId} ${t.techniqueName}`.toLowerCase().includes(q)) return false;
                      if (payloadFilterTechnique !== 'all' && t.techniqueId !== payloadFilterTechnique) return false;
                      return true;
                    }).length} shown
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minHeight: 0, maxHeight: 'min(60vh, 640px)', overflowY: 'auto', paddingRight: '4px' }}>
                  {allTests
                    .filter(t => {
                      const q = payloadFilterQ.trim().toLowerCase();
                      if (q && !`${t.name} ${t.techniqueId} ${t.techniqueName}`.toLowerCase().includes(q)) return false;
                      if (payloadFilterTechnique !== 'all' && t.techniqueId !== payloadFilterTechnique) return false;
                      return true;
                    })
                    .map((test) => (
                    <label 
                      key={test.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: selectedTests.includes(test.id) ? 'rgba(59, 130, 246, 0.05)' : 'rgba(0,0,0,0.1)',
                        border: '1px solid',
                        borderColor: selectedTests.includes(test.id) ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-subtle)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedTests.includes(test.id)} 
                          onChange={() => toggleTest(test.id)}
                          disabled={running}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {test.isAuto && (
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>auto</span>
                            )}
                            {(test.origin?.includes('User') || test.id.startsWith('custom_') || test.id.startsWith('ai_')) && (
                              <span className="badge badge-primary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>custom</span>
                            )}
                            {test.name}
                            <span 
                              style={{ display: 'inline-flex', color: 'var(--text-muted)', cursor: 'help' }} 
                              title={`Source: ${test.origin}\n\nNotes: ${test.researchNotes}`}
                            >
                              <HelpCircle size={12} />
                            </span>
                          </div>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{test.techniqueId}</span>
                        </div>
                      </div>
                      <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>{test.tactic}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Run audit controls + inline diagnostic console */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Row 1: controls (always a single line, no wrap) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexWrap: 'nowrap' }}>
                   <button
                     data-testid="audit-run"
                     onClick={runSecurityAudit}
                    data-tour="run-audit"
                    className={`btn-primary ${running ? 'glow-active' : ''}`}
                    disabled={running}
                    style={{ flexShrink: 0 }}
                  >
                    {running ? (
                      <>
                        <RefreshCw size={16} className="animate-spin-custom" />
                        <span style={{ display: 'inline-block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                          Auditing: {currentTestName}...
                        </span>
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Run Comparison Audit
                      </>
                    )}
                  </button>
                  {running && (
                     <button data-testid="audit-stop" onClick={stopSecurityAudit} disabled={stopping} className="btn-secondary" style={{ color: 'var(--color-danger, #ff6b6b)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {stopping ? <RefreshCw size={16} className="animate-spin-custom" /> : <X size={16} />}
                      {stopping ? 'Stopping…' : 'Stop Audit'}
                    </button>
                  )}
                  {running && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Progress: {progress}%
                    </span>
                  )}
                  {running && renderActiveModelChip(
                    evalMode === 'judge'
                      ? (judgeConfig && judgeConfig.provider ? 'Judge:' : 'Judge: Not configured')
                      : 'Heuristic Keywords (offline)',
                    evalMode === 'judge' ? judgeConfig : { provider: '', model: '' }
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <button
                    onClick={() => setTerminalOpen(v => !v)}
                    data-tour="show-console"
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <Terminal size={14} /> {terminalOpen ? 'Hide Console' : 'Show Console'}
                    {consoleLogs.filter(l => l.includes('✗') || l.includes('ERROR')).length > 0 && (
                      <span style={{ color: 'var(--color-vulnerable)' }}>
                        ({consoleLogs.filter(l => l.includes('✗') || l.includes('ERROR')).length} errors)
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Row 2: progress bar (always present so the layout never jumps between 1 and 2 lines) */}
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${running ? progress : 0}%`,
                    background: running ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                    height: '100%',
                    transition: 'width 0.25s ease'
                  }}
                />
              </div>

              {terminalOpen && (
                <div ref={consoleScrollRef} className="code-box" style={{ maxHeight: '260px', overflowY: 'auto', padding: '10px', fontSize: '0.72rem', lineHeight: 1.5 }}>
                  {consoleLogs.length === 0 ? (
                    <span style={{ color: 'var(--text-dark)' }}>Console idle. Run a Comparison Audit to stream logs here...</span>
                  ) : (
                    consoleLogs.map((logStr, idx) => (
                      <div key={idx} style={{
                        color: logStr.includes('✓') ? 'var(--color-secure)' :
                          logStr.includes('✗') || logStr.includes('Verdict: VULNERABLE') ? 'var(--color-vulnerable)' :
                          logStr.includes('Evaluation:') ? 'var(--color-warning)' : '#c9d1d9'
                      }}>
                        {logStr}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Comparison results grid (memoized for re-render isolation) */}
            <ComparisonResults targets={targets} expandedCell={expandedCell} setExpandedCell={setExpandedCell} handleResultOverride={handleResultOverride} printRunReport={printRunReport} />

          </div>
  );
}

export default RunnerView;
