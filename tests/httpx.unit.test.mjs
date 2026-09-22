// Focused coverage for the shared test-only mock-routing helper `hostIs`
// (tests/helpers/httpx.mjs). It replaces the incidental hostname-substring
// dispatch predicates used to select canned responses, proving exact parsed
// hostname matching rejects lookalike hosts and malformed input.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hostIs } from './helpers/httpx.mjs';

test('hostIs matches the exact parsed hostname of a well-formed URL', () => {
  assert.equal(hostIs('https://raw.githubusercontent.com/a/b', 'raw.githubusercontent.com'), true);
  assert.equal(hostIs('https://api.groq.com/openai/v1', 'api.groq.com'), true);
  assert.equal(hostIs('https://generativelanguage.googleapis.com/v1/models', 'generativelanguage.googleapis.com'), true);
});

test('hostIs rejects a host that only appears in the URL path', () => {
  assert.equal(hostIs('https://evil.example/raw.githubusercontent.com/', 'raw.githubusercontent.com'), false);
});

test('hostIs rejects a suffix/prefix attacker hostname', () => {
  assert.equal(hostIs('https://raw.githubusercontent.com.evil.example/', 'raw.githubusercontent.com'), false);
  assert.equal(hostIs('https://evilraw.githubusercontent.com/', 'raw.githubusercontent.com'), false);
  assert.equal(hostIs('https://evil-api.groq.com/openai/v1', 'api.groq.com'), false);
});

test('hostIs returns false for malformed or non-URL input', () => {
  assert.equal(hostIs('not a url at all', 'example.com'), false);
  assert.equal(hostIs('', 'example.com'), false);
  assert.equal(hostIs(null, 'example.com'), false);
  assert.equal(hostIs(undefined, 'example.com'), false);
  assert.equal(hostIs(12345, 'example.com'), false);
});

test('hostIs ignores the port and matches hostnames case-insensitively via URL parsing', () => {
  assert.equal(hostIs('https://raw.githubusercontent.com:443/a/b', 'raw.githubusercontent.com'), true);
  assert.equal(hostIs('https://RAW.GITHUBUSERCONTENT.COM/a/b', 'raw.githubusercontent.com'), true);
});
