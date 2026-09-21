// Durable coverage for src/utils/insecure-transport-consent.js — the central
// action-time consent primitive for secret-bearing cleartext-HTTP provider
// transports. Covers the full scenario matrix (A–O) at the primitive
// boundary: identity determinism, require/valid/persist/request semantics,
// decline, stale pending consent, persistence failure, and private-vs-insecure.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/dom.mjs';
import {
  insecureTransportIdentity,
  insecureTransportConsentRequired,
  hasInsecureTransportApproval,
  recordInsecureTransportApproval,
  invalidateInsecureTransportApproval,
  resetInsecureTransportApprovals,
  setInsecureTransportConfirmHandler,
  requestInsecureTransportApproval,
} from '../src/utils/insecure-transport-consent.js';
import { providerNeedsPrivateBypass } from '../src/utils/provider-endpoint-policy.js';

installLocalStorage();

const insecureProvider = (overrides = {}) => ({
  id: 'cp_http',
  name: 'cleartext relay',
  connector: 'openai',
  endpoint: 'http://attacker.example/v1',
  modelsEndpoint: '',
  apiKey: 'sk-SAST-SENTINEL',
  models: ['m1'],
  method: 'POST',
  headers: '{}',
  bodyTemplate: '',
  responsePath: 'choices.0.message.content',
  ...overrides,
});

beforeEach(() => {
  resetInsecureTransportApprovals();
  setInsecureTransportConfirmHandler(null);
});

test('A: public HTTPS requires no insecure consent and is never prompted', async () => {
  const cp = insecureProvider({ endpoint: 'https://api.example.com/v1' });
  assert.equal(insecureTransportConsentRequired(cp), false);
  let asked = false;
  setInsecureTransportConfirmHandler(async () => { asked = true; return true; });
  assert.equal(await requestInsecureTransportApproval(cp), true);
  assert.equal(asked, false, 'HTTPS never prompts');
});

test('B: public HTTP first use prompts; accept proceeds, decline is zero authority', async () => {
  const cp = insecureProvider();
  assert.equal(insecureTransportConsentRequired(cp), true);

  let asked = null;
  setInsecureTransportConfirmHandler(async (msg) => { asked = msg; return false; });
  assert.equal(await requestInsecureTransportApproval(cp), false, 'decline blocks');
  assert.ok(asked && asked.includes('http://attacker.example/v1'), 'prompt names the destination');
  assert.ok(asked.includes('unencrypted'), 'prompt discloses cleartext transport');
  assert.equal(hasInsecureTransportApproval(cp), false, 'decline persists nothing');

  let accepted = false;
  setInsecureTransportConfirmHandler(async () => { accepted = true; return true; });
  assert.equal(await requestInsecureTransportApproval(cp), true, 'accept proceeds');
  assert.equal(accepted, true);
  assert.equal(hasInsecureTransportApproval(cp), true, 'accept records exact identity');
});

test('C: private-network HTTP keeps private and insecure dimensions distinct', () => {
  const privateHttp = insecureProvider({ endpoint: 'http://192.168.1.5:8000/v1' });
  assert.equal(insecureTransportConsentRequired(privateHttp), true, 'private non-loopback HTTP is cleartext');
  assert.equal(providerNeedsPrivateBypass(privateHttp), true, 'private dimension is preserved separately');

  const localHttp = insecureProvider({ endpoint: 'http://127.0.0.1:11434/v1' });
  assert.equal(insecureTransportConsentRequired(localHttp), false, 'loopback HTTP is not insecure transport');
  assert.equal(providerNeedsPrivateBypass(localHttp), true, 'loopback still needs private approval');
});

test('D: same approved config never reprompts on repeated use', async () => {
  const cp = insecureProvider();
  let prompts = 0;
  setInsecureTransportConfirmHandler(async () => { prompts += 1; return true; });
  assert.equal(await requestInsecureTransportApproval(cp), true);
  assert.equal(await requestInsecureTransportApproval(cp), true);
  assert.equal(await requestInsecureTransportApproval(cp), true);
  assert.equal(prompts, 1, 'exactly one prompt, then ordinary use is frictionless');
});

test('E: material host/port/path/scheme changes invalidate the old approval', () => {
  const base = insecureProvider();
  const variants = [
    insecureProvider({ endpoint: 'http://other.example/v1' }),        // host
    insecureProvider({ endpoint: 'http://attacker.example:9999/v1' }), // port
    insecureProvider({ endpoint: 'http://attacker.example/v2' }),      // path
    insecureProvider({ endpoint: 'https://attacker.example/v1' }),     // scheme
    insecureProvider({ modelsEndpoint: 'http://models.example/v1' }),  // models endpoint
    { ...insecureProvider(), connector: 'raw' },                       // connector
  ];
  for (const variant of variants) {
    assert.notEqual(insecureTransportIdentity(variant), insecureTransportIdentity(base),
      `identity must change: ${JSON.stringify(variant.endpoint ?? '')} ${variant.connector ?? ''}`);
  }
  assert.equal(recordInsecureTransportApproval(base), true);
  for (const variant of variants) {
    assert.equal(hasInsecureTransportApproval(variant), false, 'old approval never authorizes a materially different config');
  }
});

test('F: HTTP→HTTPS upgrade is never blocked by a stale HTTP approval', async () => {
  const http = insecureProvider();
  assert.equal(recordInsecureTransportApproval(http), true);
  const https = insecureProvider({ endpoint: 'https://attacker.example/v1' });
  let asked = false;
  setInsecureTransportConfirmHandler(async () => { asked = true; return true; });
  assert.equal(await requestInsecureTransportApproval(https), true, 'safe transport proceeds');
  assert.equal(asked, false, 'no consent needed for the safe endpoint');
});

test('G: HTTPS→HTTP downgrade requires fresh insecure approval', async () => {
  const https = insecureProvider({ endpoint: 'https://attacker.example/v1' });
  assert.equal(hasInsecureTransportApproval(https), false);
  const http = insecureProvider();
  let asked = false;
  setInsecureTransportConfirmHandler(async () => { asked = true; return false; });
  assert.equal(await requestInsecureTransportApproval(http), false, 'downgrade needs consent');
  assert.equal(asked, true, 'the downgrade prompted');
});

test('H: a restored record with allowInsecureTransport:true is NOT pre-approved', () => {
  const restored = { ...insecureProvider(), enabled: false, allowInsecureTransport: true };
  assert.equal(insecureTransportConsentRequired(restored), true);
  assert.equal(hasInsecureTransportApproval(restored), false,
    'restore preserves the transport flag but never synthesizes consent');
});

test('I: disabled→enabled with unchanged identity follows approved semantics', () => {
  const cp = insecureProvider();
  assert.equal(recordInsecureTransportApproval(cp), true);
  const enabled = { ...cp, enabled: true };
  assert.equal(hasInsecureTransportApproval(enabled), true, 'enable is not a revocation ritual');
  const changed = { ...cp, endpoint: 'http://other.example/v1', enabled: true };
  assert.equal(hasInsecureTransportApproval(changed), false, 'changed identity still requires consent');
});

test('J/K: probe and refresh use the same gate (unapproved asks, decline zero authority)', async () => {
  const cp = insecureProvider({ enabled: false });
  let prompts = 0;
  setInsecureTransportConfirmHandler(async () => { prompts += 1; return false; });
  assert.equal(await requestInsecureTransportApproval(cp), false, 'probe/refresh decline');
  assert.equal(await requestInsecureTransportApproval(cp), false, 'still declined (no approval recorded)');
  assert.equal(prompts, 2, 'each unapproved action reprompts until approved');
});

test('L: credentialless HTTP needs no secret-cleartext consent', () => {
  const keyless = insecureProvider({ apiKey: '', headers: '{}', bodyTemplate: '' });
  assert.equal(insecureTransportConsentRequired(keyless), false);
});

test('M: stale pending consent cannot authorize a changed config', async () => {
  const A = insecureProvider();
  const B = insecureProvider({ endpoint: 'http://other.example/v1' });
  setInsecureTransportConfirmHandler(async () => true);
  const result = await requestInsecureTransportApproval(A, () => B);
  assert.equal(result, false, 'acceptance of A does not authorize B');
  assert.equal(hasInsecureTransportApproval(A), false);
  assert.equal(hasInsecureTransportApproval(B), false);
});

test('N: approval persistence failure claims no false approval', () => {
  const cp = insecureProvider();
  const originalSet = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota exceeded'); };
  try {
    assert.equal(recordInsecureTransportApproval(cp), false, 'recording reports failure');
    assert.equal(hasInsecureTransportApproval(cp), false, 'no false approval survives a failed write');
  } finally {
    localStorage.setItem = originalSet;
  }
});

test('O: the approval artifact is separate from provider config (no silent backup transfer)', () => {
  const cp = insecureProvider();
  assert.equal(recordInsecureTransportApproval(cp), true);
  // A "restored" provider carries its own config flags but the approval store is
  // keyed independently; a fresh context (empty store) has no consent for it.
  const restored = { ...cp, enabled: false, allowInsecureTransport: true };
  resetInsecureTransportApprovals();
  assert.equal(hasInsecureTransportApproval(restored), false,
    'clearing the separate approval store leaves the restored record unapproved');
});

test('identity is deterministic and ignores the secret value and UI-only state', () => {
  const a = insecureProvider();
  const b = insecureProvider({ apiKey: 'sk-different-key' });
  const c = insecureProvider({ name: 'renamed', notes: 'notes', rpm: 99 });
  assert.equal(insecureTransportIdentity(a), insecureTransportIdentity(b), 'secret value is not a transport dimension');
  assert.equal(insecureTransportIdentity(a), insecureTransportIdentity(c), 'UI-only fields are not part of identity');
  assert.equal(insecureTransportIdentity(null), null);
  assert.equal(insecureTransportIdentity(undefined), null);
  assert.equal(insecureTransportIdentity('x'), null);
});

test('invalidate removes a recorded approval and reset clears the store', () => {
  const cp = insecureProvider();
  assert.equal(recordInsecureTransportApproval(cp), true);
  assert.equal(hasInsecureTransportApproval(cp), true);
  assert.equal(invalidateInsecureTransportApproval(cp), true);
  assert.equal(hasInsecureTransportApproval(cp), false);
  assert.equal(recordInsecureTransportApproval(cp), true);
  resetInsecureTransportApprovals();
  assert.equal(hasInsecureTransportApproval(cp), false);
});

test('approval store hydrates from localStorage and fails closed on corrupt entries', () => {
  const cp = insecureProvider();
  const identity = insecureTransportIdentity(cp);

  resetInsecureTransportApprovals();
  localStorage.setItem('atlas_insecure_transport_approvals', JSON.stringify({ [identity]: true }));
  assert.equal(hasInsecureTransportApproval(cp), true, 'valid stored approval hydrates');

  resetInsecureTransportApprovals();
  localStorage.setItem('atlas_insecure_transport_approvals', '{corrupt json');
  assert.equal(hasInsecureTransportApproval(cp), false, 'corrupt store fails closed');

  resetInsecureTransportApprovals();
  localStorage.setItem('atlas_insecure_transport_approvals', JSON.stringify([identity]));
  assert.equal(hasInsecureTransportApproval(cp), false, 'non-object store fails closed');

  resetInsecureTransportApprovals();
  localStorage.setItem('atlas_insecure_transport_approvals', JSON.stringify({ [identity]: false }));
  assert.equal(hasInsecureTransportApproval(cp), false, 'non-true value is not approval');
});

test('identity falls back to the raw string for an unparsable endpoint', () => {
  const a = insecureProvider({ endpoint: 'http://attacker.example/v1' });
  const b = insecureProvider({ endpoint: 'not a url at all' });
  assert.notEqual(insecureTransportIdentity(b), insecureTransportIdentity(a), 'unparsable endpoint still yields a distinct identity');
  assert.equal(typeof insecureTransportIdentity(b), 'string');
});

test('window.confirm fallback prompts when no handler is installed', async () => {
  const cp = insecureProvider();
  setInsecureTransportConfirmHandler(null);
  let prompted = null;
  const originalWindow = globalThis.window;
  globalThis.window = { confirm: (msg) => { prompted = msg; return false; } };
  try {
    assert.equal(await requestInsecureTransportApproval(cp), false, 'native-confirm decline blocks');
    assert.ok(prompted && prompted.includes('http://attacker.example/v1'), 'native confirm names the endpoint');
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('no handler and no window.confirm fails closed to decline', async () => {
  const cp = insecureProvider();
  setInsecureTransportConfirmHandler(null);
  const originalWindow = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(await requestInsecureTransportApproval(cp), false, 'no prompt mechanism → fail closed');
  } finally {
    if (originalWindow !== undefined) globalThis.window = originalWindow;
  }
});

test('null and unknown identities are never approved or recorded', () => {
  assert.equal(hasInsecureTransportApproval(null), false);
  assert.equal(recordInsecureTransportApproval(null), false);
  assert.equal(invalidateInsecureTransportApproval(null), false);
  assert.equal(invalidateInsecureTransportApproval({ id: 'unknown', endpoint: 'http://x.example/v1', connector: 'openai' }), true);
});

test('re-recording an already-approved identity is idempotent', () => {
  const cp = insecureProvider();
  assert.equal(recordInsecureTransportApproval(cp), true);
  assert.equal(recordInsecureTransportApproval(cp), true);
});

test('a stale acceptance upgrades to a now-safe config without recording stale consent', async () => {
  const A = insecureProvider();
  const https = insecureProvider({ endpoint: 'https://attacker.example/v1' });
  setInsecureTransportConfirmHandler(async () => true);
  assert.equal(await requestInsecureTransportApproval(A, () => https), true);
  assert.equal(hasInsecureTransportApproval(https), false, 'no stale consent recorded for a safe config');
  setInsecureTransportConfirmHandler(null);
});

test('the private+HTTP consent message discloses the private dimension separately', async () => {
  const privateHttp = insecureProvider({ endpoint: 'http://192.168.1.5/v1' });
  let msg = null;
  setInsecureTransportConfirmHandler(async (m) => { msg = m; return false; });
  await requestInsecureTransportApproval(privateHttp);
  assert.ok(msg && msg.includes('private/loopback'), 'private dimension disclosed separately');
  setInsecureTransportConfirmHandler(null);
});

test('storage-unavailable environments fail closed without throwing', () => {
  const cp = insecureProvider();
  const original = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.equal(recordInsecureTransportApproval(cp), false, 'no localStorage → no durable approval');
    assert.equal(hasInsecureTransportApproval(cp), false);
  } finally {
    globalThis.localStorage = original;
  }
});

test('reset tolerates a throwing localStorage removal', () => {
  const originalRemove = localStorage.removeItem;
  localStorage.removeItem = () => { throw new Error('denied'); };
  try {
    assert.doesNotThrow(() => resetInsecureTransportApprovals());
  } finally {
    localStorage.removeItem = originalRemove;
  }
});
