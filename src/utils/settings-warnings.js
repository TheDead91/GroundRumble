/**
 * Pure derivation of the Settings "Needs attention" warnings. buildJudge is
 * injected by the caller (App-owned, src/utils/judge-config.js); the util
 * never imports the real resolver so it stays node-testable.
 *
 * Returns the warnings array (judge warning first, generator second) — the
 * consumer decides emptiness.
 */
export function buildSettingsWarnings({ providers, judgeConfig, effectiveGenConfig, useDemoMode, buildJudge }) {
  const hasConfiguredProviders = providers.some(cp => cp.enabled !== false && (String(cp.apiKey || '').trim() || cp.connector === 'raw' || cp.endpoint));
  const judgeReady = !!buildJudge(judgeConfig, providers);
  const genReady = !!buildJudge(effectiveGenConfig, providers);
  const warnings = [];
  if (useDemoMode && hasConfiguredProviders && !judgeReady) {
    warnings.push('Sandbox is ON and you have providers configured, but the AI Judge is not set to one of them — once you turn Sandbox off, judge evaluations will fall back to keyword checks. Set the AI Judge to a provider you configured.');
  }
  if (useDemoMode && hasConfiguredProviders && !genReady) {
    warnings.push('Sandbox is ON and you have providers configured, but the Test Generator model is not set to one of them — AI test generation won\'t work once you leave Sandbox. Set the Test Generator (or AI Judge) to a provider you configured.');
  }
  return warnings;
}
