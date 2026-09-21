// Coverage of src/utils/api/provider-client.js — the branches the api-core
// suite never reaches: transport-policy throws (assertProviderEndpointAllowed /
// providerRouteFor), queryOpenAIProvider's bodyTemplate branch,
// extractByPath's array-index resolution, providerFetch's proxy consent path
// and error-mapping catch, parseHeaders' copy/invalid-JSON branches, and
// fetchProviderModels' remaining catalog response shapes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertProviderEndpointAllowed, providerRouteFor, queryOpenAIProvider,
  queryRawProvider, queryModel, testProvider, extractByPath, providerFetch, parseHeaders, fetchProviderModels
} from '../src/utils/api/provider-client.js';
import { setProxyConfig, setProxyConfirmHandler, resetProxyConsent, getConsentedProxyCategories } from '../src/utils/api/proxy.js';
import { jsonRes, stubFetch } from './helpers/httpx.mjs';

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => {
  globalThis.fetch = savedFetch;
  setProxyConfig({ enabled: false });
  resetProxyConsent();
});

const disableProxy = () => {
  setProxyConfig({ enabled: false });
  resetProxyConsent();
};

// ── transport policy: cleartext-transport gates ───────────────────────────

test('assertProviderEndpointAllowed rejects malformed URLs and non-HTTP transports', () => {
  assert.throws(
    () => assertProviderEndpointAllowed('not a url at all'),
    { message: 'Provider endpoint must be a valid URL.' }
  );
  assert.throws(
    () => assertProviderEndpointAllowed(''),
    { message: 'Provider endpoint must be a valid URL.' }
  );
  for (const endpoint of ['ftp://example.com/v1', 'file:///tmp/x', 'ws://example.com/v1']) {
    assert.throws(() => assertProviderEndpointAllowed(endpoint), { message: 'Provider endpoint must use HTTP or HTTPS.' }, endpoint);
  }
});

test('providerRouteFor rejects malformed endpoint URLs upfront', () => {
  assert.throws(
    () => providerRouteFor('not a url at all', {}),
    { message: 'Provider endpoint must be a valid URL.' },
    'an unparsable endpoint fails the route decision via the shared endpoint-policy gate'
  );
});

test('assertProviderEndpointAllowed rejects plain-HTTP transports unless approved', () => {
  assert.throws(
    () => assertProviderEndpointAllowed('http://example.com/v1'),
    { message: 'Insecure HTTP endpoint requires explicit approval.' }
  );
  assert.throws(
    () => assertProviderEndpointAllowed('http://93.184.216.34:8080/v1'),
    { message: 'Insecure HTTP endpoint requires explicit approval.' }
  );
  // The loopback/localhost family is special-use (blocked outright without
  // approval); with allowPrivate they pass WITHOUT an insecure-transport flag —
  // the cleartext gate exempts them by hostname.
  for (const endpoint of ['http://localhost:11434', 'http://127.0.0.1:8080']) {
    assert.throws(() => assertProviderEndpointAllowed(endpoint), { message: 'Private or loopback endpoint requires explicit approval.' });
    const url = assertProviderEndpointAllowed(endpoint, { allowPrivate: true });
    assert.equal(url.protocol, 'http:');
  }
  // Public HTTP requires transport approval, independently of private approval:
  const relaxed = assertProviderEndpointAllowed('http://example.com/v1', { allowInsecureTransport: true });
  assert.equal(relaxed.href, 'http://example.com/v1');
  assert.throws(() => assertProviderEndpointAllowed('http://example.com/v1', { allowPrivate: true }), /Insecure HTTP/);
});

test('providerRouteFor rejects plain HTTP and routes through the proxy when configured', () => {
  assert.throws(
    () => providerRouteFor('http://example.com/v1'),
    { message: 'Insecure HTTP endpoint requires explicit approval.' }
  );
  // allowInsecureTransport relaxes the transport gate (proxy still disabled here):
  assert.deepEqual(
    providerRouteFor('http://example.com/v1', { allowInsecureTransport: true }),
    { via: 'direct', url: 'http://example.com/v1' }
  );
  // With the proxy enabled for the providers category, CORS-blocked domains
  // are routed through the relay instead of direct.
  setProxyConfig({
    enabled: true, baseUrl: 'https://relay.example/?u={url}', mode: 'fallback', categories: { providers: true }
  });
  assert.deepEqual(
    providerRouteFor('https://generativelanguage.googleapis.com/v1/models', {}),
    { via: 'proxy', url: 'https://generativelanguage.googleapis.com/v1/models' }
  );
  assert.deepEqual(
    providerRouteFor('https://api.groq.com/v1', { allowPrivate: true }),
    { via: 'proxy', url: 'https://api.groq.com/v1' }
  );
  assert.deepEqual(providerRouteFor('https://api.groq.com/v1', {}), { via: 'direct', url: 'https://api.groq.com/v1' });
  disableProxy();
});

// ── queryOpenAIProvider bodyTemplate branch ────────────────────────────────

test('queryOpenAIProvider substitutes every placeholder of a bodyTemplate', async () => {
  const seen = [];
  stubFetch([[(r) => r.url.includes('/chat/completions'), (req) => {
    seen.push({ url: req.url, method: req.method, headers: req.headers, body: req.body });
    return jsonRes({ choices: [{ message: { content: 'REPLY' } }] });
  }]]);
  const cp = { id: 'p', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'sk-test' };
  const out = await queryOpenAIProvider(cp, 'm-1', 'SYS', 'USR', undefined, {
    bodyTemplate: '{"m":"{{model}}","s":"{{systemPrompt}}","u":"{{userPrompt}}","t":{{maxTokens}},"temp":{{temperature}},"json":{{jsonMode}}}',
    maxTokens: 512, temperature: 0.5, jsonMode: true
  });
  assert.equal(out, 'REPLY');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://gw/v1/chat/completions');
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers.Authorization, 'Bearer sk-test');
  assert.equal(seen[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(seen[0].body, { m: 'm-1', s: 'SYS', u: 'USR', t: 512, temp: 0.5, json: true });

  // Without explicit options the template falls back to the documented
  // defaults (4096 tokens, temperature 0, jsonMode off).
  await queryOpenAIProvider(cp, 'm-1', 'SYS', 'USR', undefined, {
    bodyTemplate: '{"t":{{maxTokens}},"temp":{{temperature}},"json":{{jsonMode}}}'
  });
  assert.deepEqual(seen[1].body, { t: 4096, temp: 0, json: false });
});

// ── queryOpenAIProvider error mapping and normalization ────────────────────

test('queryOpenAIProvider maps a status payload to Provider Error with the JSON error.message', async () => {
  stubFetch([[_unused => true, () => jsonRes({ error: { message: 'insufficient_quota' } }, 400)]]);
  const cp = { id: 'p', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'sk-test' };
  await assert.rejects(
    queryOpenAIProvider(cp, 'm', 'S', 'U'),
    { message: 'Provider Error (HTTP 400): insufficient_quota' }
  );
  // JSON fallback: a top-level `message` field is used when `error.message` is absent.
  stubFetch([[_unused => true, () => jsonRes({ message: 'plain top-level' }, 400)]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    { message: 'Provider Error (HTTP 400): plain top-level' }
  );
});

test('queryOpenAIProvider passes the fetch-retry rate-limit message through untouched', async () => {
  stubFetch([[_unused => true, () => jsonRes({ error: { message: 'quota' } }, 429)]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    { message: 'Rate limit reached (HTTP 429)' },
    'a 429 is signalled by fetch-retry itself, so it must not be re-labeled as Provider Error'
  );
});

test('queryOpenAIProvider falls back to a generic Status message for empty payloads', async () => {
  stubFetch([[_unused => true, () => jsonRes({}, 500)]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    { message: 'Provider Error (HTTP 500): {}' }
  );
});

test('queryOpenAIProvider normalizes an error with an empty message to Unknown error', async () => {
  stubFetch([[_unused => true, () => { throw new Error(''); }]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    { message: 'Unknown error' }
  );
  stubFetch([[_unused => true, () => { throw new Error('undefined'); }]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    { message: 'Unknown error' }
  );
});

test('queryOpenAIProvider rethrows a cancelled fetch as-is', async () => {
  stubFetch([[_unused => true, () => { throw new DOMException('Aborted', 'AbortError'); }]]);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U'),
    (e) => e instanceof DOMException && e.name === 'AbortError'
  );
});

test('queryOpenAIProvider defaults the model to the first catalog entry and omits systemPrompt/jsonMode', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.body); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  const cp = { id: 'p', connector: 'openai', endpoint: 'https://gw/v1', models: ['cat-model'] };
  await queryOpenAIProvider(cp, '', '', 'USER');
  assert.equal(seen[0].model, 'cat-model', 'empty model falls back to the catalog first entry');
  assert.deepEqual(seen[0].messages, [{ role: 'user', content: 'USER' }], 'no systemPrompt → no system message');
  assert.ok(!('response_format' in seen[0]), 'jsonMode off → no response_format');
  assert.equal(seen[0].max_tokens, 4096, 'default maxTokens');
});

test('queryOpenAIProvider omits the Authorization header when the provider has no apiKey', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.headers); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  await queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U');
  assert.ok(!('Authorization' in seen[0]), 'no bogus empty Bearer credential is sent');
});

test('queryOpenAIProvider sends an empty model when neither model nor catalog is available', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.body); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  await queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, '', 'S', 'U');
  assert.equal(seen[0].model, '', 'no model and no catalog → the request carries an empty model id');
});

test('queryOpenAIProvider sets response_format json_object when jsonMode is on', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.body); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  await queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U', undefined, { jsonMode: true });
  assert.deepEqual(seen[0].response_format, { type: 'json_object' });
});

test('queryOpenAIProvider rethrows the caller abort reason captured during the fetch', async () => {
  const reason = new Error('stopped mid-request');
  const ac = new AbortController();
  ac.abort(reason);
  await assert.rejects(
    queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://gw/v1' }, 'm', 'S', 'U', ac.signal),
    (e) => e === reason,
    'a cancellation signalled during transport must not be persisted as a technical failure'
  );
});

test('queryRawProvider rethrows the caller abort reason captured during the fetch', async () => {
  const reason = new Error('stop');
  const ac = new AbortController();
  ac.abort(reason);
  await assert.rejects(
    queryRawProvider({ id: 'r', connector: 'raw', endpoint: 'https://raw/api' }, 'm', 'S', 'U', ac.signal, { bodyTemplate: '{"u":"{{userPrompt}}"}' }),
    (e) => e === reason
  );
});

// ── queryRawProvider error normalization ───────────────────────────────────

test('queryRawProvider maps raw status payloads and normalizes empty messages', async () => {
  const cp = { id: 'r', connector: 'raw', endpoint: 'https://raw/api' };
  const opts = { bodyTemplate: '{"u":"{{userPrompt}}"}' };
  stubFetch([[_unused => true, () => jsonRes({ message: 'backend refused' }, 400)]]);
  await assert.rejects(
    queryRawProvider(cp, 'm', 'S', 'U', undefined, opts),
    { message: 'backend refused' }
  );
  stubFetch([[_unused => true, () => { throw new Error(''); }]]);
  await assert.rejects(
    queryRawProvider(cp, 'm', 'S', 'U', undefined, opts),
    { message: 'Unknown error' }
  );
  stubFetch([[_unused => true, () => jsonRes({}, 500)]]);
  await assert.rejects(
    queryRawProvider(cp, 'm', 'S', 'U', undefined, opts),
    { message: 'Provider Error: 500' }
  );
});

// ── extractByPath ──────────────────────────────────────────────────────────

test('extractByPath resolves array indices and propagates nullish values', () => {
  assert.equal(extractByPath({ choices: [{ message: { content: 'X' } }] }, 'choices.0.message.content'), 'X');
  // A non-numeric segment on an array yields the array itself untouched.
  assert.deepEqual(extractByPath({ a: ['v'] }, 'a.foo'), ['v']);
  assert.deepEqual(extractByPath({ a: [{ b: 'deep' }] }, 'a.0.b'), 'deep');
  // Nullish intermediates propagate instead of throwing.
  assert.equal(extractByPath({ a: null }, 'a.b'), null);
  assert.equal(extractByPath({}, 'a.b'), undefined);
  assert.equal(extractByPath({ a: { b: 1 } }, 'a.b'), 1);
  // No path → the object itself.
  const obj = { a: 1 };
  assert.equal(extractByPath(obj, ''), obj);
});

// ── providerFetch: proxy consent path ──────────────────────────────────────

const CORS_BLOCKED = 'https://generativelanguage.googleapis.com/v1/models';
const RELAY_BASE = 'https://relay.example/?u={url}';

test('providerFetch falls back to the direct fetch when proxy consent is declined', async () => {
  disableProxy();
  setProxyConfig({ enabled: true, baseUrl: RELAY_BASE, mode: 'fallback', categories: { providers: true } });
  setProxyConfirmHandler(async () => false);
  const seen = [];
  stubFetch([[(r) => r.url.includes('generativelanguage.googleapis.com'), (req) => {
    seen.push(req.url);
    return jsonRes({ direct: true });
  }]]);
  const res = await providerFetch(CORS_BLOCKED, {}, { method: 'GET' }, { retries: 0 });
  assert.deepEqual(await res.json(), { direct: true });
  assert.deepEqual(seen, [CORS_BLOCKED], 'declined consent must fetch the target directly, never the relay');
  disableProxy();
});

test('providerFetch relays consented provider calls through the configured proxy', async () => {
  disableProxy();
  setProxyConfig({ enabled: true, baseUrl: RELAY_BASE, mode: 'fallback', categories: { providers: true } });
  setProxyConfirmHandler(async () => true);
  const seen = [];
  stubFetch([[(r) => r.url.includes('relay.example'), (req) => {
    seen.push(req);
    return jsonRes({ relayed: true });
  }]]);
  const init = { method: 'POST', headers: { Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: '{"x":1}' };
  const res = await providerFetch(CORS_BLOCKED, {}, init, { retries: 7 });
  assert.deepEqual(await res.json(), { relayed: true });
  assert.equal(seen.length, 1);
  const relayedUrl = RELAY_BASE.replace('{url}', encodeURIComponent(CORS_BLOCKED)) + '&groundrumble_noredirect=1';
  assert.equal(seen[0].url, relayedUrl);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['x-groundrumble-target'], CORS_BLOCKED);
  assert.equal(seen[0].headers['x-groundrumble-noredirect'], '1');
  assert.equal(seen[0].headers.Authorization, 'Bearer k', 'init headers must be forwarded to the relay');
  assert.deepEqual(seen[0].body, { x: 1 });
  assert.equal(getConsentedProxyCategories().has('providers'), true, 'consent must be remembered for the session');
  disableProxy();
});

// ── providerFetch: error-mapping catch ─────────────────────────────────────

test('providerFetch maps a CORS TypeError to proxy advice only when no proxy is configured', async () => {
  disableProxy();
  // The TypeError('Failed to fetch') escapes fetchWithRetry as a plain Error,
  // so the advice branch is reached via the relay's raw fetch seam: the
  // consent handler observes the proxy being withdrawn mid-flight and the
  // browser-level CORS failure surfaces to the catch.
  setProxyConfig({ enabled: true, baseUrl: RELAY_BASE, mode: 'fallback', categories: { providers: true } });
  setProxyConfirmHandler(async () => {
    setProxyConfig({ enabled: false });
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    providerFetch(CORS_BLOCKED, {}, { method: 'GET' }, { retries: 0 }),
    { message: 'CORS blocked: This provider blocks browser requests. Configure a proxy in Settings to use it.' }
  );

  // Contrast: with the proxy genuinely disabled the same browser failure
  // reaches the catch as a plain Error and passes its real message through.
  stubFetch([[_unused => true, () => { throw new TypeError('Failed to fetch'); }]]);
  await assert.rejects(
    providerFetch('https://api.groq.com/v1/models', {}, { method: 'GET' }, { retries: 0 }),
    { message: 'Failed to fetch' }
  );
  disableProxy();
});

test('providerFetch passes non-CORS failures through with their real messages', async () => {
  disableProxy();
  // An unparsable endpoint makes the shared endpoint-policy gate throw before any fetch.
  await assert.rejects(
    providerFetch('not a url at all', {}, { method: 'GET' }),
    { message: 'Provider endpoint must be a valid URL.' }
  );
  // A consented relay with no base URL configured: fetchViaProxy's contract
  // error must surface verbatim.
  setProxyConfig({ enabled: true, baseUrl: '', mode: 'fallback', categories: { providers: true } });
  setProxyConfirmHandler(async () => true);
  await assert.rejects(
    providerFetch(CORS_BLOCKED, {}, { method: 'GET' }, { retries: 0 }),
    { message: 'No proxy URL configured.' }
  );
  disableProxy();
});

test('providerFetch never throws a bare undefined message', async () => {
  disableProxy();
  setProxyConfig({ enabled: true, baseUrl: RELAY_BASE, mode: 'fallback', categories: { providers: true } });
  setProxyConfirmHandler(async () => true);
  stubFetch([[_unused => true, () => { throw 'undefined'; }]]);
  await assert.rejects(
    providerFetch(CORS_BLOCKED, {}, { method: 'GET' }, { retries: 0 }),
    { message: 'Unknown error' }
  );
  disableProxy();
});

// ── parseHeaders ───────────────────────────────────────────────────────────

test('parseHeaders copies objects and tolerates unparsable JSON', () => {
  const src = { 'X-A': '1' };
  const out = parseHeaders(src);
  assert.deepEqual(out, { 'X-A': '1' });
  out['X-B'] = '2';
  assert.ok(!('X-B' in src), 'an object input must be copied, not referenced');

  assert.deepEqual(parseHeaders('{bad json'), {});
  assert.deepEqual(parseHeaders('{"k":"v"}'), { k: 'v' });
  assert.deepEqual(parseHeaders(''), {});
  assert.deepEqual(parseHeaders('   '), {});
  assert.deepEqual(parseHeaders(null), {});
  assert.deepEqual(parseHeaders(undefined), {});
});

// ── fetchProviderModels catalog shapes ─────────────────────────────────────

test('fetchProviderModels maps the remaining catalog response shapes', async () => {
  const cp = { endpoint: 'https://h/v1', connector: 'openai' };
  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({ models: [{ id: 'models/gemini-x' }, { name: 'named-model' }, { id: '' }] })]]);
  assert.deepEqual(await fetchProviderModels(cp), ['gemini-x', 'named-model']);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes([{ id: 'a' }, { name: 'b' }, { id: 'models/c' }, {}])]]);
  assert.deepEqual(await fetchProviderModels(cp), ['a', 'b', 'c']);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({ unexpected: true })]]);
  assert.deepEqual(await fetchProviderModels(cp), []);

  stubFetch([[(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: '' }, { id: 0 }, { id: 'models/k' }, {}] })]]);
  assert.deepEqual(await fetchProviderModels(cp), ['k'], 'empty and non-string ids in data.data are dropped');
});

// ── fetchProviderModels error paths ────────────────────────────────────────

test('fetchProviderModels re-throws plain failures without re-wrapping', async () => {
  stubFetch([[_unused => true, () => { throw new Error('load failed'); }]]);
  await assert.rejects(
    fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }),
    { message: 'load failed' }
  );
});

test('fetchProviderModels normalizes empty-message failures to Unknown error', async () => {
  stubFetch([[_unused => true, () => { throw new Error(''); }]]);
  await assert.rejects(
    fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }),
    { message: 'Unknown error' }
  );
});

test('fetchProviderModels prefixes status-bearing failures as Models endpoint HTTP <code>', async () => {
  stubFetch([[_unused => true, () => jsonRes({}, 403)]]);
  await assert.rejects(
    fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }),
    { message: 'Models endpoint HTTP 403: {}' }
  );
  stubFetch([[_unused => true, () => jsonRes({ detail: 'forbidden' }, 403)]]);
  await assert.rejects(
    fetchProviderModels({ endpoint: 'https://h/v1', connector: 'openai' }),
    { message: 'Models endpoint HTTP 403: {"detail":"forbidden"}' }
  );
});

// ── testProvider: raw connector abort and non-ok handling ──────────────────

test('testProvider raw connector rethrows the abort reason during a probe', async () => {
  const reason = new Error('probe aborted');
  const ac = new AbortController();
  ac.abort(reason);
  await assert.rejects(
    testProvider({ connector: 'raw', endpoint: 'https://raw', apiKey: 'k' }, ac.signal),
    (e) => e === reason,
    'gating must not swallow the caller cancellation reason'
  );
});

test('testProvider raw connector surfaces a non-ok probe status via the transport message', async () => {
  stubFetch([[_unused => true, () => jsonRes({}, 500)]]);
  await assert.rejects(
    testProvider({ connector: 'raw', endpoint: 'https://raw' }),
    { message: 'Connection failed: HTTP 500: {}' }
  );
});

// ── queryModel option merge ────────────────────────────────────────────────

test('queryModel spreads a custom maxTokens override into the OpenAI request', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.body); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  const cp = { id: 'p', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' };
  await queryModel('p', 'm', 'S', 'U', [cp], undefined, { maxTokens: 77, temperature: 0.5 });
  assert.equal(seen[0].max_tokens, 77, 'the caller maxTokens must reach the request body');
  assert.equal(seen[0].temperature, 0.5);
});

test('queryModel defaults maxTokens to 300 when the caller passes none', async () => {
  const seen = [];
  stubFetch([[_unused => true, (req) => { seen.push(req.body); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  const cp = { id: 'p', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' };
  await queryModel('p', 'm', 'S', 'U', [cp]);
  assert.equal(seen[0].max_tokens, 300, 'the audit-runner default of 300 tokens is the fallback');
});

// ── testProvider: probe status and abort plumbing ──────────────────────────

test('testProvider reports a network-level chat failure through mapChatFailure', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'A' }] })],
    [(r) => r.url.includes('/chat/completions'), () => { throw new TypeError('Failed to fetch'); }],
  ]);
  await assert.rejects(
    testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }),
    { message: 'Chat test failed: Failed to fetch' },
    'an unclassifiable probe failure (no HTTP status) yields Chat test failed'
  );
});

test('testProvider authenticates via a configured header even with an empty apiKey', async () => {
  const seen = [];
  stubFetch([
    [(r) => r.url.includes('/models'), (req) => { seen.push(['models', req.headers.Authorization]); return jsonRes({ data: [{ id: 'A' }] }); }],
    [(r) => r.url.includes('/chat/completions'), (req) => { seen.push(['chat', req.headers.Authorization]); return jsonRes({}, 200); }],
  ]);
  const cp = { endpoint: 'https://h/v1', headers: '{"Authorization":"Bearer header-auth"}' };
  const r = await testProvider(cp);
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [['models', 'Bearer header-auth'], ['chat', 'Bearer header-auth']], 'the configured Authorization header is used, not an empty Bearer prefix');
});

test('testProvider rethrows the models-phase abort reason', async () => {
  const reason = new Error('vault changed');
  const ac = new AbortController();
  ac.abort(reason);
  await assert.rejects(
    testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }, ac.signal),
    { message: 'vault changed' },
    'an abort during model discovery must surface to the caller, not a technical failure'
  );
});

test('testProvider propagates a chat-probe abort raised mid-flight across the retry layer', async () => {
  const ac = new AbortController();
  const reason = new Error('stop probing');
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'A' }] })],
    [(r) => r.url.includes('/chat/completions'), () => new Promise((_, reject) => {
      ac.signal.addEventListener('abort', () => reject(ac.signal.reason), { once: true });
      queueMicrotask(() => ac.abort(reason));
    })],
  ]);
  await assert.rejects(
    testProvider({ endpoint: 'https://h/v1', apiKey: 'k' }, ac.signal),
    (e) => e === reason,
    'an abort while the chat probe is awaiting transport must not be converted into a probe-status outcome'
  );
});

test('testProvider falls back to the transport error when an abort carries no reason', async () => {
  const ac = new AbortController();
  stubFetch([[_unused => true, () => new Promise((_, reject) => {
    ac.signal.addEventListener('abort', () => reject(ac.signal.reason ?? new DOMException('Aborted', 'AbortError')), { once: true });
    queueMicrotask(() => ac.abort(null));
  })]]);
  await assert.rejects(
    testProvider({ endpoint: 'https://r/raw', connector: 'raw', method: 'POST' }, ac.signal),
    (e) => e instanceof DOMException && e.name === 'AbortError',
    'a reason-less abort still surfaces as an abort, not as a false Connection failed diagnosis'
  );
});
