export function indexTestCatalog(presetTests, autoTests, customTests) {
  const indexed = {};
  [...presetTests, ...autoTests, ...customTests].forEach(test => { indexed[test.id] = test; });
  return indexed;
}

export function projectEnabledTests(tests, disabledSet) {
  return tests.filter(test => !disabledSet.has(test.id));
}

export function sortTests(tests, sortKey, sortDir) {
  const sorted = [...tests];
  sorted.sort((a, b) => {
    let delta = 0;
    if (sortKey === 'name') delta = (a.name || '').localeCompare(b.name || '');
    else if (sortKey === 'techniqueId') delta = (a.techniqueId || '').localeCompare(b.techniqueId || '');
    else if (sortKey === 'source') delta = (a.origin || '').localeCompare(b.origin || '');
    return sortDir === 'asc' ? delta : -delta;
  });
  return sorted;
}

export function getTestFilterOptions(tests) {
  return {
    sources: [...new Set(tests.map(test => (test.origin || '').trim()).filter(Boolean))].sort(),
    techniques: [...new Set(tests.map(test => (test.techniqueId || '').trim()).filter(Boolean))].sort()
  };
}

export function filterTests(tests, query, source, technique, enabled, disabledIds) {
  return tests.filter(test => {
    const q = query.trim().toLowerCase();
    if (q) {
      const haystack = `${test.name || ''} ${test.techniqueId || ''} ${test.techniqueName || ''} ${test.origin || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (source !== 'all' && (test.origin || '') !== source) return false;
    if (technique !== 'all' && (test.techniqueId || '') !== technique) return false;
    const removed = disabledIds.includes(test.id);
    if (enabled === 'enabled' && removed) return false;
    if (enabled === 'disabled' && !removed) return false;
    return true;
  });
}

export function getTestSortIndicator(key, sortKey, sortDir) {
  return sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
}
