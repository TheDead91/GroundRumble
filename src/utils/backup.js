// Full in-browser backup / restore of GroundRumble settings and data.

import { normalizeRestoredTest, normalizeRestoredPreset } from './testImporter.js';
import { normalizeRestoredEntitySections, RestoreValidationError } from './backup-normalizers.js';
import { encryptJSON, decryptJSON, envelopeIterations, MIN_PASSPHRASE_LENGTH } from './secretbox.js';
import { redactSensitiveText } from './redact.js';
export { PBKDF2_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS, MIN_PASSPHRASE_LENGTH, clampIterations } from './secretbox.js';

const BACKUP_APP = 'groundrumble';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const MAX_VALUE_BYTES = 5 * 1024 * 1024;

// Keys included in a backup. Purely cosmetic UI state (sidebar / collapse
// toggles) and the offline ATLAS cache are intentionally left out.
const BACKUP_KEYS = [
  'atlas_providers',
  'atlas_compare_targets',
  'atlas_judge_config',
  'atlas_gen_config',
  'atlas_ai_prompts',
  'atlas_test_presets',
  'atlas_custom_tests',
  'atlas_disabled_tests',
  'atlas_ai_gen_urls',
  'atlas_recent_ai_tests',
  'atlas_audit_history',
  'atlas_result_overrides',
  'atlas_demo_mode'
];
export { BACKUP_KEYS };

// One canonical override entity, shared by live persistence and backup intake.
export const normalizeResultOverride = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !['SECURE', 'VULNERABLE', 'INCONCLUSIVE'].includes(value.verdict) ||
      (value.reason !== undefined && typeof value.reason !== 'string')) return null;
  return { verdict: value.verdict, reason: redactSensitiveText(value.reason ?? '').trim() };
};

const validateSection = (key, value) => {
  if (key === 'atlas_result_overrides') {
    let parsed;
    try { parsed = JSON.parse(value); } catch { return false; }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.values(parsed).every(value => normalizeResultOverride(value) !== null);
  }
  if (key === 'atlas_ai_prompts') {
    let parsed;
    try { parsed = JSON.parse(value); } catch { return false; }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.values(parsed).every(prompt => typeof prompt === 'string');
  }
  return true;
};

// Build the exportable bundle from localStorage. `overrides` may inject extra
// key/value pairs (e.g. secrets held in the IndexedDB vault) into the bundle.
export const buildBackup = (overrides = {}) => {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    data[key] = value;
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
};

// --- Passphrase encryption (Web Crypto: PBKDF2 + AES-256-GCM) ---
// The shared crypto core lives in ./secretbox.js; this facade owns only its
// own context: the backup bundle's AAD string and its envelope shape (the
// `ciphertext` field alongside app/kind/version), so ciphertext can never be
// transplanted into a different purpose or silently replayed under another
// context string. The public constant/clamp names are re-exported so every
// existing specifier (e.g. browser-e2e, backup.test) keeps resolving.

const enc = new TextEncoder();

// Context binding (GCM AAD) for the backup envelope, so ciphertext can never be
// transplanted into a different purpose or silently replayed under another
// context string.
const BACKUP_AAD = enc.encode('groundrumble-backup:v1');

// Encrypt a backup bundle with a passphrase, returning an opaque envelope object.
// The envelope carries the iteration count the KDF ran with, a fresh per-export
// salt, and a 12-byte GCM IV — all base64, bound to the backup AAD so the
// bundle can only be decrypted for import, never unlocked as a vault record.
export const encryptBackup = async (bundle, passphrase) => {
  if (!crypto?.subtle) throw new Error('Web Crypto is unavailable in this context.');
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`A backup passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters is required.`);
  const core = await encryptJSON(bundle, passphrase, BACKUP_AAD);
  return {
    app: BACKUP_APP,
    kind: 'encrypted',
    version: BACKUP_VERSION,
    iterations: core.iterations,
    salt: core.salt,
    iv: core.iv,
    ciphertext: core.data
  };
};

// Decrypt a passphrase-encrypted backup envelope back into its plain bundle.
// The imported envelope is validated by parseBackup before reaching here, so
// the crypto layers below see exactly the fields encryptBackup writes; the
// remap `…data: envelope.ciphertext` is the faithful shape conversion for the
// shared decrypt path (which speaks the `data` field name), leaving the
// imported object untouched.
// Wrong passphrases and corrupted ciphertexts are indistinguishable at the GCM
// layer, so both are re-wrapped in the user-facing "Incorrect passphrase or
// corrupted backup." error. The iteration-count guard is deliberately OUTSIDE
// that catch: a downgrade tamper, a crafted DoS envelope, or a future format
// must fail with its own explicit rejection text (see envelopeIterations), not
// masquerade as a wrong passphrase — so the KDF is never spun with an absurd
// count just to fail GCM afterwards. (A vault record pasted in place of a
// backup envelope carries a different AAD string and lands in the catch too.)
export const decryptBackup = async (envelope, passphrase) => {
  if (!crypto?.subtle) throw new Error('Web Crypto is unavailable in this context.');
  if (!passphrase) throw new Error('This backup is encrypted. Enter the passphrase that was used to export it.');
  // Resolve the iteration count BEFORE any KDF work so an out-of-range count
  // surfaces as its own explicit error rather than a misleading "wrong
  // passphrase" from the GCM catch below.
  envelopeIterations(envelope, 'backup');
  try {
    return await decryptJSON({ ...envelope, data: envelope.ciphertext }, passphrase, BACKUP_AAD, 'backup');
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup.');
  }
};

// Byte-accurate length (a UTF-16 .length under-counts astral-plane content by
// up to 2×, so a "10 MiB" cap based on it admits ~20 MiB of real bytes).
const byteLength = (s) => enc.encode(String(s ?? '')).length;

const parseJsonSection = (value) => {
  if (value == null) return null;
  try { return JSON.parse(value); } catch { return null; }
};

// First non-empty line of a prompt override, truncated for the confirmation
// dialog preview (visibility, not blocking).
const firstLine = (text) => {
  const line = String(text || '').split('\n').find((l) => l.trim()) || '';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
};

// Re-normalize the two test-bearing sections through the same schema as the
// bulk importer (field-by-field String() coercion, 20k-char field caps, keyword
// count/length caps), dropping non-conforming entries with a visible count.
// Also enumerates prompt-key overrides and imported test/preset names so the
// pre-import confirmation cannot hide a smuggled `judge_system`
// replacement behind a counts-only summary. Mutates `data` in place; populates
// `report` for the caller.
const normalizeBackupSections = (data, report) => {
  const testsRaw = parseJsonSection(data['atlas_custom_tests']);
  if (Array.isArray(testsRaw)) {
    const normalized = [];
    for (const t of testsRaw) {
      const nt = normalizeRestoredTest(t);
      if (nt) normalized.push(nt);
      else report.droppedTests++;
    }
    data['atlas_custom_tests'] = JSON.stringify(normalized);
    report.testNames = normalized.map((t) => t.name).slice(0, 50);
  } else if (data['atlas_custom_tests'] != null) {
    report.droppedTests += 1;
    data['atlas_custom_tests'] = JSON.stringify([]);
  }

  const presetsRaw = parseJsonSection(data['atlas_test_presets']);
  if (Array.isArray(presetsRaw)) {
    const normalized = [];
    for (const p of presetsRaw) {
      const np = normalizeRestoredPreset(p);
      if (np) normalized.push(np);
      else report.droppedPresets++;
    }
    data['atlas_test_presets'] = JSON.stringify(normalized);
    report.presetNames = normalized.map((p) => p.name).slice(0, 50);
  } else if (data['atlas_test_presets'] != null) {
    report.droppedPresets += 1;
    data['atlas_test_presets'] = JSON.stringify([]);
  }

  const promptsRaw = parseJsonSection(data['atlas_ai_prompts']);
  if (promptsRaw && typeof promptsRaw === 'object' && !Array.isArray(promptsRaw)) {
    report.promptOverrides = Object.entries(promptsRaw)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([key, value]) => ({ key, preview: firstLine(value) }));
  }

  normalizeRestoredEntitySections(data, report);
};

// knownResults maps resultOverrideKey to the underlying (not overridden) status.
// Only security results may be overridden. Verdict and reason stay together.
export const filterRestoredOverrides = (overridesObj, knownResults) => {
  let dropped = 0;
  const result = {};
  for (const [key, value] of Object.entries(overridesObj || {})) {
    const override = normalizeResultOverride(value);
    if (['SECURE', 'VULNERABLE'].includes(knownResults?.get(key)) &&
        override) {
      result[key] = override;
    } else {
      dropped++;
    }
  }
  return { kept: result, dropped };
};

// Validate raw text as a GroundRumble backup file. Returns the parsed envelope
// (an encrypted envelope that still needs decryptBackup).
export const parseBackup = (text) => {
  if (typeof text !== 'string' || byteLength(text) > MAX_BACKUP_BYTES) {
    throw new Error('The selected backup is too large.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!parsed || parsed.app !== BACKUP_APP || parsed.version !== BACKUP_VERSION) {
    throw new Error('The selected file is not a GroundRumble backup.');
  }
  if (parsed.kind === 'encrypted') {
    if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.ciphertext !== 'string') {
      throw new Error('The selected encrypted backup is malformed.');
    }
  } else {
    throw new Error('GroundRumble backups are encrypted-only. This file is not an encrypted backup (or is an unsupported legacy format). Re-export your data with a passphrase and import the encrypted file instead.');
  }
  return parsed;
};

// Resolve a parsed backup file into an importable bundle, decrypting it with
// the passphrase. Returns the bundle with an attached `normalization` report
// describing any dropped/normalized sections and previewing prompt overrides.
export const openBackup = async (parsed, passphrase) => {
  const bundle = parsed.kind === 'encrypted' ? await decryptBackup(parsed, passphrase) : parsed;
  if (!bundle || bundle.app !== BACKUP_APP || bundle.version !== BACKUP_VERSION || !bundle.data || typeof bundle.data !== 'object' || Array.isArray(bundle.data)) {
    throw new RestoreValidationError('The decrypted backup is malformed or uses an unsupported version.');
  }
  // Uniform validation: EVERY key must be a string within the byte-accurate
  // value cap, not just allowlisted ones — a crafted non-allowlisted key with a
  // huge value must not pass through unvalidated. Non-allowlisted keys are then
  // dropped explicitly so nothing rides along to applyBackup.
  let totalBytes = 0;
  for (const [key, value] of Object.entries(bundle.data)) {
    if (typeof value !== 'string') throw new RestoreValidationError(`Backup section "${key}" is invalid.`);
    const bytes = byteLength(value);
    if (bytes > MAX_VALUE_BYTES) throw new RestoreValidationError(`Backup section "${key}" is too large.`);
    if (!BACKUP_KEYS.includes(key)) {
      delete bundle.data[key];
      continue;
    }
    if (!validateSection(key, value)) throw new RestoreValidationError(`Backup section "${key}" is invalid or too large.`);
    totalBytes += bytes;
  }
  if (totalBytes > MAX_BACKUP_BYTES) {
    throw new RestoreValidationError('The backup data is too large to restore safely.');
  }
  // Defense-in-depth against crafted backups: normalize test/preset sections
  // before any write, and surface what will actually change to the user.
  const normalization = { droppedTests: 0, droppedPresets: 0, promptOverrides: [], testNames: [], presetNames: [] };
  normalizeBackupSections(bundle.data, normalization);
  bundle.normalization = normalization;
  return bundle;
};

// Write a validated backup bundle into localStorage, returning the keys restored.
// Only allowlisted keys are written — a crafted backup cannot overwrite
// arbitrary application state.
export const applyBackup = (backup, { replace = false } = {}) => {
  if (!backup || backup.app !== BACKUP_APP || backup.version !== BACKUP_VERSION || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    throw new Error('The backup is malformed or uses an unsupported version.');
  }
  const entries = Object.entries(backup.data)
    .filter(([key, value]) => BACKUP_KEYS.includes(key) && typeof value === 'string' && byteLength(value) <= MAX_VALUE_BYTES && validateSection(key, value));
  const keysToWrite = new Set(entries.map(([key]) => key));
  const keysToRemove = replace ? BACKUP_KEYS.filter(key => !keysToWrite.has(key)) : [];
  const totalBytes = entries.reduce((sum, [, value]) => sum + byteLength(value), 0);
  if (totalBytes > MAX_BACKUP_BYTES) throw new Error('The backup data is too large to restore safely.');

  const previous = new Map([...entries.map(([key]) => key), ...keysToRemove].map(key => [key, localStorage.getItem(key)]));
  const restored = [];
  try {
    for (const [key, value] of entries) {
      localStorage.setItem(key, value);
      restored.push(key);
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
  } catch (err) {
    for (const [key, value] of previous) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw new Error(`Could not restore the backup atomically: ${err?.message || err}`);
  }
  return restored;
};
