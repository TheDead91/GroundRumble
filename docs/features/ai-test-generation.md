# AI Test Generation

The **Test Generator** model drafts new adversarial attack payloads **grounded in the research sources you bring in** —
a security article, paper, GitHub repo, URL, or pasted content. Each generated test carries the evidence it was derived
from, its reasoning, and a real ATLAS technique mapping.

![AI Test Generation](../assets/img/ai-generation.png){ width="720" }

## Lifecycle

```
Research source (article / paper / repo / URL / paste)
        │  Mozilla Readability full-article extraction
        ▼
Source assessment  (relevance + quality)
        │
        ▼
Threat profile  (per-source: vulnerability class, weight, attack vectors)
        │
        ▼
Test generation  (evidence-backed payloads, ATLAS-mapped)
        │
        ▼
Human review  (you review/edit/delete — Advanced mode, or the final Review & add screen)
        │
        ▼
Critique pass  (autonomous filter that drops weak / duplicate tests)
        │
        ▼
Test library  (added to your suite, ready for the Auditor Runner)
```

Every generated test keeps its **evidence**, **reasoning**, **ATLAS technique mapping**, and **failure keywords**
through this whole pipeline — so what ends up in your suite is traceable back to the source.

> **Weak models generate weak tests.** Generation quality depends heavily on the model you pick — use a capable model
> and **review the results before adding them to your suite**. Generated tests are only as good as their sources and
> the model that produced them.

## Sources

- **Predefined sources** — built-in research topics (OWASP prompt injection, extraction research, jailbreak archives, …).
- **URL sources** — GitHub repos (README + files) or articles.
- **Pasted content** — paste an article/README directly; ideal when fetching is blocked.

Each source shows its ingestion status (`PASTED`, `CONTENT FETCHED`, `CORS-BLOCKED — INFERRING`, `PROXY DECLINED`, or
`PROXY FAILED`), plus an **Obtained context** preview and a **View analysis** of the extracted threat profile.

### Full-article extraction

Page content is parsed with **Mozilla Readability** (the same algorithm behind Firefox Reader Mode), so it works on
arbitrary sites — no reliance on a particular `<article>`/`<main>` tag structure. The extracted article is kept **whole**
(no aggressive truncation), which matters for long articles.

### Fetching article content

Browsers block reading most external pages. GroundRumble tries the direct request first; when the direct fetch is
blocked by the browser, you can retry it through your **configured external proxy** (*Settings → Proxy
Configuration*), and Readability parses the relayed page. You're prompted for consent before any proxy request, and
the relayed URL/content is visible to the proxy operator.

!!! note
    Without a configured proxy, such fetches degrade gracefully (flagged as proxy failure) — paste the content
    instead. GitHub repos don't need the proxy at all (raw fetching already works).

## Source assessment

Before committing, the Test Generator evaluates each source's **relevance** and **quality**:

- `RELEVANT · HIGH`, `MAYBE RELEVANT`, `LOW RELEVANCE`, or `IRRELEVANT`
- A summary + reason, plus a warning when a source is likely too weak or off-topic for test generation.

Low-relevance or off-topic sources produce low-value tests — the assessment exists to flag this **before** you generate.

## Interaction modes

A **Simple / Advanced** toggle in *Options* controls how much you review:

- **Simple (default)** — analysis, generation and refinement run **autonomously**; a dedicated progress screen shows
  the pipeline (with an elapsed timer) and lands straight on the final **Review & add** screen.
- **Advanced** — there's no separate "Generate" screen: analysis and generation run with progress shown **inline in the
  buttons themselves** (spinner + stage + live % on *Generate tests*, *Continue to generation*, and *Refine & finish*),
  and the wizard pauses at two checkpoints for manual review:
  1. **Profiles** — the per-source threat profiles the model derived, as editable cards (vulnerability class, weight,
     attack vectors). Edit anything, then *Continue to generation*.
  2. **Screening** — the generated tests **before** refinement, as editable cards (name, technique, system prompt,
     payload, keywords). Tweak or delete, then *Refine & finish* (autonomous critique) or *Add without refining*.

## Pipeline modes

- **Deep (recommended)** — a three-stage pipeline: batched **analysis** of each source into a threat profile, **grounded
  generation**, and a **critique** pass that drops weak/duplicate tests and returns the best ones.
- **Fast** — a single-pass generation.

Use **How many tests** to set the aim; the critique pass may return fewer after filtering. **Tests per call** batches
generation (fewer calls = less quota and fewer chances to fail), and **Response size** caps output tokens.

## Resilience

Generation is built to survive flaky model output:

- A malformed response is **retried** (once, and once **without** strict JSON mode, which some gateways/proxies reject)
  and, if it still fails, **skipped and counted** — the run continues and partial results are kept.
- **Reasoning models** that spend their whole budget "thinking" and return an empty answer are detected and handled:
  later calls ask them to skip the chain-of-thought, and the final JSON is recovered from the reasoning content as a
  fallback.
- The pipeline is never fatal on a single bad response — you always get the tests that *did* parse.

## Output

Generated tests are previewed for confirmation before being added to the suite. Each test carries evidence (`extract`),
reasoning, a real ATLAS technique mapping, and self-consistent gates/keywords.

![AI-led proposal of test cases](../assets/img/ai-generation-preview.png){ width="720" }

**Before you run a generated suite, review:**

- **Evidence** — does the test really follow from the source, or did the model drift?
- **Technique mapping** — is the ATLAS technique a sensible fit?
- **Payload + keywords** — are the system prompt, attacker prompt, and failure/refusal keywords self-consistent, so the
  test will judge cleanly?
- **Duplicate/weak tests** — the critique pass drops many, but a final human pass is still recommended.
