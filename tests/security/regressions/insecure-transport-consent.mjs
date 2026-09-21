// Insecure-transport consent regression.
//
// Action-time consent for secret-bearing cleartext-HTTP providers is a single
// production-wired approval primitive, bound to the exact transport identity and
// persisted apart from the provider record. Restore/legacy never synthesize
// consent, decline issues zero requests, a material config change invalidates
// the old approval, a stale pending consent cannot authorize a changed config,
// and an unchanged approved config never re-prompts. HTTP/private/self-hosted
// providers remain supported.
//
// The global fetch is replaced with a deterministic in-process stub. NOTHING in
// this file performs real network I/O. Every host is a reserved example name or
// loopback literal and every secret is a literal sentinel.
//
// Run: node --test tests/security/regressions/insecure-transport-consent.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { providerRouteFor } from '../../../src/utils/api/provider-client.js';
import { providerNeedsInsecureTransport, providerNeedsPrivateBypass } from '../../../src/utils/provider-endpoint-policy.js';
import { validateProviders } from '../../../src/utils/provider-record.js';
import { providerNeedsInsecureTransportConfirmation } from '../../../src/utils/providerSecret.js';
import {
  insecureTransportIdentity,
  insecureTransportConsentRequired,
  hasInsecureTransportApproval,
  recordInsecureTransportApproval,
  resetInsecureTransportApprovals,
  setInsecureTransportConfirmHandler,
  requestInsecureTransportApproval,
} from '../../../src/utils/insecure-transport-consent.js';

// Minimal deterministic localStorage for the consent store (self-contained; the
// test does not depend on the test DOM helpers).
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
};

const repoFile = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

const SENTINEL_KEY = 'sk-SENTINEL-009';

const backupProvider = {
  id: 'cp_attacker',
  name: 'attacker relay',
  connector: 'openai',
  endpoint: 'http://attacker.example/v1',
  modelsEndpoint: '',
  apiKey: SENTINEL_KEY,
  models: ['sentinel-model'],
  enabled: true,
  allowInsecureTransport: true,
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

test('restore preserves the transport flag but never transfers consent', () => {
  resetInsecureTransportApprovals();
  const [normalized] = validateProviders([backupProvider]);
  assert.equal(normalized.allowInsecureTransport, true, 'the flag survives normalization');

  const restored = {
    ...normalized,
    enabled: false,
    allowInsecureTransport: normalized.allowInsecureTransport === true && providerNeedsInsecureTransport(normalized),
  };
  assert.equal(restored.allowInsecureTransport, true, 'restore keeps the flag for a genuinely HTTP endpoint');
  assert.equal(insecureTransportConsentRequired(restored), true, 'restored secret-bearing HTTP still requires consent');
  assert.equal(hasInsecureTransportApproval(restored), false,
    'restore does NOT manufacture approval — the flag alone is not consent');

  // The transport policy still accepts the flagged endpoint; consent is a
  // separate human-decision boundary layered above it, not a replacement.
  assert.deepEqual(providerRouteFor(restored.endpoint, { ...restored, enabled: true }),
    { via: 'direct', url: restored.endpoint }, 'final transport policy remains authoritative for the flagged endpoint');
});

test('consent gate is production-wired at enable/probe/refresh', () => {
  const ctx = repoFile('src/context/ProvidersContext.jsx');
  assert.ok(ctx.includes('requestInsecureTransportApproval'), 'ProvidersContext imports the shared primitive');
  assert.match(ctx, /const confirmInsecureTransport = useCallback\(async \(cp\) => \{\n    return requestInsecureTransportApproval\(cp,/, 'confirmInsecureTransport delegates to the primitive');
  assert.match(ctx, /const approved = await requestInsecureTransportApproval\(provider,/, 'testProvider probes gate consent first');
  assert.match(ctx, /const approved = await requestInsecureTransportApproval\(cp,/, 'refreshProviderModels gates consent first');
  assert.match(ctx, /if \(insecureTransportConsentRequired\(provider\)\) recordInsecureTransportApproval\(provider\);/, 'form save records approval bound to the saved identity');

  const card = repoFile('src/components/views/settings/ProvidersCard.jsx');
  assert.match(card, /const approved = await confirmInsecureTransport\(cp\);/, 'enable is consent-gated via the shared primitive');
  assert.ok(!card.includes('const enableImportedProvider = (cp) => {\n    const next = providers.map'), 'the ungated enable flip is gone');
});

test('decline issues zero requests; accept authorizes the exact identity', async () => {
  resetInsecureTransportApprovals();
  let savedFetch = null;
  const calls = [];
  savedFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { calls.push(String(input)); return jsonResponse({ choices: [{ message: { content: 'pong' } }] }); };
  try {
    const cp = { ...backupProvider, enabled: false };
    setInsecureTransportConfirmHandler(async () => false);
    assert.equal(await requestInsecureTransportApproval(cp), false, 'decline blocks the action');
    assert.equal(hasInsecureTransportApproval(cp), false, 'decline persists nothing');

    setInsecureTransportConfirmHandler(async () => true);
    assert.equal(await requestInsecureTransportApproval(cp), true, 'accept proceeds');
    assert.equal(hasInsecureTransportApproval(cp), true, 'accept authorizes the exact config');
    assert.equal(calls.length, 0, 'the consent decision itself performs zero transport I/O');
  } finally {
    globalThis.fetch = savedFetch;
    setInsecureTransportConfirmHandler(null);
  }
});

test('material change invalidates; stale pending consent cannot authorize', async () => {
  resetInsecureTransportApprovals();
  const A = backupProvider;
  assert.equal(recordInsecureTransportApproval(A), true);

  const B = { ...backupProvider, endpoint: 'http://other.example/v1' };
  assert.notEqual(insecureTransportIdentity(A), insecureTransportIdentity(B), 'identity changes with the endpoint');
  assert.equal(hasInsecureTransportApproval(B), false, 'old approval never authorizes a changed config');

  // Stale pending consent: dialog opened for A, config became B before accept.
  resetInsecureTransportApprovals();
  setInsecureTransportConfirmHandler(async () => true);
  assert.equal(await requestInsecureTransportApproval(A, () => B), false, 'acceptance of A cannot authorize B');
  assert.equal(hasInsecureTransportApproval(B), false, 'B stays unauthorized');
  setInsecureTransportConfirmHandler(null);
});

test('private and insecure dimensions stay distinct, HTTP stays supported', () => {
  // Private non-loopback HTTP is cleartext AND private — both dimensions.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://192.168.1.5/v1', apiKey: SENTINEL_KEY }), true);
  assert.equal(providerNeedsPrivateBypass({ endpoint: 'http://192.168.1.5/v1' }), true);
  // Loopback/local HTTP is not insecure transport, but still private.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://127.0.0.1:11434/v1', apiKey: SENTINEL_KEY }), false);
  assert.equal(providerNeedsPrivateBypass({ endpoint: 'http://127.0.0.1:11434/v1' }), true);
  // Public HTTPS needs neither.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'https://api.example.com/v1', apiKey: SENTINEL_KEY }), false);
  // Credentialless HTTP needs no secret-cleartext consent.
  assert.equal(providerNeedsInsecureTransportConfirmation({ endpoint: 'http://attacker.example/v1' }), false);
});

test('unchanged approved use avoids fatigue', async () => {
  resetInsecureTransportApprovals();
  let prompts = 0;
  setInsecureTransportConfirmHandler(async () => { prompts += 1; return true; });
  const cp = backupProvider;
  await requestInsecureTransportApproval(cp);
  await requestInsecureTransportApproval(cp);
  await requestInsecureTransportApproval(cp);
  assert.equal(prompts, 1, 'one prompt for the identity, then ordinary use is frictionless');
  setInsecureTransportConfirmHandler(null);
});
