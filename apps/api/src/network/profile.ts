// Paytm customer profile for one customer of a shop: the same person (same phone) at every
// shop on Hisaab AI. This is the one deliberate read across merchants (§16 data separation),
// so it is gated twice: the viewer must own the shop the customer belongs to, and the
// customer must have consented. Other shops are anonymous ("Dukaan 2 · Noida"), and only
// totals leave them: no names, items or entries.
import {
  formatPaise,
  maskPhone,
  normalizePhone,
  type NetworkProfile,
  type NetworkScore,
  todayIst,
} from "@hisaab/shared";
import type { FastifyBaseLogger } from "fastify";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import {
  customerNetworkConsents,
  customers,
  disputes,
  ledgerEntries,
  merchants,
  promises,
} from "../db/schema.js";
import { renderPrompt } from "../prompts/loader.js";
import type { AiServices } from "../services/types.js";
import type { LedgerLine } from "../udhaar/eligibility.js";
import { scoreNetwork, type ShopHistory } from "./score.js";

/** The customer row, scoped to the viewing shop; null if it belongs to another shop. */
async function ownCustomer(db: Db, merchantId: string, customerId: string) {
  const [row] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.merchantId, merchantId), eq(customers.id, customerId)));
  return row ?? null;
}

async function hasConsent(db: Db, phone: string) {
  const [row] = await db
    .select({ granted: customerNetworkConsents.granted })
    .from(customerNetworkConsents)
    .where(eq(customerNetworkConsents.phone, phone));
  return row?.granted === true;
}

/** Every shop's history for this phone, the viewing shop first. */
export async function networkHistories(db: Db, merchantId: string, phone: string): Promise<ShopHistory[]> {
  const rows = await db
    .select({ id: customers.id, merchantId: customers.merchantId, city: merchants.city })
    .from(customers)
    .innerJoin(merchants, eq(merchants.id, customers.merchantId))
    .where(eq(customers.phone, phone));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const entries = await db
    .select({
      customerId: ledgerEntries.customerId,
      type: ledgerEntries.type,
      amountPaise: ledgerEntries.amountPaise,
      entryDate: ledgerEntries.entryDate,
      dueDate: ledgerEntries.dueDate,
    })
    .from(ledgerEntries)
    .where(
      and(
        inArray(ledgerEntries.customerId, ids),
        eq(ledgerEntries.status, "confirmed"),
        inArray(ledgerEntries.type, ["credit", "payment"]),
        // Paytm Udhaar sales are paid to the shop at once; the customer owes Paytm, not the shop.
        ne(ledgerEntries.source, "paytm_udhaar"),
      ),
    );
  const promiseRows = await db
    .select({ customerId: promises.customerId, status: promises.status })
    .from(promises)
    .where(inArray(promises.customerId, ids));
  const openDisputes = await db
    .select({ customerId: disputes.customerId })
    .from(disputes)
    .where(and(inArray(disputes.customerId, ids), eq(disputes.status, "open")));
  const disputed = new Set(openDisputes.map((d) => d.customerId));

  // Stable numbering for the other shops, so "Dukaan 2" stays the same shop between visits.
  const others = rows.filter((r) => r.merchantId !== merchantId).sort((a, b) => a.id.localeCompare(b.id));
  const ordered = [...rows.filter((r) => r.merchantId === merchantId), ...others];

  return ordered.map((r, i) => {
    const lines: LedgerLine[] = entries
      .filter((e) => e.customerId === r.id)
      .map((e) => ({
        type: e.type as "credit" | "payment",
        amountPaise: e.amountPaise,
        entryDate: e.entryDate,
        dueDate: e.dueDate,
      }));
    const mine = promiseRows.filter((p) => p.customerId === r.id);
    const isThisShop = r.merchantId === merchantId;
    return {
      label: isThisShop ? "Aapki dukaan" : `Dukaan ${i + 1}${r.city ? ` · ${r.city}` : ""}`,
      isThisShop,
      lines,
      promisesKept: mine.filter((p) => p.status === "kept").length,
      promisesBroken: mine.filter((p) => p.status === "broken").length,
      openDispute: disputed.has(r.id),
    };
  });
}

const BAND_WORD = { trusted: "Bharosemand", good: "Theek", watch: "Dhyan dein", risky: "Jokhim" } as const;

/** Template summary: used when the LLM is down, mocked or returns something unusable. */
export function basicProfileSummary(name: string, s: NetworkScore): { summary: string; advice: string } {
  const others = s.shops.filter((x) => !x.isThisShop);
  const goodOthers = others.filter((x) => x.standing === "good").length;
  const overdue = s.shops.filter((x) => x.standing === "overdue");
  const disputed = s.shops.filter((x) => x.standing === "disputed");
  const lines = [
    `${name} ka Paytm score ${s.score} hai (${BAND_WORD[s.band]}). ${s.shops.length} dukaanon ka hisaab dekha gaya.`,
  ];
  if (overdue.length === 0 && disputed.length === 0) {
    lines.push("Kisi bhi dukaan ka purana baaki nahi hai, aur zyaadatar udhaar samay par lautaya hai.");
  } else {
    if (overdue.length > 0) {
      const o = overdue[0]!;
      lines.push(
        overdue.length === 1
          ? `${goodOthers > 0 ? `${goodOthers} aur dukaanon par samay par dete hain, lekin ` : ""}${o.label} ka ${formatPaise(o.outstandingPaise)} ${o.overdueDays} din se baaki hai.`
          : `${overdue.length} dukaanon ka udhaar 30 din se zyada se baaki hai.`,
      );
    }
    if (disputed.length > 0) {
      lines.push(
        `${disputed.length} dukaan ke saath hisaab par vivaad khula hai, isliye us par kam asar pada.`,
      );
    }
  }
  if (s.penaltyTotal > 0) lines.push(`Purana baaki chukane par score ${s.baseScore} tak ja sakta hai.`);

  const advice =
    s.band === "trusted"
      ? "Udhaar de sakte hain; Paytm Udhaar bhi offer kar sakte hain."
      : s.band === "good"
        ? "Udhaar de sakte hain, chhoti rakam se shuru karein."
        : s.band === "watch"
          ? "Nayi udhaar se pehle aapka purana baaki clear karwayein; rakam chhoti rakhein."
          : "Abhi naya udhaar na dein; pehle pichhla baaki wasool karein.";
  return { summary: lines.join(" "), advice };
}

const SummarySchema = z.object({
  summary: z.string().min(1).max(600),
  advice: z.string().min(1).max(200),
});

/** The facts the LLM may use: the scorer's output, in rupees, with nothing else about other shops. */
export function summaryInput(name: string, s: NetworkScore) {
  return {
    customer_name: name,
    score: s.score,
    band: s.band,
    pattern: s.pattern,
    score_if_settled: s.baseScore,
    shops: s.shops.map((x) => ({
      label: x.label,
      standing: x.standing,
      on_time_pct: x.onTimeRate === null ? null : Math.round(x.onTimeRate * 100),
      outstanding_rupees: x.outstandingPaise / 100,
      overdue_days: x.overdueDays,
      penalty_points: x.penalty,
    })),
  };
}

export async function customerProfile(
  db: Db,
  ai: AiServices,
  merchantId: string,
  customerId: string,
  log: Pick<FastifyBaseLogger, "warn">,
  today = todayIst(),
): Promise<NetworkProfile | null> {
  const customer = await ownCustomer(db, merchantId, customerId);
  if (!customer) return null;
  const phone = normalizePhone(customer.phone);
  if (!phone) return { status: "no_phone" };
  if (!(await hasConsent(db, phone))) return { status: "no_consent", phoneMasked: maskPhone(phone) };

  const scored = scoreNetwork(await networkHistories(db, merchantId, phone), today);
  let text: { summary: string; advice: string };
  try {
    text = await ai.llm.chatJson({
      op: "customer_profile",
      system: renderPrompt("customer_profile").text,
      user: JSON.stringify(summaryInput(customer.name, scored)),
      schema: SummarySchema,
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "customer profile summary fell back to template");
    text = basicProfileSummary(customer.name, scored);
  }
  return { status: "ready", phoneMasked: maskPhone(phone), ...scored, ...text };
}

/**
 * Mock of the customer's consent (in production: the customer approves an OTP or a link
 * sent to their phone, never the shop on their behalf). Returns false if not this shop's customer.
 */
export async function recordConsent(db: Db, merchantId: string, customerId: string) {
  const customer = await ownCustomer(db, merchantId, customerId);
  const phone = normalizePhone(customer?.phone);
  if (!customer || !phone) return false;
  await db
    .insert(customerNetworkConsents)
    .values({ phone, granted: true })
    .onConflictDoUpdate({
      target: customerNetworkConsents.phone,
      set: { granted: true, grantedAt: new Date(), revokedAt: null },
    });
  return true;
}
