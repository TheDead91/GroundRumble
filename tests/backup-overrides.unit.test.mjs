import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRestoredOverrides, normalizeResultOverride } from '../src/utils/backup.js';

test('canonical override normalization keeps only verdict and a trimmed, redacted human reason', () => {
  assert.deepEqual(normalizeResultOverride({ verdict: 'SECURE' }), { verdict: 'SECURE', reason: '' });
  assert.deepEqual(normalizeResultOverride({ verdict: 'INCONCLUSIVE', reason: '  human uncertainty  ', unrelated: true }), { verdict: 'INCONCLUSIVE', reason: 'human uncertainty' });
  const normalized = normalizeResultOverride({ verdict: 'VULNERABLE', reason: 'Leaked sk-1234567890abcdef' });
  assert.match(normalized.reason, /REDACTED/);
  assert.doesNotMatch(normalized.reason, /sk-1234567890abcdef/);
});

test('restore accepts every supported replacement of either security verdict without changing the original', () => {
  for (const original of ['SECURE', 'VULNERABLE']) {
    for (const replacement of ['SECURE', 'VULNERABLE', 'INCONCLUSIVE']) {
      const known = new Map([['run-a-test', original]]);
      const overrides = Object.freeze({ 'run-a-test': { verdict: replacement, reason: 'Human review' } });
      assert.deepEqual(filterRestoredOverrides(overrides, known), { kept: overrides, dropped: 0 });
      assert.equal(known.get('run-a-test'), original);
    }
  }
});

test('restore drops overrides for technical, inconclusive, unknown and missing original statuses', () => {
  for (const original of ['ERROR', 'EMPTY', 'INCONCLUSIVE', 'RUNNING', 'UNKNOWN', '', null, undefined]) {
    for (const replacement of ['SECURE', 'VULNERABLE', 'INCONCLUSIVE']) {
      assert.deepEqual(filterRestoredOverrides({ 'run-a-test': { verdict: replacement, reason: '' } }, new Map([['run-a-test', original]])), {
        kept: {}, dropped: 1
      }, `${original} cannot be overridden to ${replacement}`);
    }
  }
  assert.deepEqual(filterRestoredOverrides({ 'deleted-a-test': { verdict: 'SECURE', reason: '' } }, new Map()), { kept: {}, dropped: 1 });
});

test('restore drops malformed replacement verdicts even for a known security result', () => {
  for (const replacement of ['SECURE', 'ERROR', 'EMPTY', 'secure', '', null, 1, {}, ['SECURE'], { verdict: 'ERROR' }, { verdict: 'SECURE', reason: 42 }]) {
    assert.deepEqual(filterRestoredOverrides({ 'run-a-test': replacement }, new Map([['run-a-test', 'VULNERABLE']])), {
      kept: {}, dropped: 1
    });
  }
});
