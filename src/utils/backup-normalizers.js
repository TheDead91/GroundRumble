// Backup restore entity normalizers.
//
// These canonicalize the three backup sections that would otherwise restore as
// "a string under the value cap" with no per-entry shape validation: research
// sources (`atlas_ai_gen_urls`), comparison targets (`atlas_compare_targets`),
// and audit history (`atlas_audit_history`). Each returns a consumer-safe array
// of plain objects whose render-relevant fields are string-coerced.
//
// Backup restore is a replace/apply operation, unlike the interactive bulk-test
// importer whose contract is "drop non-conforming entries and report a count".
// Therefore an invalid whole record (not an object) or an invalid nested
// container is rejected explicitly rather than silently dropped, so the caller
// (`openBackup`) surfaces a section/index-scoped error and no candidate becomes
// applicable.
//
// Forward compatibility: harmless unknown keys and non-rendered fields are
// preserved verbatim (object spread). Only the fields the consumers render as
// React children (or iterate/map over) are coerced, and only when present, so an
// already-canonical entry round-trips byte-identically.

// Distinct error class so `openBackup` callers (and the import modal) can tell a
// post-decrypt restore-validation failure apart from an incorrect passphrase /
// corrupted-ciphertext failure. Only section/index/field metadata is embedded —
// never record values — so the message is safe to surface to the user.
export class RestoreValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RestoreValidationError';
  }
}

const isObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Safe string coercion. `String(value)` can throw when a crafted JSON object has
// an own non-callable `toString`/`valueOf` (e.g. `{ toString: "nope" }`), which
// reaches here as `Object → primitive` conversion failure. Fall back to a stable
// JSON serialization so normalization is total and never throws.
const str = (value) => {
  if (value == null) return '';
  const type = typeof value;
  if (type === 'string') return value;
  if (type === 'number' || type === 'boolean') return String(value);
  try {
    return String(value);
  } catch {
    return JSON.stringify(value);
  }
};

// Canonical boolean coercion. Consumers read these fields through JS truthiness
// (`filter(s => s.enabled)`, `!!s.declined`, `s.assessing && …`), so a
// non-boolean restored value ("false", 0, {}, [], null) would diverge from the
// boolean the runtime creates. Only the literal canonical `true` is enabled;
// every other value collapses to `false` (fail-closed).
const bool = (value) => value === true;

const SECTION_SOURCES = 'atlas_ai_gen_urls';
const SECTION_TARGETS = 'atlas_compare_targets';
const SECTION_HISTORY = 'atlas_audit_history';

const parseArray = (section, value, label) => {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RestoreValidationError(`${label} section "${section}" is not valid JSON.`);
  }
  if (!Array.isArray(parsed)) {
    throw new RestoreValidationError(`${label} section "${section}" must be an array.`);
  }
  return parsed;
};

const coerceStrings = (obj, fields) => {
  const out = { ...obj };
  for (const field of fields) {
    if (hasOwn(out, field)) out[field] = str(out[field]);
  }
  return out;
};

const normalizeAssessment = (assessment) => {
  if (!isObject(assessment)) return assessment;
  const out = { ...assessment };
  for (const field of ['status', 'summary', 'reason']) {
    if (hasOwn(out, field)) out[field] = str(out[field]);
  }
  return out;
};

/**
 * Normalize the research-sources section into consumer-safe source entries.
 * Returns the normalized array; throws on an invalid container, whole record,
 * missing/duplicate semantic identity, or non-object entry.
 */
export const normalizeRestoredSources = (sectionValue) => {
  const parsed = parseArray(SECTION_SOURCES, sectionValue, 'Research sources');
  const seenIds = new Set();
  return parsed.map((entry, index) => {
    if (!isObject(entry)) {
      throw new RestoreValidationError(`Research source entry ${index + 1} in section "${SECTION_SOURCES}" must be an object.`);
    }
    const out = coerceStrings(entry, ['id', 'url', 'kind', 'title', 'description', 'excerpt', 'fetchNote']);
    for (const field of ['enabled', 'declined', 'proxyFailed', 'assessing']) {
      if (hasOwn(out, field)) out[field] = bool(out[field]);
    }
    // A source without a non-empty `id` has no semantic identity and is silently
    // dropped by hydration (`AIGenContext` merges only entries with `s.id`), so
    // restoring it would report success then lose the whole record on reload.
    // `id` is required identity (selection/toggle/remove keys), and there is no
    // canonical value to invent, so reject it explicitly and atomically.
    if (!out.id || !String(out.id).trim()) {
      throw new RestoreValidationError(`Research source entry ${index + 1} in section "${SECTION_SOURCES}" is missing a required id.`);
    }
    if (seenIds.has(out.id)) {
      throw new RestoreValidationError(`Research source entry ${index + 1} in section "${SECTION_SOURCES}" duplicates the id "${out.id}".`);
    }
    seenIds.add(out.id);
    if (hasOwn(out, 'assessment')) out.assessment = normalizeAssessment(out.assessment);
    return out;
  });
};

/**
 * Normalize the comparison-targets section into consumer-safe target entries.
 * Returns the normalized array; throws on an invalid container or whole record.
 */
export const normalizeRestoredTargets = (sectionValue) => {
  const parsed = parseArray(SECTION_TARGETS, sectionValue, 'Comparison targets');
  return parsed.map((entry, index) => {
    if (!isObject(entry)) {
      throw new RestoreValidationError(`Comparison target entry ${index + 1} in section "${SECTION_TARGETS}" must be an object.`);
    }
    return coerceStrings(entry, ['uid', 'provider', 'model']);
  });
};

const normalizeDetail = (detail, recordIndex, detailIndex) => {
  if (!isObject(detail)) {
    throw new RestoreValidationError(`Audit history entry ${recordIndex + 1}: \`details\` entry ${detailIndex + 1} must be an object.`);
  }
  return coerceStrings(detail, [
    'auditId', 'targetUid', 'testId', 'testName', 'tactic', 'techniqueId',
    'techniqueName', 'status', 'provider', 'model', 'timestamp'
  ]);
};

const normalizeTarget = (target, recordIndex, targetIndex) => {
  if (!isObject(target)) {
    throw new RestoreValidationError(`Audit history entry ${recordIndex + 1}: \`targets\` entry ${targetIndex + 1} must be an object.`);
  }
  return coerceStrings(target, ['provider', 'model']);
};

const normalizeEntryList = (record, field, recordIndex, normalizeEntry) => {
  const out = { ...record };
  const value = out[field];
  if (value == null) {
    out[field] = [];
    return out;
  }
  if (!Array.isArray(value)) {
    throw new RestoreValidationError(`Audit history entry ${recordIndex + 1}: \`${field}\` must be an array.`);
  }
  out[field] = value.map((entry, index) => normalizeEntry(entry, recordIndex, index));
  return out;
};

/**
 * Normalize the audit-history section into consumer-safe history records.
 * Returns the normalized array; throws on an invalid container, whole record,
 * or non-array `targets`/`details` container.
 */
export const normalizeRestoredHistory = (sectionValue) => {
  const parsed = parseArray(SECTION_HISTORY, sectionValue, 'Audit history');
  return parsed.map((record, index) => {
    if (!isObject(record)) {
      throw new RestoreValidationError(`Audit history entry ${index + 1} in section "${SECTION_HISTORY}" must be an object.`);
    }
    let out = coerceStrings(record, ['id', 'timestamp', 'model', 'provider']);
    if (hasOwn(record, 'targets')) out = normalizeEntryList(out, 'targets', index, normalizeTarget);
    if (hasOwn(record, 'details')) out = normalizeEntryList(out, 'details', index, normalizeDetail);
    return out;
  });
};

/**
 * Normalize the three restore sections in place and populate the
 * report preview fields. Throws RestoreValidationError on any invalid section,
 * record, or nested container, so a failed normalize aborts candidate
 * construction before review/apply/persistence. Unlike tests/presets (which
 * drop whole invalid entries with a visible count as their bulk-import
 * contract), a backup restore never silently removes a whole record.
 */
export const normalizeRestoredEntitySections = (data, report) => {
  if (data['atlas_ai_gen_urls'] != null) {
    const sources = normalizeRestoredSources(data['atlas_ai_gen_urls']);
    data['atlas_ai_gen_urls'] = JSON.stringify(sources);
    report.sourceUrlCount = sources.length;
    report.sourceUrls = sources.slice(0, 50);
  }
  if (data['atlas_compare_targets'] != null) {
    data['atlas_compare_targets'] = JSON.stringify(normalizeRestoredTargets(data['atlas_compare_targets']));
  }
  if (data['atlas_audit_history'] != null) {
    data['atlas_audit_history'] = JSON.stringify(normalizeRestoredHistory(data['atlas_audit_history']));
  }
};