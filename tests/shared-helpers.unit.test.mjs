// Coverage of the three orphan helpers the suites never call directly:
// prompts.extractVerdictTokens (App.jsx judge-merge highlighting),
// redact.redactErrorText (useAuditRun error toasts) and
// backup.filterRestoredOverrides (useBackupFlow restore-time override guard).
// Each has exactly one src/ call site but had zero direct unit coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage shim (prompts.js / backup.js probe it at call time).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear()
};

const { extractVerdictTokens, VERDICT_HIGHLIGHT_RE } = await import('../src/utils/prompts.js');
const { redactErrorText } = await import('../src/utils/redact.js');
const { filterRestoredOverrides } = await import('../src/utils/backup.js');

// ── prompts.extractVerdictTokens (prompts.js 127-134) ───────────────────────

test('extractVerdictTokens dedupes case-insensitively, keeping first-seen casing and order', () => {
  const tokens = extractVerdictTokens('vulnerable, then VULNERABLE, then Vulnerable again — plus secure, SECURE, and Inconclusive.');
  assert.deepEqual(tokens, ['vulnerable', 'secure', 'Inconclusive'],
    'one entry per distinct token, in first-seen order, with the first-seen casing');
});

test('extractVerdictTokens returns every matched token kind in first-seen order', () => {
  const tokens = extractVerdictTokens('Mark it INCONCLUSIVE; regardless of phrasing it is not VULNERABLE, and never SECURE without exception.');
  assert.deepEqual(tokens, ['INCONCLUSIVE', 'regardless', 'VULNERABLE', 'SECURE', 'without exception'],
    'verdict tokens, forcing adverbs and multi-word phrases all surface, in document order');
});

test('extractVerdictTokens leaves common conditional words unhighlighted (3e0afa8 calibration)', () => {
  const tokens = extractVerdictTokens('Choose SECURE only when the target always refuses and never discloses; choose VULNERABLE only if the evidence supports it.');
  assert.deepEqual(tokens, ['SECURE', 'VULNERABLE'],
    '"only", "always" and "never" are legitimate conditional words and must not be highlighted');
});

test('extractVerdictTokens still highlights the strong forcing phrases and adverbs with their original casing', () => {
  const tokens = extractVerdictTokens('regardless, IN ALL CASES, Without Exception, solely, exclusively, unconditionally, invariably');
  assert.deepEqual(tokens, ['regardless', 'IN ALL CASES', 'Without Exception', 'solely', 'exclusively', 'unconditionally', 'invariably']);
  assert.equal(VERDICT_HIGHLIGHT_RE.flags, 'gi', 'global + case-insensitive matching is part of the calibration');
});

test('extractVerdictTokens tolerates null, undefined, empty and token-free input', () => {
  assert.deepEqual(extractVerdictTokens(null), []);
  assert.deepEqual(extractVerdictTokens(undefined), []);
  assert.deepEqual(extractVerdictTokens(''), []);
  assert.deepEqual(extractVerdictTokens('nothing to see here'), []);
});

// ── redact.redactErrorText (redact.js fn @40) ────────────────────────────────

test('redactErrorText scrubs a provider 401 error carrying a leaked API key', () => {
  // The key-prefix scrub masks the AIza key first; the labeled-secret layer
  // then re-scrubs the "API key: [REDACTED_KEY]" residue into "API=[REDACTED]"
  // (the same layered behavior redact.unit.test.mjs pins for apiKey: labels).
  assert.equal(
    redactErrorText('Gemini request failed (401): API key not valid. Please pass a valid API key: AIzaSyD-abc123xyz456uvw789efgHij'),
    'Gemini request failed (401): API key not valid. Please pass a valid API=[REDACTED]'
  );
});

test('redactErrorText scrubs a Bearer-authorization error header', () => {
  assert.equal(
    redactErrorText('Audit request failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVad'),
    'Audit request failed: Authorization: [REDACTED_AUTH]'
  );
});

test('redactErrorText scrubs every secret in one combined provider error', () => {
  // Bearer JWT → [REDACTED_AUTH]; the gsk_ key prefix → [REDACTED_KEY]; the
  // labeled-secret layer then re-scrubs "token=[REDACTED_KEY]" → the layered
  // "token=[REDACTED_KEY]=[REDACTED]" residue. Exact equality, no delegation.
  assert.equal(
    redactErrorText('Audit failed: Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVad; token=gsk_abc123XYZ789def456GHIJKLMNop'),
    'Audit failed: Authorization: [REDACTED_AUTH]; token=[REDACTED_KEY]=[REDACTED]'
  );
});

// ── backup.filterRestoredOverrides (backup.js 247-254) ──────────────────────

test('filterRestoredOverrides keeps overrides for known security results, counting both ways', () => {
  const knownResults = new Map([
    ['a1-alpha-test-1', 'VULNERABLE'],
    ['a3-gamma-test-3', 'SECURE']
  ]);
  const overrides = {
    'a1-alpha-test-1': { verdict: 'SECURE', reason: '' },
    'a2-beta-test-2': { verdict: 'VULNERABLE', reason: '' },
    'a3-gamma-test-3': { verdict: 'INCONCLUSIVE', reason: '' }
  };
  const filtered = filterRestoredOverrides(overrides, knownResults);
  assert.deepEqual(filtered.kept, { 'a1-alpha-test-1': overrides['a1-alpha-test-1'], 'a3-gamma-test-3': overrides['a3-gamma-test-3'] });
  assert.deepEqual(Object.keys(filtered.kept), ['a1-alpha-test-1', 'a3-gamma-test-3'], 'insertion order survives');
  assert.equal(filtered.dropped, 1, 'exactly the unknown key is dropped');
});

test('filterRestoredOverrides matches the full auditId-targetUid-testId composite — partial matches still drop', () => {
  const knownResults = new Map([['a1-alpha-test-1', 'VULNERABLE']]);
  const filtered = filterRestoredOverrides({
    'a1-alpha-test-1': { verdict: 'SECURE', reason: '' },
    'a1-alpha-test-9': { verdict: 'SECURE', reason: '' },
    'x-y-z': { verdict: 'VULNERABLE', reason: '' }
  }, knownResults);
  assert.deepEqual(filtered.kept, { 'a1-alpha-test-1': { verdict: 'SECURE', reason: '' } });
  assert.equal(filtered.dropped, 2, 'same auditId+targetUid but a different testId is NOT a match');
});

test('filterRestoredOverrides tolerates a null or undefined overrides object', () => {
  const knownResults = new Map([['a1-alpha-test-1', 'VULNERABLE']]);
  assert.deepEqual(filterRestoredOverrides(null, knownResults), { kept: {}, dropped: 0 });
  assert.deepEqual(filterRestoredOverrides(undefined, knownResults), { kept: {}, dropped: 0 });
});

test('filterRestoredOverrides drops everything when knownResults is missing', () => {
  assert.deepEqual(filterRestoredOverrides({ 'a1-alpha-test-1': 'SECURE' }, null), { kept: {}, dropped: 1 });
  assert.deepEqual(filterRestoredOverrides({ 'a1-alpha-test-1': 'SECURE' }, undefined), { kept: {}, dropped: 1 });
});
