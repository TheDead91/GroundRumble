// Shared secret-redaction helpers.
//
// Secrets can surface in three places this module is responsible for shielding:
//   - error text echoed back by a provider (toasts, dialogs),
//   - raw model output logged to the browser console for debugging,
//   - the persistent `atlas_notifications` log in localStorage.
//
// The redaction is deliberately best-effort (a provider-controlled token of an
// unrecognized shape cannot be reliably identified), so it is a choke point, not
// a guarantee. It runs on every string before it reaches the console or
// persistence, and is cheap enough to apply liberally.

import { HIGH_ENTROPY_TOKEN_PATTERN, PROVIDER_TOKEN_PATTERN } from './credential-patterns.js';

const PROVIDER_TOKEN_RE = new RegExp(PROVIDER_TOKEN_PATTERN, 'g');
const HIGH_ENTROPY_TOKEN_RE = new RegExp(HIGH_ENTROPY_TOKEN_PATTERN, 'g');

// Best-effort scrub of common credential material from arbitrary text.
export const redactSensitiveText = (value) => String(value ?? '')
  .replace(/\b(?:Bearer|Basic|ApiKey|Authorization)\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED_AUTH]')
  // Recognized provider / token prefixes — the bulk of real key material starts
  // with one of these, even when a provider error echoes it back unlabeled.
  .replace(PROVIDER_TOKEN_RE, '[REDACTED_KEY]')
  // Labeled secrets, with or without a colon/equals separator ("apiKey: …",
  // "token is …", "credential AbC123").
  .replace(/\b(?:api[ _-]?key|access[ _-]?key|auth[ _-]?token|token|password|secret|cookie|credential)\b\s*(?:[:=]|\b(?:is|was)\b)\s*[^\s,;]+/gi,
    (m) => `${m.match(/^\S+/)[0]}=[REDACTED]`)
  .replace(HIGH_ENTROPY_TOKEN_RE, '[REDACTED_HIGH_ENTROPY]');

// The 16–39 char token-like run scrub. Closes the gap of short,
// unrecognized-prefix tokens (custom relay keys, gateway keys) that the main
// redactor cannot classify. Its leading/trailing delimiters
// (`/`, `.`, `:`, `=`, `?`, `&`) naturally skip URL path/query segments, so
// ordinary prose and useful category/status text survive.
const SHORT_TOKEN_RUN_RE = /(^|[\s"'([])[A-Za-z0-9_-]{16,39}(?=$|[\s"'.,;:)\]])/g;
export const scrubShortTokenRuns = (value) =>
  String(value ?? '').replace(SHORT_TOKEN_RUN_RE, (_m, pre) => `${pre}[REDACTED_TOKEN]`);

// Stricter scrub for diagnostic projection of untrusted remote/transport
// material (provider/relay error echoes). It adds the short-token run scrub to
// `redactSensitiveText` so an unrecognized-prefix token cannot survive in a
// transient or persisted diagnostic, while the canonical patterns remain the
// authoritative secret list. The short-token scrub runs first so its own
// placeholders are never re-processed by the broader scrub.
export const redactDiagnosticText = (value) =>
  redactSensitiveText(scrubShortTokenRuns(value));

// Stricter scrub for the persistent notification log. Notification text is
// informational, so it uses the same short-token scrub + canonical redaction
// as `redactDiagnosticText` (notification naming is retained for the sink, but
// the underlying primitive is shared).
export const redactNotificationText = (value) => redactDiagnosticText(value);

export const redactErrorText = (value) => redactSensitiveText(value);
