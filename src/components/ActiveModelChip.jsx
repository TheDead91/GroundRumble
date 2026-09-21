import React from 'react';
import { Cpu } from 'lucide-react';

// Compact "active model" chip used next to run/generate controls.
// Props-in: the label text, the active config and the provider formatter —
// a pure display component with no context reach and no local state.
export function ActiveModelChip({ label, cfg, providerLabel }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
      background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', color: 'var(--color-secondary)',
      whiteSpace: 'nowrap'
    }}>
      <Cpu size={12} />
      {label}{cfg && cfg.provider ? ` ${providerLabel(cfg.provider).replace(/ \(\d+ models\)$/, '')}/${cfg.model || 'default'}` : ''}
    </span>
  );
}
