// Coverage of src/utils/providerSecret.js — the plaintext-vault
// warning trigger (best-effort credential detection in a provider draft) and
// the insecure-transport enable-decision predicate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerCarriesSecret, providerNeedsInsecureTransportConfirmation } from '../src/utils/providerSecret.js';

test('providerCarriesSecret detects a non-empty API key', () => {
  assert.equal(providerCarriesSecret({ apiKey: 'sk-abc' }), true);
  assert.equal(providerCarriesSecret({ apiKey: '   ' }), false);
  assert.equal(providerCarriesSecret({}), false);
});

test('providerCarriesSecret detects secret-named and secret-valued headers', () => {
  assert.equal(providerCarriesSecret({ headers: '{"Authorization":"Bearer abc"}' }), true);
  assert.equal(providerCarriesSecret({ headers: '{"x-api-key":"abc"}' }), true);
  // Secret value under a non-secret name (known prefix shape).
  assert.equal(providerCarriesSecret({ headers: '{"X-Custom":"sk-abcdef123456"}' }), true);
  // Non-secret header only.
  assert.equal(providerCarriesSecret({ headers: '{"Content-Type":"application/json"}' }), false);
});

test('providerCarriesSecret preserves provider-token case and boundary matching', () => {
  assert.equal(providerCarriesSecret({ headers: '{"X-Custom":"prefix sk-abcdef suffix"}' }), true);
  assert.equal(providerCarriesSecret({ headers: '{"X-Custom":"prefix SK-abcdef suffix"}' }), false);
  assert.equal(providerCarriesSecret({ headers: '{"X-Custom":"ask-abcdef"}' }), false);
});

test('providerCarriesSecret detects a raw-connector bodyTemplate carrying a token', () => {
  // A raw relay/gateway whose only secret lives in the request body, with
  // empty apiKey/headers.
  assert.equal(providerCarriesSecret({ bodyTemplate: '{"token":"Xy7-2kQ9Lm8nPq3rT"}' }), true);
  assert.equal(providerCarriesSecret({ bodyTemplate: '{"auth_token":"abc123"}' }), true);
  assert.equal(providerCarriesSecret({ bodyTemplate: '{"authorization":"Bearer sk-abcdef123456"}' }), true);
});

test('providerCarriesSecret tolerates falsy and malformed inputs', () => {
  assert.equal(providerCarriesSecret(null), false, 'null provider → no secret');
  assert.equal(providerCarriesSecret(undefined), false, 'undefined provider → no secret');
  assert.equal(providerCarriesSecret(42), false, 'non-object provider → no secret');
  assert.equal(providerCarriesSecret({ headers: '' }), false, 'empty headers string parses as {}');
  assert.equal(providerCarriesSecret({ headers: null }), false, 'null headers parses as {}');
  assert.equal(providerCarriesSecret({ headers: '{bad json' }), false, 'unparsable headers JSON is ignored without a false positive');
  assert.equal(providerCarriesSecret({ headers: { 'X-Keep': 'plain' } }), false, 'object headers skip the JSON parse without crashing');
});

test('providerCarriesSecret does not false-positive on a standard bodyTemplate', () => {
  const template = '{"model":"{{model}}","max_tokens":{{maxTokens}},"messages":[{"role":"system","content":"{{systemPrompt}}"},{"role":"user","content":"{{userPrompt}}"}]}';
  assert.equal(providerCarriesSecret({ bodyTemplate: template }), false);
});

test('providerNeedsInsecureTransportConfirmation gates cleartext-HTTP providers with secrets', () => {
  // Cleartext HTTP + a secret → confirmation required (enable/auto-enable blocked).
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://fast-relay.example/v1', apiKey: 'sk-abc' }), true);
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'https://fast-relay.example/v1', modelsEndpoint: 'http://models.example/v1', apiKey: 'sk-abc' }), true);
  // Cleartext HTTP without a secret → one-click flow preserved.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://fast-relay.example/v1' }), false);
  // HTTPS with a secret → one-click flow preserved.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'https://fast-relay.example/v1', apiKey: 'sk-abc' }), false);
  // Loopback/.localhost HTTP (local Ollama) with a secret → exempt.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://127.0.0.1:11434', apiKey: 'sk-abc' }), false);
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://localhost:11434', apiKey: 'sk-abc' }), false);
  // Malformed / missing providers never require confirmation.
  assert.equal(providerNeedsInsecureTransportConfirmation(null), false);
  assert.equal(providerNeedsInsecureTransportConfirmation({}), false);
});
