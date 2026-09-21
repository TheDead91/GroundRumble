# Security & Privacy

GroundRumble is **browser-native and private by architecture**: it runs entirely client-side with no hosted backend,
accounts, or telemetry. The honest framing: **GroundRumble has no infrastructure of its own — but your data does leave
the browser whenever you deliberately send prompts or responses to a configured provider.**

## Data flow

```
Your browser (GroundRumble)
  ├── Local Key Vault (IndexedDB)          ← API keys, optionally passphrase-encrypted
  ├── Test generation & scoring             ← runs locally, in the browser
  ├── Local audit history                   ← stored in your browser
  │
  ├── → Provider API (your user-defined custom providers)
  │         your chosen prompts & responses go ONLY here, directly
  │         from the browser (redirects are never followed)
  └── → Configured external proxy/relay (only if you set one up)
            selected article/provider/private-network requests,
            relayed through YOUR proxy with per-request consent
```

No GroundRumble server ever sees your keys, prompts, responses, or results.

## Client-side by design

- **100% client-side**: no backend, no accounts, no telemetry.
- API keys live in your browser's **Key Vault** (IndexedDB) — optionally **encrypted at rest** with a passphrase you
  control — and are sent only to the providers you choose.
- Requests go **directly from your browser** to the provider hosts (private/special-use endpoints require explicit
  approval). Redirects are never followed, so credentials can't leak to a different origin. Nothing passes through a
  third party except traffic you explicitly route through your own configured proxy (see below).

## Threat model

| Concern | Mitigation |
| --- | --- |
| Keys readable in storage | Stored in IndexedDB, optionally AES-256-GCM encrypted at rest. |
| Plaintext keys on disk | Set a vault passphrase before storing production keys. Without one, keys remain plaintext in IndexedDB by explicit user choice; with one, they are AES-256-GCM encrypted at rest. |
| Cross-site scripting (XSS) reading keys | Client-side keys are inherently exposed to any script running on the page — keep the app served from a trusted origin. Local/offline use is the recommended deployment. |
| Article content via proxy | Direct fetching is attempted first (according to policy/mode). If the browser blocks the request, you can retry it through your **configured external proxy** (opt-in, per-request consent) — the article URL and content then go to that proxy operator. Without a configured proxy, proxy-required fetches fail gracefully and pasted content remains an alternative. |
| Reasoning-model responses | Judge/generator output that arrives with an empty `content` (thinking models) is handled locally — no data leaves the browser beyond the normal model call. |
| Provider endpoint SSRF / DNS rebinding | Provider endpoints are called directly from the browser. Private / loopback / special-use destinations are blocked unless explicitly approved (`allowPrivate`), and redirects are never followed. See [Endpoint Policy](security/endpoint-policy.md) for the full rule set. |
| Third-party data | Keys go only to the providers you pick; direct article fetching stays between your browser and the target site, and a configured proxy only sees what you explicitly route through it. |
| Provider-side data handling | Anything you send to a provider (prompts, responses, keys as configured) is subject to that provider's own policies. GroundRumble cannot control what a provider does with data it receives. |

## The user-configured proxy

GroundRumble ships **no proxy server of its own**. It can route selected article, provider, and private-network
requests through a **user-configured external proxy/relay** — a proxy URL you supply in Settings (a self-hosted relay
you operate or another service you trust). Direct browser fetching is attempted according to policy/mode; the
configured proxy is used for requests that cannot go direct (fallback mode) or for all article fetches when you set
article mode to `always`.

Relay behavior and safeguards:

- **Opt-in per category** — article, provider, and private-network routing are enabled independently in Settings.
- **Per-request consent** — you are asked to confirm before a request is relayed (provider/private-network consent is
  remembered per session; article requests ask every time). The prompt names the target, states the routing reason,
  and names the configured proxy destination.
- **Privacy** — traffic sent through the configured proxy is visible to the proxy operator according to the relay
  protocol. Only route content you are comfortable sharing with that operator, and avoid proxying private or
  sensitive material.
- **No silent destination switch** — if the configured proxy fails, the request is not silently re-routed to another
  relay; the failure is reported instead.
- **Redirects refused through the relay** — relayed provider/private calls never follow redirects; a redirect
  response is reported as a refusal.
- **Endpoint policy still applies** — private/special-use destinations stay blocked unless explicitly approved, and
  proxy URLs embedding likely secrets (query-string credentials) are rejected on save.
- **Connectivity check** — the **Test Proxy** button relays a benign public page through the configured URL to verify
  the relay returns content.

!!! note
    Without a configured proxy, proxy-required fetches fail gracefully (flagged as proxy failure) — paste the content
    instead. GitHub repos don't need the proxy at all (raw fetching already works).

## Printable reports

Reports are generated in a new window. All model names, test names, responses, reasoning, and metadata are passed
through `DOMPurify` before the HTML is written, so malicious content cannot execute scripts. If the browser blocks the
popup, GroundRumble shows a toast instead of failing silently.

## Locked vault (read-only) mode

While the Key Vault is locked, GroundRumble shows **summary-only** audit data:

- Verdict counts, scores, model/provider labels, and history rows remain visible.
- Prompts, model responses, evaluation reasoning, detailed result panels, and printable reports are hidden until you
  unlock your keys.
- No live model calls, provider tests, test generation, or AI Judge evaluation can run while locked.

## Audit history retention

Audit summaries live in localStorage, while detailed redacted evidence is stored in encrypted IndexedDB when the vault
passphrase is active. Without a passphrase, only metadata and verdict fields are retained. Use the dashboard's **Clear
History** action (or delete individual audits) to remove stored history.

Backups are **encrypted-only**: exporting always requires a passphrase (≥ 12 characters) and produces only an
AES-256-GCM envelope, so API keys, secret-bearing headers/bodyTemplates, audit history, and research excerpts never
leave the browser in a plaintext file. Import accepts only encrypted envelopes and asks for the passphrase in a
dedicated dialog.

Backups are schema-validated before import, and their test/preset sections are re-normalized through the same schema as
the bulk importer (field caps, keyword caps). The pre-import
confirmation enumerates prompt-key overrides and imported test names so a smuggled AI Judge prompt replacement can never
land silently. Imported providers are restored with their configuration and secrets, but remain disabled until you
review and explicitly save or enable them, preventing an imported endpoint from receiving credentials automatically.
Import requires the vault to be unlocked when encrypted secrets are present.

## Content Security Policy

The CSP is deliberately strict (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), with one load-bearing
exception: `connect-src` allows arbitrary `http:`/`https:` origins. That is **intentional and required** — the tool's core
function is calling arbitrary user-configured provider endpoints, so the policy cannot pre-allowlist provider domains.
This is a defense-in-depth trade-off: it assumes no script-injection bug exists; if one ever does, exfiltration would be
unrestricted. The printable-report popup is exempted from this trade-off — it is served with a tightened policy
(`connect-src 'none'`) so it can never act as an exfil channel. `style-src 'unsafe-inline'` remains because the app uses
inline React styles and the report shell embeds a static `<style>` block.

## Recommended deployment

For the strongest privacy posture, run GroundRumble locally or offline and serve it from a trusted origin:

- `npm run dev` or `npm run preview` from a machine you control.
- Configure providers you trust (a local Ollama first if data sensitivity matters).
- Keep the vault passphrase set so keys are encrypted at rest.
- Avoid loading the app from untrusted/public origins where a compromised page could read client-side data.

## Responsible use

Red-team the models you own or are explicitly authorized to test — nothing more. Jailbreak and injection payloads can
provoke disallowed behavior in AI systems; keep them scoped, use them ethically, and never aim them at production
systems you don't control.
