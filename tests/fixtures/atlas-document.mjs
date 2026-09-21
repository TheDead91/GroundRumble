// Small valid ATLAS v6 document for browser workflows; never contacts GitHub.
export const ATLAS_MINIMAL_YAML = [
  'format-version: 2026.01',
  'tactics:',
  '  AML.TA0001: { name: "Execution", description: "d" }',
  '  AML.TA0002: { name: "Persistence", description: "d" }',
  'techniques:',
  '  AML.T0034: { name: "LLM Prompt Injection", description: "d" }',
  '  AML.T0017: { name: "Exfiltrate ML Model Info / System Prompt", description: "d" }',
  '  AML.T0054: { name: "Excess Agency / Tool Hijacking", description: "d" }',
  '  AML.T0001: { name: "Recon", description: "d" }',
  'relationships: {}',
  'mitigations: {}',
].join('\n');
