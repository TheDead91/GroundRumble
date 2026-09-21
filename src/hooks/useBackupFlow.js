// useBackupFlow owns the backup export/import orchestration: export composition
// + download, the encrypted-passphrase import modal state machine, and the
// shared restore-then-reload path (override re-guard, summary warnings,
// sources-section handling). It composes the primitives in src/utils/backup.js
// and the vault helpers, and gets dialogs/toasts through the UI context. The
// rich confirm document renders <div> markup, so it stays in App.jsx behind
// the buildConfirmNode callback handed in below.
import { useState } from 'react';
import { useUI } from '../context/useUI';
import { buildBackup, encryptBackup, parseBackup, openBackup, applyBackup, filterRestoredOverrides } from '../utils/backup';
import { buildRestoreCandidate } from '../utils/backup-candidate.js';
import { vaultSupported, loadVault, saveVault, loadAuditHistory, saveAuditHistory, clearAuditHistory, loadSourceUrls, saveSourceUrls } from '../utils/vault';
import { validateProviders } from '../utils/provider-record.js';
import { redactAuditRecord, summarizeAuditRecord } from '../utils/audit-record';
import { resultOverrideKey } from '../utils/audit-result-key';
import { redactSensitiveText } from '../utils/redact';
import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../utils/provider-endpoint-policy';
import { buildBackupImportPreview } from '../utils/backup-import-preview.js';
import { getPromptOverrides } from '../utils/prompts.js';

export function useBackupFlow({
  providers,
  aiGenUrls,
  vaultPassphraseSet,
  vaultLocked,
  historyRef,
  buildConfirmNode
}) {
  const { addToast, askConfirm, finishOnboarding, onboardingOpen } = useUI();

  // Backup passphrase (encrypts / decrypts exported settings)
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupValidationError, setBackupValidationError] = useState('');

  const setBackupPassphraseAndClearError = (value) => {
    setBackupPassphrase(value);
    setBackupValidationError('');
  };

  // Export a full backup of settings + data as a downloadable JSON file.
  // Backups are encrypted-only: a passphrase is always required, so API keys,
  // secret-bearing headers/bodyTemplates, audit history, and research excerpts
  // can never leave the browser in a plaintext file.
  const handleExportBackup = async () => {
    setBackupValidationError('');
    try {
      if (vaultSupported() && (vaultPassphraseSet ?? false) && vaultLocked) {
        throw new Error('Unlock the Key Vault before exporting a backup.');
      }
      if (!backupPassphrase || backupPassphrase.length < 12) {
        const error = 'Set a backup passphrase of at least 12 characters. GroundRumble backups are encrypted-only.';
        setBackupValidationError(error);
        throw new Error(error);
      }
      const detailedHistory = vaultSupported() && (vaultPassphraseSet ?? false) && !vaultLocked ? await loadAuditHistory() : null;
      const bundle = buildBackup({
        atlas_providers: JSON.stringify(providers),
        atlas_ai_gen_urls: JSON.stringify(aiGenUrls),
        ...(Array.isArray(detailedHistory) ? { atlas_audit_history: JSON.stringify(detailedHistory) } : {})
      });
      const exportData = await encryptBackup(bundle, backupPassphrase);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `groundrumble-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBackupPassphrase('');
    } catch (err) {
      addToast(`Export failed: ${redactSensitiveText(err.message)}`);
    }
  };

  // Import a backup file. Backups are encrypted-only, so every import goes
  // through the passphrase entry modal; there is no plaintext import path.
  const handleImportBackup = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      // Encrypted backups need the export passphrase, which the current screen
      // (e.g. onboarding) may have no field for. Hand off to the dedicated
      // import modal — it decrypts, retries on a wrong passphrase, and then
      // completes the import itself.
      openEncryptedBackupImport(parsed);
    } catch (err) {
      addToast(`Import failed: ${redactSensitiveText(err.message)}`);
    }
  };

  // Encrypted-backup import modal: a dedicated passphrase field with an inline
  // error so a wrong passphrase can be retried without re-selecting the file.
  // null = closed; otherwise { parsed, passphrase, show, error, busy }.
  const [backupImportModal, setBackupImportModal] = useState(null);
  const openEncryptedBackupImport = (parsed) => setBackupImportModal({ parsed, passphrase: '', show: false, error: '', busy: false });
  const closeBackupImportModal = () => setBackupImportModal(null);
  const submitBackupImportPassphrase = async () => {
    const modal = backupImportModal;
    if (!modal || modal.busy) return;
    const passphrase = modal.passphrase;
    if (!passphrase.trim()) {
      setBackupImportModal({ ...modal, error: 'Enter the passphrase that was used to export this backup.' });
      return;
    }
    setBackupImportModal({ ...modal, busy: true, error: '' });
    let bundle;
    try {
      bundle = await openBackup(modal.parsed, passphrase);
    } catch (err) {
      // A restore-validation error (from the section guards) is a real,
      // actionable reason the decrypted payload cannot be restored — surface it
      // inline instead of mislabeling it as a wrong passphrase. Decrypt failures
      // intentionally stay indistinguishable and reuse the generic message.
      const error = err?.name === 'RestoreValidationError'
        ? redactSensitiveText(err?.message || 'The backup is invalid and cannot be restored.')
        : 'Incorrect passphrase or corrupted backup.';
      setBackupImportModal({ ...modal, passphrase: '', error, busy: false });
      return;
    }
    setBackupImportModal(null);
    await performBackupImport(bundle);
  };

  // Shared restore path for both plain and passphrase-encrypted imports:
  // validate vault/history, confirm the summary, write secrets into the secure
  // vault, restore the remaining sections into localStorage, then reload.
  // Build the immutable candidate, review the exact changes, persist that
  // exact candidate.
  const performBackupImport = async (backup) => {
    let previousVault = null;
    let vaultChanged = false;
    let previousDetailedHistory = null;
    let historyChanged = false;
    let previousSources = null;
    let sourcesChanged = false;
    let candidate = null;
    try {
      if (vaultSupported() && (vaultPassphraseSet ?? false) && vaultLocked) {
        throw new Error('Unlock the Key Vault before importing a backup so its encrypted state can be replaced safely.');
      }
      if (vaultSupported()) {
        previousVault = await loadVault();
        if (previousVault.locked) {
          throw new Error('Unlock the Key Vault before importing a backup so its encrypted state can be replaced safely.');
        }
        previousDetailedHistory = await loadAuditHistory();
        previousSources = await loadSourceUrls();
      }
      // Parse the imported audit history up front so the override guard can run
      // before the user confirms: overrides targeting technical or
      // inconclusive results, or orphaned audit ids, are dropped before write.
      // `openBackup` already normalized `atlas_audit_history` to a JSON array,
      // so this parse is total and the result is always an array.
      let importedHistory = [];
      const importedHistoryRaw = backup.data?.atlas_audit_history;
      if (importedHistoryRaw) {
        importedHistory = JSON.parse(importedHistoryRaw).map(redactAuditRecord);
      }

      // Re-apply the setResultOverride guard at the section level: build the set
      // of result keys the app already knows (imported + existing history) and
      // their current statuses, then drop any override that would promote a
      // technical result into a scored verdict or reference a result that does
      // not exist.
      const knownResults = new Map();
      const collectResultStatuses = (records) => {
        for (const record of Array.isArray(records) ? records : []) {
          for (const detail of Array.isArray(record.details) ? record.details : []) {
            if (detail && detail.status) knownResults.set(resultOverrideKey(detail), detail.status);
          }
        }
      };
      collectResultStatuses(importedHistory);
      collectResultStatuses(historyRef.current);

      const overridesRaw = backup.data?.atlas_result_overrides;
      let restoredOverrides = null;
      let overridesDropped = 0;
      if (overridesRaw != null) {
        let overridesObj = {};
        try { overridesObj = JSON.parse(overridesRaw); } catch { overridesObj = {}; }
        const filtered = filterRestoredOverrides(overridesObj, knownResults);
        restoredOverrides = filtered.kept;
        overridesDropped = filtered.dropped;
      }

      // Build the immutable candidate with exact prompt and test-criteria diffs
      const currentPromptOverrides = getPromptOverrides();
      candidate = buildRestoreCandidate(backup, currentPromptOverrides);

      const { summary, sourceUrls, promptOverrides } = buildBackupImportPreview(backup, overridesDropped, candidate);
      const importMessage = buildConfirmNode({ summary, sourceUrls, promptOverrides, candidate });
      if (!(await askConfirm(importMessage))) return;
      // Secrets must be validated and persisted before any non-secret state is
      // written. This prevents a failed vault write from leaving plaintext keys
      // in localStorage.
      if (vaultSupported()) {
        const providersRaw = backup.data?.['atlas_providers'];
        let importedProviders = [];
        try {
          if (providersRaw) importedProviders = JSON.parse(providersRaw);
        } catch {
          throw new Error('The backup contains malformed provider credentials.');
        }
        importedProviders = validateProviders(importedProviders);
        await saveVault({
          // Imported providers arrive disabled so a crafted backup can't re-arm
          // them silently. The private/loopback bypass is preserved ONLY when the
          // provider's own endpoints genuinely need it (e.g. a local Ollama) —
          // on a public endpoint the flag is meaningless, so a crafted backup
          // can't use it to smuggle approval, and the user still reviews the
          // provider before enabling it.
          providers: importedProviders.map(p => ({
            ...p,
            enabled: false,
            allowPrivate: p.allowPrivate === true && providerNeedsPrivateBypass(p),
            allowInsecureTransport: p.allowInsecureTransport === true && providerNeedsInsecureTransport(p)
          }))
        });
        vaultChanged = true;
      }
      // Sources live in the vault (not localStorage); persist the
      // normalized source list here (encrypted when a passphrase is set).
      if (vaultSupported()) {
        const sourcesRaw = backup.data?.['atlas_ai_gen_urls'];
        let importedSources = [];
        if (sourcesRaw != null) {
          try { importedSources = JSON.parse(sourcesRaw); } catch { importedSources = []; }
        }
        await saveSourceUrls(Array.isArray(importedSources) ? importedSources : []);
        sourcesChanged = true;
      }
      if (vaultSupported()) {
        if ((vaultPassphraseSet ?? false) && !vaultLocked && importedHistory.length > 0) await saveAuditHistory(importedHistory);
        else await clearAuditHistory();
        historyChanged = true;
      }
      
      // Only drop the sources section from the written bundle when the
      // vault write succeeded. On a vault-unsupported browser (no IndexedDB/Web
      // Crypto), keep the section so applyBackup restores it to localStorage —
      // sources are not credentials, so a plaintext fallback there is acceptable
      // and keeps sources usable without a vault.
      
      // Build the final backup to apply from the immutable candidate, incorporating
      // the override modifications that were computed after candidate creation
      const finalBackup = {
        ...candidate.normalizedBackup,
        data: { ...candidate.normalizedBackup.data }
      };
      
      if (sourcesChanged) delete finalBackup.data.atlas_ai_gen_urls;
      if (importedHistoryRaw) finalBackup.data.atlas_audit_history = JSON.stringify(importedHistory.map(summarizeAuditRecord));
      // Write only the overrides that survived the restore-time guard;
      // a backup with no override section leaves the existing overrides cleared
      // via applyBackup's replace mode.
      if (overridesRaw != null) finalBackup.data.atlas_result_overrides = JSON.stringify(restoredOverrides);
      
      // The reviewed candidate's normalized data is the authoritative source
      const restored = applyBackup(finalBackup, { replace: true });
      localStorage.removeItem('atlas_providers');
      const count = restored.length;
      setBackupPassphrase('');
      // Restoring from the onboarding screen means the user already knows their
      // way around — skip the wizard so the reload lands in the app.
      if (onboardingOpen) finishOnboarding();
      addToast(`Restored ${count} saved section${count === 1 ? '' : 's'} from the backup. Reloading the app…`);
      window.location.reload();
    } catch (err) {
      if (vaultChanged && previousVault && !previousVault.locked) {
        try {
          await saveVault({ providers: previousVault.providers });
        } catch (rollbackError) {
          console.error('Backup import vault rollback failed:', rollbackError);
        }
      }
      if (historyChanged) {
        try {
          if (Array.isArray(previousDetailedHistory) && previousDetailedHistory.length > 0) await saveAuditHistory(previousDetailedHistory);
          else await clearAuditHistory();
        } catch (rollbackError) {
          console.error('Backup import history rollback failed:', rollbackError);
        }
      }
      if (sourcesChanged) {
        try {
          await saveSourceUrls(Array.isArray(previousSources) ? previousSources : []);
        } catch (rollbackError) {
          console.error('Backup import sources rollback failed:', rollbackError);
        }
      }
      addToast(`Import failed: ${redactSensitiveText(err.message)}`);
    }
  };

  return {
    handleExportBackup,
    handleImportBackup,
    backupPassphrase,
    backupValidationError,
    setBackupPassphrase: setBackupPassphraseAndClearError,
    backupImportModal,
    setBackupImportModal,
    closeBackupImportModal,
    submitBackupImportPassphrase
  };
}
