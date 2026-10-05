# Verification map

```sh
npm test
npm run codemap
npx playwright install chromium
BASE_URL=https://careops.shawndemos.com npm run e2e
```

The existing `node:test` suite uses real SQLite, a [fake model provider](../src/llm/fake.js), and a [KB fixture](../tests/fixtures/kb.js). API tests start local HTTP listeners through [tests/helpers.js](../tests/helpers.js); they need permission to bind local sockets, but no external service or provider credentials.

| Behavior | Tests to read |
| --- | --- |
| Identity, CSRF, response headers | [tests/auth.test.js](../tests/auth.test.js) |
| Role policy and document scoping | [tests/policy.test.js](../tests/policy.test.js), [tests/retrieval.test.js](../tests/retrieval.test.js) |
| PTO, claim transitions, duplicate prevention | [tests/domain.test.js](../tests/domain.test.js), [tests/tools.test.js](../tests/tools.test.js), [tests/routes.test.js](../tests/routes.test.js) |
| Grounding, rejected outputs, injection, provider failures | [tests/harness.test.js](../tests/harness.test.js) |
| Lab scoring and provider-error separation | [tests/attackLab.test.js](../tests/attackLab.test.js), [tests/modelLab.test.js](../tests/modelLab.test.js) |

The browser suite resets shared synthetic records, so run it when other viewers are not demonstrating the app. Its checks use the live KB and model provider; the unit/API suite uses controlled fixtures. Regenerate the source map after changing `src/`. See [SECURITY.md](../SECURITY.md) for exact security regression test names.

The acceptance mapping below groups the release (P0) gates from the original requirements by their visible behavior. The [design spec](superpowers/specs/2026-10-03-careops-design.md) records the public scope; this table identifies the code and checks behind it, without treating test presence as proof that a particular deployment is healthy.

| P0 gate | Automated evidence / inspection |
| --- | --- |
| Login/logout, four primary roles, session identity | [auth tests](../tests/auth.test.js), [policy matrix](../tests/policy.test.js), browser walkthrough account switching |
| Employee HR retrieval and no billing exposure | [retrieval tests](../tests/retrieval.test.js), [harness tests](../tests/harness.test.js): denial before retrieval and classifier-independent scoping |
| PTO balance, deterministic dates, employee request, manager approval, shared status | [domain tests](../tests/domain.test.js), [route tests](../tests/routes.test.js): `manager approves; employee sees it; audit shows both`; browser walkthrough |
| Grounded billing answer, citations, confirmed follow-up, unknown claim | [harness tests](../tests/harness.test.js): CLM-1004 and CLM-9999 cases; [route tests](../tests/routes.test.js): claim access and invalid transition; browser walkthrough |
| Indirect prompt injection, invented tools, foreign/fabricated IDs, strict schemas | [harness tests](../tests/harness.test.js), [tool tests](../tests/tools.test.js), [contract tests](../tests/llm.test.js), [Attack Lab tests](../tests/attackLab.test.js) |
| Linked audit/security events and traces | [harness tests](../tests/harness.test.js), [route tests](../tests/routes.test.js), browser compliance step |
| Provider errors cause no business mutation; ordinary forms remain available | [harness tests](../tests/harness.test.js): provider failure, KB outage, budget exhaustion; [route tests](../tests/routes.test.js) exercise forms independently |
| Duplicate prevention, shared database state, repeatable reset | [tool tests](../tests/tools.test.js), [domain tests](../tests/domain.test.js), [seed tests](../tests/seed.test.js), [route tests](../tests/routes.test.js); repeated browser walkthrough |
| Navigation, usable controls, visible synthetic banner, no uncaught browser errors | Browser walkthrough in [e2e/](../e2e/), HTML/JS in [web/](../web/) |
| Health/readiness and controlled API errors | [ready tests](../tests/ready.test.js), [auth tests](../tests/auth.test.js), [route tests](../tests/routes.test.js); live `/health` and `/ready` checks |
| Synthetic-only data, no embedded secrets, server-side permissions, narrow tools | [seed/data.js](../seed/data.js), [seed/kb-docs/](../seed/kb-docs/), secret scan of tracked files, [policy tests](../tests/policy.test.js), [tool tests](../tests/tools.test.js), [SECURITY.md](../SECURITY.md) |
| Reviewer docs, architecture, source map, accounts, setup, walkthrough, limits | The [README](../README.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [CODEMAP.md](../CODEMAP.md), [DEMO_ACCOUNTS.md](../DEMO_ACCOUNTS.md), [SECURITY.md](../SECURITY.md), [.env.example](../.env.example) |
