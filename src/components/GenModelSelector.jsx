import React from 'react';

// The reusable generator model selector (provider + model). Bound to the same
// persisted genConfig that the Settings "Test Generator Model" card uses, so
// Settings sets the default and it can be changed right before a run.
// Props-in/events-out: every config value, provider list and resolved model
// list arrives as a prop from the render site and every edit flows out
// through the saveGenConfig callback — no context reach, no local state.
export function GenModelSelector({ effectiveGenConfig, selectedGenProvider, genModelList, saveGenConfig, providers, helperProviderSelectable }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' }}>
      <div>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>Generator Provider</label>
        <select
          value={effectiveGenConfig.provider}
          onChange={(e) => saveGenConfig({ provider: e.target.value, model: '' })}
          className="form-input"
          style={{ width: '100%' }}
        >
          {!helperProviderSelectable(effectiveGenConfig.provider) && (
            <option value={effectiveGenConfig.provider} disabled>No provider configured — add one in Settings → Providers</option>
          )}
          {providers.filter(cp => cp.enabled !== false).map(cp => (
            <option key={cp.id} value={cp.id}>{cp.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>Generator Model</label>
        {selectedGenProvider ? (
          selectedGenProvider.models.length > 0 ? (
            <select
              value={effectiveGenConfig.model}
              onChange={(e) => saveGenConfig({ ...effectiveGenConfig, model: e.target.value })}
              className="form-input"
              style={{ width: '100%' }}
            >
              {selectedGenProvider.models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={effectiveGenConfig.model}
              onChange={(e) => saveGenConfig({ ...effectiveGenConfig, model: e.target.value })}
              placeholder="e.g. gpt-4o"
              className="form-input"
              style={{ width: '100%' }}
            />
          )
        ) : (
          <select
            value={effectiveGenConfig.model}
            onChange={(e) => saveGenConfig({ ...effectiveGenConfig, model: e.target.value })}
            className="form-input"
            style={{ width: '100%' }}
          >
            {effectiveGenConfig.model && !genModelList.includes(effectiveGenConfig.model) && (
              <option value={effectiveGenConfig.model}>{effectiveGenConfig.model}</option>
            )}
            {genModelList.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
