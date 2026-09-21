import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UI_WORKFLOWS } from '../tests/ui-workflows.mjs';

const report = JSON.parse(readFileSync('.tmp/coverage-all/coverage-summary.json', 'utf8'));
const workflows = JSON.parse(readFileSync('.tmp/ui-workflow-results.json', 'utf8'));
// Generated research data is the only source exclusion. New application files
// must enter the denominator even if no test imports them.
for (const file of globSync('src/**/*.{js,jsx}')) {
  if (file === 'src/data/atlas-bundled.js') continue;
  assert.ok(report[resolve(file)], `Missing source file in coverage report: ${file}`);
}
assert.ok(report.total.lines.pct >= 85, `Repository line coverage ${report.total.lines.pct}% is below 85%`);
assert.ok(report.total.branches.pct >= 70, `Repository branch coverage ${report.total.branches.pct}% is below 70%`);

// These primitives sit on every credential, persistence and verdict boundary.
// The security-invariant primitives (operation identity, restore candidate
// identity, restore normalizers) centrally enforce those invariants and are
// held to the same 100%-line standard. Workflow coverage below complements this
// line gate with actual outcomes.
const criticalModules = [
  'src/utils/secretbox.js', 'src/utils/vault-idb.js', 'src/utils/vault.js',
  'src/utils/audit-record.js', 'src/utils/verdict-summary.js',
  'src/utils/call-timeout.js', 'src/utils/source-url-policy.js',
  'src/utils/provider-endpoint-policy.js', 'src/utils/api/provider-request-config.js',
  'src/utils/ai-operation-identity.js', 'src/utils/backup-candidate.js',
  'src/utils/backup-normalizers.js', 'src/utils/insecure-transport-consent.js',
];
for (const file of criticalModules) {
  assert.equal(report[resolve(file)]?.lines.pct, 100, `Critical module requires 100% lines: ${file}`);
}
// Guard against a source-map exclusion bug that reports JSX as 100% lines
// while silently dropping all execution ranges and functions.
for (const file of ['src/App.jsx', 'src/hooks/useAuditRun.js', 'src/components/modals/AiGenWizardResults.jsx']) {
  assert.ok(report[resolve(file)]?.functions.covered > 0, `No mapped function execution for ${file}`);
}
for (const workflow of UI_WORKFLOWS.filter(item => item.required)) {
  assert.equal(workflows.find(item => item.id === workflow.id)?.state, 'pass', `Critical workflow did not pass: ${workflow.id}`);
}
console.log(`Coverage gate passed: ${report.total.lines.pct}% lines, ${report.total.branches.pct}% branches; ${criticalModules.length} critical modules at 100% lines; all required workflows passed.`);
