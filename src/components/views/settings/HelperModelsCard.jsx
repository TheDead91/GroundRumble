import React from 'react';
import { Cpu, RefreshCw, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { GenModelSelector } from '../../GenModelSelector';
import { SettingsCardHeader } from './SettingsCardHeader';

/**
 * HelperModelsCard - the Helper Models settings card: the AI Judge Model
 * section (provider/model selects with the no-provider option and the
 * custom-model injection, the test button with its busy gate), the section
 * divider and the Test Generator Model section (the shared GenModelSelector
 * mount and its test button). Props-in/events-out over the Settings/Providers
 * deps (no context reaches inside): every value and handler arrives as a prop
 * from the view and every edit flows out through the save/test callbacks.
 */
export function HelperModelsCard({
  judgeConfig,
  saveJudgeConfig,
  providers,
  helperProviderSelectable,
  selectedJudgeProvider,
  judgeModelList,
  effectiveGenConfig,
  selectedGenProvider,
  genModelList,
  saveGenConfig,
  testJudge,
  testGenerator,
  testingJudge,
  testingGen,
  vaultLocked,
  collapsedSettings
}) {
  // A helper model counts as set only when its provider is selectable and it
  // resolves to a model (the configured model, or the provider's first model —
  // the same resolution buildJudge applies elsewhere in the app). Mirrors
  // buildJudge(…)?.model so the "Test model" buttons stay disabled until a
  // helper model actually exists (e.g. fresh install, no provider configured).
  const judgeModelSet = !!helperProviderSelectable(judgeConfig?.provider)
    && !!(judgeConfig?.model || judgeModelList?.[0]);
  const genModelSet = !!helperProviderSelectable(effectiveGenConfig?.provider)
    && !!(effectiveGenConfig?.model || genModelList?.[0]);

  return (
    <div className="glass-card" data-tour="helper-models" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['helper-models'] ? '0' : '16px' }}>
              <SettingsCardHeader settingKey="helper-models" icon={<Cpu size={18} color="var(--color-primary)" />} title={'Helper Models'} />
              {!collapsedSettings['helper-models'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div data-tour="judge-config" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <ShieldCheck size={18} color="var(--color-secondary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>AI Judge Model</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Choose which model acts as the security evaluator. You can pick a different provider than the target models —
                e.g. judge with a low-cost local host to avoid rate limits, or a fast model for large suites. Every option is a
                provider you configured in the Providers card.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label className="form-label">Judge Provider</label>
                  <select
                    value={judgeConfig.provider}
                    onChange={(e) => saveJudgeConfig({ provider: e.target.value, model: '' })}
                    className="form-input"
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
                  <label className="form-label">Judge Model</label>
                  {selectedJudgeProvider ? (
                    selectedJudgeProvider.models.length > 0 ? (
                      <select
                        value={judgeConfig.model}
                        onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}
                        className="form-input"
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
                      />
                    )
                  ) : (
                    <select
                      value={judgeConfig.model}
                      onChange={(e) => saveJudgeConfig({ ...judgeConfig, model: e.target.value })}
                      className="form-input"
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button onClick={testJudge} className="btn-secondary" disabled={testingJudge || vaultLocked || !judgeModelSet} style={{ minWidth: '140px' }}>
                  {testingJudge ? <RefreshCw size={14} className="animate-spin-custom" style={{ marginRight: '6px' }} /> : <Sparkles size={14} style={{ marginRight: '6px' }} />}
                  {testingJudge ? 'Testing…' : 'Test model'}
                </button>
              </div>
              </div>
<div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              <div data-tour="gen-config" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Wand2 size={18} color="var(--color-primary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Test Generator Model</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Choose which model drafts new attack payloads in "AI Test Generation". The quality of the generated tests
                depends heavily on the model you pick — a stronger or more capable model tends to produce more precise and
                effective payloads. Every option is a provider you configured in the Providers card.
              </p>

              <GenModelSelector
                effectiveGenConfig={effectiveGenConfig}
                selectedGenProvider={selectedGenProvider}
                genModelList={genModelList}
                saveGenConfig={saveGenConfig}
                providers={providers}
                helperProviderSelectable={helperProviderSelectable}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '16px' }}>
                <button onClick={testGenerator} className="btn-secondary" disabled={testingGen || vaultLocked || !genModelSet} style={{ minWidth: '140px' }}>
                  {testingGen ? <RefreshCw size={14} className="animate-spin-custom" style={{ marginRight: '6px' }} /> : <Wand2 size={14} style={{ marginRight: '6px' }} />}
                  {testingGen ? 'Testing…' : 'Test model'}
                </button>
              </div>
                </div>
              )}
            </div>
  );
}

export default HelperModelsCard;
