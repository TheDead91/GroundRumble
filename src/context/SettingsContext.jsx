import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { readStoredJSON, readStoredObject } from '../utils/storage';
import { ATLAS_TACTICS, generateTestsForMatrix } from '../data/payloads';
import { fetchATLASFramework, findSecretQueryParam, testProxyConnection } from '../utils/api';
import { setProxyConfig } from '../utils/api/proxy.js';
import { redactSensitiveText } from '../utils/redact';
import { projectDiagnosticTextStrict } from '../utils/project-diagnostic.js';
import { useUI } from './useUI';
import { useProviders } from './ProvidersContext';
import { useTests } from './TestsContext';

const SettingsContext = createContext(null);

/**
 * SettingsProvider - Manages all settings panels state
 */
export function SettingsProvider({ children }) {
  const { addToast } = useUI();
  const { providerDraft } = useProviders();
  const { setCatalogMatrix, coveredTechniqueIds, setSelectedTests } = useTests();

  const [useDemoMode, setUseDemoMode] = useState(() => {
    const data = localStorage.getItem('atlas_demo_mode');
    return data === null ? true : data === 'true';
  });

  const [proxyEnabled, setProxyEnabled] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('atlas_proxy') || '{}');
      return typeof cfg.enabled === 'boolean' ? cfg.enabled : true;
    } catch { return true; }
  });
  const [proxyUrl, setProxyUrl] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('atlas_proxy') || '{}');
      return cfg.url || '';
    } catch { return ''; }
  });
  const [proxyMode, setProxyMode] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('atlas_proxy') || '{}');
      return cfg.mode === 'always' ? 'always' : 'fallback';
    } catch { return 'fallback'; }
  });
  const [proxyCategories, setProxyCategories] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('atlas_proxy') || '{}');
      if (cfg.categories) {
        return {
          privateNet: !!cfg.categories.privateNet,
          providers: !!cfg.categories.providers,
          articles: !!cfg.categories.articles
        };
      }
      return { privateNet: false, providers: false, articles: true };
    } catch { return { privateNet: false, providers: false, articles: true }; }
  });
  const [proxyTest, setProxyTest] = useState(null);

  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [collapsedSettings, setCollapsedSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('atlas_settings_collapsed') || '{}'); } catch { return {}; }
  });

  const [atlasMatrix, setAtlasMatrix] = useState(() => {
    const cached = localStorage.getItem('atlas_cached_matrix');
    if (cached) { try { return JSON.parse(cached); } catch { /* fall through */ } }
    return ATLAS_TACTICS;
  });
  const [loadingATLAS, setLoadingATLAS] = useState(false);
  const [atlasSyncStatus, setAtlasSyncStatus] = useState(() => {
    const meta = readStoredJSON('atlas_matrix_meta', null);
    if (meta && meta.version) {
      return `Last synced ${new Date(meta.updatedAt).toLocaleString()} · version ${meta.version}`;
    }
    return 'Loading preloaded ATLAS matrix — sync in Settings for the latest';
  });

  // AI Judge configuration (which model evaluates responses)
  const [judgeConfig, setJudgeConfig] = useState(() =>
    readStoredObject('atlas_judge_config', { provider: '', model: '' })
  );

  // Test Generator model (which model drafts new AI test payloads). Its own
  // persisted config — independent of the AI Judge.
  const [genConfig, setGenConfig] = useState(() =>
    readStoredObject('atlas_gen_config', { provider: '', model: '' })
  );
  const effectiveGenConfig = genConfig || judgeConfig;
  const saveJudgeConfig = (cfg) => {
    setJudgeConfig(cfg);
    localStorage.setItem('atlas_judge_config', JSON.stringify(cfg));
  };
  const saveGenConfig = (cfg) => {
    setGenConfig(cfg);
    if (cfg) localStorage.setItem('atlas_gen_config', JSON.stringify(cfg));
    else localStorage.removeItem('atlas_gen_config');
  };

  // Unified proxy configuration covering private-network, provider, and article
  // traffic. The relay is a custom proxy URL the user provides; private-network
  // and provider traffic start OFF (opt-in per category), article fetching is ON
  // so pasted/external content can still be pulled through the relay.
  useEffect(() => {
    const url = proxyUrl.trim();
    // A custom relay URL may embed a token for the relay service; scan it with
    // the same query-string blocklist used for provider endpoints so a saved
    // proxy never carries a secret into logs, history, or the proxy path.
    const secretParam = findSecretQueryParam(url);
    if (secretParam) {
      setProxyUrl('');
      addToast(`The proxy URL embeds a likely secret (?${secretParam}=…). Move it into a header or remove it.`);
      return;
    }
    setProxyConfig({ enabled: proxyEnabled, baseUrl: url, mode: proxyMode, categories: proxyCategories });
    localStorage.setItem('atlas_proxy', JSON.stringify({ enabled: proxyEnabled, url: proxyUrl.trim(), mode: proxyMode, categories: proxyCategories }));
  }, [proxyEnabled, proxyUrl, proxyMode, proxyCategories, addToast]);

  // Live connectivity check for the configured proxy URL: relays a benign test
  // target through the relay and reports the outcome line + toast.
  const handleProxyTest = useCallback(async () => {
    if (!proxyUrl.trim()) {
      setProxyTest({ status: 'error', message: 'No proxy URL configured.' });
      return;
    }
    setProxyTest({ status: 'testing', message: 'Testing proxy connection…' });
    try {
      const result = await testProxyConnection(proxyUrl.trim());
      setProxyTest({ status: 'ok', message: `Proxy works — relayed ${new URL(result.target).host} (HTTP ${result.status}, ${result.chars} chars)` });
      addToast('Proxy test succeeded — the relay is reachable and returning content.');
    } catch (err) {
      // Project the failure at the inline sink: the relay's non-OK body or a
      // network error must not reach `proxyTest.message` (rendered inline by
      // ProxyCard) unredacted/unbounded. The strict projection also closes the
      // 16–39 short-token gap for this untrusted relay-controlled material.
      const message = projectDiagnosticTextStrict(err);
      setProxyTest({ status: 'error', message });
      addToast(`Proxy test failed: ${message}`, 'error');
    }
  }, [proxyUrl, addToast]);

  const toggleSettingsCard = useCallback((key) => {
    // While a provider is being added/edited, keep the Providers card expanded
    // so the form stays inside the section.
    if (key === 'providers' && providerDraft) return;
    setCollapsedSettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('atlas_settings_collapsed', JSON.stringify(next));
      return next;
    });
  }, [providerDraft]);

  // Download Live MITRE ATLAS framework from GitHub. `silent` (auto-sync on
  // login) skips the toast and the auto-selection of coverage tests.
  const syncLiveATLAS = async ({ silent = false } = {}) => {
    setLoadingATLAS(true);
    setAtlasSyncStatus('Fetching YAML from MITRE GitHub...');
    try {
      const { matrix, version } = await fetchATLASFramework();
      setAtlasMatrix(matrix);
      setCatalogMatrix(matrix);
      localStorage.setItem('atlas_cached_matrix', JSON.stringify(matrix));
      const meta = { updatedAt: Date.now(), version: version || 'unknown' };
      localStorage.setItem('atlas_matrix_meta', JSON.stringify(meta));
      if (!silent) {
        // Auto-select the coverage tests generated from the freshly synced matrix.
        const newAuto = generateTestsForMatrix(matrix, coveredTechniqueIds).map(t => t.id);
        setSelectedTests(prev => [...new Set([...prev, ...newAuto])]);
        addToast(`MITRE ATLAS Matrix updated live (v${version || 'unknown'}) with all official tactics and techniques!`);
      }
      setAtlasSyncStatus(`Last synced ${new Date().toLocaleString()} · version ${version || 'unknown'}`);
    } catch (err) {
      setAtlasSyncStatus(localStorage.getItem('atlas_cached_matrix')
        ? `Sync failed (${err.message}) — showing the last cached version.`
        : `Sync failed (${err.message}) — showing the preloaded version.`);
      if (!silent) addToast(`Error fetching MITRE ATLAS: ${redactSensitiveText(err.message)}. You can retry the sync in Settings.`);
    } finally {
      setLoadingATLAS(false);
    }
  };

  // Auto-update the matrix when the app opens (kept quiet: no toast / no test selection).
  useEffect(() => {
    const t = setTimeout(() => { syncLiveATLAS({ silent: true }); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    import('../data/atlas-bundled').then(({ BUNDLED_ATLAS_VERSION, BUNDLED_ATLAS_MATRIX }) => {
      if (!active) return;
      if (!localStorage.getItem('atlas_cached_matrix')) {
        setAtlasMatrix(BUNDLED_ATLAS_MATRIX);
        setCatalogMatrix(BUNDLED_ATLAS_MATRIX);
      }
      setAtlasSyncStatus(current => current.startsWith('Loading preloaded')
        ? `Preloaded (v${BUNDLED_ATLAS_VERSION}) — sync in Settings for the latest`
        : current);
    }).catch(err => {
      console.warn('Could not load preloaded ATLAS matrix:', err.message);
    });
    return () => { active = false; };
    // setCatalogMatrix is a stable provider-side useState setter (mount-once bridge).
  }, [setCatalogMatrix]);

  const value = {
    useDemoMode,
    setUseDemoMode,
    proxyEnabled,
    setProxyEnabled,
    proxyUrl,
    setProxyUrl,
    proxyMode,
    setProxyMode,
    proxyCategories,
    setProxyCategories,
    proxyTest,
    setProxyTest,
    handleProxyTest,
    backupPassphrase,
    setBackupPassphrase,
    collapsedSettings,
    toggleSettingsCard,
    judgeConfig,
    setJudgeConfig,
    saveJudgeConfig,
    genConfig,
    setGenConfig,
    saveGenConfig,
    effectiveGenConfig,
    atlasMatrix,
    setAtlasMatrix,
    loadingATLAS,
    setLoadingATLAS,
    atlasSyncStatus,
    setAtlasSyncStatus,
    syncLiveATLAS,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// SettingsProvider hooks and the context object must stay importable from
// tests and non-component modules (App, SettingsView, hooks) — this module
// is a context factory, so the fast-refresh component-only rule is waived.
// eslint-disable-next-line react/only-export-components
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
}

export { SettingsContext };