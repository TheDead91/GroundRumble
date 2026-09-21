// Characterization coverage for the per-call audit timeout plumbing —
// AUDIT_CALL_TIMEOUT_MS plus the combined-AbortSignal runner runWithTimeout.
//
// Node cannot import the JSX entry point, so — mirroring
// tests/demo-simulation.contract.test.mjs — this suite extracts the
// top-of-line `const runWithTimeout = ...` declaration from the source text
// of whichever module declares it and evaluates THAT EXACT TEXT in isolation.
// The extraction is deliberately location-agnostic: a recursive scan of src/
// enforces each symbol is declared EXACTLY ONCE tree-wide, so this pinning
// keeps guarding the plumbing regardless of which module hosts it:
//
// - green from either host (single copy in App.jsx or call-timeout.js),
// - red on ANY semantic drift of the runner, deadline-value drift, leftover
//   duplicate copies, or an unexpected extra definition site.
//
// Behavioral cases use real timers with millisecond-scale deadlines; no
// product code runs here beyond the extracted declaration text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Modules allowed to hold the declarations (App.jsx or the pure utility module).
const DECLARATION_HOSTS = [
  'src/App.jsx',
  'src/utils/call-timeout.js'
];

const SYMBOLS = ['AUDIT_CALL_TIMEOUT_MS', 'runWithTimeout'];

const declarationRe = (name) =>
  new RegExp(`^[ \\t]*(?:export )?const ${name}[ \\t]*=`, 'gm');

function listSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(abs));
    else files.push(abs);
  }
  return files;
}

function sourceOf(relPath) {
  const absPath = join(root, relPath);
  if (!existsSync(absPath)) return '';
  return readFileSync(absPath, 'utf8');
}

function declarationSites(name) {
  return listSourceFiles(join(root, 'src'))
    .map((absPath) => {
      const relPath = absPath.slice(root.length + 1);
      return { relPath, count: sourceOf(relPath).match(declarationRe(name))?.length ?? 0 };
    })
    .filter((site) => site.count > 0);
}

function singleSite(name) {
  const sites = declarationSites(name);
  assert.equal(
    sites.length,
    1,
    `${name} must be declared exactly once tree-wide, found: ${
      sites.map((s) => `${s.relPath} (${s.count}x)`).join(', ') || 'nowhere'
    }`
  );
  const [{ relPath }] = sites;
  assert.ok(
    DECLARATION_HOSTS.includes(relPath),
    `${name} must live in a known host (${DECLARATION_HOSTS.join(' or ')}), found: ${relPath}`
  );
  return relPath;
}

// Evaluates the exact declaration text (with any `export ` prefix stripped)
// so the characterization always exercises the REAL shipped bytes rather
// than a re-typed copy.
function loadRunner() {
  const relPath = singleSite('runWithTimeout');
  const source = sourceOf(relPath);
  const match = source.match(/^[ \t]*(?:export )?const runWithTimeout[ \t]*=/m);
  assert.ok(match, `${relPath}: runWithTimeout declaration not found`);
  const end = source.indexOf('\n};', match.index);
  assert.notEqual(end, -1, `${relPath}: could not locate the end of the runWithTimeout arrow function`);
  const snippet = source.slice(match.index, end + 3).replace(/^export /, '');
  const factory = new Function(
    'AbortController',
    'DOMException',
    'setTimeout',
    'clearTimeout',
    `'use strict';\n${snippet}\nreturn runWithTimeout;`
  );
  return factory(AbortController, DOMException, setTimeout, clearTimeout);
}

const isTimeoutError = (err) => {
  assert.ok(err instanceof DOMException, `rejects with a DOMException, got ${err?.constructor?.name}`);
  assert.equal(err.name, 'TimeoutError');
  assert.equal(err.message, 'Timed out');
  return true;
};

test('each timeout symbol is declared exactly once across all of src/, in a known host', () => {
  for (const name of SYMBOLS) singleSite(name);
});

test('the per-call deadline stays exactly 60000 ms wherever it lives', () => {
  const relPath = singleSite('AUDIT_CALL_TIMEOUT_MS');
  const match = sourceOf(relPath).match(/^[ \t]*(?:export )?const AUDIT_CALL_TIMEOUT_MS[ \t]*=[ \t]*(\d+);[ \t]*$/m);
  assert.ok(match, `${relPath}: AUDIT_CALL_TIMEOUT_MS must stay a plain numeric literal`);
  assert.equal(match[1], '60000');
});

test('runWithTimeout defers fn to a microtask and hands it a fresh, non-aborted combined signal', async () => {
  const runWithTimeout = loadRunner();
  const external = new AbortController();
  let calls = 0;
  let observed;
  const promise = runWithTimeout(external.signal, 1000, (signal) => {
    calls++;
    observed = signal;
    return 'payload';
  });
  assert.equal(calls, 0, 'fn must not run synchronously (Promise.resolve().then deferral)');
  assert.equal(await promise, 'payload');
  assert.equal(calls, 1);
  assert.ok(observed instanceof AbortSignal, 'fn receives an AbortSignal');
  assert.equal(observed.aborted, false, 'the combined signal is not aborted on success');
  assert.equal(external.signal.aborted, false, 'the caller signal stays untouched on success');
});

test('the deadline rejects with a TimeoutError DOMException and aborts only the combined signal', async () => {
  const runWithTimeout = loadRunner();
  const external = new AbortController();
  let observed;
  await assert.rejects(
    runWithTimeout(external.signal, 10, (signal) => {
      observed = signal;
      return new Promise(() => {});
    }),
    isTimeoutError
  );
  assert.equal(observed.aborted, true, 'the timeout aborts the combined signal');
  assert.equal(observed.reason.name, 'TimeoutError', 'combined-signal reason distinguishes timeout from user-cancel');
  assert.equal(observed.reason.message, 'Timed out');
  assert.equal(external.signal.aborted, false, 'the caller signal is never aborted by the deadline');
});

test('a user-cancel mid-flight propagates the caller reason instead of TimeoutError', async () => {
  const runWithTimeout = loadRunner();
  const external = new AbortController();
  const reason = new DOMException('user stopped the run', 'AbortError');
  const settled = runWithTimeout(external.signal, 5000, (signal) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  );
  setTimeout(() => external.abort(reason), 5);
  await assert.rejects(settled, (err) => err === reason);
});

test('a pre-aborted user signal aborts the combined signal immediately with the same reason', async () => {
  const runWithTimeout = loadRunner();
  const external = new AbortController();
  const reason = new DOMException('already cancelled', 'AbortError');
  external.abort(reason);
  let observed;
  await assert.rejects(
    runWithTimeout(external.signal, 5000, (signal) => {
      observed = signal;
      return new Promise((_, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }),
    (err) => err === reason
  );
  assert.equal(observed.aborted, true, 'the combined signal is born aborted');
  assert.equal(observed.reason, reason, 'the user reason is carried onto the combined signal');
});

test('a null caller signal is tolerated on both the success and deadline paths', async () => {
  const runWithTimeout = loadRunner();
  assert.equal(await runWithTimeout(null, 1000, () => 'fine'), 'fine');
  await assert.rejects(runWithTimeout(undefined, 10, () => new Promise(() => {})), isTimeoutError);
});

test("once src/utils/call-timeout.js exists it stays dependency-free with both named exports", () => {
  const relPath = 'src/utils/call-timeout.js';
  if (!existsSync(join(root, relPath))) return; // vacuous while the module is absent
  const moduleText = sourceOf(relPath);
  assert.doesNotMatch(moduleText, /^import /m, 'the shared module must import nothing');
  assert.match(moduleText, /^export const AUDIT_CALL_TIMEOUT_MS = /m);
  assert.match(moduleText, /^export const runWithTimeout = /m);
});

test('App.jsx keeps exactly two audit call sites wired through runner+deadline together', () => {
  // The two call sites are counted across the App.jsx + hook pair (App passes
  // the symbols through the hook-call parameter bag).
  const pair = sourceOf('src/App.jsx') + sourceOf('src/hooks/useAuditRun.js');
  assert.equal(
    pair.split('await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS,').length - 1,
    3,
    'the engine pair (target query + AI-judge evaluation) plus the single-test seam stay the only consumers'
  );
});

test('dead-hook seams keep receiving both symbols as parameters and never define them', () => {
  for (const relPath of ['src/hooks/useAuditRun.js', 'src/hooks/useAIGeneration.js']) {
    const hook = sourceOf(relPath);
    assert.ok(hook.length > 0, `${relPath} stays present`);
    for (const name of SYMBOLS) {
      assert.doesNotMatch(hook, declarationRe(name), `${relPath} must never define ${name} locally`);
    }
  }
  assert.match(
    sourceOf('src/hooks/useAuditRun.js'),
    /^ {2}runWithTimeout,\n {2}AUDIT_CALL_TIMEOUT_MS,$/m,
    'useAuditRun keeps consuming both symbols as ordinary destructured parameters'
  );
  assert.match(
    sourceOf('src/hooks/useAIGeneration.js'),
    /^ {2}runWithTimeout,$/m,
    'useAIGeneration keeps consuming the runner as an ordinary destructured parameter'
  );
});
