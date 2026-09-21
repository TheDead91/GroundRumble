// Structural + behavioral pins: AUDIT_CALL_TIMEOUT_MS and runWithTimeout live
// VERBATIM in ONE shared pure utility module (src/utils/call-timeout.js),
// imported into src/App.jsx through a single grouped import; no local copies
// remain.
//
// Unlike tests/call-timeout.contract.test.mjs (which extracts and
// evaluates declaration text because Node cannot import the JSX entry
// point), this suite imports the real module DIRECTLY — it is pure
// browser-API ESM that imports nothing. Behavioral cases use real timers
// with millisecond-scale deadlines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_CALL_TIMEOUT_MS, runWithTimeout } from '../src/utils/call-timeout.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = 'src/utils/call-timeout.js';

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8');

// The module content is exactly this: the three-line header plus blank line,
// then the carried code with its two `export ` prefixes.
// Byte-pinned (modulo CRLF/trailing-newline) so any rewording, reflow,
// re-indentation or escape drift fails loudly.
const EXPECTED_SOURCE = [
  '// Shared per-call deadline for audit/AI API requests plus the runner that',
  '// enforces it. Pure browser-API utility module; imports nothing. Single',
  '// canonical copy consumed by src/App.jsx.',
  '',
  "// How long a single target/judge API call may take before it's aborted as a",
  '// timeout (treated as an ERROR result, not a user-cancelled run).',
  'export const AUDIT_CALL_TIMEOUT_MS = 60000;',
  '',
  '// Runs `fn` with a combined AbortSignal that also aborts after `timeoutMs`.',
  '// The timeout aborts with a TimeoutError so callers can distinguish it from a',
  '// user-cancel (AbortError).',
  'export const runWithTimeout = (signal, timeoutMs, fn) => {',
  '  const controller = new AbortController();',
  '  const onUserAbort = () => controller.abort(signal.reason);',
  '  if (signal) {',
  '    if (signal.aborted) controller.abort(signal.reason);',
  "    else signal.addEventListener('abort', onUserAbort, { once: true });",
  '  }',
  '  const combined = controller.signal;',
  '  let timeoutId;',
  '  const cleanup = () => {',
  '    if (timeoutId) clearTimeout(timeoutId);',
  "    if (signal) signal.removeEventListener('abort', onUserAbort);",
  '  };',
  '  const operation = Promise.resolve().then(() => fn(combined));',
  '  const timeout = new Promise((_, reject) => {',
  '    timeoutId = setTimeout(() => {',
  "      controller.abort(new DOMException('Timed out', 'TimeoutError'));",
  "      reject(new DOMException('Timed out', 'TimeoutError'));",
  '    }, timeoutMs);',
  '  });',
  '  return Promise.race([operation, timeout]).finally(cleanup);',
  '};'
].join('\n');

test('Call-timeout.js carries the byte-exact mandated content and imports nothing', () => {
  const actual = sourceOf(MODULE_PATH).replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  assert.equal(actual, EXPECTED_SOURCE + '\n');
});

test('the module exports exactly the two specified symbols', () => {
  const text = sourceOf(MODULE_PATH);
  assert.deepEqual(text.match(/^export[^\n]*/gm) ?? [], [
    'export const AUDIT_CALL_TIMEOUT_MS = 60000;',
    'export const runWithTimeout = (signal, timeoutMs, fn) => {'
  ]);
});

test('the shared per-call deadline stays exactly 60000 ms', () => {
  assert.equal(AUDIT_CALL_TIMEOUT_MS, 60000);
});

test('runWithTimeout defers fn to a microtask and hands it a fresh, non-aborted combined signal', async () => {
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
  assert.ok(observed instanceof AbortSignal);
  assert.equal(observed.aborted, false);
  assert.equal(external.signal.aborted, false);
});

test('the deadline rejects with a TimeoutError DOMException and aborts only the combined signal', async () => {
  const external = new AbortController();
  let observed;
  await assert.rejects(
    runWithTimeout(external.signal, 10, (signal) => {
      observed = signal;
      return new Promise(() => {});
    }),
    (err) => {
      assert.ok(err instanceof DOMException, `rejects with a DOMException, got ${err?.constructor?.name}`);
      assert.equal(err.name, 'TimeoutError');
      assert.equal(err.message, 'Timed out');
      return true;
    }
  );
  assert.equal(observed.aborted, true);
  assert.equal(observed.reason.name, 'TimeoutError');
  assert.equal(external.signal.aborted, false);
});

test('a user-cancel mid-flight propagates the caller reason instead of TimeoutError', async () => {
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
  assert.equal(observed.aborted, true);
  assert.equal(observed.reason, reason);
});

test('a null caller signal is tolerated on both the success and deadline paths', async () => {
  assert.equal(await runWithTimeout(null, 1000, () => 'fine'), 'fine');
  await assert.rejects(
    runWithTimeout(undefined, 10, () => new Promise(() => {})),
    (err) => err instanceof DOMException && err.name === 'TimeoutError'
  );
});

test("App.jsx re-points to the shared module with exactly one './utils/*'-grouped import", () => {
  const app = sourceOf('src/App.jsx');
  assert.doesNotMatch(app, /^[ \t]*(?:export )?const (?:AUDIT_CALL_TIMEOUT_MS|runWithTimeout)[ \t]*=/m, 'no local copies remain in App.jsx');
  assert.match(app, /^import \{ AUDIT_CALL_TIMEOUT_MS, runWithTimeout \} from '\.\/utils\/call-timeout';$/m, 'App.jsx sources the shared call-timeout module');
  assert.equal(app.split("from './utils/call-timeout';").length - 1, 1, 'exactly one importing line');
  const lines = app.split('\n');
  const idx = lines.findIndex((l) => l.includes("'./utils/call-timeout'"));
  assert.ok(idx > 0, 'the call-timeout import is found');
  // The audit-history glue
  // (clearAuditHistory/loadAuditHistory/saveAuditHistory) may live in
  // src/hooks/useAuditDetail.js, so the App-side vault import may shed those
  // names when the hook carries them. The vault-import SHAPE is therefore
  // tolerant (any specifier list from './utils/vault' still sits immediately
  // above the call-timeout import) while strength is preserved: every moved
  // name stays imported exactly once across the App ∪ hook union.
  assert.ok(
    /^import \{[^}]*\} from '\.\/utils\/vault';$/.test((lines[idx - 1] ?? '').replace(/\r$/, '')),
    'sits immediately AFTER the vault import'
  );
  assert.equal(lines[idx + 1], "import { AppLayout } from './components/layout/AppLayout';", 'sits immediately BEFORE the AppLayout import');
  let auditDetailHookSrc = '';
  try { auditDetailHookSrc = sourceOf('src/hooks/useAuditDetail.js'); } catch { /* hook absent */ }
  // loadAuditHistory/saveAuditHistory may leave App's vault import — their
  // usages live provider-side — so the carrier set widens to the sanctioned
  // owner union (audit-history hook ∪ HistoryContext ∪ ProvidersContext ∪
  // backup-flow hook); each shed name must still ride a sanctioned carrier.
  // clearAuditHistory keeps its hook carrier.
  const historyCtxSrc = (() => { try { return sourceOf('src/context/HistoryContext.jsx'); } catch { return ''; } })();
  const providersCtxSrc = (() => { try { return sourceOf('src/context/ProvidersContext.jsx'); } catch { return ''; } })();
  const backupFlowSrc = (() => { try { return sourceOf('src/hooks/useBackupFlow.js'); } catch { return ''; } })();
  const ownerSrcs = [auditDetailHookSrc, historyCtxSrc, providersCtxSrc, backupFlowSrc].filter(Boolean);
  for (const moved of ['clearAuditHistory', 'loadAuditHistory', 'saveAuditHistory']) {
    const stillAppSide = new RegExp(`import \\{[^}]*\\b${moved}\\b[^}]*\\} from '\\./utils/vault';`).test(app);
    if (!stillAppSide) {
      assert.ok(ownerSrcs.some((s) => s.includes(moved)), `${moved} left the App vault import — a sanctioned carrier (audit hook ∪ HistoryContext ∪ ProvidersContext ∪ backup-flow) must carry it (T06/T07 sanctioned moves)`);
    }
  }
});

test('The demo-lineup seam keeps blank-line separation and no relocation residue above it', () => {
  const app = sourceOf('src/App.jsx').replace(/\r\n/g, '\n');
  assert.doesNotMatch(app, /^\/\/ How long a single target\/judge API call may take/m, 'the relocated timeout comment has left App.jsx');
  // The pin is the INVARIANT (>=1 blank line, nothing but whitespace between
  // the previous content line and the comment) rather than the incidental
  // `};` neighbor: DEMO_SIMULATION_RESPONSES and its closing brace may sit
  // above this comment.
  const seam = app.match(/^(?:.*\n)((?:[ \t]*\n)+)\/\/ First-run demo lineup/m);
  assert.ok(seam, 'the module-scope demo-lineup comment keeps at least one preceding blank line');
  assert.match(seam[1], /^(?:[ \t]*\n)+$/, 'only blank lines may sit above the demo-lineup comment');
});

test('App.jsx keeps consuming runner+deadline together at exactly the two audit call sites', () => {
  // The audit engine lives in src/hooks/useAuditRun.js; the two call sites are
  // counted across the App.jsx + hook pair (App passes the symbols through the
  // hook-call parameter bag).
  const pair = sourceOf('src/App.jsx') + sourceOf('src/hooks/useAuditRun.js');
  assert.equal(
    pair.split('await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS,').length - 1,
    3,
    'the engine pair (target query + AI-judge evaluation) plus the single-test seam stay the only consumers'
  );
});

test('Guard-suite seams stay satisfied naturally and no scope creep leaks into App.jsx', () => {
  const app = sourceOf('src/App.jsx');
  // The provider-policy pinned-symbol loop keeps passing NATURALLY: the import
  // line carries both names as substrings (GroundRumbleLogo precedent).
  assert.ok(app.includes('AUDIT_CALL_TIMEOUT_MS'));
  assert.ok(app.includes('runWithTimeout'));
  assert.doesNotMatch(app, /provider-endpoint-policy/, 'no policy-module coupling appears in App.jsx');
  assert.equal(app.replace(/\r\n/g, '\n').match(/\n\];\n\nexport default function App\(\) \{/)?.length, 1, 'DEMO_TARGETS-to-App adjacency untouched');
  assert.equal(app.match(/^export default function App\(\) \{$/gm)?.length, 1, 'single default export');
});

test('Dead-hook seams keep receiving both symbols as parameters and never define them', () => {
  const declarationRe = (name) => new RegExp(`^[ \\t]*(?:export )?const ${name}[ \\t]*=`, 'gm');
  for (const relPath of ['src/hooks/useAuditRun.js', 'src/hooks/useAIGeneration.js']) {
    const hook = sourceOf(relPath);
    assert.ok(hook.length > 0, `${relPath} stays present`);
    for (const name of ['AUDIT_CALL_TIMEOUT_MS', 'runWithTimeout']) {
      assert.doesNotMatch(hook, declarationRe(name), `${relPath} must never define ${name} locally`);
    }
  }
  assert.match(sourceOf('src/hooks/useAuditRun.js'), /^ {2}runWithTimeout,\n {2}AUDIT_CALL_TIMEOUT_MS,$/m);
  assert.match(sourceOf('src/hooks/useAIGeneration.js'), /^ {2}runWithTimeout,$/m);
});
