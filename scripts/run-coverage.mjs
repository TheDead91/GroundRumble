import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// Own subprocess exit handling: a failed suite must fail this command even if
// a coverage reporter happens to exit successfully afterwards.
const run = (args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`${args.join(' ')} failed (${signal || code})`)));
});

const directory = resolve('.tmp/coverage-all');
const temporary = resolve(directory, 'tmp');
await rm(directory, { recursive: true, force: true });
await mkdir(temporary, { recursive: true });
const env = { ...process.env, NODE_V8_COVERAGE: temporary };
// Coverage must match the assets built below, never an unrelated live server.
delete env.TEST_URL;
await run(['--test', 'tests/*.unit.test.mjs', 'tests/*.integration.test.mjs', 'tests/*.behavior.test.mjs', 'tests/*.contract.test.mjs'], env);
// Source maps are required to attribute minified browser code to JS and JSX.
await run(['node_modules/vite/bin/vite.js', 'build', '--sourcemap']);
await run(['scripts/run-browser-tests.mjs'], { ...env, GR_BROWSER_COVERAGE: '1' });
await run(['node_modules/c8/bin/c8.js', 'report', '--all', '--include=src/**/*.{js,jsx}',
  '--exclude=src/data/atlas-bundled.js',
  '--extension=.js', '--extension=.jsx', '--exclude-after-remap',
  '--reporter=text', '--reporter=html', '--reporter=json-summary',
  `--temp-directory=${temporary}`, `--reports-dir=${directory}`]);
if (process.argv.includes('--check')) await run(['scripts/check-test-coverage.mjs']);
