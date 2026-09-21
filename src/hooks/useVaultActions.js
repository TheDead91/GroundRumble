import { useState } from 'react';
import { clearAuditHistory, saveSourceUrls } from '../utils/vault';
import { summarizeAuditRecord } from '../utils/audit-record';
import { redactSensitiveText } from '../utils/redact';

// The Key-Vault session actions — the vaultInput state and the
// protect/unprotect/lock handler trio.
// Cross-domain collaborators arrive as one explicit deps object (no context
// deep-reach inside the hook body); the vault utils, the audit summarizer and
// the secret redactor are imported directly from src/utils, mirroring
// useBackupFlow. The backup-passphrase reset is a callback because App binds
// it from the useBackupFlow() call that sits later in the component body, so
// this hook must not depend on hook-call ordering.
export function useVaultActions({
  providers,
  setProviders,
  setProviderDraft,
  setProviderTest,
  setProviderModelErrors,
  lockVault,
  protectVault,
  unprotectVault,
  invalidateProviderModelFetches,
  vaultLocked,
  vaultLockedRef,
  vaultStateRef,
  setVaultLocked,
  setVaultPassphraseSet,
  setUnlockPromptOpen,
  aiGenUrls,
  setAiGenUrls,
  aiGenAbortRef,
  aiRunCtxRef,
  setHistory,
  historyRef,
  setResults,
  clearConsoleLogs,
  setCurrentTestName,
  auditAbortRef,
  resetBackupPassphrase,
  setActiveTab,
  setExpandedCell,
  setExpandedDetailIds,
  setSelectedAudit,
  addToast,
  askConfirm
}) {
  const [vaultInput, setVaultInput] = useState('');
  const [vaultValidationError, setVaultValidationError] = useState('');
  const [inputLocked, setInputLocked] = useState(vaultLocked);

  // Unlock and replacement-passphrase fields share this state. Reset on the
  // transition before children render so an unlock credential is never shown
  // in the replacement field. Ordinary edits/rerenders keep the current draft.
  if (inputLocked !== vaultLocked) {
    setInputLocked(vaultLocked);
    setVaultInput('');
    setVaultValidationError('');
  }

  const setVaultInputAndClearError = (value) => {
    setVaultInput(value);
    setVaultValidationError('');
  };

  const handleProtectVault = async () => {
    if (!vaultInput || vaultInput.length < 12) {
      const error = 'Use a passphrase of at least 12 characters.';
      setVaultValidationError(error);
      addToast(error);
      return;
    }
    setVaultValidationError('');
    try {
      await protectVault(vaultInput);
      // Re-persist sources so they are encrypted under the new
      // passphrase (protectVault sets the session passphrase first).
      await saveSourceUrls(aiGenUrls);
      setVaultPassphraseSet(true);
      setVaultLocked(false);
      setVaultInput('');
      addToast('API keys are now encrypted at rest. You will be asked to unlock on each new session.');
    } catch (err) {
      setVaultInput('');
      addToast(`Failed to protect keys: ${redactSensitiveText(err.message)}`);
    }
  };

  const handleUnprotectVault = async () => {
    if (!(await askConfirm('Remove the passphrase? Your API keys will be stored in the browser vault WITHOUT encryption.'))) return;
    try {
      await unprotectVault({ providers });
      await clearAuditHistory();
      // Re-persist sources in plaintext now that the passphrase is gone.
      await saveSourceUrls(aiGenUrls);
      const summaryHistory = historyRef.current.map(summarizeAuditRecord);
      setHistory(summaryHistory);
      historyRef.current = summaryHistory;
      setVaultPassphraseSet(false);
      setVaultValidationError('');
      // Remember that the user just removed encryption so the next
      // app start can re-confirm the plaintext-at-rest state once.
      try { localStorage.setItem('atlas_vault_unprotected_reminder', '1'); } catch { /* storage unavailable */ }
      addToast('Passphrase removed. Keys are now stored in plaintext within the vault.');
    } catch (err) {
      addToast(`Failed to remove passphrase: ${redactSensitiveText(err.message)}`);
    }
  };

  const handleLockVault = () => {
    invalidateProviderModelFetches();
    vaultLockedRef.current = true;
    lockVault();
    setProviders([]);
    setAiGenUrls([]);
    // Provider drafts and connection results are transient credential-bearing state.
    setProviderDraft(null);
    setProviderTest({});
    setProviderModelErrors({});
    vaultStateRef.current = { providers: [] };
    setVaultLocked(true);
    setVaultInput('');
    setVaultValidationError('');
    setActiveTab('dashboard');
    resetBackupPassphrase();
    // Drop any open detail panels so locked summaries can't leak stale content.
    setExpandedCell(null);
    setExpandedDetailIds(new Set());
    setSelectedAudit(null);
    const summaryHistory = historyRef.current.map(summarizeAuditRecord);
    setHistory(summaryHistory);
    historyRef.current = summaryHistory;
    setResults([]);
    clearConsoleLogs();
    setCurrentTestName('');
    if (auditAbortRef.current) auditAbortRef.current.abort();
    if (aiGenAbortRef.current) aiGenAbortRef.current.abort();
    aiRunCtxRef.current = null;
    setUnlockPromptOpen(false);
    // Force a full reload so the app boots cleanly into locked/read-only mode
    // and prompts the user to unlock — no stale credential-bearing UI state
    // can linger after the plaintext keys have been dropped from memory.
    window.location.reload();
  };

  return {
    vaultInput,
    setVaultInput: setVaultInputAndClearError,
    vaultValidationError,
    handleProtectVault,
    handleUnprotectVault,
    handleLockVault
  };
}
