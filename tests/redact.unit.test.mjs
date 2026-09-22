// Coverage of src/utils/redact.js — best-effort secret scrubbing for the
// console/persistence choke points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText, redactNotificationText } from '../src/utils/redact.js';

test('redactSensitiveText scrubs auth schemes, known prefixes, labels, and long runs', () => {
  assert.equal(redactSensitiveText('Authorization: Bearer abcDEF123._-'), 'Authorization: [REDACTED_AUTH]');
  assert.match(redactSensitiveText('failed with sk-abcdef123456'), /\[REDACTED_KEY\]/);
  assert.match(redactSensitiveText('apiKey: someValue'), /apiKey:=\[REDACTED\]/);
  assert.equal(redactSensitiveText('a'.repeat(40)), '[REDACTED_HIGH_ENTROPY]');
});

test('redactSensitiveText leaves short, unrecognized runs untouched (best-effort)', () => {
  const short = 'invalid token Xy7-2kQ9Lm';
  assert.equal(redactSensitiveText(short), short);
});

test('redactSensitiveText preserves provider-token case and boundary matching', () => {
  assert.equal(redactSensitiveText('prefix sk-abcdef suffix'), 'prefix [REDACTED_KEY] suffix');
  assert.equal(redactSensitiveText('prefix SK-abcdef suffix'), 'prefix SK-abcdef suffix');
  assert.equal(redactSensitiveText('ask-abcdef'), 'ask-abcdef');
});

test('redactNotificationText replaces short 16–39 char token runs', () => {
  assert.equal(
    redactNotificationText('relay returned Xy7-2kQ9Lm-abc123xyz'),
    'relay returned [REDACTED_TOKEN]'
  );
});

test('redactNotificationText preserves benign URL and hostname prose byte-identically', () => {
  const msg = 'see https://example.com/some/path for details about example.com';
  const out = redactNotificationText(msg);
  assert.equal(out, msg, 'benign URL and hostname prose is preserved unchanged');
});

test('redactNotificationText leaves short tokens and placeholder text alone', () => {
  assert.equal(redactNotificationText('hello world'), 'hello world');
  // 12-char tokens are below the 16-char notification threshold.
  assert.equal(redactNotificationText('key Xy7-2kQ9Lm'), 'key Xy7-2kQ9Lm');
});

test('both redactors coerce nullish input to an empty string', () => {
  assert.equal(redactSensitiveText(null), '');
  assert.equal(redactSensitiveText(undefined), '');
  assert.equal(redactNotificationText(null), '');
  assert.equal(redactNotificationText(undefined), '');
});
