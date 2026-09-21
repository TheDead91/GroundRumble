// Contract for the pure ATLAS parse module:
//   src/utils/atlas-parse.js → loadAtlasYaml / uniqBySource / buildAtlasMatrix
// The pure YAML/matrix parse cluster is dependency-free — no fetch, no globals,
// node-testable — while src/utils/api/atlas-sync.js keeps every byte of network
// behavior (pointer/v6/legacy fetch order, timeouts, redirect policy, source
// excerpt streaming), imports the cluster and facade re-exports it so every
// existing specifier keeps resolving (tests/atlas-sync.integration.test.mjs and
// tests/api-core.integration.test.mjs stay untouched and green).
//
// Behavioral cases run the REAL module: the js-yaml dynamic-import loader, the
// source-keyed dedupe with table resolution, the legacy v5 array path, the v6
// tactic/technique/relationships join (placeTechnique, specializes parent
// linking, sub-technique keying) and both version defaults must all hold.
//
// js-yaml is a declared runtime dependency (package.json ^5.2.3) and the same
// one tests/atlas-sync.integration.test.mjs already requires; nothing here needs a
// server, a browser or the network. Standalone under bare `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasYaml, uniqBySource, buildAtlasMatrix } from '../src/utils/atlas-parse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MODULE_PATH = 'src/utils/atlas-parse.js';
const SYNC_PATH = 'src/utils/api/atlas-sync.js';
const SOURCE_POLICY_PATH = 'src/utils/source-url-policy.js';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const moduleSource = readSource(MODULE_PATH);
const syncSource = readSource(SYNC_PATH);
const syncLines = syncSource.split('\n').length;

const countStr = (source, needle) => source.split(needle).length - 1;
const norm = (text) => text.replace(/\s+/g, ' ').trim();

// Deterministic YAML fixtures.
const V6_YAML = `version: "2026.07"
tactics:
  TA0001:
    name: Recon
    description: recon tactic
  TA0002:
    name: Impact
    description: impact tactic
techniques:
  AML.T0001:
    name: T1
    description: dd1
    platforms: [linux, windows]
    maturity: stable
  AML.T0002:
    name: T2
    description: dd2
relationships:
  AML.T0001:
    mitigates:
      - source: M1
      - source: M1
      - source: M2
  AML.T0002:
    achieves:
      - target: TA0002
  AML.T0003:
    specializes:
      - target: AML.T0001
        source: AML.T0003
      - target: AML.T0001
        source: AML.T0003
mitigations:
  M1:
    id: M1
    name: Mit One
  M2:
    id: M2
    name: Mit Two
`;
const LEGACY_YAML = `matrices:
  - tactics:
      - id: TA05
        name: Discovery
relationships:
  - source_ref: AML.T0001
    target_ref: TA05
    relationship_type: achieves
techniques:
  AML.T0001:
    name: T1
    description: d1
`;

// ---------------------------------------------------------------------------
// Contract pins — module shape, purity, signature and the facade adoption
// ---------------------------------------------------------------------------

test('The module exports exactly the three parse helpers with the declared signatures', () => {
  const sig = norm(moduleSource);
  assert.match(sig, /export const loadAtlasYaml = async \(text\) => \{/, 'loadAtlasYaml keeps its carried signature');
  assert.match(sig, /export const uniqBySource = \(entries, table\) => \{/, 'uniqBySource keeps its carried signature');
  assert.match(sig, /export const buildAtlasMatrix = \(atlas\) => \{/, 'buildAtlasMatrix keeps its carried signature');
  assert.equal(countStr(moduleSource, 'export const'), 3, 'exactly three exports — no default, no extras');
  assert.doesNotMatch(moduleSource, /export default/, 'no default export');
});

test('The module is dependency-free — no top-level imports, no fetch, no globals', () => {
  assert.doesNotMatch(moduleSource, /^import /m, 'no top-level import statements (js-yaml stays dynamic in-function)');
  assert.doesNotMatch(moduleSource, /\brequire\(/, 'no require calls');
  assert.doesNotMatch(moduleSource, /\bfetch\(/, 'no fetch — pure per playbook (network stays in atlas-sync.js)');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'globalThis.']) {
    assert.equal(countStr(moduleSource, forbidden), 0, `the pure module never touches ${forbidden}`);
  }
});

test('LoadAtlasYaml resolves js-yaml dynamically inside the function', () => {
  const body = norm(moduleSource);
  assert.ok(body.includes("const { load: yamlLoad } = await import('js-yaml');"), 'the dynamic js-yaml import is carried');
  assert.ok(body.includes('return yamlLoad(text);'), 'the load delegation is carried');
});

test('The carried buildAtlasMatrix machinery is verbatim — placeTechnique join, specializes parent linking, v5 fallback', () => {
  const body = norm(moduleSource);
  for (const needle of [
    'const seen = new Set();',
    'const key = entry?.source ?? JSON.stringify(entry);',
    'out.push(table?.[entry?.source] ?? entry);',
    'if (Array.isArray(atlas?.matrices)) {',
    "throw new Error('Invalid ATLAS YAML: missing tactics');",
    'const placeTechnique = (tacticId, record) => {',
    'mitigations: uniqBySource(rel?.mitigates, atlas.mitigations),',
    'maturity: tech.maturity,',
    'if (achieve?.target) placeTechnique(achieve.target, record);',
    'const parent = recordById[sp?.target ?? techId];',
    'parent.subtechniques.push(techniquesMap?.[sp?.source] ?? sp);',
    "return { matrix: [...byId.values()], version: atlas.version || 'legacy-v5' };",
    "return { matrix, version: atlas.version || '' };",
  ]) {
    assert.ok(body.includes(norm(needle)), `carried machinery keeps …${needle.slice(0, 60)}…`);
  }
});

test('Atlas-sync adopts the module — import + facade re-export, zero local definitions, network shell intact', () => {
  assert.match(syncSource, /import \{ loadAtlasYaml, buildAtlasMatrix \} from '\.\.\/atlas-parse\.js';/, 'atlas-sync imports the moved cluster');
  assert.match(syncSource, /export \{ loadAtlasYaml, uniqBySource, buildAtlasMatrix \} from '\.\.\/atlas-parse\.js';/, 'the facade re-export keeps every specifier pin green');
  for (const name of ['loadAtlasYaml', 'uniqBySource', 'buildAtlasMatrix']) {
    assert.equal(countStr(syncSource, `const ${name} = `), 0, `${name} left atlas-sync.js`);
  }
  // The network shell that stays: URL consts, deadline machine, redirect
  // policy, both parse call sites and both no-tactics guards.
  const body = norm(syncSource);
  for (const needle of [
    "const ATLAS_POINTER_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-latest.yaml';",
    "const ATLAS_LEGACY_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml';",
    'const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);',
    "redirect: 'manual' };",
    'const built = buildAtlasMatrix(atlas);',
    "pointerVersion = ptrText.replace(/\\.ya?ml$/i, '');",
    'return { matrix: built.matrix, version: pointerVersion || built.version };',
  ]) {
    assert.ok(body.includes(norm(needle)), `the network shell keeps …${needle.slice(0, 60)}…`);
  }
  assert.equal(countStr(syncSource, "throw new Error('Invalid ATLAS YAML: no tactics found');"), 2, 'both no-tactics guards stay in atlas-sync');
  assert.equal(countStr(syncSource, 'await loadAtlasYaml('), 2, 'both fetch paths parse through the imported loader');
});

test('Atlas-sync keeps its network + excerpt shell, strictly net-smaller (bounded gates)', () => {
  const sourcePolicyExists = existsSync(join(root, SOURCE_POLICY_PATH));
  const lowerBound = sourcePolicyExists ? 300 : 350;
  assert.ok(syncLines > lowerBound, `atlas-sync.js keeps its network + excerpt surface (landed ${syncLines} lines)`);
  if (sourcePolicyExists) {
    const sourcePolicyLines = readSource(SOURCE_POLICY_PATH).split('\n').length;
    assert.ok(sourcePolicyLines > 40, `source-url-policy.js carries the sanctioned T06 policy shed (${sourcePolicyLines} lines)`);
  }
  assert.ok(syncLines < 568, `atlas-sync.js shrinks by the moved parse + excerpt clusters (landed ${syncLines} lines, expected ~390 after T12)`);
});

// ---------------------------------------------------------------------------
// Behavior — loadAtlasYaml (real js-yaml, same dependency class as
// tests/atlas-sync.integration.test.mjs)
// ---------------------------------------------------------------------------

test('LoadAtlasYaml parses a v6 document to the exact baseline object', async () => {
  assert.deepEqual(await loadAtlasYaml(V6_YAML), {
    version: '2026.07',
    tactics: { TA0001: { name: 'Recon', description: 'recon tactic' }, TA0002: { name: 'Impact', description: 'impact tactic' } },
    techniques: {
      'AML.T0001': { name: 'T1', description: 'dd1', platforms: ['linux', 'windows'], maturity: 'stable' },
      'AML.T0002': { name: 'T2', description: 'dd2' },
    },
    relationships: {
      'AML.T0001': { mitigates: [{ source: 'M1' }, { source: 'M1' }, { source: 'M2' }] },
      'AML.T0002': { achieves: [{ target: 'TA0002' }] },
      'AML.T0003': { specializes: [{ target: 'AML.T0001', source: 'AML.T0003' }, { target: 'AML.T0001', source: 'AML.T0003' }] },
    },
    mitigations: { M1: { id: 'M1', name: 'Mit One' }, M2: { id: 'M2', name: 'Mit Two' } },
  });
});

test('LoadAtlasYaml preserves YAML scalar types and surfaces js-yaml parse errors verbatim', async () => {
  assert.deepEqual(await loadAtlasYaml('a: 1\nb: "x"\nc: true\nd: null\n'), { a: 1, b: 'x', c: true, d: null });
  await assert.rejects(
    loadAtlasYaml('\tfoo: 1'),
    (err) => err.message.startsWith('end of the stream or a document separator is expected (1:5)')
  );
});

// ---------------------------------------------------------------------------
// Behavior — uniqBySource's dedupe semantics
// ---------------------------------------------------------------------------

test('UniqBySource dedupes by source id, resolves through the table and falls back to identity', () => {
  const table = { M1: { id: 'M1', name: 'Mit One' }, M2: { id: 'M2', name: 'Mit Two' } };
  assert.deepEqual(uniqBySource([{ source: 'M1', x: 1 }, { source: 'M1', x: 2 }, { source: 'M2' }], table), [
    { id: 'M1', name: 'Mit One' },
    { id: 'M2', name: 'Mit Two' },
  ]);
  assert.deepEqual(uniqBySource('nope', table), [], 'non-array input yields an empty list');
  assert.deepEqual(uniqBySource([{ k: 1 }, { k: 1 }, { k: 2 }], table), [{ k: 1 }, { k: 2 }], 'sourceless entries dedupe by their JSON identity');
  assert.deepEqual(uniqBySource([], table), []);
  assert.deepEqual(uniqBySource([{ source: 'M1' }], undefined), [{ source: 'M1' }], 'without a table the entry passes through');
});

// ---------------------------------------------------------------------------
// Behavior — buildAtlasMatrix's v6 tactic/technique/relationships join
// ---------------------------------------------------------------------------

test('V6 path — achieves joins place techniques under tactics, mitigates dedupe through the table', () => {
  assert.deepEqual(buildAtlasMatrix({
    version: '2026.07',
    tactics: { TA0001: { name: 'Recon', description: 'd' }, TA0002: { name: 'Impact', description: 'd2' } },
    techniques: {
      'AML.T0001': { name: 'T1', description: 'dd1', platforms: ['linux'], maturity: 'stable' },
      'AML.T0002': { name: 'T2', description: 'dd2' },
      'AML.T0003': { name: 'T3', description: 'dd3' },
    },
    relationships: {
      'AML.T0001': { mitigates: [{ source: 'M1' }, { source: 'M1' }, { source: 'M2' }] },
      'AML.T0002': { achieves: [{ target: 'TA0002' }] },
      'AML.T0003': { specializes: [{ target: 'AML.T0001', source: 'AML.T0003' }, { target: 'AML.T0001', source: 'AML.T0003' }, { target: 'GHOST', source: 'X' }] },
    },
    mitigations: { M1: { id: 'M1', name: 'Mit One' }, M2: { id: 'M2', name: 'Mit Two' } },
  }), {
    matrix: [
      { id: 'TA0001', name: 'Recon', description: 'd', techniques: [] },
      {
        id: 'TA0002', name: 'Impact', description: 'd2',
        techniques: [{ id: 'AML.T0002', name: 'T2', description: 'dd2', mitigations: [], subtechniques: [], platforms: [], maturity: undefined }],
      },
    ],
    version: '2026.07',
  });
});

test('V6 path — specializes hang the full sub-technique record off the achieving parent (deduped), ghost targets skipped', () => {
  // The parent link is observable when the parent itself achieves a tactic:
  // its record lands in the tactic bucket WITH the deduped sub-technique list
  // (the full techniquesMap record, which carries no id) and the
  // table-resolved mitigations.
  assert.deepEqual(buildAtlasMatrix({
    tactics: { TA0001: { name: 'Recon', description: 'd' } },
    techniques: {
      'AML.T0001': { name: 'T1', description: 'dd1', platforms: ['linux'], maturity: 'stable' },
      'AML.T0003': { name: 'T3', description: 'dd3' },
    },
    relationships: {
      'AML.T0001': { achieves: [{ target: 'TA0001' }], mitigates: [{ source: 'M1' }, { source: 'M1' }] },
      'AML.T0003': { specializes: [{ target: 'AML.T0001', source: 'AML.T0003' }, { target: 'AML.T0001', source: 'AML.T0003' }, { target: 'GHOST', source: 'X' }] },
    },
    mitigations: { M1: { id: 'M1', name: 'Mit One' } },
  }), {
    matrix: [{
      id: 'TA0001', name: 'Recon', description: 'd',
      techniques: [{
        id: 'AML.T0001', name: 'T1', description: 'dd1',
        mitigations: [{ id: 'M1', name: 'Mit One' }],
        subtechniques: [{ name: 'T3', description: 'dd3' }],
        platforms: ['linux'],
        maturity: 'stable',
      }],
    }],
    version: '',
  });
});

test('V6 path — a parent that achieves nothing keeps an empty bucket even with specializing children', async () => {
  const { matrix } = buildAtlasMatrix(await loadAtlasYaml(V6_YAML));
  assert.deepEqual(matrix.map((t) => t.id), ['TA0001', 'TA0002']);
  assert.deepEqual(matrix[0].techniques, [], 'T1 achieves nothing — it is only reachable as a specializes parent');
  assert.deepEqual(matrix[1].techniques.map((t) => t.id), ['AML.T0002'], 'T2 joins TA0002 through its achieves entry');
});

test('V6 path — techniques-only documents keep empty buckets and the empty-string version default', () => {
  assert.deepEqual(buildAtlasMatrix({
    tactics: { TA1: { name: 'R', description: 'rd' } },
    techniques: { 'AML.T0009': { name: 'Solo', description: 'sd' } },
  }), { matrix: [{ id: 'TA1', name: 'R', description: 'rd', techniques: [] }], version: '' });
  assert.deepEqual(buildAtlasMatrix({ tactics: { TA1: { name: 'R' } } }), {
    matrix: [{ id: 'TA1', name: 'R', description: undefined, techniques: [] }],
    version: '',
  });
});

test('V6 path — a document without tactics throws the structural error', () => {
  assert.throws(() => buildAtlasMatrix({}), { message: 'Invalid ATLAS YAML: missing tactics' });
});

// ---------------------------------------------------------------------------
// Behavior — buildAtlasMatrix's legacy v5 array path
// ---------------------------------------------------------------------------

test('V5 path — achieves-only join with duplicate entries kept, unknown targets materialize placeholder tactics', () => {
  assert.deepEqual(buildAtlasMatrix({
    matrices: [
      { tactics: [{ id: 'TA05', name: 'Discovery' }, { id: 'TA06', name: 'Collection' }] },
      { tactics: [{ id: 'TA09', name: 'IGNORED second matrix' }] },
    ],
    relationships: [
      { source_ref: 'AML.T0001', target_ref: 'TA05', relationship_type: 'achieves' },
      { source_ref: 'AML.T0001', target_ref: 'TA05', relationship_type: 'achieves' },
      { source_ref: 'AML.T0002', target_ref: 'TA05', relationship_type: 'achieves' },
      { source_ref: 'AML.T0009', target_ref: 'TA99', relationship_type: 'achieves' },
      { source_ref: 'X', target_ref: 'TA05', relationship_type: 'mitigates' },
      { source_ref: 'Y', relationship_type: 'achieves' },
    ],
    techniques: { 'AML.T0001': { name: 'T1', description: 'd1' }, 'AML.T0002': { name: 'T2', description: 'd2' } },
    version: 'v5.0',
  }), {
    matrix: [
      {
        id: 'TA05', name: 'Discovery', description: '',
        techniques: [
          { id: 'AML.T0001', name: 'T1', description: 'd1', mitigations: [], subtechniques: [], platforms: [] },
          { id: 'AML.T0001', name: 'T1', description: 'd1', mitigations: [], subtechniques: [], platforms: [] },
          { id: 'AML.T0002', name: 'T2', description: 'd2', mitigations: [], subtechniques: [], platforms: [] },
        ],
      },
      { id: 'TA06', name: 'Collection', description: '', techniques: [] },
      {
        id: 'TA99', name: '', description: '',
        techniques: [{ id: 'AML.T0009', name: undefined, description: undefined, mitigations: [], subtechniques: [], platforms: [] }],
      },
    ],
    version: 'v5.0',
  });
});

test('V5 path — the legacy-v5 version default and the empty-matrix shape', () => {
  assert.deepEqual(buildAtlasMatrix({ matrices: [{ tactics: [] }], relationships: [] }), { matrix: [], version: 'legacy-v5' });
  assert.deepEqual(buildAtlasMatrix({ matrices: [{ tactics: [] }], relationships: [], version: 'v5.0' }), { matrix: [], version: 'v5.0' });
});

test('Integration — the legacy YAML document flows through loader + builder exactly as at baseline', async () => {
  assert.deepEqual(buildAtlasMatrix(await loadAtlasYaml(LEGACY_YAML)), {
    matrix: [{
      id: 'TA05', name: 'Discovery', description: '',
      techniques: [{ id: 'AML.T0001', name: 'T1', description: 'd1', mitigations: [], subtechniques: [], platforms: [] }],
    }],
    version: 'legacy-v5',
  });
});
