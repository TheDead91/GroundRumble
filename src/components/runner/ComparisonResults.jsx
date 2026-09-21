import React, { useState, useEffect, memo } from 'react';
import { Info, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, AlertTriangle, Download, Lock, X, HelpCircle } from 'lucide-react';
import { useAudit } from '../../context/AuditContext';
import { useHistory, resultOverrideKey } from '../../context/HistoryContext';
import { useTests } from '../../context/TestsContext';
import { useProviders } from '../../context/ProvidersContext';
import {
  buildComparisonRows,
  classifyComparisonRows,
  selectWorstResult,
  sortComparisonRows,
  summarizeModelResults,
} from '../../utils/comparison-table.js';
import { summarizeVerdicts } from '../../utils/verdict-summary';

/**
 * ComparisonResults - the comparison-results surface of the Auditor Runner
 * (empty state, payload x model matrix with its failed/inconclusive/succeeded
 * groupings, per-model summaries, Download Report wiring, expanded-cell detail
 * with the manual verdict override UI). Consumes the shared contexts directly
 * and receives App-owned orchestration as bare-identifier props so the
 * memoized component bails out of config-panel re-renders (the view's local
 * state changes do not touch the results tree).
 */
export function ComparisonResults({
  targets,
  expandedCell,
  setExpandedCell,
  handleResultOverride,
  printRunReport,
}) {
  const { running, results } = useAudit();
  const { overrides, effectiveStatus, effectiveDetails } = useHistory();
  const { allTests } = useTests();
  const { vaultLocked, vaultPassphraseSet, providerLabel, modelTargetLabel } = useProviders();

  // Comparison results view state (runner-only UI atoms; expandedCell stays App-owned)
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showFailedGroup, setShowFailedGroup] = useState(true);
  const [showInconclusiveGroup, setShowInconclusiveGroup] = useState(false);
  const [showSucceededGroup, setShowSucceededGroup] = useState(false);

  // When a comparison result cell is expanded, bring the detailed result into
  // view so the user immediately sees the executed test content.
  useEffect(() => {
    if (expandedCell) {
      const el = document.querySelector('[data-tour="expanded-result"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [expandedCell]);

  return (
    <>
      {/* Comparison Results */}
      {results.length === 0 && !running && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <Info size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <p style={{ fontSize: '0.85rem' }}>No results yet. Run a Comparison Audit to see the payload × model matrix here.</p>
        </div>
      )}
      {results.length > 0 && (() => {
        const rows = buildComparisonRows({ results, allTests, targets, effectiveStatus });
        const testIds = rows.map(row => row.testId);
        const groups = classifyComparisonRows(rows, effectiveStatus);
        const failedRows = sortComparisonRows(groups.failedRows, sortKey, sortDir);
        const inconclusiveRows = sortComparisonRows(groups.inconclusiveRows, sortKey, sortDir);
        const succeededRows = sortComparisonRows(groups.succeededRows, sortKey, sortDir);

        const sortIndicator = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
        const clickSort = (key) => {
          if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
          else { setSortKey(key); setSortDir('asc'); }
        };

        const renderResultsTable = (list) => (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th onClick={() => clickSort('name')} style={{ padding: '10px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                    Attack Payload{sortIndicator('name')}
                  </th>
                  <th onClick={() => clickSort('technique')} style={{ padding: '10px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}>
                    Technique{sortIndicator('technique')}
                  </th>
                  <th onClick={() => clickSort('result')} style={{ padding: '10px 8px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>
                    Result{sortIndicator('result')}
                  </th>
                  {targets.map(t => (
                    <th key={t.uid} style={{ padding: '10px 8px', textAlign: 'center' }}>{t.model}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(({ testId, test, cellRes }) => (
                  <tr key={testId} data-testid={`result-row-${testId}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{test ? test.name : testId}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 600 }}>{test ? test.techniqueId : ''}</span>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{test ? test.tactic : ''}</div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {(() => {
                        const worstRow = selectWorstResult(cellRes, effectiveStatus);
                        if (!worstRow) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                        const s = effectiveStatus(worstRow);
                        return s === 'SECURE' ? (
                          <span className="badge badge-secure"><ShieldCheck size={12} /> SECURE</span>
                        ) : s === 'VULNERABLE' ? (
                          <span className="badge badge-vulnerable"><ShieldAlert size={12} /> VULNERABLE</span>
                        ) : s === 'EMPTY' ? (
                          <span className="badge badge-secondary"><Info size={12} /> EMPTY</span>
                        ) : s === 'INCONCLUSIVE' ? (
                          <span className="badge badge-warning"><HelpCircle size={12} /> INCONCLUSIVE</span>
                        ) : (
                          <span className="badge badge-warning"><AlertTriangle size={12} /> ERROR</span>
                        );
                      })()}
                    </td>
                    {targets.map(t => {
                      const res = cellRes[targets.findIndex(tt => tt.uid === t.uid)];
                      const active = expandedCell && expandedCell.testId === testId && expandedCell.targetUid === t.uid;
                      return (
                        <td key={t.uid} style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => setExpandedCell(active ? null : { testId, targetUid: t.uid })}
                            disabled={!res}
                            className="btn-secondary"
                            style={{ borderColor: active ? 'var(--color-primary)' : 'transparent', background: active ? 'rgba(59,130,246,0.1)' : 'transparent', padding: '6px 12px', width: '100%' }}
                          >
                            {!res ? (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            ) : (() => {
                              const s = effectiveStatus(res);
                              return s === 'SECURE' ? (
                                <span className="badge badge-secure"><ShieldCheck size={12} /> SECURE</span>
                              ) : s === 'VULNERABLE' ? (
                                <span className="badge badge-vulnerable"><ShieldAlert size={12} /> VULNERABLE</span>
                              ) : s === 'EMPTY' ? (
                                <span className="badge badge-secondary"><Info size={12} /> EMPTY</span>
                              ) : s === 'INCONCLUSIVE' ? (
                                <span className="badge badge-warning"><HelpCircle size={12} /> INCONCLUSIVE</span>
                              ) : (
                                <span className="badge badge-warning"><AlertTriangle size={12} /> ERROR</span>
                              );
                            })()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        const groupHeader = (label, count, open, color, toggle) => (
          <button
            onClick={toggle}
            className="btn-secondary"
            style={{ justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: `rgba(${color}, 0.06)`, borderColor: `rgba(${color}, 0.3)`, fontSize: '0.9rem', fontWeight: 700 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              {label} ({count})
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>click to {open ? 'collapse' : 'expand'}</span>
          </button>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" data-tour="results-table" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Comparison Results</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {testIds.length} tests × {targets.length} models
                  </span>
                   <button
                     data-testid="run-report"
                    onClick={() => printRunReport(results.map(effectiveDetails), {
                      title: 'GroundRumble Security Audit Report',
                      subtitle: 'Auditor Runner — Comparison Run',
                      meta: [`Targets: ${targets.map(t => modelTargetLabel(t.provider, t.model)).join(' · ')}`]
                    })}
                    disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                  >
                    <Download size={14} style={{ marginRight: '6px' }} />
                    Download Report
                  </button>
                </div>
              </div>

              {/* Per-model summary */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {targets.map(t => {
                  const modelResults =
                    results.map(effectiveDetails).filter(r => r.targetUid === t.uid);
                  const {
                    secure,
                    vulnerable: vuln,
                    errors: errs,
                    empties,
                    inconclusives,
                  } = summarizeVerdicts(modelResults);
                  const { valid, score } = summarizeModelResults(results, t.uid, effectiveDetails);
                  return (
                    <div key={t.uid} data-testid={`model-summary-${t.uid}`} style={{ flex: '1 1 200px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{t.model}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{providerLabel(t.provider)}</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '6px', color: valid > 0 ? (score > 70 ? 'var(--color-secure)' : score > 40 ? 'var(--color-warning)' : 'var(--color-vulnerable)') : 'var(--text-muted)' }}>
                        {score === null ? '—' : `${score}%`}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span style={{ color: 'var(--color-secure)' }}>{secure} secure</span> · <span style={{ color: 'var(--color-vulnerable)' }}>{vuln} vulnerable</span>
                        {errs > 0 && <> · <span style={{ color: 'var(--color-warning)' }}>{errs} errors</span></>}
                        {empties > 0 && <> · <span style={{ color: 'var(--text-muted)' }}>{empties} empty</span></>}
                        {inconclusives > 0 && <> · <span style={{ color: 'var(--color-warning)' }}>{inconclusives} inconclusive</span></>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Failed group (collapsible, expanded by default) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groupHeader('Failed Attack Payloads', failedRows.length, showFailedGroup, '239, 68, 68', () => setShowFailedGroup(prev => !prev))}
                {showFailedGroup && (failedRows.length > 0 ? renderResultsTable(failedRows) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-secure)', padding: '8px 4px' }}>
                    No vulnerable results recorded.
                  </p>
                ))}
              </div>

              {/* Inconclusive group (errors / empty responses, collapsible) */}
              {inconclusiveRows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {groupHeader('Inconclusive (errors / empty)', inconclusiveRows.length, showInconclusiveGroup, '245, 158, 11', () => setShowInconclusiveGroup(prev => !prev))}
                  {showInconclusiveGroup && renderResultsTable(inconclusiveRows)}
                </div>
              )}

              {/* Succeeded group (collapsible, collapsed by default) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {groupHeader('Succeeded Attack Payloads', succeededRows.length, showSucceededGroup, '34, 197, 94', () => setShowSucceededGroup(prev => !prev))}
                {showSucceededGroup && (succeededRows.length > 0 ? renderResultsTable(succeededRows) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 4px' }}>No succeeded payloads.</p>
                ))}
              </div>

              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '-4px' }}>
                Click a verdict cell to inspect the full prompt, response, and evaluation reasoning. Click the column headers to sort.
              </p>
            </div>
          </div>
        );
      })()}

          {/* Expanded cell detail */}
          {expandedCell && (() => {
            const res = results.find(r => r.testId === expandedCell.testId && r.targetUid === expandedCell.targetUid);
            if (!res) return null;
            const effStatus = effectiveStatus(res);
            const isSecure = effStatus === 'SECURE';
            const isError = effStatus === 'ERROR';
            const isEmpty = effStatus === 'EMPTY';
            const isInconclusive = effStatus === 'INCONCLUSIVE';
            return (
              <div data-tour="expanded-result" className="glass-card" style={{ borderLeft: `4px solid ${isEmpty ? 'var(--color-secondary)' : (isError || isInconclusive) ? 'var(--color-warning)' : isSecure ? 'var(--color-secure)' : 'var(--color-vulnerable)'}`, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>{res.testName}</h4>
                      <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>{res.techniqueId}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Tactic: {res.tactic} | Model: {modelTargetLabel(res.provider, res.model)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isEmpty ? (
                      <span className="badge badge-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        <Info size={14} /> EMPTY
                      </span>
                    ) : isError ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        <AlertTriangle size={14} /> ERROR
                      </span>
                    ) : isInconclusive ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        <HelpCircle size={14} /> INCONCLUSIVE
                      </span>
                    ) : isSecure ? (
                      <span className="badge badge-secure" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        <ShieldCheck size={14} /> SECURE
                      </span>
                    ) : (
                      <span className="badge badge-vulnerable" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        <ShieldAlert size={14} /> VULNERABLE
                      </span>
                    )}
                    <button onClick={() => setExpandedCell(null)} className="btn-secondary" style={{ padding: '6px' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Manual verdict override */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Override verdict:</span>
                  <button onClick={() => handleResultOverride(res, 'SECURE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(res)]?.verdict === 'SECURE' ? 'var(--color-secure)' : undefined }}>Secure</button>
                  <button onClick={() => handleResultOverride(res, 'VULNERABLE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(res)]?.verdict === 'VULNERABLE' ? 'var(--color-vulnerable)' : undefined }}>Vulnerable</button>
                  <button onClick={() => handleResultOverride(res, 'INCONCLUSIVE')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px', color: overrides[resultOverrideKey(res)]?.verdict === 'INCONCLUSIVE' ? 'var(--color-warning)' : undefined }}>Inconclusive</button>
                  {overrides[resultOverrideKey(res)] && (
                    <button onClick={() => handleResultOverride(res, null)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>Clear override</button>
                  )}
                </div>

                {vaultLocked ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.35)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <Lock size={16} color="var(--color-secondary)" />
                    <span>Vault locked — unlock your API keys to inspect prompts, responses, and reasoning.</span>
                  </div>
                ) : (
                  <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      Model System Settings Context
                    </span>
                    <div className="code-box" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {res.systemPrompt}
                    </div>

                    <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', margin: '12px 0 6px 0' }}>
                      Attacker Payload Input
                    </span>
                    <div className="code-box" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {res.userPrompt}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      Model Response Output
                    </span>
                    <div className="code-box" style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.5)', borderColor: isEmpty ? 'rgba(139,147,166,0.15)' : isError ? 'rgba(234,179,8,0.1)' : isSecure ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                      {res.response}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.8rem' }}>
                  <span style={{ fontWeight: 700, color: isError ? 'var(--color-warning)' : isSecure ? 'var(--color-secure)' : 'var(--color-vulnerable)', display: 'block', marginBottom: '4px' }}>
                    Auditor Evaluation Reasoning:
                  </span>
                  <p style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{res.reasoning}</p>
                </div>
                  </>
                )}
              </div>
            );
          })()}

    </>
  );
}

export default memo(ComparisonResults);
