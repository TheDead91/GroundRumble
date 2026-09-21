import React from 'react';
import { AlertTriangle, Database, Download, Lock, RefreshCw, Trash2, Upload, UserCog } from 'lucide-react';
import { SettingsCardHeader } from './SettingsCardHeader';
import { vaultSupported } from '../../../utils/vault';

export function AccountDataCard({
  vaultLoading,
  vaultLocked,
  vaultPassphraseSet,
  vaultInput,
  vaultValidationError,
  setVaultInput,
  handleUnlockVault,
  handleLockVault,
  handleUnprotectVault,
  handleProtectVault,
  backupPassphrase,
  backupValidationError,
  setBackupPassphrase,
  handleExportBackup,
  handleImportBackup,
  resetAllData,
  collapsedSettings
}) {
  return (
            <div className="glass-card" data-tour="account-data" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['account-data'] ? '0' : '16px' }}>
              <SettingsCardHeader settingKey="account-data" icon={<UserCog size={18} color="var(--color-secondary)" />} title={'Account & Data'} />
              {!collapsedSettings['account-data'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div data-tour="key-vault" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Lock size={18} color="var(--color-secondary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Key Vault</h3>
                {(!vaultSupported() || (vaultPassphraseSet ?? false) || vaultLocked) && (
                  <span className="badge badge-primary" style={{ fontSize: '0.6rem', marginLeft: '8px' }}>
                    {!vaultSupported() ? 'UNSUPPORTED' : (vaultPassphraseSet ?? false) ? 'ENCRYPTED' : 'LOCKED'}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                API keys are stored in your browser's <b>IndexedDB vault</b>, not in plain localStorage. Optionally protect
                them with a <b>passphrase</b> — this passphrase is the key to the vault. You set it here, then you're asked
                for it <b>once at the start of each session</b> (a small unlock prompt), and the plaintext keys only live
                in memory while you work.
              </p>

              {vaultLoading && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <RefreshCw size={13} className="animate-spin-custom" /> Loading vault…
                </span>
              )}

              {!vaultSupported() ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)' }}>
                  This browser doesn't expose Web Crypto/IndexedDB in a secure context, so the Key Vault cannot persist
                  secrets here. Load GroundRumble over HTTPS (or localhost) to enable encrypted key storage.
                </span>
) : vaultLocked ? (
                <form onSubmit={(e) => { e.preventDefault(); handleUnlockVault(vaultInput); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label className="form-label">Vault passphrase</label>
                  <input
                    data-testid="vault-passphrase-input"
                    type="password"
                    value={vaultInput}
                    onChange={(e) => setVaultInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUnlockVault(vaultInput); }}
                    placeholder="Enter your vault passphrase"
                    className="form-input"
                    autoComplete="off"
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                      <button data-testid="vault-unlock" type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
                      <Lock size={14} /> Unlock
                    </button>
                  </div>
                </form>
              ) : (vaultPassphraseSet ?? false) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secure, #4ade80)' }}>
                    Your keys are encrypted at rest and unlocked for this session.
                  </span>
                  <form onSubmit={(e) => { e.preventDefault(); handleProtectVault(); }} style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor="vault-change-input" className="form-label" style={{ margin: 0 }}>New passphrase:</label>
                      <input
                        id="vault-change-input"
                        type="password"
                        value={vaultInput}
                        onChange={(e) => setVaultInput(e.target.value)}
                        placeholder="Change passphrase"
                        className="form-input"
                        aria-invalid={!!vaultValidationError}
                        aria-describedby={vaultValidationError ? 'vault-change-error' : undefined}
                        style={{ width: '200px', padding: '6px 10px', borderColor: vaultValidationError ? 'var(--color-vulnerable)' : undefined }}
                        autoComplete="off"
                      />
                      <button type="submit" className="btn-secondary" style={{ justifyContent: 'center' }}>
                        Change passphrase
                      </button>
                    </div>
                    {vaultValidationError && (
                      <div id="vault-change-error" role="alert" style={{ fontSize: '0.78rem', color: 'var(--color-vulnerable)' }}>
                        {vaultValidationError}
                      </div>
                    )}
                  </form>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button data-testid="vault-lock" onClick={handleLockVault} className="btn-secondary" style={{ justifyContent: 'center' }}>
                      <Lock size={14} /> Lock now
                    </button>
                    <button onClick={handleUnprotectVault} className="btn-secondary" style={{ justifyContent: 'center', color: 'var(--color-warning)' }}>
                      Remove passphrase
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); handleProtectVault(); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No passphrase set — keys are stored securely in the vault but not encrypted.
                  </span>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label htmlFor="vault-protect-input" className="form-label" style={{ margin: 0 }}>Passphrase:</label>
                    <input
                      id="vault-protect-input"
                      data-testid="vault-protect-input"
                      type="password"
                      value={vaultInput}
                      onChange={(e) => setVaultInput(e.target.value)}
                      placeholder="Set a passphrase to encrypt your keys"
                      className="form-input"
                      aria-invalid={!!vaultValidationError}
                      aria-describedby={vaultValidationError ? 'vault-protect-error' : undefined}
                      style={{ maxWidth: '260px', borderColor: vaultValidationError ? 'var(--color-vulnerable)' : undefined }}
                      autoComplete="off"
                    />
                    <button data-testid="vault-protect" type="submit" className="btn-secondary" style={{ justifyContent: 'center' }}>
                      <Lock size={14} /> Protect with passphrase
                    </button>
                  </div>
                  {vaultValidationError && (
                    <div id="vault-protect-error" role="alert" style={{ fontSize: '0.78rem', color: 'var(--color-vulnerable)' }}>
                      {vaultValidationError}
                    </div>
                  )}
                </form>
              )}
              </div>
<div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              <div data-tour="backup-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Database size={18} color="var(--color-secondary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Backup & Restore</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Export all API keys, providers, the comparison lineup, judge settings, saved tests, and audit history
                as a single JSON file. Backups are <b>always encrypted</b> with AES-256-GCM — a passphrase is required, so
                your API keys and research data never leave the browser in plain text.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <form onSubmit={(e) => { e.preventDefault(); handleExportBackup(); }}>
                  <label className="form-label">Passphrase (required)</label>
                  <input
                    type="password"
                    value={backupPassphrase}
                    onChange={(e) => setBackupPassphrase(e.target.value)}
                    placeholder="Required to encrypt the backup (min 12 characters)"
                    className="form-input"
                    aria-invalid={!!backupValidationError}
                    aria-describedby={backupValidationError ? 'backup-export-error' : undefined}
                    style={{ borderColor: backupValidationError ? 'var(--color-vulnerable)' : undefined }}
                    autoComplete="off"
                  />
                  {backupValidationError && (
                    <div id="backup-export-error" role="alert" style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--color-vulnerable)' }}>
                      {backupValidationError}
                    </div>
                  )}
                </form>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-warning, #f59e0b)', marginBottom: '20px' }}>
                The backup will be encrypted with AES-256-GCM. The passphrase can't be recovered — keep it safe, or the
                backup will be unreadable.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button data-testid="backup-export" onClick={handleExportBackup} className="btn-primary" style={{ justifyContent: 'center', minWidth: '150px' }}>
                  <Download size={14} style={{ marginRight: '6px' }} /> Export Backup
                </button>
                <input
                  type="file"
                  id="backup-file-input"
                  data-testid="backup-import-input"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleImportBackup}
                />
                <label htmlFor="backup-file-input" className="btn-secondary" style={{ justifyContent: 'center', minWidth: '150px', cursor: 'pointer' }}>
                  <Upload size={14} style={{ marginRight: '6px' }} /> Import Backup
                </label>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '10px', display: 'block' }}>
                Import overwrites the current settings and reloads the app. Encrypted backups ask for their passphrase in a
                separate dialog.
              </span>
              </div>
<div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <AlertTriangle size={18} color="var(--color-vulnerable)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Reset Platform</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Deletes ALL data stored in this browser — API keys, providers, AI Judge, test generator, presets,
                custom &amp; AI-generated tests, comparison lineup, audit history, demo settings, and the cached matrix —
                then reloads and shows the first-run wizard again.
              </p>
              <button onClick={resetAllData} className="btn-secondary" style={{ justifyContent: 'center', color: 'var(--color-vulnerable)', borderColor: 'rgba(239,68,68,0.4)', minWidth: '180px' }}>
                <Trash2 size={14} style={{ marginRight: '6px' }} /> Reset everything
              </button>
                </div>
              )}
            </div>
  );
}

export default AccountDataCard;
