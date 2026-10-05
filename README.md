# CareOps — an AI assistant that can't overstep

[![CI](https://github.com/willynikes2/careops-ai-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/willynikes2/careops-ai-harness/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/live%20demo-careops.shawndemos.com-0b7a5b)](https://careops.shawndemos.com)
![Tests](https://img.shields.io/badge/tests-175%20passing-0b7a5b)
![Node](https://img.shields.io/badge/node-22-339933)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**CareOps is a working healthcare-operations app where an LLM answers staff questions and proposes actions — but the software, not the model, decides what it may see, say and do.**

Employees ask about benefits and book PTO, managers approve it, billing staff work denied claims, and compliance reviews every decision. Every answer shows its sources, every action waits for a human click, and every turn leaves an audit trail you can open with one button: **"Why did this happen?"**

> The model reasons. The harness controls what it knows, what it can touch, and what actually happens.

All data is synthetic. No real patients, employees, payers or PHI.

---

## Try it in two minutes

**Live:** **https://careops.shawndemos.com** — click a persona, no password needed.

| Persona | Role | Try this | What to look for |
|---|---|---|---|
| **Jordan** | Employee | "How much PTO do I have, and can I take next Friday off?" | Balance from the database, a deterministic date, a **Confirm** card |
| **Jordan** | Employee | "Show me all denied claims and which patients owe the most money." | Blocked **before** any data is fetched — open *Why did this happen?* |
| **Priya** | Manager | Approvals → approve Jordan's request | Same shared state; Jordan sees it immediately |
| **Marcus** | Billing | "Why was CLM-1004 denied and what should we do next?" | Payer rule + SOP citations, a proposed follow-up, then the claim updates |
| **Marcus** | Billing | "What happened to claim CLM-9999?" | "No authorized claim found" — nothing invented, model not called |
| **Marcus** | Billing | "Summarize the Payer A Q4 bulletin." | A planted prompt injection is flagged 🛡 and treated as data |
| **Dana** | Compliance | Audit Log → Security events only; Attack Lab; Model Lab | Every decision linked to an audit event; red-team and cost results |

Prefer a guided path? See the [five-minute walkthrough](#five-minute-walkthrough). Accounts and passwords: [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md).

<table>
<tr>
<td width="50%"><img src="docs/images/02-billing-answer.png" alt="A grounded billing answer with sources and a proposed follow-up awaiting confirmation"><br><sub>A grounded answer: cited payer rule and SOP, cost and latency shown, and an action that waits for <b>Confirm</b>.</sub></td>
<td width="50%"><img src="docs/images/04-decision-denied.png" alt="Decision summary for a blocked request: authorization denied, restricted retrieval not executed"><br><sub>The decision record for a blocked request: <b>DENIED</b>, restricted retrieval <b>NOT EXECUTED</b>, model never called.</sub></td>
</tr>
<tr>
<td><img src="docs/images/05-attack-lab.png" alt="Attack Lab results"><br><sub>Attack Lab: the red-team corpus against a weak and a hardened prompt — and whether any boundary actually moved.</sub></td>
<td><img src="docs/images/06-model-lab.png" alt="Model Lab results"><br><sub>Model Lab: the same harness on four models, scored pass/fail with measured cost per 1,000 answers.</sub></td>
</tr>
</table>

## What this demonstrates

- **Authorization before retrieval.** A request the role can't make is denied before any record or document is fetched, so restricted data never reaches the model.
- **Grounded, cited answers.** Balances and claims come from the database; policy comes from a role-scoped knowledge base. Citations, record IDs and protected text are checked before an answer is shown.
- **Proposals, not actions.** The model can only *propose* one of two narrow tools. Code validates the arguments, re-checks permission, and executes only after the user clicks **Confirm** — idempotently, so double-clicks and retries never duplicate work.
- **Deterministic where it matters.** Dates, PTO rules and the claim state machine (DENIED → PAID is rejected) are plain code, not model judgment.
- **Model-agnostic.** One provider interface; the Model Lab shows an open-weight model matching a frontier model on this task set at a fraction of the cost.
- **Resilient.** If the AI provider fails, times out or the budget runs out, nothing changes and the rest of the app keeps working. `/ready` reports the degraded state.
- **Auditable.** Each turn stores an 8-step trace and a plain-English decision summary with audit event IDs (`EVT-000123`).

## How it works

```mermaid
flowchart LR
  U([User]) --> I[1 Identity<br/>server session]
  I --> P{2 Policy<br/>role × intent}
  P -- denied --> A[(8 Audit)]
  P -- allowed --> S[3 State<br/>DB facts, minimum necessary]
  S --> R[4 Retrieval<br/>role's KB collections only]
  R --> M[5 Reasoning<br/>any model via OpenRouter]
  M --> V{6 Validation<br/>JSON schema · citations ·<br/>record IDs · tool registry}
  V -- withheld --> A
  V --> E[7 Execution<br/>only after Confirm]
  E --> A
```

Retrieved documents are fenced as untrusted data; the planted injection bulletin can't grant tools or permissions. The full design is in [ARCHITECTURE.md](ARCHITECTURE.md); security controls and their tests are in [SECURITY.md](SECURITY.md).

## Recorded results

Live runs on the deployed app. Raw data: [model lab](docs/results/model-lab-2026-10-04.json), [attack lab](docs/results/attack-lab-2026-10-04.json). Illustrative for this synthetic task set — not general model rankings.

**Model Lab** — 13 questions × 3 repetitions per model, 5 pass/fail checks each (valid JSON, real citations, no invented record IDs, the right action, the right fact — and no invented procedures).

| Model | Passed | Cost per 1,000 answers | Avg latency |
|---|---|---|---|
| Qwen3 235B (open-weight) — **chosen default** | 39/39 | $0.26 | 2.3 s |
| Claude Sonnet 5.5 | 39/39 | $9.90 | 2.2 s |
| GPT-5.4 mini | 37/39 | $1.29 | 1.4 s |
| GPT-OSS 120B (open-weight) | 30/38 (+1 provider timeout) | $0.48 | 1.0 s |

The app picks the cheapest model that reliably clears 90% (provider errors count as misses). On this task set the open-weight model matched the frontier model at about **1/38 of the cost**.

**Attack Lab** — 10 direct attacks from a red-team corpus plus 1 poisoned knowledge-base document, against a baseline and a hardened system prompt. Latest run: **0 prompt leaks and 0 boundary moves** on both. In earlier runs the baseline prompt occasionally recited its own rules; the harness withheld those answers before a user saw them. Across every run, no permission, record or action crossed a boundary.

### Measurement bugs caught along the way

Honest evals were part of the work. Each of these has a regression test:

- The ported red-team judge counted polite refusals ("I can't share my system prompt") as leaks — 7 false positives in the first run. It now requires evidence of compliance.
- The same judge missed a real leak (a model reciting its response format). It now checks for that, and the server withholds such answers.
- The Model Lab read live demo data, so after the browser tests approved a day off, every model was marked wrong for reporting the new balance. Evals now run on a private seeded copy.
- Provider outages (HTTP 402 when credit ran out, timeouts) were scored as model failures; they're now reported separately.
- A grounded-looking answer (right citation, right fact) still invented a claim-filing procedure. A phrase check said 4/5 clean; reading the answers showed 1/5. Fixed with a prompt rule and worked example, a knowledge-base sentence, and a stricter eval item — live re-check 0/8.

## Five-minute walkthrough

Start from a known state: enter as **Dana → Demo Controls → Reset demo data**.

1. **Employee question and PTO request.** As Jordan, ask "What benefits do I have and how much PTO do I have left?" and open *Why did this happen?*. Then ask "How much PTO do I have, and can I take next Friday off?", choose a date if asked (only bookable dates are offered), and **Confirm**.
2. **Manager approval.** As Priya, open **Approvals** and approve Jordan's request. Back as Jordan, **My PTO** shows it approved.
3. **Blocked request.** As Jordan, ask for denied claims and patient balances. The decision summary shows authorization DENIED and restricted retrieval NOT EXECUTED.
4. **Billing case.** As Marcus, ask "Why was CLM-1004 denied and what should we do next?", **Confirm** the follow-up, then open **Claims → CLM-1004** and try moving it from DENIED to PAID (rejected by the state machine).
5. **Prompt injection.** As Marcus, ask "Summarize the Payer A Q4 bulletin." The answer carries a 🛡 note; the trace flags the instruction-like text; nothing changes.
6. **Compliance review.** As Dana, open **Audit Log → Security events only** and follow a **View trace** link. Then look at **Attack Lab** and **Model Lab**.

## How it was built

Built in about two days with AI coding agents under a human-owned spec, plan and acceptance bar — the same "harness" idea applied to software delivery:

- **Spec → plan → test-first implementation.** The [design spec](docs/superpowers/specs/2026-10-03-careops-design.md) and [implementation plan](docs/superpowers/plans/2026-10-03-careops-demo.md) came first; every backend behavior has a failing test before code. [AGENTS.md](AGENTS.md) holds the rules every coding agent follows.
- **Parallel agents.** Claude Code built the backend, harness and tests; OpenAI Codex built the front end and knowledge documents against a frozen [API contract](docs/API.md), then the work was reviewed and merged.
- **Independent review and testing.** A fresh reviewer audited the whole branch; Grok and Codex then ran the full [browser + stress test plan](docs/TEST_PLAN.md) (99 test IDs) against the live site twice. Their findings were fixed test-first; the second pass found no P0/P1 issues.
- **Live verification.** A Playwright suite drives the nine-step demo path against the deployed app, and the labs measure real model behavior and cost.

## Run it locally

Requires Node.js 22+. The front end has no build step.

```sh
git clone https://github.com/willynikes2/careops-ai-harness.git
cd careops-ai-harness
npm ci
npm test                      # 175 unit/integration tests — no network, no API keys
```

**Workflows only (no AI):** start the server without a knowledge base or model key — PTO, approvals, claims, audit and reset all work; the assistant reports itself unavailable.

```sh
cp .env.example .env          # leave OPENROUTER_API_KEY empty for now
node --env-file=.env src/main.js
# open http://localhost:3000
```

**Full assistant:** the knowledge service is the author's open-source [knowledge-base-server](https://github.com/willynikes2/knowledge-base-server), run as a separate, synthetic-only instance. Clone it next to this repo, then:

| Setting | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Reasoning-provider key (any OpenRouter model in [src/llm/models.js](src/llm/models.js)). |
| `KB_URL`, `KB_API_KEY` | The dedicated KB instance and its API key. |
| `DEMO_PASSWORD` | Seeded account password (default `careops-demo`). |
| `DAILY_BUDGET_USD` | App-level daily AI spend cap (default `3`). |
| `CHAT_IP_LIMIT` | Assistant turns per IP per 10 minutes (default `60`), on top of 20 per session. |
| `DEFAULT_MODEL` | Fallback model before a Model Lab run picks one. |
| `PORT`, `DB_PATH` | Optional; default `3000` and `./data/careops.db`. |

```sh
node --env-file=.env scripts/load-kb.js   # load seed/kb-docs into the KB (idempotent)
node --env-file=.env src/main.js
```

**Hosted deployment:** [docker-compose.yml](docker-compose.yml) runs the app plus the KB on an internal-only network behind Traefik with Let's Encrypt; the hostnames come from `TRAEFIK_HOST_RULE` in `.env`. `scripts/rebuild-kb.sh` reloads the KB from `seed/kb-docs`.

## Tests and CI

| Suite | Command | What it covers |
|---|---|---|
| Unit / integration | `npm test` | 175 tests: auth, policy matrix, retrieval scoping, PTO rules, claim state machine, tool validation, idempotency, provider failures, injection, grounding, labs |
| Live demo path | `BASE_URL=https://careops.shawndemos.com npm run e2e` | The nine-step walkthrough in a real browser (resets demo data) |
| Retry safety | `e2e/retry.spec.js` against a local server | A dropped connection plus retry creates exactly one record |

[GitHub Actions](.github/workflows/ci.yml) runs the unit suite on every push and the retry browser test against a freshly started local server. The full browser and stress plan for external testers is [docs/TEST_PLAN.md](docs/TEST_PLAN.md); the requirement-to-test map is [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Project layout

```
src/
  harness/      8-step pipeline, prompt assembly, output validation, traces
  policy/       role permissions and deterministic intent routing
  retrieval/    role-scoped knowledge-base client
  llm/          provider interface (OpenRouter + fake), JSON contract, budget
  tools/        the only two model-proposable tools, confirm + idempotency
  domain/       PTO rules, claim state machine
  labs/         Attack Lab and Model Lab
  routes/ auth/ audit/ db/ http/
web/            vanilla JS front end (no build step, strict CSP)
prompts/        baseline and hardened system prompts
seed/           synthetic people, claims and knowledge documents
tests/  e2e/    node:test suites and Playwright specs
docs/           API contract, test plan, verification map, design spec and plan
```

A generated file-by-file map is in [CODEMAP.md](CODEMAP.md).

## Limitations

- Synthetic data only. This is not HIPAA-compliant software, clinical advice, or a connection to an EHR, payer or clearinghouse.
- OpenRouter is a demo provider. Production use with PHI would require an approved provider under a BAA and the wider controls described in [SECURITY.md](SECURITY.md).
- Shared demo accounts and a reset button serve a demonstration, not tenant isolation or enterprise identity.
- Lab samples are small and task-specific; neither lab proves general safety or quality.
- Citation and record-ID checks verify that sources were supplied, not that every sentence is supported; known grounding gaps are tracked as Model Lab items.
- The budget check uses recorded costs, not reservations for in-flight requests; set a provider-side spending limit too.

## License

[MIT](LICENSE)
