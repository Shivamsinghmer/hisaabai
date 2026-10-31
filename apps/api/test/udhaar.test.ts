// F4 Udhaar-as-a-Service (mock): eligibility rules, funding, repayment to Paytm.
import type { CustomerRow, UdhaarOverview, UdhaarTxn } from "@hisaab/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers, disputes, ledgerEntries, users } from "../src/db/schema.js";
import { assess, onTimeRate, type LedgerLine } from "../src/udhaar/eligibility.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

const TODAY = "2026-10-31";
const credit = (amount: number, entryDate: string, dueDate: string | null = null): LedgerLine => ({
  type: "credit",
  amountPaise: amount * 100,
  entryDate,
  dueDate,
});
const payment = (amount: number, entryDate: string): LedgerLine => ({
  type: "payment",
  amountPaise: amount * 100,
  entryDate,
  dueDate: null,
});

describe("onTimeRate (pure)", () => {
  it("counts credits settled by their due date", () => {
    const lines = [credit(100, "2026-06-01", "2026-06-16"), payment(100, "2026-06-10")];
    expect(onTimeRate(lines, TODAY)).toEqual({ rate: 1, judged: 1 });
  });

  it("a late payment and an overdue unpaid credit both count as late", () => {
    const lines = [
      credit(100, "2026-06-01", "2026-06-16"),
      payment(100, "2026-07-20"),
      credit(100, "2026-08-01", "2026-08-16"),
    ];
    expect(onTimeRate(lines, TODAY)).toEqual({ rate: 0, judged: 2 });
  });

  it("an unpaid credit that is not due yet is not judged", () => {
    const lines = [credit(100, "2026-10-25", "2026-11-09")];
    expect(onTimeRate(lines, TODAY)).toEqual({ rate: null, judged: 0 });
  });

  it("payments settle the oldest credit first (FIFO)", () => {
    const lines = [
      credit(100, "2026-06-01", "2026-06-16"),
      credit(100, "2026-06-05", "2026-06-20"),
      payment(100, "2026-06-10"), // settles the first
      payment(100, "2026-07-01"), // settles the second, late
    ];
    expect(onTimeRate(lines, TODAY)).toEqual({ rate: 0.5, judged: 2 });
  });
});

describe("assess (pure)", () => {
  const good = [
    credit(200, "2026-05-01", "2026-05-16"),
    payment(200, "2026-05-10"),
    credit(400, "2026-07-01", "2026-07-16"),
    payment(400, "2026-07-12"),
  ];

  it("eligible: ≥ 3 months, ≥ 80% on time, no dispute; limit = 1.5 × average ticket", () => {
    const a = assess({ lines: good, openDispute: false, outstandingPaytmPaise: 0 }, TODAY);
    expect(a.eligible).toBe(true);
    expect(a.avgTicketPaise).toBe(30000); // ₹300
    expect(a.limitPaise).toBe(45000); // 1.5 × ₹300 = ₹450
  });

  it("limit is capped at ₹5,000 and reduced by Paytm Udhaar outstanding", () => {
    const big = [credit(9000, "2026-05-01", "2026-05-16"), payment(9000, "2026-05-05")];
    expect(assess({ lines: big, openDispute: false, outstandingPaytmPaise: 0 }, TODAY).limitPaise).toBe(
      500_000,
    );
    expect(assess({ lines: big, openDispute: false, outstandingPaytmPaise: 200_000 }, TODAY).limitPaise).toBe(
      300_000,
    );
  });

  it("each rule blocks on its own", () => {
    const fresh = [credit(200, "2026-10-10", "2026-10-25"), payment(200, "2026-10-12")];
    expect(
      assess({ lines: fresh, openDispute: false, outstandingPaytmPaise: 0 }, TODAY).reasons[0],
    ).toContain("3 mahine");

    const slow = [credit(200, "2026-05-01", "2026-05-16"), payment(200, "2026-07-01")];
    expect(
      assess({ lines: slow, openDispute: false, outstandingPaytmPaise: 0 }, TODAY).reasons.join(),
    ).toContain("80%");

    const disputed = assess({ lines: good, openDispute: true, outstandingPaytmPaise: 0 }, TODAY);
    expect(disputed).toMatchObject({ eligible: false });
    expect(disputed.reasons.join()).toContain("Vivaad");

    expect(assess({ lines: [], openDispute: false, outstandingPaytmPaise: 0 }, TODAY).eligible).toBe(false);
  });
});

describe("funding and repayment (integration)", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const owner = newAuthUser("udhaar-owner");
  let merchantId: string;
  const ids: Record<string, string> = {};

  async function addCustomer(
    name: string,
    lines: { type: "credit" | "payment"; rupees: number; date: string; due?: string }[],
  ) {
    const [row] = await t.db.insert(customers).values({ merchantId, name }).returning();
    ids[name] = row!.id;
    await t.db.insert(ledgerEntries).values(
      lines.map((l) => ({
        merchantId,
        customerId: row!.id,
        type: l.type,
        amountPaise: l.rupees * 100,
        source: "manual" as const,
        entryDate: l.date,
        dueDate: l.due ?? null,
      })),
    );
  }
  const overview = async () =>
    (
      await t.app.inject({ method: "GET", url: "/udhaar-service", headers: bearer(owner) })
    ).json<UdhaarOverview>();
  const fundIt = (name: string, amountRupees: number, user = owner) =>
    t.app.inject({
      method: "POST",
      url: "/udhaar-service",
      headers: bearer(user),
      payload: { customerId: ids[name], amountRupees },
    });
  const balance = async (name: string) =>
    (await t.app.inject({ method: "GET", url: "/customers", headers: bearer(owner) }))
      .json<{ customers: CustomerRow[] }>()
      .customers.find((c) => c.name === name)!.balancePaise;

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
    const reliable = [
      { type: "credit" as const, rupees: 300, date: "2026-05-01", due: "2026-05-16" },
      { type: "payment" as const, rupees: 300, date: "2026-05-10" },
      { type: "credit" as const, rupees: 300, date: "2026-07-01", due: "2026-07-16" },
      { type: "payment" as const, rupees: 300, date: "2026-07-10" },
    ];
    await addCustomer("Gupta ji", reliable);
    await addCustomer("Verma ji", reliable);
    await addCustomer("Khan sahab", [
      { type: "credit", rupees: 300, date: "2026-05-01", due: "2026-05-16" },
      { type: "payment", rupees: 300, date: "2026-08-01" },
    ]);
    await addCustomer("Disputed ji", reliable);
    await t.db.insert(disputes).values({ merchantId, customerId: ids["Disputed ji"]!, note: "already paid" });
  });
  afterAll(async () => {
    await t.close();
  });

  it("lists eligible customers with limits and explains who is not", async () => {
    const o = await overview();
    expect(o.eligible.map((c) => c.name).sort()).toEqual(["Gupta ji", "Verma ji"]);
    expect(o.eligible.find((c) => c.name === "Gupta ji")!.limitPaise).toBe(45000);
    const khan = o.notEligible.find((c) => c.name === "Khan sahab")!;
    expect(khan.reasons.join()).toContain("80%");
    expect(o.notEligible.find((c) => c.name === "Disputed ji")!.reasons.join()).toContain("Vivaad");
    expect(o.feePct).toBe(1.5);
  });

  it("funds: Paytm pays the shop at once, the customer's khata balance stays clear", async () => {
    const res = await fundIt("Gupta ji", 400);
    expect(res.statusCode).toBe(201);
    const txn = res.json<{ txn: UdhaarTxn }>().txn;
    expect(txn).toMatchObject({ amountPaise: 40000, feePaise: 600, status: "funded" }); // 1.5% fee on the merchant
    expect(txn.repayUrl).toContain("/pay/");

    const rows = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, ids["Gupta ji"]!));
    // Both sides of the funded sale are tagged paytm_udhaar: the sale (credit) and Paytm's payment.
    const funded = rows.filter((r) => r.source === "paytm_udhaar");
    expect(funded.map((r) => r.type).sort()).toEqual(["credit", "payment"]);
    expect(funded.every((r) => r.amountPaise === 40000)).toBe(true);
    expect(await balance("Gupta ji")).toBe(0);
  });

  it("the used headroom shrinks the limit, and going over is refused", async () => {
    const o = await overview();
    expect(o.eligible.find((c) => c.name === "Gupta ji")!.limitPaise).toBe(5000); // ₹450 − ₹400
    const over = await fundIt("Gupta ji", 100);
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe("OVER_LIMIT");
  });

  it("refuses customers who are not eligible", async () => {
    for (const name of ["Khan sahab", "Disputed ji"]) {
      const res = await fundIt(name, 100);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("NOT_ELIGIBLE");
    }
  });

  it("the customer repays Paytm on the public pay page; the shop's ledger is untouched", async () => {
    const txn = (await overview()).txns[0]!;
    const token = txn.repayUrl!.split("/").pop()!;
    const info = await t.app.inject({ method: "GET", url: `/pay/${token}` });
    expect(info.json()).toMatchObject({
      kind: "paytm_udhaar",
      customerName: "Gupta ji",
      amountPaise: 40000,
      status: "funded",
    });

    const entriesBefore = (
      await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, ids["Gupta ji"]!))
    ).length;
    const paid = await t.app.inject({ method: "POST", url: `/pay/${token}/confirm`, payload: {} });
    expect(paid.json()).toMatchObject({ status: "paid", paidPaise: 40000 });
    const entriesAfter = (
      await t.db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, ids["Gupta ji"]!))
    ).length;
    expect(entriesAfter).toBe(entriesBefore);

    const again = await t.app.inject({ method: "POST", url: `/pay/${token}/confirm`, payload: {} });
    expect(again.json()).toMatchObject({ status: "paid", paidPaise: 0 });

    const o = await overview();
    expect(o.txns[0]).toMatchObject({ status: "closed", repayUrl: null });
    expect(o.eligible.find((c) => c.name === "Gupta ji")!.limitPaise).toBe(45000); // headroom restored
  });

  it("is owner-only, and another shop cannot fund this shop's customer", async () => {
    const helper = newAuthUser("udhaar-helper");
    await t.db
      .insert(users)
      .values({ merchantId, authUserId: helper.id, email: helper.email, role: "helper" });
    expect(
      (await t.app.inject({ method: "GET", url: "/udhaar-service", headers: bearer(helper) })).statusCode,
    ).toBe(403);
    expect((await fundIt("Verma ji", 100, helper)).statusCode).toBe(403);

    const other = newAuthUser("udhaar-other");
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(other),
      payload: validOnboarding,
    });
    t.track(res.json().merchant.id);
    expect((await fundIt("Verma ji", 100, other)).statusCode).toBe(404);
  });

  it("validates the amount", async () => {
    expect((await fundIt("Verma ji", 0)).statusCode).toBe(400);
    expect((await fundIt("Verma ji", 9000)).statusCode).toBe(400);
  });
});
