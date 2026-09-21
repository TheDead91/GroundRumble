// useModelPingTests — the model connectivity tests.
// The hook owns the two handlers (testJudge / testGenerator) and the
// testingJudge/testingGen busy states, including the read-only vault gates with
// their toast copy, the shared-config pingModel calls, the redacted error
// toasts, and the busy-state set/reset ordering.
import { useState } from 'react';
import { pingModel } from '../utils/judge-config';
import { projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';

export function useModelPingTests({ judgeConfig, effectiveGenConfig, providers, vaultLocked, addToast }) {
  const [testingJudge, setTestingJudge] = useState(false);
  const [testingGen, setTestingGen] = useState(false);

  const testJudge = async () => {
    if (vaultLocked) {
      addToast('The AI Judge is disabled in read-only mode. Unlock your API keys to use it.');
      return;
    }
    setTestingJudge(true);
    try {
      const reply = await pingModel(judgeConfig, 'AI Judge', providers);
      addToast(reply ? `AI Judge OK — replied "${reply.slice(0, 80)}"` : 'AI Judge OK — model responded.');
    } catch (err) {
      addToast(`Judge test failed: ${projectDiagnosticTextStrict(err)}`, 'error');
    } finally {
      setTestingJudge(false);
    }
  };

  const testGenerator = async () => {
    if (vaultLocked) {
      addToast('The Test Generator is disabled in read-only mode. Unlock your API keys to use it.');
      return;
    }
    setTestingGen(true);
    try {
      const reply = await pingModel(effectiveGenConfig, 'Test Generator', providers);
      addToast(reply ? `Test Generator OK — replied "${reply.slice(0, 80)}"` : 'Test Generator OK — model responded.');
    } catch (err) {
      addToast(`Generator test failed: ${projectDiagnosticTextStrict(err)}`, 'error');
    } finally {
      setTestingGen(false);
    }
  };

  return { testJudge, testGenerator, testingJudge, testingGen };
}
