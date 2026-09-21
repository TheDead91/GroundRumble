import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIPv6 } from '../src/utils/endpoint-policy.js';

test('IPv6 endpoint policy handles canonical special-use literals efficiently', () => {
  const samples = ['::ffff:c0a8:101', '::c0a8:101', '2001:db8::1', '2001:2::1', '2001:10::1', '3fff::1', '5f00::1', '2001:4860:4860::8888'];
  const started = performance.now();
  for (let i = 0; i < 10000; i += 1) for (const sample of samples) isBlockedIPv6(sample);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1000, `classification benchmark exceeded 1s: ${elapsed.toFixed(1)}ms`);
});
