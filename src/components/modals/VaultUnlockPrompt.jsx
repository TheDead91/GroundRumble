import { Lock } from 'lucide-react';

export function VaultUnlockPrompt({ open, vaultInput, setVaultInput, onUnlock, onClose, onResetAll, addToast }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 115, padding: '20px'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Lock size={20} color="var(--color-secondary)" />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Unlock your API keys</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
          Your API keys are stored encrypted in the browser vault (IndexedDB). Enter the passphrase you set in{' '}
          <b>Settings → Key Vault</b> to unlock this session, or continue in <b>read-only mode</b> (Settings
          and the Auditor Runner are disabled, and AI-powered actions are turned off).
        </p>
        <div>
          <form onSubmit={async (e) => { e.preventDefault(); const result = await onUnlock(vaultInput); if (!result.success) addToast(`Unlock failed: ${result.error}`, 'error'); }}>
            <input
              data-testid="vault-passphrase-input"
              type="password"
              value={vaultInput}
              onChange={(e) => setVaultInput(e.target.value)}
              onKeyDown={async (e) => { if (e.key === 'Enter') { const result = await onUnlock(vaultInput); if (!result.success) addToast(`Unlock failed: ${result.error}`, 'error'); } }}
              placeholder="Vault passphrase"
              className="form-input"
              autoFocus
              autoComplete="off"
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" onClick={onClose} className="btn-secondary" style={{ justifyContent: 'center' }}>
                Continue in read-only mode
              </button>
              <button data-testid="vault-unlock" type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
            <Lock size={14} /> Unlock
          </button>
            </div>
          </form>
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Forgot the passphrase? The keys can't be recovered — your only option is to{' '}
            <button onClick={onResetAll} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.7rem', color: 'var(--color-vulnerable)', display: 'inline-flex', marginLeft: '2px' }}>
              Reset the platform
            </button>
            , which deletes everything (including the encrypted keys) and starts fresh.
          </div>
        </div>
      </div>
    </div>
  );
}

export default VaultUnlockPrompt;
