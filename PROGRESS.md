# Hisaab AI — Progress Log

> Living status of the build. Update this file at the end of every work session.
> Spec: [`CLAUDE.md`](CLAUDE.md) · Plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)

**Current phase:** Phase 1 done → next: Phase 2 — Voice layer + intent router (needs `GROQ_API_KEY`)
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
| 2026-10-31 | Tooling | `git init` (branch `main`), ESLint 9 flat config (+ Next rules for web), Prettier, `.editorconfig`, `.nvmrc` (24), `.env.example`, GitHub Actions CI (`.github/workflows/ci.yml`) |
| 2026-10-31 | `.env.local` completed | All `.env.example` keys present; existing secrets kept; `SARVAM_AI` renamed to `SARVAM_API_KEY`. Sarvam key checked with one TTS call (200). WhatsApp + Paytm vars left empty on purpose |
| 2026-10-31 | All checks green locally | `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `npm run build` |
| 2026-10-31 | Phase 0 committed | `4f01489`, `447a03a` |
| 2026-10-31 | **Phase 1: shared parsers** | `parseAmountRupees` (digits, Hindi number words 1–99, sau/hazaar/lakh, dedh/dhai/sawa/saade/paune; skips quantities like "do kilo" and the verb "hata do") and `resolveDate` (aaj/kal/parso by direction, "5 din mein", weekdays, agle hafte/mahine, "12/9", "12 Sep"; IST). 68 shared tests |
| 2026-10-31 | **Phase 1: schema + migrations** | Drizzle schema for all §10 tables + `customer_balances` view (FIFO earliest due). Migrations `0000`, `0001` applied to Neon `dev` and `test` via `src/db/migrate.ts` (direct URL) |
| 2026-10-31 | **Phase 1: API** | `buildApp()` factory; auth guards `authenticate` / `requireMerchant` / `requireOwner` (merchantId always from the membership, never the body); §11 error handler; `GET /me`, `POST /merchants` (owner + consent in one transaction), `PATCH /me/settings` (owner only). Shared zod contracts in `packages/shared/src/schemas/merchant.ts` |
| 2026-10-31 | **Phase 1: integration tests** | 12 tests on the Neon `test` branch (stub token verifier, real DB): 401s, onboarding, 409 on second shop, consent required, unknown fields rejected, owner settings, **helper → 403 OWNER_ONLY**, ONBOARDING_REQUIRED, cross-shop isolation, validation. Refuses to run unless `NEON_BRANCH=test`; cleans up after itself |
| 2026-10-31 | **Phase 1: seed** | `pnpm seed` (50 merchants × 20–60 customers × 6 months, 5 cities, 30/50/20 health mix, festival bumps) and `pnpm seed:demo` (resettable). Deterministic ids; deletes only its own rows. On `dev`: 51 merchants, ~2,100 customers, ~83k entries, promises 57% kept / 35% broken / 8% open. Demo shop: walk-in ₹61–70k/month, 60% UPI; **Gupta ji ₹330** (overdue), Verma ji ₹600, Sharma ji ₹750, Khan sahab ₹1,200 (broken promise) |
| 2026-10-31 | Onboarding verified by hand on `dev` | Real sign-in → language (Hinglish) → shop → consent → Home; DB has the shop, owner membership linked to the Neon Auth user, and the `data_storage` consent |
| 2026-10-31 | **Phase 1: web** | Server-side `lib/api.ts` (mints a JWT per call), `lib/strings.ts` (Hinglish + English), `AppShell` (bottom nav, centre mic slot), Home (redirects to onboarding without a shop), onboarding: language → shop → consent → Home (4 screens incl. sign-in). Signed-out `/`, `/me`, `/onboarding` → sign-in |

## In progress

- Nothing in progress.

## Next up

1. Create the GitHub repo and add CI secrets (see below).
2. Phase 2 — Sarvam STT/TTS wrappers with cache/timeout/retry, Groq client (needs `GROQ_API_KEY`), prompt loader, intent router, `POST /voice/command`, MicButton.
3. Set `DEMO_OWNER_EMAIL` and run `pnpm seed:demo` to log in as Ramesh (Sharma General Store).

### CI secrets to add in GitHub (Settings → Secrets → Actions)

| Secret | Value |
|---|---|
| `TEST_DATABASE_URL` | `neon connection-string test --pooled` |
| `TEST_DATABASE_URL_UNPOOLED` | `neon connection-string test` |
| `TEST_NEON_AUTH_BASE_URL` | `neon neon-auth status --branch test` → Base URL |
| `TEST_NEON_AUTH_JWKS_URL` | `neon neon-auth status --branch test` → JWKS URL |
| `TEST_NEON_AUTH_COOKIE_SECRET` | any 32+ char random string |

## Backlog (by phase, from BUILD_PLAN)

- [x] Phase 0 — Repo and tooling
- [x] Phase 1 — Data, seed, auth
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
| 2026-10-31 | Sarvam models: STT `saaras:v4`, TTS `bulbul:v4-flash`, voice `shubh_enhi_ads` | Latest recommended per Sarvam docs; `enhi` = English–Hindi code-mixed persona, fits Hinglish replies. v4-flash voice IDs are `<name>_<lang>_<style>`; v3 short names (`shubh`) don't work on it |
| 2026-10-31 | Groq text model `openai/gpt-oss-120b` | Production model in Groq's current catalog |
| 2026-10-31 | Demo: Gupta ji seeded at **₹330** → voice +₹120 → **₹450** (AI call quote) | Team decision; resolves the §22 vs F1.2 mismatch. CLAUDE.md F1.2 + §15 updated |
| 2026-10-31 | Schema deviations from §10 (listed in the CLAUDE.md §10 note) | Email login (auth_user_id, optional phone), disputes.merchant_id, FIFO earliest_due, data_storage consent |
| 2026-10-31 | Meena didi **not** seeded for the demo shop | F1.2 "Naya customer Meena didi…" must create her; §15 listed her as existing |
| 2026-10-31 | Migrations via `src/db/migrate.ts` (Drizzle migrator), not `drizzle-kit migrate` | drizzle-kit exited without an error message on Neon; the script prints errors and also suits Render |
| 2026-10-31 | Language codes: Sarvam BCP-47 + `hi-Latn` for Hinglish | One list in `packages/shared` for onboarding and settings |
| 2026-10-31 | **Payments: in-app mock by default + Paytm staging as a switch** (`PAYTM_MODE=mock\|staging`) | Mock never depends on Paytm or venue Wi-Fi; staging shows judges a real Paytm checkout. Replaces `PAYTM_MOCK`. Staging needs MID + merchant key (Paytm dashboard → API Keys, test mode). Built in Phase 5 |

## Gotchas learned

- **drizzle-kit:** a `pgView(...).as(sql...)` *is* emitted into the generated migration (don't also hand-write it). `drizzle-kit migrate` exited 1 with no message on Neon; use `pnpm db:migrate` (`src/db/migrate.ts`). drizzle-kit's config loader has no `import.meta.dirname`, so the config resolves paths from `process.cwd()` (apps/api).
- **Seed promise realism:** promises always set before the payment date made ~77% "broken"; now ~60% of paying customers name a date they meet.

- **Re-signing up with an existing email** returns a placeholder user (`token: null`, random id, nothing in the DB) and sends **no** email; this hides whether an email is registered. Use **Login** for existing emails; an unverified account gets a fresh code there.
- Neon managed Auth with `send_verification_email_on_sign_up: true` + method `otp` did **not** send a code on sign-up. `emailOtp.sendVerificationOtp({ email, type: "email-verification" })` does (5-minute expiry). The sign-in page calls it after sign-up and after an `EMAIL_NOT_VERIFIED` sign-in.
- **Neon Auth is per branch.** Users, sessions, Auth URL and settings live on each branch. A session from `production` doesn't carry over; switching `.env.local` to another branch means signing in there.
- On Windows, stopping the background `npm run start` shell leaves the Node servers on ports 3000/4000. Kill the `node.exe` processes running `scripts/next.mjs` / `dist/index.js` before restarting.
- `@neon/auth` 0.8.2: the server `auth.token()` exists at runtime (`GET /token`) but is typed `unknown`; wrapped as `getApiToken()` in `apps/web/lib/auth/server.ts`.
- Next.js build workers don't see env loaded in `next.config.ts`, and `node --env-file` breaks Next workers (forwarded via `NODE_OPTIONS`). `apps/web/scripts/next.mjs` loads `../../.env.local` with `process.loadEnvFile`, then runs the Next CLI. The web build **needs** `NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET` (hence the CI secrets).
- Upstash: BullMQ/ioredis need the TCP endpoint. Same host as the REST URL, port 6379, user `default`, password = REST token.
- `pg` warns that `sslmode=require` will change meaning in pg v9; switch the URLs to `sslmode=verify-full` at some point.
- `neon init` also installed Neon skills/MCP for other agents (Gemini, Cline, Copilot, OpenCode) and minted an account-wide Neon API key (id 3484243) for MCP. Revoke with `neon api-keys revoke 3484243` if not wanted.
- **Don't put `NODE_ENV` in `.env.local`.** The Next launcher loads the file before `next build`; `NODE_ENV=development` made the production build render with development React and crash (`Cannot read properties of null (reading 'useContext')` on `/_global-error`). `scripts/next.mjs` now drops a file-provided `NODE_ENV`.
- Blank values (`KEY=`) mean "not set": the API's env schema treats empty strings as undefined.
- **Groq currently has no vision model** (production or preview), so the §12 OCR fallback ("Groq vision") can't be used as written. Decide in Phase 4: Sarvam Vision only, or another vision provider.

## Open questions

- Paytm staging credentials: get the staging MID + merchant key from the Paytm dashboard before Phase 5 (put them in `.env.local`, never in chat or git).

See `docs/BUILD_PLAN.md` §6. Most urgent:
- Custom SMTP provider for production auth emails
- Project region is London (console default); Singapore is closer to India and needs a new project
- Demo figures in §22 (₹450 vs ₹570; EMI ₹9,100)
- Move repo out of OneDrive?
- Hackathon dates and team A/B/C split

## Blockers

- `GROQ_API_KEY` is empty in `.env.local`. Needed from Phase 2 (intent router, extraction).

## How to run

```bash
pnpm install
npm run build
npm run start
```

API on http://localhost:4000 (`/health`, `/me`), web on http://localhost:3000. Env comes from the repo-root `.env.local`; it currently points at the Neon `dev` branch. `neon checkout <branch>` switches branch and re-pulls the Neon variables (other keys in `.env.local` are kept).

Checks: `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test`.
