/**
 * Proxy module - user-configured external proxy/relay configuration and routing
 */

import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from '../endpoint-policy.js';
import { projectDiagnosticText } from '../project-diagnostic.js';

/**
 * Proxy configuration state
 */
let proxyConfig = { enabled: false, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: false, articles: false } };

const normalizeCategories = (cats) => ({
  privateNet: !!(cats && cats.privateNet),
  providers: !!(cats && cats.providers),
  articles: !!(cats && cats.articles)
});

/**
 * Apply proxy settings
 */
export const setProxyConfig = (cfg) => {
  proxyConfig = {
    enabled: !!cfg?.enabled,
    baseUrl: String(cfg?.baseUrl || '').trim(),
    mode: cfg?.mode === 'always' ? 'always' : 'fallback',
    categories: normalizeCategories(cfg?.categories)
  };
};

/**
 * Get current proxy config
 */
export const getProxyConfig = () => proxyConfig;

/**
 * Confirm handler for proxy use
 */
let proxyConfirmHandler = null;
export const setProxyConfirmHandler = (fn) => { proxyConfirmHandler = fn; };

/**
 * Confirm handler for redirect follow
 */
let redirectConfirmHandler = null;
export const setRedirectConfirmHandler = (fn) => { redirectConfirmHandler = fn; };

/**
 * Confirm redirect follow
 */
export const confirmRedirectFollow = async (fromUrl, toUrl) => {
  const message =
    `"${fromUrl}" redirects to "${toUrl}".\n\n` +
    `Do you want the app to follow the redirect and fetch that destination?\n` +
    `The destination has been checked against the private/local-host policy; only follow it if you trust it.`;
  if (redirectConfirmHandler) return await redirectConfirmHandler(message);
  return window.confirm(message);
};

const PROXY_CATEGORY_LABELS = {
  privateNet: 'private network',
  providers: 'provider API',
  articles: 'article'
};

const consentedProxyCategories = new Set();

export const getConsentedProxyCategories = () => consentedProxyCategories;

/**
 * Test-only reset for proxy consent
 */
export const resetProxyConsent = () => { consentedProxyCategories.clear(); };

/**
 * Confirm proxy use with user
 *
 * The prompt always names the target, states the actual routing reason
 * (observed CORS failure vs. proxy-policy routing), and names the proxy
 * destination when one is configured. A missing destination is stated
 * explicitly instead of being interpolated as a blank string.
 */
export const confirmProxyUse = async (targetUrl, category, blockedByCors) => {
  if (category !== 'articles' && consentedProxyCategories.has(category)) return true;
  const reason = blockedByCors
    ? 'The direct request was blocked by the CORS policy of the target website.'
    : category === 'articles'
      ? 'This website is not fetched directly from the browser under the current proxy policy, so it would be relayed through the proxy.'
      : `This ${PROXY_CATEGORY_LABELS[category] || category} endpoint cannot be reached directly from the browser.`;
  const destination = String(proxyConfig.baseUrl || '').trim();
  const destinationLine = destination
    ? `The URL and its data will be sent to ${destination}.`
    : 'No proxy destination is configured — set a proxy URL in Settings before relaying.';
  const message =
    `${reason}\n\nUse the proxy to send the request to "${targetUrl}"?\n` +
    destinationLine;
  let ok;
  if (proxyConfirmHandler) ok = await proxyConfirmHandler(message);
  else ok = window.confirm(message);
  if (ok && category !== 'articles') consentedProxyCategories.add(category);
  return ok;
};

/**
 * Build proxy URL
 */
export const buildProxyUrl = (baseUrl, targetUrl) => {
  const encoded = encodeURIComponent(targetUrl);
  return baseUrl.includes('{url}') ? baseUrl.replace('{url}', encoded) : `${baseUrl}${encoded}`;
};

/**
 * Append query parameter
 */
const appendQueryParam = (url, name, value) => {
  const s = String(url);
  if (new RegExp(`[?&]${name}=`).test(s)) return s;
  return `${s}${s.includes('?') ? '&' : '?'}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
};

/**
 * Known domains that block CORS from browsers and need proxy
 */
const CORS_BLOCKED_PROVIDER_DOMAINS = new Set([
  'generativelanguage.googleapis.com',
]);

/**
 * Determine if proxy should be used
 */
export const shouldUseProxy = (url, category, providerConfig = null, directBlocked = false) => {
  if (!proxyConfig.enabled) return false;
  if (proxyConfig.categories?.[category] !== true) return false;
  let u;
  try { u = new URL(String(url || '')); } catch { return false; }
  if (category === 'privateNet') return isSpecialUseAddress(u.hostname) || isSpecialUseHostname(u.hostname);
  if (category === 'providers') {
    const needsProxyForCors = CORS_BLOCKED_PROVIDER_DOMAINS.has(u.hostname);
    return !!(providerConfig && (providerConfig.allowPrivate === true || isInsecureHttpEndpoint(providerConfig.endpoint) || needsProxyForCors));
  }
  if (category === 'articles') return proxyConfig.mode === 'always' || directBlocked;
  return false;
};

/**
 * Fetch via proxy
 */
export const fetchViaProxy = async (targetUrl, signal, category = 'articles', options = {}) => {
  const { method = 'GET', headers, body, returnOnStatus } = options;
  const base = proxyConfig.baseUrl;
  if (!base) {
    if (category === 'providers') throw new Error('No proxy URL configured.');
    return { text: '', base: '' };
  }
  const proxyUrl = buildProxyUrl(base, targetUrl);
  const proxyHeaders = {
    ...headers,
    'x-groundrumble-target': targetUrl,
    'x-groundrumble-noredirect': '1',
  };

  if (category === 'providers') {
    // Relay contract flags: never follow redirects through the relay, and
    // declare special-use targets so the relay may reach private networks.
    let relayUrl = appendQueryParam(proxyUrl, 'groundrumble_noredirect', '1');
    try {
      const target = new URL(targetUrl);
      if (isSpecialUseAddress(target.hostname) || isSpecialUseHostname(target.hostname)) {
        relayUrl = appendQueryParam(relayUrl, 'groundrumble_allow_private', '1');
      }
    } catch { /* unparsable target: transport gates apply upstream */ }
    const res = await fetch(relayUrl, {
      method,
      headers: proxyHeaders,
      body,
      signal,
      redirect: 'manual',
    });
    if (returnOnStatus !== null && res.status === returnOnStatus) return { res, base };
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      throw new Error(`Proxy redirect to ${location} refused`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Proxy HTTP ${res.status}: ${projectDiagnosticText(text, 500)}`);
    }
    return { res, base };
  }

  // articles / GET relay — a single attempt; empty text means the relay failed.
  try {
    const res = await fetch(proxyUrl, {
      method,
      headers: proxyHeaders,
      ...(body != null ? { body } : {}),
      signal,
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      throw new Error(`Proxy redirect to ${location} refused`);
    }
    if (res.ok) {
      return { text: await res.text(), base: proxyUrl };
    }
  } catch { /* relay failed */ }
  return { text: '', base: proxyUrl };
};

const PROXY_TEST_TARGET = 'https://example.com/';
const PROXY_TEST_TIMEOUT_MS = 15000;

/**
 * Test a configured proxy URL end-to-end: relay a benign public target through
 * the relay and report whether it round-tripped. Throws a user-facing message
 * on every failure branch (unconfigured base, unreachable relay, redirect
 * refusal, non-OK status, empty body, timeout).
 */
export const testProxyConnection = async (baseUrl, options = {}) => {
  const base = String(baseUrl || '').trim();
  if (!base) throw new Error('No proxy URL configured.');
  const targetUrl = options.targetUrl || PROXY_TEST_TARGET;
  const timeout = options.timeout ?? PROXY_TEST_TIMEOUT_MS;
  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    throw new Error('Invalid test target URL.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const relayUrl = buildProxyUrl(base, target.href);
    const res = await Promise.race([
      fetch(relayUrl, {
        method: 'GET',
        headers: { 'x-groundrumble-target': target.href, 'x-groundrumble-noredirect': '1' },
        signal: controller.signal,
        redirect: 'manual',
      }),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    ]);
    if (controller.signal.aborted) throw new Error('aborted');
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      throw new Error(`Proxy refused a redirect to ${location ? `"${location}"` : 'an unknown destination'}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Proxy HTTP ${res.status}: ${projectDiagnosticText(text, 200)}`);
    }
    const text = await res.text();
    if (!text.trim()) throw new Error('The proxy responded, but returned no content.');
    return { ok: true, status: res.status, chars: text.length, target: target.href };
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Proxy test timed out after ${timeout}ms — the relay did not respond.`);
    if (err instanceof TypeError) throw new Error('Could not reach the proxy URL — the request failed at the network level.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
};