// Regression coverage for the Helper Models "Test model" buttons: they must be
// DISABLED while the corresponding helper model is not set (e.g. fresh install
// with no provider configured), not merely while a ping is in flight or the
// vault is locked. The card derives judgeModelSet / genModelSet from the props
// it already receives, mirroring buildJudge's model resolution
// (cfg.model || provider.models[0], gated on a selectable provider) — the same
// semantics PromptWorkspace's judgeConfigured uses.
//
// Source-text level because Node cannot import JSX/extensionless specifiers
// under bare node:test (repo convention: tests/settings-view.contract.test.mjs):
// the first section pins the button bindings, the second evaluates the REAL
// derivations read from the card source against behavior fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD_PATH = 'src/components/views/settings/HelperModelsCard.jsx';
const card = readFileSync(join(root, CARD_PATH), 'utf8').replace(/\r\n/g, '\n');

const selectableFor = (id) => (p) => p === id;

// ---------------------------------------------------------------------------
// the Test buttons gate on the model-set state (not just busy + vault)
// ---------------------------------------------------------------------------

test('The judge Test button is disabled while the AI Judge model is not set', () => {
  assert.match(card, /<button onClick=\{testJudge\} className="btn-secondary" disabled=\{testingJudge \|\| vaultLocked \|\| !judgeModelSet\}/,
    'the judge Test button must disable when judgeModelSet is false');
  assert.ok(!/<button onClick=\{testJudge\} className="btn-secondary" disabled=\{testingJudge \|\| vaultLocked\}/.test(card),
    'the judge Test button must not disable on busy/vault alone — it must also respect the model-set gate');
});

test('The generator Test button is disabled while the Test Generator model is not set', () => {
  assert.match(card, /<button onClick=\{testGenerator\} className="btn-secondary" disabled=\{testingGen \|\| vaultLocked \|\| !genModelSet\}/,
    'the generator Test button must disable when genModelSet is false');
  assert.ok(!/<button onClick=\{testGenerator\} className="btn-secondary" disabled=\{testingGen \|\| vaultLocked\}/.test(card),
    'the generator Test button must not disable on busy/vault alone — it must also respect the model-set gate');
});

// ---------------------------------------------------------------------------
// the model-set derivations behave correctly across the config states
// ---------------------------------------------------------------------------

// Extracts the RHS of `const <name> = <expr>;` from the card source so the
// fixtures exercise the ACTUAL derivation, not a copy in this test.
const extractExpr = (name) => {
  const re = new RegExp(`const ${name} = ([\\s\\S]*?);`);
  const m = re.exec(card);
  assert.ok(m, `the card must define ${name}`);
  return m[1].trim();
};

const evaluate = (expr, ctx) => {
  const keys = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  return new Function(...keys, `return (${expr});`)(...keys.map(k => ctx[k]));
};

const judgeExpr = extractExpr('judgeModelSet');
const genExpr = extractExpr('genModelSet');

test('JudgeModelSet is false when no provider is configured (the reported bug)', () => {
  assert.equal(
    evaluate(judgeExpr, { helperProviderSelectable: () => false, judgeConfig: { provider: '', model: '' }, judgeModelList: [] }),
    false,
    'a fresh, unconfigured judge must report no model set'
  );
});

test('JudgeModelSet resolves a selectable provider with an explicit model', () => {
  const selectable = selectableFor('prov-a');
  assert.equal(
    evaluate(judgeExpr, { helperProviderSelectable: selectable, judgeConfig: { provider: 'prov-a', model: 'model-a' }, judgeModelList: ['model-a'] }),
    true,
    'a selectable provider with a chosen model counts as set'
  );
});

test('JudgeModelSet resolves a selectable provider with a default model list', () => {
  const selectable = selectableFor('prov-a');
  assert.equal(
    evaluate(judgeExpr, { helperProviderSelectable: selectable, judgeConfig: { provider: 'prov-a', model: '' }, judgeModelList: ['model-a'] }),
    true,
    'a selectable provider with models still yields the first model as the effective judge (buildJudge parity)'
  );
});

test('JudgeModelSet stays false when no model and no provider default exist', () => {
  const selectable = selectableFor('prov-a');
  assert.equal(
    evaluate(judgeExpr, { helperProviderSelectable: selectable, judgeConfig: { provider: 'prov-a', model: '' }, judgeModelList: [] }),
    false,
    'a provider without any model choice reports no model set'
  );
});

test('GenModelSet follows the same gates for the Test Generator config', () => {
  const selectable = selectableFor('prov-g');
  assert.equal(
    evaluate(genExpr, { helperProviderSelectable: () => false, effectiveGenConfig: { provider: '', model: '' }, genModelList: [] }),
    false,
    'a fresh, unconfigured generator must report no model set'
  );
  assert.equal(
    evaluate(genExpr, { helperProviderSelectable: selectable, effectiveGenConfig: { provider: 'prov-g', model: 'model-g' }, genModelList: ['model-g'] }),
    true,
    'a selectable generator provider with a chosen model counts as set'
  );
  assert.equal(
    evaluate(genExpr, { helperProviderSelectable: selectable, effectiveGenConfig: { provider: 'prov-g', model: '' }, genModelList: ['model-g'] }),
    true,
    'a selectable generator provider with models yields the first model as effective (buildJudge parity)'
  );
  assert.equal(
    evaluate(genExpr, { helperProviderSelectable: selectable, effectiveGenConfig: { provider: 'prov-g', model: '' }, genModelList: [] }),
    false,
    'a generator provider without any model choice reports no model set'
  );
});