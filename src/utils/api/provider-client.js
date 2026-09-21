/**
 * Provider client module - OpenAI-compatible and raw provider APIs
 */

import { fetchWithRetry } from './fetch-retry.js';
import {
  resolveOpenAIEndpoint,
  deriveModelsEndpoint,
  applyBodyTemplate,
  isJsonBodyTemplate,
  substituteToken,
  extractByPath,
  parseHeaders,
  hasHeader,
  resolveBodyContentType,
} from './provider-request-config.js';
import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from '../endpoint-policy.js';
import { findSecretQueryParam } from './find-secret-param.js';
import { 
  shouldUseProxy, 
  fetchViaProxy, 
  confirmProxyUse,
  getProxyConfig 
} from './proxy.js';

/**
 * Find secret query parameter
 */
export { findSecretQueryParam };
export {
  resolveOpenAIEndpoint,
  deriveModelsEndpoint,
  applyBodyTemplate,
  isJsonBodyTemplate,
  substituteToken,
  extractByPath,
  parseHeaders,
};

/**
 * Assert provider endpoint is allowed
 * Order matters: transport-independent secret checks (userinfo, query-string
 * credentials) are ALWAYS enforced; approval flags only relax the
 * private/loopback and cleartext-transport gates.
 */
export const assertProviderEndpointAllowed = (endpoint, provider = {}) => {
  let url;
  try { url = new URL(String(endpoint || '')); } catch { throw new Error('Provider endpoint must be a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Provider endpoint must use HTTP or HTTPS.');
  if (url.username || url.password) {
    throw new Error('Provider endpoint must not embed userinfo credentials.');
  }
  const secretParam = findSecretQueryParam(url.href);
  if (secretParam) {
    throw new Error(`Provider endpoint must not carry "${secretParam}" in the query string.`);
  }
  const allowPrivate = provider.allowPrivate === true;
  if (!allowPrivate) {
    if (isSpecialUseAddress(url.hostname) || isSpecialUseHostname(url.hostname)) {
      throw new Error('Private or loopback endpoint requires explicit approval.');
    }
  }
  if (provider.allowInsecureTransport !== true && isInsecureHttpEndpoint(url.href)) {
    throw new Error('Insecure HTTP endpoint requires explicit approval.');
  }
  return url;
};

/**
 * Provider route decision - determines if request should go direct or via proxy.
 *
 * The canonical final-transport endpoint policy (`assertProviderEndpointAllowed`)
 * is enforced here first, so every provider transport source — chat, model discovery,
 * connectivity probes — shares one security boundary regardless of how the
 * provider configuration entered state (form save, restore, hydration, enable).
 * Policy violations are thrown (never a silent {allowed:false} result).
 */
export const providerRouteFor = (endpoint, provider = {}) => {
  const url = assertProviderEndpointAllowed(endpoint, provider);
  // Check if proxy should be used for this provider endpoint
  const proxyConfig = getProxyConfig();
  if (proxyConfig.enabled &&
      (shouldUseProxy(url.href, 'providers', provider, false) || shouldUseProxy(url.href, 'privateNet', provider, false))) {
    return { via: 'proxy', url: endpoint };
  }
  return { via: 'direct', url: endpoint };
};

/**
 * Map fetchWithRetry's non-ok throw (`HTTP <code>: <body>`) to the provider
 * error contract. OpenAI style surfaces `Provider Error (HTTP n): <payload>`;
 * raw style prefers the payload message, else `Provider Error: n`.
 * Non-matching errors pass through unchanged.
 */
const mapProviderHttpError = (err, style) => {
  const m = /^HTTP (\d{3}): ([\s\S]*)$/.exec(String(err?.message || ''));
  if (!m) return err;
  const [, code, bodyText] = m;
  let payloadMsg = '';
  try {
    const data = JSON.parse(bodyText);
    payloadMsg = data?.error?.message ?? data?.message ?? '';
  } catch { /* body was not JSON */ }
  if (style === 'openai') return new Error(`Provider Error (HTTP ${code}): ${payloadMsg || bodyText.slice(0, 200)}`);
  return new Error(payloadMsg || `Provider Error: ${code}`);
};

/**
 * Query OpenAI-compatible provider
 */
export const queryOpenAIProvider = async (provider, model, systemPrompt, userPrompt, signal, options = {}) => {
  try {
    const { maxTokens = 4096, temperature = 0, jsonMode = false, bodyTemplate } = options;
    const resolved = resolveOpenAIEndpoint(provider);
    let body;
    if (bodyTemplate) {
      body = applyBodyTemplate(bodyTemplate, { systemPrompt, userPrompt, model, maxTokens, temperature, jsonMode });
    } else {
      body = JSON.stringify({
        model: model || provider.models?.[0] || '',
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      });
    }
    const headers = { ...substituteToken(parseHeaders(provider.headers), provider.apiKey) };
    if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = resolveBodyContentType(bodyTemplate);
    // An absent API key is legitimate for local/custom providers: omit the
    // credential rather than fabricating an empty `Bearer ` value. A custom
    // Authorization header (if configured, under any casing) is preserved as-is.
    if (!hasHeader(headers, 'authorization') && provider.apiKey) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }
    const res = await providerFetch(resolved.chatEndpoint, provider,
      { method: (provider.method || 'POST').toUpperCase(), headers, body }, { signal });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    // Cancellation must survive transport normalization so the audit runner
    // does not persist an in-flight cancellation as a technical failure.
    if (signal?.aborted || err?.name === 'AbortError') throw err;
    // Ensure we never throw an error with undefined/empty/'undefined' message
    const mapped = mapProviderHttpError(err, 'openai');
    const rawMsg = mapped instanceof Error ? mapped.message : (mapped?.message || String(mapped));
    throw new Error(rawMsg && rawMsg !== 'undefined' ? rawMsg : 'Unknown error');
  }
};

/**
 * Query raw provider
 */
export const queryRawProvider = async (provider, model, systemPrompt, userPrompt, signal, options = {}) => {
  try {
    const { bodyTemplate, method = 'POST', responsePath = 'choices.0.message.content', maxTokens = 4096, temperature = 0, jsonMode = false } = options;
    if (!bodyTemplate || !String(bodyTemplate).trim()) {
      throw new Error('no Body Template provided for raw connector');
    }
    const body = applyBodyTemplate(bodyTemplate, { systemPrompt, userPrompt, model, maxTokens, temperature, jsonMode });
    try {
      JSON.parse(body);
    } catch (err) {
      throw new Error(`Body template produced invalid JSON: ${err.message}`);
    }
    const headers = { ...substituteToken(parseHeaders(provider.headers), provider.apiKey) };
    if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = resolveBodyContentType(bodyTemplate);
    if (provider.apiKey && !hasHeader(headers, 'authorization')) headers.Authorization = `Bearer ${provider.apiKey}`;
    const res = await providerFetch(provider.endpoint, provider, { method, headers, body }, { signal });
    const data = await res.json();
    const out = responsePath ? extractByPath(data, responsePath) : data;
    return typeof out === 'string' ? out : JSON.stringify(out);
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw err;
    // Ensure we never throw an error with undefined/empty/'undefined' message
    const mapped = mapProviderHttpError(err, 'raw');
    const rawMsg = mapped instanceof Error ? mapped.message : (mapped?.message || String(mapped));
    throw new Error(rawMsg && rawMsg !== 'undefined' ? rawMsg : 'Unknown error');
  }
};

/**
 * Provider fetch with automatic proxy routing
 * Routes through the configured proxy when needed (private networks, CORS-blocked endpoints)
 */
export const providerFetch = async (url, provider, init, fetchOpts = {}) => {
  try {
    const route = providerRouteFor(url, provider);
    const direct = () => fetchWithRetry(url, init, fetchOpts.retries ?? 2, fetchOpts.returnOnStatus ?? null, fetchOpts.signal);
    if (route.via !== 'proxy') return direct();
    // Proxy route - ask for consent if needed
    if (!await confirmProxyUse(url, 'providers', false)) return direct();
    const { signal, retries, returnOnStatus } = fetchOpts;
    const { res } = await fetchViaProxy(url, signal, 'providers', {
      method: init.method || 'GET',
      headers: init.headers,
      body: init.body,
      retries,
      returnOnStatus
    });
    return res;
} catch (err) {
    const proxyCfg = getProxyConfig();
    const isCorsError = err instanceof TypeError && err.message === 'Failed to fetch';
    const needsProxy = isCorsError && !proxyCfg.enabled;
    let msg;
    if (needsProxy) {
      msg = 'CORS blocked: This provider blocks browser requests. Configure a proxy in Settings to use it.';
    } else {
      const rawMsg = err instanceof Error ? (err.message || 'Unknown error') : (err?.message || err?.code || err?.name || String(err) || 'Unknown error');
      msg = (rawMsg && rawMsg !== 'undefined') ? rawMsg : 'Unknown error';
    }
    throw new Error(msg);
  }
};

/**
 * Fetch provider models
 * Models endpoint always uses GET regardless of provider's default method
 */
export const fetchProviderModels = async (cp, signal) => {
  try {
    const modelsEndpoint = deriveModelsEndpoint(cp);
    if (!modelsEndpoint) return [];
    const headers = { ...parseHeaders(cp.headers) };
    const hasAuthHeader = Object.keys(headers).some((k) => k.toLowerCase() === 'authorization');
    if (cp.apiKey && !hasAuthHeader) headers.Authorization = `Bearer ${cp.apiKey}`;
    // Models endpoint always uses GET (even if provider default is POST for chat)
    // and must never retry: discovery is a probe, not a workload.
    const res = await providerFetch(modelsEndpoint, cp, { method: 'GET', headers }, { signal, retries: 0 });
    if (!res) throw new Error('providerFetch returned undefined response');
    const data = await res.json();
    if (Array.isArray(data.data)) return data.data.map(m => String(m.id || '').replace(/^models\//, '')).filter(Boolean);
    if (Array.isArray(data.models)) return data.models.map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    if (Array.isArray(data)) return data.map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    return [];
} catch (err) {
    // Surface status-bearing failures as Models endpoint HTTP <code><detail>.
    const m = /^HTTP (\d{3})([\s\S]*)$/.exec(String(err?.message || ''));
    if (m) throw new Error(`Models endpoint HTTP ${m[1]}${m[2]}`);
    // Ensure we never throw an error with undefined/empty/'undefined' message
    const rawMsg = err instanceof Error ? (err.message || 'Unknown error') : (err?.message || err?.code || String(err) || 'Unknown error');
    throw new Error(rawMsg && rawMsg !== 'undefined' ? rawMsg : 'Unknown error');
  }
};

/**
 * Chat-capability hint used to prioritize retry candidates: chat-family model
 * ids are tried before TTS/audio/embedding entries some gateways list in the
 * same catalog.
 */
const CHAT_MODEL_HINT = /(gpt|^o\d|chat|llama|qwen|qwq|gemini|claude|mistral|mixtral|deepseek|glm|command|phi|yi-|kimi|grok|ernie|falcon|hunyuan|minimax|dbrx|arctic)/i;

const orderedCandidates = (models) => [
  ...models.filter((id) => CHAT_MODEL_HINT.test(id)),
  ...models.filter((id) => !CHAT_MODEL_HINT.test(id)),
];

/**
 * Extract the HTTP status from fetchWithRetry's thrown messages
 * (`HTTP <code>: <body>`, `Rate limit reached (HTTP <code>)`). Returns null
 * for network-level failures that carry no status.
 */
const probeStatusFromMessage = (message) => {
  const m = /^Rate limit reached \(HTTP (\d{3})\)/.exec(message) || /^HTTP (\d{3}):/.exec(message);
  return m ? Number(m[1]) : null;
};

/**
 * Single chat-completion probe for the connection test. Returns `{ status }`
 * on a classifiable HTTP outcome or `{ error }` for network/redirect failures;
 * rethrows the caller's abort reason untouched.
 */
const chatProbe = async (cp, model, signal) => {
  try {
    const { chatEndpoint } = resolveOpenAIEndpoint(cp);
    const headers = {
      'Content-Type': 'application/json',
      ...substituteToken(parseHeaders(cp.headers), cp.apiKey),
    };
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'authorization') && cp.apiKey) {
      headers.Authorization = `Bearer ${cp.apiKey}`;
    }
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 });
    const res = await providerFetch(chatEndpoint, cp, { method: 'POST', headers, body }, { signal, retries: 0 });
    return { status: res.status };
  } catch (err) {
    if (signal?.aborted) throw (signal.reason ?? err);
    const message = String(err?.message || '');
    const status = probeStatusFromMessage(message);
    return status !== null ? { status, message } : { error: message };
  }
};

/**
 * Remap model-discovery failures for the connection test.
 * `fetchProviderModels`'s public contract (`Models endpoint HTTP <n>`) is
 * preserved; only testProvider translates them into connection-test wording.
 */
const mapModelsPhaseFailure = (err) => {
  const message = String(err?.message || '');
  const m = /^Models endpoint HTTP (\d{3})/.exec(message) || /^Rate limit reached \(HTTP (\d{3})\)/.exec(message);
  if (!m) throw new Error(`Models check failed: ${message}`);
  const code = Number(m[1]);
  if (code === 401 || code === 403) throw new Error(`Authentication failed (HTTP ${code}). Check the API key.`);
  if (code === 429) throw new Error(`Rate limit reached (HTTP ${code})`);
  throw new Error(`Models check failed: ${message}`);
};

/**
 * Map an exhausted chat-probe walk to its final error.
 */
const mapChatFailure = (last, hasCatalog) => {
  if (last?.error !== undefined) throw new Error(`Chat test failed: ${last.error}`);
  const code = last?.status;
  if (code === 401 || code === 403) throw new Error(`Authentication failed (HTTP ${code}). Check the API key.`);
  if (code === 429) throw new Error(last?.message || `Rate limit reached (HTTP ${code})`);
  if (!hasCatalog && code === 404) throw new Error(`Chat endpoint reachable, but no model could be verified (HTTP ${code}).`);
  if (!hasCatalog) throw new Error(`Chat test failed (HTTP ${code}).`);
  throw new Error(`Chat endpoint returned HTTP ${code}`);
};

const PROBE_MODEL = '__groundrumble_probe__';

/**
 * Test provider connectivity.
 *
 * Raw connectors get a direct reachability probe honoring the configured
 * method and body template. OpenAI-compatible providers run a two-phase
 * check: model discovery, then a chat-completion walk starting with the
 * sentinel probe model — gateways that reject unknown models with 404 fall
 * through to real catalog entries until one authenticates; a 400 on the
 * sentinel means the gateway validated auth but rejected the fake model id,
 * which still proves reachability.
 */
export const testProvider = async (cp, signal) => {
  if (cp.connector === 'raw') {
    const endpoint = String(cp.endpoint || '').trim();
    if (!endpoint) throw new Error('Endpoint URL is required.');
    const headers = { ...substituteToken(parseHeaders(cp.headers), cp.apiKey) };
    if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = resolveBodyContentType(cp.bodyTemplate);
    if (cp.apiKey && !hasHeader(headers, 'authorization')) headers.Authorization = `Bearer ${cp.apiKey}`;
    const body = applyBodyTemplate(cp.bodyTemplate, { systemPrompt: '', userPrompt: 'ping', model: '', maxTokens: 1 }) || '{"ping":"pong"}';
    let res;
    try {
      res = await providerFetch(endpoint, cp, { method: (cp.method || 'POST').toUpperCase(), headers, body }, { signal, retries: 0 });
    } catch (err) {
      if (signal?.aborted) throw (signal.reason ?? err);
      throw new Error(`Connection failed: ${err.message}`);
    }
    if (!res.ok) throw new Error(`Connection failed (HTTP ${res.status}).`);
    return { ok: true, models: [], chatStatus: 'Endpoint reachable.' };
  }

  let models;
  try {
    models = await fetchProviderModels(cp, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw mapModelsPhaseFailure(err);
  }

  // API keys are genuinely optional: a blank key must never fail the test on
  // its own. The unauthenticated probe below establishes reachability; a real
  // 401/403 from the provider still surfaces as an authentication failure.
  // (A custom Authorization header counts as a credential.)
  const hasCredentials = String(cp.apiKey || '').trim() !== '' ||
    Object.keys(parseHeaders(cp.headers)).some((k) => k.toLowerCase() === 'authorization');

  const candidates = orderedCandidates(models);
  const attempts = [PROBE_MODEL, ...candidates];
  let last = null;
  for (let i = 0; i < attempts.length; i++) {
    const outcome = await chatProbe(cp, attempts[i], signal);
    if (outcome.status >= 200 && outcome.status < 300) {
      return { ok: true, models, model: attempts[i], chatStatus: hasCredentials ? `reachable and authenticated (${attempts[i]})` : `reachable (${attempts[i]})` };
    }
    if (i === 0 && outcome.status === 400) {
      return { ok: true, models, model: '', chatStatus: hasCredentials ? 'reachable and authenticated' : 'reachable' };
    }
    last = outcome;
  }
  throw mapChatFailure(last, candidates.length > 0);
};

/**
 * Query model (main entry point)
 */
export const queryModel = async (providerId, model, systemPrompt, userPrompt, providers = [], signal, options = {}) => {
  const cp = providers.find(p => p.id === providerId);
  if (!cp || cp.enabled === false) throw new Error(`Unknown provider: ${providerId}`);
  const opts = { ...(options || {}), maxTokens: options?.maxTokens ?? 300 };
  if (cp.connector === 'raw') {
    return queryRawProvider(cp, model, systemPrompt, userPrompt, signal, {
      bodyTemplate: cp.bodyTemplate,
      method: cp.method,
      responsePath: cp.responsePath,
      ...opts,
    });
  }
  return queryOpenAIProvider(cp, model, systemPrompt, userPrompt, signal, opts);
};
