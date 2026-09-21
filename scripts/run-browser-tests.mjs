// Browser test runner.
//
// When TEST_URL is set (e.g. CI starts its own preview server), the suites are
// run against it directly. Otherwise a production preview server is started on
// a free local port, the suites are run against it, and the server is stopped —
// so `npm run test:browser` works out of the box against a real production
// build without a manually managed server.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, statfsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

// Test-environment hygiene: a full /tmp makes Chromium asset requests fail
// with ERR_INSUFFICIENT_RESOURCES (blank reloads, crashed tabs). When /tmp
// is low, point the browser suites at a writable repo-local TMPDIR instead.
// Production behavior is unchanged.
const TMPDIR_MIN_FREE_BYTES = 200 * 1024 * 1024;
try {
  const free = statfsSync('/tmp').bfree * statfsSync('/tmp').bsize;
  if (Number.isFinite(free) && free < TMPDIR_MIN_FREE_BYTES) {
    const localTmp = join(root, '.tmp', 'browser-tmp');
    mkdirSync(localTmp, { recursive: true });
    process.env.TMPDIR = localTmp;
    console.log(`[browser-tests] /tmp is low (${Math.round(free / 1024 / 1024)}MB free); using ${localTmp} as TMPDIR`);
  }
} catch { /* statfs unavailable — run with the ambient TMPDIR */ }

// Convention-based discovery: every tests/*.browser.test.mjs file is a
// required browser regression and runs here automatically — adding a new one
// needs no runner edit. The smoke/e2e scenario harnesses and the workflow
// gate bracket the discovered suites.
const BROWSER_SUITES = readdirSync(join(root, 'tests'))
  .filter((file) => file.endsWith('.browser.test.mjs'))
  .sort()
  .map((file) => ['node', [`tests/${file}`]]);

const SUITES = [
  ['node', ['tests/browser-smoke.mjs']],
  ['node', ['tests/browser-e2e.mjs']],
  ...BROWSER_SUITES,
  ['node', ['scripts/ui-workflow-gate.mjs']]
];

const findFreePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
  server.on('error', reject);
});

const waitForServer = async (url, { timeoutMs = 30000, intervalMs = 250 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Preview server did not become ready at ${url} within ${timeoutMs}ms.`);
};

const runSuite = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
  return res.status === 0;
};

const runAll = () => {
  for (const [cmd, args] of SUITES) {
    if (!runSuite(cmd, args)) return false;
  }
  return true;
};

if (process.env.TEST_URL) {
  // A server is already running (CI or a manual preview) — run against it.
  process.exit(runAll() ? 0 : 1);
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}/`;
console.log(`[browser-tests] starting production preview at ${baseUrl}`);
const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit']
});

let ok = false;
try {
  await waitForServer(baseUrl);
  process.env.TEST_URL = baseUrl;
  ok = runAll();
} catch (err) {
  console.error(`[browser-tests] ${err.message}`);
} finally {
  server.kill('SIGTERM');
}

process.exit(ok ? 0 : 1);
