# Hisaab AI — Build Plan

> Companion to [`CLAUDE.md`](../CLAUDE.md). CLAUDE.md says **what** to build; this file says **how and in what order**.
> Each phase ends with a demo-able checkpoint. Phases follow CLAUDE.md §21 build order.

---

## ⏱ Hackathon sprint (replaces the 14-day timeline below) — decided 2026-10-31

The prototype is shown to the jury after **6–7 hours of building**; about 2.5 hours were spent on
Phases 0–2. The remaining ~4 hours build **only the three demo moments in §22**, in this order.
Everything else in this file stays as the post-hackathon roadmap.

**Done (Phases 0–2):** monorepo, Neon + Neon Auth (email OTP) + Upstash, schema + seed + demo shop
(Gupta ji ₹330), onboarding, voice layer (Sarvam STT/TTS, Groq intent router, MicButton).

| # | Slot | Build | Demo moment |
|---|---|---|---|
| S1 | ~45 min | **Voice capture → ledger:** extraction prompt (Groq) + amount cross-check, fuzzy customer match, create customer on "naya customer", payment entries, spoken confirmation with new balance ("Ab kul ₹450 baaki"), 10 s undo. Customers list + customer page (balance, history). Real numbers on Home | 1 |
| S2 | ~60 min | **Collect:** dues list (overdue first); "Remind" → gentle/firm message + mock pay link → `/pay/:token` page records the payment; **"Call (AI)"** → two-tab call sim (polling, not SSE): agent speaks, customer tab talks back, Groq classifies (pay/promise/partial/dispute/busy), "Friday ko dunga" → promise row + scheduled follow-up shown, transcript saved | 2 |
| S3 | ~60 min | **Credit:** §14 scorecard (pure function, on demand) → `/credit` (score, top factors, tips); voice "Mujhe loan mil sakta hai?" → score + reason → consent → offer (§14 rules, computed EMI) → teach-back (Groq extracts the numbers, code compares ±10%) → accepted | 3 |
| S4 | ~30 min | **Khata photo (stretch):** Sarvam Vision → rows → review → save. If it doesn't fit, the demo starts at the voice entry | 1 |
| S5 | ~30 min | **Demo hardening:** `seed:demo` linked to the demo login, warm the TTS cache for scripted lines, phone access over HTTPS (Cloudflare quick tunnel; the mic needs HTTPS on a phone), rehearse, record backup video | all |

**Cut for the prototype** (still in the roadmap): BullMQ/cron jobs (on-demand buttons instead),
SSE (polling), LangGraph (plain functions), Paytm staging (in-app mock link only), WhatsApp sending
(copy-text only), PWA/offline queue, Ask, Stock, Comply, Udhaar-as-a-Service, notifications centre,
Vercel/Render deploy (run on the laptop + tunnel; deploy only if time is left), CI secrets.

**Numbers used in the demo:** Gupta ji ₹330 → voice +₹120 → call quotes ₹450. Loan offer uses the
§14 rules with rates 24% / 21% / 18% by band and the **computed** EMI (≈ ₹8,850/month for ₹50,000
over 6 months at 21%), so the §22 line "₹9,100 mahina" is spoken as the computed figure.

---

## 0. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces** (`apps/web`, `apps/api`, `packages/shared`) | Per §19; pnpm 10 already installed |
| Runtime | **Node 24** (local), TypeScript `strict` | Installed; Render/Vercel support it |
| API framework | **Fastify** + `fastify-type-provider-zod` | zod schemas double as request validation; easy SSE; fast cold start on Render |
| Database | **Neon Postgres** from day one (dev, CI and prod), separate Neon branches per environment | Same database engine everywhere; branching gives free throwaway copies |
| ORM | **Drizzle** + `drizzle-kit` + `pg` (node-postgres pool) | Plain-SQL migrations that mirror §10; views via `sql`; `pg` pool is Neon's guidance for a long-running Node server |
| Auth | **Decided: Neon managed Auth with email OTP at sign-up** (`@neon/auth` in `apps/web`; branch config: email verification method `otp`, verification required, code sent on sign-up and on unverified sign-in; API verifies Neon Auth JWTs via JWKS). Shared Neon SMTP in dev; production needs custom SMTP. *Superseded alternative, kept for reference:* Better Auth (self-hosted library inside `apps/api`, tables in our Neon DB) with the `phoneNumber` plugin (`signUpOnVerification` for phone-first sign-up; custom OTP check accepting `DEMO_OTP=123456`, no SMS sent) and the `bearer` plugin | Phone-first sign-up and a fixed demo OTP, neither of which Neon's *managed* Better Auth supports. Bearer tokens match §11 and avoid cross-site cookies between Vercel and Render. **Leave the "Better Auth" toggle OFF when creating the Neon project.** |
| Queue / cache | **Upstash Redis** from day one + **BullMQ** + `ioredis` (TLS `rediss://` URL) | Per §13; no local Redis needed |
| Agents | `@langchain/langgraph` (LangGraph.js) | Per §12 |
| LLM | `groq-sdk` | Tool calling + vision fallback |
| Voice / OCR | Sarvam REST via a thin `fetch` wrapper | One place for auth, timeout, retry, cache |
| Web | **Next.js App Router + Tailwind v4**, TanStack Query | Mobile-first PWA |
| PWA | Hand-written `public/sw.js` + `manifest.json`; `idb-keyval` for offline upload queue | §17 offline queue; no plugin magic |
| Tests | **Vitest** (unit + integration against the Neon `test` branch) | One runner across all packages |
| Logging | pino (Fastify built-in), request id on every line | §19 |
| Dates | `date-fns` + `@date-fns/tz` (`Asia/Kolkata`) | §19 |

Versions get pinned in `package.json` at install time (exact, not ranges, for the demo build).

---

## 1. Before we start: accounts and keys

Needed by the phase noted. No credit card required for any of them.

| Need | Used from | Who sets up |
|---|---|---|
| Sarvam AI API key | Phase 2 | Person C |
| Groq API key (+ pick `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL` from their current list) | Phase 2 | Person C |
| GitHub repo (private) | Phase 0 | Anyone |
| Neon Postgres project `hisaabai`, region **AWS Asia Pacific (Singapore)**, Postgres only (Better Auth toggle off), branches `main` (prod/demo), `dev`, `test` | Phase 0 | Person B |
| Upstash Redis database, region **Singapore** (`ap-southeast-1`): one for dev, one for prod/demo | Phase 0 | Person B |
| Vercel (web), Render (API) | Phase 9 (deploy a skeleton in Phase 1 to catch surprises early) | Person A / B |
| Supabase Storage bucket (photos, TTS audio) | Phase 4 (local disk before that) | Person B |

---

## 2. How we work (applies to every phase)

1. **Contracts first.** Every endpoint's request/response zod schema lands in `packages/shared` *before* the
   handler or the screen. Frontend codes against the schema + a mock; backend fills it in. This is what lets
   three people work in parallel.
2. **`AI_MOCK=true` mode.** Every AI wrapper (`sarvam.ts`, `groq.ts`, `ocr.ts`) has a fixture-backed mock that
   returns canned results keyed by input. Lets the frontend and tests run with no keys, no network, no rate
   limits — and is the last-resort fallback on demo day.
3. **Demo path first, breadth later.** In each phase, build the exact flow from §22 first, then widen.
4. **Deterministic code checks the LLM.** The LLM extracts; code decides. Amounts are cross-checked with a
   deterministic Hindi number parser, teach-back pass/fail is a numeric comparison, scores come from a pure
   function. The LLM only explains.
5. **Merchant scoping is not optional.** Every DB query goes through a repository function that takes
   `merchantId` from the JWT, never from the request body. One integration test per route checks cross-merchant
   access returns 404.
6. **Small PRs, conventional commits**, `main` always runnable. Each phase = one or more PRs that keep the demo
   working.

---

## 3. Phases

Effort estimates assume three people in parallel. "Done when" is the phase's checkpoint.

### Phase 0 — Repo and tooling (½ day, Person B)

- `git init`, `.gitignore` (node_modules, .env, .next, uploads/), `.editorconfig`, `.nvmrc` (24).
- `pnpm-workspace.yaml`; root `package.json` scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`,
  `db:generate`, `seed`, `seed:demo`.
- `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`), ESLint flat config + Prettier.
- `.env.example` as §18, plus `AI_MOCK=true`, `UPLOAD_DIR=./uploads`, and `DATABASE_URL_DIRECT`
  (see the Neon notes below). Each person keeps their own `.env` pointing at the Neon `dev` branch and the dev
  Upstash database.
- **Neon wiring:** the app uses the **pooled** connection string (`DATABASE_URL`, host contains `-pooler`) with
  postgres.js `prepare: false` (the pooler runs in transaction mode). `drizzle-kit` migrations use the
  **direct** string (`DATABASE_URL_DIRECT`). `sslmode=require` on both.
- **Upstash wiring:** BullMQ needs the TCP/TLS endpoint (`rediss://default:<token>@<host>:6379`), not the REST
  API. ioredis options: `maxRetriesPerRequest: null`, `enableReadyCheck: false`. One shared `redis.ts` creates
  the connections; queues get a `hisaab:<env>:` prefix so dev and prod never collide.
- Skeletons: `apps/api` Fastify hello on `:4000` with `/health`; `apps/web` Next.js on `:3000`; `packages/shared`
  exporting one schema.
- GitHub Actions: install → typecheck → lint → test, with `DATABASE_URL`/`REDIS_URL` for the Neon `test`
  branch and dev Upstash database stored as repo secrets. Tests reset the `test` branch schema before running.
- `/health` checks both Neon (`select 1`) and Upstash (`PING`).

**Done when:** `pnpm install && pnpm db:migrate && pnpm dev` serves both apps, `/health` reports Neon and Upstash
as up, and CI is green.

### Phase 1 — Data, seed, auth (1½ days)

**Person B — DB + API core**
- `apps/api/src/db/schema.ts`: Drizzle tables mirroring §10 one-to-one (BIGINT paise, TIMESTAMPTZ, CHECKs).
  `customer_balances` view created in a hand-written migration via `sql`.
- `src/db/repos/*.ts`: scoped repository functions (`customers.list(merchantId)`, `ledger.insert(merchantId, …)`).
- **Better Auth** in `src/auth.ts`: Drizzle adapter on Neon; Better Auth's own tables prefixed `auth_`
  (`auth_user`, `auth_session`, `auth_account`, `auth_verification`) via `better-auth` CLI-generated Drizzle
  schema; `phoneNumber` plugin with `signUpOnVerification` (temp email `<phone>@phone.hisaab.local`),
  `sendOTP` that only logs "OTP sent" in demo mode (never logs the phone number), and a custom OTP check that
  accepts `DEMO_OTP` while `NODE_ENV !== 'production' || DEMO_MODE=true`; `bearer` plugin for
  `Authorization: Bearer`. Mounted under `/auth/*` in Fastify (Fastify request → Web `Request` → `auth.handler`).
  Env: `BETTER_AUTH_SECRET` (replaces `JWT_SECRET`), `BETTER_AUTH_URL`.
- Our `users` table (§10) gains `auth_user_id TEXT UNIQUE REFERENCES auth_user(id)`; it keeps `merchant_id` and
  `role`, so Better Auth handles identity and our tables handle shop membership.
- Fastify plugins: `requestId`, `auth` (Better Auth `getSession` from the bearer token → look up our `users` row
  → `req.user = {userId, merchantId, role}`), `requireOwner` (403 for helpers, §17 message), error handler that
  emits the §11 error shape.
- Routes: Better Auth's `/auth/phone-number/send-otp` and `/auth/phone-number/verify` replace the §11
  `/auth/otp/request` and `/auth/otp/verify` paths; plus `POST /merchants`, `GET /me`, `PATCH /me/settings`.
- Web: `better-auth/react` client with the `phoneNumberClient` plugin; token kept in memory + `localStorage`
  and sent as a bearer header by `lib/api.ts`.

**Person B — seed** (`src/seed/`)
- Seeded PRNG (e.g. `seedrandom`) so every run produces identical data.
- `generate.ts`: 50 merchants / 5 cities / health mix / 20–60 customers / 6 months, per §15.
- `demo.ts`: Sharma General Store with hand-placed customers and balances matching §22
  (see open question Q2/Q3 for exact figures). Deletes and recreates only the demo merchant — idempotent.
- Avg monthly sales tuned so the scorecard (Phase 7) lands ≈ 700 and the offer ≈ ₹50,000.

**Person A — web shell**
- Tailwind theme (high contrast, large rupee type), layout with bottom nav + fixed bottom-centre mic slot.
- `lib/api.ts` (typed fetch using shared schemas, attaches JWT), `lib/format.ts` (paise ↔ ₹, IST dates).
- `/onboarding`: language → phone → OTP → shop name → consent (4 screens max, per F0). Home placeholder.
- Hindi-first copy with English sub-labels kept in one `lib/strings.ts` (no i18n library yet).

**Person C — shared**
- `packages/shared`: `money.ts` (paise helpers), `hindiNumbers.ts` (ek, do … sau, hazaar, dedh, dhai, sawa,
  saade, paune; plus digits and "450/-"), `dates.ts` (kal, parso, weekday names → IST date).
- Exhaustive unit tests for the parser — this is where demo bugs hide.

**Done when:** a new merchant onboards in ≤ 4 screens and lands on Home; `pnpm seed:demo` resets Sharma General
Store; helper JWT gets 403 on an owner route; parser tests pass.

### Phase 2 — Voice layer + intent router (1½ days)

**Person C — AI services** (`apps/api/src/services/`)
- `cache.ts`: Redis get/set, key = sha256(model + normalised input), TTL from `AI_CACHE_TTL_SECONDS`.
- `aiCall.ts`: one helper every wrapper uses — 10 s timeout (AbortController), 1 retry with jitter, cache,
  pino log `{provider, op, ms, tokens, cached}` with no personal data.
- `sarvam.ts`: `stt(audio, langHint)` → `{transcript, languageCode}`; `tts(text, lang, voice)` → audio buffer,
  saved to storage, URL returned; cached by hash(text + voice).
- `groq.ts`: `chatJson(prompt, vars, schema)` (JSON mode + zod parse, one repair retry), `chatTools(...)`.
- `prompts/loader.ts`: reads `src/prompts/*.md`, `{var}` substitution, version header in each file.
- Mock implementations behind `AI_MOCK`.

**Person C — router**
- `prompts/intent_router.md`; `agents/intentRouter.ts` → one of
  `capture | payment | collect | credit | ask | stock | settings | other` (§12 list — superset of F9's).
- `POST /voice/command`: STT → router → handler registry (stub handlers for now) → reply text → TTS.
- `POST /voice/tts`.

**Person A — voice UI**
- `components/MicButton.tsx`: push-to-talk via `MediaRecorder` (webm/opus), waveform via `AnalyserNode`,
  30 s cap, slide-to-cancel, 48px+ target, haptic on start/stop where supported.
- `lib/audio.ts`: recording helpers, `AudioPlayer` that autoplays reply audio.
- STT failure path: "Samajh nahi aaya, dobara bolein" + text input fallback (§17).

**Done when:** holding the mic on Home and saying anything returns transcript + intent + spoken reply, with
`AI_MOCK=true` and with real keys.

### Phase 3 — Voice capture + ledger/customer screens (2 days)

**Person C**
- `prompts/extract_entry.md` → §12 output contract. After the LLM, run `hindiNumbers` on the transcript; if the
  two amounts disagree, lower confidence and ask "Kitne rupaye?".
- LLM tools (zod-validated, merchant-scoped): `find_customer` (fuzzy match on name + aliases using trigram /
  Levenshtein, return top 2), `create_customer`, `create_ledger_entry`, `record_payment`, `delete_last_entry`.
- Clarification loop: one follow-up max (ambiguous customer → top 2; unknown → "Naya customer … banaun?").
- Golden tests: the five F1.2 utterances → expected entries.

**Person B**
- `POST /capture/voice`, `GET /ledger`, `PATCH|DELETE /ledger/:id` (soft delete), `GET|POST|PATCH /customers`,
  `GET /customers/:id`.
- Duplicate guard: same customer + amount within 2 min → ask before saving (§17).
- Due date default = `default_due_days`; spoken "Friday tak" overrides.

**Person A**
- Undo toast (10 s) after voice entry.
- `/ledger` (filters, outstanding total on top), `/customers` (sorted by due; status label in words + colour),
  `/customers/[id]` (balance, history, placeholders for promises/reminders/calls, "Remind now", "Call (AI)").

**Done when:** all five F1.2 utterances work end to end with spoken confirmation, and balances update on screen.

### Phase 4 — Khata photo capture (1½ days)

**Person A**
- `CameraCapture.tsx`: `<input capture>` + upload, multi-page, client compress to 1600px long edge / JPEG 0.8.
- `/capture/review`: row cards, `confidence < 0.8` highlighted and read aloud one by one with Haan/Nahi buttons
  + voice edit ("450 nahi, 540"), "Save all".

**Person C**
- `ocr.ts`: Sarvam Vision → if error or low confidence → Groq vision. `prompts/khata_ocr_struct.md`: skip totals
  and crossed-out lines; use the page total as a cross-check (mismatch → lower all confidences).
- Fuzzy-match names to existing customers.

**Person B**
- `POST /capture/photo` (multipart, stores image, creates `khata_scans`, runs OCR inline for MVP — move to the
  `ocr:process` queue only if latency demands), `POST /capture/confirm` (writes `source='photo'`, links `scan_id`).
- Storage adapter: local disk now, Supabase Storage in Phase 9, same interface.

**Team task:** each member writes one messy khata page (≥ 10 lines, mixed Hindi/English, one crossed-out line,
a total). Photograph → `fixtures/khata/*.jpg` + `*.expected.json`.

**Done when:** a 10-line fixture page gives ≥ 8 correct rows, the rest flagged, and Save updates balances.

### Phase 5 — Collect: reminders + mock payments + jobs (1½ days)

**Person B**
- `services/payments.ts`: one `PaymentLinkProvider` interface (`createLink`, `getStatus`) with two
  implementations, chosen by `PAYTM_MODE` (default `mock`). Both end in the same `markPaid()` → writes a
  `payment` ledger entry (`source='upi'`), marks the reminder `paid`, creates a notification
  "Gupta ji ne ₹450 de diye ✓".
  - `paytm.mock.ts` (default, demo-safe): token → in-app `/pay/:token` page → confirm.
  - `paytm.staging.ts`: Paytm Create Link API on `PAYTM_HOST` (`securegw-stage.paytm.in`), body signed with
    `PAYTM_MERCHANT_KEY` (Paytm checksum, `tokenType: "AES"`), `linkType: FIXED`, amount, `linkOrderId` =
    our reminder token. Customer pays on Paytm's test cashier with Paytm test instruments (test card, test
    wallet, or the Paytm Test UPI app). Payment confirmed by (a) `statusCallbackUrl` webhook — needs a public
    URL (Render or a tunnel), signature verified — or (b) polling the Fetch Transaction API when no public URL
    (local dev). Confirm the exact endpoint paths and checksum steps against Paytm's docs when building.
  - Demo: keep `mock` as the fallback; switch to `staging` only after it passes a rehearsal.
- `jobs/queues.ts`: BullMQ queues + repeatable jobs with IST cron; workers run **inside the API process**
  (Render free has no background workers). Dedupe key = merchant + customer + date.
- `reminders:due`, `promises:check`, `followups:scheduled` workers.
- Routes: `GET /collect/dashboard`, `POST /collect/run`, `POST /collect/reminders/:id/approve`,
  `GET /pay/:token`, `POST /pay/:token/confirm`, `GET /notifications`, `POST /notifications/:id/read`.
- Guardrails in code (not prompts): quiet hours, max 1 reminder/day/customer, firm tone always needs approval,
  disputed customers skipped.

**Person C**
- `agents/collectAgent.ts` (LangGraph): select_due → predict → choose_tone (rules: broken promise or ≥ 2 ignored
  → firm) → compose (`prompts/reminder_message.md`, 300-char cap, must contain `{link}`, validated) →
  auto_send | await_approval.
- `predictions:update` rules for Will pay / Might delay / Risky (F2.4).

**Person A**
- `/collect` dashboard, reminder preview with copy-to-WhatsApp, approve button.
- `/pay/[token]`: amount + shop + "Pay with UPI" → success screen (clearly labelled demo/mock).
- In-app notification bell; live balance refresh (poll or SSE from Phase 6's channel).

**Done when:** "Run reminders" on Collect creates Gupta ji's reminder with a link; paying on `/pay/:token`
drops the balance and notifies the merchant.

### Phase 6 — Simulated AI call + promises (2 days)

**Person B**
- `calls` routes per §11. SSE at `GET /calls/:id/stream` (Fastify `reply.raw`, heartbeat every 15 s).
  In-process `EventEmitter` per call — fine for one Render instance.
- `create_promise` tool → `promises` row + delayed `followups:scheduled` job at promised date 10:00 IST.
- Max 1 AI call per 3 days per customer (§16).

**Person C**
- `agents/callAgent.ts` (LangGraph) per §12 with `prompts/call_agent.md`; ≤ 3 agent turns enforced by the graph,
  not the prompt. Intent → action map exactly as F2.2. Past promise date → ask again (§17). Summary at end.

**Person A**
- Merchant side: "Call (AI)" → live transcript panel + outcome card.
- `/call-sim/[sessionId]` (customer tab): ringing screen with ringtone → answer → hears agent TTS → push-to-talk
  reply → live transcript → hang up.

**Done when:** Call (AI) → tab B rings → "Friday ko dunga" → promise row + delayed job exist → transcript and
outcome shown on the merchant phone.

### Phase 7 — Credit: score, offer, teach-back (2 days)

**Person B**
- `services/scorecard.ts`: pure function `(ledgerStats) → {score, factors[]}` implementing §14 exactly.
  Normalisation bounds documented in code (e.g. `avg_days_to_recover`: 0 days → 1, ≥ 60 days → 0).
- `services/emi.ts`: reducing-balance EMI in paise; unit tested against known values.
- `credit:recompute` job (nightly + after large changes), notify on Δ ≥ 10.
- Routes: `GET /credit/score`, `POST /consents`, `DELETE /consents/:id`, `POST /credit/offers` (403 without a
  live lending consent), `POST /credit/offers/:id/accept` (requires `teach_back_passed`) → mock disburse →
  `loan` ledger entry.

**Person C**
- `prompts/score_explainer.md` → 2–3 Hindi sentences + 3 tips from the weakest factors.
- `agents/creditAgent.ts`: fetch_score → explain → (< 600 → tips) | consent → offer → teach_back (≤ 2 retries)
  → accept.
- `prompts/teach_back_judge.md` extracts `{emi, tenure}` from the answer; **code** compares (±10% EMI, exact
  tenure) and decides pass/fail; LLM writes the simpler re-explanation.
- `POST /credit/ask`, `POST /credit/offers/:id/teach-back`.

**Person A**
- `/credit`: `ScoreGauge`, change vs last month, `FactorList` (top 3 up/down in words), tips, "Check loan".
- `/credit/offer`: consent screen (voice read-out), `OfferCard`, teach-back mic, accept. Hidden for helpers.

**Done when:** "Mujhe loan mil sakta hai?" → spoken score + reason → consent → offer → wrong answer → simpler
re-explanation → right answer → accepted.

### Phase 8 — Polish modules (1½ days, split as capacity allows)

- **F6 Ask + daily brief** (C + A): `askAgent` over read-only tools (`get_sales`, `get_top_debtors`,
  `get_top_items`, `get_balance`), max 3 tool calls; `brief:daily` job + Home play button.
- **F1.3 UPI sync mock** (B): `POST /sync/upi/mock` + Home "Sync" button; matches payer VPA/phone to customers.
- **F4 Udhaar-as-a-Service** (B + A): eligibility rules from §14, state machine
  `offered → funded → repaying → closed`, badge on eligible customers.
- **F11 Settings & consent** (A): language, voice, due days, auto-gentle toggle, quiet hours, consent list with
  revoke.
- **PWA** (A): manifest, icons, `sw.js` (cache app shell, network-first API), IndexedDB upload queue.
- **Prototype screens** (A, sample data only): `/stock`, Protect, Comply — only if everything above is solid.

### Phase 9 — Deploy and demo hardening (1 day, everyone)

- Deploy: Vercel (web), Render (API + in-process workers) pointing at the Neon `main` branch and the prod Upstash
  database, Supabase Storage. Set all env vars. Run `pnpm db:migrate` and `pnpm seed:demo` against `main`.
- **Cache warm-up script**: replays every §22 utterance and TTS line so the demo hits cache, not providers.
- **Demo smoke test** (`pnpm demo:smoke`): reset demo merchant → run the three demo moments through the API →
  assert outcomes. Run before every rehearsal.
- Wake Render 10 min before the demo (or a ping). Keep a local + Cloudflare Tunnel fallback ready with
  `AI_MOCK=false` and warm cache, and `AI_MOCK=true` as the last resort.
- Record the backup video. Rehearse on the actual demo phone over mobile data.

---

## 4. Timeline at a glance (~14 working days for 3 people)

| Phase | Person A (web) | Person B (backend) | Person C (AI) |
|---|---|---|---|
| 0 | — | Repo, tooling, CI, Neon + Upstash setup | — |
| 1 | Shell, onboarding | Schema, auth, seed | Shared parsers |
| 2 | MicButton, audio | Help wire `/voice/*` | AI wrappers, router |
| 3 | Ledger/customer screens | Ledger/customer routes | Extraction + tools |
| 4 | Camera + review | Photo routes, storage | OCR + structuring |
| 5 | Collect, pay page | Mock pay, jobs | Collect agent |
| 6 | Call-sim UI | Calls, SSE, promises | Call agent |
| 7 | Credit screens | Scorecard, EMI, offers | Explainer, teach-back |
| 8 | Settings, PWA, Ask UI | UPI mock, Udhaar svc | Ask agent, brief |
| 9 | Deploy web, rehearse | Deploy API/DB | Cache warm-up, smoke test |

Phases overlap: A and C can start the next phase against mocks while B finishes routes.

---

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi / provider outage | Warm cache; `AI_MOCK` fallback; local + tunnel; backup video |
| Groq / Sarvam rate limits during rehearsals | Cache every call; rehearse with warm cache; mock mode for UI work |
| Render cold start (~30–60 s) | Wake before demo; keep the API bundle small |
| Upstash free-tier command cap burned by BullMQ polling (now from day one, in dev too) | Raise `stalledInterval` and `drainDelay`; few queues; workers off by default in dev (`WORKERS=off`), switched on only when testing jobs; separate dev and prod databases so dev use can't exhaust the demo quota; watch usage in the Upstash console |
| Neon free-tier compute sleeps when idle; first query after sleep is slow | Hit `/health` before rehearsals and the demo; keep connection timeout ≥ 10 s |
| Several people sharing the Neon `dev` branch step on each other's data | Each person can create their own Neon branch off `dev` (free) if it becomes a problem; `seed:demo` only touches the demo merchant |
| Render sleep means crons don't fire | Every job also has an on-demand trigger (Collect "Run now", `?recompute=true`) |
| Handwriting OCR worse than expected | Low-confidence read-aloud flow is the feature, not a failure; demo with a tested fixture page |
| LLM returns bad JSON / wrong amount | zod parse + one repair retry; deterministic number cross-check |
| Hindi speech mis-transcribed on demo phone | Rehearse the exact phrases on the actual phone and mic |
| Project folder lives in OneDrive | `node_modules` + `.next` sync churn and file locks on Windows. Move the repo to e.g. `C:\dev\hisaab-ai` (git is the backup) |

---

## 6. Open questions (need a team decision)

1. **Repo location** — OK to move out of OneDrive to a plain folder before `pnpm install`?
2. **Demo numbers don't add up.** In §22, step 1 adds ₹120 to Gupta ji (₹450 → ₹570, matching F1.2's
   "Ab kul ₹570 baaki"), but step 2's call says "₹450 baaki". Options: start Gupta ji at ₹330 so the call says
   ₹450, or have the call say ₹570.
3. **EMI figure.** ₹50,000 over 6 months at 18–24% p.a. gives an EMI of ~₹8,780–₹8,930, not ₹9,100 (that needs
   ~30% p.a.). Change the demo line to the computed figure, or add a processing fee into the EMI?
4. **Rate per score band.** §14 says 18–24% "by band". Proposal: 24% (600–679), 21% (680–759), 18% (760+).
5. **When is a reminder `ignored`?** Proposal: no payment or reply within 2 days → `ignored` → eligible for an
   AI call.
6. **`disputes` has no `merchant_id`.** Proposal: add it, so it can be scoped like every other table.
7. **Auth — decided 2026-10-31:** Neon managed Auth; sign-up emails a 6-digit OTP. Phone OTP dropped.
   **Region (open):** project is in London; Singapore would need a new Neon project. **Production email:** shared
   Neon SMTP is for development only; pick a custom SMTP provider before launch.
8. **Hackathon dates** — when are Stage 1 and Stage 2? The timeline above assumes ~14 working days.
9. **Team split** — confirm who is A / B / C.
