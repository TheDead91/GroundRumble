import React from 'react';
import { useUI } from '../../context/useUI';
import { useProviders } from '../../context/ProvidersContext';
import { useSettings } from '../../context/SettingsContext';
import { AtlasSyncCard } from './settings/AtlasSyncCard';
import { HelpCard } from './settings/HelpCard';
import { ProvidersCard } from './settings/ProvidersCard';
import { ProxyCard } from './settings/ProxyCard';
import { HelperModelsCard } from './settings/HelperModelsCard';
import { StatusBanners } from './settings/StatusBanners';
import { buildSettingsWarnings } from '../../utils/settings-warnings';
import { AccountDataCard } from './settings/AccountDataCard';

/**
 * SettingsView - Settings tab cards. Composes the ATLAS sync, Account & Data
 * (Key Vault + Backup & Restore + Reset Platform), Help & Onboarding,
 * Providers, Helper Models and Proxy cards plus the "Needs attention" +
 * vault-locked banners from their own modules under
 * src/components/views/settings/. Consumes the shared contexts directly and
 * receives the App-owned orchestration (the Key-Vault handler trio, vaultInput,
 * resetAllData, the useBackupFlow bindings, buildJudge + the connectivity-test
 * block, setDemoMode and the judge/gen selector derivations) as bare-identifier
 * props, forwarding the helper-models surface into the card.
 */
export function SettingsView({
  buildJudge,
  testJudge,
  testGenerator,
  testingJudge,
  testingGen,
  setDemoMode,
  selectedGenProvider,
  genModelList,
  helperProviderSelectable,
  selectedJudgeProvider,
  judgeModelList,
  handleProtectVault,
  handleUnprotectVault,
  handleLockVault,
  vaultInput,
  vaultValidationError,
  setVaultInput,
  resetAllData,
  handleExportBackup,
  handleImportBackup,
  backupPassphrase,
  backupValidationError,
  setBackupPassphrase
}) {
  const {
    syncLiveATLAS,
    loadingATLAS,
    atlasSyncStatus,
    proxyEnabled, setProxyEnabled,
    proxyUrl, setProxyUrl,
    proxyMode, setProxyMode,
    proxyCategories, setProxyCategories,
    proxyTest, handleProxyTest,
    collapsedSettings,
    useDemoMode,
    judgeConfig, saveJudgeConfig,
    saveGenConfig,
    effectiveGenConfig
  } = useSettings();
  const {
    vaultLoading,
    vaultLocked,
    vaultPassphraseSet,
    handleUnlockVault,
    providers,
    setProviders,
    persistProviders,
    providerDraft, setProviderDraft,
    providerTest, setProviderTest,
    providerModelErrors,
    providerRefreshing,
    refreshProviderModels,
    handleProviderTest,
    openProviderDraft,
    deleteProvider,
    saveProviderDraft,
    cpFromDraft,
    confirmInsecureTransport,
    protectVault,
    setVaultPassphraseSet,
    setVaultLocked
  } = useProviders();
  const {
    setActiveTab,
    setOnboardingOpen,
    setTourRunning,
    addToast,
    askChoice,
    askConfirm,
    askInput
  } = useUI();

  const warnings = buildSettingsWarnings({
    providers,
    judgeConfig,
    effectiveGenConfig,
    useDemoMode,
    buildJudge
  });

  return (
    <>
            <StatusBanners warnings={warnings} vaultLocked={vaultLocked} />
            <ProvidersCard
              providers={providers}
              setProviders={setProviders}
              persistProviders={persistProviders}
              providerDraft={providerDraft}
              setProviderDraft={setProviderDraft}
              providerTest={providerTest}
              setProviderTest={setProviderTest}
              providerModelErrors={providerModelErrors}
              providerRefreshing={providerRefreshing}
              refreshProviderModels={refreshProviderModels}
              handleProviderTest={handleProviderTest}
              openProviderDraft={openProviderDraft}
              deleteProvider={deleteProvider}
              saveProviderDraft={saveProviderDraft}
              cpFromDraft={cpFromDraft}
              confirmInsecureTransport={confirmInsecureTransport}
              protectVault={protectVault}
              setVaultPassphraseSet={setVaultPassphraseSet}
              setVaultLocked={setVaultLocked}
              vaultLocked={vaultLocked}
              vaultPassphraseSet={vaultPassphraseSet}
              addToast={addToast}
              askChoice={askChoice}
              askConfirm={askConfirm}
              askInput={askInput}
              useDemoMode={useDemoMode}
              setDemoMode={setDemoMode}
              collapsedSettings={collapsedSettings}
            />
            <HelperModelsCard
              judgeConfig={judgeConfig}
              saveJudgeConfig={saveJudgeConfig}
              providers={providers}
              helperProviderSelectable={helperProviderSelectable}
              selectedJudgeProvider={selectedJudgeProvider}
              judgeModelList={judgeModelList}
              effectiveGenConfig={effectiveGenConfig}
              selectedGenProvider={selectedGenProvider}
              genModelList={genModelList}
              saveGenConfig={saveGenConfig}
              testJudge={testJudge}
              testGenerator={testGenerator}
              testingJudge={testingJudge}
              testingGen={testingGen}
              vaultLocked={vaultLocked}
              collapsedSettings={collapsedSettings}
            />
            <AtlasSyncCard
              syncLiveATLAS={syncLiveATLAS}
              loadingATLAS={loadingATLAS}
              atlasSyncStatus={atlasSyncStatus}
              collapsedSettings={collapsedSettings}
            />
            <ProxyCard
              proxyEnabled={proxyEnabled}
              setProxyEnabled={setProxyEnabled}
              proxyUrl={proxyUrl}
              setProxyUrl={setProxyUrl}
              proxyMode={proxyMode}
              setProxyMode={setProxyMode}
              proxyCategories={proxyCategories}
              setProxyCategories={setProxyCategories}
              proxyTest={proxyTest}
              onTestProxy={handleProxyTest}
              collapsedSettings={collapsedSettings}
            />
            <AccountDataCard
              vaultLoading={vaultLoading}
              vaultLocked={vaultLocked}
              vaultPassphraseSet={vaultPassphraseSet}
              vaultInput={vaultInput}
              vaultValidationError={vaultValidationError}
              setVaultInput={setVaultInput}
              handleUnlockVault={handleUnlockVault}
              handleLockVault={handleLockVault}
              handleUnprotectVault={handleUnprotectVault}
              handleProtectVault={handleProtectVault}
              backupPassphrase={backupPassphrase}
              backupValidationError={backupValidationError}
              setBackupPassphrase={setBackupPassphrase}
              handleExportBackup={handleExportBackup}
              handleImportBackup={handleImportBackup}
              resetAllData={resetAllData}
              collapsedSettings={collapsedSettings}
            />
            <HelpCard
              collapsedSettings={collapsedSettings}
              onReplayOnboarding={() => {
                localStorage.removeItem('atlas_onboarding_done');
                setOnboardingOpen(true);
              }}
              onStartTour={() => { setActiveTab('dashboard'); setTourRunning(true); }}
            />
    </>
  );
}

export default SettingsView;
