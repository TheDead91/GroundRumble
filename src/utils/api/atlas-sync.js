/**
 * ATLAS sync module - MITRE ATLAS framework fetching
 */

import { TRUSTED_GITHUB_SOURCE_HOSTS, classifySourceHost, assertPublicSourceUrl, redirectFollowPolicy } from '../source-url-policy.js';
import { shouldUseProxy, confirmProxyUse, fetchViaProxy, confirmRedirectFollow } from './proxy.js';
import { loadAtlasYaml, buildAtlasMatrix } from '../atlas-parse.js';
import { MAX_README_CHARS, capChars, readBoundedText, extractArticle, smartExcerpt, stripHtml } from '../html-excerpt.js';
export { loadAtlasYaml, uniqBySource, buildAtlasMatrix } from '../atlas-parse.js';
export { TRUSTED_GITHUB_SOURCE_HOSTS, classifySourceHost, assertPublicSourceUrl, redirectFollowPolicy };

const ATLAS_POINTER_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-latest.yaml';
const ATLAS_V6_BASE = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/';
const ATLAS_LEGACY_URL = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml';

/**
 * Fetch ATLAS framework from MITRE GitHub
 * v6 pointer file (dist/v6/ATLAS-latest.yaml -> dist/v6/ATLAS-<version>.yaml)
 * with fallback to the legacy v5 document (dist/ATLAS.yaml).
 */
export const fetchATLASFramework = async (options = {}) => {
  const { signal, timeout = 30000 } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort());
  const init = { signal: controller.signal, redirect: 'manual' };

  // Pointer file names the current v6 document; ANY pointer-side failure falls
  // through to the legacy document below and is never surfaced on its own.
  let atlas = null;
  let pointerVersion = '';
  try {
    const ptrRes = await fetch(ATLAS_POINTER_URL, init);
    if (ptrRes.ok) {
      const ptrText = (await ptrRes.text()).trim();
      if (ptrText) {
        pointerVersion = ptrText.replace(/\.ya?ml$/i, '');
        const v6Res = await fetch(`${ATLAS_V6_BASE}${ptrText}`, init);
        if (v6Res.ok) {
          try { atlas = await loadAtlasYaml(await v6Res.text()); } catch { atlas = null; pointerVersion = ''; }
        } else {
          pointerVersion = '';
        }
      }
    }
  } catch { /* fall through to the legacy document */ }

  if (!atlas) {
    pointerVersion = '';
    let res;
    try {
      res = await fetch(ATLAS_LEGACY_URL, init);
    } catch (err) {
      clearTimeout(timeoutId);
      if (timedOut) throw new Error('Timed out fetching the ATLAS framework');
      throw err;
    }
    clearTimeout(timeoutId);
    // The deadline fired while the legacy request was in flight: its outcome
    // (however the transport settled it) is not trustworthy.
    if (timedOut) throw new Error('Timed out fetching the ATLAS framework');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    try {
      atlas = await loadAtlasYaml(await res.text());
    } catch (err) {
      throw new Error(`Invalid ATLAS YAML: ${err.message}`);
    }
    const built = buildAtlasMatrix(atlas);
    if (built.matrix.length === 0) throw new Error('Invalid ATLAS YAML: no tactics found');
    return built;
  }

  clearTimeout(timeoutId);
  const built = buildAtlasMatrix(atlas);
  if (built.matrix.length === 0) throw new Error('Invalid ATLAS YAML: no tactics found');
  return { matrix: built.matrix, version: pointerVersion || built.version };
};

/**
 * Fetch a meaningful text excerpt from a source URL.
 *
 * - GitHub repos: pulls the repository description from the public API plus the
 *   README from `raw.githubusercontent.com` (default branch, with main/master
 *   fallbacks), and extra root markdown files when the README is thin. GitHub
 *   blob/raw/tree URLs are resolved to their raw file.
 * - Other pages: fetches the page (directly or via the consented configured proxy)
 *   and extracts the main article with Mozilla Readability, falling back to a
 *   plain HTML strip when Readability finds nothing substantial.
 *
 * Returns { excerpt, kind, note, declined?, proxyFailed? }.
 */


/**
 * Normalizes a GitHub URL into its canonical https://github.com form so the
 * GitHub excerpt handler can consume it. Handles a trailing `.git`, a leading
 * `www.`, and SSH-style forms (`git@github.com:owner/repo`).
 */
const normalizeGitHubUrl = (input) => {
  const s = input.trim();
  const web = /^https?:\/\/(?:www\.)?github\.com\/([^/?#\s]+)\/([^/?#\s]+?)(?:\.git)?(?:\/([\s\S]*))?$/.exec(s);
  if (web) return `https://github.com/${web[1]}/${web[2]}${web[3] ? '/' + web[3] : ''}`;
  const ssh = /^(?:git@github\.com:|ssh:\/\/git@github\.com:)([^/\s]+)\/([^/?#\s]+?)(?:\.git)?(?:\/([\s\S]*))?$/.exec(s);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}${ssh[3] ? '/' + ssh[3] : ''}`;
  return s;
};

// GitHub fetches must not follow a redirect silently, because the redirect
// target (notably the contents-API `download_url`, which is repo-controlled)
// could point anywhere. The initial URL is validated too, and redirects are
// followed only to destinations that pass redirectFollowPolicy; a disallowed
// hop is refused instead of followed.
const safeGitHubFetch = async (url, signal, init = {}) => {
  let current = url;
  if (!redirectFollowPolicy(current).allowed) return { ok: false, status: 403, redirectedRefused: true };
  let res = await fetch(current, { ...init, signal, redirect: 'manual' });
  let hops = 0;
  while (res && res.status >= 300 && res.status < 400 && hops < 3) {
    const loc = res.headers.get('location');
    if (!loc) return res;
    const toUrl = new URL(loc, current).href;
    if (!redirectFollowPolicy(toUrl).allowed) return { ok: false, status: 403, redirectedRefused: true };
    current = toUrl;
    res = await fetch(current, { ...init, signal, redirect: 'manual' });
    hops++;
  }
  return res;
};

export const fetchSourceExcerpt = async (url, maxChars = 150000, signal, options = {}) => {
  const u = normalizeGitHubUrl(url.trim());
  let directSourceAllowed = true;
  try {
    assertPublicSourceUrl(u, options);
  } catch (err) {
    // DNS names cannot be classified safely in browser JavaScript. If the
    // guarded proxy is enabled, let it perform DNS resolution and validation;
    // otherwise fail before any direct request is attempted.
    if (options.allowPrivate !== true && shouldUseProxy(u, 'articles', null, true)) {
      directSourceAllowed = false;
    } else {
      throw err;
    }
  }
  const result = { excerpt: '', kind: 'web', note: '' };

  const ghRepo = /^https?:\/\/(?:www\.)?github\.com\/([^/?#\s]+)\/([^/?#\s]+)(?:\/(tree|blob|raw)\/([^/\s]+)\/(.*))?$/i.exec(u);
  if (ghRepo) {
    result.kind = 'github';
    const [, owner, repo, kind, ref, path] = ghRepo;
    const branch = ref || 'main';

    // A blob/raw URL points at a specific file → fetch it directly.
    if (path && (kind === 'blob' || kind === 'raw')) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        const res = await safeGitHubFetch(rawUrl, signal, { cache: 'no-store' });
        if (res.ok) {
          result.excerpt = (await readBoundedText(res, maxChars)).slice(0, capChars(maxChars));
          return result;
        }
      } catch { /* fall through to repo README */ }
    }

    // A tree URL points at a directory or file → list via the contents API and
    // pull the readable files so the excerpt matches the requested path.
    if (path && kind === 'tree') {
      try {
        const listUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
        const listRes = await safeGitHubFetch(listUrl, signal, { cache: 'no-store' });
        if (listRes.ok) {
          const listing = await listRes.json();
          if (Array.isArray(listing)) {
            for (const f of listing) {
              if (result.excerpt.length >= MAX_README_CHARS) break;
              if (f.type === 'file' && /\.(md|markdown|txt)$/i.test(f.name) && !/^readme/i.test(f.name)) {
                try {
                  const rawRes = await safeGitHubFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${f.name}`, signal, { cache: 'no-store' });
                  if (rawRes.ok) {
                    result.excerpt += `\n\n--- [${f.name}] ---\n\n${await readBoundedText(rawRes, MAX_README_CHARS)}`;
                    result.excerpt = result.excerpt.slice(0, MAX_README_CHARS);
                  }
                } catch { /* skip file */ }
              }
            }
            if (result.excerpt.length > 0) return result;
          } else if (listing && typeof listing === 'object' && listing.download_url) {
            const rawRes = await safeGitHubFetch(listing.download_url, signal, { cache: 'no-store' });
            if (rawRes.ok) {
              result.excerpt = (await readBoundedText(rawRes, maxChars)).slice(0, capChars(maxChars));
              return result;
            }
          }
        }
      } catch { /* fall through to repo root */ }
    }

    // Repo root → repository metadata (description + default branch).
    let description = '';
    let defaultBranch = '';
    try {
      const metaRes = await safeGitHubFetch(`https://api.github.com/repos/${owner}/${repo}`, signal, { cache: 'no-store' });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        description = meta.description || '';
        defaultBranch = meta.default_branch || '';
      }
    } catch { /* fall through */ }

    // README via raw.githubusercontent (tries default branch, then main/master/HEAD).
    const branches = [defaultBranch, 'main', 'master', 'HEAD'];
    for (const b of branches) {
      if (!b) continue;
      try {
        const readmeRes = await safeGitHubFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`, signal, { cache: 'no-store' });
        if (readmeRes.ok) {
          result.excerpt = (await readBoundedText(readmeRes, MAX_README_CHARS)).trim().slice(0, MAX_README_CHARS);
          if (result.excerpt.length > 0) break;
        }
      } catch { /* try next branch */ }
    }

    // Thin README → pull a few extra root markdown/text files for more depth.
    if (result.excerpt.length < 1200) {
      try {
        const listRes = await safeGitHubFetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, signal, { cache: 'no-store' });
        if (listRes.ok) {
          const files = await listRes.json();
          if (Array.isArray(files)) {
            for (const f of files) {
              if (result.excerpt.length >= MAX_README_CHARS) break;
              if (f.type === 'file' && /\.(md|markdown|txt|py|json)$/i.test(f.name) && !/^readme/i.test(f.name)) {
                try {
                  const rawRes = await safeGitHubFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch || 'HEAD'}/${f.name}`, signal, { cache: 'no-store' });
                  if (rawRes.ok) {
                    result.excerpt += `\n\n--- [${f.name}] ---\n\n${await readBoundedText(rawRes, MAX_README_CHARS)}`;
                    result.excerpt = result.excerpt.slice(0, MAX_README_CHARS);
                  }
                } catch { /* skip file */ }
              }
            }
          }
        }
      } catch { /* fall through */ }
    }

    if (description) result.note = `Repository description: ${description}`;
    if (!result.excerpt && description) result.excerpt = description;
    result.excerpt = result.excerpt.slice(0, capChars(maxChars));
    return result;
  }

  // Regular web page → fetch and strip HTML. Direct fetches are often blocked by
  // CORS; if the user has enabled the article proxy category, a relay can fetch
  // article content so it can be analyzed like pasted content. Behavior follows
  // the configured mode:
  //  - 'always'   → route through the proxy directly
  //  - 'fallback' → try the direct fetch first, proxy only if it fails
  // The user is always asked before any URL goes through the proxy; declining the
  // proxy leaves the content unfetched and is flagged so the app makes it obvious.
  let pageText = '';
  let viaProxy = false;
  let proxyDeclined = false;
  let proxyFailed = false;
  // "Articles proxy active" (category opted in) vs "always mode" (route every
  // fetch through the relay regardless of whether direct would succeed).
  const articlesProxyOn = shouldUseProxy(u, 'articles', null, true);
  const alwaysArticleProxy = shouldUseProxy(u, 'articles', null, false);

  const tryProxy = async (blocked) => {
    if (articlesProxyOn && await confirmProxyUse(u, 'articles', blocked)) {
      const r = await fetchViaProxy(u, signal, 'articles');
      if (r.text) {
        pageText = r.text;
        viaProxy = true;
      } else {
        proxyFailed = true;
      }
    } else if (articlesProxyOn) {
      proxyDeclined = true;
    }
  };

  if (!directSourceAllowed || alwaysArticleProxy) {
    // Route through the proxy directly (with the user's consent).
    await tryProxy(false);
  } else {
    // Try the direct request first; only fall back to the proxy (and only ask
    // for consent) if the direct request was blocked. A user-pasted URL may
    // redirect to an untrusted or local-looking destination, so a redirect is
    // never followed without asking the user first.
    let directRes = await fetch(u, { signal, redirect: 'manual' }).catch(() => null);
    if (directRes && directRes.status >= 300 && directRes.status < 400) {
      const location = directRes.headers.get('location');
      const toUrl = location ? new URL(location, u).href : null;
      // Re-validate the destination against the URL policy before following. A
      // redirect to a private/local/metadata host, a non-http(s) scheme, or any
      // DNS name that cannot be proven public from the browser is NOT followed
      // directly — it falls through to the guarded (server-validated) proxy
      // path below instead. Only policy-clean targets are offered to the user.
      const verdict = toUrl ? redirectFollowPolicy(toUrl) : { allowed: false };
      directRes = toUrl && verdict.allowed && await confirmRedirectFollow(u, toUrl)
        ? await fetch(toUrl, { signal, redirect: 'manual' }).catch(() => null)
        : null;
    }
    if (directRes && directRes.ok) {
      pageText = await readBoundedText(directRes, maxChars);
    } else {
      await tryProxy(true);
    }
  }

  if (proxyDeclined) {
    result.declined = true;
    result.note = 'You declined the proxy — the article content was not fetched; the AI will infer from the URL/title only.';
  } else if (proxyFailed) {
    result.proxyFailed = true;
    result.note = 'The proxy could not fetch the content (unreachable or rate-limited) — the AI will infer from the URL/title only.';
  }

  if (pageText) {
    // Capture the page title/meta for better grounding.
    const titleMatch = pageText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = pageText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i);
    // Prefer Readability's extracted article (works on arbitrary pages); fall
    // back to plain stripped text when it can't find a substantial article.
    const art = extractArticle(pageText);
    if (art) {
      result.excerpt = smartExcerpt(art.text, maxChars);
    } else {
      result.excerpt = smartExcerpt(stripHtml(pageText), maxChars);
    }
    const bits = [];
    if (titleMatch && titleMatch[1]) bits.push(`Page title: ${titleMatch[1].trim()}`);
    else if (art && art.title && art.title.trim()) bits.push(`Page title: ${art.title.trim()}`);
    if (descMatch && descMatch[1]) bits.push(`Description: ${descMatch[1].trim()}`);
    if (viaProxy) bits.push('Fetched via proxy');
    if (bits.length > 0) result.note = bits.join(' · ');
  }

  return result;
};
