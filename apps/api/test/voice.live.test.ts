// Real Sarvam + Groq, end to end. Costs a few API calls, so it only runs with
// LIVE_AI=1 (`pnpm --filter @hisaab/api test:live`). AI keys come from the
// repo-root .env.local; the database is still the Neon `test` branch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import type { VoiceCommandResponse } from "@hisaab/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers, ledgerEntries } from "../src/db/schema.js";
import { createAi } from "../src/services/ai.js";
import { memoryCache } from "../src/services/cache.js";
import type { FileStorage } from "../src/services/storage.js";
import { audioUpload, bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

const live = process.env.LIVE_AI === "1";

describe.skipIf(!live)("voice, live providers", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const owner = newAuthUser("live-owner");

  beforeAll(async () => {
    const keys = parseEnv(
      readFileSync(fileURLToPath(new URL("../../../.env.local", import.meta.url)), "utf8"),
    );
    const log = { info: () => {}, warn: () => {} } as never;
    const ai = (storage: FileStorage) =>
      createAi(
        {
          mock: false,
          cacheTtlSeconds: 60,
          sarvam: {
            apiKey: keys.SARVAM_API_KEY!,
            sttModel: keys.SARVAM_STT_MODEL || "saaras:v4",
            sttMode: "translit",
            ttsModel: keys.SARVAM_TTS_MODEL || "bulbul:v4-flash",
            ttsVoice: keys.SARVAM_TTS_VOICE || "shubh_enhi_ads",
          },
          groq: { apiKey: keys.GROQ_API_KEY!, model: keys.GROQ_TEXT_MODEL || "openai/gpt-oss-120b" },
        },
        { cache: memoryCache(), storage, log },
      );
    t = await setupTestApp({ ai });
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(owner),
      payload: validOnboarding,
    });
    const merchantId = res.json().merchant.id;
    t.track(merchantId);
    // The demo's Gupta ji: ₹330 due.
    const [gupta] = await t.db
      .insert(customers)
      .values({ merchantId, name: "Gupta ji", aliases: ["Gupta jee", "Suresh Gupta"] })
      .returning();
    await t.db.insert(ledgerEntries).values({
      merchantId,
      customerId: gupta!.id,
      type: "credit",
      amountPaise: 33000,
      source: "photo",
      entryDate: "2026-10-10",
      dueDate: "2026-10-25",
    });
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("typed credit question → credit, with speech", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: bearer(owner),
      payload: { text: "Mujhe loan mil sakta hai?" },
    });
    const body = res.json<VoiceCommandResponse>();
    expect(body.intent).toBe("credit");
    expect(body.replyAudioUrl).toMatch(/\.mp3$/);
    const audio = await t.app.inject({ method: "GET", url: body.replyAudioUrl! });
    expect(audio.headers["content-type"]).toBe("audio/mpeg");
    expect(audio.rawPayload.length).toBeGreaterThan(5_000);
  });

  it("spoken demo line: TTS audio → STT → router → Groq extraction → ledger → 'Ab kul ₹450 baaki'", async () => {
    const tts = await t.app.inject({
      method: "POST",
      url: "/voice/tts",
      headers: bearer(owner),
      payload: { text: "Gupta ji, do kilo chawal, ek sau bees udhaar." },
    });
    const mp3 = await t.app.inject({ method: "GET", url: tts.json().audioUrl });
    const upload = audioUpload(mp3.rawPayload, "audio/mpeg");
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: { ...bearer(owner), ...upload.headers },
      payload: upload.payload,
    });
    const body = res.json<VoiceCommandResponse>();
    expect(body.transcript.toLowerCase()).toContain("gupta");
    expect(body.intent).toBe("capture");
    expect(body.entry).toMatchObject({ customerName: "Gupta ji", amountPaise: 12000, balancePaise: 45000 });
    expect(body.replyText).toBe("Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki.");
  });
});
