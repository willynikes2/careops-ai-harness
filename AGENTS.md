# AGENTS.md — guide for AI coding agents (Claude, Codex, Gemini, …)

CareOps demonstrates *harness engineering*: the model reasons; deterministic code controls what it knows, what it can touch, and what actually happens. Agents changing this repo follow the same idea — the rules below are the harness for you.

## Orient in this order
1. `README.md` — what the app does and the demo path.
2. `CODEMAP.md` — file-by-file layout (regenerate with `npm run codemap` after changing `src/`).
3. `ARCHITECTURE.md` and `SECURITY.md` — the 8-step pipeline and the controls each test protects.
4. `docs/API.md` — the frontend/backend contract. Change it only together with both sides.
5. `docs/TEST_PLAN.md` — the browser + stress plan external testers run.

`docs/superpowers/` holds the original spec and plan as a historical record; current behavior lives in the files above.

## Non-negotiable rules
- **Synthetic data only.** Never add real people, patients, payers, drugs or PHI.
- **The model is never the security boundary.** Authorization lives in `src/policy` and is re-checked in every tool and route. Denials happen before retrieval.
- **The model may only propose** the tools in `src/tools/registry.js`. Never add a tool that runs shell commands, raw SQL, arbitrary HTTP or file access. Every state change waits for a user's **Confirm** and is idempotent.
- **Never trust the client** for identity, role or IDs. Never put secrets in git (`.env` is ignored; `.env.example` holds placeholders only).
- **Tests first** for backend behavior (`node:test`). A change is done only when its new test failed first and `npm test` is fully green.
- **After any change to a prompt, the output contract (`src/harness/context.js`) or validation, re-run the Model Lab** and read the answers — wording changes have shifted model behavior before (see the README's measurement-bug log).
- **No inline scripts or `style=""`** in `web/` (CSP: `script-src 'self'; style-src 'self'`). The front end is vanilla ES modules with no build step.
- Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`). Stay in scope; note unrelated issues instead of fixing them.

## Where things live
| Change | Files | Tests |
|---|---|---|
| Role permissions, intent routing | `src/policy/` | `tests/policy.test.js` |
| Pipeline steps, decision summary, traces | `src/harness/pipeline.js`, `src/audit/` | `tests/harness.test.js` |
| What the model is told | `prompts/*.md`, `src/harness/context.js` | `tests/prompts.test.js`, Model Lab |
| Output checks (schema, citations, IDs, leaks) | `src/harness/validate.js`, `src/harness/leaks.js`, `src/llm/contract.js` | `tests/harness.test.js`, `tests/llm.test.js` |
| Tools, confirm, idempotency | `src/tools/` | `tests/tools.test.js` |
| PTO rules, claim state machine | `src/domain/` | `tests/domain.test.js` |
| Knowledge documents | `seed/kb-docs/` (reload with `scripts/rebuild-kb.sh`) | `tests/retrieval.test.js` |
| Labs | `src/labs/` (eval set: `src/labs/evalSet.js`) | `tests/modelLab.test.js`, `tests/attackLab.test.js` |
| Models and prices | `src/llm/models.js` | `tests/llm.test.js` |

## Commands
```sh
npm ci
npm test                                   # 218 unit/integration tests, no network or keys
node --env-file=.env src/main.js           # local server on :3000 (workflows work without a KB or model key)
node --env-file=.env scripts/load-kb.js    # load seed/kb-docs into a dedicated KB instance
npm run codemap                            # regenerate CODEMAP.md
BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/retry.spec.js   # local-only browser test
BASE_URL=https://careops.shawndemos.com npm run e2e                  # live demo path (resets shared demo data)
```

Unit tests use real SQLite, a fake model provider (`src/llm/fake.js`) and a KB fixture (`tests/fixtures/kb.js`). CI (`.github/workflows/ci.yml`) runs `npm test` and the retry browser test on every push.

## Definition of done
- New behavior has a test that failed before the change; `npm test` passes.
- Prompt/contract changes: Model Lab re-run, answers read, README results updated if they moved.
- `CODEMAP.md` regenerated if `src/` changed; docs updated if user-visible behavior changed.
- No secrets, no real data, no new dependency without a stated reason.
