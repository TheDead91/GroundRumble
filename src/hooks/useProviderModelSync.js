import { useEffect } from 'react';
import { SANDBOX_PROVIDER_ID, SANDBOX_MODELS } from '../data/app-config';

// useProviderModelSync — provider/model sync + selection guards.
// The two selection states (selectedProvider / selectedModel) stay App-owned
// and are handed in through the deps object; the hook owns the three autoload
// effects, the model-list/selection helpers and the four fallback/validity
// effects, and returns the derived surface for the runner/settings views.
export function useProviderModelSync({
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  useDemoMode, judgeConfig, effectiveGenConfig,
  saveJudgeConfig, saveGenConfig,
  providers, autoLoadProviderModels, providerModelsFor,
  vaultLocked, vaultLoading, activeTab
}) {
  // Preload model lists live from every provider on startup (and again once the
  // vault is unlocked / hydrated) so model selection is smooth without waiting
  // for a fetch. Every provider is a user-defined provider.
  useEffect(() => {
    if (!vaultLocked && !vaultLoading) {
      autoLoadProviderModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultLocked, vaultLoading]);

  // Auto-load model lists when accessing the Auditor (runner) tab.
  useEffect(() => {
    if (activeTab !== 'runner') return;
    autoLoadProviderModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Refresh the selected provider's cached model list when it changes.
  useEffect(() => {
    if (providers.some(p => p.id === selectedProvider)) {
      autoLoadProviderModels(selectedProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  // Sync available models based on provider. Sandbox offers simulated models;
  // every other provider is a user-defined provider with its own cached
  // model list.
  const getActiveModelList = () => {
    if (selectedProvider === SANDBOX_PROVIDER_ID) return SANDBOX_MODELS;
    const cp = providers.find(p => p.id === selectedProvider);
    return cp ? providerModelsFor(cp) : [];
  };

  const activeModels = getActiveModelList();
  const selectedProviderObj = providers.find(p => p.id === selectedProvider);
  const selectedJudgeProvider = providers.find(p => p.id === judgeConfig.provider);

  // Judge model options come from the configured provider's model list.
  // The sandbox pseudo-provider is only for comparison targets — it never acts
  // as a judge, so it is intentionally absent here.
  const judgeModelList = (() => {
    const p = judgeConfig.provider;
    const cp = providers.find(c => c.id === p);
    return cp ? cp.models : [];
  })();

  // Test Generator model helpers (mirror of the judge, for the generator).
  const selectedGenProvider = providers.find(cp => cp.id === effectiveGenConfig.provider);
  const genModelList = (() => {
    const p = effectiveGenConfig.provider;
    const cp = providers.find(c => c.id === p);
    return cp ? cp.models : [];
  })();

  // A provider is selectable once it exists and is enabled. The sandbox
  // pseudo-provider is only available while demo mode is on and only for
  // comparison targets — never for the AI Judge or Test Generator.
  const providerSelectable = (p) => {
    if (p === SANDBOX_PROVIDER_ID) return useDemoMode;
    return providers.some(cp => cp.id === p && cp.enabled !== false);
  };

  // Judge/generator providers must be real configured providers — the sandbox
  // pseudo-provider cannot drive the AI Judge or Test Generator.
  const helperProviderSelectable = (p) => p !== SANDBOX_PROVIDER_ID && providerSelectable(p);

  // If the selected provider (or judge provider) becomes unavailable (disabled or
  // removed), fall back to the first still-available option.
  useEffect(() => {
    if (providerSelectable(selectedProvider)) return;
    const options = useDemoMode ? [SANDBOX_PROVIDER_ID] : [];
    providers.filter(cp => cp.enabled !== false).forEach(cp => options.push(cp.id));
    if (options.length > 0) setSelectedProvider(options[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDemoMode, providers]);

  useEffect(() => {
    if (vaultLoading) return;
    // A locked vault hides the real provider list, so never touch the stored
    // judge config until the vault is unlocked — otherwise a refresh would
    // wipe the user's AI Judge selection.
    if (vaultLocked) return;
    if (helperProviderSelectable(judgeConfig.provider)) return;
    const options = providers.filter(cp => cp.enabled !== false).map(cp => cp.id);
    if (options.length === 0) return; // nothing to fall back to — keep the stored config
    saveJudgeConfig({ provider: options[0], model: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDemoMode, providers, vaultLoading, vaultLocked]);

  // Same for the Test Generator config (including when it inherits the judge
  // config): the sandbox pseudo-provider can never drive the generator.
  useEffect(() => {
    if (vaultLoading) return;
    if (vaultLocked) return;
    if (helperProviderSelectable(effectiveGenConfig.provider)) return;
    const options = providers.filter(cp => cp.enabled !== false).map(cp => cp.id);
    if (options.length === 0) return;
    saveGenConfig({ provider: options[0], model: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDemoMode, providers, judgeConfig, vaultLoading, vaultLocked]);

  useEffect(() => {
    if (activeModels.length > 0) {
      // Retain selection if valid, else pick first
      if (!activeModels.find(m => m.id === selectedModel)) {
        setSelectedModel(activeModels[0].id);
      }
    } else {
      setSelectedModel('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, providers, useDemoMode]);

  return {
    activeModels, selectedProviderObj, selectedJudgeProvider, judgeModelList,
    selectedGenProvider, genModelList, providerSelectable, helperProviderSelectable
  };
}
