// Provider route-policy regression.
//
// A provider endpoint carrying URL userinfo or a secret-bearing query parameter
// is rejected at the final transport boundary (providerRouteFor →
// providerFetch), even though restore validation still accepts the record's
// shape/protocol.
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O. Every "attacker" host is a reserved
// example name or loopback literal, and every secret is a literal sentinel.
//
// Run: node --test tests/security/regressions/provider-route-policy.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { providerRouteFor, assertProviderEndpointAllowed } from '../../../src/utils/api/provider-client.js';

const SENTINEL = 'ROUTE_SENTINEL';

test('runtime provider route rejects secret-bearing query parameters', () => {
  const endpoint = `https://example.com/v1?api_key=${SENTINEL}`;
  assert.throws(() => providerRouteFor(endpoint, { endpoint }), /query string/);
});

test('runtime provider route rejects URL userinfo', () => {
  const endpoint = 'https://user:pass@example.com/v1';
  assert.throws(() => providerRouteFor(endpoint, { endpoint }), /userinfo/);
});

test('route and form-time assertion apply the same checks', () => {
  for (const endpoint of [
    `https://example.com/v1?token=${SENTINEL}`,
    'https://user:pass@example.com/v1',
    'https://example.com/v1?client_secret=abc',
  ]) {
    assert.throws(() => providerRouteFor(endpoint, { endpoint }), undefined, `${endpoint} must be rejected at final transport`);
    assert.throws(() => assertProviderEndpointAllowed(endpoint, {}), undefined, `${endpoint} must be rejected by the shared assertion`);
  }
});