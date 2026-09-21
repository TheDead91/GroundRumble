export const modelKeyFor = (r) => `${r.provider}::${r.model}`;

export function deriveDashboardMetrics({ history, atlasMatrix, effectiveDetails, providerLabel, dashSortKey, dashSortDir }) {
  const allHistoricalResults = history.flatMap(h => (h.details || []).map(effectiveDetails));
  const allModelKeys = [...new Set(allHistoricalResults.map(modelKeyFor))];
  const sandboxModelKeys = new Set();
  history.forEach(h => {
    if (h.isDemo) (h.details || []).forEach(r => sandboxModelKeys.add(modelKeyFor(r)));
  });
  const isSandboxModel = (modelKey) => sandboxModelKeys.has(modelKey);
  const modelsTestedCount = allModelKeys.length;
  const vulnerableModelKeys = [...new Set(allHistoricalResults.filter(r => r.status === 'VULNERABLE').map(modelKeyFor))];
  const vulnerableModelsCount = vulnerableModelKeys.length;

  const perModelOverall = {};
  const perModelTacticStats = {};
  allHistoricalResults.forEach(r => {
    if (r.status === 'ERROR' || r.status === 'EMPTY' || r.status === 'INCONCLUSIVE') return;
    const modelKey = modelKeyFor(r);
    perModelOverall[modelKey] = perModelOverall[modelKey] || { total: 0, secure: 0 };
    perModelOverall[modelKey].total += 1;
    if (r.status === 'SECURE') perModelOverall[modelKey].secure += 1;
    perModelTacticStats[modelKey] = perModelTacticStats[modelKey] || {};
    perModelTacticStats[modelKey][r.tactic] = perModelTacticStats[modelKey][r.tactic] || { total: 0, secure: 0 };
    perModelTacticStats[modelKey][r.tactic].total += 1;
    if (r.status === 'SECURE') perModelTacticStats[modelKey][r.tactic].secure += 1;
  });

  const tacticIdByName = {};
  atlasMatrix.forEach(tactic => { tacticIdByName[tactic.name] = tactic.id; });
  const dashTacticColumns = [];
  const seenTactic = {};
  Object.keys(perModelTacticStats).forEach(modelKey => {
    Object.keys(perModelTacticStats[modelKey]).forEach(tacticName => {
      if (!seenTactic[tacticName]) {
        seenTactic[tacticName] = true;
        dashTacticColumns.push(tacticName);
      }
    });
  });
  dashTacticColumns.sort((a, b) => {
    const ia = atlasMatrix.findIndex(tactic => tactic.name === a);
    const ib = atlasMatrix.findIndex(tactic => tactic.name === b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const modelNameFor = (modelKey) => modelKey.split('::').slice(1).join('::');
  const modelProviderFor = (modelKey) => providerLabel(modelKey.split('::')[0]);
  const tacticScoreFor = (mk, tname) => {
    const s = perModelTacticStats[mk]?.[tname] || { total: 0, secure: 0 };
    return s.total > 0 ? Math.round((s.secure / s.total) * 100) : null;
  };
  const overallScoreFor = (mk) => {
    const o = perModelOverall[mk] || { total: 0, secure: 0 };
    return o.total > 0 ? Math.round((o.secure / o.total) * 100) : null;
  };
  const sortedModelKeys = [...allModelKeys].sort((a, b) => {
    let va, vb;
    if (dashSortKey === 'model') { va = modelNameFor(a).toLowerCase(); vb = modelNameFor(b).toLowerCase(); }
    else if (dashSortKey === 'provider') { va = modelProviderFor(a).toLowerCase(); vb = modelProviderFor(b).toLowerCase(); }
    else if (dashSortKey === 'overall') { va = overallScoreFor(a); vb = overallScoreFor(b); }
    else if (dashSortKey.startsWith('tactic:')) {
      const tacticName = dashSortKey.slice(7);
      va = tacticScoreFor(a, tacticName); vb = tacticScoreFor(b, tacticName);
    } else return 0;
    if (va < vb) return dashSortDir === 'asc' ? -1 : 1;
    if (va > vb) return dashSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return {
    allHistoricalResults,
    allModelKeys,
    sandboxModelKeys,
    isSandboxModel,
    modelsTestedCount,
    vulnerableModelKeys,
    vulnerableModelsCount,
    perModelOverall,
    perModelTacticStats,
    tacticIdByName,
    dashTacticColumns,
    modelNameFor,
    modelProviderFor,
    tacticScoreFor,
    overallScoreFor,
    sortedModelKeys,
  };
}
