# Concepts & Scoring

## Verdicts

Every executed test produces one verdict per target model:

| Verdict | Meaning | Counts toward resilience? |
| --- | --- | --- |
| `SECURE` | The model resisted the attack. | Yes (denominator) |
| `VULNERABLE` | The attack succeeded. | Yes (denominator) |
| `EMPTY` | The model returned no content. | No |
| `ERROR` | A technical failure (timeout, HTTP error, parse failure). | No |
| `INCONCLUSIVE` | The result could not be classified — set manually via an override, or produced when the AI Judge was unavailable (transport/quota/timeout/malformed output) or when a long response had no clear security signal. | No |

Technical failures and unclassified results are **not** security verdicts — they never lower (or inflate) the resilience
score and are reported separately. An AI Judge outage is recorded as `INCONCLUSIVE` (never as a false `SECURE` /
`VULNERABLE`).

## Resilience score

The score is the percentage of valid verdicts that were `SECURE`:

\[
\text{score} = \frac{\text{SECURE}}{\text{SECURE} + \text{VULNERABLE}} \times 100
\]

- `ERROR` / `EMPTY` / `INCONCLUSIVE` verdicts are excluded.
- If a run has **no valid verdicts** (all errors/empties/inconclusive), the score shows **—** (N/A) instead of a
  misleading 100%.

The score is shown at three levels:

- **Overall security** on the dashboard (across all of history).
- **Per model** (resilience by MITRE ATLAS tactic).
- **Per audit record** in the history table and the audit detail modal.

## Manual overrides

From the **expanded result detail** (Auditor Runner) or an **audit detail** (Dashboard), you can override scored verdicts:

- **Secure** / **Vulnerable**, or **Clear override**.

Overrides are keyed to the individual executed result, persisted in your browser, and flow into **all** scoring — the
live results, the dashboard overall score, per-model resilience, history rows, and printed reports. An `INCONCLUSIVE`
override is excluded from the score. Technical `ERROR` and `EMPTY` results cannot be converted into scored verdicts.
Overrides are included in backups.

When you override a verdict you can optionally explain why; GroundRumble will offer to feed that feedback back into the
**AI Judge prompt** (see [Evaluation Engines](features/evaluation-engines.md)) — a dedicated dialog shows the merge
running, then the previous + editable new prompt, and the **new evaluation** the updated prompt would produce, so you
can review before applying.

## Deleting audits

Each audit in the history table (and the audit detail modal) has a **Delete** action. Deleting an audit removes it from
history **and** from the overall score — the dashboard recomputes entirely from the remaining history.

## How to interpret results

A resilience score answers one question: *how well did this target resist the specific suite, judge, and configuration
you ran?* It does **not** prove a model is "secure." Keep these limits in mind when reading results:

- **Suite-dependent** — scores are relative to the techniques and payloads you selected. Adding stricter tests can lower
  a score; a high score just means the target resisted *this* suite.
- **Judge-dependent** — keyword heuristics and an AI Judge can disagree. When they do, expand the cell and read the
  actual response and reasoning rather than trusting the score alone.
- **Generation-quality dependent** — tests generated from weak or off-topic sources are less valuable. Always review
  generated tests before running them (see [AI Test Generation](features/ai-test-generation.md)).
- **False positives / false negatives** — a `VULNERABLE` verdict means the response matched failure keywords or the
  judge's reasoning; it can be a false positive. A passed test can also be a false negative (an attack that simply
  didn't land this time). Expand cells and inspect before acting.
- **Comparison limits** — side-by-side results are only as fair as the lineup: models must receive the identical
  payloads and be judged by the same (ideally neutral) judge.
- **Guardrail validation limits** — when testing a guarded deployment, GroundRumble sees the endpoint's final response
  and verdict. It does not see guardrail decision metadata (which filter triggered, block reason), so a block at the
  endpoint and a bypass look different only through the response you get.
- **A high score is not proof of security** — it is evidence about behavior under the tests you chose. Use it to compare
  and to track regressions, not as a compliance stamp.

## The MITRE ATLAS matrix

Test payloads are mapped to [MITRE ATLAS](https://atlas.mitre.org/) techniques — whether they come from curated
presets, auto-generated coverage, or are **source-grounded** from research via AI Test Generation. The matrix ships
**preloaded** with the latest MITRE ATLAS bundle and **auto-syncs on app load**. You can also force a sync manually from
**Settings → MITRE ATLAS Framework Database** → **Sync Live ATLAS**, which downloads the official framework and
generates coverage tests for techniques that lack a curated payload.
