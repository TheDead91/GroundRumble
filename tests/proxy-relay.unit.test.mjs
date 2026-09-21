// Behavioral coverage for the proxy.js branches the rest of the suite never
// reaches: the config getters, the shouldUseProxy fallthrough, fetchViaProxy's
// no-base guard, and the providers/articles relay error branches. Pins exact
// returned values and thrown messages; no timers, no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { jsonRes, textRes, stubFetch, withFastTimers } from './helpers/httpx.mjs';

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

const {
  setProxyConfig, getProxyConfig, setProxyConfirmHandler,
  shouldUseProxy, fetchViaProxy, confirmProxyUse, getConsentedProxyCategories,
  resetProxyConsent, testProxyConnection, buildProxyUrl
} = await import('../src/utils/api/proxy.js');

const PROXY = 'https://relay.example/fetch?url=';
const reset = () => setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: false, articles: false } });

// ── config getters ─────────────────────────────────────────────────────────

test('getProxyConfig returns the normalized config state that was set', () => {
  setProxyConfig({ enabled: true, baseUrl: '  https://relay.example/fetch?url=  ', mode: 'always', categories: { providers: true } });
  assert.deepEqual(getProxyConfig(), {
    enabled: true,
    baseUrl: 'https://relay.example/fetch?url=',
    mode: 'always',
    categories: { privateNet: false, providers: true, articles: false }
  });
  assert.equal(getProxyConfig().mode, 'always', 'getProxyConfig exposes the same module state that was set');
  reset();
});

test('getConsentedProxyCategories tracks the per-session consent set', async () => {
  resetProxyConsent();
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: true } });
  setProxyConfirmHandler(() => true);
  assert.equal(await confirmProxyUse('https://api.example.com/v1', 'providers', true), true);
  assert.ok(getConsentedProxyCategories().has('providers'), 'accepted provider consent joins the set');
  // A consented category short-circuits: no second prompt even with a new handler.
  let asked = 0;
  setProxyConfirmHandler(() => { asked++; return true; });
  assert.equal(await confirmProxyUse('https://api.example.com/v2', 'providers', true), true);
  assert.equal(asked, 0, 'session consent suppresses the repeat prompt');
  // Articles is intentionally prompt-per-request and never joins the set.
  assert.equal(await confirmProxyUse('https://example.com/story', 'articles', true), true);
  assert.ok(!getConsentedProxyCategories().has('articles'), 'articles consent is not remembered');
  assert.equal(getConsentedProxyCategories().size, 1, 'only the providers category is consented');
  resetProxyConsent();
  assert.equal(getConsentedProxyCategories().size, 0, 'reset clears the consent set');
  setProxyConfirmHandler(null);
  reset();
});

// ── shouldUseProxy fallthrough ─────────────────────────────────────────────

test('shouldUseProxy returns false for unknown categories and unparsable URLs', () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: true, providers: true, articles: true } });
  assert.equal(shouldUseProxy('https://example.com/x', 'unknownCategory'), false, 'unknown category falls through to false');
  assert.equal(shouldUseProxy('::: not a url :::', 'providers', { endpoint: 'https://api.example.com/v1', allowPrivate: true }), false, 'unparsable URL never routes via the proxy');
  assert.equal(shouldUseProxy('', 'articles', null, true), false, 'empty URL string is unparsable, not routable');
  reset();
});

test('shouldUseProxy refuses to route a config category the router does not know', () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'always', categories: { privateNet: true, providers: true, articles: true } });
  const cfg = getProxyConfig();
  const savedCategories = cfg.categories;
  cfg.categories = { ...savedCategories, mystery: true }; // config state beyond the normalized shape must not open the relay
  try {
    assert.equal(shouldUseProxy('https://example.com/x', 'mystery'), false, 'an opted-in but unrecognized category falls through to false');
  } finally {
    cfg.categories = savedCategories;
  }
  assert.deepEqual(getProxyConfig().categories, savedCategories, 'router state is untouched by the probe');
  reset();
});

// ── fetchViaProxy: no-base guard ───────────────────────────────────────────

test('fetchViaProxy with no configured base throws for providers and yields the empty article result', async () => {
  setProxyConfig({ enabled: false, baseUrl: '', mode: 'fallback', categories: { privateNet: false, providers: true, articles: true } });
  let calls = 0;
  stubFetch([[(_unused) => true, () => { calls++; return jsonRes({}); }]]);
  await assert.rejects(
    fetchViaProxy('https://api.example.com/v1', undefined, 'providers'),
    { message: 'No proxy URL configured.' }
  );
  const article = await fetchViaProxy('https://example.com/story', undefined, 'articles');
  assert.deepEqual(article, { text: '', base: '' }, 'articles get the empty {text, base} result when no proxy is configured');
  assert.equal(calls, 0, 'no fetch is attempted without a base URL');
  reset();
});

// ── providers relay: redirect refusal, non-OK body, returnOnStatus ─────────

test('providers relay refuses a 3xx response naming the redirect location', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  const seen = [];
  stubFetch([[
    (r) => { seen.push(r); return true; },
    () => jsonRes({}, 302, { location: 'https://evil.example/steal' })
  ]]);
  await assert.rejects(
    fetchViaProxy('https://api.example.com/v1/models', undefined, 'providers'),
    { message: 'Proxy redirect to https://evil.example/steal refused' }
  );
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.includes('groundrumble_noredirect=1'), 'relay request declares noredirect');
  assert.equal(seen[0].headers['x-groundrumble-target'], 'https://api.example.com/v1/models', 'relay request names the target');
  reset();
});

test('providers relay surfaces non-OK bodies as a redacted, bounded projection', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  const longBody = 'RELAY DOWN: ' + 'x'.repeat(900);
  stubFetch([[
    (_unused) => true,
    (req) => req.url.includes('short.example') ? textRes('RELAY DOWN', 503) : textRes(longBody, 502)
  ]]);
  await assert.rejects(
    fetchViaProxy('https://short.example/v1/models', undefined, 'providers'),
    { message: 'Proxy HTTP 503: RELAY DOWN' }
  );
  await assert.rejects(
    fetchViaProxy('https://api.example.com/v1/chat', undefined, 'providers'),
    { message: 'Proxy HTTP 502: RELAY DOWN: [REDACTED_HIGH_ENTROPY]' }
  );
  reset();
});

test('providers relay passes a returnOnStatus match through instead of erroring', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  stubFetch([[(_unused) => true, () => jsonRes({ error: 'rate limited' }, 429)]]);
  const out = await fetchViaProxy('https://api.example.com/v1/models', undefined, 'providers', { returnOnStatus: 429 });
  assert.equal(out.res.status, 429, 'the matched status is returned to the caller');
  assert.equal(out.base, PROXY, 'the result names the proxy base');
  reset();
});

// ── articles relay: redirect refusal is swallowed into an empty result ─────

test('articles relay treats a 3xx relay answer as a failed relay (empty text, proxy base kept)', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: false, articles: true } });
  let attempts = 0;
  stubFetch([[
    (_unused) => true,
    () => { attempts++; return textRes('', 301, { location: 'https://evil.example/steal' }); }
  ]]);
  const target = 'https://example.com/story';
  const out = await fetchViaProxy(target, undefined, 'articles');
  assert.deepEqual(out, { text: '', base: PROXY + encodeURIComponent(target) }, 'redirect-refused yields the empty relay result with the built proxy URL');
  assert.equal(attempts, 1, 'the articles relay makes a single attempt');
  reset();
});

test('shouldUseProxy routes privateNet by the URL policy (special-use address and hostname)', () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: true, providers: false, articles: false } });
  assert.equal(shouldUseProxy('http://169.254.169.254/latest/meta-data', 'privateNet'), true, 'a link-local address is special-use');
  assert.equal(shouldUseProxy('http://metadata.google.internal/computeMetadata', 'privateNet'), true, 'a metadata hostname is special-use');
  assert.equal(shouldUseProxy('https://example.com/page', 'privateNet'), false, 'a public host is not routed');
  reset();
});

test('shouldUseProxy routes providers by allowPrivate, insecure HTTP transport, or the CORS-blocked host', () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  const safe = 'https://api.example.com/v1';
  assert.equal(shouldUseProxy(safe, 'providers', { endpoint: safe, allowPrivate: true }), true, 'allowPrivate flips the provider to the relay');
  assert.equal(shouldUseProxy('http://api.example.com/v1', 'providers', { endpoint: 'http://api.example.com/v1' }), true, 'an insecure HTTP endpoint uses the relay');
  assert.equal(shouldUseProxy('https://generativelanguage.googleapis.com/v1beta', 'providers', { endpoint: 'https://generativelanguage.googleapis.com/v1beta' }), true, 'the known CORS-blocked domain uses the relay');
  assert.equal(shouldUseProxy('https://api.example.com/v1', 'providers', null), false, 'no provider config never routes');
  assert.equal(shouldUseProxy('https://api.example.com/v1', 'providers', { endpoint: safe }), false, 'a safe provider without flags stays direct');
  reset();
});

test('confirmProxyUse names the category reason when the direct request was not CORS-blocked', async () => {
  resetProxyConsent();
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: true, providers: true, articles: false } });
  let msg = '';
  setProxyConfirmHandler((m) => { msg = m; return true; });
  assert.equal(await confirmProxyUse('https://api.example.com/v1', 'providers', false), true);
  assert.ok(msg.startsWith('This provider API endpoint cannot be reached directly from the browser.'), 'providers reason uses its category label');
  resetProxyConsent();
  msg = '';
  await confirmProxyUse('http://10.0.0.5/', 'privateNet', false);
  assert.ok(msg.startsWith('This private network endpoint cannot be reached directly from the browser.'), 'privateNet reason uses its category label');
  setProxyConfirmHandler(null);
  reset();
});

test('buildProxyUrl supports base URLs with a templated {url} placeholder', () => {
  const target = 'https://example.com/a b';
  setProxyConfig({ enabled: true, baseUrl: 'https://relay.example/?u={url}&x=1', mode: 'always', categories: { articles: true } });
  assert.equal(
    buildProxyUrl('https://relay.example/?u={url}&x=1', target),
    `https://relay.example/?u=${encodeURIComponent(target)}&x=1`
  );
  reset();
});

// ── providers relay: special-use flag, unparsable target, plain 2xx ────────

test('providers relay annotates special-use targets with the allow-private flag', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  const seen = [];
  stubFetch([[
    (r) => { seen.push(r.url); return true; },
    () => jsonRes({})
  ]]);
  const out = await fetchViaProxy('http://169.254.169.254/latest/meta-data', undefined, 'providers');
  assert.ok(seen[0].includes('groundrumble_noredirect=1'), 'the relay contract flag is always declared');
  assert.ok(seen[0].includes('groundrumble_allow_private=1'), 'a special-use target declares the private-network allowance');
  assert.equal(out.res.status, 200, 'the plain 2xx response round-trips through the relay');
  assert.equal(out.base, PROXY, 'the result names the proxy base');
  reset();
});

test('providers relay forwards an unparsable target without the allow-private flag and returns the 2xx response', async () => {
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: false, providers: true, articles: false } });
  const seen = [];
  stubFetch([[
    (r) => { seen.push(r.url); return true; },
    () => jsonRes({})
  ]]);
  const out = await fetchViaProxy('::: not a url :::', undefined, 'providers');
  assert.ok(seen.length === 1 && seen[0].includes('groundrumble_noredirect=1'), 'the request is still relayed with the noredirect flag');
  assert.ok(!seen[0].includes('groundrumble_allow_private=1'), 'an unparsable target cannot be classified special-use');
  assert.equal(out.res.status, 200, 'a clean 2xx is surfaced to the caller');
  assert.equal(out.base, PROXY);
  reset();
});

test('confirmProxyUse falls back to the raw category as the reason label when it has no friendly name', async () => {
  resetProxyConsent();
  setProxyConfig({ enabled: true, baseUrl: PROXY, mode: 'fallback', categories: { privateNet: true, providers: true, articles: false } });
  let msg = '';
  setProxyConfirmHandler((m) => { msg = m; return true; });
  await confirmProxyUse('https://example.com/', 'registry', false);
  assert.ok(msg.startsWith('This registry endpoint cannot be reached directly from the browser.'), 'an unlabelled category uses its id verbatim');
  assert.ok(msg.includes('"https://example.com/"'), 'the target is still surfaced in the prompt');
  setProxyConfirmHandler(null);
  reset();
});

// ── testProxyConnection: standalone proxy-URL connectivity probe ────────────

test('testProxyConnection rejects an empty or whitespace-only base URL', async () => {
  await assert.rejects(testProxyConnection(''), { message: 'No proxy URL configured.' });
  await assert.rejects(testProxyConnection('   '), { message: 'No proxy URL configured.' });
});

test('testProxyConnection rejects an unparsable test target', async () => {
  await assert.rejects(
    testProxyConnection(PROXY, { targetUrl: '::: not a url :::' }),
    { message: 'Invalid test target URL.' }
  );
});

test('testProxyConnection maps network-layer failures to a reachability message', async () => {
  stubFetch([[
    (_unused) => true,
    () => { throw new TypeError('fetch failed'); }
  ]]);
  await assert.rejects(
    testProxyConnection(PROXY),
    { message: 'Could not reach the proxy URL — the request failed at the network level.' }
  );
});

test('testProxyConnection passes through non-TypeError relay errors', async () => {
  stubFetch([[
    (_unused) => true,
    () => { throw new Error('boom'); }
  ]]);
  await assert.rejects(testProxyConnection(PROXY), { message: 'boom' });
});

test('testProxyConnection refuses a 3xx relay answer naming the redirect location', async () => {
  stubFetch([[
    (_unused) => true,
    () => textRes('', 302, { location: 'https://evil.example/steal' })
  ]]);
  await assert.rejects(
    testProxyConnection(PROXY),
    { message: 'Proxy refused a redirect to "https://evil.example/steal"' }
  );
});

test('testProxyConnection refuses a redirect with no location header', async () => {
  stubFetch([[
    (_unused) => true,
    () => textRes('', 301)
  ]]);
  await assert.rejects(
    testProxyConnection(PROXY),
    { message: 'Proxy refused a redirect to an unknown destination' }
  );
});

test('testProxyConnection surfaces non-OK relay bodies as a redacted, bounded projection', async () => {
  const longBody = 'RELAY DOWN: ' + 'x'.repeat(900);
  stubFetch([[
    (_unused) => true,
    (req) => req.url.includes('short.example') ? textRes('RELAY DOWN', 503) : textRes(longBody, 502)
  ]]);
  await assert.rejects(
    testProxyConnection('https://short.example/fetch?url='),
    { message: 'Proxy HTTP 503: RELAY DOWN' }
  );
  await assert.rejects(
    testProxyConnection(PROXY),
    { message: 'Proxy HTTP 502: RELAY DOWN: [REDACTED_HIGH_ENTROPY]' }
  );
});

test('testProxyConnection flags an empty relay body as a content failure', async () => {
  stubFetch([[(_unused) => true, () => textRes('   ')]]);
  await assert.rejects(
    testProxyConnection(PROXY),
    { message: 'The proxy responded, but returned no content.' }
  );
});

test('testProxyConnection reports a successful relay round-trip with the built URL and relay contract headers', async () => {
  const body = '<html><title>Example</title></html>';
  const seen = [];
  stubFetch([[
    (r) => { seen.push(r); return true; },
    () => textRes(body)
  ]]);
  const out = await testProxyConnection(PROXY);
  assert.equal(out.status, 200, 'the relay status is reported');
  assert.equal(out.chars, body.length, 'the relay body length is reported');
  assert.equal(out.target, 'https://example.com/');
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url === PROXY + encodeURIComponent('https://example.com/'), 'the relay URL appends the encoded test target');
  assert.equal(seen[0].headers['x-groundrumble-target'], 'https://example.com/', 'relay request names the target');
  assert.equal(seen[0].headers['x-groundrumble-noredirect'], '1', 'relay request declares noredirect');
});

test('testProxyConnection times out when the relay never responds', async () => {
  await withFastTimers(async () => {
    stubFetch([[(_unused) => true, () => new Promise(() => { /* never settles */ })]]);
    await assert.rejects(
      testProxyConnection(PROXY, { timeout: 1 }),
      { message: 'Proxy test timed out after 1ms — the relay did not respond.' }
    );
  });
});
