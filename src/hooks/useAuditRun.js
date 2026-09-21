import { useCallback } from 'react';
import { projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';
import { buildAuditRecord, redactAuditResult, summarizeAuditRecord } from '../utils/audit-record';
import { queryModel, evaluateWithAIJudge, evaluateWithKeywords, resetRateLimiter } from '../utils/api';
import { DEMO_SIMULATION_RESPONSES } from '../data/demo-seeds';

/**
 * useAuditRun - Hook containing all audit execution logic
 */
export function useAuditRun({
  // State refs/setters
  runningRef,
  setRunning,
  setStopping,
  setProgress,
  addConsoleLog: _addConsoleLog,
  clearConsoleLogs,
  setResults,
  setCurrentTestName,
  auditAbortRef,
  auditRunTokenRef,
  
  // Dependencies from other contexts
  vaultLocked: _vaultLocked,
  vaultPassphraseSet: _vaultPassphraseSet,
  buildJudge,
  judgeConfig,
  providers,
  targets,
  selectedTests,
  evalMode,
  getPrompt: _getPrompt,
  getPromptOverrides: _getPromptOverrides,
  allTestsById,
  replaceAuditHistory,
  appendAuditHistory,
  deleteAudit: deleteAuditFromHistory,
  setResultOverride: setResultOverrideInHistory,
  effectiveStatus,
  effectiveDetails,
  addToast,
  askConfirm,
  askInput: _askInput,
  
  // Utility functions
  runWithTimeout,
  AUDIT_CALL_TIMEOUT_MS,

  // Engine-only params: sandbox branch, matrix-cell reset,
  // and the App-owned console streaming helper
  useDemoMode,
  setExpandedCell,
  log,
}) {
  // Build judge object from config
  const buildJudgeObj = useCallback(() => {
    const cfg = judgeConfig;
    if (!cfg.provider) return null;
    const cp = providers.find(p => p.id === cfg.provider && p.enabled !== false);
    if (!cp) return null;
    let headers = {};
    if (cp.headers) {
      try { headers = JSON.parse(cp.headers); } catch { /* ignore malformed headers */ }
    }
    return {
      provider: cp.id,
      model: cfg.model || cp.models?.[0] || '',
      endpoint: cp.connector === 'raw' ? cp.endpoint : cp.endpoint,
      apiKey: cp.apiKey || '',
      rpm: cp.rpm || 0,
      connector: cp.connector || 'openai',
      method: cp.method || 'POST',
      headers,
      bodyTemplate: cp.bodyTemplate,
      responsePath: cp.responsePath || 'choices.0.message.content',
      allowPrivate: cp.allowPrivate === true,
      allowInsecureTransport: cp.allowInsecureTransport === true,
    };
  }, [judgeConfig, providers]);

  // Evaluate with AI Judge
  const evaluateWithAIJudgeFn = useCallback(async (test, response, judge, systemPrompt, userPrompt) => {
    const evaluation = await evaluateWithAIJudge(test, response, judge, systemPrompt, userPrompt);
    return evaluation;
  }, []);

  // Run a single test against a target
  const runSingleTest = useCallback(async (test, target, signal) => {
    const cp = providers.find(p => p.id === target.provider);
    if (!cp) throw new Error(`Provider not found: ${target.provider}`);
    
    let headers = {};
    if (cp.headers) {
      try { headers = JSON.parse(cp.headers); } catch { /* ignore */ }
    }
    
    const judge = {
      provider: cp.id,
      model: target.model,
      endpoint: cp.connector === 'raw' ? cp.endpoint : cp.endpoint,
      apiKey: cp.apiKey || '',
      rpm: cp.rpm || 0,
      connector: cp.connector || 'openai',
      method: cp.method || 'POST',
      headers,
      bodyTemplate: cp.bodyTemplate,
      responsePath: cp.responsePath || 'choices.0.message.content',
      allowPrivate: cp.allowPrivate === true,
      allowInsecureTransport: cp.allowInsecureTransport === true,
    };
    
    const systemPrompt = test.systemPrompt || '';
    const userPrompt = test.userPrompt || '';
    
    const response = await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, (s) => 
      queryModel(
        judge.provider,
        judge.model || '',
        systemPrompt,
        userPrompt,
        providers,
        s
      )
    );
    
    return response;
  }, [providers, runWithTimeout, AUDIT_CALL_TIMEOUT_MS]);

  // Main audit run function
  const runAudit = async (targetsOverride) => {
    if (runningRef.current || auditAbortRef.current) {
      addToast('An audit is already running. Stop it before starting another audit.');
      return;
    }
    if (selectedTests.length === 0) {
      addToast('Select at least one test case to run.');
      return;
    }
    const lineup = targetsOverride && targetsOverride.length ? targetsOverride : targets;
    if (lineup.length === 0) {
      addToast('Add at least one target model to the comparison lineup.');
      return;
    }

    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    clearConsoleLogs();
    setResults([]);
    setExpandedCell(null);

    const controller = new AbortController();
    auditAbortRef.current = controller;
    const runToken = ++auditRunTokenRef.current;
    const signal = controller.signal;
    const auditId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    let historyPersisted = false;
    resetRateLimiter();

    log(`Starting ATLAS Comparison Audit against ${lineup.length} model(s):`);
    lineup.forEach(t => log(`  - [${t.provider}] ${t.model}`));
    if (useDemoMode) {
      log('DEMO SIMULATION ACTIVE — behavior is driven by the simulated model you picked (Demo Secure / Demo Vulnerable).');
    } else {
      log(`Real API Integration active. Evaluating via: ${evalMode.toUpperCase()}`);
    }

    const testsToRun = selectedTests.map(id => allTestsById[id]).filter(Boolean);
    const runResults = [];
    const totalSteps = testsToRun.length * lineup.length;
    let step = 0;

    try {
      for (const target of lineup) {
        if (signal.aborted) break;
        log(`→ Auditing target: [${target.provider}] ${target.model}`);

        for (let i = 0; i < testsToRun.length; i++) {
          const test = testsToRun[i];
          setCurrentTestName(`${test.name} → ${target.model}`);
          log(`Running: "${test.name}" (ATLAS Technique: ${test.techniqueId})`);

          try {
            let response = '';
            let evalResult = { status: 'SECURE', reasoning: '' };

            if (useDemoMode) {
              await new Promise((resolve, reject) => {
                const t = setTimeout(resolve, 1200);
                signal.addEventListener('abort', () => {
                  clearTimeout(t);
                  reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
              });
              const demoSet = DEMO_SIMULATION_RESPONSES[test.id];
              // Sandbox simulation: the model itself drives the behavior — the
              // "Demo Secure" model resists attacks, the "Demo Vulnerable" model
              // complies, so the comparison shows them disagreeing on every test.
              const demoVulnerable = target.model === 'Demo Vulnerable';
              const demoType = demoVulnerable ? 'llama_vulnerable' : 'llama_secure';

              if (demoSet) {
                response = demoSet[demoType].response;
                evalResult = {
                  status: demoSet[demoType].status,
                  reasoning: `(Simulated) ${demoSet[demoType].reasoning}`
                };
              } else if (demoVulnerable) {
                // Fallback for custom tests in demo mode: the vulnerable model
                // complies with the attack.
                response = "Sure — here is what you asked for.";
                evalResult = { status: 'VULNERABLE', reasoning: 'Simulated vulnerable model complied with the request.' };
              } else {
                // Fallback for custom tests in demo mode: the secure model refuses.
                response = "I cannot fulfill this request as it violates my policy.";
                evalResult = { status: 'SECURE', reasoning: 'Simulated default refusal.' };
              }
              log(`Received response from model.`);
            } else {
              log(`Sending payload to API...`);
              response = await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, (sig) => queryModel(
                target.provider,
                target.model,
                test.systemPrompt,
                test.userPrompt,
                providers,
                sig
              ));

              log(`Response received. Evaluating security status...`);
              if (!response || !String(response).trim()) {
                log('Empty model response detected - marking as EMPTY, not VULNERABLE.');
                evalResult = { status: 'EMPTY', reasoning: 'Model returned an empty response. No content to evaluate - not treated as a vulnerability.' };
              } else if (evalMode === 'judge') {
                const judge = buildJudge(judgeConfig, providers);
                if (!judge) {
                  log('AI Judge selected but its provider has no configured credentials. Falling back to keywords.');
                  evalResult = evaluateWithKeywords(test, response, 'AI Judge not configured - Keyword Fallback');
                } else {
                  log(`Calling ${judge.provider.toUpperCase()} AI Judge (${judge.model})...`);
                  evalResult = await runWithTimeout(signal, AUDIT_CALL_TIMEOUT_MS, (sig) => evaluateWithAIJudge(test, response, judge, sig));
                }
              } else {
                log(`Running static keyword checkers...`);
                evalResult = evaluateWithKeywords(test, response);
              }
            }

            const resultObj = {
              auditId,
              targetUid: target.uid,
              testId: test.id,
              testName: test.name,
              tactic: test.tactic,
              techniqueId: test.techniqueId,
              techniqueName: test.techniqueName,
              systemPrompt: test.systemPrompt,
              userPrompt: test.userPrompt,
              response,
              status: evalResult.status,
              reasoning: evalResult.reasoning,
              model: target.model,
              provider: target.provider,
              timestamp: new Date().toISOString()
            };

            runResults.push(resultObj);
            setResults(prev => [...prev, resultObj]);
            log(`✓ Completed: "${test.name}" @ ${target.model}. Verdict: ${evalResult.status}`);

          } catch (err) {
            if (err && err.name === 'AbortError') throw err;
            // Providers sometimes echo keys/tokens in error text — project
            // (redact + bound) before the message can reach the result cells,
            // the console, or screenshots. The strict projection also masks
            // short, unrecognized-prefix tokens a custom relay/gateway echoes,
            // so an unknown 16–39 token cannot survive in the persisted ERROR
            // reasoning.
            const errMsg = projectDiagnosticTextStrict(err);
            log(`✗ Error running "${test.name}" @ ${target.model}: ${errMsg}`);
            const errorResult = {
              auditId,
              targetUid: target.uid,
              testId: test.id,
              testName: test.name,
              tactic: test.tactic,
              techniqueId: test.techniqueId,
              techniqueName: test.techniqueName,
              systemPrompt: test.systemPrompt,
              userPrompt: test.userPrompt,
              response: `ERROR: ${errMsg}`,
              status: 'ERROR',
              reasoning: `Technical failure (not a security verdict): ${errMsg}`,
              model: target.model,
              provider: target.provider,
              timestamp: new Date().toISOString()
            };
            runResults.push(errorResult);
            setResults(prev => [...prev, errorResult]);
          }

          step++;
          setProgress(Math.round((step / totalSteps) * 100));
          if (signal.aborted) break;
        }
        if (signal.aborted) break;
      }

      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      log(`Audit completed! ${testsToRun.length} tests × ${lineup.length} models.`);

      // Save to history
      const finalAuditRecord = buildAuditRecord({
        id: auditId,
        timestamp: new Date().toISOString(),
        lineup,
        isDemo: useDemoMode,
        results: runResults,
        expectedCount: totalSteps,
        completed: true
      });

      historyPersisted = await appendAuditHistory(finalAuditRecord);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        log(`Audit cancelled by user after ${runResults.length} completed evaluation(s).`);
        if (!historyPersisted) {
          const partialAuditRecord = buildAuditRecord({
            id: auditId,
            timestamp: new Date().toISOString(),
            lineup,
            isDemo: useDemoMode,
            results: runResults,
            expectedCount: totalSteps,
            completed: false
          });
          await appendAuditHistory(partialAuditRecord);
        }
      } else {
        log(`Audit aborted: ${err.message}`);
      }
    } finally {
      if (auditRunTokenRef.current === runToken && auditAbortRef.current === controller) {
        auditAbortRef.current = null;
        setRunning(false);
        setStopping(false);
        setCurrentTestName('');
        runningRef.current = false;
      }
    }
  };

  // Stop audit
  const stopAudit = () => {
    const controller = auditAbortRef.current;
    if (controller) {
      setStopping(true);
      controller.abort();
      log('Cancelling audit... aborting in-flight requests.');
    }
  };

  // Set result override
  const setResultOverrideFn = useCallback(async (result, status) => {
    if (status !== null && ['ERROR', 'EMPTY', 'INCONCLUSIVE'].includes(result.status)) {
      addToast('Technical and inconclusive results cannot be converted into scored verdicts.');
      return;
    }
    await setResultOverrideInHistory(result, status);
  }, [setResultOverrideInHistory, addToast]);

  // Delete audit
  const deleteAuditFn = useCallback(async (id) => {
    if (!(await askConfirm('Delete this audit from history? It will no longer count toward the overall score.'))) return;
    await deleteAuditFromHistory(id);
  }, [deleteAuditFromHistory, askConfirm]);

  return {
    runAudit,
    stopAudit,
    runSingleTest,
    evaluateWithAIJudge: evaluateWithAIJudgeFn,
    buildJudge: buildJudgeObj,
    redactAuditResult,
    summarizeAuditRecord,
    appendAuditHistory,
    replaceAuditHistory,
    deleteAudit: deleteAuditFn,
    setResultOverride: setResultOverrideFn,
    effectiveStatus,
    effectiveDetails,
  };
}
