/**
 * API module index - Re-exports all split API modules
 */

// Rate limiter
export { RateLimiter, rateLimiter, resetRateLimiter, sleep } from './rate-limiter.js';

// Fetch retry
export { fetchWithRetry, redirectRefusal } from './fetch-retry.js';

// Proxy
export { 
  getProxyConfig as proxyConfig, 
  setProxyConfig, 
  getProxyConfig,
  confirmProxyUse, 
  fetchViaProxy, 
  buildProxyUrl, 
  shouldUseProxy,
  getConsentedProxyCategories,
  resetProxyConsent,
  setProxyConfirmHandler,
  setRedirectConfirmHandler,
  confirmRedirectFollow,
  testProxyConnection,
} from './proxy.js';

// Provider client
export {
  assertProviderEndpointAllowed,
  providerRouteFor,
  providerFetch,
  resolveOpenAIEndpoint,
  deriveModelsEndpoint,
  applyBodyTemplate,
  isJsonBodyTemplate,
  substituteToken,
  queryOpenAIProvider,
  queryRawProvider,
  extractByPath,
  parseHeaders,
  fetchProviderModels,
  testProvider,
  queryModel,
  findSecretQueryParam,
} from './provider-client.js';

// Judge client
export {
  queryOpenAIJudge,
  queryRawJudge,
  queryAI,
  normalizeContent,
  extractLastJsonBlock,
  extractJsonBlocks,
  stripFencesCandidates,
  repairTruncatedJson,
  parseJSONObject,
  reasoningEndpoints,
  truncateText,
} from './judge-client.js';

// ATLAS sync
export {
  TRUSTED_GITHUB_SOURCE_HOSTS,
  classifySourceHost,
  assertPublicSourceUrl,
  redirectFollowPolicy,
  fetchATLASFramework,
  fetchSourceExcerpt,
} from './atlas-sync.js';

// Re-export AI modules
export { evaluateWithAIJudge, evaluateWithAIJudgePrompt, evaluateWithKeywords, mergeJudgeFeedback, evaluateJudgeCanaries, judgeRewriteApplyGate } from '../ai-judge.js';
export { analyzeSourceWithAI, analyzeSourcesWithAI, assessSourceWithAI, proposeSourceMeta } from '../ai-analyzer.js';
export { generateTestsWithAI, critiqueGeneratedTests } from '../ai-generator.js';