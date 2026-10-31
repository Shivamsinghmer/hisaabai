// Paytm customer profile: cross-shop score rules, consent gate and data separation.
import { normalizePhone, type NetworkProfile } from "@hisaab/shared";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customerNetworkConsents, customers, disputes, ledgerEntries, users } from "../src/db/schema.js";
import { basicProfileSummary } from "../src/network/profile.js";
import { outstandingOf, scoreNetwork, type ShopHistory } from "../src/network/score.js";
import type { LedgerLine } from "../src/udhaar/eligibility.js";
import { bearer, newAuthUser, setupTestApp, validOnboarding } from "./helpers.js";

const TODAY = "2026-10-31";
const credit = (amount: number, entryDate: string, dueDate: string): LedgerLine => ({
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

/** Six months of ₹300 credits, each repaid in 5 days. */
function reliable(): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const m of ["05", "06", "07", "08", "09", "10"]) {
    lines.push(credit(300, `2026-${m}-01`, `2026-${m}-16`), payment(300, `2026-${m}-06`));
  }
  return lines;
}
const shop = (label: string, lines: LedgerLine[], extra: Partial<ShopHistory> = {}): ShopHistory => ({
  label,
  isThisShop: false,
  lines,
  promisesKept: 0,
  promisesBroken: 0,
  openDispute: false,
  ...extra,
});
// ₹1,200 that fell due 75 days ago, never paid.
const unpaid = () => [...reliable(), credit(1200, "2026-08-02", "2026-08-17")];

describe("normalizePhone", () => {
  it("accepts common Indian formats and rejects the rest", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("outstandingOf", () => {
  it("payments settle the oldest credit first; overdue counts from the oldest unpaid due date", () => {
    const lines = [
      credit(100, "2026-08-01", "2026-08-16"),
      credit(100, "2026-09-01", "2026-09-16"),
      payment(100, "2026-08-10"),
    ];
    expect(outstandingOf(lines, TODAY)).toEqual({ outstandingPaise: 10000, overdueDays: 45 });
  });
});

describe("scoreNetwork (pure)", () => {
  const four = (fourth: ShopHistory) => [
    shop("Aapki dukaan", reliable(), { isThisShop: true }),
    shop("Dukaan 2", reliable()),
    shop("Dukaan 3", reliable()),
    fourth,
  ];

  it("on time at every shop → trusted, clean, no penalty", () => {
    const s = scoreNetwork(four(shop("Dukaan 4", reliable())), TODAY);
    expect(s).toMatchObject({ band: "trusted", pattern: "clean", penaltyTotal: 0 });
    expect(s.score).toBe(s.baseScore);
    expect(s.shops[0]!.isThisShop).toBe(true);
  });

  it("pays every shop except one → selective, and the unpaid shop costs real points", () => {
    const clean = scoreNetwork(four(shop("Dukaan 4", reliable())), TODAY);
    const s = scoreNetwork(four(shop("Dukaan 4", unpaid())), TODAY);
    expect(s.pattern).toBe("selective");
    const d4 = s.shops.find((x) => x.label === "Dukaan 4")!;
    expect(d4).toMatchObject({ standing: "overdue", overdueDays: 75, outstandingPaise: 120000 });
    expect(d4.penalty).toBeGreaterThanOrEqual(60);
    // An average would barely move; the per-shop penalty makes it count.
    expect(clean.score - s.score).toBeGreaterThanOrEqual(80);
    expect(s.band).not.toBe("trusted");
    // Settling gives the penalty back.
    expect(s.baseScore).toBe(s.score + s.penaltyTotal);
  });

  it("the same balance disputed costs a fifth as much", () => {
    const owed = scoreNetwork(four(shop("Dukaan 4", unpaid())), TODAY);
    const disputed = scoreNetwork(four(shop("Dukaan 4", unpaid(), { openDispute: true })), TODAY);
    expect(disputed.pattern).toBe("disputed");
    const p = (s: typeof owed) => s.shops.find((x) => x.label === "Dukaan 4")!.penalty;
    expect(p(disputed)).toBe(Math.round(p(owed) * 0.2));
    expect(disputed.score).toBeGreaterThan(owed.score);
  });

  it("overdue at two shops → widespread and lower again", () => {
    const s = scoreNetwork(
      [
        shop("Aapki dukaan", reliable(), { isThisShop: true }),
        shop("Dukaan 2", unpaid()),
        shop("Dukaan 3", unpaid()),
      ],
      TODAY,
    );
    expect(s.pattern).toBe("widespread");
    expect(s.score).toBeLessThan(scoreNetwork(four(shop("Dukaan 4", unpaid())), TODAY).score);
  });

  it("a balance under 30 days late is not penalised", () => {
    const late = [...reliable(), credit(500, "2026-10-01", "2026-10-16")];
    const s = scoreNetwork(four(shop("Dukaan 4", late)), TODAY);
    expect(s.shops.find((x) => x.label === "Dukaan 4")).toMatchObject({ standing: "late", penalty: 0 });
    expect(s.pattern).toBe("clean");
  });

  it("template summary names the problem shop and the score if settled", () => {
    const s = scoreNetwork(four(shop("Dukaan 4", unpaid())), TODAY);
    const { summary, advice } = basicProfileSummary("Gupta ji", s);
    expect(summary).toContain(`Gupta ji ka Paytm score ${s.score}`);
    expect(summary).toContain("Dukaan 4 ka ₹1,200 75 din se baaki");
    expect(summary).toContain(String(s.baseScore));
    expect(advice.length).toBeGreaterThan(10);
  });
});

describe("network profile (integration)", () => {
  let t: Awaited<ReturnType<typeof setupTestApp>>;
  const ownerA = newAuthUser("net-a");
  const ownerB = newAuthUser("net-b");
  const helperA = newAuthUser("net-helper");
  // Unique per run so parallel or repeated runs never share a consent row.
  const tail = String(Date.now()).slice(-8);
  const phone = `+9190${tail}`;
  const noConsentPhone = `+9191${tail}`;
  let merchantA: string;
  let merchantB: string;
  const ids: Record<string, string> = {};

  async function onboard(owner: typeof ownerA) {
    const res = await t.app.inject({
      method: "POST",
      url: "/merchants",
      headers: bearer(owner),
      payload: validOnboarding,
    });
    const id = res.json().merchant.id as string;
    t.track(id);
    return id;
  }
  async function addCustomer(key: string, merchantId: string, phoneNo: string | null, lines: LedgerLine[]) {
    const [row] = await t.db
      .insert(customers)
      .values({ merchantId, name: "Gupta ji", phone: phoneNo })
      .returning();
    ids[key] = row!.id;
    await t.db.insert(ledgerEntries).values(
      lines.map((l) => ({
        merchantId,
        customerId: row!.id,
        type: l.type,
        amountPaise: l.amountPaise,
        source: "manual" as const,
        entryDate: l.entryDate,
        dueDate: l.dueDate,
      })),
    );
  }
  const profile = (key: string, user = ownerA) =>
    t.app.inject({ method: "GET", url: `/customers/${ids[key]}/network-profile`, headers: bearer(user) });

  beforeAll(async () => {
    t = await setupTestApp();
    merchantA = await onboard(ownerA);
    merchantB = await onboard(ownerB);
    await t.db
      .insert(users)
      .values({ merchantId: merchantA, authUserId: helperA.id, email: helperA.email, role: "helper" });
    await addCustomer("atA", merchantA, phone, reliable());
    await addCustomer("atB", merchantB, phone, unpaid());
    await addCustomer("noConsent", merchantA, noConsentPhone, reliable());
    await addCustomer("noPhone", merchantA, null, reliable());
    await t.db.insert(customerNetworkConsents).values({ phone, granted: true });
  });
  afterAll(async () => {
    await t.db
      .delete(customerNetworkConsents)
      .where(inArray(customerNetworkConsents.phone, [phone, noConsentPhone]));
    await t.close();
  });

  it("with consent: scores across shops, other shops anonymous, with a summary", async () => {
    const res = await profile("atA");
    expect(res.statusCode).toBe(200);
    const p = res.json<NetworkProfile>();
    if (p.status !== "ready") throw new Error(`expected ready, got ${p.status}`);
    expect(p.shops).toHaveLength(2);
    expect(p.shops[0]).toMatchObject({ label: "Aapki dukaan", isThisShop: true });
    expect(p.shops[1]!.label).toMatch(/^Dukaan 2/);
    expect(p.shops[1]).toMatchObject({ standing: "overdue", outstandingPaise: 120000 });
    expect(p.phoneMasked).toBe(`+91 •••••• ${phone.slice(-4)}`);
    expect(JSON.stringify(p)).not.toContain("Test General Store");
    expect(p.summary).toContain("Gupta ji");
    expect(p.advice.length).toBeGreaterThan(0);
  });

  it("a dispute at the other shop softens its penalty", async () => {
    const before = (await profile("atA")).json<NetworkProfile & { status: "ready" }>();
    await t.db.insert(disputes).values({ merchantId: merchantB, customerId: ids.atB!, note: "already paid" });
    const after = (await profile("atA")).json<NetworkProfile & { status: "ready" }>();
    expect(after.shops[1]!.standing).toBe("disputed");
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("without consent shows only the gate; mock consent opens it", async () => {
    expect((await profile("noConsent")).json()).toEqual({
      status: "no_consent",
      phoneMasked: `+91 •••••• ${noConsentPhone.slice(-4)}`,
    });
    const res = await t.app.inject({
      method: "POST",
      url: `/customers/${ids.noConsent}/network-consent`,
      headers: bearer(ownerA),
    });
    expect(res.statusCode).toBe(200);
    expect((await profile("noConsent")).json<NetworkProfile>().status).toBe("ready");
  });

  it("no phone → no profile; consent needs a phone", async () => {
    expect((await profile("noPhone")).json()).toEqual({ status: "no_phone" });
    const res = await t.app.inject({
      method: "POST",
      url: `/customers/${ids.noPhone}/network-consent`,
      headers: bearer(ownerA),
    });
    expect(res.statusCode).toBe(422);
  });

  it("another shop's customer id is not found; helpers are blocked", async () => {
    expect((await profile("atB", ownerA)).statusCode).toBe(404);
    expect((await profile("atA", helperA)).statusCode).toBe(403);
  });
});
