# Auditor Runner

Run the identical attack suite across a **whole roster of models — or guarded deployments** in one pass and compare
their resilience side-by-side.

## Why identical payloads matter

The whole point of the runner is **controlled comparison**. Every target receives the exact same payload, system
prompt, and failure/refusal keywords — so a difference in results reflects a difference in the target, not a difference
in the test. This is what makes side-by-side model (or deployment) comparison meaningful.

## Model Comparison Lineup

Add target models from any configured provider. In sandbox mode the simulated model lists are preloaded, so you can pick
any two models and add them without keys. The inline **AI Judge** selector lets you pick the evaluator right here (works
in sandbox too — a note reminds you that sandbox runs simulate responses).

**Target vs. judge:** the targets are the models or deployments under test; the **AI Judge** is a separate model that
evaluates the targets' responses. You can put the judge on a different provider than the targets — no prejudice, and you
control both sides.

## Attack Payloads Selection

Choose which payloads to run:

- **Select All / Clear All**
- **Load preset…** (apply a named preset, with feedback on how many were selected) and **Save as preset**
- **Search + technique filter** to navigate large suites

## Evaluation engine

Pick between **Heuristic Keywords** (instant, offline) and **AI Judge** (a configured model returns a verdict with
 reasoning). Judge transport failures are recorded as **INCONCLUSIVE**, never silently converted into a security verdict.
 Your choice is persisted,
so the next session remembers it.

## Running an audit

Click **Run Comparison Audit**:

- A live **progress bar**, the current test/target, and a **console** (toggle with **Show Console**) stream progress.
- **Stop Audit** cancels the run and immediately shows a "Stopping…" state; in-flight requests are aborted. Completed
  evaluations are retained as a marked partial audit.
- Each target/judge API call has a **60-second timeout** — a hung request is recorded as an error and the run continues
  (distinct from a manual cancel).

![Auditor Runner](../assets/img/runner.png){ width="720" }

## Results

After the run, results appear as a **payload × model matrix**, grouped into:

- **Failed Attack Payloads** (at least one vulnerable verdict) — expanded by default
- **Inconclusive (errors / empty)** — technical failures or inconclusive overrides
- **Succeeded Attack Payloads** — fully resisted

Different models can produce different verdicts for the same test, so a row may show a mix of `VULNERABLE` and `SECURE`.

![Comparison results](../assets/img/results.png){ width="720" }

Click a vulnerable cell to inspect the full failed-test detail:

![Failed test detail](../assets/img/result-detail.png){ width="720" }

Click a verdict cell to expand the full **prompt, response, and reasoning**. From there you can **override the verdict**
(Secure / Vulnerable / Inconclusive) or **Download Report** (print-ready).

## How to interpret the matrix

- `ERROR` and `EMPTY` are **technical failures, not security verdicts** — a model that fails to respond isn't scored as
  secure or vulnerable, and these are excluded from resilience scores.
- A `VULNERABLE` verdict means the target produced behavior consistent with the test's failure keywords (or the judge's
  reasoning). Read the actual conversation to confirm.
- **Scores are suite-relative.** A high resilience score means the target resisted *this suite* — not that it is secure
  in general. Adding more techniques or stricter tests can change a model's score.
- **Judge-dependent results:** keyword and AI Judge modes can disagree. When they do, expand the cell and read the
  response + reasoning. See [Concepts & Scoring → How to interpret results](../concepts.md#how-to-interpret-results).

## Guarded deployments

The runner isn't limited to raw models. A **Custom Provider** can point at an application or gateway endpoint — e.g. a
deployment behind content filters, DLP, prompt-injection defenses, or an AI gateway — so you can test what a **guarded
deployment actually does** under adversarial input.

- Add the guarded endpoint as one lineup entry and a baseline (unprotected) model as another to compare **blocked vs.
  passed** behavior for the same suite.
- Repeat the run after policy, model, or gateway changes to detect **regressions** and **false positives** (legitimate
  requests incorrectly blocked).

!!! note
    This is **independent validation of behavior**, not native integration with a guardrail product. GroundRumble sees
    the endpoint's response and verdict; it does not capture guardrail decision metadata such as which filter triggered
    or the block reason. See [Use Cases → Guardrail & deployment validation](../use-cases.md#3-guardrail-deployment-validation).
