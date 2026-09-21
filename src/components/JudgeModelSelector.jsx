import React from 'react';

// The AI Judge provider/model selector, styled like the Generator model
// selector. Props-in/events-out: the judge config, its resolved provider and
// model list and the disabled/running gate all arrive as props from the
// render site and every edit flows out through the saveJudgeConfig callback
// — no context reach, no local state.
export function JudgeModelSelector({ judgeConfig, selectedJudgeProvider, judgeModelList, saveJudgeConfig, providers, helperProviderSelectable, disabled = false, running = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start', opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>Judge Provider</label>
        <select
          value={judgeConfig.provider}
          onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}
          className="form-input"
          style={{ width: '100%' }}
          disabled={disabled || running}
        >
          {!helperProviderSelectable(judgeConfig.provider) && (
            <option value={judgeConfig.provider} disabled>No provider configured — add one in Settings → Providers</option>
          )}
          {providers.filter(cp => cp.enabled !== false).map(cp => (
            <option key={cp.id} value={cp.id}>{cp.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="form-label" style={{ fontSize: '0.72rem' }}>Judge Model</label>
        {selectedJudgeProvider ? (
          selectedJudgeProvider.models.length > 0 ? (
            <select
              value={judgeConfig.model}
              onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}
              className="form-input"
              style={{ width: '100%' }}
              disabled={disabled || running}
            >
              {selectedJudgeProvider.models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={judgeConfig.model}
              onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}
              placeholder="e.g. gpt-4o"
              className="form-input"
              style={{ width: '100%' }}
              disabled={disabled || running}
            />
          )
        ) : (
          <select
            value={judgeConfig.model}
            onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}
            className="form-input"
            style={{ width: '100%' }}
            disabled={disabled || running}
          >
            {judgeConfig.model && !judgeModelList.includes(judgeConfig.model) && (
              <option value={judgeConfig.model}>{judgeConfig.model}</option>
            )}
            {judgeModelList.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
