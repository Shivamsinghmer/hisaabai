import type { VoiceCommandResponse } from "@hisaab/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../src/db/schema.js";
import { MOCK_TRANSCRIPT } from "../src/services/mock.js";
import { audioUpload, bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let owner: ReturnType<typeof newAuthUser>;
let merchantId: string;

beforeAll(async () => {
  t = await setupTestApp();
  owner = newAuthUser("voice-owner");
  const res = await t.app.inject({
    method: "POST",
    url: "/merchants",
    headers: bearer(owner),
    payload: validOnboarding,
  });
  merchantId = res.json().merchant.id;
  t.track(merchantId);
});
afterAll(async () => {
  await t.close();
});

async function sayText(text: string, user = owner) {
  const res = await t.app.inject({
    method: "POST",
    url: "/voice/command",
    headers: bearer(user),
    payload: { text },
  });
  return { status: res.statusCode, body: res.json<VoiceCommandResponse>() };
}

describe("POST /voice/command — typed text", () => {
  it.each([
    ["Gupta ji, do kilo chawal, 120 udhaar", "capture"],
    ["Sharma ji ne 300 jama kiye", "payment"],
    ["Mujhe loan mil sakta hai?", "credit"],
    ["Aaj kitni sale hui?", "ask"],
    ["Khan sahab ko yaad dilao", "collect"],
    ["Maggi khatam hone wala hai", "stock"],
  ])("%s → %s", async (text, intent) => {
    const { status, body } = await sayText(text);
    expect(status).toBe(200);
    expect(body).toMatchObject({ understood: true, transcript: text, intent });
    expect(body.replyText.length).toBeGreaterThan(0);
    expect(body.replyAudioUrl).toMatch(/^\/media\/tts\/[\w-]+\.(mp3|wav)$/);
  });

  it("reads the amount back in the reply", async () => {
    const { body } = await sayText("Ek sau bees Verma ji ke naam likho");
    expect(body.intent).toBe("capture");
    expect(body.replyText).toContain("₹120");
  });

  it("answers 'not understood' for small talk", async () => {
    const { body } = await sayText("namaste");
    expect(body).toMatchObject({ understood: false, intent: "other" });
    expect(body.replyText).toContain("Samajh nahi aaya");
  });

  it("validates the body", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: bearer(owner),
      payload: { text: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("requires a shop", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: bearer(newAuthUser()),
      payload: { text: "hello" },
    });
    expect(res.json().error.code).toBe("ONBOARDING_REQUIRED");
  });
});

describe("POST /voice/command — audio", () => {
  it("transcribes, routes and speaks", async () => {
    const upload = audioUpload(Buffer.alloc(4096, 1), "audio/webm;codecs=opus", { langHint: "hi-IN" });
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: { ...bearer(owner), ...upload.headers },
      payload: upload.payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      understood: true,
      transcript: MOCK_TRANSCRIPT,
      intent: "capture",
      languageCode: "hi-IN",
    });
  });

  it("silence → not understood, with spoken 'dobara bolein' (§17)", async () => {
    const upload = audioUpload(Buffer.alloc(100));
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: { ...bearer(owner), ...upload.headers },
      payload: upload.payload,
    });
    expect(res.json()).toMatchObject({ understood: false, transcript: "", intent: null });
    expect(res.json().replyAudioUrl).toBeTruthy();
  });

  it("rejects non-audio uploads", async () => {
    const upload = audioUpload(Buffer.alloc(4096), "image/png");
    const res = await t.app.inject({
      method: "POST",
      url: "/voice/command",
      headers: { ...bearer(owner), ...upload.headers },
      payload: upload.payload,
    });
    expect(res.statusCode).toBe(415);
  });
});

describe("roles", () => {
  it("a helper asking about credit gets the owner-only reply", async () => {
    const helper = newAuthUser("voice-helper");
    await t.db
      .insert(users)
      .values({ merchantId, authUserId: helper.id, email: helper.email, role: "helper" });
    const { body } = await sayText("Mujhe loan mil sakta hai?", helper);
    expect(body.intent).toBe("credit");
    expect(body.replyText).toContain("sirf dukaan ke maalik");
    // …but can still add entries.
    expect((await sayText("Gupta ji 50 udhaar", helper)).body.intent).toBe("capture");
    await t.db.delete(users).where(eq(users.authUserId, helper.id));
  });
});

describe("TTS and media", () => {
  it("POST /voice/tts returns a playable file, same URL for the same text", async () => {
    const say = () =>
      t.app.inject({
        method: "POST",
        url: "/voice/tts",
        headers: bearer(owner),
        payload: { text: "Namaste" },
      });
    const first = (await say()).json();
    const second = (await say()).json();
    expect(first.audioUrl).toBe(second.audioUrl);

    const media = await t.app.inject({ method: "GET", url: first.audioUrl });
    expect(media.statusCode).toBe(200);
    expect(media.headers["content-type"]).toMatch(/^audio\//);
    expect(media.rawPayload.subarray(0, 4).toString()).toBe("RIFF");
  });

  it("media rejects path tricks and unknown files", async () => {
    for (const url of ["/media/tts/..%2F..%2Fpackage.json", "/media/tts/nope.mp3"]) {
      expect((await t.app.inject({ method: "GET", url })).statusCode).toBe(404);
    }
  });
});
