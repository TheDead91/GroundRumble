import React, { useState } from 'react';
import {
  AlertTriangle,
  Shield,
  History,
  Check,
  Info,
  Download,
  Eye,
  Trash2,
} from 'lucide-react';
import { useUI } from '../../context/useUI';
import { useProviders } from '../../context/ProvidersContext';
import { useHistory } from '../../context/HistoryContext';
import { useSettings } from '../../context/SettingsContext';
import { buildModelReportBody, openPrintableReport } from '../../utils/report-builder';
import { deriveDashboardMetrics, modelKeyFor } from '../../utils/dashboard-metrics';
import { summarizeVerdicts } from '../../utils/verdict-summary';

/**
 * DashboardView - Dashboard tab view
 * Shows the sandbox banner, the four security scorecards, the per-model resilience
 * table (dashSort controls + per-tactic ATLAS columns) and the audit logs history.
 * Consumes History/Providers/Settings/UI contexts directly; App-owned orchestration
 * (printRunReport, handleDeleteAudit, clearHistory, effectiveDetails, detail-panel state) is wired as props.
 */
export function DashboardView({ effectiveDetails, clearHistory, printRunReport, handleDeleteAudit, setSelectedAudit, setExpandedDetailIds }) {
  const { addToast } = useUI();
  const { providerLabel, modelTargetLabel, vaultLocked, vaultPassphraseSet } = useProviders();
  const { history } = useHistory();
  const { atlasMatrix } = useSettings();

  // Dashboard per-model table sort state
  const [dashSortKey, setDashSortKey] = useState('model');
  const [dashSortDir, setDashSortDir] = useState('asc');

  const metrics = deriveDashboardMetrics({ history, atlasMatrix, effectiveDetails, providerLabel, dashSortKey, dashSortDir });
  const {
    allHistoricalResults, allModelKeys, sandboxModelKeys, isSandboxModel, modelsTestedCount,
    vulnerableModelKeys, vulnerableModelsCount, perModelOverall, perModelTacticStats,
    tacticIdByName, dashTacticColumns, modelNameFor, modelProviderFor, tacticScoreFor,
    overallScoreFor, sortedModelKeys,
  } = metrics;
  void sandboxModelKeys;
  void vulnerableModelKeys;
  void perModelOverall;

  // Dashboard Stats Calculations
  const totalAuditsCount = history.length;
  // Cancelled records contain only completed result rows, so those rows remain
  // scoreable while unfinished work contributes nothing.
  const {
    vulnerable: historicalVulnerableCount,
    secure: historicalSecureCount,
    valid: totalTestsRunCount,
    resilience: overallSecurityScore,
  } = summarizeVerdicts(allHistoricalResults);
  const hasEvaluatedTests = totalTestsRunCount > 0;
  void historicalVulnerableCount;
  void historicalSecureCount;
  void hasEvaluatedTests;

  const dashSortIndicator = (key) => dashSortKey === key ? (dashSortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const clickDashSort = (key) => {
    if (dashSortKey === key) setDashSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setDashSortKey(key); setDashSortDir('asc'); }
  };
  const printModelReport = (modelKey) => {
    if (vaultLocked) {
      addToast('Unlock your API keys to generate reports.');
      return;
    }
    const [provider, ...modelParts] = modelKey.split('::');
    const model = modelParts.join('::');
    const modelResults = allHistoricalResults.filter(r => modelKeyFor(r) === modelKey);
    openPrintableReport(window, buildModelReportBody({ model, provider, modelResults, tacticStats: perModelTacticStats[modelKey] || {}, providerLabel }), { addToast });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {history[0]?.isDemo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <AlertTriangle size={16} color="var(--color-warning)" />
          <span>
            The most recent audit ran in <b>Sandbox mode</b> — model responses were <b>simulated</b>, not real API
            calls. Results below reflect simulated behavior. Turn off Sandbox in Settings to test live models.
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        <div className="glass-card" data-tour="dash-overall">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>OVERALL SECURITY</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 800, color: overallSecurityScore === null ? 'var(--text-muted)' : overallSecurityScore > 70 ? 'var(--color-secure)' : 'var(--color-vulnerable)' }}>
              {overallSecurityScore === null ? '—' : `${overallSecurityScore}%`}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Resilience</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Shield size={12} color="var(--color-primary)" /> {modelsTestedCount} model(s) tested
          </div>
          <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.05)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${overallSecurityScore === null ? 0 : overallSecurityScore}%`, 
              background: overallSecurityScore === null ? 'rgba(255,255,255,0.12)' : overallSecurityScore > 70 ? 'var(--color-secure)' : 'var(--color-vulnerable)', 
              height: '100%' 
            }} />
          </div>
        </div>

        <div className="glass-card">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL AUDITS RUN</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{totalAuditsCount}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Audits</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <History size={12} /> {totalTestsRunCount} test evaluation(s) in history
          </div>
        </div>

        <div className="glass-card">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>VULNERABLE MODELS</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 800, color: vulnerableModelsCount > 0 ? 'var(--color-vulnerable)' : 'var(--color-secure)' }}>{vulnerableModelsCount}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Models</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={12} color="var(--color-vulnerable)" /> Models with at least 1 failed test
          </div>
        </div>

        <div className="glass-card">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>MODELS TESTED</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{modelsTestedCount}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Models</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} color="var(--color-secure)" /> Distinct model/provider evaluated
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="glass-card" data-tour="resilience-by-model" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Resilience Score by Model</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Per-model resilience split by MITRE ATLAS tactic. Click a column header to sort. Download a full printable report (PDF) for any model.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {allModelKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <Info size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ fontSize: '0.85rem' }}>No audits run yet. Open the Auditor Runner and run a comparison audit to populate stats.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th onClick={() => clickDashSort('model')} style={{ padding: '10px 8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      Model{dashSortIndicator('model')}
                    </th>
                    <th onClick={() => clickDashSort('provider')} style={{ padding: '10px 8px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      Provider{dashSortIndicator('provider')}
                    </th>
                    {dashTacticColumns.map(tname => {
                      const id = tacticIdByName[tname] || '';
                      const fullId = id ? (id.startsWith('AML.') ? id : `AML.${id}`) : '';
                      return (
                        <th key={tname} onClick={() => clickDashSort(`tactic:${tname}`)} style={{ padding: '10px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.7rem', color: 'var(--color-primary)', lineHeight: 1.2 }}>{tname}</div>
                          <div style={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}>{fullId}</div>
                          {dashSortKey === `tactic:${tname}` && <span style={{ color: 'var(--text-muted)' }}>{dashSortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
                        </th>
                      );
                    })}
                    <th onClick={() => clickDashSort('overall')} style={{ padding: '10px 8px', cursor: 'pointer', userSelect: 'none', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      Resilience{dashSortIndicator('overall')}
                    </th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedModelKeys.map(mk => (
                    <tr key={mk} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{modelNameFor(mk)}</td>
                      <td style={{ padding: '10px 8px', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        {modelProviderFor(mk)}
                        {isSandboxModel(mk) && (
                          <span className="badge badge-warning" style={{ marginLeft: '6px', fontSize: '0.58rem' }} title="This model was evaluated in Sandbox mode — responses were simulated.">SANDBOX</span>
                        )}
                      </td>
                      {dashTacticColumns.map(tname => {
                        const score = tacticScoreFor(mk, tname);
                        return (
                          <td key={tname} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {score === null ? (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            ) : (
                              <span style={{ color: score > 70 ? 'var(--color-secure)' : score > 40 ? 'var(--color-warning)' : 'var(--color-vulnerable)' }}>
                                {score}%
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, whiteSpace: 'nowrap' }}>
                        {(() => { const s = overallScoreFor(mk); return s === null ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <span style={{ color: s > 70 ? 'var(--color-secure)' : s > 40 ? 'var(--color-warning)' : 'var(--color-vulnerable)' }}>{s}%</span>
                        ); })()}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => printModelReport(mk)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary icon-btn" data-tip="Report" style={{ padding: '6px' }}>
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card" data-tour="audit-history">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Audit Logs History</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Historical log of comparison audits conducted on active models.
            </p>
          </div>
          {history.length > 0 && (
            <button onClick={clearHistory} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary" style={{ fontSize: '0.72rem', padding: '5px 10px', color: 'var(--color-vulnerable)' }}>
              Clear History
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            No historical scans available.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 8px' }}>Date</th>
                  <th style={{ padding: '12px 8px' }}>Target Model</th>
                  <th style={{ padding: '12px 8px' }}>Provider</th>
                  <th style={{ padding: '12px 8px' }}>Tests</th>
                  <th style={{ padding: '12px 8px' }}>Failures</th>
                  <th style={{ padding: '12px 8px' }}>Evaluation</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => {
                   // Recompute from the details so manual overrides are reflected.
                   const det = (record.details || []).map(effectiveDetails);
                   const {
                     secure: recSecure,
                     vulnerable: recVuln,
                     technical: recErr,
                     valid: validTests,
                     resilience: score,
                   } = summarizeVerdicts(det);
                   void recSecure;
                   void validTests;
                   const modelList = record.targets?.map(t => modelTargetLabel(t.provider, t.model));
                  return (
                    <tr key={record.id} data-testid="history-row" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>
                        {new Date(record.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                        {modelList?.length > 0 ? (
                          <span>
                            {modelList.length} models
                            <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                              {modelList.join(' · ')}
                            </span>
                          </span>
                        ) : (
                          record.model
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                          {modelList?.length > 0 ? 'Multi' : providerLabel(record.provider)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{det.length}</td>
                      <td style={{ padding: '12px 8px', color: recVuln > 0 ? 'var(--color-vulnerable)' : 'var(--color-secure)', fontWeight: 700 }}>
                        {recVuln} failed
                        {recErr > 0 && (
                          <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-warning)', fontWeight: 500 }}>
                            {recErr} errors/empty/inconclusive (excluded from score)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {record.isDemo ? (
                          <span className="badge badge-warning" title="This audit ran in Sandbox mode — model responses were simulated, not real API calls.">Sandbox</span>
                        ) : (
                          <span className="badge badge-secure">Live API</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {score === null ? (
                          <span className="badge badge-secondary" title="No valid (secure or vulnerable) verdicts in this run — only technical errors/empties.">—</span>
                        ) : (
                          <span className={`badge ${score > 70 ? 'badge-secure' : score > 40 ? 'badge-warning' : 'badge-vulnerable'}`}>
                            {score}% Resilience
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => { setExpandedDetailIds(new Set()); setSelectedAudit(record); }}
                          disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                          className="btn-secondary icon-btn"
                          data-tip="View"
                          style={{ padding: '6px' }}
                        >
                          <Eye size={14} />
                        </button>
<button
                          onClick={() => printRunReport((record.details || []).map(effectiveDetails), {
                            title: 'GroundRumble Security Audit Report',
                            subtitle: `${record.isDemo ? 'Simulation' : 'Live API'} Audit — ${new Date(record.timestamp).toLocaleString()}`,
                            meta: [`Targets: ${modelList?.length > 0 ? modelList.join(' · ') : (record.model || '—')}`]
                          })}
                          disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                          className="btn-secondary icon-btn"
                          data-tip="Report"
                          style={{ padding: '6px', marginLeft: '6px' }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteAudit(record.id)}
                          disabled={vaultLocked && (vaultPassphraseSet ?? false)}
                          className="btn-secondary icon-btn"
                          data-tip="Delete"
                          style={{ padding: '6px', marginLeft: '6px', color: 'var(--color-vulnerable)' }}
                        >
                          <Trash2 size={14} />
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
    </div>
  );
}

export default DashboardView;
