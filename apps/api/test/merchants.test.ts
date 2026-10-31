import type { MeResponse } from "@hisaab/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consents, users } from "../src/db/schema.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;

beforeAll(async () => {
  t = await setupTestApp();
});
afterAll(async () => {
  await t.close();
});

async function onboard(user = newAuthUser("owner"), body: object = validOnboarding) {
  const res = await t.app.inject({ method: "POST", url: "/merchants", headers: bearer(user), payload: body });
  if (res.statusCode === 201) t.track(res.json().merchant.id);
  return { user, res };
}

describe("auth", () => {
  it("rejects requests without a token", async () => {
    const res = await t.app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("rejects a token the verifier refuses", async () => {
    const res = await t.app.inject({ method: "GET", url: "/me", headers: { authorization: "Bearer nope" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("onboarding (F0)", () => {
  it("a new user has no shop yet", async () => {
    const user = newAuthUser();
    const res = await t.app.inject({ method: "GET", url: "/me", headers: bearer(user) });
    expect(res.statusCode).toBe(200);
    const me = res.json<MeResponse>();
    expect(me.user).toEqual({ authUserId: user.id, email: user.email });
    expect(me.membership).toBeNull();
    expect(me.merchant).toBeNull();
  });

  it("creates the shop, makes the user its owner and records consent", async () => {
    const { user, res } = await onboard();
    expect(res.statusCode).toBe(201);
    const { merchant } = res.json();
    expect(merchant).toMatchObject({ shopName: "Test General Store", language: "hi-IN", defaultDueDays: 15 });

    const me = (await t.app.inject({ method: "GET", url: "/me", headers: bearer(user) })).json<MeResponse>();
    expect(me.membership?.role).toBe("owner");
    expect(me.merchant?.id).toBe(merchant.id);

    const consentRows = await t.db
      .select()
      .from(consents)
      .where(and(eq(consents.merchantId, merchant.id), eq(consents.purpose, "data_storage")));
    expect(consentRows).toHaveLength(1);
  });

  it("refuses a second shop for the same user", async () => {
    const { user } = await onboard();
    const again = await onboard(user);
    expect(again.res.statusCode).toBe(409);
    expect(again.res.json().error.code).toBe("ALREADY_ONBOARDED");
  });

  it("requires consent", async () => {
    const { res } = await onboard(newAuthUser(), { ...validOnboarding, acceptedConsent: false });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown fields such as a smuggled merchantId", async () => {
    const { res } = await onboard(newAuthUser(), { ...validOnboarding, merchantId: crypto.randomUUID() });
    expect(res.statusCode).toBe(400);
  });
});

describe("settings (F11) and roles", () => {
  it("owner can update settings", async () => {
    const { user } = await onboard();
    const res = await t.app.inject({
      method: "PATCH",
      url: "/me/settings",
      headers: bearer(user),
      payload: { defaultDueDays: 7, quietHours: { start: "22:00", end: "08:00" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().merchant).toMatchObject({
      defaultDueDays: 7,
      quietHours: { start: "22:00", end: "08:00" },
    });
  });

  it("helper gets 403 OWNER_ONLY on owner routes but can read /me", async () => {
    const { res } = await onboard();
    const merchantId = res.json().merchant.id;
    const helper = newAuthUser("helper");
    await t.db
      .insert(users)
      .values({ merchantId, authUserId: helper.id, email: helper.email, role: "helper" });

    const patch = await t.app.inject({
      method: "PATCH",
      url: "/me/settings",
      headers: bearer(helper),
      payload: { defaultDueDays: 3 },
    });
    expect(patch.statusCode).toBe(403);
    expect(patch.json().error.code).toBe("OWNER_ONLY");

    const me = (
      await t.app.inject({ method: "GET", url: "/me", headers: bearer(helper) })
    ).json<MeResponse>();
    expect(me.membership?.role).toBe("helper");
    expect(me.merchant?.id).toBe(merchantId);
  });

  it("a user without a shop gets ONBOARDING_REQUIRED on shop routes", async () => {
    const res = await t.app.inject({
      method: "PATCH",
      url: "/me/settings",
      headers: bearer(newAuthUser()),
      payload: { defaultDueDays: 3 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("ONBOARDING_REQUIRED");
  });

  it("settings only ever change the caller's own shop", async () => {
    const a = await onboard();
    const b = await onboard();
    await t.app.inject({
      method: "PATCH",
      url: "/me/settings",
      headers: bearer(b.user),
      payload: { shopName: "B Store" },
    });
    const meA = (
      await t.app.inject({ method: "GET", url: "/me", headers: bearer(a.user) })
    ).json<MeResponse>();
    expect(meA.merchant?.shopName).toBe("Test General Store");
  });

  it("rejects an empty or invalid patch", async () => {
    const { user } = await onboard();
    for (const payload of [{}, { defaultDueDays: 0 }, { quietHours: { start: "25:00", end: "08:00" } }]) {
      const res = await t.app.inject({
        method: "PATCH",
        url: "/me/settings",
        headers: bearer(user),
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
