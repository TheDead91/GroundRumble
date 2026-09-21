/**
 * Judge client module - AI Judge API calls
 */

import { fetchWithRetry } from './fetch-retry.js';
import { extractByPath, applyBodyTemplate, isJsonBodyTemplate, hasHeader, resolveBodyContentType } from './provider-request-config.js';
import { rateLimiter } from './rate-limiter.js';
import { normalizeContent, extractLastJsonBlock, truncateText } from '../json-repair.js';
import { assertProviderEndpointAllowed } from './provider-client.js';

export { normalizeContent, extractLastJsonBlock, extractJsonBlocks, truncateText, stripFencesCandidates, parseJSONObject, repairTruncatedJson } from '../json-repair.js';

/**
 * Reasoning model endpoints
 */
export const reasoningEndpoints = new Set([
  'https://api.openai.com/v1/chat/completions',
  'https://api.openai.com/v1/responses',
]);


const JUDGE_HTTP_RE = /^HTTP (\d{3}):/;

const is413 = (err) => /^HTTP 413:/.test(String(err?.message || ''));

// fetchWithRetry throws "HTTP <status>: <body>" for non-2xx responses from this
// transport; re-surface those as judge-prefixed errors.
const toJudgeHttpError = (err) => {
  const msg = String(err?.message || '');
  const m = JUDGE_HTTP_RE.exec(msg);
  return m ? new Error(`Judge HTTP ${m[1]}:${msg.slice(m[0].length)}`) : err;
};

const shrinkHalve = (text) => truncateText(text || '', Math.max(1, Math.floor((text || '').length / 2)));

/**
 * Query OpenAI-compatible judge
 */
export const queryOpenAIJudge = async (judge, systemPrompt, userPrompt, signal, options = {}) => {
  const { maxTokens = 4096, temperature = 0, jsonMode = true } = options;
  // Final-transport endpoint policy: the judge destination is classified by the
  // same canonical policy as the provider transport, before any request is
  // constructed or dispatched.
  assertProviderEndpointAllowed(judge.endpoint, judge);
  if (judge.rpm > 0) await rateLimiter.wait(judge.model || judge.endpoint, judge.rpm, signal);
  const method = String(judge.method || 'POST').toUpperCase();
  const headers = { ...(judge.headers || {}) };
  if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
  if (!hasHeader(headers, 'authorization')) headers.Authorization = `Bearer ${judge.apiKey || ''}`;

  // One round-trip; resolves with the coerced reply content ('' when empty).
  // Recovers the last valid JSON block from reasoning_content for reasoning
  // models that reply with an empty content field.
  const requestContent = async (sys, usr, disableThinking, retries) => {
    const body = JSON.stringify({
      model: judge.model || '',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: usr },
      ],
      max_tokens: maxTokens,
      temperature,
      ...(disableThinking
        ? { reasoning: { exclude: true } }
        : jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    let data;
    try {
      const res = await fetchWithRetry(judge.endpoint, { method, headers, body }, retries, null, signal);
      data = await res.json();
    } catch (err) {
      // Let 413s propagate unprefixed so the payload-shrink loop can spot them.
      if (is413(err)) throw err;
      throw toJudgeHttpError(err);
    }
    const message = data?.choices?.[0]?.message;
    const content = normalizeContent(message?.content);
    if (content) return content;
    const reasoning = typeof message?.reasoning_content === 'string' ? message.reasoning_content : '';
    if (!reasoning) return '';
    const block = extractLastJsonBlock(reasoning);
    if (!block) return '';
    try {
      const salvaged = JSON.parse(block);
      return salvaged && typeof salvaged === 'object' ? JSON.stringify(salvaged) : '';
    } catch { return ''; }
  };

  let sys = systemPrompt;
  let usr = userPrompt;
  for (let attempt = 0; ; attempt++) {
    let content;
    try {
      // Shrink attempts use no internal retries so payload shrinking stays fast.
      content = await requestContent(sys, usr, false, attempt === 0 ? 2 : 0);
    } catch (err) {
      if (!is413(err)) throw err;
      if (attempt >= 2) throw new Error(`Payload too large for the judge endpoint: ${err.message}`);
      sys = shrinkHalve(sys);
      usr = shrinkHalve(usr);
      continue;
    }
    if (content) return content;
    if (attempt === 0) {
      // Empty content and nothing salvaged from reasoning → retry ONCE with
      // thinking disabled before giving up.
      try {
        content = await requestContent(sys, usr, true, 0);
      } catch (err) {
        if (is413(err)) throw new Error(`Payload too large for the judge endpoint: ${err.message}`);
        throw err;
      }
      if (content) return content;
    }
    return '';
  }
};

/**
 * Query raw judge
 */
export const queryRawJudge = async (judge, systemPrompt, userPrompt, signal, options = {}) => {
  const { bodyTemplate, method = 'POST', responsePath = 'choices.0.message.content', maxTokens = 4096, temperature = 0, jsonMode = true } = options;
  // Final-transport endpoint policy: shared with the provider transport and
  // enforced before the raw request body/template is materialized.
  assertProviderEndpointAllowed(judge.endpoint, judge);
  let body;
  if (bodyTemplate) {
    body = applyBodyTemplate(bodyTemplate, {
      systemPrompt,
      userPrompt,
      model: judge.model,
      maxTokens,
      temperature,
      jsonMode,
    });
    // JSON-intended templates must survive safe substitution: quoted string
    // placeholders are JSON-escaped by applyBodyTemplate, so a still-invalid
    // body means the template skeleton itself is malformed. Fail closed before
    // any transport so malformed/unsafe bytes never reach fetch.
    if (isJsonBodyTemplate(bodyTemplate)) {
      try {
        JSON.parse(body);
      } catch (err) {
        throw new Error(`Body template produced invalid JSON: ${err.message}`);
      }
    }
  } else {
    body = JSON.stringify({
      model: judge.model || '',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
  }
  const headers = { ...(judge.headers || {}) };
  if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = resolveBodyContentType(bodyTemplate);
  if (judge.apiKey && !hasHeader(headers, 'authorization')) headers.Authorization = `Bearer ${judge.apiKey}`;
  const res = await fetchWithRetry(judge.endpoint, { method, headers, body }, 2, null, signal);
  const data = await res.json();
  return extractByPath(data, responsePath);
};

/**
 * Query AI judge (dispatches based on provider type)
 */
export const queryAI = async (judge, systemPrompt, userPrompt, maxTokens, signal, jsonMode = false) => {
  if (!judge?.connector && !judge?.endpoint) {
    throw new Error(`Unknown judge provider: ${judge?.provider ?? '(none)'}`);
  }
  if (judge.connector === 'raw') {
    return queryRawJudge(judge, systemPrompt, userPrompt, signal, {
      maxTokens,
      jsonMode,
      bodyTemplate: judge.bodyTemplate,
      responsePath: judge.responsePath,
      method: judge.method,
    });
  }
  return queryOpenAIJudge(judge, systemPrompt, userPrompt, signal, { maxTokens, jsonMode });
};
