import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { PromptDiffView, TestCriteriaDiffView } from '../backup/RestoreCandidateReview.jsx';

// Encrypted-backup import modal — dedicated passphrase entry with an
// inline error so a wrong passphrase can be retried without re-selecting
// the file. Used from Settings and the onboarding wizard alike. The null gate
// is inside the module and App mounts the component unconditionally over the
// useBackupFlow surface.
export function BackupImportModal({ backupImportModal, setBackupImportModal, closeBackupImportModal, submitBackupImportPassphrase }) {
  if (!backupImportModal) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 139,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Lock size={18} color="var(--color-warning)" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Encrypted backup</h3>
        </div>
        <div style={{ fontSize: '0.85rem', lineHeight: 1.55, color: 'var(--text-muted)', marginBottom: '16px' }}>
          This backup was encrypted with a passphrase when it was exported. Enter that passphrase to unlock it and continue the import.
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type={backupImportModal.show ? 'text' : 'password'}
            value={backupImportModal.passphrase}
            onChange={(e) => setBackupImportModal(m => m ? { ...m, passphrase: e.target.value, error: '' } : m)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitBackupImportPassphrase(); } }}
            placeholder="Backup passphrase"
            className="form-input"
            autoFocus
            data-testid="backup-passphrase-input"
            style={{ flexGrow: 1 }}
          />
          <button
            onClick={() => setBackupImportModal(m => m ? { ...m, show: !m.show } : m)}
            className="btn-secondary"
            style={{ padding: '4px 10px', flexShrink: 0 }}
            title={backupImportModal.show ? 'Hide passphrase' : 'Show passphrase'}
          >
            {backupImportModal.show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {backupImportModal.error && (
          <div data-testid="backup-passphrase-error" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem', color: 'var(--color-vulnerable)', marginBottom: '12px', lineHeight: 1.45 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{backupImportModal.error}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={closeBackupImportModal} className="btn-secondary" disabled={backupImportModal.busy} data-testid="backup-passphrase-cancel">Cancel</button>
          <button onClick={submitBackupImportPassphrase} className="btn-primary" disabled={backupImportModal.busy} data-testid="backup-passphrase-import">
            {backupImportModal.busy ? 'Unlocking…' : 'Unlock & import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// The rich confirm document renders <div> markup, so it is handed into the
// flow hook as a callback. It is a pure component that App binds as the
// hook's confirm-document dep.
// eslint-disable-next-line no-unused-vars
export function BackupConfirmNode({ summary, sourceUrls, promptOverrides, candidate }) {
  return (
    <div style={{ textAlign: 'left', fontSize: '0.85rem', lineHeight: 1.5 }}>
      <div style={{ marginBottom: '12px' }}>Import this backup? It will overwrite the current settings and reload the app.</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{summary}</div>

      {/* Exact prompt diff with before/after values */}
      {candidate && candidate.promptDiff && candidate.promptDiff.changed.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <PromptDiffView promptDiff={candidate.promptDiff} />
        </div>
      )}

      {/* Test verdict criteria diff */}
      {candidate && candidate.testCriteriaDiff && candidate.testCriteriaDiff.tests.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <TestCriteriaDiffView testCriteriaDiff={candidate.testCriteriaDiff} />
        </div>
      )}

      {sourceUrls.length > 0 && (
        <div style={{ marginTop: '10px', maxHeight: '38vh', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '8px' }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>AI source URLs (fetched during generation):</div>
          {sourceUrls.map((s, i) => (
            <div key={s.url || `${s.kind}-${i}`} style={{ marginBottom: '6px', padding: '6px 8px', background: 'rgba(0,0,0,0.18)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, wordBreak: 'break-all' }}>
                {s.kind === 'paste' ? 'Pasted content (no fetch)' : s.url}
              </div>
              {s.kind !== 'paste' && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {s.title ? `${s.title} · ` : ''}{s.enabled ? 'enabled' : 'disabled'}
                  {!s.hasExcerpt && <span style={{ color: 'var(--color-warning)' }}> · will be fetched on the next generation run</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
