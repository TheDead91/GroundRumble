import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { deriveDashboardMetrics, modelKeyFor } = await import('../src/utils/dashboard-metrics.js');
const viewSource = readFileSync(new URL('../src/components/views/DashboardView.jsx', import.meta.url), 'utf8');

const result = (provider, model, tactic, status) => ({ provider, model, tactic, status });
const atlasMatrix = [
  { name: 'Execution', id: 'AML.TA0005' },
  { name: 'Discovery', id: 'AML.TA0007' },
  { name: 'Unknown', id: 'AML.TA9999' },
];
const history = [
  { isDemo: true, details: [result('zeta', 'model::two', 'Discovery', 'VULNERABLE'), result('zeta', 'model::two', 'Execution', 'SECURE')] },
  { isDemo: false, details: [
    result('alpha', 'one', 'Execution', 'SECURE'), result('alpha', 'one', 'Execution', 'VULNERABLE'),
    result('alpha', 'one', 'Discovery', 'ERROR'), result('alpha', 'one', 'Unknown', 'EMPTY'),
    result('alpha', 'one', 'Unknown', 'INCONCLUSIVE'), result('beta', 'three', 'Discovery', 'SECURE'),
  ] },
];
const options = { history, atlasMatrix, effectiveDetails: x => x, providerLabel: x => x };

test('Pure metrics output preserves identity, sandbox, exclusions and exact tallies', () => {
  assert.equal(modelKeyFor({ provider: 'p', model: 'm::variant' }), 'p::m::variant');
  const metrics = deriveDashboardMetrics({ ...options, dashSortKey: 'model', dashSortDir: 'asc' });
  assert.deepEqual(metrics.allModelKeys, ['zeta::model::two', 'alpha::one', 'beta::three']);
  assert.equal(metrics.modelsTestedCount, 3);
  assert.deepEqual([...metrics.sandboxModelKeys], ['zeta::model::two']);
  assert.equal(metrics.isSandboxModel('zeta::model::two'), true);
  assert.deepEqual(metrics.vulnerableModelKeys, ['zeta::model::two', 'alpha::one']);
  assert.deepEqual(metrics.perModelOverall, {
    'zeta::model::two': { total: 2, secure: 1 }, 'alpha::one': { total: 2, secure: 1 }, 'beta::three': { total: 1, secure: 1 },
  });
  assert.deepEqual(metrics.perModelTacticStats['alpha::one'], { Execution: { total: 2, secure: 1 } });
});

test('ATLAS ordering and model/overall/tactic sorting remain deterministic', () => {
  assert.deepEqual(deriveDashboardMetrics({ ...options, dashSortKey: 'model', dashSortDir: 'asc' }).dashTacticColumns, ['Execution', 'Discovery']);
  assert.deepEqual(deriveDashboardMetrics({ ...options, dashSortKey: 'model', dashSortDir: 'asc' }).sortedModelKeys, ['zeta::model::two', 'alpha::one', 'beta::three']);
  assert.deepEqual(deriveDashboardMetrics({ ...options, dashSortKey: 'overall', dashSortDir: 'desc' }).sortedModelKeys, ['beta::three', 'zeta::model::two', 'alpha::one']);
  assert.deepEqual(deriveDashboardMetrics({ ...options, dashSortKey: 'tactic:Execution', dashSortDir: 'asc' }).sortedModelKeys, ['beta::three', 'alpha::one', 'zeta::model::two']);
});

test('Records without a details array contribute nothing and stay out of the sandbox', () => {
  const sparse = deriveDashboardMetrics({
    history: [
      { isDemo: true },
      { isDemo: false, details: [result('p', 'm', 'Execution', 'SECURE')] },
    ],
    atlasMatrix,
    effectiveDetails: x => x,
    providerLabel: x => x,
    dashSortKey: 'model',
    dashSortDir: 'asc',
  });
  assert.deepEqual(sparse.allModelKeys, ['p::m']);
  assert.deepEqual([...sparse.sandboxModelKeys], []);
});

test('Unknown-tactic columns, excluded-only models, and provider sort are handled', () => {
  const mixed = [
    { isDemo: false, details: [
      result('alpha', 'one', 'Execution', 'SECURE'),
      result('alpha', 'one', 'NotInMatrix', 'VULNERABLE'),
      result('beta', 'two', 'Execution', 'VULNERABLE'),
      result('gamma', 'three', 'Execution', 'ERROR'),
    ] },
  ];
  const opts = { history: mixed, atlasMatrix, effectiveDetails: x => x, providerLabel: x => x.toUpperCase() };
  const byOverall = deriveDashboardMetrics({ ...opts, dashSortKey: 'overall', dashSortDir: 'asc' });
  assert.ok(byOverall.dashTacticColumns.includes('NotInMatrix'), 'tactics absent from the ATLAS matrix still become columns');
  assert.equal(byOverall.overallScoreFor('gamma::three'), null, 'a model whose only result is excluded has no overall score');
  assert.deepEqual(byOverall.sortedModelKeys.slice(0, 2), ['beta::two', 'gamma::three'], 'models without a countable overall score tie at the bottom');
  assert.equal(byOverall.sortedModelKeys[2], 'alpha::one', 'the only positively-scored model ranks last in ascending order');
  const byProvider = deriveDashboardMetrics({ ...opts, dashSortKey: 'provider', dashSortDir: 'asc' });
  assert.deepEqual(byProvider.sortedModelKeys, ['alpha::one', 'beta::two', 'gamma::three'],
    'provider sort keys off the providerLabel label, not the raw provider string');
});

test('Unknown sort key is a stable no-op and descending orders low scores last', () => {
  assert.deepEqual(
    deriveDashboardMetrics({ ...options, dashSortKey: 'nonsense', dashSortDir: 'desc' }).sortedModelKeys,
    ['zeta::model::two', 'alpha::one', 'beta::three'],
    'no recognised sort key leaves every model in insertion order'
  );
  const scored = deriveDashboardMetrics({
    history: [{ isDemo: false, details: [
      result('p', 'high1', 'Execution', 'SECURE'),
      result('p', 'high2', 'Execution', 'SECURE'),
      result('p', 'low', 'Execution', 'VULNERABLE'),
    ] }],
    atlasMatrix,
    effectiveDetails: x => x,
    providerLabel: x => x,
    dashSortKey: 'overall',
    dashSortDir: 'desc',
  });
  assert.deepEqual(scored.sortedModelKeys, ['p::high1', 'p::high2', 'p::low']);
});

test('DashboardView adopts the module while retaining exactly the two sort state hooks', () => {
  assert.match(viewSource, /from ['"]\.\.\/\.\.\/utils\/dashboard-metrics(?:\.js)?['"]/);
  assert.match(viewSource, /deriveDashboardMetrics\(/);
  assert.equal((viewSource.match(/useState\(/g) || []).length, 2);
  for (const declaration of ['const modelKeyFor =', 'const perModelOverall =', 'const perModelTacticStats =', 'const dashTacticColumns =']) {
    assert.doesNotMatch(viewSource, new RegExp(`^  ${declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), `${declaration} remains inline`);
  }
  assert.match(viewSource, /history/);
  assert.match(viewSource, /atlasMatrix/);
  assert.match(viewSource, /effectiveDetails/);
  assert.match(viewSource, /dashSortKey/);
  assert.match(viewSource, /dashSortDir/);
});
