import React from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { SettingsCardHeader } from './SettingsCardHeader';

/**
 * AtlasSyncCard - the MITRE ATLAS Framework Database sync card.
 * Props-in/events-out: the sync action, busy flag, live status line and
 * collapse state arrive as props from the view's own context destructures
 * (no context reaches inside).
 */
export function AtlasSyncCard({ syncLiveATLAS, loadingATLAS, atlasSyncStatus, collapsedSettings }) {
  return (
    <div className="glass-card" data-tour="atlas-sync-settings" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['atlas'] ? '0' : '12px' }}>
      <SettingsCardHeader settingKey="atlas" icon={<Layers size={18} color="var(--color-primary)" />} title={'MITRE ATLAS Framework Database'} />
      {!collapsedSettings['atlas'] && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Sync live with the official MITRE GitHub to download all 80+ techniques and relationships used by the
        ATLAS Matrix and the test suite.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={syncLiveATLAS}
          data-tour="sync-atlas-settings"
          disabled={loadingATLAS}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.8rem' }}
        >
          <RefreshCw size={14} className={loadingATLAS ? 'animate-spin-custom' : ''} style={{ marginRight: '6px' }} />
          {loadingATLAS ? 'Downloading...' : 'Sync Live ATLAS'}
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{atlasSyncStatus}</span>
      </div>
        </div>
      )}
    </div>
  );
}

export default AtlasSyncCard;
