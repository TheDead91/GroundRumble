import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestPayloads, validateGeneratedTests, GENERATED_TEST_LIMITS } from '../src/utils/ai-generator.js';

test('parseTestPayloads accepts fenced wrapper JSON', () => {
  const raw = '```json\n{"tests":[{"name":"A","userPrompt":"p1"}]}\n```';
  const out = parseTestPayloads(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'A');
});

test('validateGeneratedTests drops invalid tests and fills defaults', () => {
  const out = validateGeneratedTests([
    { name: 'Valid', userPrompt: 'payload' },
    { name: '   ', userPrompt: 'x' },
    { name: 'NoPayload' },
    null
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].techniqueId, 'AML.T0034'); // default technique
  assert.ok(out[0].systemPrompt.length > 0); // default system prompt
});

test('validateGeneratedTests can enforce an ATLAS technique allowlist', () => {
  const tests = validateGeneratedTests([
    { name: 'valid', userPrompt: 'attack', techniqueId: 'AML.T0034' },
    { name: 'invalid', userPrompt: 'attack 2', techniqueId: 'AML.T9999' }
  ], new Set(['AML.T0034']));
  assert.deepEqual(tests.map(t => t.name), ['valid']);
});

test('validateGeneratedTests de-duplicates near-identical payloads', () => {
  const out = validateGeneratedTests([
    { name: 'One', userPrompt: 'the same payload here' },
    { name: 'Two', userPrompt: 'the same payload here' }
  ]);
  assert.equal(out.length, 1);
});

test('parseTestPayloads extracts a JSON array embedded in prose', () => {
  const raw = 'The payloads are: [{"name":"B","userPrompt":"q"}] done';
  const out = parseTestPayloads(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'B');
});

test('parseTestPayloads salvages a truncated wrapper via repairTruncatedJson', () => {
  const raw = '{"tests":[{"name":"C","userPrompt":"r"}]\n';
  const out = parseTestPayloads(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'C');
});

test('parseTestPayloads picks the non-empty object when several are present', () => {
  const raw = 'first {"tests":[]} then {"tests":[{"name":"D","userPrompt":"s"}]}';
  const out = parseTestPayloads(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'D');
});

test('parseTestPayloads handles nested objects inside the array', () => {
  const raw = 'Here: {"tests":[{"name":"E","userPrompt":"t","meta":{"a":1}}]} plus more';
  const out = parseTestPayloads(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'E');
});

test('AI-generated test validation rejects oversized fields and collections', () => {
  assert.throws(() => validateGeneratedTests([{ name: 'A', userPrompt: 'x'.repeat(GENERATED_TEST_LIMITS.fieldChars + 1) }]), /character limit/);
  assert.throws(() => validateGeneratedTests(Array.from({ length: GENERATED_TEST_LIMITS.maxTests + 1 }, () => ({ name: 'A', userPrompt: 'p' }))), /test limit/);
  assert.throws(() => validateGeneratedTests([{ name: 'A', userPrompt: 'p', failKeywords: Array(GENERATED_TEST_LIMITS.keywordCount + 1).fill('x') }]), /keyword/);
  assert.throws(() => validateGeneratedTests([{ name: 'A', userPrompt: 'p', failKeywords: ['x'.repeat(GENERATED_TEST_LIMITS.keywordChars + 1)] }]), /keyword.*character/);
});
