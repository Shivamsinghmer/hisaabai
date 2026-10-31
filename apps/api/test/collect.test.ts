// F2 done-when: a due entry triggers a reminder with a working mock link; the
// AI call takes "Friday ko dunga" → promise + scheduled follow-up; paying via
// the link closes the balance. Mock AI, real Neon test DB.
import { resolveDate, type CallState, type CollectDashboard, type Reminder } from "@hisaab/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers, disputes, ledgerEntries, promises, reminders } from "../src/db/schema.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
const owner = newAuthUser("collect-owner");
let merchantId: string;
const ids: Record<string, string> = {};

async function addCustomer(name: string, duePaise: number, dueDate: string) {
  const [row] = await t.db.insert(customers).values({ merchantId, name }).returning();
  ids[name] = row!.id;
  await t.db.insert(ledgerEntries).values({
    merchantId,
    customerId: row!.id,
    type: "credit",
    amountPaise: duePaise,
    source: "photo",
    entryDate: "2026-10-01",
    dueDate,
  });
}

async function remind(name: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/collect/remind",
    headers: bearer(owner),
    payload: { customerId: ids[name] },
  });
  expect(res.statusCode).toBe(200);
  return res.json<{ reminder: Reminder }>().reminder;
}

const tokenOf = (r: Reminder) => r.payUrl.split("/").pop()!;

async function call(name: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/calls",
    headers: bearer(owner),
    payload: { customerId: ids[name] },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ call: CallState; joinUrl: string }>();
}

async function customerSays(callId: string, text: string) {
  const res = await t.app.inject({ method: "POST", url: `/call-sim/${callId}/turn`, payload: { text } });
  expect(res.statusCode).toBe(200);
  return res.json<{ call: CallState }>().call;
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
  await addCustomer("Gupta ji", 45000, "2026-10-25");
  await addCustomer("Khan sahab", 120000, "2026-10-12");
  await addCustomer("Verma ji", 60000, "2099-01-01");
  await addCustomer("Ansari ji", 30000, "2026-10-20");
  await addCustomer("Joshi ji", 20000, "2026-10-20");
  await t.db.insert(promises).values({
    merchantId,
    customerId: ids["Khan sahab"]!,
    promisedDate: "2026-10-24",
    status: "broken",
    amountPaise: 120000,
  });
});
afterAll(async () => {
  await t.close();
});

describe("reminders (F2.1)", () => {
  it("gentle first reminder with a pay link; one per day", async () => {
    const r = await remind("Gupta ji");
    expect(r).toMatchObject({ tone: "gentle", amountPaise: 45000, status: "sent" });
    expect(r.message).toContain("aapka ₹450 baaki hai");
    expect(r.message).toContain(r.payUrl);
    expect((await remind("Gupta ji")).id).toBe(r.id);
  });

  it("firm after a broken promise, never threatening", async () => {
    const r = await remind("Khan sahab");
    expect(r.tone).toBe("firm");
    expect(r.message).toContain("Kripya aaj");
  });

  it("nothing due → 409", async () => {
    const [row] = await t.db.insert(customers).values({ merchantId, name: "Clear ji" }).returning();
    const res = await t.app.inject({
      method: "POST",
      url: "/collect/remind",
      headers: bearer(owner),
      payload: { customerId: row!.id },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("mock UPI page", () => {
  it("is public, takes a partial payment, then closes the balance", async () => {
    const r = await remind("Verma ji");
    const token = tokenOf(r);
    const info = await t.app.inject({ method: "GET", url: `/pay/${token}` });
    expect(info.json()).toMatchObject({ customerName: "Verma ji", amountPaise: 60000, status: "sent" });

    const part = await t.app.inject({
      method: "POST",
      url: `/pay/${token}/confirm`,
      payload: { amountRupees: 200 },
    });
    expect(part.json()).toMatchObject({ status: "partial", paidPaise: 20000, balancePaise: 40000 });

    const rest = await t.app.inject({ method: "POST", url: `/pay/${token}/confirm`, payload: {} });
    expect(rest.json()).toMatchObject({ status: "paid", paidPaise: 40000, balancePaise: 0 });

    const again = await t.app.inject({ method: "POST", url: `/pay/${token}/confirm`, payload: {} });
    expect(again.json()).toMatchObject({ status: "paid", paidPaise: 0 });
  });

  it("unknown token → 404", async () => {
    expect((await t.app.inject({ method: "GET", url: "/pay/notarealtokenatall1" })).statusCode).toBe(404);
  });
});

describe("AI call (F2.2)", () => {
  it("'Friday ko dunga' → promise + follow-up, call ends", async () => {
    const { call: started, joinUrl } = await call("Gupta ji");
    expect(joinUrl).toContain(`/call-sim/${started.id}`);
    expect(started.status).toBe("ringing");
    expect(started.transcript[0]!.text).toContain("Aapka ₹450 baaki hai");
    expect(started.transcript[0]!.audioUrl).toBeTruthy();

    const answered = (
      await t.app.inject({ method: "POST", url: `/call-sim/${started.id}/answer` })
    ).json<CallState>();
    expect(answered.status).toBe("live");

    const after = await customerSays(started.id, "Friday ko dunga");
    const friday = resolveDate("friday", { direction: "future" })!;
    expect(after).toMatchObject({
      status: "ended",
      outcome: "promise",
      promise: { promisedDate: friday, amountPaise: 45000 },
    });
    expect(after.followUpAt).toBeTruthy();
    expect(after.transcript.at(-1)!.text).toContain("yaad dila denge");

    const [p] = await t.db
      .select()
      .from(promises)
      .where(and(eq(promises.customerId, ids["Gupta ji"]!), eq(promises.status, "open")));
    expect(p?.promisedDate).toBe(friday);
    const queued = await t.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.customerId, ids["Gupta ji"]!), eq(reminders.status, "queued")));
    expect(queued).toHaveLength(1);

    // Merchant sees the same call.
    const merchantView = await t.app.inject({
      method: "GET",
      url: `/calls/${started.id}`,
      headers: bearer(owner),
    });
    expect(merchantView.json<CallState>().outcome).toBe("promise");
  });

  it("partial: 'abhi 200 deta hoon' → link for ₹200, asks for the rest, then promise", async () => {
    const { call: c } = await call("Ansari ji");
    const first = await customerSays(c.id, "abhi 200 deta hoon");
    expect(first.status).toBe("live");
    expect(first.payUrl).toBeTruthy();
    expect(first.transcript.at(-1)!.text).toContain("Baaki ₹100 kab tak");
    const second = await customerSays(c.id, "parso tak de dunga");
    expect(second).toMatchObject({ status: "ended", outcome: "partial", promise: { amountPaise: 10000 } });
  });

  it("dispute → logged, call ends politely", async () => {
    const { call: c } = await call("Joshi ji");
    const after = await customerSays(c.id, "maine to de diya tha");
    expect(after).toMatchObject({ status: "ended", outcome: "dispute" });
    const rows = await t.db.select().from(disputes).where(eq(disputes.customerId, ids["Joshi ji"]!));
    expect(rows).toHaveLength(1);
  });

  it("at most 3 agent turns", async () => {
    const { call: c } = await call("Khan sahab");
    await customerSays(c.id, "hmm");
    const last = await customerSays(c.id, "achha");
    expect(last.status).toBe("ended");
    expect(last.transcript.filter((x) => x.role === "agent")).toHaveLength(3);
  });

  it("another shop can't read the call", async () => {
    const { call: c } = await call("Khan sahab");
    const other = newAuthUser("collect-other");
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(other),
      payload: validOnboarding,
    });
    t.track(res.json().merchant.id);
    expect(
      (await t.app.inject({ method: "GET", url: `/calls/${c.id}`, headers: bearer(other) })).statusCode,
    ).toBe(404);
  });
});

describe("dashboard", () => {
  it("overdue first, with promise and reminder state", async () => {
    const d = (
      await t.app.inject({ method: "GET", url: "/collect/dashboard", headers: bearer(owner) })
    ).json<CollectDashboard>();
    expect(d.dues.every((x) => x.balancePaise > 0)).toBe(true);
    const statuses = d.dues.map((x) => x.status);
    expect(statuses.indexOf("due") === -1 || statuses.lastIndexOf("overdue") < statuses.indexOf("due")).toBe(
      true,
    );
    expect(d.dues.find((x) => x.name === "Gupta ji")).toMatchObject({ remindedToday: true });
    expect(d.dues.find((x) => x.name === "Khan sahab")!.brokenPromises).toBe(1);
    expect(d.recentCalls.length).toBeGreaterThan(0);
  });
});
