import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProviderEndpointAllowed, providerRouteFor, testProvider, fetchProviderModels } from '../src/utils/api/provider-client.js';
import { setProxyConfig, resetProxyConsent } from '../src/utils/api/proxy.js';

const provider = {
  connector: 'openai', apiKey: 'dummy-test-key',
  endpoint: 'http://192.168.1.84:8787/v1/chat/completions',
  modelsEndpoint: 'http://192.168.1.84:8787/v1/models',
  allowPrivate: true, allowInsecureTransport: false
};

test('private and transport approvals are independent at validation and routing', () => {
  setProxyConfig({ enabled: false });
  for (const check of [assertProviderEndpointAllowed, providerRouteFor]) {
    for (const endpoint of [provider.endpoint, provider.modelsEndpoint, 'http://10.0.0.1/v1', 'http://printer.local/v1']) {
      assert.throws(() => check(endpoint), /Private or loopback/);
      assert.throws(() => check(endpoint, { allowInsecureTransport: true }), /Private or loopback/);
      for (const approval of [undefined, false, 'true', 1]) {
        assert.throws(() => check(endpoint, { allowPrivate: true, allowInsecureTransport: approval }), /Insecure HTTP/);
      }
      assert.doesNotThrow(() => check(endpoint, { allowPrivate: true, allowInsecureTransport: true }));
    }
    assert.throws(() => check('http://example.com/v1', { allowPrivate: true }), /Insecure HTTP/);
    assert.doesNotThrow(() => check('http://example.com/v1', { allowInsecureTransport: true }));
    assert.doesNotThrow(() => check('https://192.168.1.84/v1', { allowPrivate: true }));
    for (const host of ['localhost', 'app.localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
      assert.doesNotThrow(() => check(`http://${host}/v1`, { allowPrivate: true }));
    }
  }
});

test('unapproved HTTP probes and model refreshes never reach the target or proxy', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith('/models') ? { data: [{ id: 'test-model' }] } : { choices: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    for (const enabled of [false, true]) {
      setProxyConfig({ enabled, baseUrl: 'https://relay.example/?u={url}', mode: 'always', categories: { providers: true, privateNet: true } });
      resetProxyConsent();
      for (const credentials of [{ apiKey: 'dummy-test-key' }, { apiKey: '', headers: '{"X-Secret":"dummy-secret"}' }, { apiKey: '' }]) {
        const cp = { ...provider, ...credentials };
        await assert.rejects(testProvider(cp), /Insecure HTTP/);
        await assert.rejects(fetchProviderModels(cp), /Insecure HTTP/);
        await assert.rejects(testProvider({ ...cp, modelsEndpoint: '' }), /Insecure HTTP/);
        await assert.rejects(testProvider({ ...cp, connector: 'raw', bodyTemplate: '{"input":"{{userPrompt}}"}' }), /Insecure HTTP/);
      }
      assert.deepEqual(calls, []);
    }
    setProxyConfig({ enabled: false });
    const result = await testProvider({ ...provider, allowInsecureTransport: true });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [provider.modelsEndpoint, provider.endpoint]);
    calls.length = 0;
    await assert.rejects(testProvider(provider), /Insecure HTTP/);
    assert.deepEqual(calls, []);

    // Discovery may use approved HTTPS, but the following HTTP chat must be blocked.
    const httpsModels = provider.modelsEndpoint.replace('http:', 'https:');
    await assert.rejects(testProvider({ ...provider, modelsEndpoint: httpsModels }), /Insecure HTTP/);
    assert.deepEqual(calls, [httpsModels]);
    calls.length = 0;
    await assert.rejects(testProvider({ ...provider, endpoint: provider.endpoint.replace('http:', 'https:') }), /Insecure HTTP/);
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = previousFetch;
    setProxyConfig({ enabled: false });
    resetProxyConsent();
  }
});
