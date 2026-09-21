// Shared per-call deadline for audit/AI API requests plus the runner that
// enforces it. Pure browser-API utility module; imports nothing. Single
// canonical copy consumed by src/App.jsx.

// How long a single target/judge API call may take before it's aborted as a
// timeout (treated as an ERROR result, not a user-cancelled run).
export const AUDIT_CALL_TIMEOUT_MS = 60000;

// Runs `fn` with a combined AbortSignal that also aborts after `timeoutMs`.
// The timeout aborts with a TimeoutError so callers can distinguish it from a
// user-cancel (AbortError).
export const runWithTimeout = (signal, timeoutMs, fn) => {
  const controller = new AbortController();
  const onUserAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onUserAbort, { once: true });
  }
  const combined = controller.signal;
  let timeoutId;
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onUserAbort);
  };
  const operation = Promise.resolve().then(() => fn(combined));
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Timed out', 'TimeoutError'));
      reject(new DOMException('Timed out', 'TimeoutError'));
    }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(cleanup);
};
