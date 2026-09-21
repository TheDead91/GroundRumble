import { isBlockedIPv4, isBlockedIPv6 } from './endpoint-policy.js';

/**
 * Trusted GitHub source hosts
 */
export const TRUSTED_GITHUB_SOURCE_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
  'objects.githubusercontent.com'
]);

/**
 * Classify source host
 */
export const classifySourceHost = (host) => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (TRUSTED_GITHUB_SOURCE_HOSTS.has(normalized)) return '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return isBlockedIPv4(normalized) ? 'private, local, or reserved' : '';
  if (normalized.includes(':')) return isBlockedIPv6(normalized) ? 'private, local, or reserved' : '';
  return 'hostname cannot be proven public from the browser';
};

/**
 * Assert public source URL
 */
export const assertPublicSourceUrl = (endpoint, { allowPrivate = false } = {}) => {
  let url;
  try { url = new URL(String(endpoint || '')); } catch { throw new Error('Source URL must be a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Source URL must use HTTP or HTTPS.');
  if (allowPrivate === true) return url;
  const reason = classifySourceHost(url.hostname);
  if (reason) throw new Error(`${reason} source URLs require the guarded proxy or explicit approval for this request.`);
  return url;
};

/**
 * Redirect follow policy
 */
export const redirectFollowPolicy = (toUrl) => {
  let url;
  try { url = new URL(String(toUrl || '')); } catch { return { allowed: false, reason: 'redirect target is not a valid URL' }; }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { allowed: false, reason: 'redirect target must use HTTP or HTTPS' };
  }
  const reason = classifySourceHost(url.hostname);
  if (reason) return { allowed: false, reason: `${reason} redirect target` };
  return { allowed: true };
};
