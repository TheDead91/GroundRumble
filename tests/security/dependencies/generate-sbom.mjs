#!/usr/bin/env node
// Reproducible CycloneDX 1.4 SBOM generator for GroundRumble.
//
// Reads the authoritative resolved dependency graph from package-lock.json
// (lockfileVersion 3) and emits a CycloneDX JSON document. No third-party
// dependency is required: only node:fs, node:crypto, and node:url are used.
//
// The lockfile, not package.json semver ranges, is the source of truth for
// resolved versions, resolved tarball URLs, integrity hashes, licenses, and the
// dependency edges (with Node-style nested-node_modules resolution).
//
// Usage (from repo root, Node >= 20.19):
//   node tests/security/dependencies/generate-sbom.mjs
// Output:
//   tests/security/dependencies/sbom.cdx.json

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const rootPackage = packages[''];
const rootVersion = rootPackage.version;

const purl = (name, version) =>
  `pkg:npm/${encodeURIComponent(name).replace(/%40/g, '@')}@${version}`;

const bomRefFor = (name, version) => purl(name, version);

const nameFor = (path) => path.split('node_modules/').pop();

// Resolve a declared dependency name from a package's lockfile path using
// Node's nested node_modules resolution order (closest node_modules first).
function resolveDep(parentPath, depName) {
  if (parentPath === '') {
    const cand = `node_modules/${depName}`;
    return packages[cand] ? cand : null;
  }
  let dir = parentPath;
  while (true) {
    const cand = `${dir}/node_modules/${depName}`;
    if (packages[cand]) return cand;
    const idx = dir.lastIndexOf('/node_modules/');
    if (idx === -1) break;
    dir = dir.slice(0, idx);
  }
  const rootCand = `node_modules/${depName}`;
  return packages[rootCand] ? rootCand : null;
}

const normalizeLicense = (raw) => {
  const str = String(raw || '').trim();
  if (!str) return null;
  const complex = /( AND | OR |[()])/.test(str);
  return complex ? { expression: str } : { license: { id: str } };
};

const parseIntegrity = (sri) => {
  const out = [];
  const str = String(sri || '');
  for (const part of str.split(/\s+/)) {
    const m = /^([A-Za-z0-9]+)-([A-Za-z0-9+/=]+)$/.exec(part);
    if (!m) continue;
    const alg = m[1].toLowerCase();
    const map = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };
    out.push({ alg: map[alg] || alg.toUpperCase(), content: m[2] });
  }
  return out;
};

const components = [];
const componentSeen = new Set(); // dedupe by bom-ref (name@version)
const edges = new Map(); // bom-ref -> Set(bom-ref)
const rootBomRef = bomRefFor(rootPackage.name, rootVersion);

for (const [path, entry] of Object.entries(packages)) {
  if (path === '') continue;
  const name = entry.name || nameFor(path);
  const version = entry.version;
  const ref = bomRefFor(name, version);

  if (componentSeen.has(ref)) {
    // Same package/version installed in more than one location; merge its
    // declared edges into the single SBOM component below.
    const childRefs = edges.get(ref) || new Set();
    for (const depName of Object.keys(entry.dependencies || {})) {
      const childPath = resolveDep(path, depName);
      if (!childPath) continue;
      const child = packages[childPath];
      childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
    }
    for (const depName of Object.keys(entry.optionalDependencies || {})) {
      const childPath = resolveDep(path, depName);
      if (!childPath) continue;
      const child = packages[childPath];
      childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
    }
    if (childRefs.size) edges.set(ref, childRefs);
    continue;
  }
  componentSeen.add(ref);

  const comp = {
    type: 'library',
    'bom-ref': ref,
    name,
    version,
    purl: purl(name, version),
  };

  const licenses = normalizeLicense(entry.license);
  if (licenses) comp.licenses = [licenses];

  if (entry.resolved) {
    comp.externalReferences = [{ type: 'distribution', url: entry.resolved }];
  }

  const hashes = parseIntegrity(entry.integrity);
  if (hashes.length) comp.hashes = hashes;

  const props = [];
  if (entry.dev) props.push({ name: 'npm:development', value: 'true' });
  if (entry.optional) props.push({ name: 'npm:optional', value: 'true' });
  if (entry.bin) props.push({ name: 'npm:hasBin', value: 'true' });
  if (entry.hasInstallScript) props.push({ name: 'npm:hasInstallScript', value: 'true' });
  if (entry.deprecated) props.push({ name: 'npm:deprecated', value: String(entry.deprecated) });
  if (props.length) comp.properties = props;

  components.push(comp);

  const childRefs = new Set();
  for (const depName of Object.keys(entry.dependencies || {})) {
    const childPath = resolveDep(path, depName);
    if (!childPath) continue;
    const child = packages[childPath];
    childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
  }
  for (const depName of Object.keys(entry.optionalDependencies || {})) {
    const childPath = resolveDep(path, depName);
    if (!childPath) continue;
    const child = packages[childPath];
    childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
  }
  if (childRefs.size) edges.set(ref, childRefs);
}

// Root component dependency edges.
{
  const childRefs = new Set();
  for (const depName of Object.keys(lock.packages[''].dependencies || {})) {
    const childPath = resolveDep('', depName);
    if (!childPath) continue;
    const child = packages[childPath];
    childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
  }
  for (const depName of Object.keys(lock.packages[''].devDependencies || {})) {
    const childPath = resolveDep('', depName);
    if (!childPath) continue;
    const child = packages[childPath];
    childRefs.add(bomRefFor(child.name || nameFor(childPath), child.version));
  }
  if (childRefs.size) edges.set(rootBomRef, childRefs);
}

const deps = [...edges.entries()]
  .map(([ref, refs]) => ({ ref, dependsOn: [...refs].sort() }))
  .sort((a, b) => a.ref.localeCompare(b.ref));

const serial = createHash('sha256')
  .update(JSON.stringify({ components, deps, lockfileVersion: lock.lockfileVersion }))
  .digest('hex');

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.4',
  serialNumber: `urn:uuid:${serial.slice(0, 8)}-${serial.slice(8, 12)}-${serial.slice(12, 16)}-${serial.slice(16, 20)}-${serial.slice(20, 32)}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: 'GroundRumble',
        name: 'groundrumble-sbom-generator',
        version: '1.0.0',
      },
    ],
    component: {
      type: 'application',
      'bom-ref': rootBomRef,
      name: rootPackage.name,
      version: rootVersion,
      purl: purl(rootPackage.name, rootVersion),
      licenses: [{ license: { id: 'MIT' } }],
    },
  },
  components: components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
  dependencies: deps,
};

const outPath = join(here, 'sbom.cdx.json');
writeFileSync(outPath, JSON.stringify(bom, null, 2) + '\n');
process.stdout.write(
  `Wrote ${components.length} components and ${deps.length} dependency edges to ${outPath}\n`
);
