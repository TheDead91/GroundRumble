// Diagnostic projection regression.
//
// Failure diagnostics expose only the minimum safe information needed to
// explain a failure. Secret-bearing, credential-bearing, attacker-controlled,
// or excessively detailed upstream material is projected (redacted + bounded)
// before it reaches any diagnostic sink — while useful category/status stays,
// bounded projection works, and intentional audit evidence is NOT conflated
// with diagnostic projection.
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O; every secret is a literal sentinel.
// No production file is modified.
//
// Run: node --test tests/security/regressions/diagnostic-projection.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { testProxyConnection } from '../../../src/utils/api/proxy.js';
import { queryModel, testProvider } from '../../../src/utils/api/provider-client.js';
import { projectDiagnosticText } from '../../../src/utils/project-diagnostic.js';
import { buildAuditRecord, redactAuditRecord } from '../../../src/utils/audit-record.js';

const SENTINEL_KEY = 'sk-SENTINEL-KEY';
const SENTINEL_AUTH = 'Bearer BEARER-SENTINEL';

let savedFetch = null;

const install = () => { savedFetch = globalThis.fetch; };
const restore = () => { globalThis.fetch = savedFetch; };

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

// ── 1. Relay (proxy test) body projection ──────────────────────────────────

test('testProxyConnection rejects with a projected relay body (secret removed, status kept)', async () => {
  install();
  try {
    globalThis.fetch = async () => jsonResponse(
      { error: { message: `relay saw Authorization: ${SENTINEL_AUTH}` } }, 502
    );
    await assert.rejects(
      testProxyConnection('https://relay.example/?url='),
      (err) => {
        assert.ok(!err.message.includes(SENTINEL_AUTH), 'Authorization value is redacted');
        assert.ok(!err.message.includes('BEARER-SENTINEL'), 'bearer token is redacted');
        assert.match(err.message, /Proxy HTTP 502/, 'useful status is preserved');
        assert.match(err.message, /REDACTED/, 'the secret is replaced by a placeholder');
        return true;
      }
    );
  } finally {
    restore();
  }
});

// ── 2. Provider transport body projection ──────────────────────────────────

test('queryModel projects a secret-echoing provider error body before it becomes an error message', async () => {
  install();
  try {
    globalThis.fetch = async () => jsonResponse(
      { error: { message: `bad key ${SENTINEL_KEY}` } }, 500
    );
    await assert.rejects(
      queryModel('cp', 'm', 's', 'u', [{ id: 'cp', connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k' }]),
      (err) => {
        assert.ok(!err.message.includes(SENTINEL_KEY), 'the provider token is redacted');
        assert.match(err.message, /REDACTED/);
        return true;
      }
    );
  } finally {
    restore();
  }
});

test('testProvider keeps the actionable authentication category and drops the echoed body', async () => {
  install();
  try {
    globalThis.fetch = async () => jsonResponse(
      { error: { message: `unauthorized ${SENTINEL_KEY}` } }, 401
    );
    await assert.rejects(
      testProvider({ connector: 'openai', endpoint: 'https://gw/v1', apiKey: 'k', models: [] }),
      (err) => {
        assert.match(err.message, /Authentication failed \(HTTP 401\)/);
        assert.ok(!err.message.includes(SENTINEL_KEY), 'no echoed secret in the friendly message');
        return true;
      }
    );
  } finally {
    restore();
  }
});

// ── 3. Projection helper: adversarial shapes ────────────────────────────────

test('projectDiagnosticText removes canonical provider tokens, auth, labels, and high-entropy runs', () => {
  assert.equal(projectDiagnosticText(`failed with ${SENTINEL_KEY}`), 'failed with [REDACTED_KEY]');
  assert.equal(projectDiagnosticText(`Authorization: ${SENTINEL_AUTH}`), 'Authorization: [REDACTED_AUTH]');
  assert.match(projectDiagnosticText('apiKey: hunter2'), /apiKey:=\[REDACTED\]/);
  assert.equal(projectDiagnosticText('token ' + 'A'.repeat(41)), 'token [REDACTED_HIGH_ENTROPY]');
});

test('projectDiagnosticText bounds a huge body deterministically without splitting a token', () => {
  const huge = 'a'.repeat(60) + ` ${SENTINEL_KEY} suffix`;
  const out = projectDiagnosticText(huge, 40);
  assert.ok(out.length <= 41, 'bounded output');
  assert.ok(!out.includes(SENTINEL_KEY), 'token removed before bounding');
  assert.ok(!out.includes('sk-SENTINEL'), 'no token fragment survives');
});

test('projectDiagnosticText is total for hostile and cyclic objects (never throws)', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(typeof projectDiagnosticText(cyclic), 'string');
  const hostile = { toJSON() { throw new Error('x'); }, toString() { throw new Error('y'); } };
  assert.equal(typeof projectDiagnosticText(hostile), 'string');
  const hostileErr = new Error('x');
  Object.defineProperty(hostileErr, 'message', { get() { throw new Error('z'); } });
  assert.equal(projectDiagnosticText(hostileErr), 'Error');
});

test('projectDiagnosticText neutralizes markup/script-looking text as plain content', () => {
  const out = projectDiagnosticText('<script>alert(1)</script> return sk-' + 'x'.repeat(20));
  assert.ok(!out.includes('sk-'), 'provider token is redacted');
  assert.ok(out.includes('<script>'), 'markup is kept as inert text (React escapes it), not an execution path');
});

// ── 4. Intentional audit evidence is preserved, not truncated as a diagnostic ──

test('redactAuditRecord preserves intentional target/response evidence and only redacts secret echoes', () => {
  const record = buildAuditRecord({
    id: 'audit-1',
    timestamp: new Date().toISOString(),
    lineup: [{ provider: 'p', model: 'm' }],
    isDemo: false,
    results: [{
      auditId: 'audit-1',
      targetUid: 'u1',
      testId: 't1',
      testName: 't',
      techniqueId: 'AML.T0000',
      systemPrompt: 'sys',
      userPrompt: 'user',
      response: 'A long benign model response that must be preserved intact for audit review, not bounded.',
      reasoning: 'The model complied with the request.',
      status: 'VULNERABLE',
      model: 'm',
      provider: 'p',
      timestamp: new Date().toISOString(),
    }],
    expectedCount: 1,
    completed: true,
  });
  const redacted = redactAuditRecord(record);
  assert.equal(redacted.details[0].response, record.details[0].response, 'intentional evidence is preserved');
  assert.equal(redacted.details[0].reasoning, record.details[0].reasoning, 'reasoning is preserved');
});
