import { evaluateJudgeCanaries } from './api/index.js';
import { redactSensitiveText } from './redact.js';

// Run the adversarial canaries for a candidate judge prompt, normalizing a
// hard evaluation failure into a visible "diverged" marker.
// `userPromptTemplate` optionally injects a candidate judge_user rewrite so it
// is validated in the position it will actually occupy.
export const runJudgeCanaries = async (judge, systemPrompt, userPromptTemplate = null) => {
  try {
    return await evaluateJudgeCanaries(judge, systemPrompt, undefined, userPromptTemplate);
  } catch (err) {
    return [{ name: 'Canary evaluation', expected: '-', status: 'INCONCLUSIVE', reasoning: redactSensitiveText(err?.message || err), diverged: true }];
  }
};
