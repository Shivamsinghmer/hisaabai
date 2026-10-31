// F1.2 done-when: the five utterances each produce the correct entry and a
// spoken confirmation. Mock AI (rule-based extraction), real Neon test DB.
import type { CustomerDetail, CustomerRow, TodaySummary, VoiceCommandResponse } from "@hisaab/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers, ledgerEntries } from "../src/db/schema.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
const owner = newAuthUser("capture-owner");
let merchantId: string;
const ids: Record<string, string> = {};

async function say(text: string, confirm?: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/voice/command",
    headers: bearer(owner),
    payload: confirm ? { text, confirm } : { text },
  });
  expect(res.statusCode).toBe(200);
  return res.json<VoiceCommandResponse>();
}

async function balance(name: string) {
  const list = (await t.app.inject({ method: "GET", url: "/customers", headers: bearer(owner) })).json<{
    customers: CustomerRow[];
  }>().customers;
  return list.find((c) => c.name === name)?.balancePaise;
}

beforeAll(async () => {
  t = await setupTestApp();
  const res = await t.app.inject({
    method: "POST",
    url: "/merchants",
    headers: bearer(owner),
    payload: validOnboarding,
  });
  merchantId = res.json().merchant.id;
  t.track(merchantId);

  // Demo-like shop: Gupta ji ₹330 (overdue), Sharma ji ₹750, Verma ji ₹0.
  for (const [name, aliases] of [
    ["Gupta ji", ["Gupta jee", "Suresh Gupta"]],
    ["Sharma ji", ["Dinesh Sharma"]],
    ["Verma ji", ["Anil Verma"]],
  ] as const) {
    const [row] = await t.db
      .insert(customers)
      .values({ merchantId, name, aliases: [...aliases] })
      .returning();
    ids[name] = row!.id;
  }
  await t.db.insert(ledgerEntries).values([
    {
      merchantId,
      customerId: ids["Gupta ji"],
      type: "credit",
      amountPaise: 18000,
      source: "photo",
      entryDate: "2026-10-01",
      dueDate: "2026-10-16",
    },
    {
      merchantId,
      customerId: ids["Gupta ji"],
      type: "credit",
      amountPaise: 15000,
      source: "photo",
      entryDate: "2026-10-20",
      dueDate: "2099-01-01",
    },
    {
      merchantId,
      customerId: ids["Sharma ji"],
      type: "credit",
      amountPaise: 75000,
      source: "photo",
      entryDate: "2026-10-25",
      dueDate: "2099-01-01",
    },
  ]);
});
afterAll(async () => {
  await t.close();
});

describe("F1.2 utterances", () => {
  let guptaEntryId = "";

  it("credit: 'Gupta ji, do kilo chawal, 120 udhaar' → ₹450 baaki", async () => {
    const r = await say("Gupta ji, do kilo chawal, 120 udhaar");
    expect(r.entry).toMatchObject({
      customerName: "Gupta ji",
      type: "credit",
      amountPaise: 12000,
      balancePaise: 45000,
    });
    expect(r.replyText).toBe("Gupta ji ke khate mein ₹120 udhaar jod diya. Ab kul ₹450 baaki.");
    expect(r.replyAudioUrl).toBeTruthy();
    guptaEntryId = r.entry!.id;
  });

  it("payment: 'Sharma ji ne 300 jama kiye'", async () => {
    const r = await say("Sharma ji ne 300 jama kiye");
    expect(r.entry).toMatchObject({
      customerName: "Sharma ji",
      type: "payment",
      amountPaise: 30000,
      balancePaise: 45000,
    });
    expect(r.replyText).toContain("₹300 jama");
  });

  it("new customer: 'Naya customer Meena didi, 80 ka udhaar'", async () => {
    const r = await say("Naya customer Meena didi, 80 ka udhaar");
    expect(r.entry).toMatchObject({
      customerName: "Meena didi",
      type: "credit",
      amountPaise: 8000,
      balancePaise: 8000,
    });
    expect(r.replyText).toMatch(/^Naya customer Meena didi bana diya/);
  });

  it("number words: 'Ek sau bees Verma ji ke naam likho'", async () => {
    const r = await say("Ek sau bees Verma ji ke naam likho");
    expect(r.entry).toMatchObject({ customerName: "Verma ji", type: "credit", amountPaise: 12000 });
  });

  it("delete: 'Gupta ji ka last entry hata do' asks first, then DELETE restores ₹330", async () => {
    const r = await say("Gupta ji ka last entry hata do");
    expect(r.entry).toBeNull();
    expect(r.followUp?.question).toContain("₹120 udhaar hataun?");
    const yes = r.followUp!.options.find((o) => o.deleteEntryId);
    expect(yes?.deleteEntryId).toBe(guptaEntryId);

    const del = await t.app.inject({
      method: "DELETE",
      url: `/ledger/${guptaEntryId}`,
      headers: bearer(owner),
    });
    expect(del.json()).toMatchObject({ deleted: guptaEntryId, balancePaise: 33000 });
  });
});

describe("follow-ups (§17)", () => {
  it("unknown name → 'Naya customer … banaun?' → confirm creates", async () => {
    const r = await say("Rahul bhaiya 50 udhaar");
    expect(r.entry).toBeNull();
    expect(r.followUp?.question).toBe("Naya customer Rahul bhaiya banaun?");
    const yes = r.followUp!.options[0]!;
    const confirmed = await say(yes.text!, yes.confirm);
    expect(confirmed.entry).toMatchObject({ customerName: "Rahul bhaiya", amountPaise: 5000 });
  });

  it("same entry twice within 2 minutes → asks before adding again", async () => {
    await say("Verma ji 40 udhaar");
    const again = await say("Verma ji 40 udhaar");
    expect(again.entry).toBeNull();
    expect(again.followUp?.question).toContain("abhi daali thi");
    const forced = await say("Verma ji 40 udhaar", "duplicate");
    expect(forced.entry).not.toBeNull();
  });

  it("no amount → asks how much", async () => {
    const r = await say("Gupta ji udhaar likho");
    expect(r.entry).toBeNull();
    expect(r.followUp?.question).toContain("kitne rupaye");
  });
});

describe("reads", () => {
  it("customer list is sorted by due with a status", async () => {
    const list = (await t.app.inject({ method: "GET", url: "/customers", headers: bearer(owner) })).json<{
      customers: CustomerRow[];
    }>().customers;
    expect(list[0]!.balancePaise).toBeGreaterThanOrEqual(list[1]!.balancePaise);
    expect(list.find((c) => c.name === "Gupta ji")).toMatchObject({ balancePaise: 33000, status: "overdue" });
  });

  it("customer detail has history", async () => {
    const res = await t.app.inject({
      method: "GET",
      url: `/customers/${ids["Gupta ji"]}`,
      headers: bearer(owner),
    });
    const detail = res.json<CustomerDetail>();
    expect(detail.customer.name).toBe("Gupta ji");
    expect(detail.entries.length).toBe(2); // the deleted voice entry is hidden
  });

  it("today summary counts today's payments", async () => {
    const s = (
      await t.app.inject({ method: "GET", url: "/summary/today", headers: bearer(owner) })
    ).json<TodaySummary>();
    expect(s.collectedPaise).toBe(30000);
    expect(s.overdueCustomers).toBeGreaterThanOrEqual(1);
  });

  it("another shop can't read or delete these", async () => {
    const other = newAuthUser("capture-other");
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(other),
      payload: validOnboarding,
    });
    t.track(res.json().merchant.id);
    expect(
      (await t.app.inject({ method: "GET", url: `/customers/${ids["Gupta ji"]}`, headers: bearer(other) }))
        .statusCode,
    ).toBe(404);
    const [entry] = await t.db
      .insert(ledgerEntries)
      .values({ merchantId, customerId: ids["Verma ji"], type: "credit", amountPaise: 100, source: "manual" })
      .returning();
    expect(
      (await t.app.inject({ method: "DELETE", url: `/ledger/${entry!.id}`, headers: bearer(other) }))
        .statusCode,
    ).toBe(404);
    expect(await balance("Verma ji")).toBeGreaterThan(0);
  });
});
