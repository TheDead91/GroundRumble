// Authoritative diagnostic projection for failure surfaces.
//
// A failure diagnostic must expose only the minimum safe information needed to
// explain what went wrong: the raw upstream material a provider/relay/transport
// echoes back is arbitrary (secrets, credentials, huge bodies, misleading or
// markup-like text) and must not be copied wholesale into a less-trusted sink.
//
// This module is the single projection primitive every diagnostic sink routes
// through, in the shape:
//
//     raw failure -> classify(keep category/status already present) ->
//                    redaction -> deterministic bound -> safe string
//
// Two strengths are provided: `projectDiagnosticText` (canonical redaction,
// for raw transport/body material where useful provider status must survive)
// and `projectDiagnosticTextStrict` (canonical redaction + the 16–39
// short-token run scrub, for the final transient/persisted diagnostic sinks
// that carry untrusted remote failure material). Both reuse `redact.js`
// (provider-token and high-entropy patterns from `credential-patterns.js`)
// rather than inventing a weaker parallel list. Redaction runs BEFORE bounding
// so truncation can never split a token and let it evade redaction.
//
// Guarantees for arbitrary input: deterministic, bounded, total (never throws
// while handling an error), non-mutating, and hostile-`toString`/cyclic-object
// safe.

import { redactSensitiveText, redactDiagnosticText } from './redact.js';

// Reasonable bound for an inline/toast diagnostic. Transport sites that
// legitimately keep a larger provider-body window pass their own explicit
// bound; this default keeps every general sink bounded and readable.
export const DEFAULT_DIAGNOSTIC_MAX = 280;

// Deterministic length bound. The input is assumed already redacted where
// relevant; a caller that needs the redact-then-bound ordering must use
// `projectDiagnosticText`, which applies both.
export const boundDiagnosticText = (value, maxLength = DEFAULT_DIAGNOSTIC_MAX) => {
  const s = String(value ?? '');
  if (s.length <= maxLength) return s;
  return `${s.slice(0, maxLength)}…`;
};

// Cycle-safe JSON serialization for the object fallback of the coercer. A
// repeated (non-cyclic) reference is rendered as `[Circular]`; that loss of
// fidelity is acceptable for a bounded diagnostic projection.
const stringifyCycleSafe = (value) => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') return String(val);
    if (typeof val === 'function' || typeof val === 'symbol') return undefined;
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    return val;
  });
};

// Total, never-throwing coercion of arbitrary input to a diagnostic string.
// Handles nullish, primitives, Errors (with a hostile `message` getter), and
// arbitrary objects (hostile `toString`/`toJSON`, cyclic references) without
// ever throwing while a failure is already being handled.
export const toSafeDiagnosticString = (value) => {
  if (value === null || value === undefined) return '';
  const type = typeof value;
  if (type === 'string') return value;
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'function' || type === 'symbol') return '';
  if (value instanceof Error) {
    try {
      const message = value.message;
      return typeof message === 'string' && message ? message : String(value.name || 'Error');
    } catch {
      return 'Error';
    }
  }
  try {
    return stringifyCycleSafe(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unrenderable value]';
    }
  }
};

// Project arbitrary failure material into a bounded, redacted, sink-safe
// string. Order is deliberately redact-then-bound so a token crossing the
// bound cannot survive by being split. This is the CANONICAL projection used
// for raw transport/body material (fetch-retry, relay) where useful provider
// status/category prose (e.g. an error code) must survive; it applies the
// canonical secret redaction only.
export const projectDiagnosticText = (value, maxLength = DEFAULT_DIAGNOSTIC_MAX) =>
  boundDiagnosticText(redactSensitiveText(toSafeDiagnosticString(value)), maxLength);

// Stricter projection for the FINAL diagnostic sinks that display or persist
// untrusted remote/transport failure material (transient toasts, persisted
// audit ERROR reasoning). It adds the 16–39 short-token run scrub to the
// canonical redaction so an unrecognized-prefix token (custom relay key,
// gateway key) cannot survive in the sink, while useful short status/category
// text remains.
export const projectDiagnosticTextStrict = (value, maxLength = DEFAULT_DIAGNOSTIC_MAX) =>
  boundDiagnosticText(redactDiagnosticText(toSafeDiagnosticString(value)), maxLength);
