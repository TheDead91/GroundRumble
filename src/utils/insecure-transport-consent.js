// Central action-time consent primitive for secret-bearing cleartext-HTTP
// provider transports.
//
// The `allowInsecureTransport` flag on a provider record is a *transport-policy*
// gate enforced at the socket by `assertProviderEndpointAllowed` /
// `providerRouteFor`; it is NOT proof of human approval — a restored/legacy
// record can carry it without any human action. This module is the separate,
// deterministic approval authority: consent is bound to the exact
// security-relevant transport identity and persisted apart from the raw
// provider config, so restore/import cannot synthesize it and material config
// changes invalidate it.

import { providerNeedsInsecureTransportConfirmation } from './providerSecret.js';
import { providerNeedsPrivateBypass } from './provider-endpoint-policy.js';

const STORAGE_KEY = 'atlas_insecure_transport_approvals';

const canonicalUrl = (value) => {
  if (!value) return '';
  try { return new URL(String(value)).href; } catch { return String(value); }
};

// Deterministic, minimal-complete identity of a provider's security-relevant
// transport configuration: connector + the exact scheme/host/port/path of both
// the chat and models endpoints. Deliberately excludes the API key/headers/body
// (a secret *value* is not a transport dimension) and excludes UI-only state.
export const insecureTransportIdentity = (cp) => {
  if (!cp || typeof cp !== 'object') return null;
  const connector = cp.connector === 'raw' ? 'raw' : 'openai';
  return JSON.stringify({
    connector,
    endpoint: canonicalUrl(cp.endpoint),
    modelsEndpoint: canonicalUrl(cp.modelsEndpoint),
  });
};

// A cleartext-HTTP provider that carries (or may carry) a secret requires
// action-time consent. This is the single "requires approval?" predicate.
export const insecureTransportConsentRequired = (cp) =>
  providerNeedsInsecureTransportConfirmation(cp);

// --- persistence (a separate localStorage key so backup export/import never
// transfers consent into a fresh restore context) ---
let approvalStore = null;

const readApprovals = () => {
  if (approvalStore !== null) return approvalStore;
  const map = new Map();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [identity, value] of Object.entries(parsed)) {
            if (value === true) map.set(identity, true);
          }
        }
      }
    }
  } catch { /* storage unavailable or corrupt — fail closed to empty */ }
  approvalStore = map;
  return approvalStore;
};

const persistApprovals = (map) => {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
    return true;
  } catch {
    return false; // storage failure must not claim success
  }
};

export const hasInsecureTransportApproval = (cp) => {
  const identity = insecureTransportIdentity(cp);
  if (!identity) return false;
  return readApprovals().has(identity);
};

export const recordInsecureTransportApproval = (cp) => {
  const identity = insecureTransportIdentity(cp);
  if (!identity) return false;
  const map = readApprovals();
  if (map.has(identity)) return true;
  const candidate = new Map(map);
  candidate.set(identity, true);
  if (!persistApprovals(candidate)) return false; // no false approval on storage failure
  approvalStore = candidate;
  return true;
};

export const invalidateInsecureTransportApproval = (cp) => {
  const identity = insecureTransportIdentity(cp);
  if (!identity) return false;
  const map = readApprovals();
  if (!map.delete(identity)) return true;
  return persistApprovals(map);
};

export const resetInsecureTransportApprovals = () => {
  approvalStore = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage unavailable */ }
};

// --- consent UX ---
let confirmHandler = null;
export const setInsecureTransportConfirmHandler = (fn) => { confirmHandler = fn; };

const destinationList = (cp) => [cp.endpoint, cp.modelsEndpoint]
  .filter((s) => s)
  .map((s) => String(s))
  .filter((s, i, arr) => arr.indexOf(s) === i);

const buildInsecureTransportConsentMessage = (cp) => {
  const destinations = destinationList(cp);
  const destLine = destinations.length
    ? destinations.map((d) => `  ${d}`).join('\n')
    : '  (this provider)';
  const privateLine = providerNeedsPrivateBypass(cp)
    ? '\nThis is also a private/loopback endpoint, which requires separate private-network approval.\n'
    : '';
  return (
    'This provider sends requests over unencrypted HTTP:\n\n' +
    destLine +
    '\n\nCredentials and request content can be observed by anyone on the network path.\n' +
    privateLine +
    '\nOnly continue if you trust this endpoint and its network path. ' +
    'If you decline, this provider stays unauthorized and no request is sent.'
  );
};

// Single authoritative approval gate for every authority-granting action
// (enable, probe, refresh). `getCurrent` (optional) re-reads the live config so
// a stale pending consent — accepted after the config changed — can never
// authorize a different endpoint.
export const requestInsecureTransportApproval = async (cp, getCurrent) => {
  if (!insecureTransportConsentRequired(cp)) return true;
  if (hasInsecureTransportApproval(cp)) return true;

  const promptedIdentity = insecureTransportIdentity(cp);
  const message = buildInsecureTransportConsentMessage(cp);
  let approved;
  if (confirmHandler) approved = await confirmHandler(message);
  else if (typeof window !== 'undefined' && typeof window.confirm === 'function') approved = window.confirm(message);
  else approved = false;
  if (!approved) return false;

  const current = getCurrent ? getCurrent() : cp;
  // Config became safe (e.g. HTTP→HTTPS) while the dialog was open: no insecure
  // authority is needed, so proceed without recording stale consent.
  if (!insecureTransportConsentRequired(current)) return true;
  // Config became a different insecure endpoint: the acceptance of A must not
  // authorize B. Fail closed.
  if (insecureTransportIdentity(current) !== promptedIdentity) return false;
  recordInsecureTransportApproval(current);
  return true;
};
