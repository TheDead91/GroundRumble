import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { readStoredArray, readStoredObject } from '../utils/storage';
import { redactAuditRecord, summarizeAuditRecord } from '../utils/audit-record';
import { resultOverrideKey } from '../utils/audit-result-key';
import { redactSensitiveText } from '../utils/redact';
import { normalizeResultOverride } from '../utils/backup';
import { vaultSupported, saveAuditHistory, loadAuditHistory, clearAuditHistory as clearVaultAuditHistory } from '../utils/vault';
import { useProviders } from './ProvidersContext';
import { useUI } from './useUI';

const HistoryContext = createContext(null);

// Manual result overrides, keyed by audit id + target + test. Each entity has
// a verdict and an optional human reason. Overrides affect the displayed
// verdicts AND the dashboard/history scoring. Single definition site for the
// key template — consumers import it from here.
// oxlint-disable-next-line react/only-export-components
export { resultOverrideKey };

/**
 * HistoryProvider - Manages audit history and overrides
 */
export function HistoryProvider({ children }) {
  const { vaultLocked, vaultPassphraseSet, restoredAuditHistoryRef } = useProviders();
  const { addToast, askConfirm } = useUI();

  const [history, setHistory] = useState(() => readStoredArray('atlas_audit_history').map(summarizeAuditRecord));
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);

  // When the encrypted vault is unlocked, decrypt the detailed audit history
  // (the lock strips prompting/reasoning from the summarized localStorage copy)
  // into memory, so history reports can render the full reasoning again. On a
  // subsequent lock, App collapses state back to the summary. localStorage
  // itself stays summaries-only either way. On unlock, ProvidersContext has
  // already decrypted the detail (before the unlocked UI became interactive)
  // and stashed it in restoredAuditHistoryRef — this effect adopts it
  // synchronously; every other flag transition falls back to its own
  // loadAuditHistory() round-trip.
  // restoredAuditHistoryRef is a context-injected mutable ref, intentionally
  // read once and reset to null by this effect (see
  // ProvidersContext.handleUnlockVault); listing it would re-trigger the
  // restore on every identity change.
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vaultSupported() || !(vaultPassphraseSet ?? false) || vaultLocked) return;
      const stashed = restoredAuditHistoryRef.current;
      restoredAuditHistoryRef.current = null;
      if (Array.isArray(stashed)) {
        const redactedStash = stashed.map(redactAuditRecord);
        historyRef.current = redactedStash;
        setHistory(redactedStash);
        return;
      }
      const detailed = await loadAuditHistory();
      if (cancelled || !Array.isArray(detailed)) return;
      const redacted = detailed.map(redactAuditRecord);
      historyRef.current = redacted;
      setHistory(redacted);
    })();
    return () => { cancelled = true; };
  }, [vaultLocked, vaultPassphraseSet]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const [overrides, setOverrides] = useState(() => {
    const raw = readStoredObject('atlas_result_overrides', {});
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, normalizeResultOverride(value)]).filter(([, value]) => value !== null));
  });

  const persistAuditHistory = async (next) => {
    try {
      const redacted = next.map(redactAuditRecord);
      localStorage.setItem('atlas_audit_history', JSON.stringify(redacted.map(summarizeAuditRecord)));
      // Await the encrypted detailed write so an audit isn't considered saved
      // until the evidence is durably committed to IndexedDB — otherwise a fast
      // lock/reload right after a run silently drops the detailed history.
      if (vaultSupported() && (vaultPassphraseSet ?? false) && !vaultLocked) {
        await saveAuditHistory(redacted);
      } else if (vaultSupported() && !(vaultPassphraseSet ?? false)) {
        await clearAuditHistory();
      }
      return true;
    } catch (err) {
      if (err?.name === 'QuotaExceededError') {
        addToast('Audit history storage is full. Clear older audits before saving this run.');
      } else {
        addToast(`Could not save audit history: ${redactSensitiveText(err?.message || err)}`);
      }
      return false;
    }
  };

  const appendAuditHistory = async (record) => {
    const updated = [record, ...historyRef.current];
    return replaceAuditHistory(updated);
  };

  const replaceAuditHistory = async (next) => {
    // State must hold the exact same redacted records that persistence writes,
    // so secrets that a provider echoed in an error can never appear in the UI,
    // the detail modal, or the history.
    const redacted = next.map(redactAuditRecord);
    if (!(await persistAuditHistory(redacted))) return false;
    historyRef.current = redacted;
    setHistory(redacted);
    return true;
  };

  // Clears only the vault-side detailed history. The summarized localStorage
  // copy and app state are owned by persist/replace: persist's no-passphrase
  // arm calls this right after writing the summaries, so a local wipe here
  // would erase the visible history on every save in a plaintext-vault session.
  const clearAuditHistory = async () => {
    await clearVaultAuditHistory();
  };

  // Delete an individual audit from history (it no longer counts toward the
  // score). Returns true when the record was deleted, so a caller can close
  // its detail panel afterwards.
  const deleteAudit = async (id) => {
    if (!(await askConfirm('Delete this audit from history? It will no longer count toward the overall score.'))) return false;
    const updated = historyRef.current.filter(h => h.id !== id);
    if (!(await replaceAuditHistory(updated))) return;
    const nextOverrides = Object.fromEntries(Object.entries(overrides).filter(([key]) => !key.startsWith(`${id}-`)));
    try {
      localStorage.setItem('atlas_result_overrides', JSON.stringify(nextOverrides));
      setOverrides(nextOverrides);
    } catch (err) {
      addToast(`Audit deleted, but its override cleanup failed: ${redactSensitiveText(err?.message || err)}`);
    }
    return true;
  };

  // Applies/clears a verdict override and persists it. Returns true when the
  // override took effect, so a caller can run its follow-up (judge feedback).
  const setResultOverride = async (r, status, reason = '') => {
    const key = resultOverrideKey(r);
    // Historical detail callers pass effective results. Eligibility must still
    // be based on the original evidence, including when changing an override.
    const originalStatus = historyRef.current.flatMap(record => record.details || []).find(detail => resultOverrideKey(detail) === key)?.status ?? r.status;
    if (status !== null && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(originalStatus)) {
      addToast('Technical and inconclusive results cannot be converted into scored verdicts.');
      return false;
    }
    const next = { ...overrides };
    if (status === null) delete next[key];
    else {
      const override = normalizeResultOverride({ verdict: status, reason });
      if (!override) { addToast('Invalid verdict override.'); return false; }
      next[key] = override;
    }
    try {
      localStorage.setItem('atlas_result_overrides', JSON.stringify(next));
    } catch (err) {
      addToast(`Could not save the verdict override: ${redactSensitiveText(err?.message || err)}`);
      return false;
    }
    setOverrides(next);
    return true;
  };

  // Manual result overrides live here; these derived helpers are the single
  // definition site for override-aware verdict lookups in the UI (the key
  // template itself is exported above).
  const effectiveStatus = (r) => (r ? (overrides[resultOverrideKey(r)]?.verdict || r.status) : r);
  const effectiveDetails = (d) => {
    const o = overrides[resultOverrideKey(d)];
    return o ? { ...d, status: o.verdict, overrideReason: o.reason } : d;
  };

  const value = {
    history,
    setHistory,
    historyRef,
    persistAuditHistory,
    appendAuditHistory,
    replaceAuditHistory,
    clearAuditHistory,
    deleteAudit,
    overrides,
    setOverrides,
    setResultOverride,
    effectiveStatus,
    effectiveDetails,
  };

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) throw new Error('useHistory must be used within a HistoryProvider');
  return context;
}

export { HistoryContext };
