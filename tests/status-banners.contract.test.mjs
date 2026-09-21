// Contract: the "Needs attention" + vault-locked
// banner surface of src/components/views/SettingsView.jsx — the
// hasConfiguredProviders/judgeReady/genReady warnings derivation and the two
// Sandbox warning strings — renders from
// src/components/views/settings/StatusBanners.jsx (props-in/events-out:
// warnings, vaultLocked) while the derivation itself is the pure
// buildSettingsWarnings({ providers, judgeConfig, effectiveGenConfig,
// useDemoMode, buildJudge }) in src/utils/settings-warnings.js. SettingsView
// composes both: it calls the util and mounts the component, carrying no
// inline IIFE. The banner copy stays byte-exact; card order is preserved.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: see tests/settings-view.contract.test.mjs,
// tests/providers-card.contract.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relPath) => readFileSync(join(root, relPath), 'utf8').replace(/\r\n/g, '\n');
const readIfExists = (relPath) => { try { return readSource(relPath); } catch { return ''; } };
const banners = readSource('src/components/views/settings/StatusBanners.jsx');
const view = readSource('src/components/views/SettingsView.jsx');
const warningsUtil = readSource('src/utils/settings-warnings.js');
// The Helper Models card may live in this file. The banners → ProvidersCard →
// Helper Models order pin resolves across the view ∪ helper-card file set
// either way.
const viewPlusHelper = view + '\n' + readIfExists('src/components/views/settings/HelperModelsCard.jsx');

const countIn = (source, needle) => source.split(needle).length - 1;

const JUDGE_WARNING = 'Sandbox is ON and you have providers configured, but the AI Judge is not set to one of them — once you turn Sandbox off, judge evaluations will fall back to keyword checks. Set the AI Judge to a provider you configured.';
const GEN_WARNING = `Sandbox is ON and you have providers configured, but the Test Generator model is not set to one of them — AI test generation won\\'t work once you leave Sandbox. Set the Test Generator (or AI Judge) to a provider you configured.`;
const VAULT_BANNER = 'Your API keys are <b>locked</b> (encrypted vault). Unlock them in the <b>Key Vault</b> card below to use';

test('StatusBanners is a props-in component over (warnings, vaultLocked)', () => {
  assert.ok(/export function StatusBanners\(\{/.test(banners), 'the component is a named function export');
  const sig = /export function StatusBanners\(\{([\s\S]*?)\}\)/.exec(banners);
  assert.ok(sig, 'the component destructures its props');
  for (const name of ['warnings', 'vaultLocked']) {
    assert.match(sig[1], new RegExp(`\\b${name}\\b`), `the component takes ${name} as a prop`);
  }
  for (const ctx of ['useProviders', 'useSettings', 'useUI']) {
    assert.ok(!banners.includes(ctx), `the component never reaches ${ctx} (events-out/pure rendering)`);
  }
});

test('The Needs attention shell renders the warnings prop exactly as before', () => {
  assert.ok(banners.includes("<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-warning)' }}>")
    && banners.includes('<AlertTriangle size={16} /> Needs attention'), 'the Needs attention shell header is intact');
  assert.ok(banners.includes("background: 'rgba(245,158,11,0.08)'"), 'the amber warning shell background is intact');
  assert.ok(banners.includes('{warnings.map((w, i) => (')
    && banners.includes("<span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{w}</span>"),
    'each warning renders as a muted span in order');
  assert.equal(countIn(banners, 'Sandbox is ON'), 0, 'no warning strings live in the component — they are util-owned');
});

test('The vault-locked banner renders on the vaultLocked prop with its exact copy', () => {
  assert.ok(banners.includes('{vaultLocked && ('), 'the vault-locked banner is gated on the vaultLocked prop');
  assert.equal(countIn(banners, VAULT_BANNER), 1, 'the vault-locked copy renders exactly once in the component');
  assert.ok(banners.includes('<ShieldCheck size={16} color="var(--color-secondary)" />'), 'the ShieldCheck icon keeps its size/color');
  assert.ok(banners.includes("background: 'rgba(168,85,247,0.08)'"), 'the purple vault banner background is intact');
  assert.ok(banners.includes('real providers; until then the app runs in sandbox mode.'), 'the sandbox-mode tail of the banner copy is intact');
});

test('BuildSettingsWarnings owns the derivation and both warning strings', () => {
  assert.ok(/export (const|function) buildSettingsWarnings/.test(warningsUtil), 'buildSettingsWarnings is exported from the util');
  assert.ok(warningsUtil.includes('const hasConfiguredProviders = providers.some(cp => cp.enabled !== false && (String(cp.apiKey || \'\').trim() || cp.connector === \'raw\' || cp.endpoint));'), 'hasConfiguredProviders keeps its exact gating expression');
  assert.ok(warningsUtil.includes('const judgeReady = !!buildJudge(judgeConfig, providers);'), 'judgeReady derives from buildJudge(judgeConfig, providers)');
  assert.ok(warningsUtil.includes('const genReady = !!buildJudge(effectiveGenConfig, providers);'), 'genReady derives from buildJudge(effectiveGenConfig, providers)');
  assert.equal(countIn(warningsUtil, 'if (useDemoMode && hasConfiguredProviders && !judgeReady) {'), 1, 'the judge warning gate appears exactly once');
  assert.equal(countIn(warningsUtil, 'if (useDemoMode && hasConfiguredProviders && !genReady) {'), 1, 'the generator warning gate appears exactly once');
  assert.equal(countIn(warningsUtil, `warnings.push('${JUDGE_WARNING}');`), 1, 'the judge warning string is pushed byte-exact');
  assert.equal(countIn(warningsUtil, `warnings.push('${GEN_WARNING}');`), 1, 'the generator warning string is pushed byte-exact');
  assert.ok(warningsUtil.indexOf(GEN_WARNING) > warningsUtil.indexOf(JUDGE_WARNING), 'the generator warning is pushed after the judge warning');
});

test('SettingsView calls the util and sheds the inline IIFE entirely', () => {
  assert.match(view, /import \{ buildSettingsWarnings \} from '\.\.\/\.\.\/utils\/settings-warnings(\.js)?';/, 'the view imports buildSettingsWarnings from the shared util');
  const call = view.indexOf('const warnings = buildSettingsWarnings({');
  assert.ok(call >= 0, 'the view calls the util to derive its warnings');
  assert.equal(countIn(view, 'const warnings = buildSettingsWarnings({'), 1, 'the util is called exactly once');
  const callArgs = view.slice(call, view.indexOf('});', call));
  for (const key of ['providers', 'judgeConfig', 'effectiveGenConfig', 'useDemoMode', 'buildJudge']) {
    assert.match(callArgs, new RegExp(`\\b${key}\\b`), `the call passes ${key} into the util`);
  }
  assert.equal(countIn(view, '{(() => {'), 0, 'the inline warnings IIFE is gone from the view');
  assert.equal(countIn(view, 'const hasConfiguredProviders'), 0, 'the derivation no longer lives in the view');
  assert.equal(countIn(view, 'Sandbox is ON'), 0, 'no warning strings remain in the view');
  assert.equal(countIn(view, 'Your API keys are <b>locked</b> (encrypted vault)'), 0, 'the vault-locked banner copy left the view');
});

test('SettingsView mounts <StatusBanners> once, ahead of the ProvidersCard (card order preserved)', () => {
  assert.match(view, /import \{ StatusBanners \} from '\.\/settings\/StatusBanners(\.js)?';/, 'the view imports the banners component');
  const mountAt = view.indexOf('<StatusBanners');
  assert.ok(mountAt >= 0, 'the view mounts <StatusBanners');
  assert.equal(countIn(view, '<StatusBanners'), 1, 'the component is composed exactly once');
  const mountBlock = view.slice(mountAt, view.indexOf('>', mountAt) + 1);
  assert.ok(mountBlock.includes('warnings={warnings}'), 'the mount wires warnings={warnings}');
  assert.ok(mountBlock.includes('vaultLocked={vaultLocked}'), 'the mount wires vaultLocked={vaultLocked}');
  const providersAt = viewPlusHelper.indexOf('<ProvidersCard');
  const helperCard = viewPlusHelper.indexOf('<div className="glass-card" data-tour="helper-models"');
  assert.ok(providersAt > mountAt && helperCard > providersAt, 'banners -> ProvidersCard -> Helper Models order is preserved (view ∪ helper card)');
});
