/**
 * fetch-retry - Retry logic and redirect refusal for API calls
 */

import { sleep } from './rate-limiter.js';
import { projectDiagnosticText } from '../project-diagnostic.js';

/**
 * Fetch with retry logic and redirect refusal
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} retries - Number of retries
 * @param {number} returnOnStatus - Return on specific status instead of throwing
 * @param {AbortSignal} signal - Abort signal
 * @returns {Promise<Response>}
 */
export const fetchWithRetry = async (url, options = {}, retries = 2, returnOnStatus = null, signal) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      // Surface the caller's own abort reason (default: an AbortError DOMException).
      const preAbort = signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
      preAbort.nonRetryable = true;
      throw preAbort;
    }
    try {
      const res = await fetch(url, {
        ...options,
        redirect: 'manual',
        signal,
      });
      if (returnOnStatus !== null && res.status === returnOnStatus) return res;
      // Redirect refusal BEFORE the !ok branch: a 3xx (or an opaque redirect,
      // status 0 + type) must never bounce credentialed requests to another
      // origin. Refused with a single attempt — never retried.
      const resType = res.type || '';
      if ((res.status >= 300 && res.status < 400) || resType === 'opaqueredirect' || (res.status === 0 && resType)) {
        const location = res.headers?.get ? res.headers.get('location') : null;
        const err = new Error(`Redirect to ${location} refused: refusing to follow redirects (credential guard)`);
        err.nonRetryable = true;
        throw err;
      }
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers?.get ? res.headers.get('retry-after') : null, 10);
          const quotaHint = Number.isFinite(retryAfter) && retryAfter >= 60
            ? ` — quota exhausted, retry after ${retryAfter}s`
            : '';
          throw new Error(`Rate limit reached (HTTP 429)${quotaHint}`);
        }
        const text = await res.text().catch(() => '');
        // Project (redact + bound) the upstream body before it becomes part of
        // the error message, so provider/relay-controlled text reaches every
        // downstream sink already reduced to a safe diagnostic projection.
        throw new Error(`HTTP ${res.status}: ${projectDiagnosticText(text, 500)}`);
      }
      return res;
    } catch (err) {
      // Abort errors are never retried and never re-wrapped: the caller's
      // DOMException instance and message must reach them intact.
      if (err?.nonRetryable) throw err;
      if (err?.name === 'AbortError' || signal?.aborted) {
        err.nonRetryable = true;
        throw err;
      }
      // Ensure we always have a proper Error with a message
      let msg = 'Unknown fetch error';
      if (err instanceof TypeError && err.message && err.message !== 'undefined') {
        // TypeError from fetch (e.g., CORS errors, network errors)
        lastError = new Error(err.message);
        msg = err.message;
      } else if (err instanceof DOMException && err.message && err.message !== 'undefined') {
        // DOMException from fetch
        lastError = new Error(err.message);
        msg = err.message;
      } else if (err instanceof Error) {
        // Only use Error message if it's not 'undefined'
        if (err.message && err.message !== 'undefined') {
          lastError = err;
          msg = err.message;
        } else {
          // Error with undefined message - treat as unknown
          lastError = new Error('Unknown error');
          msg = 'Unknown error';
        }
      } else if (typeof err === 'string') {
        lastError = new Error(err);
        msg = err;
      } else if (err && typeof err === 'object') {
        // Handle objects like Response, DOMException, TypeError, or plain objects
        // Try multiple ways to get the message
        const candidateMsg = err?.message || err?.statusText || err?.status || err?.code || err?.name || err?.cause?.message || err?.cause || '';
        msg = (candidateMsg && candidateMsg !== 'undefined' && candidateMsg !== '') 
          ? candidateMsg 
          : (typeof JSON.stringify === 'function' ? JSON.stringify(err).slice(0, 500) : 'Unknown fetch error') || 'Unknown fetch error';
        lastError = new Error(msg);
      } else {
        msg = String(err) || 'Unknown fetch error';
        lastError = new Error(msg);
      }
      // Ensure msg is never 'undefined' string
      if (!msg || msg === 'undefined' || msg === '') {
        msg = 'Unknown fetch error';
        lastError = new Error(msg);
      }
      if (attempt < retries && !signal?.aborted) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError) || 'Unknown fetch error');
};

/**
 * Redirect refusal helper
 */
export const redirectRefusal = (res) => {
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    throw new Error(`Redirect to ${location} refused`);
  }
  return res;
};