// Intentional entry point for durable exhaustive/system exploration.
//
// `npm run test:exploratory` (no arguments) validates the exploratory
// catalog: every registered harness/probe file must exist, and the catalog
// with per-entry purposes is printed. This is deterministic and launches no
// browser — full saturation is opt-in per entry, never a default.
//
// `npm run test:exploratory -- --run <name>` executes one registered entry
// against a preview server the operator provides via TEST_URL (browser
// probes, acceptance) or EXPLORATORY_BASE_URL (dialog harnesses, acceptance
// fallback). See docs/testing.md for the catalog and commands.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exploratory = (file) => join('tests', 'exploratory', file);

// kind: 'probe' (single-concern browser check), 'harness' (multi-scenario
// black-box exploration), 'walkthrough' (end-to-end acceptance journey),
// 'inventory' (evidence index, runnable summary).
export const EXPLORATORY_SUITES = [
  { name: 'acceptance', file: exploratory('acceptance.mjs'), kind: 'walkthrough', purpose: 'End-to-end acceptance journey with evidence capture and opt-in finding checks (--check all).' },
  { name: 'exploration-inventory', file: exploratory('exploration-inventory.mjs'), kind: 'inventory', purpose: 'Black-box control/dependency inventory summary (evidence index, not a saturation certificate).' },
  { name: 'app-config-probe', file: exploratory('app-config-probe.mjs'), kind: 'probe', purpose: 'Provider-config module wiring served by the dev/preview server.' },
  { name: 'brand-logo-probe', file: exploratory('brand-logo-probe.mjs'), kind: 'probe', purpose: 'Brand-logo module export and dual-instance gradient identity in a real boot.' },
  { name: 'demo-seeds-probe', file: exploratory('demo-seeds-probe.mjs'), kind: 'probe', purpose: 'Demo-mode simulation seeds surface verbatim through a sandbox audit.' },
  { name: 'provider-policy-probe', file: exploratory('provider-policy-probe.mjs'), kind: 'probe', purpose: 'Provider transport-policy form warnings and policy-module predicates.' },
  { name: 'runner-view-probe', file: exploratory('runner-view-probe.mjs'), kind: 'probe', purpose: 'Runner config surface plus a minimal demo audit end to end.' },
  { name: 'settings-view-probe', file: exploratory('settings-view-probe.mjs'), kind: 'probe', purpose: 'Provider/helper-model settings surface, flows and tour anchors.' },
  { name: 'settings-platform-cards-probe', file: exploratory('settings-platform-cards-probe.mjs'), kind: 'probe', purpose: 'Settings platform cards: ATLAS sync, proxy, vault, backup, reset, help.' },
  { name: 'ai-wizard-probe', file: exploratory('ai-wizard-probe.mjs'), kind: 'probe', purpose: 'AI test-generation wizard frame, sources/config steps and gates.' },
  { name: 'dialog-exhaustion-baseline', file: exploratory('dialog-exhaustion-baseline.mjs'), kind: 'harness', purpose: 'Baseline black-box dialog-exhaustion probes against the production build.' },
  { name: 'dialog-exhaustion-source-wizard', file: exploratory('dialog-exhaustion-source-wizard.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: source intake/review + generation wizard branches.' },
  { name: 'dialog-exhaustion-audit-dashboard', file: exploratory('dialog-exhaustion-audit-dashboard.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: audit details, confirmations, dashboard, ATLAS prompts.' },
  { name: 'dialog-exhaustion-runner-prompts', file: exploratory('dialog-exhaustion-runner-prompts.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: runner dialogs, prompt dialog, runner/AI-prompt controls.' },
  { name: 'dialog-exhaustion-settings', file: exploratory('dialog-exhaustion-settings.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: settings providers, vault, proxy, ATLAS sync faults.' },
  { name: 'dialog-exhaustion-backup-recovery', file: exploratory('dialog-exhaustion-backup-recovery.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: backup/restore faults, encryption, presets, judge, tutorial, reset.' },
  { name: 'dialog-exhaustion-edge-inputs', file: exploratory('dialog-exhaustion-edge-inputs.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: raw-template downstream, leftovers, mobile + keyboard.' },
  { name: 'dialog-exhaustion-tutorial-reset', file: exploratory('dialog-exhaustion-tutorial-reset.mjs'), kind: 'harness', purpose: 'Dialog exhaustion: guided tutorial, preset restore, judge variants, reset.' },
  { name: 'dialog-exhaustion-template-lineup', file: exploratory('dialog-exhaustion-template-lineup.mjs'), kind: 'harness', purpose: 'Dialog exhaustion (focused): raw-template assertions, lineup, ERROR detail.' },
  { name: 'dialog-exhaustion-discovery-lineup', file: exploratory('dialog-exhaustion-discovery-lineup.mjs'), kind: 'harness', purpose: 'Dialog exhaustion (focused): discovery-driven lineup, Failed-group DOM.' },
  { name: 'dialog-probes', file: exploratory('dialog-probes.mjs'), kind: 'harness', purpose: 'Opt-in black-box dialog probes; deviations recorded as findings.' },
  { name: 'discovery-control-sweep', file: exploratory('discovery-control-sweep.mjs'), kind: 'harness', purpose: 'Control inventory sweep (fresh vs populated state) diffed against the inventory.' },
  { name: 'production-journeys', file: exploratory('production-journeys.mjs'), kind: 'harness', purpose: 'Production user journeys against an independently built preview.' },
  { name: 'convergence-fresh-state', file: exploratory('convergence-fresh-state.mjs'), kind: 'harness', purpose: 'Convergence sweep: fresh-state dialog micro-branches.' },
  { name: 'convergence-dialog-branches', file: exploratory('convergence-dialog-branches.mjs'), kind: 'harness', purpose: 'Convergence sweep: micro-branches across dialogs/controls.' },
  { name: 'convergence-targeted-faults', file: exploratory('convergence-targeted-faults.mjs'), kind: 'harness', purpose: 'Convergence sweep: targeted faults and dependency checks.' },
  { name: 'convergence-sidebar-sweep', file: exploratory('convergence-sidebar-sweep.mjs'), kind: 'harness', purpose: 'Convergence sweep: sidebar chrome + notification discoveries.' },
  { name: 'convergence-dialog-remainder', file: exploratory('convergence-dialog-remainder.mjs'), kind: 'harness', purpose: 'Convergence sweep: remaining dialog cases.' },
];

const printCatalog = () => {
  console.log(`Exploratory catalog: ${EXPLORATORY_SUITES.length} registered entries.`);
  for (const entry of EXPLORATORY_SUITES) {
    console.log(`  [${entry.kind}] ${entry.name} — ${entry.purpose}`);
    console.log(`      node ${entry.file}`);
  }
  console.log('Run one entry: npm run test:exploratory -- --run <name>');
};

export function validateCatalog() {
  return EXPLORATORY_SUITES.filter((entry) => !existsSync(join(root, entry.file)));
}

const args = process.argv.slice(2);
const runIndex = args.indexOf('--run');
if (process.argv[1]?.endsWith('run-exploratory.mjs') && runIndex === -1) {
  const missing = validateCatalog();
  if (missing.length > 0) {
    console.error(`Exploratory catalog is stale — missing files: ${missing.map((entry) => entry.file).join(', ')}`);
    process.exit(1);
  }
  printCatalog();
  console.log(`Exploratory validation passed: ${EXPLORATORY_SUITES.length} entries resolve.`);
} else if (process.argv[1]?.endsWith('run-exploratory.mjs')) {
  const name = args[runIndex + 1];
  const entry = EXPLORATORY_SUITES.find((candidate) => candidate.name === name);
  if (!entry) {
    console.error(`Unknown exploratory entry: ${name || '(none)'}.`);
    printCatalog();
    process.exit(1);
  }
  const extra = args.filter((arg, index) => index !== runIndex && index !== runIndex + 1 && arg !== '--');
  const result = spawnSync(process.execPath, [join(root, entry.file), ...extra], { cwd: root, stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}
