// Shared special-use address policy for browser provider checks and the local proxy.
const ipv4ToInt = (ip) => {
  const octets = ip.split('.').map(Number);
  // Octet-range validation: a literal like "8.8.8.256" must not wrap around and
  // be treated as a different (possibly public) address. Non-canonical forms
  // yield NaN so callers can reject them as invalid/blocked.
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return NaN;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
};
const inCidr = (value, base, prefix) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
};
export const isBlockedIPv4 = (ip) => {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return true;
  const n = ipv4ToInt(ip);
  if (Number.isNaN(n)) return true; // an out-of-range octet is invalid → block
  return inCidr(n, 0x00000000, 8) || inCidr(n, 0x7f000000, 8) ||
    inCidr(n, 0x0a000000, 8) || inCidr(n, 0xac100000, 12) ||
    inCidr(n, 0xc0a80000, 16) || inCidr(n, 0xa9fe0000, 16) ||
    inCidr(n, 0x64400000, 10) || inCidr(n, 0xc0000000, 24) ||
    inCidr(n, 0xc0000200, 24) || inCidr(n, 0xc6120000, 15) ||
    inCidr(n, 0xc6336400, 24) || inCidr(n, 0xcb007100, 24) ||
    inCidr(n, 0xe0000000, 4) || inCidr(n, 0xf0000000, 4) || n === 0xffffffff;
};

const parseIPv6 = (input) => {
  const normalized = String(input || '').toLowerCase().replace(/^\[|\]$/g, '');
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const expandIPv4 = (part) => {
    if (!part.includes('.')) return [part];
    const octets = part.split('.').map(Number);
    if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return [(octets[0] * 256 + octets[1]).toString(16), (octets[2] * 256 + octets[3]).toString(16)];
  };
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const parts = [...left, ...right];
  const expandedParts = parts.map(expandIPv4);
  if (expandedParts.some(part => part == null)) return null;
  const expanded = expandedParts.flat();
  if (expanded.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  const missing = 8 - expanded.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  return [...expanded.slice(0, left.length), ...Array(Math.max(0, missing)).fill('0'), ...expanded.slice(left.length)]
    .reduce((value, word) => (value << 16n) | BigInt(parseInt(word, 16)), 0n);
};

const ipv6Prefix = (value, prefix) => value >> BigInt(128 - prefix);
const parsedIPv6Bases = new Map();
const ipv6Range = (value, base, prefix) => {
  if (!parsedIPv6Bases.has(base)) parsedIPv6Bases.set(base, parseIPv6(base));
  return ipv6Prefix(value, prefix) === ipv6Prefix(parsedIPv6Bases.get(base), prefix);
};

export const isBlockedIPv6 = (ip) => {
  const value = parseIPv6(ip);
  if (value == null) return true;
  const v4 = Number(value & 0xffffffffn);
  // IPv4-mapped and IPv4-compatible IPv6 literals must inherit the IPv4 policy,
  // including when URL parsing has canonicalized dotted notation to hexadecimal.
  if (ipv6Range(value, '::ffff:0:0', 96) || ipv6Range(value, '::', 96)) {
    return isBlockedIPv4(`${v4 >>> 24}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`);
  }
  return value === 0n || value === 1n ||
    ipv6Range(value, '64:ff9b::', 96) ||    // NAT64 well-known prefix (embeds IPv4 in low 32 bits)
    ipv6Range(value, '2002::', 16) ||       // 6to4 (embeds IPv4 in bits 16-47)
    ipv6Range(value, 'fc00::', 7) ||        // unique-local
    ipv6Range(value, 'fe80::', 10) ||       // link-local
    ipv6Range(value, 'ff00::', 8) ||        // multicast
    ipv6Range(value, '100::', 64) ||        // discard-only
    ipv6Range(value, '2001:db8::', 32) ||   // documentation
    ipv6Range(value, '2001:2::', 48) ||     // benchmarking
    ipv6Range(value, '2001:10::', 28) ||    // orchid
    ipv6Range(value, '3fff::', 20) ||       // documentation
    ipv6Range(value, '5f00::', 16);         // reserved
};
export const isSpecialUseAddress = (host) => {
  const normalized = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return isBlockedIPv4(normalized);
  return normalized.includes(':') && isBlockedIPv6(normalized);
};
export const isSpecialUseHostname = (host) => {
  const normalized = String(host || '').toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost' || normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') || normalized.endsWith('.lan') ||
    normalized === 'metadata' ||
    normalized === 'metadata.google.internal' || normalized === 'intranet' ||
    normalized.endsWith('.internal') || normalized.endsWith('.home.arpa') ||
    normalized.endsWith('.invalid') || normalized.endsWith('.test');
};

export const isLocalHostname = (host) => {
  const normalized = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === '127.0.0.1' || normalized.startsWith('127.')) return true;
  // Check for IPv4-mapped IPv6 addresses that map to private/loopback IPv4
  if (normalized.includes(':')) {
    const value = parseIPv6(normalized);
    if (value != null) {
      const v4 = Number(value & 0xffffffffn);
      if (ipv6Range(value, '::ffff:0:0', 96) || ipv6Range(value, '::', 96)) {
        const ipv4 = `${v4 >>> 24}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`;
        return ipv4 === '127.0.0.1' || ipv4.startsWith('127.') || isBlockedIPv4(ipv4);
      }
    }
  }
  return false;
};

export const isInsecureHttpEndpoint = (endpoint) => {
  if (!endpoint) return false;
  try {
    const url = new URL(String(endpoint));
    if (url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return !isLocalHostname(host);
  } catch {
    return false;
  }
};
