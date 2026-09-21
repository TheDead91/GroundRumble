import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProviderEndpointAllowed, resolveOpenAIEndpoint, deriveModelsEndpoint } from '../src/utils/api.js';

test('provider endpoint policy rejects canonical hexadecimal IPv6 special-use ranges', () => {
  const blocked = [
    'http://[::ffff:c0a8:101]/', // mapped private
    'http://[::c0a8:101]/', // compatible private
    'http://[2001:db8::1]/', // documentation
    'http://[2001:2::1]/', // benchmarking
    'http://[2001:10::1]/', // orchid
    'http://[3fff::1]/', // reserved documentation
    'http://[5f00::1]/', // reserved
    'http://[100::1]/' // discard-only
  ];
  for (const endpoint of blocked) {
    assert.throws(() => assertProviderEndpointAllowed(endpoint), /explicit approval/i, endpoint);
    assert.doesNotThrow(() => assertProviderEndpointAllowed(endpoint, { allowPrivate: true, allowInsecureTransport: true }), endpoint);
  }
  assert.doesNotThrow(() => assertProviderEndpointAllowed('https://[2001:4860:4860::8888]/'));
});

test('endpoint normalization accepts base, plural and singular chat paths', () => {
  const cases = [
    ['http://localhost:8787/v1/chat/completion', 'http://localhost:8787/v1/chat/completions', 'http://localhost:8787/v1/models'],
    ['http://localhost:8787/v1/chat/completions', 'http://localhost:8787/v1/chat/completions', 'http://localhost:8787/v1/models'],
    ['http://localhost:8787/v1', 'http://localhost:8787/v1/chat/completions', 'http://localhost:8787/v1/models'],
    ['http://localhost:8787', 'http://localhost:8787/chat/completions', 'http://localhost:8787/models']
  ];
  for (const [input, chat, models] of cases) {
    const r = resolveOpenAIEndpoint({ endpoint: input, connector: 'openai' });
    assert.equal(r.chatEndpoint, chat, input);
    assert.equal(r.modelsEndpoint, models, input);
  }
});

test('deriveModelsEndpoint honors an explicit override', () => {
  const r = deriveModelsEndpoint({ endpoint: 'http://h/v1/chat/completions', connector: 'openai', modelsEndpoint: 'http://h/custom-models' });
  assert.equal(r, 'http://h/custom-models');
});

test('raw connectors are left untouched', () => {
  const r = resolveOpenAIEndpoint({ endpoint: 'http://h/api/generate', connector: 'raw' });
  assert.equal(r.chatEndpoint, 'http://h/api/generate');
  assert.equal(r.modelsEndpoint, '');
});
