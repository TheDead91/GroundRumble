// Behavioral coverage for src/utils/project-diagnostic.js — the authoritative
// diagnostic projection primitive. Asserts determinism, canonical
// secret redaction, deterministic bounding, redact-before-bound ordering, and
// totality (never throws) across hostile inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIAGNOSTIC_MAX,
  toSafeDiagnosticString,
  boundDiagnosticText,
  projectDiagnosticText,
} from '../src/utils/project-diagnostic.js';

test('projectDiagnosticText is deterministic for identical inputs', () => {
  const input = 'relay rejected sk-abcdef123456 with a loud error';
  assert.equal(projectDiagnosticText(input), projectDiagnosticText(input));
});

test('projectDiagnosticText redacts canonical provider-token patterns', () => {
  assert.equal(projectDiagnosticText('failed with sk-abcdef123456'), 'failed with [REDACTED_KEY]');
  assert.equal(projectDiagnosticText('key ghp_abc123'), 'key [REDACTED_KEY]');
});

test('projectDiagnosticText redacts Authorization-like values', () => {
  assert.equal(projectDiagnosticText('Authorization: Bearer abcDEF123._-'), 'Authorization: [REDACTED_AUTH]');
});

test('projectDiagnosticText redacts labeled secrets and high-entropy runs', () => {
  assert.match(projectDiagnosticText('apiKey: someValue'), /apiKey:=\[REDACTED\]/);
  assert.equal(projectDiagnosticText('token ' + 'a'.repeat(40)), 'token [REDACTED_HIGH_ENTROPY]');
});

test('projectDiagnosticText leaves harmless prose unchanged and preserves useful category/status', () => {
  assert.equal(projectDiagnosticText('Proxy HTTP 503: relay unavailable'), 'Proxy HTTP 503: relay unavailable');
  assert.ok(projectDiagnosticText('Authentication failed (HTTP 401)').includes('HTTP 401'));
});

test('projectDiagnosticText bounds oversized output deterministically', () => {
  const longButBenign = 'x '.repeat(60) + 'ENDMARKER';
  const out = projectDiagnosticText(longButBenign, 40);
  assert.equal(out.length, 41, 'bounded to maxLength plus a single ellipsis character');
  assert.ok(out.endsWith('…'), 'the bound is signalled with an ellipsis');
  assert.ok(!out.includes('ENDMARKER'), 'content beyond the bound is dropped');
});

test('redaction precedes bounding so a token crossing the bound is still removed', () => {
  const input = 'x'.repeat(60) + ' token sk-abcdefghijklmnop';
  const out = projectDiagnosticText(input, 40);
  assert.ok(!out.includes('sk-'), 'the provider token is redacted before truncation');
  assert.ok(!out.includes('abcdefghijklmnop'), 'the token body is not leaked');
  assert.ok(out.includes('[REDACTED_HIGH_ENTROPY]'), 'the long run is reduced to its high-entropy placeholder');
});

test('projectDiagnosticText preserves the input (non-mutating) and coerces nullish to empty', () => {
  const input = 'Authorization: Bearer sk-live';
  const before = input.slice();
  projectDiagnosticText(input);
  assert.equal(input, before, 'source string is untouched');
  assert.equal(projectDiagnosticText(null), '');
  assert.equal(projectDiagnosticText(undefined), '');
});

test('toSafeDiagnosticString coerces primitives and Errors without throwing', () => {
  assert.equal(toSafeDiagnosticString('hello'), 'hello');
  assert.equal(toSafeDiagnosticString(42), '42');
  assert.equal(toSafeDiagnosticString(true), 'true');
  assert.equal(toSafeDiagnosticString(10n), '10');
  assert.equal(toSafeDiagnosticString(() => {}), '');
  assert.equal(toSafeDiagnosticString(Symbol('x')), '');
  assert.equal(toSafeDiagnosticString(new Error('boom')), 'boom');
  assert.equal(toSafeDiagnosticString(new Error()), 'Error');
});

test('toSafeDiagnosticString survives hostile toString/toJSON and cyclic references', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(toSafeDiagnosticString(cyclic), '{"self":"[Circular]"}');

  const hostileToString = { toJSON() { throw new Error('nope'); }, toString() { throw new Error('nope'); } };
  assert.equal(toSafeDiagnosticString(hostileToString), '[unrenderable value]');

  const hostileToJSON = { toJSON() { throw new Error('nope'); } };
  assert.equal(typeof toSafeDiagnosticString(hostileToJSON), 'string');

  const hostileMessage = new Error('x');
  Object.defineProperty(hostileMessage, 'message', { get() { throw new Error('nope'); } });
  assert.equal(toSafeDiagnosticString(hostileMessage), 'Error');
});

test('projectDiagnosticText never throws while handling an error-like hostile input', () => {
  const hostile = { message: () => { throw new Error('boom'); }, toJSON() { throw new Error('boom'); } };
  assert.equal(typeof projectDiagnosticText(hostile), 'string');
});

test('boundDiagnosticText is a pure length bound with a stable ellipsis', () => {
  assert.equal(boundDiagnosticText('short', 10), 'short');
  assert.equal(boundDiagnosticText('abcdefghij', 5), 'abcde…');
  assert.equal(DEFAULT_DIAGNOSTIC_MAX, 280, 'the shared default bound is fixed and deterministic');
});

test('boundDiagnosticText coerces nullish input to an empty string', () => {
  assert.equal(boundDiagnosticText(null), '');
  assert.equal(boundDiagnosticText(undefined), '');
});

test('toSafeDiagnosticString drops non-string Error messages and falls back to the name', () => {
  const nonStringMessage = new Error();
  Object.defineProperty(nonStringMessage, 'message', { value: 42 });
  assert.equal(toSafeDiagnosticString(nonStringMessage), 'Error');

  const anonymous = new Error('');
  Object.defineProperty(anonymous, 'name', { value: '' });
  assert.equal(toSafeDiagnosticString(anonymous), 'Error', 'a falsy name falls back to the literal Error label');
});

test('toSafeDiagnosticString serializes bigint/function/symbol object members safely', () => {
  assert.equal(toSafeDiagnosticString({ n: 1n, f: () => {}, s: Symbol('x'), keep: 'yes' }), '{"n":"1","keep":"yes"}');
});
