/**
 * Compatibility layer for old api.js imports
 * Re-exports all functionality from the new split modules
 */

export {
  RateLimiter,
  rateLimiter,
  resetRateLimiter,
  sleep,
} from './api/rate-limiter.js';

export {
  fetchWithRetry,
  redirectRefusal,
} from './api/fetch-retry.js';

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
} from './api/proxy.js';

export {
  assertProviderEndpointAllowed,
  providerRouteFor,
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
} from './api/provider-client.js';

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
} from './api/judge-client.js';

export {
  TRUSTED_GITHUB_SOURCE_HOSTS,
  classifySourceHost,
  assertPublicSourceUrl,
  redirectFollowPolicy,
  fetchATLASFramework,
  fetchSourceExcerpt,
} from './api/atlas-sync.js';

// Re-export AI modules
export { evaluateWithAIJudge, evaluateWithAIJudgePrompt, evaluateWithKeywords, mergeJudgeFeedback, evaluateJudgeCanaries, judgeRewriteApplyGate } from './ai-judge.js';
export { analyzeSourceWithAI, analyzeSourcesWithAI, assessSourceWithAI, proposeSourceMeta } from './ai-analyzer.js';
export { generateTestsWithAI, critiqueGeneratedTests } from './ai-generator.js';