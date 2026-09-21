import { queryModel, resolveOpenAIEndpoint } from './api/index.js';

// Resolves the effective judge (provider + model + credentials) from the saved
// judge config and the configured providers. Returns null if the provider
// isn't configured or enabled. Every provider is a user-defined provider.
export const buildJudge = (cfg, providers) => {
  const cp = providers.find(p => p.id === cfg.provider && p.enabled !== false);
  if (!cp) return null;
  let headers = {};
  if (cp.headers) {
    try { headers = JSON.parse(cp.headers); } catch { /* ignore malformed headers */ }
  }
  return {
    provider: cp.id,
    model: cfg.model || cp.models?.[0] || '',
    endpoint: cp.connector === 'raw' ? cp.endpoint : resolveOpenAIEndpoint(cp).chatEndpoint,
    apiKey: cp.apiKey || '',
    rpm: cp.rpm || 0,
    connector: cp.connector || 'openai',
    method: cp.method || 'POST',
    headers,
    bodyTemplate: cp.bodyTemplate,
    responsePath: cp.responsePath || 'choices.0.message.content',
    allowPrivate: cp.allowPrivate === true,
    allowInsecureTransport: cp.allowInsecureTransport === true
  };
};

// Lightweight connectivity test: one tiny chat message ("pong") against the
// configured model. No heavy evaluation / generation payloads.
export const pingModel = async (cfg, label, providers) => {
  const judge = buildJudge(cfg, providers);
  if (!judge) throw new Error(`This ${label} needs a configured key/endpoint — add it in Settings → Providers.`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), 20000);
  try {
    const text = await queryModel(
      judge.provider,
      judge.model || '',
      '',
      'Reply with exactly: pong',
      providers,
      controller.signal
    );
    return String(text || '').trim();
  } finally {
    clearTimeout(timer);
  }
};
