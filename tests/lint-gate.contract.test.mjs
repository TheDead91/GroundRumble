// Guard for the `npm run lint` gate: the gate must stay at zero warnings and
// zero errors. This check runs the pinned oxlint with the machine-readable
// `agent` format — the same invocation operators use when triaging — and
// asserts both the agent output and the strict summary are clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('oxlint gate stays clean in agent format (0 warnings, 0 errors)', () => {
  // The agent format emits no summary line on a clean pass; silence is the
  // green signal. Any diagnostic the gate would fail on (error OR warning —
  // oxlint exits 0 on warnings, so both are asserted via the strict default
  // format's summary) surfaces as non-empty agent output or a bad summary.
  const agentOutput = execFileSync(
    join(root, 'node_modules', '.bin', 'oxlint'),
    ['--format', 'agent'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(agentOutput, '', 'agent-format output must be empty on a clean gate');

  const summary = execFileSync(
    join(root, 'node_modules', '.bin', 'oxlint'),
    ['--format', 'default'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.match(summary, /Found 0 warnings and 0 errors\./, `lint gate must stay clean, got:\n${summary}`);
});

test('npm run lint passes cleanly (BUG #1 regression: no duplicate --format flag)', () => {
  // The `lint` script must not hardcode `--format`, otherwise a caller-supplied
  // flag splits into "argument --format cannot be used multiple times". With
  // no hardcoded flag, plain `npm run lint` uses the default format, and the
  // agent-format triage view is covered by the explicit oxlint test above.
  const run = spawnSync(npmCmd, ['run', 'lint'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `npm run lint must exit 0, got:\n${run.stdout}${run.stderr}`);
  assert.ok(!/cannot be used multiple times/.test(run.stderr), 'duplicate --format error must never appear');
});

test('npm run lint accepts a caller-supplied format without duplicate-flag errors', () => {
  // Operators append their own format (e.g. for machine-readable output); a
  // hardcoded flag would make every such invocation error out.
  const run = spawnSync(npmCmd, ['run', 'lint', '--', '--format=github'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `npm run lint --format=github must exit 0, got:\n${run.stdout}${run.stderr}`);
  assert.ok(!/cannot be used multiple times/.test(run.stderr), 'duplicate --format error must never appear');
});
