// Pure ATLAS parsing and matrix construction. No fetch, no globals, so the
// module is node-testable; js-yaml stays a dynamic in-function import rather
// than a top-level one.
export const loadAtlasYaml = async (text) => {
  const { load: yamlLoad } = await import('js-yaml');
  return yamlLoad(text);
};

// Dedupe resolved relationship entries by their source id (fallback: identity),
// so duplicated achieves/mitigates/specializes entries collapse to one.
export const uniqBySource = (entries, table) => {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = entry?.source ?? JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(table?.[entry?.source] ?? entry);
  }
  return out;
};

// Map a parsed ATLAS document into { matrix, version }. Legacy v5 docs carry a
// top-level `matrices` ARRAY; v6 docs use tactic/technique maps joined by
// relationships keyed per technique.
export const buildAtlasMatrix = (atlas) => {
  if (Array.isArray(atlas?.matrices)) {
    const byId = new Map(
      (atlas.matrices[0]?.tactics || []).map((t) => [t.id, { id: t.id, name: t.name, description: '', techniques: [] }])
    );
    for (const r of Array.isArray(atlas.relationships) ? atlas.relationships : []) {
      if (r?.relationship_type !== 'achieves' || !r.target_ref) continue;
      if (!byId.has(r.target_ref)) byId.set(r.target_ref, { id: r.target_ref, name: '', description: '', techniques: [] });
      byId.get(r.target_ref).techniques.push({
        id: r.source_ref,
        name: atlas.techniques?.[r.source_ref]?.name,
        description: atlas.techniques?.[r.source_ref]?.description,
        mitigations: [],
        subtechniques: [],
        platforms: [],
      });
    }
    return { matrix: [...byId.values()], version: atlas.version || 'legacy-v5' };
  }

  const tacticsMap = atlas?.tactics;
  if (!tacticsMap || typeof tacticsMap !== 'object') {
    throw new Error('Invalid ATLAS YAML: missing tactics');
  }
  const techniquesMap = atlas?.techniques;
  const relationshipsMap = atlas?.relationships;
  const techniquesByTactic = {};
  const recordById = {};
  const subKeys = new Map();
  const placeTechnique = (tacticId, record) => {
    if (!techniquesByTactic[tacticId]) techniquesByTactic[tacticId] = [];
    const bucket = techniquesByTactic[tacticId];
    if (!bucket.find((t) => t.id === record.id)) bucket.push(record);
  };
  if (techniquesMap && typeof techniquesMap === 'object') {
    for (const [techId, tech] of Object.entries(techniquesMap)) {
      const rel = relationshipsMap?.[techId];
      const record = {
        id: techId,
        name: tech.name,
        description: tech.description,
        mitigations: uniqBySource(rel?.mitigates, atlas.mitigations),
        subtechniques: [],
        platforms: tech.platforms || [],
        maturity: tech.maturity,
      };
      recordById[techId] = record;
      for (const achieve of Array.isArray(rel?.achieves) ? rel.achieves : []) {
        if (achieve?.target) placeTechnique(achieve.target, record);
      }
    }
    // Specialize relationships hang the child technique off the parent's
    // record (relationship entries are keyed by the SUBtechnique id, with
    // `target` naming the parent); duplicates dedupe by source id.
    for (const [techId, rel] of Object.entries(relationshipsMap || {})) {
      for (const sp of Array.isArray(rel?.specializes) ? rel.specializes : []) {
        const parent = recordById[sp?.target ?? techId];
        if (!parent) continue;
        if (!subKeys.has(parent)) subKeys.set(parent, new Set());
        const seen = subKeys.get(parent);
        const key = sp?.source ?? JSON.stringify(sp);
        if (seen.has(key)) continue;
        seen.add(key);
        parent.subtechniques.push(techniquesMap?.[sp?.source] ?? sp);
      }
    }
  }
  const matrix = Object.entries(tacticsMap).map(([tacticId, tactic]) => ({
    id: tacticId,
    name: tactic.name,
    description: tactic.description,
    techniques: techniquesByTactic[tacticId] || [],
  }));
  return { matrix, version: atlas.version || '' };
};
