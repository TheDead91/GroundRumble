// Corruption-tolerant localStorage accessors.
//
// User-editable, hand-edited, or truncated localStorage can contain invalid
// JSON. These helpers guarantee the app still boots with a sane default instead
// of throwing during initial render.

export const readStoredJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

export const readStoredArray = (key, fallback = []) => {
  const v = readStoredJSON(key, fallback);
  return Array.isArray(v) ? v : fallback;
};

export const readStoredObject = (key, fallback = {}) => {
  const v = readStoredJSON(key, fallback);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
};