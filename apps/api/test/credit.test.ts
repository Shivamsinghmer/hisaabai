// F3 done-when: voice "Mujhe loan mil sakta hai?" → spoken score + reason;
// consent → offer → wrong teach-back → retry → correct → accepted.
// Mock AI, real Neon test DB.
import type { CreditScore, TeachBackResult } from "@hisaab/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ledgerEntries, notifications, promises, users } from "../src/db/schema.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";
import { customers } from "../src/db/schema.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
const owner = newAuthUser("credit-owner");
const helper = newAuthUser("credit-helper");
let merchantId = "";

// Credit goes to the score: regular UPI sales, all udhaar recovered in ~7 days,
// promises kept. Weekly sale amounts are identical → consistency ≈ 1.
async function seedHealthyShop() {
  const res = await t.app.inject({
    method: "POST",
    url: "/merchants",
    headers: bearer(owner),
    payload: { ...validOnboarding, shopName: "Credit Store " + owner.id.slice(0, 6) },
  });
  merchantId = res.json().merchant.id;
  t.track(merchantId);
  await t.db.insert(users).values({
    merchantId,
    authUserId: helper.id,
    email: helper.email,
    role: "helper",
  });
  const [gupta] = await t.db
    .insert(customers)
    .values({ merchantId, name: "Gupta ji", aliases: ["Gupta jee"] })
    .returning();

  for (let week = 0; week < 20; week++) {
    const weekStart = Date.now() - (19 - week) * 7 * 86_400_000;
    const day = (n: number) => new Date(weekStart + n * 86_400_000).toISOString().slice(0, 10);
    await t.db.insert(ledgerEntries).values([
      { merchantId, customerId: null, type: "sale", amountPaise: 60_000, source: "upi", entryDate: day(0) },
      { merchantId, customerId: gupta!.id, type: "credit", amountPaise: 50_000, source: "voice", entryDate: day(1) },
      { merchantId, customerId: gupta!.id, type: "payment", amountPaise: 50_000, source: "upi", entryDate: day(2) },
    ]);
  }
  await t.db.insert(promises).values([
    { merchantId, customerId: gupta!.id, promisedDate: "2026-10-01", status: "kept", amountPaise: 10_000 },
    { merchantId, customerId: gupta!.id, promisedDate: "2026-10-05", status: "kept", amountPaise: 20_000 },
  ]);
}

beforeAll(async () => {
  t = await setupTestApp();
  await seedHealthyShop();
});
afterAll(async () => {
  await t.close();
});

const post = (url: string, payload?: unknown, user = owner) =>
  t.app.inject({
    method: "POST",
    url,
    headers: bearer(user),
    ...(payload !== undefined ? { payload } : {}),
  });

describe("credit score (F3.1)", () => {
  it("owner gets a score with §14 factors and tips", async () => {
    const res = await t.app.inject({ method: "GET", url: "/credit/score", headers: bearer(owner) });
    expect(res.statusCode).toBe(200);
    const s = res.json<CreditScore>();
    expect(s.score).toBeGreaterThan(600); // the healthy seed must qualify for an offer
    expect(s.factors.map((f) => f.key)).toContain("recovery_rate");
    expect(s.factors.find((f) => f.key === "digital_share")?.direction).toBe("up");
    expect(s.tips.length).toBeLessThanOrEqual(3);
    expect(s.computedAt).toBeTruthy();
  });

  it("helper is blocked from credit (§17)", async () => {
    const res = await t.app.inject({ method: "GET", url: "/credit/score", headers: bearer(helper) });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("OWNER_ONLY");
  });

  it("the second computation reports a change", async () => {
    const res = await t.app.inject({ method: "GET", url: "/credit/score", headers: bearer(owner) });
    expect(res.json<CreditScore>().change).not.toBe(null);
  });
});

describe("voice → credit (F3.2)", () => {
  it("'Mujhe loan mil sakta hai?' speaks the score + reason, not a placeholder", async () => {
    const res = await post("/voice/command", { text: "Mujhe loan mil sakta hai?" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toBe("credit");
    expect(body.replyText).toContain("Aapka score");
    expect(body.replyText).not.toContain("jald");
    expect(body.replyAudioUrl).toBeTruthy();
  });

  it("a helper's credit question stays owner-only", async () => {
    const res = await post("/voice/command", { text: "Mujhe loan mil sakta hai?" }, helper);
    expect(res.json().replyText).toContain("maalik");
  });
});

describe("offer + teach-back + accept (F3.2/F3.3)", () => {
  it("offer needs a live lending consent first", async () => {
    const res = await post("/credit/offers");
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("CONSENT_REQUIRED");
  });

  it("consent → offer → wrong teach-back → retry → accept", async () => {
    const consent = await post("/consents", { purpose: "lending" });
    expect(consent.statusCode).toBe(200);

    const offerRes = await post("/credit/offers");
    expect(offerRes.statusCode).toBe(200);
    const { offer } = offerRes.json();
    expect(offer.status).toBe("offered");
    expect(offer.tenureMonths).toBe(6);
    expect(offer.amountPaise).toBeGreaterThan(0);
    // EMI matches the reducing-balance formula, in paise (±2 for rounding).
    const r = offer.annualRatePct / 12 / 100;
    const growth = Math.pow(1 + r, 6);
    const expected = Math.round((offer.amountPaise * r * growth) / (growth - 1));
    expect(offer.emiPaise).toBeCloseTo(expected, -1);

    // Accepting before teach-back is refused.
    const early = await post(`/credit/offers/${offer.id}/accept`);
    expect(early.statusCode).toBe(409);

    // Wrong answer → attempt 1 fails with the real numbers in the reply.
    const wrong = (await post(`/credit/offers/${offer.id}/teach-back`, {
      text: "har mahine 20 hazaar, nau mahine",
    })).json<TeachBackResult>();
    expect(wrong.passed).toBe(false);
    expect(wrong.attempts).toBe(1);
    expect(wrong.replyText).toContain("har mahine");
    expect(wrong.replyText).toContain("6 mahine");

    // Correct answer (within ±10%) → passed → accept (mock disburse).
    const right = (await post(`/credit/offers/${offer.id}/teach-back`, {
      text: `har mahine ${Math.round(offer.emiPaise / 100)}, 6 mahine`,
    })).json<TeachBackResult>();
    expect(right.passed).toBe(true);

    const offerAfter = (await post(`/credit/offers/${offer.id}/accept`)).json();
    expect(offerAfter.status).toBe("disbursed");

    const [note] = await t.db.select().from(notifications).where(eq(notifications.merchantId, merchantId));
    expect(note?.kind).toBe("loan");
  });

  it("revoking the consent closes the offer path again", async () => {
    const consent = await post("/consents", { purpose: "lending" });
    const revoke = await t.app.inject({
      method: "DELETE",
      url: `/consents/${consent.json().id}`,
      headers: bearer(owner),
    });
    expect(revoke.json().granted).toBe(false);
    expect((await post("/credit/offers")).statusCode).toBe(403);
    expect((await post("/consents", { purpose: "lending" })).statusCode).toBe(200);
  });

  it("teach-back gives up after 2 attempts", async () => {
    const { offer } = (await post("/credit/offers")).json();
    await post(`/credit/offers/${offer.id}/teach-back`, { text: "kuch nahi aata" });
    const second = (
      await post(`/credit/offers/${offer.id}/teach-back`, { text: "pata nahi ji" })
    ).json<TeachBackResult>();
    expect(second.passed).toBe(false);
    expect(second.replyText).toContain("agent");
  });

  it("another shop cannot touch this shop's offer", async () => {
    const other = newAuthUser("credit-other");
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(other),
      payload: validOnboarding,
    });
    t.track(res.json().merchant.id);
    const { offer } = (await post("/credit/offers")).json();
    const otherRes = await t.app.inject({
      method: "POST",
      url: `/credit/offers/${offer.id}/teach-back`,
      headers: bearer(other),
      payload: { text: "har mahine 8850, 6 mahine" },
    });
    expect(otherRes.statusCode).toBe(404);
  });
});
