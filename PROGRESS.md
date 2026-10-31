# Hisaab AI — Progress Log

> Living status of the build. Update this file at the end of every work session.
> Spec: [`CLAUDE.md`](CLAUDE.md) · Plan: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)

**Current phase:** Hackathon sprint — S3 Credit done → next S4 khata photo (stretch) / S5 demo hardening (sprint plan at the top of `docs/BUILD_PLAN.md`)
**Last updated:** 2026-10-31 (S3)

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
| 2026-10-31 | **Phase 2: voice layer** | AI plumbing (`services/aiCall.ts`: 10 s timeout, 1 retry, Redis cache, logs without personal data), Sarvam STT (`saaras:v4`, mode `translit`, customer names as keyterms) + TTS (`bulbul:v4-flash`, MP3 files named by content hash = cache), Groq JSON mode (`gpt-oss-120b`, reasoning low, zod + one repair), prompt loader (`src/prompts/*.md`, versioned, copied to dist), `AI_MOCK` offline fixtures, intent router (falls back to keyword rules if Groq fails), `POST /voice/command` (audio or typed text), `POST /voice/tts`, `GET /media/tts/:name`. Web: `MicButton` (push-to-talk, waveform, 30 s cap, slide-to-cancel, haptics, keyboard), result sheet with spoken reply, typed fallback |
| 2026-10-31 | Phase 2 tests | 17 new API tests (mock AI): intents, ₹ read-back, not-understood, audio upload, silence, 415, helper owner-only reply, TTS/media caching, path tricks; aiCall cache/retry/timeout/no-PII logging. **Live test** (`pnpm --filter @hisaab/api test:live`): real Sarvam + Groq, typed loan question → credit + MP3; TTS audio → STT "Gupta ji…" → capture → "₹120" |
| 2026-10-31 | **S1: voice capture → ledger** | `extract_entry.md` (Groq) + deterministic amount parser wins on amount; fuzzy customer matcher (honorifics, aliases, "Gupta ji" ⊂ "Ramesh Gupta" → ambiguous); follow-ups as tap-to-answer buttons (new customer, which Gupta, duplicate within 2 min, how much, confirm delete); due date from "Friday tak" or default days; spoken reply with new balance. Routes: `GET /customers`, `GET /customers/:id`, `DELETE /ledger/:id` (soft), `GET /summary/today`. Web: entry card with 10 s Undo, follow-up buttons, Khata list (status in words + colour, prediction), customer page (balance, promises, history), Home real numbers |
| 2026-10-31 | S1 tests | All five F1.2 utterances + follow-ups + reads + cross-shop isolation (mock AI); matcher unit tests. **Live:** spoken "Gupta ji, do kilo chawal, ek sau bees udhaar" → real STT + Groq → "Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki." 59 offline + 2 live API tests pass |
| 2026-10-31 | **S2: Collect** | Reminders: gentle/firm by broken promises or 15+ days overdue (templates from F2.1, never threatening), one per customer per day, mock pay link. Public mock Paytm UPI page `/pay/:token` (full or partial, idempotent, closes promises, notifies merchant). **Two-tab AI call:** `POST /calls` → agent greeting (TTS) → customer tab `/call-sim/:id` (public, ring → answer → push-to-talk or type) → Groq classifies (`call_agent.md`: pay_now/promise/partial/dispute/busy/wrong_person/refuse) → code acts with fixed polite lines: promise + follow-up (queued reminder, day after 10:00 IST), partial link + promise for the rest, dispute logged, ≤ 3 agent turns. Merchant `/call/:id` polls (1.5 s). `/collect` dashboard (overdue first, open/broken promises, reminded today, recent calls). Web proxies `/media/*` so only the web app needs a tunnel. Migration `0002` (calls.meta) |
| 2026-10-31 | S2 tests | 11 collect tests (mock AI): reminder tones + daily dedupe, pay page partial → full → idempotent, "Friday ko dunga" → promise + follow-up, partial → promise for the rest, dispute, 3-turn cap, isolation, dashboard. **Live:** real Groq "Haan ji, Friday ko de dunga" → promise 2026-11-06 + MP3. 70 offline + 3 live API tests pass. Public pages smoke-tested signed out |
| 2026-10-31 | Onboarding verified by hand on `dev` | Real sign-in → language (Hinglish) → shop → consent → Home; DB has the shop, owner membership linked to the Neon Auth user, and the `data_storage` consent |
| 2026-10-31 | **Phase 1: web** | Server-side `lib/api.ts` (mints a JWT per call), `lib/strings.ts` (Hinglish + English), `AppShell` (bottom nav, centre mic slot), Home (redirects to onboarding without a shop), onboarding: language → shop → consent → Home (4 screens incl. sign-in). Signed-out `/`, `/me`, `/onboarding` → sign-in |
| 2026-10-31 | **S3: Credit** | §14 scorecard as a pure function (`services/scorecard.ts`: 7 weighted factors, neutral 0.5 for thin data, empty shop ≈ 570, FIFO credit↔payment pairing for recovery rate and avg days, weekly-sale CV for consistency, top-3 debtor concentration) + `services/emi.ts` (reducing balance, ₹50k/21%/6m ≈ ₹8,851). Offer rules: score ≥ 600 + live lending consent; amount = min(₹2L, avg monthly sales × 0.5/0.8/1.0) stepped to ₹5k (small offers to ₹100); rate 24/21/18 by band. Routes: `GET /credit/score` (compute + store + change vs previous), `GET/POST /consents`, `DELETE /consents/:id` (latest decision wins), `POST /credit/offers` (403 CONSENT_REQUIRED / 409 SCORE_TOO_LOW), `POST /credit/offers/:id/teach-back` (Groq `teach_back_judge.md` extracts; **code** judges ±10% EMI + exact tenure, 2 attempts then Paytm-agent reply), `POST /credit/offers/:id/accept` (mock disbursed + notification; no ledger entry — schema has no loan type yet). Voice: credit intent (owner only) now answers "Mujhe loan mil sakta hai?" with the real score via `score_explainer.md`, deterministic fallback template when Groq fails. Web: `/credit` (gauge with colour + words, change, top/weak factors, tips, loan link, helper sees a friendly owner-only note), `/credit/offer` (consent → offer card → teach-back text/mic → accept), Home link "Credit score dekhein" |
| 2026-10-31 | S3 tests | 12 new: scorecard/EMI/lender rules/teach-back judge (pure) + credit integration (mock AI, Neon test): healthy shop → score > 600 with digital_share up, helper → 403 on score **and** voice, consent-first 403, revoke closes the offer path, offer EMI matches the formula, wrong teach-back → attempt 1 + real numbers in reply, correct → passed → accept → disbursed + notification, give-up after 2 attempts, cross-shop offer → 404. **93 offline tests pass**; web build + lint + typecheck green |

## In progress

- S4: Khata photo (stretch) — decide the vision provider first: **Groq has no vision model today** (see gotchas), so Sarvam Vision only, or another provider.
- Live check of the S3 demo moments on `dev` (`pnpm seed:demo`, then mic → "Mujhe loan mil sakta hai?" → consent → teach-back).
- Manual check: hold the mic on Home in a real browser and speak.

## Next up

1. S4 Khata photo (stretch) or straight to S5 demo hardening: warm TTS cache for the §22 lines (incl. "Aapka score N hai", "har mahine ₹8,851"), phone over HTTPS tunnel, backup video.
2. Demo-merchant score sanity: run the real seeded Sharma shop through `GET /credit/score` on `dev`; if it lands far from ~700, tune the seed (walk-in ₹61–70k/month, 60% UPI should give ≈ 0.8 × → ₹50,000 offer).
3. GitHub repo + CI secrets (see below).

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
- [x] Phase 2 — Voice layer + intent router
- [x] Phase 3 — Voice capture + ledger/customer screens (S1)
- [x] Phase 5 — Collect: reminders + mock payments (S2, reminders/pay/button version)
- [x] Phase 6 — Simulated AI call + promises (S2, polling version)
- [x] Phase 7 — Credit: score, offer, teach-back (S3)
- [ ] Phase 4 — Khata photo capture (S4, stretch)
- [ ] Phase 8 — Polish modules (Ask, brief, UPI mock, Udhaar svc, settings, PWA)
- [ ] Phase 9 — Deploy and demo hardening (S5)

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
| 2026-10-31 | **Scorecard normalisation bounds** | recovery rate, promise %, digital share, consistency raw 0–1; avg days 0 → 1, ≥ 60 → 0; tenure cap 12 months; concentration 0 → 1, ≥ 0.6 → 0; thin-data factors sit at neutral 0.5 (empty shop ≈ 570, offer line 600 intact) |
| 2026-10-31 | **Offer amount stepped to spoken-friendly figures** | Down to the nearest ₹5,000 for big offers (₹52,000 → ₹50,000 = the §22 demo line), ₹100 steps + ₹500 floor for small ones so tiny shops don't get "NO_OFFER" |
| 2026-10-31 | **Consents: latest decision wins** | `activeConsent` reads the newest row per purpose (grant → revoke → re-grant works), not any live row |

## Gotchas learned

- **Generating code through shell heredocs/template strings ate regex backslashes** (`` became a backspace character, `d` became `d`). Write files with the editor tools, and scan for `` if a regex mysteriously stops matching.

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

- None.

## How to run

```bash
pnpm install
npm run build
npm run start
```

API on http://localhost:4000 (`/health`, `/me`), web on http://localhost:3000. Env comes from the repo-root `.env.local`; it currently points at the Neon `dev` branch. `neon checkout <branch>` switches branch and re-pulls the Neon variables (other keys in `.env.local` are kept).

Checks: `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test`.
