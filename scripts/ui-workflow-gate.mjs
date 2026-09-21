// UI workflow gate: fails unless every required workflow in tests/ui-workflows.mjs
// was exercised by tests/browser-e2e.mjs and passed (reads .tmp/ui-workflow-results.json).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_WORKFLOWS } from '../tests/ui-workflows.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsPath = join(__dirname, '..', '.tmp', 'ui-workflow-results.json');

let results;
try {
  results = JSON.parse(readFileSync(resultsPath, 'utf8'));
} catch {
  console.error('UI workflow results file missing — run `npm run test:browser:e2e` first.');
  process.exit(1);
}
if (!Array.isArray(results)) {
  console.error('UI workflow results file is not a results array.');
  process.exit(1);
}

const byId = new Map(results.map(r => [r.id, r]));
const missing = [];
const failed = [];
for (const workflow of UI_WORKFLOWS) {
  if (!workflow.required) continue;
  const result = byId.get(workflow.id);
  if (!result) {
    missing.push(workflow.id);
    continue;
  }
  if (result.state !== 'pass') failed.push(`${workflow.id}: ${result.error || 'failed'}`);
}

if (missing.length > 0 || failed.length > 0) {
  console.error('UI workflow gate FAILED.');
  if (missing.length > 0) console.error(`  Not exercised: ${missing.join(', ')}`);
  failed.forEach(line => console.error(`  ${line}`));
  process.exit(1);
}

const required = UI_WORKFLOWS.filter(w => w.required).length;
console.log(`UI workflow gate passed: ${required} required workflows exercised and green.`);