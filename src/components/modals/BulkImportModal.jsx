import { useState } from 'react';
import { X, Info, Download, AlertTriangle, List, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { parseBulkTests, IMPORT_FORMATS, SAMPLE_TEMPLATES } from '../../utils/testImporter';
import { extractTestCriteria } from '../../utils/backup-candidate';

/**
 * BulkImportModal - bulk test-case import dialog. Props-in/events-out: App owns
 * the importOpen gate and applies the confirmed import via onConfirmImport;
 * this module owns the dialog's transient state (paste text, parse result,
 * selection, error, help toggle, sample key). The gate unmounts the modal, so
 * the fresh-mount initializers below reproduce the reset semantics exactly.
 */
// customTests is part of the four-prop contract; the suite merge is applied
// App-side via onConfirmImport, so this param is never read here.
// oxlint-disable-next-line no-unused-vars
export default function BulkImportModal({ customTests, onConfirmImport, onClose, addToast }) {
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null); // { format, formatLabel, tests, warnings }
  const [importSelected, setImportSelected] = useState(null); // Set of test ids
  const [importError, setImportError] = useState('');
  const [importHelpOpen, setImportHelpOpen] = useState(true);
  const [importSample, setImportSample] = useState('native');
  const [expandedCriteria, setExpandedCriteria] = useState(new Set()); // Set of expanded test ids

  const parseImportText = () => {
    try {
      const res = parseBulkTests(importText);
      setImportResult(res);
      setImportSelected(new Set(res.tests.map(t => t.id)));
      setExpandedCriteria(new Set());
      setImportError('');
    } catch (err) {
      setImportResult(null);
      setImportSelected(null);
      setExpandedCriteria(new Set());
      setImportError(err.message);
    }
  };

  const toggleImportItem = (id) => {
    setImportSelected(prev => {
      const next = new Set(prev || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCriteriaExpansion = (id, event) => {
    event.stopPropagation(); // Prevent label click from toggling checkbox
    setExpandedCriteria(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const insertImportSample = (key) => {
    setImportText(SAMPLE_TEMPLATES[key] || '');
    setImportResult(null);
    setImportSelected(null);
    setExpandedCriteria(new Set());
    setImportError('');
  };

  const confirmImport = () => {
    if (!importResult) return;
    const chosen = importResult.tests.filter(t => importSelected && importSelected.has(t.id));
    if (chosen.length === 0) {
      addToast('Select at least one test to import.');
      return;
    }
    onConfirmImport(chosen);
  };

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
          zIndex: 118,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '880px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Bulk Import Test Cases</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Paste test cases in the native JSON / YAML schema (or CSV). The format is auto-detected.
                </p>
              </div>
              <button onClick={onClose} className="btn-secondary icon-btn" data-tip="Close" style={{ padding: '6px' }}>
                <X size={14} />
              </button>
            </div>

            {/* Supported formats + sample templates */}
            <button
              onClick={() => setImportHelpOpen(v => !v)}
              className="btn-secondary"
              style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '5px 10px', marginBottom: '10px' }}
            >
              <Info size={12} /> {importHelpOpen ? 'Hide supported formats & templates' : 'Supported formats & templates'}
            </button>
            {importHelpOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(59,130,246,0.04)', border: '1px solid var(--border-subtle)', borderRadius: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                  {IMPORT_FORMATS.map(f => (
                    <div key={f.id} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{f.label}</span> — {f.description}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sample:</span>
                  <select
                    value={importSample}
                    onChange={(e) => setImportSample(e.target.value)}
                    className="form-input"
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '0.75rem' }}
                  >
                    {IMPORT_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <button onClick={() => insertImportSample(importSample)} className="btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}>
                    <Download size={12} /> Insert sample
                  </button>
                </div>
              </div>
            )}

            {/* Paste area */}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="form-input"
              spellCheck={false}
              placeholder={'Paste native test-case JSON / YAML (or JSONL / CSV)... e.g. { "name": "...", "tactic": "Execution", "techniqueId": "AML.T0034", "userPrompt": "...", "failKeywords": [...] }'}
              style={{ fontFamily: 'monospace', fontSize: '0.75rem', minHeight: '150px', resize: 'vertical' }}
            />
            {importError && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--color-vulnerable)' }}>
                <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {importError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {importResult ? `Detected format: ${importResult.formatLabel} (${importResult.tests.length} test cases)` : 'Format is detected automatically on parse.'}
              </span>
              <button onClick={parseImportText} className="btn-primary" style={{ fontSize: '0.8rem', padding: '8px 16px' }}>
                <List size={14} /> Parse & Preview
              </button>
            </div>

            {/* Parsed preview */}
            {importResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', flexGrow: 1, minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {importResult.tests.length} test case{importResult.tests.length === 1 ? '' : 's'} parsed
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setImportSelected(new Set(importResult.tests.map(t => t.id)))} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                      Select all
                    </button>
                    <button onClick={() => setImportSelected(new Set())} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '4px 10px' }}>
                      Clear
                    </button>
                  </div>
                </div>
                {importResult.warnings.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-warning)' }}>
                    {importResult.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </div>
                )}
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px' }}>
                  {importResult.tests.map((t, i) => {
                    const checked = importSelected && importSelected.has(t.id);
                    const criteria = extractTestCriteria(t);
                    const hasCriteria = criteria.length > 0;
                    const isExpanded = expandedCriteria.has(t.id);

                    return (
                      <div key={t.id} style={{
                        display: 'flex', flexDirection: 'column', gap: '0px',
                        background: checked ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${checked ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                        borderRadius: '8px'
                      }}>
                        <label style={{
                          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleImportItem(t.id)}
                            style={{ accentColor: 'var(--color-primary)', marginTop: '3px' }}
                          />
                          <div style={{ flexGrow: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.82rem', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {t.name}
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.techniqueId}</span>
                              <span className="badge badge-secondary" style={{ fontSize: '0.55rem', padding: '1px 6px' }}>{t.tactic}</span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.userPrompt}
                            </div>
                            {hasCriteria && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <button
                                  onClick={(e) => toggleCriteriaExpansion(t.id, e)}
                                  className="btn-secondary"
                                  style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}
                                  aria-label={isExpanded ? 'Hide verdict criteria' : 'Show verdict criteria'}
                                >
                                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  {isExpanded ? 'Hide' : 'Show'} criteria
                                </button>
                                {!isExpanded && (
                                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                    {t.failKeywords?.length > 0 && <span style={{ color: 'var(--color-vulnerable)' }}>{t.failKeywords.length} fail kw</span>}
                                    {t.failKeywords?.length > 0 && t.refusalKeywords?.length > 0 && ' · '}
                                    {t.refusalKeywords?.length > 0 && <span style={{ color: 'var(--color-secure)' }}>{t.refusalKeywords.length} refusal kw</span>}
                                    {(t.failKeywords?.length > 0 || t.refusalKeywords?.length > 0) && ' · '}
                                    <span style={{ color: 'var(--color-warning)' }}>Security criteria</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </label>
                        {hasCriteria && isExpanded && (
                          <div style={{
                            padding: '0 10px 10px 48px',
                            fontSize: '0.75rem',
                            borderTop: '1px solid var(--border-subtle)'
                          }}>
                            <div style={{ marginTop: '8px', marginBottom: '4px', fontWeight: 600, color: 'var(--color-warning)', fontSize: '0.72rem' }}>
                              Verdict criteria (used by keyword evaluation):
                            </div>
                            {criteria.map((criterion, cidx) => (
                              <div key={`${t.id}-${criterion.field}-${cidx}`} style={{
                                marginBottom: '6px',
                                padding: '6px 8px',
                                background: 'rgba(0,0,0,0.25)',
                                borderRadius: '4px'
                              }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '3px' }}>
                                  {criterion.field}
                                </div>
                                <div style={{ fontSize: '0.68rem', fontFamily: 'monospace' }}>
                                  {Array.isArray(criterion.value) ? (
                                    <div>
                                      {criterion.value.map((kw, kwidx) => (
                                        <span
                                          key={kwidx}
                                          style={{
                                            display: 'inline-block',
                                            margin: '2px 4px 2px 0',
                                            padding: '2px 6px',
                                            background: criterion.field === 'failKeywords'
                                              ? 'rgba(239,68,68,0.2)'
                                              : 'rgba(34,197,94,0.2)',
                                            borderRadius: '3px',
                                            fontSize: '0.68rem'
                                          }}
                                        >
                                          "{kw}"
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>{criterion.value}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {(importSelected ? importSelected.size : 0)} of {importResult.tests.length} selected
                  </span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={confirmImport} className="btn-primary">
                      <Plus size={15} /> Import Selected ({importSelected ? importSelected.size : 0})
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
