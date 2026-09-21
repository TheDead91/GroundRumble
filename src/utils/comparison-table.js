export const statusWeight = (status) => status === 'VULNERABLE' ? 0 : status === 'SECURE' ? 1 : 2;

export function buildComparisonRows({ results, allTests, targets, effectiveStatus }) {
  const testIds = [...new Set(results.map(result => result.testId))];
  return testIds.map(testId => {
    const test = allTests.find(candidate => candidate.id === testId);
    const cellRes = targets.map(target => results.find(result => result.testId === testId && result.targetUid === target.uid));
    const vulnCount = cellRes.filter(result => result && effectiveStatus(result) === 'VULNERABLE').length;
    const errCount = cellRes.filter(result => result && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(effectiveStatus(result))).length;
    const worst = Math.min(...cellRes.map(result => result ? statusWeight(effectiveStatus(result)) : 3));
    return { testId, test, cellRes, vulnCount, errCount, worst };
  });
}

export function classifyComparisonRows(rows, effectiveStatus) {
  return {
    failedRows: rows.filter(row => row.vulnCount > 0),
    inconclusiveRows: rows.filter(row => row.vulnCount === 0 && row.cellRes.some(result => result && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(effectiveStatus(result)))),
    succeededRows: rows.filter(row => row.vulnCount === 0 && !row.cellRes.some(result => result && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(effectiveStatus(result))) && row.cellRes.some(Boolean)),
  };
}

export function selectWorstResult(cellResults, effectiveStatus) {
  const present = cellResults.filter(Boolean);
  return present.length > 0
    ? present.reduce((worst, result) => statusWeight(effectiveStatus(result)) < statusWeight(effectiveStatus(worst)) ? result : worst, present[0])
    : undefined;
}

export function sortComparisonRows(rows, sortKey, sortDir) {
  return [...rows].sort((a, b) => {
    let difference = 0;
    if (sortKey === 'name') difference = (a.test?.name || '').localeCompare(b.test?.name || '');
    else if (sortKey === 'technique') difference = (a.test?.techniqueId || '').localeCompare(b.test?.techniqueId || '');
    else if (sortKey === 'result') difference = (b.vulnCount - a.vulnCount) || (a.worst - b.worst);
    return sortDir === 'asc' ? difference : -difference;
  });
}

export function summarizeModelResults(results, targetUid, effectiveDetails) {
  const modelResults = results.map(effectiveDetails).filter(result => result.targetUid === targetUid);
  const vuln = modelResults.filter(result => result.status === 'VULNERABLE').length;
  const secure = modelResults.filter(result => result.status === 'SECURE').length;
  const errs = modelResults.filter(result => result.status === 'ERROR').length;
  const empties = modelResults.filter(result => result.status === 'EMPTY').length;
  const inconclusives = modelResults.filter(result => result.status === 'INCONCLUSIVE').length;
  const valid = vuln + secure;
  const score = valid > 0 ? Math.round((secure / valid) * 100) : null;
  return { vuln, secure, errs, empties, inconclusives, valid, score };
}
