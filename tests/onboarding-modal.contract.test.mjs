// Contract: the first-run onboarding modal lives in
// src/components/modals/OnboardingModal.jsx (TARGET_PATH) — the modal as the
// presentation component OnboardingModal (props-in/events-out: onboardingOpen,
// onFinish, onStartTour, onImportBackup; null gate module-side) and App
// keeping the first-run render gate
// `(!vaultLocked || onboardingOpen) && renderOnboarding()` while mounting
// `<OnboardingModal … />` through a thin renderOnboarding wrapper. The
// Let's-get-started composite stays App-wired: App hands
// onStartTour={() => { finishOnboarding(); setTourRunning(true); }} and the
// modal's primary button calls onFinish(); onStartTour(); in that order.
//
// The union parity test is true on both sides and stays green throughout.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention:
// tests/backup-import-modal.contract.test.mjs). Hermetic: no dev server, no
// network, no browser, deterministic only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODAL_PATH = 'src/components/modals/OnboardingModal.jsx';
const APP_PATH = 'src/App.jsx';

const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const app = readSource(APP_PATH);
let modal = '';
try {
  modal = readSource(MODAL_PATH);
} catch {
  // When the module is absent, the module/adoption pins below fail; the union
  // parity test stays green on both sides.
}

const norm = (text) => text.replace(/\s+/g, ' ').trim();
const countIn = (source, needle) => source.split(needle).length - 1;
const lineCount = (source) => source.replace(/\n+$/, '').split('\n').length;

// Ordered-substring helper over a normalized body: pins presence AND order.
const ordered = (label, body, needles) => {
  let cursor = -1;
  for (const needle of needles) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${label}: expected ${JSON.stringify(needle)} after offset ${cursor} (ordering pin)`);
    cursor = at;
  }
};

const modalBody = norm(modal);

// The App ∪ modal union: identical guarantee with the JSX inline in App or
// carried by the module.
const appPlusModal = `${app}\n${modal}`;

// ---------------------------------------------------------------------------
// the module — export, exact props-in contract, gate, purity
// ---------------------------------------------------------------------------

test('The modal module exists, exports OnboardingModal, and gates module-side', () => {
  assert.ok(existsSync(join(root, MODAL_PATH)), `${MODAL_PATH} must exist`);
  assert.match(modal, /export function OnboardingModal\(\{ onboardingOpen, onFinish, onStartTour, onImportBackup \}\)/, 'the exact props-in contract from the T05 roadmap row');
  const gateIdx = modal.indexOf('if (!onboardingOpen) return null;');
  assert.ok(gateIdx > 0, 'the null gate lives module-side inside the modal component');
  assert.equal(countIn(modal, 'if (!onboardingOpen) return null;'), 1, 'the module-side gate appears exactly once');
});

test('The module is presentation-only — logo + lucide imports, zero hooks, zero context/IO reach', () => {
  const importLines = modal.split('\n').filter((l) => /^\s*import\b/.test(l));
  assert.equal(importLines.length, 2, 'the module declares exactly two imports (shared logo + lucide icons)');
  assert.equal(countIn(modal, "import { GroundRumbleLogo } from '../GroundRumbleLogo';"), 1, 'the shared logo module import moves with the JSX (sibling-relative form)');
  assert.equal(importLines.filter((l) => l === "import { Upload } from 'lucide-react';").length, 1, 'the icon set moves with the JSX, byte-exact');
  assert.doesNotMatch(modal, /\buseState\b|\buseEffect\b|\buseRef\b|\buseMemo\b|\buseCallback\b|\buseContext\b|\buseUI\b/, 'no hooks and no context reach in the presentation module');
  assert.doesNotMatch(modal, /localStorage|window\.|document\.|fetch\(/, 'no IO in the presentation module');
});

// ---------------------------------------------------------------------------
// the modal JSX — locked against the module body (ordered)
// ---------------------------------------------------------------------------

test('Modal JSX — overlay shell, glass-card brand header with the ✕ skip (ordered)', () => {
  ordered('modal shell', modalBody, [
    'if (!onboardingOpen) return null;',
    "position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,",
    "zIndex: 96, padding: '20px'",
    'className="glass-card"',
    "maxWidth: '620px', padding: '28px'",
    '<GroundRumbleLogo size={44} />',
    "Ground<span style={{ color: 'var(--color-primary)' }}>Rumble</span>",
    'LLM Security Testing',
    'onClick={onFinish}',
    'title="Skip"',
    '✕',
  ]);
  assert.equal(countIn(modalBody, 'className="btn-secondary"'), 3, 'the three secondary affordances (✕ skip, previous-export label, skip button) keep their class');
});

test('Modal copy — the two welcome paragraphs keep their exact sentences (ordered)', () => {
  ordered('modal copy', modalBody, [
    'Welcome! A client-side security auditor that stress-tests LLM models against adversarial MITRE ATLAS techniques.',
    'Everything stays in your browser — API keys are sent only to the model hosts you choose.',
    "We&apos;ll now guide you through the whole interface: configure your providers and the AI judge, sync the live",
    'ATLAS matrix, then build a comparison lineup and run your first audit — all by clicking the real buttons.',
  ]);
});

test('Let\'s-get-started calls onFinish() then onStartTour(); the hidden import input rides on onImportBackup', () => {
  ordered('modal actions', modalBody, [
    "onClick={() => { onFinish(); onStartTour(); }}",
    'className="btn-primary"',
    "Let&apos;s get started",
    'htmlFor="wizard-backup-input"',
    '<Upload size={14} style={{ marginRight: \'6px\' }} /> I have a previous export',
    'onClick={onFinish}',
    'Skip — I already know this tool',
    '<input',
    'type="file"',
    'id="wizard-backup-input"',
    'accept=".json,application/json"',
    "style={{ display: 'none' }}",
    'onChange={onImportBackup}',
  ]);
  assert.equal(countIn(modalBody, 'onClick={onFinish}'), 2, 'onFinish wires the ✕ skip and the skip button exactly twice');
  assert.equal(countIn(modalBody, 'onFinish(); onStartTour();'), 1, 'Let\'s-get-started calls onFinish() then onStartTour() — the composite fires exactly once');
  assert.equal(countIn(modalBody, 'onStartTour()'), 1, 'onStartTour() fires exactly once — from Let\'s get started');
  assert.equal(countIn(modalBody, 'onImportBackup'), 2, 'onImportBackup arrives once in the signature and is consumed exactly once — the hidden file input');
});

// ---------------------------------------------------------------------------
// the App wiring — thin wrapper, mount, render gate, shrink
// ---------------------------------------------------------------------------

test('App keeps the first-run render gate and mounts <OnboardingModal/> through a thin renderOnboarding wrapper', () => {
  const wrapperIdx = app.indexOf('const renderOnboarding = () => (');
  assert.ok(wrapperIdx > 0, 'renderOnboarding stays as the thin App-side wrapper');
  ordered('App mount', norm(app.slice(wrapperIdx, app.indexOf('\n  );', wrapperIdx))), [
    '<OnboardingModal',
    'onboardingOpen={onboardingOpen}',
    'onFinish={finishOnboarding}',
    'onStartTour={() => { finishOnboarding(); setTourRunning(true); }}',
    'onImportBackup={handleImportBackup}',
    '/>',
  ]);
  const gate = '{(!vaultLocked || onboardingOpen) && renderOnboarding()}';
  assert.equal(countIn(app, gate), 1, 'the first-run render gate stays App-side, exactly once');
  const gateComment = '{/* On first run (onboardingOpen), show onboarding even if vault state is still loading */}';
  assert.equal(countIn(app, gateComment), 1, 'the gate comment survives the extraction');
});

test('The inline JSX has left App.jsx — no orphaned region, no double ownership', () => {
  assert.doesNotMatch(app, /First-run welcome modal/, 'the inline section comment moved out with the JSX');
  assert.equal(countIn(app, '<GroundRumbleLogo'), 0, 'App no longer renders the logo (the modal owns the size-44 mount)');
  assert.equal(countIn(app, 'id="wizard-backup-input"'), 0, 'the wizard import input id moved with the JSX');
  assert.equal(countIn(app, 'onChange={handleImportBackup}'), 0, 'the wizard onChange binding moved with the JSX');
  assert.equal(countIn(app, "Let&apos;s get started"), 0, 'the get-started copy moved with the JSX');
  const uiBlock = app.slice(app.indexOf('const ui = useUI();'), app.indexOf('} = ui;'));
  for (const binding of ['onboardingOpen,', 'setTourRunning,', 'finishOnboarding,']) {
    assert.ok(uiBlock.includes(binding), `the useUI() destructure still binds ${binding} (gate + mount + Tour)`);
  }
});

test('Shrink gate — App.jsx is strictly net-smaller than its 1950-line pre-T05 baseline', () => {
  assert.ok(lineCount(app) < 1950, `App.jsx is net-smaller than the 1950-line baseline (landed ${lineCount(app)})`);
  assert.ok(lineCount(modal) > 50, `the modal module carries the moved region (the extracted region spans ~60 source lines; got ${lineCount(modal)})`);
});

// ---------------------------------------------------------------------------
// Union parity — true whether the JSX is inline in App or in the module
// ---------------------------------------------------------------------------

test('Parity: exactly one wizard import input, one logo mount and one logo module source across App ∪ OnboardingModal', () => {
  assert.equal(countIn(appPlusModal, 'id="wizard-backup-input"'), 1, 'exactly one wizard-backup-input across the union, both sides of the move');
  assert.equal(countIn(appPlusModal, /onChange=\{(?:handleImportBackup|onImportBackup)\}/), 1, 'exactly one wizard onChange binding (handleImportBackup pre-T05, the onImportBackup prop post-T05) across the union');
  assert.equal(countIn(appPlusModal, '<GroundRumbleLogo size={44} />'), 1, 'exactly one size-44 logo mount across the union');
  assert.equal(
    countIn(appPlusModal, /^import \{ GroundRumbleLogo \} from '(?:\.\.\/|\.\.\/components\/|\.\/components\/)GroundRumbleLogo';$/m),
    1,
    'exactly one named import of the shared logo module across the union (App form pre-move, sibling form post-move)'
  );
});
