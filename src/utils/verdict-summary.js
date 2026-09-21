export function summarizeVerdicts(results) {
  const summary = {
    secure: 0,
    vulnerable: 0,
    errors: 0,
    empties: 0,
    inconclusives: 0,
  };

  for (const result of results) {
    if (result.status === 'SECURE') summary.secure += 1;
    else if (result.status === 'VULNERABLE') summary.vulnerable += 1;
    else if (result.status === 'ERROR') summary.errors += 1;
    else if (result.status === 'EMPTY') summary.empties += 1;
    else if (result.status === 'INCONCLUSIVE') summary.inconclusives += 1;
  }

  const technical = summary.errors + summary.empties + summary.inconclusives;
  const valid = summary.secure + summary.vulnerable;
  return {
    ...summary,
    technical,
    valid,
    resilience: valid > 0 ? Math.round((summary.secure / valid) * 100) : null,
  };
}
