import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { stubFetch, jsonRes } = await import('./helpers/httpx.mjs');
const { testProvider, queryOpenAIProvider } = await import('../src/utils/api/provider-client.js');

let savedFetch;
before(() => { savedFetch = globalThis.fetch; });
after(() => { globalThis.fetch = savedFetch; });

test('Keyless custom provider with successful connectivity passes', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [{ id: 'local-model' }] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 200)],
  ]);
  const r = await testProvider({ endpoint: 'https://local/v1', apiKey: '' });
  assert.equal(r.ok, true);
  assert.match(r.chatStatus, /reachable/);
  assert.doesNotMatch(r.chatStatus, /authenticated/, 'no-key success is not called authenticated');
});

test('No-key request sends no bogus authentication', async () => {
  const seen = [];
  stubFetch([
    [(r) => r.url.includes('/models'), (req) => { seen.push(['models', { ...req.headers }]); return jsonRes({ data: [] }); }],
    [(r) => r.url.includes('/chat/completions'), (req) => { seen.push(['chat', { ...req.headers }]); return jsonRes({}, 200); }],
  ]);
  await testProvider({ endpoint: 'https://local/v1', apiKey: '' });
  for (const [phase, headers] of seen) {
    assert.ok(!('Authorization' in headers), `${phase} probe omits Authorization when no key is configured`);
  }
  stubFetch([[() => true, (req) => { seen.push(['query', { ...req.headers }]); return jsonRes({ choices: [{ message: { content: 'R' } }] }); }]]);
  await queryOpenAIProvider({ id: 'p', connector: 'openai', endpoint: 'https://local/v1', apiKey: '' }, 'm', 'S', 'U');
  assert.ok(!('Authorization' in seen.at(-1)[1]), 'query omits Authorization when no key is configured');
});

test('Keyed provider keeps sending expected authentication', async () => {
  const seen = [];
  stubFetch([
    [(r) => r.url.includes('/models'), (req) => { seen.push(req.headers.Authorization); return jsonRes({ data: [] }); }],
    [(r) => r.url.includes('/chat/completions'), (req) => { seen.push(req.headers.Authorization); return jsonRes({}, 200); }],
  ]);
  const r = await testProvider({ endpoint: 'https://gw/v1', apiKey: 'sk-live' });
  assert.equal(r.ok, true);
  assert.match(r.chatStatus, /authenticated/);
  assert.deepEqual(seen, ['Bearer sk-live', 'Bearer sk-live']);
});

test('Provider authentication failure remains a visible failure', async () => {
  stubFetch([
    [(r) => r.url.includes('/models'), () => jsonRes({ data: [] })],
    [(r) => r.url.includes('/chat/completions'), () => jsonRes({}, 401)],
  ]);
  await assert.rejects(testProvider({ endpoint: 'https://gw/v1', apiKey: '' }), /Authentication failed \(HTTP 401\)/);
  await assert.rejects(testProvider({ endpoint: 'https://gw/v1', apiKey: 'sk-bad' }), /Authentication failed \(HTTP 401\)/);
});

test('Genuinely missing required configuration remains invalid', async () => {
  await assert.rejects(testProvider({ endpoint: '', apiKey: '' }), /Models check failed/);
});
