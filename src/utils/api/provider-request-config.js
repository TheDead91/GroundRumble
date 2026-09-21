/**
 * Resolve OpenAI-compatible endpoint
 * Raw connectors are returned untouched; singular `/chat/completion` paths are
 * normalized to the plural form.
 */
export const resolveOpenAIEndpoint = (cp) => {
  const base = String(cp.endpoint || '').replace(/\/+$/, '');
  if (cp.connector === 'raw') return { chatEndpoint: base, modelsEndpoint: '' };
  if (/\/chat\/completions?$/.test(base)) {
    const chatEndpoint = base.replace(/completions?$/, 'completions');
    return { chatEndpoint, modelsEndpoint: chatEndpoint.replace(/\/chat\/completions$/, '/models') };
  }
  return { chatEndpoint: `${base}/chat/completions`, modelsEndpoint: `${base}/models` };
};

/**
 * Derive models endpoint
 */
export const deriveModelsEndpoint = (cp) => {
  if (cp.modelsEndpoint?.trim()) return cp.modelsEndpoint.trim();
  const resolved = resolveOpenAIEndpoint(cp);
  return resolved.modelsEndpoint;
};

/**
 * Apply body template.
 *
 * String placeholders (systemPrompt/userPrompt/model) are JSON-escaped when
 * they appear in the documented quoted position (`"{{userPrompt}}"`), so
 * prompts containing quotes, backslashes, newlines or unicode still produce
 * valid JSON and remain exact string data. Unquoted occurrences keep raw
 * substitution for plain-text (non-JSON) templates. Numeric/boolean
 * placeholders (maxTokens/temperature/jsonMode) substitute raw as before.
 *
 * Substitution is single-pass over the template: placeholder-like text inside
 * a substituted value is never re-scanned, so values are preserved verbatim.
 */
const jsonEscapeInner = (value) => JSON.stringify(String(value)).slice(1, -1);

const TEMPLATE_TOKEN_RE = /\{\{(systemPrompt|userPrompt|model|maxTokens|temperature|jsonMode)\}\}/g;
const SCALAR_TEMPLATE_KEYS = new Set(['maxTokens', 'temperature', 'jsonMode']);

/**
 * Classify a raw body template as JSON-intended for post-substitution
 * validation and for string-placeholder quoting. JSON-intent is decided by
 * shape, not by whether the author happened to quote each placeholder:
 * a JSON body begins with `{` (object) or `[` (array). This catches the
 * documented quoted form (`"{{userPrompt}}"`), the unquoted hole form
 * (`{"user": {{userPrompt}}}`), numeric/bool-only templates
 * (`{"tokens":{{maxTokens}}}`), and malformed JSON skeletons (trailing comma,
 * unterminated) that must still fail closed at validation — while a leading
 * placeholder token (`{{userPrompt}}`) or any other text stays a plain-text
 * body with raw textual substitution.
 */
export const isJsonBodyTemplate = (template) => {
  const src = String(template ?? '').trimStart();
  if (src.startsWith('{{')) return false;
  return src.startsWith('{') || src.startsWith('[');
};

export const applyBodyTemplate = (template, { systemPrompt, userPrompt, model, maxTokens, temperature, jsonMode }) => {
  if (!template) return null;
  const strings = {
    systemPrompt: systemPrompt || '',
    userPrompt: userPrompt || '',
    model: model || '',
  };
  const scalars = {
    maxTokens: maxTokens?.toString() || '4096',
    temperature: temperature?.toString() || '0',
    jsonMode: jsonMode ? 'true' : 'false',
  };
  const src = String(template);
  const jsonShaped = isJsonBodyTemplate(src);
  return src.replace(TEMPLATE_TOKEN_RE, (token, key, offset) => {
    if (SCALAR_TEMPLATE_KEYS.has(key)) return scalars[key];
    const quoted = src[offset - 1] === '"' && src[offset + token.length] === '"';
    if (jsonShaped) {
      // In a JSON body a string placeholder is always a JSON string value: the
      // already-quoted form keeps its surrounding quotes, the unquoted hole
      // form gains them, and both are JSON-string-escaped so externally
      // influenced text can never escape the field or add structure.
      const escaped = jsonEscapeInner(strings[key]);
      return quoted ? escaped : `"${escaped}"`;
    }
    return quoted ? jsonEscapeInner(strings[key]) : String(strings[key]);
  });
};

/**
 * Substitute token in headers
 */
export const substituteToken = (headers, apiKey) => {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    result[key] = String(value).replace(/\{\{token\}\}/g, apiKey || '');
  }
  return result;
};

/**
 * Extract value by path
 */
export const extractByPath = (obj, path) => {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => {
    if (acc === null || acc === undefined) return acc;
    if (Array.isArray(acc)) {
      const idx = parseInt(part, 10);
      return Number.isInteger(idx) ? acc[idx] : acc;
    }
    return acc[part];
  }, obj);
};

/**
 * Parse headers
 * Accepts a JSON string or an already-parsed object (copied).
 */
export const parseHeaders = (headerString) => {
  if (!headerString) return {};
  if (typeof headerString === 'object') return { ...headerString };
  if (!headerString.trim()) return {};
  try {
    return JSON.parse(headerString);
  } catch {
    return {};
  }
};

/**
 * Case-insensitive header-name lookup. HTTP header names are case-insensitive,
 * so `Authorization`, `authorization` and `AUTHORIZATION` all refer to the same
 * header. Returns true when the header set contains `name` under any casing.
 */
export const hasHeader = (headers, name) =>
  Object.keys(headers || {}).some((key) => key.toLowerCase() === name.toLowerCase());

/**
 * Resolve the default Content-Type for a raw request body. A template-free body
 * and a JSON-shaped template both serialize to JSON; a genuine non-JSON /
 * plain-text template ships a text/plain type. Explicit operator-authored
 * Content-Type headers are applied by the callers (via `hasHeader`) and always
 * take precedence over this default.
 */
export const resolveBodyContentType = (template) =>
  !template || isJsonBodyTemplate(template) ? 'application/json' : 'text/plain; charset=utf-8';
