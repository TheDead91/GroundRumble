import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * StatusBanners — the "Needs attention" warnings shell and the vault-locked
 * banner. Props-in/events-out: warnings comes from the pure
 * buildSettingsWarnings util (src/utils/settings-warnings.js) and vaultLocked
 * from ProvidersContext via the view; no context reaches into this component.
 */
export function StatusBanners({ warnings, vaultLocked }) {
  return (
    <>
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-warning)' }}>
            <AlertTriangle size={16} /> Needs attention
          </div>
          {warnings.map((w, i) => (
            <span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{w}</span>
          ))}
        </div>
      )}

      {vaultLocked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.35)', borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={16} color="var(--color-secondary)" />
          <span>
            Your API keys are <b>locked</b> (encrypted vault). Unlock them in the <b>Key Vault</b> card below to use
            real providers; until then the app runs in sandbox mode.
          </span>
        </div>
      )}
    </>
  );
}

export default StatusBanners;
