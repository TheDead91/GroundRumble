// Regression tests: backup restore entity normalization & atomic rejection.
//
// Proves the restore-candidate boundary canonicalizes research sources,
// comparison targets, and audit history into consumer-safe entities, and that an
// invalid whole record or invalid container rejects the restore explicitly
// (before any review/apply/persistence) rather than being silently dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openBackup, applyBackup } from '../src/utils/backup.js';
import {
  normalizeRestoredSources,
  normalizeRestoredTargets,
  normalizeRestoredHistory,
  RestoreValidationError
} from '../src/utils/backup-normalizers.js';
import { buildRestoreCandidate } from '../src/utils/backup-candidate.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: (key) => storage.delete(String(key)),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() { return storage.size; }
};

const bundle = (data) => ({ app: 'groundrumble', version: 1, data });
const reset = () => storage.clear();

test('rejects a research-sources section with a non-array container before any restore', async () => {
  for (const raw of ['{}', '42', '"not an array"', 'null', '{bad']) {
    await assert.rejects(
      () => openBackup(bundle({ atlas_ai_gen_urls: raw }), 'pw'),
      (err) => err instanceof RestoreValidationError && /atlas_ai_gen_urls/.test(err.message),
      `container ${raw} must be rejected`
    );
  }
});

test('rejects a whole research-source record that is not an object', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_ai_gen_urls: JSON.stringify([null, 42, 'not-an-entry']) }), 'pw'),
    /Research source entry 1 .* must be an object\./
  );
});

test('string-coerces research-source render fields and leaves absent fields absent', async () => {
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([
      { id: 's1', kind: 'url', url: 'https://example.com', title: {}, description: [] },
      { id: 's2', kind: 'paste', title: 'Fine' }
    ])
  }), 'pw');

  const [first, second] = JSON.parse(opened.data.atlas_ai_gen_urls);
  assert.equal(typeof first.title, 'string');
  assert.equal(typeof first.description, 'string');
  assert.equal(first.url, 'https://example.com');
  assert.equal(first.id, 's1');
  // The second entry has no url/description — normalization must not invent
  // fields, so a valid entry round-trips without shape changes.
  assert.deepEqual(second, { id: 's2', kind: 'paste', title: 'Fine' });
  assert.equal(opened.normalization.sourceUrlCount, 2);
  assert.deepEqual(opened.normalization.sourceUrls, JSON.parse(opened.data.atlas_ai_gen_urls));
});

test('rejects a comparison-targets section with a non-array container', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_compare_targets: '{"uid":"u"}' }), 'pw'),
    /atlas_compare_targets.*must be an array/
  );
});

test('rejects a whole comparison-target record that is not an object', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_compare_targets: JSON.stringify(['sandbox::x']) }), 'pw'),
    /Comparison target entry 1 .* must be an object\./
  );
});

test('string-coerces comparison-target model/provider/uid fields', async () => {
  const opened = await openBackup(bundle({
    atlas_compare_targets: JSON.stringify([{ uid: 'u1', provider: 'sandbox', model: {} }])
  }), 'pw');
  const [target] = JSON.parse(opened.data.atlas_compare_targets);
  assert.equal(typeof target.model, 'string');
  assert.equal(target.uid, 'u1');
  assert.equal(target.provider, 'sandbox');
});

test('rejects an audit-history section with a non-array container', async () => {
  for (const raw of ['{}', 'null', '"record"']) {
    await assert.rejects(
      () => openBackup(bundle({ atlas_audit_history: raw }), 'pw'),
      /atlas_audit_history.*must be an array/
    );
  }
});

test('rejects a whole audit-history record that is not an object', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify([42]) }), 'pw'),
    /Audit history entry 1 .* must be an object\./
  );
});

test('audit-history record-level model/provider are string-coerced (dashboard crash vector)', async () => {
  const opened = await openBackup(bundle({
    atlas_audit_history: JSON.stringify([{
      id: 'h1', timestamp: '2026-09-19T00:00:00.000Z', targets: [], model: {}, provider: 'sandbox',
      details: []
    }])
  }), 'pw');
  const [record] = JSON.parse(opened.data.atlas_audit_history);
  assert.equal(typeof record.model, 'string');
  assert.equal(record.provider, 'sandbox');
});

test('audit-history null targets/details normalize to empty arrays (canonical optional-array default)', async () => {
  const opened = await openBackup(bundle({
    atlas_audit_history: JSON.stringify([{ id: 'h1', targets: null, details: null }])
  }), 'pw');
  const [record] = JSON.parse(opened.data.atlas_audit_history);
  assert.deepEqual(record.targets, []);
  assert.deepEqual(record.details, []);
});

test('audit-history non-array targets or details reject the restore', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify([{ id: 'h1', targets: 'u1' }]) }), 'pw'),
    /Audit history entry 1: `targets` must be an array\./
  );
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify([{ id: 'h1', details: {} }]) }), 'pw'),
    /Audit history entry 1: `details` must be an array\./
  );
});

test('audit-history nested detail metadata is string-coerced (detail modal crash vector)', async () => {
  const opened = await openBackup(bundle({
    atlas_audit_history: JSON.stringify([{
      id: 'h1', timestamp: '2026-09-19T00:00:00.000Z',
      details: [{
        auditId: 'h1', targetUid: 'u1', testId: 't1',
        testName: {}, tactic: {}, techniqueId: [], techniqueName: {},
        status: 'SECURE'
      }]
    }])
  }), 'pw');
  const [detail] = JSON.parse(opened.data.atlas_audit_history)[0].details;
  for (const field of ['testName', 'tactic', 'techniqueId', 'techniqueName']) {
    assert.equal(typeof detail[field], 'string', `${field} must be a string`);
  }
  assert.equal(detail.status, 'SECURE');
});

test('audit-history non-object nested target/detail entries reject the restore', async () => {
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify([{ id: 'h1', targets: [42] }]) }), 'pw'),
    /Audit history entry 1: `targets` entry 1 must be an object\./
  );
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify([{ id: 'h1', details: ['oops'] }]) }), 'pw'),
    /Audit history entry 1: `details` entry 1 must be an object\./
  );
});

test('audit-history nested target provider/model are string-coerced', async () => {
  const opened = await openBackup(bundle({
    atlas_audit_history: JSON.stringify([{ id: 'h1', targets: [{ provider: {}, model: ['m'] }] }])
  }), 'pw');
  const [target] = JSON.parse(opened.data.atlas_audit_history)[0].targets;
  assert.equal(typeof target.provider, 'string');
  assert.equal(typeof target.model, 'string');
});

test('research-source nested assessment text fields are string-coerced (nested consumer)', async () => {
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([{
      id: 's1', kind: 'url', title: 'T', url: 'https://example.com',
      assessment: { status: 'high', summary: {}, reason: [] }
    }])
  }), 'pw');
  const [source] = JSON.parse(opened.data.atlas_ai_gen_urls);
  assert.equal(typeof source.assessment.summary, 'string');
  assert.equal(typeof source.assessment.reason, 'string');
  assert.equal(source.assessment.status, 'high');
});

test('coercion handles null, number/boolean, and non-object nested values deterministically', async () => {
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([
      { id: 123, kind: 'url', url: true, title: null, excerpt: 0, assessment: 'pending' }
    ]),
    atlas_compare_targets: JSON.stringify([{ uid: 'u', provider: 'p', model: 7 }])
  }), 'pw');

  const [source] = JSON.parse(opened.data.atlas_ai_gen_urls);
  assert.equal(source.id, '123');
  assert.equal(source.url, 'true');
  assert.equal(source.title, '');
  assert.equal(source.excerpt, '0');
  assert.equal(source.assessment, 'pending', 'non-object assessment passes through unchanged');

  const [target] = JSON.parse(opened.data.atlas_compare_targets);
  assert.equal(target.model, '7');
});

test('a hostile toString field cannot make normalization throw; it is coerced to a safe string', async () => {
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([{ id: 's1', kind: 'url', url: { toString: 'nope' } }])
  }), 'pw');
  const [source] = JSON.parse(opened.data.atlas_ai_gen_urls);
  assert.equal(typeof source.url, 'string');
});

test('mixed valid + invalid records reject atomically (valid entries are not silently kept)', async () => {
  reset();
  storage.set('atlas_compare_targets', 'sentinel');
  await assert.rejects(
    () => openBackup(bundle({
      atlas_compare_targets: JSON.stringify([
        { uid: 'u1', provider: 'p', model: 'm' },
        'crafted-bad-record',
        { uid: 'u3', provider: 'p', model: 'm' }
      ])
    }), 'pw'),
    /Comparison target entry 2 .* must be an object\./
  );
  // openBackup never persists; only the caller applies, so nothing changed.
  assert.equal(storage.get('atlas_compare_targets'), 'sentinel');
});

test('validation errors name the section/entry but never echo record values', async () => {
  // The invalid whole record is itself secret-bearing; a naïve implementation
  // might interpolate it into the message. The normalizer must report only the
  // section + index, never the value.
  await assert.rejects(
    () => openBackup(bundle({ atlas_audit_history: JSON.stringify(['sk-crafted-secret-token']) }), 'pw'),
    (err) => {
      assert.ok(err.message.includes('atlas_audit_history'));
      assert.ok(err.message.includes('entry 1'));
      assert.ok(!err.message.includes('sk-crafted-secret-token'));
      return true;
    }
  );
});

test('successful normalization produces the exact reviewed/applied candidate', async () => {
  reset();
  const opened = await openBackup(bundle({
    atlas_compare_targets: JSON.stringify([{ uid: 'u1', provider: 'p', model: {} }]),
    atlas_demo_mode: 'false'
  }), 'pw');
  const candidate = buildRestoreCandidate(opened, {});
  applyBackup(candidate.normalizedBackup, { replace: true });

  const persisted = JSON.parse(storage.get('atlas_compare_targets'));
  assert.equal(typeof persisted[0].model, 'string');
  // The applied copy is the exact candidate's normalized data, not a reparse.
  assert.deepEqual(persisted, JSON.parse(candidate.normalizedBackup.data.atlas_compare_targets));
  assert.equal(storage.get('atlas_demo_mode'), 'false');
});

test('normalized sources reach the consumer render expression as safe strings', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');

  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([{ id: 's1', kind: 'url', url: 'https://example.com', title: { hostile: true } }])
  }), 'pw');
  const [source] = JSON.parse(opened.data.atlas_ai_gen_urls);

  // A crafted object title is string-coerced, so the render expression
  // (`s.title || s.url || 'Untitled source'`) yields a plain string instead of
  // an object child.
  const label = source.title || source.url || 'Untitled source';
  assert.equal(typeof label, 'string');
  assert.doesNotThrow(() => renderToStaticMarkup(createElement('span', null, label)), 'no object-child render failure');
});

test('normalizers reject rather than coerce a whole non-object record', () => {
  assert.throws(() => normalizeRestoredSources(JSON.stringify([null])), RestoreValidationError);
  assert.throws(() => normalizeRestoredTargets(JSON.stringify([42])), RestoreValidationError);
  assert.throws(() => normalizeRestoredHistory(JSON.stringify(['oops'])), RestoreValidationError);
});

// ── source boolean scalars and semantic `id` identity ─────────────────────

test('restored source boolean scalars coerce to canonical booleans (no truthiness divergence)', async () => {
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([
      { id: 's1', kind: 'url', url: 'https://example.com', enabled: 'false', declined: 'true', proxyFailed: {}, assessing: 'yes' },
      { id: 's2', kind: 'url', url: 'https://example.org', enabled: true, declined: true, proxyFailed: false, assessing: false }
    ])
  }), 'pw');

  const [first, second] = JSON.parse(opened.data.atlas_ai_gen_urls);
  // A hostile string "false" is truthy in JS; canonical normalization must make
  // it a real `false` so `filter(s => s.enabled)` does not activate it.
  assert.equal(first.enabled, false);
  assert.equal(first.declined, false);
  assert.equal(first.proxyFailed, false);
  assert.equal(first.assessing, false);
  // Canonical literal booleans survive byte-for-byte.
  assert.equal(second.enabled, true);
  assert.equal(second.declined, true);
  assert.equal(second.proxyFailed, false);
  assert.equal(second.assessing, false);

  // Effective consumer behavior: only the genuinely-enabled source is selected.
  const enabled = JSON.parse(opened.data.atlas_ai_gen_urls).filter((s) => s.enabled);
  assert.deepEqual(enabled.map((s) => s.id), ['s2']);
});

test('restored source missing a semantic id rejects the restore atomically', async () => {
  for (const entry of [
    { kind: 'url', url: 'https://example.com' },
    { id: null, kind: 'url', url: 'https://example.com' },
    { id: '', kind: 'url', url: 'https://example.com' },
    { id: '   ', kind: 'url', url: 'https://example.com' }
  ]) {
    await assert.rejects(
      () => openBackup(bundle({ atlas_ai_gen_urls: JSON.stringify([entry]) }), 'pw'),
      /Research source entry 1 .* is missing a required id\./,
      `missing id ${JSON.stringify(entry)} must be rejected`
    );
  }
});

test('restored source duplicate ids reject the restore atomically (no silent hydration drop)', async () => {
  await assert.rejects(
    () => openBackup(bundle({
      atlas_ai_gen_urls: JSON.stringify([
        { id: 'dup', kind: 'url', url: 'https://example.com' },
        { id: 'dup', kind: 'paste', title: 'Second' }
      ])
    }), 'pw'),
    /duplicates the id "dup"\./
  );
});

test('restored source boolean coercion and id identity survive candidate → apply', async () => {
  reset();
  const opened = await openBackup(bundle({
    atlas_ai_gen_urls: JSON.stringify([
      { id: 's1', kind: 'url', url: 'https://example.com', enabled: 'false' }
    ])
  }), 'pw');
  const candidate = buildRestoreCandidate(opened, {});
  // applyBackup is the persistence boundary for the sources string; assert the
  // reviewed candidate carries the canonical boolean all the way through.
  assert.equal(JSON.parse(candidate.normalizedBackup.data.atlas_ai_gen_urls)[0].enabled, false);
});