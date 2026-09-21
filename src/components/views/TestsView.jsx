import React from 'react';
import { Wand2, ChevronDown, ChevronUp, RefreshCw, Plus, X, Check, RotateCcw, Upload, Edit3, Trash2, Play } from 'lucide-react';
import { useTests, DEFAULT_PRESET_ID } from '../../context/TestsContext';
import { PRESET_TESTS, PROMPT_SOURCING_INFO } from '../../data/payloads';
import { useAIGen } from '../../context/useAIGen';
import { useProviders } from '../../context/ProvidersContext';
import { useUI } from '../../context/useUI';

/**
 * TestsView - Test Management tab view (AI generation card, test-cases table,
 * presets card). Consumes the shared contexts directly and receives App-owned
 * orchestration handlers as props.
 */
export function TestsView({
  recentlyGeneratedIds,
  effectiveGenConfig,
  renderActiveModelChip,
  openBulkImport,
  openAiWizard,
  clearNewMarkers,
  toggleAiGenSource,
  toggleAiGenUrl,
  removeAiGenUrl,
}) {
  const {
    allTests, allTestsWithDisabled, filteredSortedTests, sortedTests, testFilterOptions,
    testFilterQ, setTestFilterQ, testFilterTechnique, setTestFilterTechnique,
    testFilterSource, setTestFilterSource, testFilterEnabled, setTestFilterEnabled,
    testSortIndicator, clickTestSort, disabledTestIds, selectedTests,
    openEditTest, deleteTest, presets, savePresets, applyPreset, saveCurrentAsPreset, removePreset,
    resetTestSuite, openAddTest, toggleTest, selectAllTests,
  } = useTests();
  const {
    aiGenCollapsed, setAiGenCollapsed, testsCollapsed, setTestsCollapsed,
    aiGenerating, aiGenStage, aiGenStageDetail, aiGenMode,
    aiSourceProfiles, expandedSourceIds, toggleSourceExpanded, aiGeneratedCount,
    aiGenUrls, aiGenSourceKeys, openAddSourceDialog,
  } = useAIGen();
  const { vaultLocked, vaultPassphraseSet } = useProviders();
  const { setActiveTab } = useUI();

  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
    {/* AI Generation card */}
    <div className="glass-card" data-tour="ai-gen-pane" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Wand2 size={20} className="title-gradient" />
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              AI Test Generation
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Generate a new set of adversarial attack payloads from predefined sources or any URL / GitHub repository.
              The configured AI model infers the test cases from the sources.
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setAiGenCollapsed(prev => {
              const next = !prev;
              localStorage.setItem('atlas_ai_gen_collapsed', next ? '1' : '0');
              return next;
            });
          }}
          className="btn-secondary"
          style={{ padding: '6px', flexShrink: 0 }}
          title={aiGenCollapsed ? 'Expand AI generation options' : 'Collapse AI generation options'}
        >
          {aiGenCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!aiGenCollapsed && (
        <>{aiGenerating ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <RefreshCw size={18} className="animate-spin-custom" />
            <span>
              {aiGenStage === 'analyzing' && 'Analyzing sources…'}
              {aiGenStage === 'generating' && 'Generating test payloads…'}
              {aiGenStage === 'critiquing' && 'Critiquing & refining tests…'}
              {!aiGenStage && `Generating with ${effectiveGenConfig.provider} AI…`}
            </span>
          </div>
          {aiGenStageDetail && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{aiGenStageDetail}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {renderActiveModelChip('Generating with', effectiveGenConfig)}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {aiGenMode === 'deep' ? 'Deep (analyze → generate → critique)' : 'Fast (single pass)'} — this can take a minute
            </span>
          </div>
        </div>
      ) : (
        <>
          <div>
            {(() => {
              const assessmentMeta = (status) => ({
                high: ['RELEVANT · HIGH', 'var(--color-secure)', 'rgba(22,163,74,0.15)'],
                medium: ['MAYBE RELEVANT', 'var(--color-warning)', 'rgba(245,158,11,0.15)'],
                low: ['LOW RELEVANCE', 'var(--color-vulnerable)', 'rgba(239,68,68,0.15)'],
                irrelevant: ['IRRELEVANT', 'var(--color-vulnerable)', 'rgba(239,68,68,0.18)']
              }[status] || ['ASSESSED', 'var(--text-muted)', 'rgba(255,255,255,0.05)']);
              const renderRow = (row) => {
                const status = row.status;
                const statusLabel = status === 'declined' ? 'PROXY DECLINED — INFERRING' : status === 'proxyFailed' ? 'PROXY FAILED — INFERRING' : status === 'pasted' ? 'PASTED' : status === 'fetched' ? 'CONTENT FETCHED' : status === 'corsBlocked' ? 'CORS-BLOCKED — INFERRING' : 'BUNDLED';
                const statusColor = (status === 'declined' || status === 'proxyFailed') ? 'var(--color-warning)' : (status === 'pasted' || status === 'corsBlocked') ? 'var(--color-warning)' : 'var(--color-secure)';
                const statusBg = (status === 'declined' || status === 'proxyFailed') ? 'rgba(245,158,11,0.15)' : (status === 'pasted' || status === 'corsBlocked') ? 'rgba(245,158,11,0.15)' : 'rgba(22,163,74,0.15)';
                const [alabel, acolor, abg] = row.assessment ? assessmentMeta(row.assessment.status) : ['—', 'var(--text-muted)', 'rgba(255,255,255,0.05)'];
                const expanded = expandedSourceIds.has(row.id);
                return (
                  <div key={row.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.75rem' }}>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontWeight: 600, color: 'inherit', wordBreak: 'break-word' }}>
                        <span>{row.title}</span>
                        <span className="badge" style={{ fontSize: '0.52rem', background: row.tag === 'DEFAULT' ? 'rgba(96,165,250,0.15)' : 'rgba(168,85,247,0.15)', color: row.tag === 'DEFAULT' ? 'var(--color-primary)' : 'var(--color-secondary)', border: '1px solid var(--border-subtle)' }}>{row.tag}</span>
                        <span className="badge" style={{ fontSize: '0.58rem', background: statusBg, color: statusColor, border: '1px solid var(--border-subtle)' }}>{statusLabel}</span>
                        <span className="badge" style={{ fontSize: '0.58rem', background: abg, color: acolor, border: '1px solid var(--border-subtle)' }}>{alabel}</span>
                        {row.assessing && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={11} className="animate-spin-custom" /> Assessing…
                          </span>
                        )}
                      </div>
                      {row.desc && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{row.desc}</div>}
                      {expanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                          {row.url ? (
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>URL:</span> {row.url}
                            </div>
                          ) : row.pasteChars != null ? (
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Pasted content · {row.pasteChars.toLocaleString()} characters</div>
                          ) : null}
                          {row.assessment && (row.assessment.summary || row.assessment.reason) && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Assessment:</span>
                              {row.assessment.summary && <div style={{ marginTop: '2px' }}>{row.assessment.summary}</div>}
                              {row.assessment.reason && <div style={{ marginTop: '2px' }}>{row.assessment.reason}</div>}
                              {(row.assessment.status === 'low' || row.assessment.status === 'irrelevant') && (
                                <div style={{ marginTop: '4px', color: 'var(--color-warning)' }}>Tests generated from this source may be weak or off-topic.</div>
                              )}
                            </div>
                          )}
                          {row.profile && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-warning)' }}>Analysis:</span>
                              <div style={{ marginTop: '2px' }}><b>{row.profile.vulnerabilityClass || 'Unclassified'}</b></div>
                              {row.profile.vectors.map((v, vi) => (
                                <div key={vi} style={{ marginTop: '4px' }}>
                                  <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{v.name}</span> → {v.techniqueId} {v.techniqueName}
                                  <div>{v.description}</div>
                                  {v.payloadShape && (
                                    <div style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '4px 6px', borderRadius: '4px', marginTop: '2px' }}>&ldquo;{v.payloadShape}&rdquo;</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => toggleSourceExpanded(row.id)} className="btn-secondary" style={{ padding: '3px' }} title={expanded ? 'Collapse source details' : 'Expand source details'} aria-expanded={expanded}>
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {row.onRemove && (
                        <button onClick={row.onRemove} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ padding: '3px', color: 'var(--color-vulnerable)' }} title="Remove source">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              };
              const defRows = Object.entries(PROMPT_SOURCING_INFO).map(([key, info]) => ({
                id: key, tag: 'DEFAULT', title: info.origin, url: info.url, desc: info.description,
                fetchNote: info.fetchNote, assessment: info.assessment, profile: aiSourceProfiles[key],
                enabled: aiGenSourceKeys.includes(key), onToggle: () => toggleAiGenSource(key), status: 'bundled'
              }));
              const customRows = aiGenUrls.map(s => ({
                id: s.id, tag: 'CUSTOM', title: s.title || s.url || 'Untitled source',
                url: s.kind === 'paste' ? null : s.url,
                pasteChars: s.kind === 'paste' ? s.excerpt.length : null,
                desc: s.description, fetchNote: s.fetchNote, assessing: s.assessing,
                assessment: s.assessment, profile: aiSourceProfiles[s.id],
                enabled: s.enabled, onToggle: () => toggleAiGenUrl(s.id),
                status: s.declined ? 'declined' : s.proxyFailed ? 'proxyFailed' : s.kind === 'paste' ? 'pasted' : s.excerpt ? 'fetched' : 'corsBlocked',
                onRemove: () => removeAiGenUrl(s.id)
              }));
              const rows = [...defRows, ...customRows];
              return (
                <div>
                  <span className="form-label">Sources</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    {rows.map(renderRow)}
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={openAddSourceDialog} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Add custom source (URL / GitHub repo / article)
            </button>
            <button onClick={openAiWizard} disabled={vaultLocked && (vaultPassphraseSet ?? false)} data-tour="ai-generate" className="btn-primary" style={{ justifyContent: 'center', padding: '10px 22px' }} title={vaultLocked && (vaultPassphraseSet ?? false) ? 'Disabled in read-only mode — unlock your API keys' : undefined}>
              <Wand2 size={16} /> Generate &amp; Review Tests
            </button>
          </div>
        </>
      )}
        </>
      )}
    </div>

    {/* Test management card */}
    <div className="glass-card" data-tour="test-cases" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Test Cases ({allTests.length} active{allTestsWithDisabled.length > allTests.length ? ` · ${allTestsWithDisabled.length - allTests.length} removed` : ''})</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {recentlyGeneratedIds.length > 0 && (
              <span style={{ color: 'var(--color-primary)', display: 'block', marginBottom: '2px' }}>
                {recentlyGeneratedIds.length} newly added test(s) are marked with a NEW badge.
              </span>
            )}
            {aiGeneratedCount > 0 && recentlyGeneratedIds.length === 0 && (
              <span style={{ color: 'var(--color-secure)', display: 'block', marginBottom: '2px' }}>
                Last AI run added {aiGeneratedCount} new test(s).
              </span>
            )}
            Manage the full suite: add, edit, or remove payloads. Edited presets become overrides, removed tests can be restored. Click a column header to sort.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => {
              setTestsCollapsed(prev => {
                const next = !prev;
                localStorage.setItem('atlas_tests_collapsed', next ? '1' : '0');
                return next;
              });
            }}
            className="btn-secondary"
            style={{ padding: '8px', fontSize: '0.8rem' }}
            title={testsCollapsed ? 'Expand test cases table' : 'Collapse test cases table'}
          >
            {testsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          {recentlyGeneratedIds.length > 0 && (
            <button onClick={clearNewMarkers} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
              <X size={15} /> Clear NEW markers
            </button>
          )}
          <button onClick={() => selectAllTests(true)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
            <Check size={15} /> Select all
          </button>
          <button onClick={() => selectAllTests(false)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
            <X size={15} /> Select none
          </button>
          <button onClick={resetTestSuite} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px', color: 'var(--color-vulnerable)' }} title="Remove all custom & AI-generated tests and restore the predefined suite">
            <RotateCcw size={15} /> Reset Suite
          </button>
          <button onClick={openAddTest} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
            <Plus size={15} /> Add Custom Test
          </button>
          <button onClick={openBulkImport} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }} title="Bulk import tests from native JSON/YAML (or JSONL/CSV) test-case files">
            <Upload size={15} /> Bulk Import
          </button>
        </div>
      </div>

      {/* Test filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '4px' }}>
        <input
          type="text"
          value={testFilterQ}
          onChange={(e) => setTestFilterQ(e.target.value)}
          placeholder="Search name, technique, source…"
          className="form-input"
          style={{ flex: '1 1 200px', padding: '6px 10px', fontSize: '0.78rem' }}
        />
        <select
          value={testFilterTechnique}
          onChange={(e) => setTestFilterTechnique(e.target.value)}
          className="form-input"
          style={{ flex: '1 1 160px', padding: '6px 10px', fontSize: '0.78rem' }}
        >
          <option value="all">All techniques</option>
          {testFilterOptions.techniques.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={testFilterSource}
          onChange={(e) => setTestFilterSource(e.target.value)}
          className="form-input"
          style={{ flex: '1 1 180px', padding: '6px 10px', fontSize: '0.78rem' }}
        >
          <option value="all">All sources</option>
          {testFilterOptions.sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={testFilterEnabled}
          onChange={(e) => setTestFilterEnabled(e.target.value)}
          className="form-input"
          style={{ flex: '1 1 130px', padding: '6px 10px', fontSize: '0.78rem' }}
        >
          <option value="all">All (enabled & removed)</option>
          <option value="enabled">Enabled only</option>
          <option value="disabled">Removed only</option>
        </select>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {filteredSortedTests.length} of {sortedTests.length} shown
        </span>
      </div>

      {!testsCollapsed && (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px', width: '32px' }}></th>
              <th onClick={() => clickTestSort('name')} style={{ padding: '8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                Test Name{testSortIndicator('name')}
              </th>
              <th onClick={() => clickTestSort('techniqueId')} style={{ padding: '8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                Technique{testSortIndicator('techniqueId')}
              </th>
              <th onClick={() => clickTestSort('source')} style={{ padding: '8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                Source{testSortIndicator('source')}
              </th>
              <th style={{ padding: '8px', textAlign: 'right', width: '90px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSortedTests.map(test => {
              const isDisabled = disabledTestIds.includes(test.id);
              const isCustom = test.origin?.includes('User') || test.id.startsWith('custom_') || test.id.startsWith('ai_');
              const isNew = recentlyGeneratedIds.includes(test.id);
              return (
                <tr key={test.id} style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: isNew ? 'rgba(168,85,247,0.10)' : isDisabled ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                  opacity: isDisabled ? 0.55 : 1
                }}>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="checkbox"
                      checked={selectedTests.includes(test.id)}
                      onChange={() => toggleTest(test.id)}
                      style={{ accentColor: 'var(--color-primary)' }}
                      title="Include in runner"
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, flexWrap: 'wrap' }}>
                      {test.name}
                      {isNew && <span className="badge badge-primary" style={{ fontSize: '0.55rem', padding: '1px 6px', fontWeight: 800 }}>NEW</span>}
                      {test.isAuto && <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>auto</span>}
                      {isCustom && <span className="badge badge-primary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>custom</span>}
                      {isDisabled && <span className="badge badge-vulnerable" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>removed</span>}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {test.tactic}
                    </div>
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--color-secondary)' }}>{test.techniqueId}</span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{test.origin}</span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEditTest(test)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ padding: '5px', fontSize: '0.7rem' }} title="Edit test">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => deleteTest(test.id)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ padding: '5px', color: 'var(--color-vulnerable)', fontSize: '0.7rem' }} title={isDisabled ? 'Restore test' : 'Remove test'}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>

    {/* Test Presets (merged into Test Cases) */}
    <div data-tour="test-presets" style={{ marginTop: '4px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Test Presets</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Curated groups of tests you can apply in the Auditor Runner's "Attack Payloads Selection". The Default
            preset ships with the most interesting curated payloads.
          </p>
        </div>
        <button onClick={saveCurrentAsPreset} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
          <Plus size={15} /> Save current selection as preset
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {presets.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No presets yet. Save a selection as a preset to get started.</span>
        )}
        {!presets.some(p => p.id === DEFAULT_PRESET_ID) && (
          <button
            onClick={() => savePresets([...presets, { id: DEFAULT_PRESET_ID, name: 'Default', testIds: PRESET_TESTS.map(t => t.id) }])}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px', alignSelf: 'flex-start' }}
            title="Re-add the built-in Default preset (the curated payloads)"
          >
            <RotateCcw size={14} /> Restore Default preset
          </button>
        )}
        {presets.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', gap: '12px' }}>
            <div style={{ fontSize: '0.85rem', minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {p.name}
                {p.id === DEFAULT_PRESET_ID && (
                  <span style={{ marginLeft: '8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 6px' }}>BUILT-IN</span>
                )}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {p.testIds.length} test(s) · {p.testIds.filter(id => allTests.some(t => t.id === id)).length} currently available
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => { setActiveTab('runner'); applyPreset(p); }} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }} title="Apply in the Auditor Runner">
                <Play size={12} /> Apply
              </button>
              <button onClick={() => removePreset(p.id)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: 'var(--color-vulnerable)' }} title="Delete preset">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
}

export default TestsView;
