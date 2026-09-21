// Contract for the provider-record normalization cluster:
// src/utils/provider-record.js (pure, node-testable) owns the exact limit
// constants, strict/lenient normalization, dedupe semantics and
// validateProviders — plus the vault.js integration contract (vault imports
// the cluster for its load/unlock/protect paths and re-exports
// validateProviders for compatibility; ProvidersContext and useBackupFlow
// consume validateProviders directly from provider-record).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeIndexedDB, installLocalStorage } from './helpers/dom.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const countStr = (src, needle) => src.split(needle).length - 1;

const { reset: resetDB } = installFakeIndexedDB();
installLocalStorage();

const mod = await import('../src/utils/provider-record.js');
const vault = await import('../src/utils/vault.js');
const { normalizeProvider, normalizeProviders, validateProviders } = mod;

const base = { id: 'cp', name: 'Gateway', endpoint: 'https://example.com/v1', connector: 'openai', models: ['m1'] };

test('Provider-record.js carries the exact limit constants', () => {
  const modSrc = readSource('src/utils/provider-record.js');
  assert.equal(countStr(modSrc, 'MAX_PROVIDER_ID = 100'), 1, 'MAX_PROVIDER_ID limit constant');
  assert.equal(countStr(modSrc, 'MAX_PROVIDER_NAME = 200'), 1, 'MAX_PROVIDER_NAME limit constant');
  assert.equal(countStr(modSrc, 'MAX_PROVIDER_FIELD = 200000'), 1, 'MAX_PROVIDER_FIELD limit constant');
  assert.equal(typeof normalizeProvider, 'function', 'normalizeProvider is exported');
  assert.equal(typeof normalizeProviders, 'function', 'normalizeProviders is exported');
  assert.equal(typeof validateProviders, 'function', 'validateProviders is exported');
});

test('NormalizeProvider strict mode returns the exact baseline shape', () => {
  const out = normalizeProvider({
    id: ' cp ', name: ' Gw ', endpoint: ' https://e.com/v1 ', connector: 'openai', models: [' m '],
    rpm: '7', method: 'get', headers: '{"X":"y"}', modelsEndpoint: ' https://e.com/models ',
    bodyTemplate: '', responsePath: '  data.x  ', notes: ' n ', enabled: false, allowPrivate: true
  }, true);
  assert.deepEqual(out, {
    id: 'cp', name: 'Gw', endpoint: 'https://e.com/v1', connector: 'openai', models: ['m'],
    apiKey: '', rpm: 7, modelsEndpoint: 'https://e.com/models', method: 'GET', headers: '{"X":"y"}',
    bodyTemplate: '', responsePath: 'data.x', notes: ' n ', enabled: false, allowPrivate: true
  });
  assert.equal(normalizeProvider({ ...base, notes: ' n ' }, true).notes, ' n ', 'notes is String-coerced but NOT trimmed (quirk, pinned)');
  assert.equal(normalizeProvider({ ...base }, true).method, 'POST', 'method defaults to POST');
  assert.equal(normalizeProvider({ ...base, method: 'put' }, true).method, 'PUT', 'method uppercases');
  assert.equal(normalizeProvider({ ...base, rpm: -5 }, true).rpm, 0, 'rpm floors at 0');
  assert.equal(normalizeProvider({ ...base, rpm: 999999 }, true).rpm, 100000, 'rpm caps at 100000');
  assert.equal(normalizeProvider({ ...base, rpm: 'abc' }, true).rpm, 0, 'rpm non-numeric defaults to 0');
  assert.equal(normalizeProvider({ ...base }, true).responsePath, 'choices.0.message.content', 'absent responsePath defaults');
  assert.equal(normalizeProvider({ ...base, responsePath: '  ' }, true).responsePath, '', 'empty responsePath trims to empty');
  assert.equal(normalizeProvider({ ...base }, true).enabled, true, 'enabled defaults true');
  assert.equal(normalizeProvider({ ...base, enabled: false }, true).enabled, false, 'explicit enabled:false is kept');
  assert.equal(normalizeProvider({ ...base, allowPrivate: true }, true).allowPrivate, true, 'allowPrivate only true when exactly true');
  assert.equal(normalizeProvider({ ...base, allowPrivate: 'yes' }, true).allowPrivate, false, 'allowPrivate truthy-non-true is false');
  assert.equal(normalizeProvider({ ...base, headers: { A: 'b' } }, true).headers, '[object Object]', 'object headers String()-coerce (quirk, pinned)');
  assert.equal(normalizeProvider({ ...base, customField: 'kept' }, true).customField, 'kept', 'unknown fields ride the spread passthrough');
});

test('NormalizeProvider strict rejections return null (structural/field/url/method/headers/body)', () => {
  for (const bad of [null, undefined, 'str', 42, [1, 2]]) {
    assert.equal(normalizeProvider(bad, true), null, `structural invalid: ${JSON.stringify(bad)}`);
  }
  for (const patch of [{ id: undefined }, { id: '  ' }, { name: undefined }, { endpoint: undefined }, { connector: undefined }, { connector: 'grpc' }, { models: undefined }, { models: 'm1' }, { models: [42] }, { models: ['   '] }]) {
    assert.equal(normalizeProvider({ ...base, ...patch }, true), null, `field invalid: ${JSON.stringify(patch)}`);
  }
  for (const patch of [
    { endpoint: 'not-a-url' }, { endpoint: 'file:///tmp' }, { endpoint: 'example.com/x' },
    { method: 'DELETE' }, { method: 'TRACE' },
    { modelsEndpoint: '%%%' }, { modelsEndpoint: 'ftp://x' },
    { headers: '{bad' }, { headers: '[]' }, { headers: 42 }, { headers: { X: 1 } },
    { headers: JSON.stringify({ ['k'.repeat(201)]: 'v' }) },
    { headers: { X: 'v'.repeat(200001) } },
    { connector: 'raw', bodyTemplate: '{bad' },
    { bodyTemplate: 'x'.repeat(200001) }
  ]) {
    assert.equal(normalizeProvider({ ...base, ...patch }, true), null, `validation invalid: ${JSON.stringify(patch)}`);
  }
  assert.ok(normalizeProvider({ ...base, connector: 'openai', bodyTemplate: '{bad' }, true), 'non-raw bodyTemplate skips JSON validation');
});

test('The three clamp limits sit exactly at 100/200/200000 (boundary table)', () => {
  assert.ok(normalizeProvider({ ...base, id: 'i'.repeat(100) }, true), 'id at 100 accepted');
  assert.equal(normalizeProvider({ ...base, id: 'i'.repeat(101) }, true), null, 'id over 100 rejected');
  assert.ok(normalizeProvider({ ...base, name: 'n'.repeat(200) }, true), 'name at 200 accepted');
  assert.equal(normalizeProvider({ ...base, name: 'n'.repeat(201) }, true), null, 'name over 200 rejected');
  assert.ok(normalizeProvider({ ...base, endpoint: 'https://example.com/' + 'a'.repeat(199980) }, true), 'endpoint at 200000 accepted');
  assert.equal(normalizeProvider({ ...base, endpoint: 'https://example.com/' + 'a'.repeat(199981) }, true), null, 'endpoint over 200000 rejected');
  assert.ok(normalizeProvider({ ...base, models: Array.from({ length: 500 }, (_, i) => 'm' + i) }, true), '500 models accepted');
  assert.equal(normalizeProvider({ ...base, models: Array.from({ length: 501 }, (_, i) => 'm' + i) }, true), null, '501 models rejected');
  assert.ok(normalizeProvider({ ...base, models: ['m'.repeat(500)] }, true), 'model string at 500 chars accepted');
  assert.equal(normalizeProvider({ ...base, models: ['m'.repeat(501)] }, true), null, 'model string over 500 chars rejected');
  assert.ok(normalizeProvider({ ...base, notes: 'n'.repeat(200000) }, true), 'notes at 200000 accepted');
  assert.equal(normalizeProvider({ ...base, notes: 'n'.repeat(200001) }, true), null, 'notes over 200000 rejected');
});

test('NormalizeProvider lenient mode falls through verbatim on invalids', () => {
  const broken = { id: ' a ', name: 'Nope' };
  assert.strictEqual(normalizeProvider(broken), broken, 'lenient invalid returns the ORIGINAL object');
  const overModels = { id: 'x', name: 'V', endpoint: 'https://a', connector: 'openai', models: Array.from({ length: 501 }, (_, i) => 'm' + i) };
  assert.strictEqual(normalizeProvider(overModels), overModels, 'lenient invalid returns the original verbatim (no defaults added)');
  assert.equal(normalizeProvider(null), null, 'lenient null input stays null');
});

test('NormalizeProviders dedupes by trimmed id (first wins) and empties non-arrays', () => {
  assert.deepEqual(normalizeProviders('nope'), [], 'non-array input -> []');
  assert.deepEqual(normalizeProviders(null), [], 'null input -> []');
  const dup = normalizeProviders([
    { id: 'd1', name: 'A', endpoint: 'https://a', connector: 'openai', models: [] },
    { id: 'd1', name: 'B', endpoint: 'https://b', connector: 'openai', models: [] }
  ]);
  assert.deepEqual(dup.map((p) => p.name), ['A'], 'duplicate ids keep the first occurrence');
  const dupTrim = normalizeProviders([
    { id: 'a', name: 'V', endpoint: 'https://a', connector: 'openai', models: [] },
    { id: ' a ', name: 'V2', endpoint: 'https://b', connector: 'openai', models: [] }
  ]);
  assert.deepEqual(dupTrim.map((p) => p.name), ['V'], 'dedupe runs on trimmed ids');
  const mixed = normalizeProviders([{ id: ' a ', name: 'Nope' }, { id: 'a', name: 'V', endpoint: 'https://a', connector: 'openai', models: [] }]);
  assert.deepEqual(mixed.map((p) => p.name), ['Nope', 'V'], 'mixed set: invalid passthrough first, valid normalized second');
  const broken = { id: ' a ', name: 'Nope' };
  assert.ok(normalizeProviders([broken]).includes(broken), 'lenient invalid entries survive the filter');
});

test('ValidateProviders strict contract (exact messages, duplicates, boundaries)', () => {
  for (const bad of ['nope', null, undefined, {}, 42]) {
    assert.throws(() => validateProviders(bad), (e) => e.message === 'Providers must be an array.', `non-array input: ${JSON.stringify(bad)}`);
  }
  assert.throws(() => validateProviders([null]), (e) => e.message === 'The backup contains an invalid provider.');
  assert.throws(
    () => validateProviders([
      { id: 'same', name: 'A', endpoint: 'https://a', connector: 'openai', models: [] },
      { id: 'same', name: 'B', endpoint: 'https://b', connector: 'openai', models: [] }
    ]),
    (e) => e.message === 'The backup contains duplicate provider IDs.'
  );
  assert.throws(
    () => validateProviders([{ ...base, id: ' a ' }, { ...base, id: 'a' }]),
    (e) => e.message === 'The backup contains duplicate provider IDs.',
    'duplicate detection runs on trimmed ids'
  );
  assert.throws(() => validateProviders([{ ...base, id: 'i'.repeat(101) }]), (e) => e.message === 'The backup contains an invalid provider.');
  const out = validateProviders([{ ...base, headers: '{"X":"y"}', method: 'POST' }]);
  assert.equal(out[0].enabled, true);
  assert.equal(out[0].headers, '{"X":"y"}');
});

test('Vault.js re-exports validateProviders from the new module (same binding)', () => {
  assert.strictEqual(vault.validateProviders, validateProviders, 'vault.validateProviders IS the module binding (re-export, not a wrapper)');
  const vaultSrc = readSource('src/utils/vault.js');
  assert.ok(countStr(vaultSrc, 'provider-record') >= 1, 'vault.js wires the cluster through ./provider-record.js');
  assert.equal(countStr(vaultSrc, 'const normalizeProvider ='), 0, 'the cluster definition left vault.js');
  assert.equal(countStr(vaultSrc, 'const normalizeProviders ='), 0, 'normalizeProviders definition left vault.js');
  assert.equal(countStr(vaultSrc, 'validateProviders = (providers) =>'), 0, 'validateProviders body left vault.js (re-export has no body)');
  assert.ok(countStr(vaultSrc, 'normalizeProviders(') >= 5, 'vault\u2019s load/unlock/protect paths still normalize through the imported cluster');
});

test('Vault behavior is byte-identical through the moved cluster (adoption + save round-trip)', async () => {
  resetDB();
  await vault.loadVault();
  localStorage.setItem('atlas_providers', JSON.stringify([{
    id: '  cp1 ', name: ' Gateway ', endpoint: ' https://example.com/v1 ', connector: 'openai',
    models: [' m1 ', 'm2'], rpm: '50', method: 'get', headers: { 'X-Test': 'ok' },
    allowPrivate: false, extra: 'kept'
  }]));
  const rec = await vault.loadVault();
  assert.deepEqual(rec.providers, [normalizeProvider({
    id: '  cp1 ', name: ' Gateway ', endpoint: ' https://example.com/v1 ', connector: 'openai',
    models: [' m1 ', 'm2'], rpm: '50', method: 'get', headers: { 'X-Test': 'ok' },
    allowPrivate: false, extra: 'kept'
  })], 'the adoption path produces exactly the module\u2019s normalized shape');
  assert.equal(localStorage.getItem('atlas_providers'), null, 'adoption still drains the legacy key');

  resetDB();
  await vault.loadVault();
  await vault.saveVault({
    providers: [{ id: ' s1 ', name: ' Saved ', endpoint: ' https://s.com ', connector: 'raw', models: [' m '], rpm: 999999, method: 'patch', headers: { A: 'b' }, bodyTemplate: '{"q":1}' }]
  });
  const v = await vault.loadVault();
  assert.deepEqual(v.providers, [normalizeProvider({
    id: ' s1 ', name: ' Saved ', endpoint: ' https://s.com ', connector: 'raw', models: [' m '], rpm: 999999, method: 'patch', headers: { A: 'b' }, bodyTemplate: '{"q":1}'
  })], 'the save path produces exactly the module\u2019s normalized shape');
});

test('Consumers import validateProviders directly from provider-record', () => {
  const backupFlowSrc = readSource('src/hooks/useBackupFlow.js');
  const providersCtxSrc = readSource('src/context/ProvidersContext.jsx');
  assert.ok(backupFlowSrc.includes("import { validateProviders } from '../utils/provider-record.js';"), 'useBackupFlow imports validateProviders from provider-record');
  assert.ok(!backupFlowSrc.match(/import \{[^}]*validateProviders[^}]*\} from '\.\.\/utils\/vault';/), 'useBackupFlow does not import validateProviders through vault');
  assert.equal(countStr(backupFlowSrc, 'validateProviders('), 1, 'useBackupFlow keeps exactly one validateProviders call');
  assert.ok(providersCtxSrc.includes("import { validateProviders, resolveProviderLabel } from '../utils/provider-record.js';"), 'ProvidersContext imports validateProviders (and the id-resolving label helper) from provider-record');
  assert.ok(!providersCtxSrc.match(/import \{[^}]*validateProviders[^}]*\} from '\.\.\/utils\/vault';/), 'ProvidersContext does not import validateProviders through vault');
  assert.equal(countStr(providersCtxSrc, 'validateProviders('), 1, 'ProvidersContext keeps exactly one validateProviders call');
});

test('ResolveProviderLabel returns exact labels for string refs, object refs, and empty/null refs', () => {
  const { resolveProviderLabel } = mod;
  assert.equal(resolveProviderLabel(null, []), 'Not configured');
  assert.equal(resolveProviderLabel(undefined, []), 'Not configured');
  assert.equal(resolveProviderLabel('', []), 'Not configured');
  const cp = { id: 'groq', name: 'Groq', models: ['m1', 'm2'] };
  assert.equal(resolveProviderLabel('groq', [cp]), 'Groq (2 models)');
  assert.equal(resolveProviderLabel('missing', [cp]), 'missing', 'unknown string ref returns the ref itself');
  assert.equal(resolveProviderLabel(cp, [cp]), 'Groq (2 models)', 'object ref passes through');
  assert.equal(resolveProviderLabel({ id: 'x', name: 'X' }, []), 'X (0 models)', 'object ref with no models array');
  assert.equal(resolveProviderLabel(42, []), '42', 'non-string/non-object ref returns String(ref)');
});

test('NormalizeProvider lenient falls through for each rejection path individually', () => {
  const valid = { id: 'cp', name: 'GW', endpoint: 'https://e.com/v1', connector: 'openai', models: ['m1'] };
  const strictNull = (patch) => normalizeProvider({ ...valid, ...patch }, true);
  const lenientPass = (patch) => { const r = normalizeProvider({ ...valid, ...patch }); return r && r.id === valid.id; };

  assert.equal(strictNull({ connector: 'grpc' }), null, 'strict rejects invalid connector');
  assert.ok(lenientPass({ connector: 'grpc' }), 'lenient passes invalid connector verbatim');
  assert.equal(strictNull({ endpoint: 'not-a-url' }), null, 'strict rejects invalid URL');
  assert.ok(lenientPass({ endpoint: 'not-a-url' }), 'lenient passes invalid URL verbatim');
  assert.equal(strictNull({ modelsEndpoint: 'ftp://x' }), null, 'strict rejects invalid modelsEndpoint protocol');
  assert.ok(lenientPass({ modelsEndpoint: 'ftp://x' }), 'lenient passes invalid modelsEndpoint verbatim');
  assert.equal(strictNull({ modelsEndpoint: '%%%' }), null, 'strict rejects invalid modelsEndpoint URL');
  assert.ok(lenientPass({ modelsEndpoint: '%%%' }), 'lenient passes invalid modelsEndpoint verbatim');
  assert.equal(strictNull({ headers: '{bad' }), null, 'strict rejects unparseable JSON headers');
  assert.ok(lenientPass({ headers: '{bad' }), 'lenient passes unparseable JSON headers verbatim');
  assert.equal(strictNull({ headers: { X: 1 } }), null, 'strict rejects non-string header values');
  assert.ok(lenientPass({ headers: { X: 1 } }), 'lenient passes non-string header values verbatim');
  assert.equal(strictNull({ headers: '[]' }), null, 'strict rejects array headers');
  assert.ok(lenientPass({ headers: '[]' }), 'lenient passes array headers verbatim');
  assert.equal(strictNull({ headers: 42 }), null, 'strict rejects non-object/non-string headers');
  assert.ok(lenientPass({ headers: 42 }), 'lenient passes non-object headers verbatim');
  assert.equal(strictNull({ method: 'DELETE' }), null, 'strict rejects invalid method');
  assert.ok(lenientPass({ method: 'DELETE' }), 'lenient passes invalid method verbatim');
  assert.equal(strictNull({ connector: 'raw', bodyTemplate: '{bad' }), null, 'strict rejects invalid raw bodyTemplate');
  assert.ok(lenientPass({ connector: 'raw', bodyTemplate: '{bad' }), 'lenient passes invalid raw bodyTemplate verbatim');
  assert.equal(strictNull({ bodyTemplate: 'x'.repeat(200001) }), null, 'strict rejects over-length bodyTemplate');
  assert.ok(lenientPass({ bodyTemplate: 'x'.repeat(200001) }), 'lenient passes over-length bodyTemplate verbatim');
  assert.ok(strictNull({ modelsEndpoint: 'http://models.example/v1' }), 'modelsEndpoint accepts plain http (same allow-list as endpoint)');
  const httpModels = normalizeProvider({ ...valid, modelsEndpoint: 'http://models.example/v1' }, true);
  assert.equal(httpModels.modelsEndpoint, 'http://models.example/v1', 'http modelsEndpoint survives normalization');
  const ftpLenient = normalizeProvider({ ...valid, endpoint: 'ftp://files.example/v1' });
  assert.ok(ftpLenient && ftpLenient.id === 'cp', 'lenient mode falls through for a valid-but-wrong-protocol endpoint URL');
  assert.strictEqual(normalizeProvider({ ...valid, endpoint: 'ftp://files.example/v1' }, true), null, 'strict mode rejects a valid-but-non-http endpoint URL');
});

test('The extraction is strictly net-smaller with bounded masses', () => {
  const vaultLines = readSource('src/utils/vault.js').split('\n').length;
  const moduleLines = readSource('src/utils/provider-record.js').split('\n').length;
  // The provider-record facade may sit with or without its private IndexedDB
  // mechanics split into vault-idb.js.
  assert.ok((vaultLines > 280 && vaultLines < 390) || (vaultLines > 240 && vaultLines < 280), `vault.js sheds the provider cluster and may shed IDB mechanics (landed ${vaultLines}, baseline 409)`);
  assert.ok(vaultLines < 409, `vault.js is strictly net-smaller than its 409-line baseline (landed ${vaultLines})`);
  assert.ok(moduleLines > 75 && moduleLines < 140, `provider-record.js is the carried cluster core (landed ${moduleLines} lines, estimate 110)`);
});
