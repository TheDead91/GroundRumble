// Pure provider-record normalization cluster — no storage, no globals,
// node-testable. Owns the MAX_PROVIDER_* limits, normalizeProvider
// (strict/lenient), normalizeProviders and validateProviders. vault.js imports
// this cluster for its load/unlock/protect paths and re-exports
// validateProviders so existing import sites keep resolving through
// '../utils/vault'.
const MAX_PROVIDER_ID = 100;
const MAX_PROVIDER_NAME = 200;
const MAX_PROVIDER_FIELD = 200000;

const normalizeProvider = (provider, strict = false) => {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) return strict ? null : provider;
  const id = String(provider.id || '').trim();
  const name = String(provider.name || '').trim();
  const endpoint = String(provider.endpoint || '').trim();
  const connector = provider.connector === 'raw' ? 'raw' : provider.connector === 'openai' ? 'openai' : null;
  if (!Array.isArray(provider.models) || provider.models.length > 500 || provider.models.some(m => typeof m !== 'string' || !m.trim() || m.trim().length > 500)) return strict ? null : provider;
  const models = Array.isArray(provider.models)
    ? provider.models.map(m => m.trim())
    : null;
  if (!id || id.length > MAX_PROVIDER_ID || !name || name.length > MAX_PROVIDER_NAME || !endpoint || endpoint.length > MAX_PROVIDER_FIELD || !connector || !models) return strict ? null : provider;
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) return strict ? null : provider;
  } catch {
    return strict ? null : provider;
  }
  const method = String(provider.method || 'POST').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) return strict ? null : provider;
  const fields = ['modelsEndpoint', 'headers', 'bodyTemplate', 'responsePath', 'notes'];
  if (fields.some(key => provider[key] != null && String(provider[key]).length > MAX_PROVIDER_FIELD)) return strict ? null : provider;
  if (provider.modelsEndpoint) {
    try {
      const modelsUrl = new URL(String(provider.modelsEndpoint));
      if (!['http:', 'https:'].includes(modelsUrl.protocol)) return strict ? null : provider;
    } catch {
      return strict ? null : provider;
    }
  }
  if (provider.headers) {
    try {
      const headers = typeof provider.headers === 'string' ? JSON.parse(provider.headers) : provider.headers;
      if (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.entries(headers).some(([key, value]) => typeof key !== 'string' || typeof value !== 'string' || key.length > 200 || value.length > MAX_PROVIDER_FIELD)) return strict ? null : provider;
    } catch {
      return strict ? null : provider;
    }
  }
  if (connector === 'raw' && provider.bodyTemplate) {
    try { JSON.parse(String(provider.bodyTemplate)); } catch { return strict ? null : provider; }
  }
  return {
    ...provider,
    id,
    name,
    endpoint,
    apiKey: String(provider.apiKey || ''),
    rpm: Math.max(0, Math.min(100000, Number.parseInt(provider.rpm, 10) || 0)),
    connector,
    models,
    modelsEndpoint: String(provider.modelsEndpoint || '').trim(),
    method,
    headers: String(provider.headers || ''),
    bodyTemplate: String(provider.bodyTemplate || ''),
    responsePath: String(provider.responsePath || 'choices.0.message.content').trim(),
    notes: String(provider.notes || ''),
    enabled: provider.enabled !== false,
    allowPrivate: provider.allowPrivate === true
  };
};

const normalizeProviders = (providers) => {
  if (!Array.isArray(providers)) return [];
  const seen = new Set();
  return providers.map(provider => normalizeProvider(provider)).filter(provider => {
    if (!provider || (typeof provider === 'object' && seen.has(provider.id))) return false;
    if (typeof provider === 'object') seen.add(provider.id);
    return true;
  });
};

export const resolveProviderLabel = (ref, providers) => {
  if (ref == null || ref === '') return 'Not configured';
  const cp = typeof ref === 'string'
    ? providers.find(p => p.id === ref)
    : (typeof ref === 'object' ? ref : null);
  if (!cp) return String(ref);
  return `${cp.name} (${cp.models?.length || 0} models)`;
};

export const validateProviders = (providers) => {
  if (!Array.isArray(providers)) throw new Error('Providers must be an array.');
  const normalized = providers.map(provider => normalizeProvider(provider, true));
  if (normalized.some(provider => !provider)) throw new Error('The backup contains an invalid provider.');
  const ids = new Set(normalized.map(provider => provider.id));
  if (ids.size !== normalized.length) throw new Error('The backup contains duplicate provider IDs.');
  return normalized;
};

export { normalizeProvider, normalizeProviders };
