import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';

/**
 * SettingsCardHeader - the shared settings-card header. Consumes the collapse
 * state from SettingsContext itself and renders identically for every card.
 */
export function SettingsCardHeader({ settingKey, icon, title, extra = null }) {
  const { collapsedSettings, toggleSettingsCard } = useSettings();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSettingsCard(settingKey)}>
      {icon}
      <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{title}</h3>
      {extra}
      <button
        className="btn-secondary"
        style={{ marginLeft: 'auto', padding: '5px', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); toggleSettingsCard(settingKey); }}
        title={collapsedSettings[settingKey] ? 'Expand card' : 'Collapse card'}
        aria-expanded={!collapsedSettings[settingKey]}
      >
        {collapsedSettings[settingKey] ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
    </div>
  );
}

export default SettingsCardHeader;
