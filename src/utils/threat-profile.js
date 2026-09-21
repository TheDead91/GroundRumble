/**
 * Normalizes a parsed threat-profile object into its canonical shape.
 */
export const normalizeThreatProfile = (parsed, validTechniqueIds = null) => {
  const vectors = Array.isArray(parsed.vectors)
    ? parsed.vectors.filter(v => v && typeof v === 'object').map(v => ({
        name: String(v.name || 'Attack vector').trim(),
        description: String(v.description || '').trim(),
        payloadShape: String(v.payloadShape || '').trim(),
        techniqueId: String(v.techniqueId || '').trim(),
        techniqueName: String(v.techniqueName || '').trim(),
        evidence: String(v.evidence || '').trim()
      })).filter(v => v.payloadShape || v.description)
      : [];
  const filteredVectors = validTechniqueIds
    ? vectors.filter(vector => validTechniqueIds.has(vector.techniqueId))
    : vectors;
  return {
    sourceKey: String(parsed.sourceKey || '').trim(),
    sourceTitle: String(parsed.sourceTitle || '').trim(),
    vulnerabilityClass: String(parsed.vulnerabilityClass || '').trim(),
    vectors: filteredVectors,
    weight: Math.max(1, Math.min(3, Number(parsed.weight) || 1))
  };
};
