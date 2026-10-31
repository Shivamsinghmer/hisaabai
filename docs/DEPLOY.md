# Deploying Hisaab AI (free tiers, no card)

| Piece | Host | Config in repo |
|---|---|---|
| Web (Next.js) | Vercel | `apps/web/vercel.json` |
| API (Fastify) | Render, free web service | `render.yaml` |
| Postgres + Auth | Neon, branch **`production`** | migrations in `apps/api/src/db/migrations` |
| Redis | Upstash | REST URL + token |

Order matters: **database → API → web → fill in the URLs → sign up → seed.**
Run the commands below in **Git Bash** (the `KEY=value command` form doesn't work in PowerShell).
Render free sleeps after ~15 min idle: open the API URL a minute before the demo.

---

## 1. Neon `production` branch

Neon Auth and data are per branch. Your local `.env.local` points at `dev`; the deployed
app uses `production`, so it needs its own migrations, logins and demo data.

Get the values (Neon CLI, signed in):

```bash
neon connection-string production --pooled     # → DATABASE_URL (API)
neon connection-string production              # → DATABASE_URL_UNPOOLED (migrations, seed)
neon neon-auth status --branch production      # → Base URL + JWKS URL
```

Apply the migrations to `production` from your machine, pointing only this one command at it:

```bash
cd apps/api
DATABASE_URL_UNPOOLED="<unpooled production URL>" NEON_BRANCH=production npx tsx src/db/migrate.ts
```

It should print `migrations applied: 5 (branch production)`.

## 2. API on Render

1. Render → **New → Blueprint** → pick the GitHub repo. It reads `render.yaml`.
2. Fill in the secrets it asks for:

| Key | Value |
|---|---|
| `DATABASE_URL` | pooled `production` URL (host has `-pooler`) |
| `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` | from `neon neon-auth status --branch production` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | same as `.env.local` |
| `SARVAM_API_KEY`, `GROQ_API_KEY` | same as `.env.local` |
| `WEB_ORIGIN` | put `http://localhost:3000` for now; fixed in step 4 |
| `PAY_LINK_BASE_URL` | put `http://localhost:3000/pay` for now; fixed in step 4 |

3. Deploy. Check `https://<api>.onrender.com/health` → `"postgres":{"ok":true}`, `"redis":{"ok":true}`.

## 3. Web on Vercel

1. Vercel → **Add New → Project** → the same repo.
2. **Root Directory: `apps/web`** (Framework: Next.js; `vercel.json` sets install/build to run from the monorepo root).
3. Environment variables:

| Key | Value |
|---|---|
| `API_URL` | `https://<api>.onrender.com` (no trailing slash) |
| `NEON_AUTH_BASE_URL` | the `production` Base URL |
| `NEON_AUTH_COOKIE_SECRET` | a **new** random secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

4. Deploy. Note the URL, e.g. `https://hisaabai.vercel.app`.

## 4. Connect them

1. **Render** → hisaab-api → Environment: `WEB_ORIGIN=https://hisaabai.vercel.app` and
   `PAY_LINK_BASE_URL=https://hisaabai.vercel.app/pay` → Save (redeploys).
2. **Neon console** → project → branch `production` → **Auth** → Configuration → **Domains**:
   add `https://hisaabai.vercel.app`. Without it sign-in fails with an invalid/untrusted origin error.
   Check the email-OTP settings match `dev` (verify at sign-up, method OTP).

## 5. Logins + demo data

1. On the Vercel URL, sign up with each email that should open the demo shop
   (e.g. both team emails) and verify the code. Stop at onboarding: **don't create a shop**
   (an account that already owns a shop is not linked).
2. From your machine, seed `production` (the only command that may touch it, and only with `--production`):

```bash
cd apps/api
DATABASE_URL_UNPOOLED="<unpooled production URL>" NEON_BRANCH=production DEMO_OWNER_EMAIL="first@gmail.com,second@gmail.com" npx tsx --env-file-if-exists=../../.env.local src/seed/index.ts demo --production
```

Variables set on the command line win over `.env.local`, so this writes to `production` only.
It prints `demo shop linked to DEMO_OWNER_EMAIL #1`, `#2` and the demo balances (Gupta ji ₹330).
Re-run the same command to reset the demo before presenting.

3. Log in on the Vercel URL → Sharma General Store with all data.

## 6. Before the demo

- Open `https://<api>.onrender.com/health` first (wakes Render; the first request can take ~50 s).
- Use the phone on the Vercel URL (HTTPS, so the mic works).
- Mic needs HTTPS: it works on Vercel; on plain `http://` LAN addresses browsers block it.
- Spoken-reply MP3s live on Render's disk and are lost on restart; they are regenerated on demand.

## Fallback: run locally + tunnel

If a host is down: start API + web locally (`pnpm build && pnpm start`), then

```bash
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://….trycloudflare.com` on the phone. Add that domain to Neon Auth
domains for the branch in `.env.local` (`dev`), or sign-in will fail.
