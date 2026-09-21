// Pure transport-policy predicates for user-defined provider endpoints.
// Single canonical copy shared by ProvidersContext (context API surface) and
// any future caller; built on the low-level primitives in endpoint-policy.js.

import { isSpecialUseAddress, isSpecialUseHostname, isInsecureHttpEndpoint } from './endpoint-policy.js';

// True when a provider's configured endpoint(s) point at a private, loopback,
// or special-use host — i.e. the "allow private/loopback endpoint" approval is
// actually meaningful for it. Public endpoints never need the bypass, so the
// flag is only preserved across a backup import when it is genuinely required.
export const providerNeedsPrivateBypass = (cp) => {
  const requires = (endpoint) => {
    if (!endpoint) return false;
    let host = '';
    try { host = new URL(String(endpoint)).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
    return isSpecialUseHostname(host) || isSpecialUseAddress(host);
  };
  return requires(cp.endpoint) || requires(cp.modelsEndpoint);
};

// True when a provider actually speaks plaintext HTTP to a non-local host — the
// configuration for which "allow insecure transport" is meaningful. Public
// HTTPS endpoints never need it, so the flag is only preserved across a backup
// import when it is genuinely required.
export const providerNeedsInsecureTransport = (cp) =>
  isInsecureHttpEndpoint(cp.endpoint) || isInsecureHttpEndpoint(cp.modelsEndpoint);
