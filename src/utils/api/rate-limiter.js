/**
 * RateLimiter - minimum-spacing rate limiter for API calls
 */

/**
 * Sleep utility
 */
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const abortRejection = (signal) => {
  const reason = signal?.reason;
  return reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError');
};

const waitFor = (ms, signal) => new Promise((resolve, reject) => {
  let timer;
  const onAbort = () => {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
    reject(abortRejection(signal));
  };
  timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

/**
 * RateLimiter class for enforcing RPM limits
 */
export class RateLimiter {
  constructor() {
    this.slots = new Map();
  }

  /**
   * Wait until at least one request interval (60000 / rpm) has passed since
   * the last recorded start for the key, then record the new start time.
   * @param {string} key - Rate limit key (e.g., model or endpoint)
   * @param {number} rpm - Requests per minute
   * @param {AbortSignal} [signal] - Optional abort signal
   */
  async wait(key, rpm, signal) {
    if (!Number.isFinite(Number(rpm)) || rpm <= 0) return;
    if (signal?.aborted) throw abortRejection(signal);
    const interval = 60000 / rpm;
    let last = this.slots.get(key);
    // Multiple callers can wake on the same tick. Re-check after every wait
    // so only one records a start; the others wait for the following interval.
    while (last !== undefined && last + interval > Date.now()) {
      await waitFor(last + interval - Date.now(), signal);
      last = this.slots.get(key);
    }
    this.slots.set(key, Date.now());
  }

  /**
   * Clear all rate limit slots
   */
  clear() {
    this.slots.clear();
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiter();

/**
 * Reset the global rate limiter
 */
export const resetRateLimiter = () => rateLimiter.clear();
