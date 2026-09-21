import { useState } from 'react';
import { clearAuditHistory } from '../utils/vault';
import { redactSensitiveText } from '../utils/redact';
import { useUI } from '../context/useUI';

export function useAuditDetail({
  deleteAudit,
  replaceAuditHistory,
  setResultOverride,
  setOverrides,
  effectiveDetails,
  vaultLocked,
  vaultSupported,
  openPrintableReport,
  buildRunReportBody,
  providerLabel,
  askConfirm,
  addToast,
  openMergeWithFeedback,
}) {
  const { setConfirmState } = useUI();
  const [selectedAudit, setSelectedAudit] = useState(null); // historical audit record opened in the detail modal
  const [expandedDetailIds, setExpandedDetailIds] = useState(() => new Set());

  // The dialog owns only a pending choice. HistoryProvider commits the verdict
  // and reason together before the optional, explicitly selected AI flow starts.
  const handleResultOverride = async (r, status) => {
    if (vaultLocked) { addToast('Unlock your API keys to change verdict overrides.'); return; }
    if (status === null) { await setResultOverride(r, null); return; }
    const choice = await new Promise(resolve => setConfirmState({
      type: 'override',
      message: `Override verdict to ${status}`,
      inputValue: effectiveDetails(r).overrideReason || '',
      onSave: reason => setResultOverride(r, status, reason),
      resolve,
    }));
    if (choice?.action === 'improve') await openMergeWithFeedback(r, choice.reason);
  };

  // Deletes via HistoryProvider (confirm + history replace + override cleanup),
  // then closes App's detail panel when the deleted record is open.
  const handleDeleteAudit = async (id) => {
    if (!(await deleteAudit(id))) return;
    if (selectedAudit && selectedAudit.id === id) setSelectedAudit(null);
  };

  const clearHistory = async () => {
    if (await askConfirm('Delete ALL audit history?\n\nThis permanently removes every stored run (prompts, responses, verdicts, overrides) from this browser and recomputes the dashboard from an empty history.')) {
      if (!(await replaceAuditHistory([]))) return;
      clearAuditHistory().catch(err => addToast(`Could not clear detailed audit history: ${redactSensitiveText(err.message)}`));
      setOverrides({});
      try {
        localStorage.setItem('atlas_result_overrides', '{}');
      } catch (err) {
        addToast(`History cleared, but override cleanup failed: ${redactSensitiveText(err?.message || err)}`);
      }
      setSelectedAudit(null);
      addToast('Audit history cleared.');
    }
  };

  const toggleExpandedDetail = (key) => setExpandedDetailIds(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const printRunReport = (results, { title, subtitle, meta } = {}) => {
    if (vaultLocked) {
      addToast('Unlock your API keys to generate reports.');
      return;
    }
    if (!vaultSupported()) {
      addToast('Reports require IndexedDB support (secure context).');
      return;
    }
    if (!results || results.length === 0) {
      addToast('No results to report yet.');
      return;
    }
    openPrintableReport(window, buildRunReportBody({ results: results.map(effectiveDetails), title, subtitle, meta, providerLabel }), { addToast });
  };

  return { selectedAudit, setSelectedAudit, expandedDetailIds, setExpandedDetailIds, toggleExpandedDetail, handleDeleteAudit, handleResultOverride, printRunReport, clearHistory };
}
