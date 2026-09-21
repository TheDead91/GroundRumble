/**
 * JSON-repair pile: pure text-in/text-out parsing utilities shared by the
 * judge client, analyzer, judge and generator modules.
 * No fetch, no globals, no DOM — node-testable.
 */
/**
 * Normalize content: string passthrough; arrays of string/text parts joined
 * with a space; { text } objects unwrapped; anything else coerced to ''.
 */
export const normalizeContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part && typeof part === 'object' ? part.text || '' : '')))
      .filter(Boolean)
      .join(' ');
  }
  if (content && typeof content === 'object') return content.text || '';
  return '';
};

/**
 * Extract last JSON block (raw substring or null)
 */
export const extractLastJsonBlock = (text) => {
  const blocks = extractJsonBlocks(text);
  return blocks.length ? blocks[blocks.length - 1] : null;
};

/**
 * Extract JSON blocks
 * Returns the RAW source substring for each balanced {…}/[…] block; parsing
 * happens once, in the caller.
 */
export const extractJsonBlocks = (text) => {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth > 0) depth--;
      if (depth === 0 && start !== -1) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return blocks;
};

/**
 * Truncate text: cut at the last sentence terminator within the final 40% of
 * the budget when one exists, and mark the output as truncated.
 */
export const truncateText = (text, maxChars) => {
  if (!text || text.length <= maxChars) return text;
  const minCut = Math.floor(0.6 * maxChars);
  let cut = maxChars;
  for (let i = maxChars - 1; i >= minCut; i--) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') { cut = i + 1; break; }
  }
  return text.slice(0, cut) + '… (truncated)';
};

/**
 * Strip fences candidates
 */
export const stripFencesCandidates = (text) => {
  const lines = text.split('\n');
  const candidates = [];
  let inFence = false;
  let fenceStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        fenceStart = i;
      } else {
        inFence = false;
        candidates.push(lines.slice(fenceStart + 1, i).join('\n'));
      }
    }
  }
  return candidates;
};

/**
 * Parse JSON object with recovery: pure JSON → first embedded block →
 * truncated-JSON repair. Returns null when nothing parses (never throws).
 */
export const parseJSONObject = (text) => {
  try {
    return JSON.parse(text);
  } catch { /* not pure JSON */ }
  for (const block of extractJsonBlocks(String(text ?? ''))) {
    try {
      const parsed = JSON.parse(block);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* try next block */ }
  }
  const repaired = repairTruncatedJson(text);
  if (repaired !== null && repaired !== undefined) return repaired;
  return null;
};

/**
 * Repair truncated JSON: close an unterminated string, drop a trailing comma,
 * and append closers for open brackets in stack order. Returns null for input
 * that is broken beyond simple truncation.
 */
export const repairTruncatedJson = (rawText) => {
  const text = String(rawText ?? '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  const stack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      if (!stack.length || stack[stack.length - 1] !== (ch === '}' ? '{' : '[')) return null;
      stack.pop();
    }
  }
  let repaired = text;
  if (inString) repaired += '"';
  repaired = repaired.trimEnd();
  if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);
  while (stack.length) repaired += stack.pop() === '{' ? '}' : ']';
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
};
