import { isInsecureHttpEndpoint } from './endpoint-policy.js';

export function buildBackupImportPreview(backup, overridesDropped = 0, candidate = null) {
  const d = backup.data || {};
  const arr = (k) => { try { return JSON.parse(d[k] || '[]'); } catch { return []; } };
  const lines = [];
  if (backup.exportedAt) lines.push(`• Exported ${new Date(backup.exportedAt).toLocaleString()}`);
  const providers = arr('atlas_providers');
  const tests = arr('atlas_custom_tests');
  const presets = arr('atlas_test_presets');
  const history = arr('atlas_audit_history');
  lines.push(`• ${providers.length} provider(s)`);
  // Surface cleartext-HTTP providers in the confirmation so a shared/team
  // backup cannot smuggle in an insecure endpoint silently.
  const insecureHttpProviders = providers
    .filter(p => p && typeof p === 'object')
    .filter(p => isInsecureHttpEndpoint(p.endpoint) || isInsecureHttpEndpoint(p.modelsEndpoint))
    .map(p => { try { return new URL(String(p.endpoint || '')).hostname; } catch { return String(p.endpoint || ''); } })
    .filter(Boolean);
  if (insecureHttpProviders.length > 0) {
    lines.push(`• ${insecureHttpProviders.length} provider(s) use plaintext HTTP: ${insecureHttpProviders.slice(0, 5).join(', ')}${insecureHttpProviders.length > 5 ? ' …' : ''}`);
  }
  lines.push(`• ${tests.length} custom test(s) · ${presets.length} preset(s) · ${history.length} audit record(s)`);

  const n = backup.normalization || {};

  // Surface verdict-override changes (count + direction) and the judge/demo
  // settings that alter the meaning of every future verdict, so a crafted backup
  // cannot silently rewrite recorded verdicts.
  if (n.overrideCount > 0) {
    const f = n.overrideFlips || {};
    const dirs = [];
    if (f.SECURE) dirs.push(`${f.SECURE} → SECURE`);
    if (f.VULNERABLE) dirs.push(`${f.VULNERABLE} → VULNERABLE`);
    if (f.INCONCLUSIVE) dirs.push(`${f.INCONCLUSIVE} → INCONCLUSIVE`);
    const droppedNote = overridesDropped > 0 ? ` · ${overridesDropped} targeting technical/orphan results dropped` : '';
    lines.push(`• ${n.overrideCount} verdict override(s)${dirs.length ? `: ${dirs.join(', ')}` : ''}${droppedNote}`);
  }
  if (n.judgeConfig && (n.judgeConfig.provider || n.judgeConfig.model)) {
    lines.push(`• AI Judge: ${n.judgeConfig.provider || '(unset)'} / ${n.judgeConfig.model || '(unset)'}`);
  }
  if (n.demoMode != null) lines.push(`• Demo mode: ${n.demoMode === 'true' ? 'on' : 'off'}`);

  if (Array.isArray(n.testNames) && n.testNames.length > 0) {
    lines.push(`• Imported tests: ${n.testNames.join(', ')}${n.testNames.length >= 50 ? ' …' : ''}`);
  }
  if (n.droppedTests > 0) lines.push(`• ${n.droppedTests} malformed/oversized test(s) dropped.`);
  if (n.droppedPresets > 0) lines.push(`• ${n.droppedPresets} malformed/oversized preset(s) dropped.`);
  if (n.sourceUrlCount > 0) lines.push(`• ${n.sourceUrlCount} AI source URL(s) — listed below.`);
  if (n.droppedSources > 0) lines.push(`• ${n.droppedSources} malformed/oversized source URL(s) dropped.`);

  // Security-sensitive prompt/test details are carried in the candidate diff
  if (candidate) {
    if (candidate.promptDiff && candidate.promptDiff.changed.length > 0) {
      lines.push(`• ${candidate.promptDiff.changed.length} AI prompt change(s) — expand below to review exact changes`);
    }
    if (candidate.testCriteriaDiff && candidate.testCriteriaDiff.tests.length > 0) {
      lines.push(`• ${candidate.testCriteriaDiff.tests.length} test(s) with verdict criteria — expand below to review`);
    }
  }

  const promptOverrides = Array.isArray(n.promptOverrides) ? n.promptOverrides : [];
  const sourceUrls = Array.isArray(n.sourceUrls) ? n.sourceUrls : [];
  return { summary: lines.join('\n'), sourceUrls, promptOverrides, candidate };
}
