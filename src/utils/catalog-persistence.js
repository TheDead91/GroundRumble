// Durable catalog persistence boundary.
//
// Every durable catalog mutation must follow:
//
//   validate/prepare -> attempt persistence -> on success commit visible state
//
// Updating React state before persistence can swallow storage failures: the UI
// claims success while a reload restores the prior state, and a throw inside a
// state updater can propagate to the app boundary and unmount the app. All
// catalog writes route through these helpers so failure is an operation failure
// with actionable feedback, never a false success or a crash.

import { redactSensitiveText } from './redact.js';

export const CATALOG_KEYS = {
  customTests: 'atlas_custom_tests',
  disabledTestIds: 'atlas_disabled_tests',
  presets: 'atlas_test_presets',
  recentAiTests: 'atlas_recent_ai_tests',
};

/**
 * Attempt a raw localStorage write. Returns { ok: true } on success or
 * { ok: false, error } when storage is unavailable (quota, denied, etc.).
 * Never throws.
 */
export const tryWriteCatalogKey = (key, raw) => {
  try {
    localStorage.setItem(key, raw);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
};

/**
 * Attempt to persist an array value as JSON under `key`.
 * Never throws.
 */
export const tryPersistCatalogArray = (key, arr) => {
  let raw;
  try {
    raw = JSON.stringify(arr);
  } catch (err) {
    return { ok: false, error: err };
  }
  return tryWriteCatalogKey(key, raw);
};

/**
 * Attempt to remove a catalog key. Removal failure (e.g. denied storage)
 * is reported rather than thrown so callers can keep coherent state.
 * Never throws.
 */
export const tryRemoveCatalogKey = (key) => {
  try {
    localStorage.removeItem(key);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
};

// Persistence-first commit shared by every catalog writer: the storage write
// lands before visible state commits. Returns true on success; on failure it
// surfaces actionable feedback, preserves previous state, and returns false
// so the caller keeps drafts open for retry.
export const commitCatalogArray = (key, value, setState, addToast, failureNotice) => {
  const res = tryPersistCatalogArray(key, value);
  if (!res.ok) {
    addToast(`${failureNotice}: ${redactSensitiveText(res.error?.message || res.error) || 'storage unavailable'}. Previous state unchanged — retry.`, 'error');
    return false;
  }
  setState(value);
  return true;
};