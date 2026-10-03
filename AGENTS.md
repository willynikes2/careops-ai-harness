# AGENTS.md — rules for every coding agent in this repo (Claude, Codex, Gemini)

This repo is a hiring demo of *harness engineering*: the model reasons, the harness controls knowledge, authority and execution. Agents building it follow the same idea.

## Read first
1. `docs/superpowers/specs/2026-10-03-careops-design.md` — what we are building and why.
2. `docs/API.md` — the frozen frontend/backend contract.
3. `docs/superpowers/plans/2026-10-03-careops-demo.md` — task list and file ownership.
4. `CODEMAP.md` — current layout (regenerate with `npm run codemap`).

## Non-negotiable rules
- Synthetic data only. Never add real people, patients, payers, drugs, or PHI.
- The model is never the security boundary. Authorization lives in `src/policy` and is re-checked in every tool.
- Never add a tool that runs shell commands, raw SQL, arbitrary HTTP, or file access.
- Never trust the client for identity or role. Never put secrets in git.
- Tests first for backend behavior (`npm test`, `node:test`). A task is done only when its tests pass and `npm test` is fully green.
- Stay inside your ownership boundary (see the plan). Change `docs/API.md` only together with both sides.
- Small commits, conventional messages (`feat:`, `fix:`, `test:`, `docs:`).
- No inline scripts or inline `style=""` in `web/` (CSP: `script-src 'self'; style-src 'self'`).

## Commands
- `npm test` — unit + integration tests (no network).
- `npm start` — local server on :3000 (needs `.env`).
- `npm run e2e` — Playwright demo path (needs `BASE_URL`).
