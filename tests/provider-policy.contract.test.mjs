// Structural pins: ProvidersContext consumes the predicates from the pure
// module and App.jsx carries neither local definitions nor a new import.
//
// Source-text level (Node cannot import JSX), mirroring the conventions of
// tests/provider-config.contract.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APP_PATH = 'src/App.jsx';
const CONTEXT_PATH = 'src/context/ProvidersContext.jsx';
const MODULE_PATH = 'src/utils/provider-endpoint-policy.js';
// The backup-import gate lines live in the flow hook.
const HOOK_PATH = 'src/hooks/useBackupFlow.js';

const NAMES = ['providerNeedsPrivateBypass', 'providerNeedsInsecureTransport'];
const declarationRe = (name) => new RegExp(`^[ \\t]*(?:export )?const ${name}[ \\t]*=`, 'gm');

const sourceOf = (relPath) => readFileSync(join(root, relPath), 'utf8');

test('the new pure policy module exists', () => {
  assert.ok(existsSync(join(root, MODULE_PATH)), `${MODULE_PATH} must exist`);
});

test('No local definition sites remain in either consumer', () => {
  for (const relPath of [APP_PATH, CONTEXT_PATH]) {
    const source = sourceOf(relPath);
    for (const name of NAMES) {
      assert.doesNotMatch(source, declarationRe(name), `${relPath} must not define ${name} locally anymore`);
    }
  }
});

test("The primitive '../utils/endpoint-policy' import is fully replaced by the new module import, position intact", () => {
  const lines = sourceOf(CONTEXT_PATH).replace(/\r\n/g, '\n').split('\n');
  assert.equal(
    lines.filter((l) => l.includes("'../utils/endpoint-policy'")).length,
    0,
    "no occurrence of '../utils/endpoint-policy' may remain"
  );
  assert.equal(
    lines.filter((l) => /^\s*import\b/.test(l) && l.includes("'../utils/provider-endpoint-policy'")).length,
    1,
    "exactly one import from '../utils/provider-endpoint-policy'"
  );
  const idx = lines.findIndex((l) => l.includes("'../utils/provider-endpoint-policy'"));
  assert.equal(
    lines[idx],
    "import { providerNeedsPrivateBypass, providerNeedsInsecureTransport } from '../utils/provider-endpoint-policy';",
    'the replacement import statement must be exact'
  );
  // Position contract: the consent primitive import sits directly above the
  // provider-endpoint-policy import (between the projection import and the
  // second vault import), keeping every other import line fixed.
  assert.match(lines[idx - 1], /^import \{ requestInsecureTransportApproval, recordInsecureTransportApproval, insecureTransportConsentRequired \} from '\.\.\/utils\/insecure-transport-consent\.js';$/, 'previous line stays the consent-primitive import');
  assert.match(lines[idx + 1], /^import \{ loadAuditHistory \} from '\.\.\/utils\/vault';$/, 'next line stays the audit-history vault import (position contract holds; dead clearAuditHistory specifier dropped)');
  // Pinned neighbor ordering from tests/provider-config.contract.test.mjs must not move.
  const lastVaultIdx = lines.reduce((last, l, i) => (/^import .*from '\.\.\/utils\/vault';$/.test(l) ? i : last), -1);
  const appConfigIdx = lines.findIndex((l) => l.includes("'../data/app-config'"));
  const lucideIdx = lines.findIndex((l) => /from 'lucide-react';$/.test(l));
  assert.ok(idx < lastVaultIdx && lastVaultIdx < appConfigIdx && appConfigIdx < lucideIdx, 'vault → app-config → lucide ordering stays intact');
});

test('The deleted useCallback copies leave no residual primitive references behind', () => {
  const ctx = sourceOf(CONTEXT_PATH);
  // The three endpoint-policy bindings have NO remaining usages in this file.
  assert.doesNotMatch(ctx, /\b(isSpecialUseAddress|isSpecialUseHostname|isInsecureHttpEndpoint)\s*\(/,
    'the relocated logic must be fully gone from ProvidersContext');
  // confirmInsecureTransport is a real gate delegating to the central consent
  // primitive with a live re-read for the stale-acceptance guard.
  assert.match(
    ctx,
    /const providerModelsFor = useCallback\(\(cp\) => \(cp\.models \|\| \[\]\)\.map\(m => \(\{ id: m, name: m \}\)\), \[\]\);\n\n  \/\/ Single context-level consent gate[^\n]*\n  \/\/ live re-read[^\n]*\n  \/\/ a changed config[^\n]*\n  const confirmInsecureTransport = useCallback\(async \(cp\) => \{\n    return requestInsecureTransportApproval\(cp, \(\) => providersRef\.current\.find\(p => p\.id === cp\?\.id\) \|\| cp\);/,
    'confirmInsecureTransport delegates to the shared consent primitive with the stale re-read'
  );
});

test('context value still exposes both predicates as shorthand keys in their positions', () => {
  const ctx = sourceOf(CONTEXT_PATH);
  assert.match(
    ctx,
    /providerModelsFor,\n    providerNeedsPrivateBypass,\n    providerNeedsInsecureTransport,\n    confirmInsecureTransport,/,
    'public context API surface unchanged'
  );
});

test('App.jsx adds NO import of the new module and keeps consuming via providersCtx', () => {
  const app = sourceOf(APP_PATH);
  assert.doesNotMatch(app, /provider-endpoint-policy/, 'App.jsx must not reference the new module at all');
  assert.match(
    app,
    /providerModelsFor,\n    providerNeedsPrivateBypass,\n    providerNeedsInsecureTransport,\n    confirmInsecureTransport,/,
    'the providersCtx destructure still receives both predicates'
  );
  assert.match(app, /\} = providersCtx;/);
});

test('backup-import gate lines keep calling the context-provided predicates verbatim', () => {
  const hook = sourceOf(HOOK_PATH);
  assert.equal(hook.match(/allowPrivate: p\.allowPrivate === true && providerNeedsPrivateBypass\(p\),/g)?.length, 1);
  assert.equal(hook.match(/allowInsecureTransport: p\.allowInsecureTransport === true && providerNeedsInsecureTransport\(p\)/g)?.length, 1);
});

test('App.jsx structure guards: DEMO_TARGETS-to-App adjacency, single default export, pinned symbols in place', () => {
  const app = sourceOf(APP_PATH);
  assert.equal(app.replace(/\r\n/g, '\n').match(/\n\];\n\nexport default function App\(\) \{/)?.length, 1,
    "exactly one blank line between DEMO_TARGETS's closing bracket and the App() declaration");
  assert.equal(app.match(/^export default function App\(\) \{$/gm)?.length, 1, 'single default export');
  // The GroundRumbleLogo symbol moves with the onboarding JSX into
  // src/components/modals/OnboardingModal.jsx; the pin resolves over the
  // App ∪ onboarding-modal file set (identical guarantee, green on both
  // sides). The other pinned symbols stay App-side unchanged.
  const onboardingModalPath = join(root, 'src/components/modals/OnboardingModal.jsx');
  const appPlusOnboardingModal = app + '\n' + (existsSync(onboardingModalPath) ? sourceOf('src/components/modals/OnboardingModal.jsx') : '');
  // The redact trio may leave App's audit-record import — its usages live
  // provider-side — so these three symbols resolve across the App ∪
  // provider-owner file set (HistoryContext ∪ useAuditRun ∪ useVaultActions ∪
  // useBackupFlow); identical presence guarantee, green on both sides.
  // AUDIT_CALL_TIMEOUT_MS/runWithTimeout/DEMO_TARGETS stay App-side unchanged.
  const historyCtxPath = join(root, 'src/context/HistoryContext.jsx');
  const auditRunHookPath = join(root, 'src/hooks/useAuditRun.js');
  const vaultActionsHookPath = join(root, 'src/hooks/useVaultActions.js');
  const backupFlowHookPath = join(root, 'src/hooks/useBackupFlow.js');
  const redactTrio = app
    + '\n' + (existsSync(historyCtxPath) ? sourceOf('src/context/HistoryContext.jsx') : '')
    + '\n' + (existsSync(auditRunHookPath) ? sourceOf('src/hooks/useAuditRun.js') : '')
    + '\n' + (existsSync(vaultActionsHookPath) ? sourceOf('src/hooks/useVaultActions.js') : '')
    + '\n' + (existsSync(backupFlowHookPath) ? sourceOf('src/hooks/useBackupFlow.js') : '');
  for (const symbol of ['AUDIT_CALL_TIMEOUT_MS', 'runWithTimeout', 'redactAuditResult', 'redactAuditRecord', 'summarizeAuditRecord', 'DEMO_TARGETS']) {
    const surface = ['redactAuditResult', 'redactAuditRecord', 'summarizeAuditRecord'].includes(symbol) ? redactTrio : app;
    assert.ok(surface.includes(symbol), `pinned symbol ${symbol} stays present`);
  }
  assert.ok(appPlusOnboardingModal.includes('GroundRumbleLogo'), 'pinned symbol GroundRumbleLogo stays present across App.jsx ∪ OnboardingModal.jsx (T05 seam)');
  // The demo-seed consumer (the audit engine) lives in useAuditRun.js.
  assert.ok(sourceOf('src/hooks/useAuditRun.js').includes('DEMO_SIMULATION_RESPONSES'),
    'the demo seed table is consumed by the audit-run hook (T04 port)');
  assert.match(app, /provider: SANDBOX_PROVIDER_ID/, "DEMO_TARGETS keeps its sandbox provider literal");
});
