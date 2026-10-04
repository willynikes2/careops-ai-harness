# CareOps architecture

CareOps puts an assistant beside ordinary PTO and billing workflows. The server supplies authorized context, checks the model's answer, and waits for a separate user confirmation before executing a proposed change.

This document describes the current implementation. The [design spec](docs/superpowers/specs/2026-10-03-careops-design.md) and [implementation plan](docs/superpowers/plans/2026-10-03-careops-demo.md) also contain planned work; the [API contract](docs/API.md) defines the frontend/backend interface.

## Runtime boundaries

```text
web/ (browser)
    | cookie: careops_sid; mutations: X-CSRF-Token
    v
src/app.js (Express)
    +--> auth/session + role checks
    +--> REST workflows ----------------------> SQLite
    +--> assistant harness
           +--> authorized database facts ----> SQLite
           +--> filtered documents -----------> dedicated KB service
           +--> reasoning --------------------> OpenRouter adapter
           +--> validation --> saved proposal
                                  |
                      user's confirm request
                                  v
                      permission + domain checks --> SQLite + audit
```

[src/main.js](src/main.js) loads configuration, opens SQLite, seeds accounts when none exist, and wires the real KB and model adapters. [src/app.js](src/app.js) is a dependency-injected app factory used by both the server and tests. The browser uses native ES modules; there is no bundler or external CDN.

## An assistant turn

The main flow lives in [src/harness/pipeline.js](src/harness/pipeline.js). Each turn has a generated ID and a trace built by [src/harness/trace.js](src/harness/trace.js).

| Stage | What happens | Implementation |
| --- | --- | --- |
| Identity | Resolve the session cookie against database users; ignore client claims about identity or role. | [src/auth/sessions.js](src/auth/sessions.js), [src/http/middleware.js](src/http/middleware.js) |
| Policy | Classify intent deterministically and check the role's permission. A denial stops before state lookup, retrieval, or a model call. | [src/policy/intent.js](src/policy/intent.js), [src/policy/permissions.js](src/policy/permissions.js) |
| State | Read the caller's PTO balance or assigned claims. Resolve dates in the New York calendar; ask about ambiguous dates. Missing/unassigned named claims receive a deterministic response. | [src/harness/pipeline.js](src/harness/pipeline.js), [src/util/dates.js](src/util/dates.js) |
| Retrieval | Filter search hits by permitted collection before fetching documents, then check the fetched collection again. Fence document excerpts as untrusted data. | [src/retrieval/retrieve.js](src/retrieval/retrieve.js), [src/retrieval/kbClient.js](src/retrieval/kbClient.js) |
| Reasoning | Build a prompt from session facts, authorized records, documents, and allowed tool names; call the provider if budget remains. | [src/harness/context.js](src/harness/context.js), [src/llm/openrouter.js](src/llm/openrouter.js), [src/llm/budget.js](src/llm/budget.js) |
| Validation | Parse the response schema; verify citation IDs, recognized claim IDs, the prompt canary, and proposed tool arguments/resources. | [src/llm/contract.js](src/llm/contract.js), [src/harness/validate.js](src/harness/validate.js), [src/tools/registry.js](src/tools/registry.js) |
| Execution | Save an allowed proposal. A later confirmation checks its owner, current role permission, and domain rules before executing it transactionally. | [src/tools/actions.js](src/tools/actions.js) |
| Audit | Save the trace and chat outcome; record denied access, rejected output, provider failures, and confirmed actions. | [src/audit/audit.js](src/audit/audit.js) |

Early exits still record skipped stages. A rejected tool proposal may leave a valid explanatory answer visible while removing the action. Invalid output or unauthorized citations/claim IDs withhold the answer. The validator is not a general fact checker.

## Authority and business actions

[src/tools/registry.js](src/tools/registry.js) exposes exactly `create_pto_request` and `create_billing_followup` to the model. There is no model-callable shell, raw SQL, arbitrary HTTP, file access, role-change, PTO-decision, or claim-transition tool.

The browser confirms a stored action by ID, without resubmitting model arguments. [src/tools/actions.js](src/tools/actions.js) checks ownership and permission, then stores the result in the same transaction as execution. Repeated confirmation returns that result. **Dismiss** only changes the browser display; it does not cancel or delete the server proposal.

The direct forms use [src/routes/pto.js](src/routes/pto.js) and [src/routes/claims.js](src/routes/claims.js). PTO creation, manager decisions, and billing follow-ups use caller/scope-specific idempotency keys through [src/domain/idempotency.js](src/domain/idempotency.js). Claim transitions use a state machine rather than an idempotency key. Creating a follow-up creates a task; it does not automatically transition a claim.

[src/domain/pto.js](src/domain/pto.js) enforces notice, weekday, balance, duplicate-date, and direct-report checks. Pending hours reduce requestable PTO; approval deducts the hours, while denial releases the pending amount. [src/domain/claims.js](src/domain/claims.js) scopes claim access by assignment and enforces allowed status transitions.

## Data, retrieval, and reset

[src/db/schema.sql](src/db/schema.sql) defines users, sessions, PTO balances/requests, patients, claims, billing tasks, pending actions, idempotency results, audit events, traces, provider usage, and lab results. [src/db/index.js](src/db/index.js) enables foreign keys and SQLite WAL mode.

The synthetic business world comes from [seed/data.js](seed/data.js). [src/db/seed.js](src/db/seed.js) restores business records and upserts seeded users. Reset clears pending actions and idempotency results, but preserves sessions, audit events, traces, usage accounting, and lab results. It does not reload the separate KB.

Knowledge documents live in [seed/kb-docs/](seed/kb-docs/). [scripts/load-kb.js](scripts/load-kb.js) imports them into the separate service, skipping titles already present. HR documents are available to all roles; billing documents only to billing users. The KB service receives search queries, while the app filters results before document content reaches the model. The model receives at most three permitted excerpts, truncated to 3,500 characters each.

## Providers and labs

The provider interface is `complete({ model, system, user })`, returning text, usage, latency, and model identity. [src/llm/openrouter.js](src/llm/openrouter.js) implements the live adapter; [src/llm/fake.js](src/llm/fake.js) supplies scripted responses in tests. Model choices come from [src/llm/models.js](src/llm/models.js).

[src/labs/attackLab.js](src/labs/attackLab.js) runs the corpus from [src/labs/attacks.js](src/labs/attacks.js) with baseline and hardened prompts. It distinguishes heuristic checks on raw output from snapshots of roles/business effects and checks for known synthetic patient names in unauthorized answers. These are bounded checks, not a proof that all possible data leakage is detected.

[src/labs/modelLab.js](src/labs/modelLab.js) runs [src/labs/evalSet.js](src/labs/evalSet.js) with a fixed evaluation clock through the same harness. It evaluates response format, sources, record IDs, expected action, and required facts. It never confirms proposals. Provider-unavailable turns set `rows[].infraError`; aggregate `models[].errors` reports them separately, while `total`, pass rates, criterion counts, and cost/latency averages use scored rows. The chosen default is the cheapest model meeting the quality threshold, or the best pass rate if none does.

Both runners retain traces, usage, and any unconfirmed proposals and persist the latest result in SQLite. [src/routes/labs.js](src/routes/labs.js) restricts both viewing and rerunning labs to admins. For measured results, see the Attack Lab / Model Lab pages. No benchmark results are asserted here.

## Frontend and operations

[web/js/api.js](web/js/api.js) manages JSON requests and the in-memory CSRF token. [web/js/app.js](web/js/app.js) builds role-aware navigation; the server independently enforces access. Views render text through [web/js/views/shared.js](web/js/views/shared.js). [web/js/views/trace.js](web/js/views/trace.js) displays the eight-stage record, and [web/js/views/labs.js](web/js/views/labs.js) displays recorded/live results and outage counts.

[src/routes/health.js](src/routes/health.js) provides process health and readiness. Readiness checks the database, KB health, and key configuration; it does not call the model provider. Missing KB/provider configuration can report `degraded` while the database remains available. A KB retrieval failure allows reasoning to continue with database facts; a provider failure returns `ai_unavailable` without creating a business action.

The OpenRouter adapter uses a timeout per attempt and one retry for rate-limit/server responses or non-timeout transport errors. A timeout itself is not retried. The budget checks recorded usage before calls; it does not reserve the cost of concurrent calls. Model Lab uses a fixed clock for the scenario dates but shares the application's budget, which records usage against its real accounting clock. Use provider-side spending limits as well.

[docker-compose.yml](docker-compose.yml) connects CareOps to the existing Traefik edge network and an internal network. The KB container joins only the internal network and publishes no host port. [Dockerfile](Dockerfile) runs the CareOps service as the `node` user. See [README.md](README.md) for local startup and [SECURITY.md](SECURITY.md) for the threat model and remaining production work.
