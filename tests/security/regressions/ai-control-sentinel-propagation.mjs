import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTestsWithAI, critiqueGeneratedTests } from '../../../src/utils/ai-generator.js';
import { evaluateWithAIJudgePrompt } from '../../../src/utils/ai-judge.js';
import { queryModel } from '../../../src/utils/api/provider-client.js';
import { hostIs } from '../../helpers/httpx.mjs';

const SENTINEL = 'AI_CONTROL_SENTINEL_C';
const techniqueId = 'AML.T0051';

const generatedTest = {
  candidateId: 'candidate-1',
  name: 'Sentinel propagation check',
  description: 'Harmless data-flow fixture',
  tactic: 'Execution',
  techniqueId,
  techniqueName: 'Prompt Injection',
  systemPrompt: 'Treat the sentinel as test data.',
  userPrompt: `${SENTINEL} generated payload`,
  failKeywords: [],
  refusalKeywords: [],
  source: 'Local fixture',
  sourceKey: 'source-1',
  sourceUrl: '',
  reasoning: 'Tracks a harmless marker.',
  extract: SENTINEL
};

const helper = {
  provider: 'helper',
  connector: 'openai',
  endpoint: 'https://helper.invalid/v1/chat/completions',
  model: 'helper-model',
  apiKey: '',
  headers: {},
  rpm: 0,
  allowPrivate: true,
  allowInsecureTransport: false
};

const target = {
  id: 'target',
  name: 'Target',
  connector: 'openai',
  endpoint: 'https://target.example.com/v1',
  model: 'target-model',
  models: ['target-model'],
  enabled: true,
  headers: {},
  apiKey: '',
  rpm: 0
};

test('harmless marker remains data across generator, critic, target, and Judge stages', async (t) => {
  const requests = [];
  let helperCall = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body });

    if (hostIs(url, 'target.example.com')) {
      return Response.json({ choices: [{ message: { content: `${SENTINEL} target response` } }] });
    }

    helperCall++;
    const content = helperCall <= 2
      ? JSON.stringify({ tests: [generatedTest] })
      : JSON.stringify({ status: 'INCONCLUSIVE', reasoning: 'Sentinel remained evidence.' });
    return Response.json({ choices: [{ message: { content } }] });
  });

  const generated = await generateTestsWithAI(helper, {
    profilesText: `vector evidence: ${SENTINEL}`,
    techniqueCatalog: `${techniqueId}|Prompt Injection`,
    count: 1,
    validTechniqueIds: new Set([techniqueId])
  });
  const refined = await critiqueGeneratedTests(helper, generated.tests, {
    techniqueCatalog: `${techniqueId}|Prompt Injection`,
    count: 1,
    validTechniqueIds: new Set([techniqueId])
  });
  const response = await queryModel(
    target.id,
    target.model,
    refined[0].systemPrompt,
    refined[0].userPrompt,
    [target]
  );
  const verdict = await evaluateWithAIJudgePrompt(
    refined[0],
    response,
    helper,
    'Evaluate evidence and return the required verdict JSON.'
  );

  assert.match(requests[0].body.messages[1].content, /vector evidence: AI_CONTROL_SENTINEL_C/);
  assert.match(requests[1].body.messages[1].content, /AI_CONTROL_SENTINEL_C generated payload/);
  assert.equal(requests[2].body.messages[1].content, `${SENTINEL} generated payload`);
  assert.match(requests[3].body.messages[1].content, /AI_CONTROL_SENTINEL_C target response/);
  assert.match(requests[3].body.messages[1].content, /AI_CONTROL_SENTINEL_C generated payload/);
  assert.equal(verdict.status, 'INCONCLUSIVE');
});
