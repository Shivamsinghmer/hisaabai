# Hisaab AI — Full Project Context & Build Spec

> **Read this file first.** It is the single source of truth for what we are building, why, and exactly how
> each feature should behave. If something here conflicts with a guess, this file wins. If something is
> missing, ask before inventing product behaviour.
>
> - **Hackathon:** Paytm Build for India AI Hackathon — Delhi-NCR Edition (Stage 1 pitch → Stage 2 finals at Paytm office, Noida)
> - **Track:** Track 1 — **Merchant Growth AI** ("Build the AI business partner for every Paytm merchant")
> - **Team:** **BRX Devs** — Shivam Singh Mer, Hansika Katiyar, Janvi Chaturvedi
> - **Status:** Pitch deck done; this file starts the build.

---

## Table of contents

1. [Product summary](#1-product-summary)
2. [Users and personas](#2-users-and-personas)
3. [Product principles](#3-product-principles)
4. [Feature map](#4-feature-map)
5. [Feature specs](#5-feature-specs) — every feature in detail
6. [Screens and UI](#6-screens-and-ui)
7. [Tech stack](#7-tech-stack)
8. [Architecture](#8-architecture)
9. [Repo layout](#9-repo-layout)
10. [Data model](#10-data-model)
11. [API reference](#11-api-reference)
12. [AI layer: prompts, agents, models](#12-ai-layer)
13. [Background jobs](#13-background-jobs)
14. [Credit scorecard (formula)](#14-credit-scorecard)
15. [Synthetic seed data](#15-synthetic-seed-data)
16. [Trust, privacy, safety, compliance](#16-trust-privacy-safety-compliance)
17. [Error handling and edge cases](#17-error-handling-and-edge-cases)
18. [Hosting and environment](#18-hosting-and-environment)
19. [Conventions](#19-conventions)
20. [Testing](#20-testing)
21. [MVP scope, build order, team split](#21-mvp-scope-build-order-team-split)
22. [Demo script](#22-demo-script)
23. [Business model (for context)](#23-business-model)
24. [Glossary](#24-glossary)

---

## 1. Product summary

**Hisaab AI** is a **voice-first AI business partner for kirana (neighbourhood grocery) shops** in India.

It reads the shop's handwritten credit book (the **khata**), collects pending payments (**udhaar**) by voice,
and turns the shop's records into an explainable **credit score** that unlocks **loans on Paytm**.

### The problem
| Pain | Today | Consequence |
|---|---|---|
| Recording credit | Written in a paper notebook | Lost pages, no totals, no reminders |
| Recovering udhaar | Shopkeeper asks customers in person | Awkward, delayed, often never recovered |
| Getting a loan | Banks need verifiable records | Healthy shops are locked out; MSME credit gap ≈ **₹30 lakh crore** (~24% of demand, SIDBI May 2025) |
| Ledger apps | Khatabook / OkCredit need typing | Busy shopkeepers don't keep it up |

### The answer
**The shopkeeper never types.** Input is a **photo** of the khata or **voice** in Hindi / Hinglish / Indic
languages. One shared **ledger** powers everything: collections, credit, stock, insights, compliance.

### Scale
India has roughly **12–13 million kirana stores**, most keeping customer credit in a notebook.

---

## 2. Users and personas

| Persona | Who | Goals | Constraints |
|---|---|---|---|
| **Merchant (primary)** — "Ramesh, 45, Sharma General Store" | Kirana owner, uses Paytm QR + Soundbox, WhatsApp daily | Get udhaar back, get working capital, less bookkeeping | Low typing comfort, busy counter, Hindi first, cheap Android phone, patchy network |
| **Shop helper** | Assistant at the counter | Add entries quickly | Should not see loans/score |
| **Customer (secondary)** — "Gupta ji" | Buys on credit regularly | Pay easily, not be embarrassed | Receives reminders/calls; may not use the app at all |
| **Paytm (business)** | Lending, payments, insurance teams | New lending book, more UPI volume, engaged merchants | Needs consent-based data and explainable scores |

---

## 3. Product principles

1. **Zero typing.** Every main action works with the mic button or the camera.
2. **Speak their language.** Hindi/Hinglish by default; responses spoken back. Respect code-mixed speech and local terms (udhaar, baaki, jama, hisaab).
3. **Merchant is in control.** AI suggests; the merchant approves tone, orders and loans. Nothing financial happens silently.
4. **Polite, never threatening.** Collections protect the merchant–customer relationship.
5. **Explain everything.** Every score, offer and reminder can answer "why?".
6. **Works on bad networks.** Small payloads, cached AI results, retry queues.
7. **Consent first.** Financial data is shared with lenders only with explicit consent.

---

## 4. Feature map

```
                       ┌──────────── SHARED LEDGER (PostgreSQL) ────────────┐
                       │ khata entries · UPI sales · payments · supplier bills│
                       └──────────────────────────────────────────────────────┘
   SPINE (MVP demo)                                  MODULES (roadmap / light prototypes)
   F1 Capture  ──► F2 Collect ──► F3 Credit          F5 Stock · F6 Ask · F7 Protect · F8 Comply
                                   └─► F4 Udhaar-as-a-Service
   PLATFORM: F0 Onboarding & auth · F9 Voice layer · F10 Notifications · F11 Settings & consent
```

| ID | Feature | Priority | In demo? |
|---|---|---|---|
| F0 | Onboarding & auth | P0 | Yes (light) |
| F1.1 | Capture: khata photo → ledger | P0 | **Yes** |
| F1.2 | Capture: voice entry → ledger | P0 | **Yes** |
| F1.3 | Capture: UPI / Soundbox sync | P1 | Mocked |
| F1.4 | Capture: supplier bill photo | P2 | No |
| F1.5 | Ledger & customer views | P0 | **Yes** |
| F2.1 | Collect: smart reminders + UPI link | P0 | **Yes** |
| F2.2 | Collect: AI voice call (simulated) | P0 | **Yes** |
| F2.3 | Collect: promise-to-pay tracking | P0 | **Yes** |
| F2.4 | Collect: payment prediction | P1 | Light |
| F3.1 | Credit: explainable score | P0 | **Yes** |
| F3.2 | Credit: voice loan journey + offer | P0 | **Yes** |
| F3.3 | Credit: teach-back check | P0 | **Yes** |
| F4 | Udhaar-as-a-Service | P1 | Mocked flow |
| F5 | Stock | P2 | Prototype |
| F6 | Ask (voice Q&A + daily brief) | P1 | Light |
| F7 | Protect (payment verification, insurance) | P2 | Prototype |
| F8 | Comply (GST, P&L) | P2 | Prototype |
| F9 | Voice layer (shared STT/TTS) | P0 | Yes |
| F10 | Notifications | P1 | In-app only |
| F11 | Settings & consent | P1 | Light |

---

## 5. Feature specs

Each feature lists: **user story · flow · UI · API · data · AI · edge cases · done when**.

---

### F0 — Onboarding & auth

**User story:** As a new merchant, I want to start in under a minute without filling forms.

**Flow**
1. Open PWA → choose language (Hindi default; English, Hinglish, Tamil, Telugu, Bengali, Marathi…).
2. Sign up with email + password → a 6-digit OTP is **emailed** to the user (Neon Auth, "verify at sign-up",
   method `otp`) → enter it → email verified and signed in. Returning users sign in with email + password; an
   unverified email gets a fresh code. (Decided 2026-10-31; replaces the earlier phone + fixed demo OTP plan.)
3. Say or type shop name → stored.
4. Optional: "Link Paytm" toggle (mock) → enables UPI sync and payment links.
5. Consent screen (plain language, voice read-out): what we store, what we never share without permission.
6. Land on **Home** with a big mic button and a "Scan khata" button.

**Roles:** `owner` (everything) · `helper` (add entries only; no credit/loan screens).

**API:** Neon Auth (managed Better Auth) via the web app's `/api/auth/*` proxy: `signUp.email`,
`emailOtp.verifyEmail`, `signIn.email`; the API trusts Neon Auth JWTs (JWKS). `POST /merchants` (create profile).

**Done when:** a new merchant reaches Home in ≤ 4 screens; the helper role cannot open `/credit`.

---

### F1 — Capture (the data layer)

#### F1.1 Khata photo → ledger

**User story:** As a merchant, I want to photograph my khata pages so I never have to retype old entries.

**Flow**
1. Tap **Scan khata** → camera (or upload). Multiple pages allowed.
2. Client compresses the image (max 1600px long edge, JPEG ~80%).
3. `POST /capture/photo` → server sends to **Sarvam Vision** OCR; if it fails or confidence is low, falls back to **Groq vision**.
4. LLM converts raw text into structured rows: `customer, amount, type, items, date, confidence`.
5. Customer names are fuzzy-matched to existing customers (e.g., "Gupta jee" → "Gupta ji").
6. **Review screen:** rows shown as cards. High-confidence rows are pre-ticked; rows with `confidence < 0.8` are highlighted and **read aloud** for a yes/no confirmation ("Kya yeh Gupta ji, ₹450 hai?").
7. Merchant taps **Save all** (or edits by voice: "450 nahi, 540").
8. Entries are written with `source='photo'`; the photo is kept linked for audit.

**Handles:** crossed-out lines (ignore), totals at the bottom (skip, but use to cross-check), mixed Hindi/English, dates written as "12/9" or "12 Sep", amounts like "450/-" or "₹450".

**Done when:** a sample khata page of 10 lines produces ≥ 8 correct rows, the rest are flagged for confirmation, and saving updates customer balances.

#### F1.2 Voice entry → ledger

**User story:** As a merchant at a busy counter, I want to say an entry out loud and have it saved.

**Flow**
1. Hold the **mic button** (push-to-talk) → record audio (webm/opus).
2. `POST /capture/voice` → **Sarvam STT** (Saarika/Saaras, language auto-detect).
3. Transcript → **Groq LLM** tool call `create_ledger_entry` → strict JSON.
4. If anything is missing or ambiguous (unknown customer, no amount) → AI asks one short follow-up by voice ("Kaunse Gupta ji? Ramesh Gupta ya Suresh Gupta?").
5. Entry saved → **Sarvam TTS** confirmation: "Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki."
6. An **Undo** toast stays on screen for 10 seconds.

**Supported utterances (examples)**
| Utterance | Result |
|---|---|
| "Gupta ji, do kilo chawal, 120 udhaar" | credit ₹120 to Gupta ji, items "2 kg chawal" |
| "Sharma ji ne 300 jama kiye" | payment ₹300 from Sharma ji |
| "Naya customer Meena didi, 80 ka udhaar" | create customer + credit ₹80 |
| "Ek sau bees Verma ji ke naam likho" | credit ₹120 to Verma ji |
| "Gupta ji ka last entry hata do" | delete last entry (with confirmation) |

**Done when:** the five utterances above each produce the correct entry and spoken confirmation.

#### F1.3 UPI / Soundbox sync (mocked in MVP)

- Pull Paytm UPI transactions → `ledger_entries` with `type='sale'` (walk-in) or `type='payment'` when the payer matches a known customer (by VPA or phone).
- MVP: `POST /sync/upi/mock` seeds realistic transactions; a "Sync" button on Home triggers it.
- Gives the score real cash-flow data and auto-closes udhaar when customers pay by UPI.

#### F1.4 Supplier bill photo (P2)

- Photo of a distributor bill → line items (product, qty, rate) → `purchases` table → feeds **Stock** (F5) and **Comply** (F8).

#### F1.5 Ledger & customer views

- **Ledger screen:** chronological list, filter by customer / type / date; total udhaar outstanding at the top.
- **Customer screen:** balance, full history, open promises, reminders sent, "Remind now" and "Call (AI)" buttons.
- **Customer list:** sorted by amount due (highest first), with labels: 🟢 on time / 🟡 slow / 🔴 overdue (always with text, never colour only).

---

### F2 — Collect (udhaar recovery)

#### F2.1 Smart reminders with UPI link

**User story:** As a merchant, I want my customers reminded politely without me having to ask.

**Flow**
1. Every entry can carry a `due_date` (default: merchant setting, e.g. 15 days; or spoken "Friday tak").
2. A BullMQ job `reminders:due` runs every morning at 9:00 IST (and on demand from the Collect screen).
3. For each due balance, the **Collect agent** picks:
   - **Channel:** in-app/WhatsApp (MVP: in-app message + copyable WhatsApp text; WhatsApp Cloud API test number optional).
   - **Tone:** `gentle` (long-standing regular, first reminder) or `firm` (repeated delay, broken promise). Never threatening.
   - **Time:** avoid early morning/late night; prefer the customer's usual paying time if known.
4. Message includes a **Paytm UPI payment link** (mock link → `/pay/:token` page that simulates payment).
5. Merchant approves the tone **once** (Settings: "Auto-send gentle reminders" on/off; firm reminders always ask first).
6. When paid (mock), the ledger entry is closed and the merchant gets "Gupta ji ne ₹450 de diye ✓".

**Message templates (Hinglish, LLM may personalise within these limits)**
- Gentle: "Namaste Gupta ji 🙏, Sharma General Store se yaad dila rahe hain — aapka ₹450 baaki hai. Aasaani se yahan se de sakte hain: {link}"
- Firm: "Gupta ji, ₹450 ka bhugtan 20 din se baaki hai. Kripya aaj {link} se jama karein ya bataayein kab tak denge."

#### F2.2 AI voice call (simulated in browser)

**User story:** As a merchant, I want the AI to call customers who ignore reminders, in their language.

**Why simulated:** real telephony (Exotel/Twilio) costs money. We simulate a phone call between two browser
tabs/phones: **tab A = AI agent**, **tab B = customer** (`/call-sim/:sessionId`).

**Flow**
1. Merchant taps **Call (AI)** on a customer, or the agent escalates after an ignored reminder.
2. A call session starts; the customer tab "rings".
3. Agent speaks (Sarvam TTS): "Namaste, main Sharma General Store ki taraf se bol raha hoon. Aapka ₹450 baaki hai. Kab tak de payenge?"
4. Customer speaks → Sarvam STT → LLM classifies intent:
   - `pay_now` → send UPI link, stay on line until "paid" or end.
   - `promise` ("Friday ko dunga") → extract date → create `promise` → confirm: "Theek hai, Friday ko yaad dila denge."
   - `partial` ("abhi 200 deta hoon") → link for ₹200 + promise for remainder.
   - `dispute` ("maine to de diya tha") → log dispute → notify merchant → end politely.
   - `wrong_person` / `busy` → apologise, reschedule.
5. Max 3 turns from the agent; call summary saved; merchant sees a transcript + outcome.

**Rules:** introduce the shop by name, never threaten, never share other customers' info, stop if asked.

#### F2.3 Promise-to-pay tracking

- `promises` table: amount, promised date, status `open | kept | broken`.
- Day after the promised date: if unpaid → status `broken` → gentle follow-up → counts toward `firm` tone next time.
- Kept promises improve the customer's trust level and the merchant's recovery rate.

#### F2.4 Payment prediction (light)

- Per customer: probability of paying within 7 days from history (avg days to pay, broken promises, amount size).
- MVP: rule-based score → labels **Will pay / Might delay / Risky**, shown on the customer list; used to order reminders.

**Done when:** a due entry triggers a reminder with a working mock link; an ignored reminder → simulated call → "Friday ko dunga" creates a promise and a scheduled follow-up job; paying via the mock link closes the balance.

---

### F3 — Credit

#### F3.1 Explainable credit score

**User story:** As a merchant, I want to know my credit health and why it changes.

- Score **300–900** (familiar CIBIL-like range), computed by the **scorecard** (§14) from ledger + UPI data.
- Recomputed nightly (`credit:recompute` job) and on demand.
- Each factor's contribution is stored in `credit_scores.factors` so the LLM can explain:
  "Aapka score 712 hai. Pichle mahine se 18 badha, kyunki udhaar wapasi 64% se 78% ho gayi."
- **Credit screen:** big score, change since last month, top 3 factors up/down, "How to improve" tips (generated from weakest factors).

#### F3.2 Voice loan journey + offer

**Flow**
1. Merchant asks: "Mujhe loan mil sakta hai?" (mic on any screen; intent routed to credit agent).
2. Agent fetches score + factors → speaks score and reason.
3. If score ≥ threshold (MVP: 600) → **consent step**: "Kya aap Paytm ko apna hisaab dikhane ki anumati dete hain?" (Account Aggregator–style consent, mocked; stored in `consents`).
4. Offer generated (mock lender rules): amount = f(avg monthly sales, score), tenure 3–12 months, EMI computed.
   Spoken: "Aapko ₹50,000 tak ka loan mil sakta hai, 6 mahine ke liye, ₹9,100 mahina."
5. → **Teach-back** (F3.3) → accept → status `accepted` → mock disbursal → repayments become ledger entries.
6. Below threshold → no offer; instead "Score badhane ke 3 tareeke" (improvement tips).

#### F3.3 Teach-back check

**Why:** proves the borrower understood the terms → fewer defaults, less mis-selling, better compliance story.

**Flow**
1. After the offer, agent asks: "Ek baar aap batayein — har mahine kitna dena hoga, aur kitne mahine?"
2. Merchant answers by voice → LLM compares with the actual EMI and tenure (tolerance ±10% on amount).
3. Correct → `teach_back_passed = true` → "Bilkul sahi! Aage badhein?"
4. Wrong/unclear → re-explain in simpler words with an example ("Har mahine ki 5 tareekh ko ₹9,100, kul 6 baar") → ask again. Max 2 retries, then suggest talking to a Paytm agent.

**Done when:** asking for a loan by voice returns a spoken score + reason + offer; a wrong teach-back answer triggers a re-explanation; a correct one marks the offer accepted.

---

### F4 — Udhaar-as-a-Service (our biggest idea)

**User story:** As a merchant, I want to give credit to trusted customers without carrying the risk myself.

**Flow**
1. Merchant marks a sale as udhaar for an **eligible customer** (badge "Paytm Udhaar available").
2. Eligibility = customer's history in this ledger: ≥ 3 months, ≥ 80% repaid on time, no open dispute.
   Limit = based on their average udhaar and repayment speed (MVP: rule table).
3. Paytm (mock) pays the merchant **instantly** → ledger shows `type='payment', source='paytm_udhaar'`.
4. The customer's repayment obligation moves to Paytm → customer repays via UPI link (mock).
5. Merchant pays a small fee per transaction (configurable; MVP display only).

**Why it matters:** merchant gets cash today and stops carrying credit risk; customer builds a credit history; Paytm gets a new lending product built on data no one else has.

**MVP:** UI + mock state machine `offered → funded → repaying → closed`; no real money.

---

### F5 — Stock (P2, prototype)

- Inventory = purchases (supplier bills, F1.4) − sales (UPI + voice "2 kilo chawal" items).
- **Restock alert:** "Maggi khatam hone wala hai" when projected stock < 3 days of average sales.
- **Demand forecast:** moving average + festival calendar bump (Diwali, Holi, Eid, Navratri) + weekday pattern.
- **Voice reorder:** "Maggi order kar do" → draft order to the usual supplier → merchant confirms → WhatsApp text to supplier (copy/share in MVP).

---

### F6 — Ask (voice Q&A + daily brief) (P1, light)

- **Ask anything about the shop:** "Aaj kitni sale hui?", "Is hafte kitna kamaya?", "Sabse zyada udhaar kiska hai?", "Kaunsa item sabse zyada bika?"
- Implementation: LLM with **tools** over SQL views (`get_sales(period)`, `get_top_debtors(n)`, `get_top_items(period)`, `get_balance(customer)`). **Never** free-form SQL from the LLM.
- Answer spoken + a small card on screen.
- **Daily brief** (job at 8:30 IST): "Kal ₹8,200 ki sale hui, ₹1,500 udhaar wapas aaya, 3 logon ka udhaar due hai." Shown on Home with a play button; Soundbox read-out simulated.

---

### F7 — Protect (P2, prototype)

- **Payment verification:** customer shows a "paid" screenshot → merchant says "check karo" → we verify by looking up the transaction status via the payment API (mock), **not** by judging the image. Voice alert: "Yeh payment confirm nahi hua hai."
- **Insurance suggestion:** shop/stock cover sized to estimated inventory value; explained by voice (display only).
- **Scam awareness:** warns on known patterns (e.g., "refund request via collect link").

---

### F8 — Comply (P2, prototype)

- Auto-categorise transactions (sales, purchases, expenses).
- Monthly **GST summary** and **P&L** view; export as PDF/CSV (accountant-ready).
- Voice: "Is quarter ka GST kitna banega?" → estimate + disclaimer "CA se confirm karein".

---

### F9 — Voice layer (shared)

- One reusable **MicButton** component: push-to-talk, waveform, max 30 s, cancel by sliding.
- Server `voice` service: `stt(audio, langHint)`, `tts(text, lang, voice)`.
- **Intent router:** every utterance first goes to a small LLM classification → `capture | collect | credit | ask | stock | other` → routed to the right handler. So the mic works from any screen.
- TTS responses cached by hash(text+voice) in Redis/object storage.
- Fallback: if STT fails, show "Samajh nahi aaya, dobara bolein" + allow typing.

### F10 — Notifications

- In-app notification centre (MVP), web push via PWA (P1), WhatsApp (optional test number).
- Events: payment received, promise due, promise broken, reminder sent, new score, loan status, daily brief.

### F11 — Settings & consent

- Language, voice (male/female Bulbul voice), default due days, auto-send gentle reminders on/off, quiet hours.
- Consents: view, grant, **revoke** (revoking stops sharing; data export and delete available — DPDP).
- Helper accounts (add/remove).

---

## 6. Screens and UI

| Route | Screen | Key elements |
|---|---|---|
| `/onboarding` | Language, phone/OTP, shop name, consent | Big buttons, voice read-out |
| `/` | **Home** | Big mic, "Scan khata", today's summary (sales, udhaar due, collected), daily brief play button, quick actions |
| `/capture/review` | Photo review | Row cards, confidence highlight, "Save all", voice edit |
| `/ledger` | Ledger | Filters, totals, entry list |
| `/customers` | Customer list | Sorted by due, labels (Will pay / Might delay / Risky) |
| `/customers/[id]` | Customer detail | Balance, history, promises, "Remind now", "Call (AI)" |
| `/collect` | Collections dashboard | Due today, promises today, broken promises, run reminders, call log |
| `/call-sim/[sessionId]` | Simulated call (customer side) | Ringing UI, mic, live transcript |
| `/pay/[token]` | Mock UPI payment page | Amount, "Pay with UPI" → success |
| `/credit` | Credit | Score gauge, change, factors, tips, "Check loan" |
| `/credit/offer` | Loan offer | Amount, EMI, tenure, consent, teach-back, accept |
| `/ask` | Ask (optional) | Chat-like voice Q&A history |
| `/stock` | Stock (prototype) | Low-stock list, reorder |
| `/settings` | Settings & consent | As F11 |

**Design rules:** mobile-first (360px), tap targets ≥ 48px, mic button on every main screen (bottom centre),
large rupee figures, Hindi labels with English sub-labels, high contrast, status always in words plus colour.

---

## 7. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js (App Router) + Tailwind CSS** | Web-first; **PWA** (manifest + service worker) for mobile |
| Backend | **Node.js + TypeScript** (Fastify or Express) | Separate `apps/api`; Next.js API routes only for trivial things |
| Validation | **zod** | Shared schemas in `packages/shared` |
| Voice | **Sarvam AI** | STT (Saarika/Saaras), TTS (Bulbul), translate, Sarvam Vision OCR |
| LLM | **Groq** | Fast tool-calling text model for agents; vision model for OCR fallback |
| Agents | **LangGraph.js** | Collect agent, call agent, credit agent |
| Database | **PostgreSQL** | `pgvector` later for Ask |
| ORM/query | Drizzle or Prisma (team's choice; pick one and stick to it) | Migrations committed |
| Queue/cache | **Redis + BullMQ** | Jobs (§13) + AI response cache |
| Realtime | Server-Sent Events or WebSocket | Call simulation + live updates |
| Payments | **Paytm payment links — in-app mock by default, Paytm staging optional** | `PAYTM_MODE=mock` (in-app `/pay/:token`) or `staging` (Paytm Create Link API on `securegw-stage.paytm.in`, test instruments only) |

**Hard constraints**
- **No credit card** → free tiers only: Vercel (web), Render (API; sleeps when idle — wake before demo), Neon/Supabase (Postgres), Upstash (Redis). Fallback: local + Cloudflare Tunnel.
- **No real phone calls** → browser call simulation.
- **Rate limits** → cache every AI call; pre-warm demo data.

---

## 8. Architecture

```
┌────────────────────────── CLIENTS ──────────────────────────┐
│ Web PWA (Next.js)   │  /call-sim (customer tab)  │ WhatsApp* │
└──────────┬──────────────────────┬───────────────────────────┘
           │ HTTPS (JSON, multipart audio/image)   SSE/WebSocket
┌──────────▼───────────────────────────────────────────────────┐
│ Node.js API (TypeScript)                                     │
│  routes: auth · capture · ledger · customers · collect ·     │
│          calls · payments(mock) · credit · ask · stock ·     │
│          settings                                            │
│  services: sarvam · groq · ocr · scorecard · paytm.mock      │
│  agents (LangGraph.js): intentRouter · collect · call ·      │
│          credit/teachBack · ask                              │
└──────┬───────────────────────┬───────────────────┬───────────┘
       │                       │                   │
┌──────▼──────┐      ┌─────────▼────────┐   ┌──────▼────────┐
│ PostgreSQL  │      │ Redis + BullMQ   │   │ External AI    │
│ ledger etc. │      │ jobs + cache     │   │ Sarvam · Groq  │
└─────────────┘      └──────────────────┘   └───────────────┘
* optional
```

**Voice request, end to end:** mic audio → `POST /voice/command` → Sarvam STT → intent router (Groq) →
handler (e.g., capture → `create_ledger_entry` tool) → Postgres write → reply text → Sarvam TTS → audio URL → client plays.

---

## 9. Repo layout

```
hisaab-ai/
├─ apps/
│  ├─ web/                          # Next.js + Tailwind PWA
│  │  ├─ app/
│  │  │  ├─ (onboarding)/onboarding/
│  │  │  ├─ page.tsx                # Home
│  │  │  ├─ capture/review/
│  │  │  ├─ ledger/  customers/[id]/  collect/
│  │  │  ├─ call-sim/[sessionId]/  pay/[token]/
│  │  │  ├─ credit/  credit/offer/  ask/  stock/  settings/
│  │  ├─ components/                # MicButton, CameraCapture, EntryCard, BalanceBadge,
│  │  │                             # ScoreGauge, FactorList, CallScreen, OfferCard, AudioPlayer
│  │  ├─ lib/api.ts  lib/audio.ts  lib/format.ts
│  │  └─ public/manifest.json  sw.js
│  └─ api/
│     ├─ src/index.ts
│     ├─ src/routes/                # one file per area (see §11)
│     ├─ src/services/              # sarvam.ts groq.ts ocr.ts scorecard.ts paytm.mock.ts cache.ts
│     ├─ src/agents/                # intentRouter.ts collectAgent.ts callAgent.ts creditAgent.ts askAgent.ts
│     ├─ src/prompts/               # *.md prompt templates (see §12)
│     ├─ src/jobs/                  # queues.ts + workers (see §13)
│     ├─ src/db/                    # schema, migrations, views
│     └─ src/seed/                  # synthetic data generator (see §15)
├─ packages/shared/                 # zod schemas, types, constants
├─ fixtures/khata/                  # sample khata photos (handwritten by the team) for tests/demo
├─ .env.example
└─ CLAUDE.md
```

---

## 10. Data model

Money is stored as **integer paise** (`BIGINT`). Times in UTC (`TIMESTAMPTZ`), displayed in IST.

> **Implemented schema:** `apps/api/src/db/schema.ts` (Drizzle) is authoritative; the SQL below is the
> original design. Deviations (2026-10-31):
> - `users` gains `auth_user_id` (Neon Auth user id) and `email`; `users.phone` and `merchants.phone` are
>   optional, since login is email OTP.
> - `disputes` gains `merchant_id` (every table is merchant-scoped, §16).
> - `customer_balances.earliest_due` is the due date of the **oldest credit not yet covered by payments**
>   (payments settle the oldest credits first), not the minimum due date over all credits.
> - `consents.purpose` also takes `data_storage` (accepted at onboarding).
> - Merchant-scoped foreign keys are `NOT NULL` and cascade on merchant delete.
> - `customer_network_consents (phone PK, granted, granted_at, revoked_at)` and an index on `customers.phone`
>   for the **Paytm customer profile** (one customer across shops, linked by phone, consent first; rules in
>   `apps/api/src/network/score.ts`). Added 2026-10-31 at the team's request.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  language TEXT NOT NULL DEFAULT 'hi-IN',
  city TEXT,
  paytm_linked BOOLEAN DEFAULT false,
  default_due_days INT DEFAULT 15,
  auto_gentle_reminders BOOLEAN DEFAULT true,
  quiet_hours JSONB DEFAULT '{"start":"21:00","end":"09:00"}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','helper')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',               -- "Gupta jee", "Ramesh Gupta"
  phone TEXT, upi_vpa TEXT,
  language TEXT DEFAULT 'hi-IN',
  trust_level TEXT DEFAULT 'regular' CHECK (trust_level IN ('new','regular','trusted','risky')),
  pay_prediction TEXT,                        -- will_pay | might_delay | risky
  udhaar_service_eligible BOOLEAN DEFAULT false,
  udhaar_service_limit_paise BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE khata_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  image_url TEXT NOT NULL,
  raw_text TEXT,
  ocr_provider TEXT,                          -- sarvam | groq
  status TEXT DEFAULT 'processing',           -- processing | review | saved | failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),  -- null for walk-in sales
  type TEXT NOT NULL CHECK (type IN ('credit','payment','sale','purchase','expense')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  items TEXT,
  source TEXT NOT NULL CHECK (source IN ('photo','voice','upi','manual','paytm_udhaar','loan')),
  scan_id UUID REFERENCES khata_scans(id),
  transcript TEXT,                            -- original speech, for audit
  confidence REAL,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending_confirm','confirmed','deleted')),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON ledger_entries (merchant_id, customer_id, entry_date);

-- Customer balance = sum(credit) - sum(payment) over confirmed entries
CREATE VIEW customer_balances AS
SELECT c.id AS customer_id, c.merchant_id, c.name,
  COALESCE(SUM(CASE WHEN e.type='credit'  THEN e.amount_paise END),0)
- COALESCE(SUM(CASE WHEN e.type='payment' THEN e.amount_paise END),0) AS balance_paise,
  MIN(e.due_date) FILTER (WHERE e.type='credit') AS earliest_due
FROM customers c LEFT JOIN ledger_entries e
  ON e.customer_id = c.id AND e.status = 'confirmed'
GROUP BY c.id;

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  channel TEXT CHECK (channel IN ('in_app','whatsapp','sms','call_sim')),
  tone TEXT CHECK (tone IN ('gentle','firm')),
  message TEXT,
  amount_paise BIGINT,
  payment_token TEXT UNIQUE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('queued','sent','paid','ignored')),
  approved_by_merchant BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  amount_paise BIGINT,
  promised_date DATE NOT NULL,
  source TEXT,                                -- call_sim | reminder_reply | merchant
  status TEXT DEFAULT 'open' CHECK (status IN ('open','kept','broken')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  status TEXT DEFAULT 'ringing',              -- ringing | live | ended
  outcome TEXT,                               -- paid | promise | partial | dispute | no_answer | refused
  transcript JSONB DEFAULT '[]',              -- [{role:'agent'|'customer', text, at}]
  started_at TIMESTAMPTZ DEFAULT now(), ended_at TIMESTAMPTZ
);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  note TEXT, status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  score INT NOT NULL CHECK (score BETWEEN 300 AND 900),
  factors JSONB NOT NULL,                     -- [{key, value, weight, points, direction}]
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  purpose TEXT NOT NULL,                      -- lending | insurance | analytics
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(), revoked_at TIMESTAMPTZ
);

CREATE TABLE loan_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  score_id UUID REFERENCES credit_scores(id),
  amount_paise BIGINT NOT NULL,
  tenure_months INT NOT NULL,
  annual_rate_pct NUMERIC(5,2) NOT NULL,
  emi_paise BIGINT NOT NULL,
  teach_back_attempts INT DEFAULT 0,
  teach_back_passed BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'offered' CHECK (status IN ('offered','accepted','disbursed','declined','expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE udhaar_service_txns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  customer_id UUID REFERENCES customers(id),
  amount_paise BIGINT NOT NULL,
  fee_paise BIGINT DEFAULT 0,
  status TEXT DEFAULT 'offered' CHECK (status IN ('offered','funded','repaying','closed','defaulted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- P2 modules
CREATE TABLE products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id UUID REFERENCES merchants(id),
  name TEXT, unit TEXT, stock_qty NUMERIC, reorder_level NUMERIC, supplier TEXT);
CREATE TABLE purchases (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id UUID REFERENCES merchants(id),
  product_id UUID REFERENCES products(id), qty NUMERIC, rate_paise BIGINT, bill_scan_url TEXT,
  purchase_date DATE DEFAULT CURRENT_DATE);
CREATE TABLE notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id UUID REFERENCES merchants(id),
  kind TEXT, title TEXT, body TEXT, read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
```

---

## 11. API reference

Base URL `NEXT_PUBLIC_API_URL`. Auth: `Authorization: Bearer <jwt>`. All bodies validated with zod.
Errors: `{ "error": { "code": "STRING", "message": "human text", "hint"?: "..." } }`.

| Area | Method & path | Body / params | Returns |
|---|---|---|---|
| Auth | Neon Auth via web `/api/auth/*` | email + password; emailed 6-digit OTP on sign-up | session cookie (web); short-lived JWT for this API |
| Merchant | `POST /merchants` · `GET /me` · `PATCH /me/settings` | profile / settings | merchant |
| Voice | `POST /voice/command` | multipart `audio`, `langHint?` | `{transcript, intent, result, replyText, replyAudioUrl}` |
| | `POST /voice/tts` | `{text, lang, voice?}` | `{audioUrl}` (cached) |
| Capture | `POST /capture/photo` | multipart `image[]` | `{scanId, rows:[EntryDraft]}` |
| | `POST /capture/voice` | multipart `audio` | `{entry, replyText, replyAudioUrl, followUp?}` |
| | `POST /capture/confirm` | `{scanId?, rows:[EntryDraft]}` | `{saved:[Entry]}` |
| | `POST /sync/upi/mock` | `{days?}` | `{imported}` |
| Ledger | `GET /ledger` | `?customerId&type&from&to&page` | `{entries, totals}` |
| | `PATCH /ledger/:id` · `DELETE /ledger/:id` | edit / soft delete | entry |
| Customers | `GET /customers` | `?sort=due` | `[CustomerWithBalance]` |
| | `GET /customers/:id` | — | balance, history, promises, reminders, calls |
| | `POST /customers` · `PATCH /customers/:id` | — | customer |
| Collect | `GET /collect/dashboard` | — | due today, promises today, broken, totals |
| | `POST /collect/run` | `{customerIds?}` | `{queued:[Reminder]}` |
| | `POST /collect/reminders/:id/approve` | — | reminder |
| Calls | `POST /calls` | `{customerId}` | `{callId, joinUrl}` |
| | `GET /calls/:id/stream` | SSE | agent/customer turns, status |
| | `POST /calls/:id/customer-turn` | multipart `audio` | `{transcript}` |
| | `POST /calls/:id/end` | — | `{outcome, summary}` |
| Payments (mock) | `GET /pay/:token` | — | amount, merchant, customer |
| | `POST /pay/:token/confirm` | — | `{status:'paid'}` → closes balance |
| | `POST /payments/verify` | `{txnRef}` | `{verified:boolean}` (Protect) |
| Credit | `GET /credit/score` | `?recompute=true` | `{score, change, factors, tips}` |
| | `POST /credit/ask` | multipart `audio` or `{text}` | spoken score + offer |
| | `POST /consents` · `DELETE /consents/:id` | `{purpose}` | consent |
| | `POST /credit/offers` | — | `LoanOffer` (needs lending consent) |
| | `POST /credit/offers/:id/teach-back` | multipart `audio` or `{text}` | `{passed, replyText, replyAudioUrl}` |
| | `POST /credit/offers/:id/accept` | — | offer (`accepted` → mock `disbursed`) |
| Udhaar svc | `GET /udhaar-service/eligible` | — | eligible customers + limits |
| | `POST /udhaar-service` | `{customerId, amount}` | txn (`funded`) |
| Ask | `POST /ask` | multipart `audio` or `{text}` | `{answerText, audioUrl, card}` |
| | `GET /brief/today` | — | `{text, audioUrl, stats}` |
| Stock | `GET /stock/low` · `POST /stock/reorder` | — | products / draft order |
| Comply | `GET /reports/gst?quarter=` · `GET /reports/pnl?month=` | — | summary + CSV/PDF link |
| Notifications | `GET /notifications` · `POST /notifications/:id/read` | — | list |

---

## 12. AI layer

All AI calls go through `services/*` wrappers that add: **timeout (10 s)**, **1 retry**, **Redis cache**
(key = sha256 of model + input), **structured logging** (latency, tokens), and **fallback** behaviour.

### Models
| Use | Provider | Notes |
|---|---|---|
| Speech-to-text | Sarvam (Saarika/Saaras) | language auto-detect; return `language_code` |
| Text-to-speech | Sarvam Bulbul | merchant's language and chosen voice |
| OCR (primary) | Sarvam Vision | Indic handwriting |
| OCR (fallback) / vision | Groq vision model (`GROQ_VISION_MODEL`) | returns JSON rows |
| Agents, extraction, classification | Groq text model (`GROQ_TEXT_MODEL`) | tool calling; `temperature 0–0.3` |

### Tools exposed to the LLM (function calling)
`create_ledger_entry`, `record_payment`, `find_customer`, `create_customer`, `delete_last_entry`,
`get_balance`, `get_sales`, `get_top_debtors`, `get_top_items`, `send_reminder`, `create_promise`,
`get_credit_score`, `create_loan_offer`, `check_teach_back`, `create_reorder_draft`.
Tools validate inputs with zod and enforce merchant scoping server-side. **The LLM never writes SQL.**

### Prompt files (`apps/api/src/prompts/`)
- `intent_router.md` — classify utterance → `capture | payment | collect | credit | ask | stock | settings | other`; output JSON only.
- `extract_entry.md` — Hinglish → entry JSON. Must parse Hindi number words ("ek sau bees" = 120, "dedh sau" = 150, "dhai sau" = 250, "sawa" = +¼, "saade" = +½), units ("kilo", "packet"), relative dates ("kal", "parso", "Friday tak").
- `khata_ocr_struct.md` — raw OCR text → rows with confidence; skip totals and crossed-out lines.
- `reminder_message.md` — personalise within the approved templates; max 300 characters; never threatening; include `{link}`.
- `call_agent.md` — persona: polite assistant of `{shop_name}`; goals: inform amount, get payment or a date; ≤ 3 agent turns; intents: `pay_now | promise | partial | dispute | wrong_person | busy | refuse`.
- `score_explainer.md` — turn factors JSON into 2–3 plain Hindi sentences + 3 improvement tips.
- `teach_back_judge.md` — compare borrower's answer with `{emi, tenure}`; tolerance ±10%; output `{passed, missing:[...], simpler_explanation}`.
- `ask_agent.md` — answer only from tool results; if no data, say so.

### Example: extraction output contract
```json
{
  "intent": "credit",
  "customer_name": "Gupta ji",
  "amount_rupees": 120,
  "items": "2 kg chawal",
  "due_date": null,
  "confidence": 0.93,
  "needs_clarification": null
}
```

### Agents (LangGraph.js)
- **intentRouter** — single node; routes to handlers.
- **collectAgent** — `select_due → predict → choose_tone → compose → (auto_send | await_approval) → wait → (paid → close) | (ignored → escalate_call)`.
- **callAgent** — `greet → state_amount → listen → classify → (pay_now → send_link → confirm) | (promise → extract_date → create_promise) | (partial → link + promise) | (dispute → log + notify) | (busy → reschedule) → summarise → end`.
- **creditAgent** — `fetch_score → explain → (score < 600 → tips → end) | consent → offer → teach_back (≤ 2 retries) → accept → mock_disburse`.
- **askAgent** — tool-calling loop over read-only tools, max 3 tool calls.

---

## 13. Background jobs

BullMQ queues on Redis. All times IST.

| Queue / job | Schedule | Does |
|---|---|---|
| `reminders:due` | daily 09:00 + on demand | find due balances → collectAgent per customer (respects quiet hours) |
| `promises:check` | daily 10:00 | mark overdue promises `broken` → gentle follow-up |
| `followups:scheduled` | delayed jobs | fire the follow-up created by a promise ("Friday") |
| `credit:recompute` | nightly 02:00 + after big changes | recompute scores, notify on change ≥ 10 points |
| `predictions:update` | nightly 02:30 | refresh `pay_prediction` per customer |
| `brief:daily` | daily 08:30 | build daily brief text + TTS |
| `stock:check` | daily 07:00 | low-stock alerts (P2) |
| `ocr:process` | on upload | OCR + structuring for khata scans |

Jobs are idempotent (dedupe key = merchant + customer + date) and retried with exponential backoff.

---

## 14. Credit scorecard

Transparent, rule-based for the MVP (no black-box ML). Computed over the last 6 months.

| Factor (key) | Measures | Weight | Better when |
|---|---|---|---|
| `recovery_rate` | udhaar repaid ÷ udhaar given | 25% | higher |
| `sales_consistency` | 1 − coefficient of variation of weekly sales | 20% | higher |
| `promise_reliability` | promises kept ÷ promises made | 15% | higher |
| `digital_share` | UPI sales ÷ total sales | 15% | higher |
| `avg_days_to_recover` | mean days from credit to payment | 10% | lower |
| `tenure_months` | months of ledger history | 10% | higher (cap 12) |
| `debtor_concentration` | share of udhaar held by top 3 customers | 5% | lower |

**Formula:** each factor normalised to 0–1 → `raw = Σ weight × normalised` → `score = round(300 + raw × 600)`.
Store `points` and `direction` per factor in `credit_scores.factors` for explanations and tips.

**Loan offer (mock lender rules):**
- Eligible if `score ≥ 600` and lending consent granted.
- `amount = min(₹2,00,000, avg_monthly_sales × multiplier)`; multiplier 0.5 (600–679), 0.8 (680–759), 1.0 (760+).
- Tenure 6 months default (3/6/9/12 allowed); rate 18–24% p.a. by band.
- EMI = standard reducing-balance formula; store in paise.

**Udhaar-as-a-Service eligibility (per customer):** ≥ 3 months history, ≥ 80% repaid on time, no open dispute;
limit = `min(₹5,000, 1.5 × average udhaar ticket)`.

---

## 15. Synthetic seed data

Real Paytm data isn't available, so `apps/api/src/seed` generates a believable dataset:

- **50 merchants** across 5 cities (Noida, Delhi, Kanpur, Lucknow, Jaipur), with mixed health: ~30% strong, ~50% average, ~20% weak.
- Each with **20–60 customers** (Indian names with "ji/didi/bhaiya" variants as aliases).
- **6 months** of data: daily walk-in sales (UPI share 30–80%), udhaar entries (₹20–₹2,000), payments with realistic delays, ~25% of customers slow, ~8% risky; promises kept/broken; festival spikes (Diwali, Holi).
- One **demo merchant**: "Sharma General Store" (owner Ramesh Sharma), score ~700, customers Gupta ji (seeded at ₹330 due; the demo's voice entry of ₹120 brings it to the ₹450 the AI call quotes), Verma ji, Meena didi, Khan sahab, etc., set up to match the demo script (§22).
- `fixtures/khata/` holds 3–5 handwritten khata page photos made by the team, with expected outputs for tests.

Commands: `pnpm seed` (all), `pnpm seed:demo` (demo merchant only, resettable before each demo).

---

## 16. Trust, privacy, safety, compliance

- **Consent:** lending data shared only after explicit consent (Account Aggregator–style flow; mocked). Consents are viewable and revocable.
- **DPDP Act principles:** purpose limitation, data minimisation, export and delete on request.
- **Human in the loop:** merchant approves firm reminders, all loans, all supplier orders.
- **Respectful collections:** no threats, no shaming, quiet hours, opt-out honoured, max 1 reminder/day and 1 AI call/3 days per customer.
- **Fraud:** verify payments via transaction status, never by trusting a screenshot.
- **Data separation:** every query scoped by `merchant_id` (enforce in a middleware + tests); helpers can't see credit.
- **Audit:** keep the original transcript/photo for every AI-created entry.
- **Data residency:** prefer India regions where the free tier allows.
- **Disclaimers:** scores and offers are demo/mock; GST estimates say "CA se confirm karein".

---

## 17. Error handling and edge cases

| Situation | Behaviour |
|---|---|
| STT returns nothing / noise | "Samajh nahi aaya, dobara bolein" + show text input |
| Amount missing | Ask once: "Kitne rupaye?" |
| Customer ambiguous | Offer top 2 matches by voice and buttons |
| New customer name | Confirm before creating: "Naya customer Meena didi banaun?" |
| OCR low confidence | Mark `pending_confirm`, read aloud, never auto-save |
| Duplicate entry (same customer, amount, within 2 min) | "Yeh entry abhi daali thi, phir se jodun?" |
| Payment > balance | Accept; show advance balance (negative due) |
| AI provider down / rate limited | Use cached result if any; else queue and notify "thodi der mein ho jayega" |
| Network offline (PWA) | Queue voice/photo uploads in IndexedDB; sync when online |
| Customer disputes on call | Pause reminders for that customer; notify merchant |
| Promise date in the past | Ask again for a date |
| Helper tries credit screens | 403 + friendly message |

---

## 18. Hosting and environment

| Piece | Host (free tier, no card) |
|---|---|
| Web (Next.js PWA) | Vercel |
| API + workers | Render (free web service; sleeps — open it before the demo) |
| PostgreSQL | Neon or Supabase |
| Redis | Upstash |
| File storage (photos, TTS audio) | Supabase Storage (or local disk in dev) |
| Fallback | Run everything locally + Cloudflare Tunnel |

### `.env.example`
```
# Core
NODE_ENV=development
PORT=4000
JWT_SECRET=
DATABASE_URL=
REDIS_URL=
STORAGE_BUCKET_URL=
STORAGE_KEY=

# AI
SARVAM_API_KEY=
SARVAM_STT_MODEL=
SARVAM_TTS_MODEL=
SARVAM_TTS_VOICE=
GROQ_API_KEY=
GROQ_TEXT_MODEL=
GROQ_VISION_MODEL=
AI_CACHE_TTL_SECONDS=604800

# Payments: mock (in-app /pay/:token) | staging (Paytm test gateway)
PAYTM_MODE=mock
PAY_LINK_BASE_URL=http://localhost:3000/pay
PAYTM_HOST=https://securegw-stage.paytm.in
PAYTM_MID=
PAYTM_MERCHANT_KEY=

# Optional WhatsApp test number
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=

# Web
NEXT_PUBLIC_API_URL=http://localhost:4000
DEMO_OTP=123456
```

---

## 19. Conventions

- **TypeScript everywhere**, `strict: true`; pnpm workspaces monorepo.
- **Money:** integer paise in DB and APIs (`amount_paise`); convert at the edges; format with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`.
- **Dates:** UTC in DB; IST (`Asia/Kolkata`) for display and scheduling.
- **Validation:** zod schemas in `packages/shared`, reused by web and api.
- **AI calls:** only via `services/*` wrappers (cache, timeout, retry, logging).
- **Prompts:** in `src/prompts/*.md`, versioned; no prompt strings scattered in code.
- **UI copy:** simple Hinglish first, English sub-label; status in words + colour; tap targets ≥ 48px; mic on every main screen.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`); small PRs.
- **Secrets:** env vars only; never commit `.env`.
- **Logging:** request id on every log line; no personal data (names/phones) in logs beyond ids.

---

## 20. Testing

- **Unit:** Hindi number parsing, extraction prompt contract (golden inputs → expected JSON), scorecard maths, EMI formula, balance view.
- **Integration:** capture → ledger → balance; reminder → mock pay → closed; call-sim promise → follow-up job created; consent required before offer.
- **Fixtures:** `fixtures/khata/*.jpg` with expected rows; `fixtures/voice/*.webm` with expected transcripts/entries.
- **Security:** every route rejects cross-merchant ids; helper role blocked from credit.
- **Demo smoke test:** script that resets the demo merchant and runs the three demo moments end to end.

---

## 21. MVP scope, build order, team split

### In the MVP (must work live)
F0 (light), F1.1, F1.2, F1.5, F2.1, F2.2, F2.3, F3.1, F3.2, F3.3, F9, seed data, mock payments.

### Light / mocked
F1.3 UPI sync (mock), F2.4 prediction (rules), F4 Udhaar-as-a-Service (mock flow), F6 Ask + daily brief, F10 in-app notifications, F11 settings/consent.

### Prototype only (screens, sample data)
F5 Stock, F7 Protect, F8 Comply.

### Build order
1. Monorepo, DB schema, seed data, auth (demo OTP).
2. Voice layer (STT/TTS wrappers, MicButton) + intent router.
3. Capture: voice entry → ledger; ledger + customer screens.
4. Capture: khata photo → review → save.
5. Collect: reminders + mock pay page + jobs.
6. Call simulation (SSE, two tabs) + promises + follow-ups.
7. Credit: scorecard + explanation + offer + teach-back.
8. Polish: daily brief, Ask, Udhaar-as-a-Service mock, PWA install.
9. Demo hardening: cache warm-up, demo reset, backup video.

### Suggested team split (3 people)
| Member | Owns |
|---|---|
| Person A | Frontend (Next.js PWA, all screens, MicButton, camera, call-sim UI) |
| Person B | Backend core (API, DB, jobs, mock payments, scorecard, seed data) |
| Person C | AI layer (Sarvam/Groq wrappers, prompts, LangGraph agents, OCR, teach-back) |
*(Adjust to the team's strengths.)*

---

## 22. Demo script

**Setup:** demo merchant "Sharma General Store" reset (`pnpm seed:demo`); phone A = merchant app; laptop tab B = customer call-sim; caches warm.

1. **Capture (≈60 s)** — photograph a messy handwritten khata page → rows appear, one low-confidence row is read aloud and confirmed → Save. Then hold mic: *"Gupta ji, do kilo chawal, 120 udhaar"* → entry appears, spoken confirmation, Gupta ji's balance updates.
2. **Collect (≈75 s)** — open Collect → Gupta ji's reminder with UPI link shown → tap **Call (AI)** → tab B rings → AI: *"Aapka ₹450 baaki hai…"* → customer: *"Friday ko dunga"* → promise logged, follow-up scheduled; show transcript. Optionally pay ₹200 via mock link → balance drops live.
3. **Credit (≈60 s)** — hold mic: *"Mujhe loan mil sakta hai?"* → spoken score + reason → consent → offer *"₹50,000, 6 mahine, ₹9,100 mahina"* → teach-back: give a wrong answer first → AI re-explains → correct answer → accepted.

Close: *"Hisaab AI turns India's khata into collections today and credit tomorrow."*
Keep a **recorded backup video** in case the venue Wi-Fi fails.

---

## 23. Business model

The core app is free for merchants; Paytm earns from what the ledger unlocks.

| Stream | Who pays | How |
|---|---|---|
| Merchant loans | Merchant | Interest + processing fee |
| Udhaar-as-a-Service | Merchant + customer | Small fee per transaction + interest |
| UPI collections | — | More payment volume on Paytm |
| Insurance | Merchant | Commission on shop/stock cover |
| Supplier marketplace | Supplier | Fee on reorders |
| Hisaab Pro | Merchant | Optional advanced insights plan |

**Flywheel:** more entries → better score → more credit → bigger business → more entries.
**Pilot KPIs:** days to recover udhaar, share of udhaar recovered, loans approved per 100 shops.

---

## 24. Glossary

| Term | Meaning |
|---|---|
| Kirana | Neighbourhood grocery/general store |
| Khata | Handwritten credit notebook |
| Udhaar | Goods given on credit / money owed |
| Baaki | Remaining amount due |
| Jama | Deposit / payment made |
| Hisaab | Accounts, the reckoning |
| Soundbox | Paytm device that announces UPI payments aloud |
| UPI / VPA | India's instant payment system / payment address |
| Account Aggregator | RBI framework for consent-based financial data sharing |
| DPDP Act | India's Digital Personal Data Protection Act, 2023 |
| Teach-back | Borrower explains the loan terms back to confirm understanding |
| EMI | Equated monthly instalment |
