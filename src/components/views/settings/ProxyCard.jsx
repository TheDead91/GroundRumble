import React from 'react';
import { AlertTriangle, Check, Globe, Plug, RefreshCw } from 'lucide-react';
import { SettingsCardHeader } from './SettingsCardHeader';

/**
 * ProxyCard - the proxy settings card: the proxy glass-card shell + collapse
 * gates, the enable toggle, the three category checkboxes with their
 * !proxyEnabled disables, the article-fetch-mode select + explainer, the
 * proxy-URL input + placeholder note and the privacy & safety warning.
 * Props-in/events-out over the SettingsContext proxy cluster (no context
 * reaches inside) and the shared SettingsCardHeader component for its header;
 * the proxy state stays SettingsContext-owned in SettingsView. The "Test Proxy"
 * button relays a benign test page through the configured URL (onTestProxy
 * prop) and renders the proxyTest result line, mirroring the provider
 * connection test.
 */
export function ProxyCard({
  proxyEnabled,
  setProxyEnabled,
  proxyUrl,
  setProxyUrl,
  proxyMode,
  setProxyMode,
  proxyCategories,
  setProxyCategories,
  proxyTest,
  onTestProxy,
  collapsedSettings
}) {
  return (
             <div className="glass-card" data-tour="cors-card" style={{ display: 'flex', flexDirection: 'column', gap: collapsedSettings['cors'] ? '0' : '14px' }}>
              <SettingsCardHeader settingKey="cors" icon={<Globe size={18} color="var(--color-primary)" />} title={'Proxy Configuration'} />
              {!collapsedSettings['cors'] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Browsers block most cross-origin traffic (CORS), so AI test generation often only sees a URL + title,
                and local endpoints (e.g. an Ollama server on your LAN) are unreachable from the page. The proxy relays
                selected traffic through a <b>custom proxy URL you provide</b>. Enable a category below; you're asked
                to confirm the first time a session relays that kind of request.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={proxyEnabled}
                    onChange={(e) => setProxyEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  Enable the proxy
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={proxyCategories.articles}
                    onChange={(e) => setProxyCategories((c) => ({ ...c, articles: e.target.checked }))}
                    style={{ accentColor: 'var(--color-primary)' }}
                    disabled={!proxyEnabled}
                  />
                  Article content fetching (external pages analyzed for test generation)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={proxyCategories.providers}
                    onChange={(e) => setProxyCategories((c) => ({ ...c, providers: e.target.checked }))}
                    style={{ accentColor: 'var(--color-primary)' }}
                    disabled={!proxyEnabled}
                  />
                  Provider API calls (custom LLM endpoints that are CORS-blocked or non-public)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={proxyCategories.privateNet}
                    onChange={(e) => setProxyCategories((c) => ({ ...c, privateNet: e.target.checked }))}
                    style={{ accentColor: 'var(--color-primary)' }}
                    disabled={!proxyEnabled}
                  />
                  Private network destinations (localhost / LAN / special-use hosts)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <label className="form-label">Article fetch mode</label>
                <select
                  value={proxyMode}
                  onChange={(e) => setProxyMode(e.target.value)}
                  className="form-input"
                  disabled={!proxyEnabled || !proxyCategories.articles}
                >
                  <option value="fallback">Only when the direct fetch is blocked (recommended)</option>
                  <option value="always">All article fetches</option>
                </select>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  "Only when blocked" tries the direct request first and uses the proxy just for sites that refuse CORS —
                  used both when adding a source and during test generation.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <label className="form-label">Proxy URL</label>
                <input
                  type="text"
                  value={proxyUrl}
                  onChange={(e) => setProxyUrl(e.target.value)}
                  placeholder="Enter your proxy URL (supports {url} placeholder)"
                  className="form-input"
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Enter your proxy URL (e.g. a self-hosted <code>cors-anywhere</code>). A <code>{'{url}'}</code>
                  placeholder is supported; otherwise the target URL is appended. You'll be asked to confirm each time
                  a request goes through the proxy.
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={onTestProxy}
                    disabled={!proxyUrl.trim() || proxyTest?.status === 'testing'}
                    className="btn-secondary"
                    style={{ minWidth: '140px' }}
                    title="Fetch a benign test page through the configured proxy URL to verify the relay returns content"
                  >
                    {proxyTest?.status === 'testing' ? <><RefreshCw size={14} className="animate-spin-custom" /> Testing…</> : <><Plug size={14} /> Test Proxy</>}
                  </button>
                  {proxyTest && proxyTest.status !== 'testing' && (
                    <span style={{
                      fontSize: '0.72rem', lineHeight: 1.45, wordBreak: 'break-word', textAlign: 'right',
                      color: proxyTest.status === 'ok' ? 'var(--color-secure)' : 'var(--color-vulnerable)',
                      display: 'flex', alignItems: 'flex-start', gap: '6px', justifyContent: 'flex-end'
                    }}>
                      {proxyTest.status === 'ok' ? <Check size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />}
                      {proxyTest.message}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <AlertTriangle size={14} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <b>Privacy &amp; safety:</b> traffic is relayed through your configured proxy URL; ensure you trust
                  the proxy operator, and avoid proxying private or sensitive material. The proxy never follows
                  redirects for relayed provider/private calls, and its private-network mode only serves
                  special-use/local hosts. GitHub repos don't need article proxying (raw fetching already works).
                </span>
              </div>
                </div>
              )}
            </div>
  );
}

export default ProxyCard;
