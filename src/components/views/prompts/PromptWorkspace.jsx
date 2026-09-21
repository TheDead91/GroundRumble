import React, { useState } from 'react';
import PromptsView from '../PromptsView';
import PromptUpdateDialog from '../../modals/PromptUpdateDialog';
import { usePromptUpdate } from '../../../hooks/usePromptUpdate';
import { useProviders } from '../../../context/ProvidersContext';
import { setPrompt } from '../../../utils/prompts';

export default function PromptWorkspace({
  active,
  buildJudge,
  judgeConfig,
  getPrompt,
  getPromptOverrides,
  confirmJudgeRewriteApply,
  addToast,
  vaultLocked,
  vaultPassphraseSet,
}) {
  const [promptDraft, setPromptDraft] = useState({});
  const { providers } = useProviders();
  const judgeConfigured = !!buildJudge(judgeConfig, providers)?.model;
  const {
    promptUpdate,
    setPromptUpdate,
    closePromptUpdate,
    applyPromptUpdate,
    rerunPromptUpdateCanaries,
    runPromptUpdate,
    refinePromptUpdate,
  } = usePromptUpdate({ buildJudge, judgeConfig, getPrompt, setPrompt, setPromptDraft, confirmJudgeRewriteApply, addToast });

  return (
    <>
      {active && (
        <PromptsView
          promptDraft={promptDraft}
          setPromptDraft={setPromptDraft}
          setPromptUpdate={setPromptUpdate}
          getPromptOverrides={getPromptOverrides}
          vaultLocked={vaultLocked}
          vaultPassphraseSet={vaultPassphraseSet}
          addToast={addToast}
          judgeConfigured={judgeConfigured}
        />
      )}

      {promptUpdate && (
        <PromptUpdateDialog promptUpdate={promptUpdate} setPromptUpdate={setPromptUpdate} closePromptUpdate={closePromptUpdate} applyPromptUpdate={applyPromptUpdate} rerunPromptUpdateCanaries={rerunPromptUpdateCanaries} runPromptUpdate={runPromptUpdate} refinePromptUpdate={refinePromptUpdate} promptDraft={promptDraft} getPromptOverrides={getPromptOverrides} vaultLocked={vaultLocked} vaultPassphraseSet={vaultPassphraseSet} />
      )}
    </>
  );
}
