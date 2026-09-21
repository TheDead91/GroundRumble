// Best-effort detection of credential material in a provider draft, so the UI
// can warn before persisting it unencrypted when no vault passphrase is set.
// Visibility only — never a block.

import { isInsecureHttpEndpoint } from './endpoint-policy.js';
import { HIGH_ENTROPY_TOKEN_PATTERN, PROVIDER_TOKEN_PATTERN } from './credential-patterns.js';

// Known secret/key prefixes (mirrors the prefix list in src/utils/redact.js).
const KEY_PREFIX_RE = new RegExp(PROVIDER_TOKEN_PATTERN);

// Field names / labels that strongly indicate a credential. Word-bounded so a
// legitimate "max_tokens" / "maxTokens" field doesn't trigger on the word
// "token" (the underscore / camelCase boundary defeats the \b).
const SECRET_LABEL_RE = /\b(?:api[ _-]?key|access[ _-]?key|auth[ _-]?token|access[ _-]?token|authorization|x-api-key|bearer|client[ _-]?secret|secret[ _-]?key|private[ _-]?key|password|passwd|credential|secret|token)\b/i;

// Long high-entropy runs (≥40 chars) are a secret regardless of label.
const HIGH_ENTROPY_RE = new RegExp(HIGH_ENTROPY_TOKEN_PATTERN);

// A raw-connector body template is a full, user-authored request body and may
// embed credentials directly (e.g. {"auth_token":"sk-…"}). It is scanned for
// known key prefixes and secret-labeled fields only — not the high-entropy
// heuristic, which would false-positive on legitimate long JSON values.
const textCarriesSecret = (text) => {
  const value = String(text ?? '');
  return KEY_PREFIX_RE.test(value) || SECRET_LABEL_RE.test(value);
};

export const providerCarriesSecret = (p) => {
  if (!p || typeof p !== 'object') return false;
  if (String(p.apiKey || '').trim()) return true;

  let headers = {};
  try { headers = JSON.parse(p.headers || '{}'); } catch { /* not JSON yet */ }
  for (const [name, value] of Object.entries(headers)) {
    if (SECRET_LABEL_RE.test(name)) return true;
    if (typeof value === 'string' && (KEY_PREFIX_RE.test(value) || HIGH_ENTROPY_RE.test(value))) return true;
  }

  return textCarriesSecret(p.bodyTemplate);
};

// A cleartext-HTTP provider that carries (or may carry) a secret must not be
// enabled — or auto-enabled by a connection test — without an explicit
// insecure-transport acknowledgment. Pure and testable so the enable-decision
// cannot silently drift from the consent rule. This is the single "requires
// approval?" predicate consumed by the central consent primitive
// (src/utils/insecure-transport-consent.js).
export const providerNeedsInsecureTransportConfirmation = (p) =>
  (isInsecureHttpEndpoint(p?.endpoint) || isInsecureHttpEndpoint(p?.modelsEndpoint)) && providerCarriesSecret(p);
