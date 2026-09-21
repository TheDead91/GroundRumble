// Unit contract for src/utils/settings-warnings.js: the settings
// warnings derivation (hasConfiguredProviders/judgeReady/genReady + the two
// Sandbox warning strings) is the pure, node-testable
// buildSettingsWarnings({ providers, judgeConfig, effectiveGenConfig,
// useDemoMode, buildJudge }) with buildJudge injected as a dependency —
// logic out of JSX.
//
// The behavioral guarantees match the derivation used by SettingsView.jsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSettingsWarnings } from '../src/utils/settings-warnings.js';

const JUDGE_WARNING = 'Sandbox is ON and you have providers configured, but the AI Judge is not set to one of them — once you turn Sandbox off, judge evaluations will fall back to keyword checks. Set the AI Judge to a provider you configured.';
const GEN_WARNING = 'Sandbox is ON and you have providers configured, but the Test Generator model is not set to one of them — AI test generation won\'t work once you leave Sandbox. Set the Test Generator (or AI Judge) to a provider you configured.';

// Hermetic stand-in for the real buildJudge (src/utils/judge-config.js):
// same truthiness contract — resolves when cfg names one of the given
// providers, null otherwise. The production call sites pass the real one.
const stubBuildJudge = (cfg, providers) =>
  (cfg && providers.some(p => p.id === cfg.provider)) ? { provider: cfg.provider } : null;

const configuredProvider = { id: 'p1', enabled: true, apiKey: 'sk-test' };
const judgeOnP1 = { provider: 'p1', model: 'm1' };

const run = ({ providers = [], judgeConfig = judgeOnP1, effectiveGenConfig = judgeOnP1, useDemoMode = true } = {}) =>
  buildSettingsWarnings({ providers, judgeConfig, effectiveGenConfig, useDemoMode, buildJudge: stubBuildJudge });

test('BuildSettingsWarnings is a pure array-valued function of its options object', () => {
  assert.equal(typeof buildSettingsWarnings, 'function', 'buildSettingsWarnings is exported and callable');
  const args = { providers: [configuredProvider], judgeConfig: { provider: 'nope' }, effectiveGenConfig: judgeOnP1, useDemoMode: true, buildJudge: stubBuildJudge };
  const first = buildSettingsWarnings(args);
  assert.ok(Array.isArray(first), 'returns an array');
  assert.deepEqual(buildSettingsWarnings(args), first, 'same inputs -> deep-equal outputs (deterministic, no hidden state)');
  assert.deepEqual(buildSettingsWarnings({ providers: [], judgeConfig: {}, effectiveGenConfig: {}, useDemoMode: false, buildJudge: stubBuildJudge }), [], 'demo off + nothing configured -> empty array');
});

test('Demo mode off or nothing configured -> no warnings', () => {
  assert.deepEqual(run({ useDemoMode: false }), [], 'demo mode off short-circuits every warning');
  assert.deepEqual(run({ providers: [] }), [], 'no providers -> nothing is configured -> no warnings');
  const allDisabled = [{ id: 'p1', enabled: false, apiKey: 'sk-test' }];
  assert.deepEqual(run({ providers: allDisabled }), [], 'providers with enabled === false do not count as configured');
  const blankKey = [{ id: 'p1', apiKey: '   ' }];
  assert.deepEqual(run({ providers: blankKey }), [], 'a whitespace-only apiKey does not count as configured');
  const noSecrets = [{ id: 'p1', apiKey: '' }];
  assert.deepEqual(run({ providers: noSecrets }), [], 'an empty-key, non-raw provider without an endpoint does not count as configured');
});

test('Raw-connector and endpoint-only providers count as configured', () => {
  const raw = [{ id: 'p1', connector: 'raw', endpoint: 'http://127.0.0.1:11434/v1' }];
  assert.deepEqual(run({ providers: raw, judgeConfig: { provider: 'missing' }, effectiveGenConfig: judgeOnP1 }), [JUDGE_WARNING], 'raw connector provider is configured, so a misresolved judge still warns');
  const endpointOnly = [{ id: 'p2', endpoint: 'http://127.0.0.1:1234/v1' }];
  const genOnP2 = { provider: 'p2', model: 'm2' };
  assert.deepEqual(run({ providers: endpointOnly, judgeConfig: genOnP2, effectiveGenConfig: genOnP2 }), [], 'an endpoint-only provider resolves judge+gen -> no warnings');
});

test('Both models resolved -> empty warning list', () => {
  assert.deepEqual(run({ providers: [configuredProvider] }), [], 'judge+gen both resolve against the configured provider');
});

test('An unresolved judge emits exactly the judge warning, byte-exact', () => {
  assert.deepEqual(
    run({ providers: [configuredProvider], judgeConfig: { provider: 'missing' }, effectiveGenConfig: judgeOnP1 }),
    [JUDGE_WARNING],
    'the judge warning string survives byte-exact into the util'
  );
});

test('An unresolved generator emits exactly the generator warning, byte-exact', () => {
  assert.deepEqual(
    run({ providers: [configuredProvider], judgeConfig: judgeOnP1, effectiveGenConfig: { provider: 'missing' } }),
    [GEN_WARNING],
    'the generator warning string survives byte-exact into the util'
  );
});

test('Both unresolved -> judge warning first, generator warning second (stable order)', () => {
  assert.deepEqual(
    run({ providers: [configuredProvider], judgeConfig: { provider: 'missing' }, effectiveGenConfig: { provider: 'missing' } }),
    [JUDGE_WARNING, GEN_WARNING],
    'warning order is judge-then-generator, matching the inline derivation'
  );
});
