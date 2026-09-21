import React, { useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  Edit3,
  Lock,
  Play,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { PROVIDER_PRESETS } from '../../../data/app-config';
import { vaultSupported } from '../../../utils/vault';
import { deriveModelsEndpoint, resolveOpenAIEndpoint } from '../../../utils/api';
import { isInsecureHttpEndpoint } from '../../../utils/endpoint-policy';
import { providerCarriesSecret } from '../../../utils/providerSecret';
import { redactSensitiveText } from '../../../utils/redact';
import { SettingsCardHeader } from './SettingsCardHeader';

/**
 * ProvidersCard - the Providers settings card: the per-provider rows with
 * their enable/refresh/test/edit/delete actions and vault gates, the inline
 * provider draft form, the Add Provider flow and the nested Sandbox
 * Configuration card. Props-in/events-out over the Providers/Settings/UI
 * context deps (no context reaches inside) and the shared SettingsCardHeader
 * component for its header.
 */
export function ProvidersCard({
  providers,
  setProviders,
  persistProviders,
  providerDraft,
  setProviderDraft,
  providerTest,
  setProviderTest,
  providerModelErrors,
  providerRefreshing,
  refreshProviderModels,
  handleProviderTest,
  openProviderDraft,
  deleteProvider,
  saveProviderDraft,
  cpFromDraft,
  confirmInsecureTransport,
  protectVault,
  setVaultPassphraseSet,
  setVaultLocked,
  vaultLocked,
  vaultPassphraseSet,
  addToast,
  askChoice,
  askConfirm,
  askInput,
  useDemoMode,
  setDemoMode,
  collapsedSettings
}) {
  // Wrapper for provider form submission with confirmation when saving without encryption
  const handleSaveProviderWrapper = useCallback(async (e) => {
    e.preventDefault();
    if (!vaultPassphraseSet && providerDraft.apiKey) {
      const choice = await askChoice(
        'Your vault is not encrypted. API keys will be stored in plaintext.\n\n' +
        'Do you want to set up encryption first, or save without encryption?',
        {
          cancelText: 'Cancel',
          secondaryText: 'Save anyway',
          primaryText: 'Set up encryption',
          primaryColor: 'btn-primary'
        }
      );
      if (choice === 'cancel') return;
      if (choice === 'secondary') {
        // User chose "Save anyway" - proceed without encryption
      } else if (choice === 'primary') {
        // User wants to set up encryption first - prompt for passphrase with validation
        let error = '';
        while (true) {
          const passphrase = await askInput(
            'Enter a passphrase to encrypt your vault (min 12 characters):' + (error ? '\n\n' + error : ''),
            '',
            'password'
          );
          if (!passphrase) return; // User cancelled
          if (passphrase.length >= 12) {
            try {
              const protectedSuccessfully = await protectVault(passphrase);
              if (protectedSuccessfully === false) throw new Error('Could not encrypt the Key Vault. Provider was not saved.');
              setVaultPassphraseSet(true);
              setVaultLocked(false);
              addToast('API keys are now encrypted at rest. You will be asked to unlock on each new session.');
              break;
            } catch (err) {
              addToast(`Failed to protect keys: ${err.message}`, 'error');
              return;
            }
          }
          error = 'Passphrase must be at least 12 characters.';
        }
      }
    }
    try {
      await saveProviderDraft(e);
    } catch (err) {
      addToast(`Could not save provider: ${redactSensitiveText(err?.message || err)}`, 'error');
    }
  }, [vaultPassphraseSet, providerDraft, saveProviderDraft, askChoice, protectVault, setVaultPassphraseSet, setVaultLocked, addToast, askInput]);

  const testConnection = async (provider, key) => {
    try {
      await handleProviderTest(provider, key);
    } catch (err) {
      addToast(`Could not test provider: ${redactSensitiveText(err?.message || err)}`, 'error');
    }
  };

  const enableImportedProvider = async (cp) => {
    // Enabling is an authority-granting action: a secret-bearing cleartext
    // provider must be approved first (single shared gate). Decline leaves it
    // disabled and authorized nothing.
    const approved = await confirmInsecureTransport(cp);
    if (!approved) {
      addToast(`"${cp.name}" was not enabled — insecure transport was not approved.`, 'error');
      return;
    }
    const next = providers.map(p => p.id === cp.id ? { ...p, enabled: true } : p);
    setProviders(next);
    persistProviders(next);
    addToast(`"${cp.name}" is now enabled.`);
  };

  // Provider deletion requires explicit confirmation. Cancel (or dialog
  // dismissal) performs no deletion and no persistence mutation; the confirmed
  // deletion persists first and reports success only afterwards.
  const confirmDeleteProvider = async (cp) => {
    const ok = await askConfirm(
      `Delete provider?\n\nThis removes "${cp.name}" from GroundRumble.`,
      { primaryText: 'Delete Provider' },
    );
    if (!ok) return;
    const deleted = await deleteProvider(cp.id);
    if (deleted) addToast(`Provider "${cp.name}" deleted.`, 'success');
    else addToast(`Could not delete provider "${cp.name}": storage unavailable. It is unchanged — retry.`, 'error');
  };
  // Inline provider form: rendered under the edited provider's row (or after
  // the list when adding a new one), so editing never hides the rest of the list.
  const providerForm = providerDraft && (
                <form onSubmit={handleSaveProviderWrapper} style={{
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  // Match the provider row so the form reads as the row expanded.
                  background: 'rgba(59,130,246,0.05)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  // When attached to a row being edited, drop the top border so
                  // the outline is continuous and only the row's divider shows.
                  borderTop: providerDraft && providerDraft.id ? 'none' : '1px solid rgba(59,130,246,0.25)',
                  borderRadius: providerDraft && providerDraft.id ? '0 0 8px 8px' : '8px',
                  marginTop: providerDraft && providerDraft.id ? 0 : '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {providerDraft.id ? 'Edit Provider' : 'New Provider'}
                    </span>
                    <button type="button" onClick={() => setProviderDraft(null)} className="btn-secondary" style={{ padding: '6px' }}>
                      <X size={14} />
                    </button>
                  </div>

                  {!providerDraft.id && (
                    <div>
                      <span className="form-label" style={{ fontSize: '0.72rem' }}>Quick-fill a preset</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {PROVIDER_PRESETS.map(p => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              setProviderDraft(prev => ({
                                ...prev,
                                name: p.name,
                                endpoint: p.endpoint,
                                modelsEndpoint: p.modelsEndpoint,
                                modelsText: p.models.join(', '),
                                connector: 'openai',
                                method: 'POST',
                                responsePath: 'choices.0.message.content'
                              }));
                              setProviderTest(prev => { const n = { ...prev }; delete n.draft; return n; });
                            }}
                            className="btn-secondary"
                            style={{ fontSize: '0.68rem', padding: '4px 10px' }}
                            title={p.note}
                          >
                            <Plug size={11} /> {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="form-label">Provider Name</label>
                      <input
                        type="text"
                        value={providerDraft.name}
                        onChange={(e) => setProviderDraft(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. OpenAI, OpenRouter, DeepSeek"
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">Connector Type</label>
                      <select
                        value={providerDraft.connector}
                        onChange={(e) => setProviderDraft(prev => ({ ...prev, connector: e.target.value }))}
                        className="form-input"
                      >
                        <option value="openai">OpenAI-compatible (auto request format)</option>
                        <option value="raw">Raw custom (manual method / headers / body)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Endpoint URL</label>
                    <input
                      type="text"
                      value={providerDraft.endpoint}
                      onChange={(e) => setProviderDraft(prev => ({ ...prev, endpoint: e.target.value }))}
                      placeholder={providerDraft.connector === 'raw' ? 'https://host.example/api/chat' : 'https://api.openai.com/v1/chat/completions'}
                      className="form-input"
                    />
                    {providerDraft.connector === 'openai' && (() => {
                      const resolved = resolveOpenAIEndpoint(cpFromDraft(providerDraft));
                      return (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                          You can paste the full <code>/v1/chat/completions</code> URL, a base URL (e.g. <code>https://host/v1</code>),
                          or the common singular <code>/v1/chat/completion</code> — the app normalizes it. Will call:{' '}
                          <code>{resolved.chatEndpoint || '(enter an endpoint)'}</code>{' '}
                          {resolved.modelsEndpoint && <>· models: <code>{resolved.modelsEndpoint}</code></>}
                        </span>
                      );
                    })()}
                  </div>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <input data-testid="provider-allow-private" type="checkbox" checked={providerDraft.allowPrivate === true} onChange={e => setProviderDraft(prev => ({ ...prev, allowPrivate: e.target.checked }))} />
                    <span>Allow private/loopback endpoint (required for local providers). Do not use cloud API keys with private endpoints.</span>
                  </label>

                  {(() => {
                    const insecure = isInsecureHttpEndpoint(providerDraft.endpoint) || isInsecureHttpEndpoint(providerDraft.modelsEndpoint);
                    if (!insecure) return null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-vulnerable)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>
                            This endpoint uses plaintext <code>http://</code> to a remote host — your API key and any secret
                            headers would be transmitted unencrypted over the network. Use HTTPS, or approve insecure
                            transport only if you trust the network path.
                          </span>
                        </span>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <input data-testid="provider-allow-insecure-transport" type="checkbox" checked={providerDraft.allowInsecureTransport === true} onChange={e => setProviderDraft(prev => ({ ...prev, allowInsecureTransport: e.target.checked }))} />
                          <span>Allow insecure (HTTP) transport for this provider — I understand credentials will be transmitted unencrypted.</span>
                        </label>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="form-label">API Key</label>
                      <input
                        type="password"
                        autoComplete="off"
                        value={providerDraft.apiKey}
                        onChange={(e) => setProviderDraft(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="Optional (leave blank if none required)"
                        className="form-input"
                      />
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                        Stored in the app's Key Vault, not the browser password manager.
                      </span>
                      {!vaultPassphraseSet && providerDraft.apiKey && (
                        <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: 'var(--color-warning)' }}>
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                              <b>Warning:</b> Your vault is not encrypted. API keys will be stored in plaintext.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="form-label">Rate Limit (requests/min)</label>
                      <input
                        type="number"
                        min="0"
                        value={providerDraft.rpm}
                        onChange={(e) => setProviderDraft(prev => ({ ...prev, rpm: e.target.value }))}
                        placeholder="0 = unlimited"
                        className="form-input"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="form-label">Models (comma-separated)</label>
                      <input
                        type="text"
                        value={providerDraft.modelsText}
                        onChange={(e) => setProviderDraft(prev => ({ ...prev, modelsText: e.target.value }))}
                        placeholder="e.g. gpt-4o, gpt-4o-mini (blank = type any model)"
                        className="form-input"
                      />
                    </div>
                    {providerDraft.connector === 'openai' && (
                      <div>
                        <label className="form-label">Models Endpoint (optional)</label>
                        <input
                          type="text"
                          value={providerDraft.modelsEndpoint}
                          onChange={(e) => setProviderDraft(prev => ({ ...prev, modelsEndpoint: e.target.value }))}
                          placeholder="e.g. https://api.openai.com/v1/models"
                          className="form-input"
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                          Optional override — for OpenAI-compatible endpoints it's derived automatically from the chat
                          completions URL and fetched on selection. A refresh button appears next to the model picker.
                        </span>
                        {(() => {
                          let chatOrigin; let modelsOrigin;
                          try { chatOrigin = new URL(providerDraft.endpoint).origin; } catch {}
                          try { modelsOrigin = new URL(providerDraft.modelsEndpoint).origin; } catch {}
                          return (chatOrigin && modelsOrigin && chatOrigin !== modelsOrigin) ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', marginTop: '6px', display: 'block' }}>
                              Your API key is also sent to this models endpoint ({modelsOrigin}), which differs from the chat
                              endpoint ({chatOrigin}). Only use it if you trust that host.
                            </span>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  {providerDraft.connector === 'raw' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '14px', background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label className="form-label">HTTP Method</label>
                          <select
                            value={providerDraft.method}
                            onChange={(e) => setProviderDraft(prev => ({ ...prev, method: e.target.value }))}
                            className="form-input"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Response Path (JSON)</label>
                          <input
                            type="text"
                            value={providerDraft.responsePath}
                            onChange={(e) => setProviderDraft(prev => ({ ...prev, responsePath: e.target.value }))}
                            placeholder="choices.0.message.content"
                            className="form-input"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Headers (JSON object)</label>
                        <textarea
                          rows="2"
                          value={providerDraft.headers}
                          onChange={(e) => setProviderDraft(prev => ({ ...prev, headers: e.target.value }))}
                          placeholder='{"X-Custom-Header": "value"}'
                          className="form-input"
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                          The API key is attached as <code>Authorization: Bearer &lt;key&gt;</code> automatically unless you define your own Authorization header here.
                        </span>
                      </div>
                      <div>
                        <label className="form-label">Body Template (JSON with placeholders)</label>
                        <textarea
                          rows="5"
                          value={providerDraft.bodyTemplate}
                          onChange={(e) => setProviderDraft(prev => ({ ...prev, bodyTemplate: e.target.value }))}
                          className="form-input"
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                          Available placeholders (values are JSON-escaped automatically):{' '}
                          <code>{'{{model}}'}</code> <code>{'{{systemPrompt}}'}</code> <code>{'{{userPrompt}}'}</code> <code>{'{{maxTokens}}'}</code>
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="form-label">Notes (optional)</label>
                    <input
                      type="text"
                      value={providerDraft.notes}
                      onChange={(e) => setProviderDraft(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Anything worth remembering about this provider"
                      className="form-input"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: '1 1 260px' }}>
                      <button
                        type="button"
                        onClick={() => testConnection(cpFromDraft(providerDraft), 'draft')}
                        disabled={providerTest.draft?.status === 'testing' || !providerDraft.endpoint.trim() || vaultLocked && (vaultPassphraseSet ?? false)}
                        className="btn-secondary"
                        style={{ justifyContent: 'flex-start', width: 'fit-content' }}
                        title="Check reachability, auth and a chat round-trip before saving"
                      >
                        {providerTest.draft?.status === 'testing' ? <><RefreshCw size={14} className="animate-spin-custom" /> Testing…</> : <><Plug size={14} /> Test Connection</>}
                      </button>
                      {providerTest.draft && providerTest.draft.status !== 'testing' && (
                        <span style={{
                          fontSize: '0.72rem', lineHeight: 1.45, wordBreak: 'break-word',
                          color: providerTest.draft.status === 'ok' ? 'var(--color-secure)' : 'var(--color-vulnerable)',
                          display: 'flex', alignItems: 'flex-start', gap: '6px'
                        }}>
                          {providerTest.draft.status === 'ok' ? <Check size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />}
                          {providerTest.draft.message}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                      <button type="button" onClick={() => setProviderDraft(null)} className="btn-secondary">
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary">
                        Save Provider
                      </button>
                    </div>
                  </div>
                </form>
  );

  return (
            <div className="glass-card" data-tour="credentials-panel" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['providers'] ? '0' : '16px' }}>
              <SettingsCardHeader settingKey="providers" icon={<Plug size={18} color="var(--color-primary)" />} title={'Providers'} extra={
                (vaultSupported() && !vaultPassphraseSet && !vaultLocked && providers.some(providerCarriesSecret)) ? (
                  <span data-testid="providers-plaintext-badge" title="API keys are stored unencrypted — set a passphrase in the Key Vault card to encrypt them at rest." style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-warning)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '999px', padding: '2px 8px' }}>
                    <AlertTriangle size={12} /> Unencrypted keys
                  </span>
                ) : null
              } />
              {!collapsedSettings['providers'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Connect the model hosts you want to use — as comparison targets, the AI Judge, or the Test Generator.
                Every provider is a user-defined OpenAI-compatible or custom HTTP endpoint. Use <b>Add Provider</b> and
                pick a preset (Groq, Gemini, Hugging Face, OpenRouter, Ollama) to pre-fill the endpoint, or fill the
                fields manually. Each provider carries its own key (or endpoint) and rate limit, saved on your machine
                and sent directly to the hosts you choose.
              </p>

              {vaultLocked && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.35)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <Lock size={14} color="var(--color-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    Your API keys and providers are <b>locked</b> (encrypted vault) and are not shown here. Unlock them in
                    the <b>Key Vault</b> card below (or the unlock prompt) to view and edit them.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {providers.map(cp => (
                    <div key={cp.id} data-testid={`provider-row-${cp.id}`} style={{ display: 'flex', flexDirection: 'column', gap: providerDraft && providerDraft.id === cp.id ? 0 : '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: providerDraft && providerDraft.id === cp.id ? '8px 8px 0 0' : '8px', gap: '12px' }}>
                      <div style={{ fontSize: '0.8rem', minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>
                          {cp.name}
                          {cp.enabled === false && <span style={{ marginLeft: '8px', color: 'var(--color-warning)', fontSize: '0.65rem' }}>Imported, review before enabling</span>}
                          <span style={{ marginLeft: '8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '1px 6px' }}>
                            {cp.connector === 'raw' ? 'RAW' : 'OpenAI-compatible'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cp.endpoint} · {cp.rpm} req/min · {cp.models?.length || 0} model(s)
                        </div>
                        {(isInsecureHttpEndpoint(cp.endpoint) || isInsecureHttpEndpoint(cp.modelsEndpoint)) && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-vulnerable)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <span>HTTP — credentials sent unencrypted</span>
                          </div>
                        )}
                        {cp.connector !== 'raw' && resolveOpenAIEndpoint(cp).chatEndpoint !== cp.endpoint && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-warning)', marginTop: '2px' }}>
                            Will call <code>{resolveOpenAIEndpoint(cp).chatEndpoint}</code>
                          </div>
                        )}
                        {cp.notes && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{cp.notes}</div>
                        )}
                        {providerModelErrors[cp.id] && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-vulnerable)', marginTop: '2px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>Couldn&apos;t fetch models: {providerModelErrors[cp.id]}</span>
                          </div>
                        )}
                        {providerTest[cp.id] && providerTest[cp.id].status !== 'testing' && (
                          <div style={{
                            fontSize: '0.7rem', marginTop: '2px', wordBreak: 'break-word',
                            color: providerTest[cp.id].status === 'ok' ? 'var(--color-secure)' : 'var(--color-vulnerable)'
                          }}>
                            {providerTest[cp.id].status === 'ok' ? '✓ ' : '✗ '}{providerTest[cp.id].message}
                          </div>
                        )}
                      </div>
                      {!(providerDraft && providerDraft.id === cp.id) && (
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {cp.enabled === false && (
                          <button
                            type="button"
                            onClick={() => enableImportedProvider(cp)}
                            className="btn-primary"
                            data-testid={`provider-enable-${cp.id}`}
                            style={{ padding: '6px', fontSize: '0.7rem' }}
                            title="Enable this provider for use in audits, judging, and generation"
                          >
                            <ShieldCheck size={13} /> Enable
                          </button>
                        )}
                        {cp.connector !== 'raw' && deriveModelsEndpoint(cp) && (
                          <button
                            type="button"
                            onClick={() => refreshProviderModels(cp)}
                            disabled={providerRefreshing[cp.id]}
                            className="btn-secondary icon-btn"
                            data-tip="Refresh models"
                            title="Reload the model list from the provider"
                            style={{ padding: '6px' }}
                          >
                            <RefreshCw size={13} className={providerRefreshing[cp.id] ? 'animate-spin-custom' : ''} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => testConnection(cp, cp.id)}
                          disabled={providerTest[cp.id]?.status === 'testing' || vaultLocked && (vaultPassphraseSet ?? false)}
                          className="btn-secondary"
                          style={{ padding: '6px', fontSize: '0.7rem' }}
                          title="Test connection (reachability, auth, chat round-trip)"
                        >
                          {providerTest[cp.id]?.status === 'testing' ? <RefreshCw size={13} className="animate-spin-custom" /> : <Plug size={13} />}
                        </button>
                        <button type="button" onClick={() => openProviderDraft(cp)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary icon-btn" data-tip="Edit" style={{ padding: '6px' }}>
                          <Edit3 size={14} />
                        </button>
                        <button type="button" onClick={() => confirmDeleteProvider(cp)} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-secondary icon-btn" data-tip="Delete" style={{ padding: '6px', color: 'var(--color-vulnerable)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      )}
                    </div>
                      {providerDraft && providerDraft.id === cp.id && providerForm}
                    </div>
                  ))}
                </div>

              {providerDraft && !providerDraft.id && providerForm}

              {providers.length === 0 && !providerDraft && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                  {vaultLocked ? 'Providers are locked — unlock them in the Key Vault below.' : 'No providers configured yet. Use "Add Provider" to connect one.'}
                </p>
              )}

              {!providerDraft && (
                <button onClick={() => openProviderDraft()} disabled={vaultLocked && (vaultPassphraseSet ?? false)} className="btn-primary" style={{ justifyContent: 'center' }}>
                  <Plus size={14} /> Add Provider
                </button>
              )}

<div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              <div data-tour="sandbox-config" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Sparkles size={18} className="title-gradient" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Sandbox Configuration</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Test the runner out-of-the-box using mock datasets — no API keys needed. The simulation ships two simulated
                models — <b>Demo Secure</b> (attacks resisted) and <b>Demo Vulnerable</b> (attacks succeed) — so a
                comparison run shows them disagreeing on the same tests.
              </p>

              <div style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Play size={16} color="var(--color-primary)" />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Sandbox Mode</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }} data-tour="sandbox-toggle">
                  <input
                    type="checkbox"
                    checked={useDemoMode}
                    onChange={(e) => setDemoMode(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Active Sandbox Mode
                </label>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  When enabled, the Auditor Runner simulates model responses instead of calling real APIs. Disable it to use your live credentials.
                </span>
              </div>
              </div>
                </div>
              )}
            </div>
  );
}

export default ProvidersCard;
