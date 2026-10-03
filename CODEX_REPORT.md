# Codex delivery report: C1–C3

Branch: `codex/frontend-content`. Scope: the [Codex handoff](docs/CODEX_HANDOFF.md), plus the Model Lab provider-error display requested after the backend contract update. C1 and C2 were already merged before this follow-up; C3 is delivered as documentation drafts for review.

## C1 — Synthetic knowledge documents

Delivered in `84e809c` (`feat: add synthetic HR and billing knowledge documents`), included in merge `0157986`.

Eight documents use `title` and `collection` front matter, numbered sections, and synthetic HR/billing facts:

| Document | Content |
| --- | --- |
| [Employee benefits](seed/kb-docs/employee-benefits-guide.md) | Medical plans, dental, vision, retirement match, and employee assistance. |
| [PTO policy](seed/kb-docs/pto-policy.md) | Accrual, notice, manager approval, balance rules, full-day hours, and carryover. |
| [Remote work policy](seed/kb-docs/remote-work-policy.md) | Eligibility, manager agreement, and device/VPN requirements. |
| [Payer A manual](seed/kb-docs/payer-a-provider-manual.md) | Prior authorization, CO-197, retro-authorization, and filing deadlines. |
| [Payer B manual](seed/kb-docs/payer-b-provider-manual.md) | CO-16, corrected-claim deadlines, and appeals. |
| [Claim denial SOP](seed/kb-docs/claim-denial-sop.md) | Triage, authorization/coding follow-ups, and escalation. |
| [Billing follow-up SOP](seed/kb-docs/billing-followup-sop.md) | Task kinds, notes, and due dates. |
| [Payer A Q4 bulletin](seed/kb-docs/payer-a-bulletin-q4.md) | Ordinary bulletin content plus the exact malicious instruction paragraph required for the injection example. |

The HR documents use `careops-hr`; billing documents use `careops-billing`. In this follow-up, the existing files were inspected without modification: all eight contain the required front matter and fall within the handoff's word-count range.

## C2 — Frontend

Delivered in `9c9db12` (`feat: build role-aware CareOps frontend against API contract`), included in merge `0157986`.

- [Login](web/index.html), [workspace shell](web/app.html), and [shared CSS](web/css/app.css): persistent synthetic-data banner, role identity, laptop layout, labels, and visible focus states.
- [API wrapper](web/js/api.js) and [navigation](web/js/app.js): same-origin JSON, CSRF handling, session-error handling, role-aware views, and mutation feedback.
- [Assistant](web/js/views/assistant.js): suggested prompts, model picker, response states, citations, clarification options, proposal confirmation/dismissal, and per-answer cost/latency.
- [Trace drawer](web/js/views/trace.js): eight-stage timeline and expandable technical details.
- [My PTO](web/js/views/pto.js), [approvals](web/js/views/approvals.js), and [claims](web/js/views/claims.js): form workflows, pending states, server errors, and updates after actions.
- [Audit](web/js/views/audit.js): security filter, trace links, optional auto-refresh, and confirmed reset.
- [Labs](web/js/views/labs.js): recorded results, live reruns, attack details and traces, model criteria/cost/latency, default-model highlighting, sample/date context, and limitations copy.
- [How It Works](web/js/views/how-it-works.js): plain-English harness explanation and an SVG pipeline diagram. Its repository link remains a placeholder.

The frontend uses plain ES modules and same-origin assets. [Shared rendering helpers](web/js/views/shared.js) insert server/model strings as text. There are no inline scripts, inline styles, or HTML event-handler attributes in the two HTML entry points.

### Model Lab follow-up

Delivered in `b0ab092` (`fix: show provider outages in Model Lab results`).

[web/js/views/labs.js](web/js/views/labs.js) now includes an **Errors** column populated from `models[].errors`, with a zero fallback for older stored results. It displays this exact footnote:

> Errors are provider outages (timeouts, out-of-credit) and are excluded from the pass rate.

The pass-count label says **scored answers**, and the sample-size line says **attempts per model**, consistent with excluded provider errors. The existing backend owns `rows[].infraError` classification and aggregate scoring; no backend or API contract changes were needed. For measured results, see the Attack Lab / Model Lab pages.

## C3 — Documentation drafts

Delivered in `b4c2304` (`docs: draft CareOps overview architecture security and demo accounts`).

| File | Delivered content |
| --- | --- |
| [README.md](README.md) | Purpose, live URL placeholder, accounts, six-step walkthrough, ASCII architecture, build process, local setup, tests, and limitations. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Actual harness flow, two model-proposable tools, confirmation, REST workflows, data/reset behavior, retrieval, provider interface, lab scoring, and deployment boundaries. |
| [SECURITY.md](SECURITY.md) | Threat/control/source/test mapping, trust boundaries, audit access, coverage gaps, and production limitations. |
| [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md) | Jordan, Priya, Marcus, Dana, and Sam; roles, starting PTO, direct-report relationships, shared password, switching, and reset behavior. |

The live URL remains `https://DEMO_URL`; the demo password is `careops-demo`. All benchmark references direct readers to the lab pages. No live lab results or deployment validation are claimed.

The drafts distinguish implementation from the earlier plan: manager approvals and claim transitions use REST routes, reset does not reload the KB, readiness does not probe the live provider, and proposal dismissal is local to the browser. The code also shows that usage accounting is based on completed calls and that Model Lab uses a fixed accounting clock; these limitations are documented.

## Verification in this follow-up

- Verified 71 unique local path references across the four C3 documents. Used literal `grep -nF` searches to verify all 22 cited test-title references against their test declarations, after reading the source and tests.
- `node --check web/js/views/labs.js` and `git diff --check` passed.
- The eight non-listening test files passed: [database](tests/db.test.js), [domain](tests/domain.test.js), [LLM](tests/llm.test.js), [policy](tests/policy.test.js), [prompts](tests/prompts.test.js), [retrieval](tests/retrieval.test.js), [seed](tests/seed.test.js), and [tools](tests/tools.test.js). The runner reported results at file level; this is not a full-suite test-case count.
- The two targeted existing [Model Lab tests](tests/modelLab.test.js), `provider outages are infrastructure errors, not model failures` and `pass rate excludes infrastructure errors and reports them separately`, passed.
- `npm test` was attempted. After resolving missing dependencies, it reported eight passing files and six failing API-dependent files. A direct call through [tests/helpers.js](tests/helpers.js) identified `listen EPERM: operation not permitted 0.0.0.0`: this execution sandbox prohibits the local listener. Full-suite green status remains unverified here.
- A temporary Playwright render check was attempted, but Chromium exited during startup with `Operation not permitted` before rendering. No browser-check success is claimed.

The dependency lockfile matched the adjacent main checkout, so its installed dependencies were temporarily linked for verification. That link was removed after checks; package files were not changed. Temporary verification scripts and logs were kept outside the repository.

## Handoff state

Only the Model Lab view and the five root documentation files changed in this follow-up. No backend, tests, scripts, seed data/documents, prompts, package files, or Docker configuration were edited. All requested changes are committed locally; nothing was pushed.

The checkout still lacks the generated codemap, its generator, and the planned Playwright demo suite. Full API-suite and browser verification need an environment that permits local sockets and Chromium. Deployment owners still need to replace the live URL/repository placeholders and review the documentation drafts before publication.
