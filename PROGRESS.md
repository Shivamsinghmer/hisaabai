# Hisaab AI — Progress Log

> Living status of the build. Update this file at the end of every work session.
> Spec: [`CLAUDE.md`](CLAUDE.md) · Plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)

**Current phase:** Phase 0 done (pending first commit + GitHub repo) → next: Phase 1 — Data, seed, onboarding
**Last updated:** 2026-10-31

---

## Done

| Date | What | Notes |
|---|---|---|
| 2026-10-30 | `CLAUDE.md` added | Full product + build spec |
| 2026-10-31 | `docs/BUILD_PLAN.md` written | Stack locked: pnpm, Fastify, Drizzle, Next.js + Tailwind, BullMQ, LangGraph.js, Vitest |
| 2026-10-31 | Infra decision: Neon Postgres + Upstash Redis from day one | No local Docker DB |
| 2026-10-31 | Neon CLI installed (v8.15.1), signed in, project linked | Project `hisaabai` (`curly-star-48528095`); `neon init` + `neon deploy` done; services: Postgres + Neon Auth |
| 2026-10-31 | pnpm workspace skeleton | `apps/api` (Fastify 5 + Drizzle on `pg` pool), `apps/web` (Next.js 16 + Tailwind v4 + `@neon/auth`), `packages/shared` |
| 2026-10-31 | Neon Auth wired (managed Better Auth) | Web: `createNeonAuth` server, `/api/auth/[...path]` proxy, `proxy.ts` route protection. API: verifies Neon Auth EdDSA JWTs via JWKS (`jose`) |
| 2026-10-31 | **Email OTP at sign-up** | Branch config: method `otp`, verification required, auto sign-in after verify. Sign-in page requests the code, has a code step + resend |
| 2026-10-31 | **Auth verified end to end** | Real inbox received the code → verified → session → `/me` fetched a Neon Auth JWT → API verified it and returned 200 with the user row from `neon_auth.user` |
| 2026-10-31 | Neon branches `dev` + `test` | Both from `production`, never expire (`neon.ts` policy). Auth + email-OTP config copied. Local `.env.local` now points at **`dev`** |
| 2026-10-31 | **Upstash Redis wired** | API derives the TLS `rediss://` URL from `UPSTASH_REDIS_REST_URL` + token (or uses `REDIS_URL`). `/health` → `{postgres: ok, redis: ok, 25 ms}` |
| 2026-10-31 | `packages/shared` | Money helpers (`rupeesToPaise`, `paiseToRupees`, `formatPaise` with en-IN grouping) + `apiError` (§11 error shape). 8 Vitest tests pass; caught and fixed "₹120.5" → "₹120.50" |
| 2026-10-31 | Tooling | `git init` (branch `main`, nothing committed yet), ESLint 9 flat config (+ Next rules for web), Prettier, `.editorconfig`, `.nvmrc` (24), `.env.example`, GitHub Actions CI (`.github/workflows/ci.yml`) |
| 2026-10-31 | All checks green locally | `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `npm run build` |

## In progress

- Nothing running. Phase 0 ends with the first commit.

## Next up

1. First commit; create the GitHub repo and add CI secrets (see below).
2. Phase 1 — Drizzle schema (§10) + migrations on Neon `dev`, merchant scoping helpers, seed (`pnpm seed`, `pnpm seed:demo`), onboarding (language → shop name → consent) after email sign-up.
3. Hindi number parser + dates in `packages/shared` (Person C, Phase 1).

### CI secrets to add in GitHub (Settings → Secrets → Actions)

| Secret | Value |
|---|---|
| `TEST_NEON_AUTH_BASE_URL` | `neon neon-auth status --branch test` → Base URL |
| `TEST_NEON_AUTH_COOKIE_SECRET` | any 32+ char random string |

## Backlog (by phase, from BUILD_PLAN)

- [x] Phase 0 — Repo and tooling
- [ ] Phase 1 — Data, seed, auth (auth done; schema, seed, onboarding left)
- [ ] Phase 2 — Voice layer + intent router
- [ ] Phase 3 — Voice capture + ledger/customer screens
- [ ] Phase 4 — Khata photo capture
- [ ] Phase 5 — Collect: reminders + mock payments + jobs
- [ ] Phase 6 — Simulated AI call + promises
- [ ] Phase 7 — Credit: score, offer, teach-back
- [ ] Phase 8 — Polish modules (Ask, brief, UPI mock, Udhaar svc, settings, PWA)
- [ ] Phase 9 — Deploy and demo hardening

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-31 | Fastify over Express | zod type provider, easy SSE, fast cold start |
| 2026-10-31 | Drizzle over Prisma | SQL-first migrations matching §10, light runtime |
| 2026-10-31 | `pg` (node-postgres) pool, not postgres.js | Neon skill guidance for a long-running Node server; pooled URL for the app, unpooled for migrations |
| 2026-10-31 | Neon + Upstash in dev too | Same engines everywhere, no Docker |
| 2026-10-31 | **Email OTP at sign-up (Neon managed Auth)**; phone OTP dropped | Team decision. Avoids the managed phone-OTP limits (no phone-first sign-up, needs our own SMS provider). CLAUDE.md F0 and §11 updated. Shared Neon SMTP is dev-only; production needs custom SMTP |
| 2026-10-31 | Neon branches: `production` (demo), `dev` (local work), `test` (CI) | Each has its own Auth URL and isolated users; `dev`/`test` were copied from `production` on 2026-10-31 |
| 2026-10-31 | ESLint 9 (not 10) | `eslint-config-next` 16 depends on React/import plugins not yet on ESLint 10 |
| 2026-10-31 | ioredis 5 (not 6) | Proven with BullMQ; v6 is a fresh major |
| 2026-10-31 | `packages/shared` compiles to `dist` | API runs on plain Node; `pnpm dev`/`typecheck` build it first |

## Gotchas learned

- **Re-signing up with an existing email** returns a placeholder user (`token: null`, random id, nothing in the DB) and sends **no** email; this hides whether an email is registered. Use **Login** for existing emails; an unverified account gets a fresh code there.
- Neon managed Auth with `send_verification_email_on_sign_up: true` + method `otp` did **not** send a code on sign-up. `emailOtp.sendVerificationOtp({ email, type: "email-verification" })` does (5-minute expiry). The sign-in page calls it after sign-up and after an `EMAIL_NOT_VERIFIED` sign-in.
- **Neon Auth is per branch.** Users, sessions, Auth URL and settings live on each branch. A session from `production` doesn't carry over; switching `.env.local` to another branch means signing in there.
- On Windows, stopping the background `npm run start` shell leaves the Node servers on ports 3000/4000. Kill the `node.exe` processes running `scripts/next.mjs` / `dist/index.js` before restarting.
- `@neon/auth` 0.8.2: the server `auth.token()` exists at runtime (`GET /token`) but is typed `unknown`; wrapped as `getApiToken()` in `apps/web/lib/auth/server.ts`.
- Next.js build workers don't see env loaded in `next.config.ts`, and `node --env-file` breaks Next workers (forwarded via `NODE_OPTIONS`). `apps/web/scripts/next.mjs` loads `../../.env.local` with `process.loadEnvFile`, then runs the Next CLI. The web build **needs** `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (hence the CI secrets).
- Upstash: BullMQ/ioredis need the TCP endpoint. Same host as the REST URL, port 6379, user `default`, password = REST token.
- `pg` warns that `sslmode=require` will change meaning in pg v9; switch the URLs to `sslmode=verify-full` at some point.
- `neon init` also installed Neon skills/MCP for other agents (Gemini, Cline, Copilot, OpenCode) and minted an account-wide Neon API key (id 3484243) for MCP. Revoke with `neon api-keys revoke 3484243` if not wanted.
- `.env.local` has `SARVAM_AI`; the spec and `.env.example` call it `SARVAM_API_KEY`. Rename before Phase 2.

## Open questions

See `docs/BUILD_PLAN.md` §6. Most urgent:
- Custom SMTP provider for production auth emails
- Project region is London (console default); Singapore is closer to India and needs a new project
- Demo figures in §22 (₹450 vs ₹570; EMI ₹9,100)
- Move repo out of OneDrive?
- Hackathon dates and team A/B/C split

## Blockers

- None.

## How to run

```bash
pnpm install
npm run build
npm run start
```

API on http://localhost:4000 (`/health`, `/me`), web on http://localhost:3000. Env comes from the repo-root `.env.local`; it currently points at the Neon `dev` branch. `neon checkout <branch>` switches branch and re-pulls the Neon variables (other keys in `.env.local` are kept).

Checks: `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test`.
