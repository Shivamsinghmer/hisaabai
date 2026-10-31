// Demo rehearsal (CLAUDE.md §22): runs the three demo moments end to end against
// the seeded Sharma General Store with REAL Sarvam + Groq, asserts the numbers
// the pitch quotes, and as a side effect warms the AI caches (TTS mp3 files in
// UPLOAD_DIR and Groq results in Redis), so the live demo answers instantly.
//
//   pnpm demo:smoke     → reset demo shop → run → reset again (clean for the demo)
//
// Auth is stubbed with the demo owner's real auth id; everything after the token
// check (membership, roles, scoping) is the production code path.
import { formatPaise } from "@hisaab/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { buildApp } from "../app.js";
import { createDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { env } from "../env.js";
import { redis, redisPrefix } from "../redis.js";
import { DEMO_MERCHANT_ID } from "../seed/demo.js";
import { createAi } from "../services/ai.js";
import { memoryCache, redisCache } from "../services/cache.js";
import { localStorage } from "../services/storage.js";

const { db, pool } = createDb(env.DATABASE_URL);
const [owner] = await db
  .select({ authUserId: users.authUserId })
  .from(users)
  .where(and(eq(users.merchantId, DEMO_MERCHANT_ID), isNotNull(users.authUserId)));
if (!owner?.authUserId) {
  console.error("The demo shop has no login. Set DEMO_OWNER_EMAIL in .env.local and run `pnpm seed:demo`.");
  process.exit(1);
}
const token = `test:${owner.authUserId}`;
const headers = { authorization: `Bearer ${token}` };

const storage = localStorage(env.UPLOAD_DIR);
const cache = redis ? redisCache(redis, redisPrefix) : memoryCache();
const app = await buildApp({
  db,
  redis,
  storage,
  webOrigin: env.WEB_ORIGIN,
  payLinkBase: env.PAY_LINK_BASE_URL,
  verifyToken: async (t) => {
    if (!t.startsWith("test:")) throw new Error("bad token");
    return { id: t.slice(5), email: null };
  },
  ai: (log) =>
    createAi(
      {
        mock: false,
        cacheTtlSeconds: env.AI_CACHE_TTL_SECONDS,
        sarvam: {
          apiKey: env.SARVAM_API_KEY!,
          sttModel: env.SARVAM_STT_MODEL,
          sttMode: env.SARVAM_STT_MODE,
          ttsModel: env.SARVAM_TTS_MODEL,
          ttsVoice: env.SARVAM_TTS_VOICE,
        },
        groq: { apiKey: env.GROQ_API_KEY!, model: env.GROQ_TEXT_MODEL },
      },
      { cache, storage, log },
    ),
});

let failures = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rehearsal script reads loose JSON
async function call<T = any>(method: "GET" | "POST", url: string, payload?: unknown, auth = true) {
  const started = Date.now();
  const opts: InjectOptions = { method, url };
  if (auth) opts.headers = headers;
  if (payload !== undefined) opts.payload = payload as InjectOptions["payload"];
  const res = await app.inject(opts);
  const ms = Date.now() - started;
  if (res.statusCode >= 400)
    throw new Error(`${method} ${url} → ${res.statusCode} ${res.body.slice(0, 200)}`);
  return { body: res.json() as T, ms };
}
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

try {
  console.log("\nMoment 1 — voice entry");
  const customers = (
    await call<{ customers: { id: string; name: string; balancePaise: number }[] }>("GET", "/customers")
  ).body.customers;
  const gupta = customers.find((c) => c.name === "Gupta ji")!;
  check("Gupta ji starts at ₹330", gupta.balancePaise === 33000, formatPaise(gupta.balancePaise));
  const entry = await call("POST", "/voice/command", { text: "Gupta ji, do kilo chawal, 120 udhaar" });
  check("entry saved, balance ₹450", entry.body.entry?.balancePaise === 45000, `${entry.ms} ms`);
  check(
    "spoken reply",
    entry.body.replyText === "Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki.",
    entry.body.replyText,
  );
  check("audio ready", Boolean(entry.body.replyAudioUrl));

  console.log("\nMoment 2 — collect + AI call");
  const reminder = await call("POST", "/collect/remind", { customerId: gupta.id });
  check(
    "reminder with pay link",
    reminder.body.reminder.message.includes("/pay/"),
    reminder.body.reminder.tone,
  );
  const started = await call("POST", "/calls", { customerId: gupta.id });
  const callId = started.body.call.id as string;
  check("agent quotes ₹450", started.body.call.transcript[0].text.includes("₹450"), `${started.ms} ms`);
  await call("POST", `/call-sim/${callId}/answer`, undefined, false);
  const turn = await call("POST", `/call-sim/${callId}/turn`, { text: "Friday ko dunga" }, false);
  check("promise logged", turn.body.call.outcome === "promise", turn.body.call.promise?.promisedDate);
  check("follow-up scheduled", Boolean(turn.body.call.followUpAt), turn.body.call.followUpAt);
  check("agent confirms by voice", Boolean(turn.body.call.transcript.at(-1).audioUrl), `${turn.ms} ms`);

  console.log("\nMoment 3 — credit");
  const score = await call("GET", "/credit/score");
  check("score in the 700s", score.body.score >= 700 && score.body.score < 800, String(score.body.score));
  const ask = await call("POST", "/voice/command", { text: "Mujhe loan mil sakta hai?" });
  check("spoken score + reason", ask.body.replyText.includes("Aapka score"), ask.body.replyText.slice(0, 90));
  await call("POST", "/consents", { purpose: "lending" });
  const offer = (await call("POST", "/credit/offers")).body.offer;
  check(
    "offer ₹50,000 for 6 months",
    offer.amountPaise === 5_000_000 && offer.tenureMonths === 6,
    `${formatPaise(offer.amountPaise)} @ ${offer.annualRatePct}%`,
  );
  console.log(`    EMI ${formatPaise(offer.emiPaise)} / month`);
  const wrong = (
    await call("POST", `/credit/offers/${offer.id}/teach-back`, { text: "har mahine 20 hazaar, nau mahine" })
  ).body;
  check("wrong teach-back re-explained", wrong.passed === false && wrong.replyText.includes("6 mahine"));
  const right = (
    await call("POST", `/credit/offers/${offer.id}/teach-back`, {
      text: `har mahine ${Math.round(offer.emiPaise / 100)}, 6 mahine`,
    })
  ).body;
  check("correct teach-back passes", right.passed === true);
  const accepted = (await call("POST", `/credit/offers/${offer.id}/accept`)).body;
  check("offer accepted", ["accepted", "disbursed"].includes(accepted.status), accepted.status);
} catch (err) {
  console.error("\nRehearsal aborted:", (err as Error).message);
  failures++;
} finally {
  await app.close();
  await pool.end();
  redis?.disconnect();
}

console.log(
  failures === 0 ? "\nAll demo moments passed. Caches are warm." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
