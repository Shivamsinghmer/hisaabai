// Udhaar-as-a-Service eligibility (CLAUDE.md §14, F4), computed from this shop's
// ledger only: ≥ 3 months of history, ≥ 80% of judged credits repaid on time, no
// open dispute. Limit = min(₹5,000, 1.5 × the customer's average udhaar ticket),
// minus Paytm Udhaar still outstanding.
import {
  formatPaise,
  todayIst,
  UDHAAR_MAX_LIMIT_PAISE,
  UDHAAR_MIN_HISTORY_DAYS,
  UDHAAR_MIN_ON_TIME,
} from "@hisaab/shared";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers, disputes, ledgerEntries, udhaarServiceTxns } from "../db/schema.js";
import { daysBetween } from "../services/scorecard.js";

export type LedgerLine = {
  type: "credit" | "payment";
  amountPaise: number;
  entryDate: string;
  dueDate: string | null;
};

/**
 * Share of judged credits that were repaid by their due date. Payments settle the oldest
 * credits first (same FIFO as the balance view). A credit still unpaid is judged late only
 * once its due date has passed; otherwise it is not judged yet.
 */
export function onTimeRate(lines: LedgerLine[], today = todayIst()): { rate: number | null; judged: number } {
  const credits = lines
    .filter((l) => l.type === "credit")
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const payments = lines
    .filter((l) => l.type === "payment")
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  let creditedSoFar = 0;
  let onTime = 0;
  let late = 0;
  for (const credit of credits) {
    creditedSoFar += credit.amountPaise;
    let paid = 0;
    let settledOn: string | null = null;
    for (const p of payments) {
      paid += p.amountPaise;
      if (paid >= creditedSoFar) {
        settledOn = p.entryDate;
        break;
      }
    }
    if (settledOn !== null) {
      if (credit.dueDate === null || settledOn <= credit.dueDate) onTime++;
      else late++;
    } else if (credit.dueDate !== null && credit.dueDate < today) {
      late++;
    }
  }
  const judged = onTime + late;
  return { rate: judged === 0 ? null : onTime / judged, judged };
}

export type Assessment = {
  eligible: boolean;
  reasons: string[];
  limitPaise: number;
  onTimeRate: number;
  historyDays: number;
  avgTicketPaise: number;
};

export function assess(
  input: { lines: LedgerLine[]; openDispute: boolean; outstandingPaytmPaise: number },
  today = todayIst(),
): Assessment {
  const credits = input.lines.filter((l) => l.type === "credit");
  const first = credits.map((c) => c.entryDate).sort()[0];
  const historyDays = first ? daysBetween(first, today) : 0;
  const avgTicketPaise = credits.length
    ? Math.round(credits.reduce((s, c) => s + c.amountPaise, 0) / credits.length)
    : 0;
  const { rate } = onTimeRate(input.lines, today);

  // 1.5 × average ticket, rounded down to whole ₹10, capped at ₹5,000.
  const cap = Math.min(UDHAAR_MAX_LIMIT_PAISE, Math.floor((avgTicketPaise * 1.5) / 1000) * 1000);
  const limitPaise = Math.max(0, cap - input.outstandingPaytmPaise);

  const reasons: string[] = [];
  if (historyDays < UDHAAR_MIN_HISTORY_DAYS)
    reasons.push("3 mahine se kam ka hisaab (Under 3 months of history)");
  if (rate === null || rate < UDHAAR_MIN_ON_TIME) {
    reasons.push(
      rate === null
        ? "Wapasi ka record nahi (No repayment record yet)"
        : `Samay par wapasi ${Math.round(rate * 100)}% hai, 80% chahiye (On-time repayment below 80%)`,
    );
  }
  if (input.openDispute) reasons.push("Vivaad khula hai (Open dispute)");
  if (reasons.length === 0 && limitPaise < 1000) {
    reasons.push(`Limit poori ho chuki hai (Limit used up: ${formatPaise(cap)})`);
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    limitPaise,
    onTimeRate: rate ?? 0,
    historyDays,
    avgTicketPaise,
  };
}

/** Assessments for every customer of a shop, or just one. */
export async function assessCustomers(db: Db, merchantId: string, onlyCustomerId?: string) {
  const scope = onlyCustomerId
    ? and(eq(customers.merchantId, merchantId), eq(customers.id, onlyCustomerId))
    : eq(customers.merchantId, merchantId);
  const people = await db.select({ id: customers.id, name: customers.name }).from(customers).where(scope);
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);

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
        eq(ledgerEntries.merchantId, merchantId),
        eq(ledgerEntries.status, "confirmed"),
        inArray(ledgerEntries.type, ["credit", "payment"]),
        // The funded sale and Paytm's instant payment cancel out; counting them would
        // inflate the customer's own limit and on-time record.
        ne(ledgerEntries.source, "paytm_udhaar"),
        inArray(ledgerEntries.customerId, ids),
      ),
    );
  const open = await db
    .select({ customerId: disputes.customerId })
    .from(disputes)
    .where(and(eq(disputes.merchantId, merchantId), eq(disputes.status, "open")));
  const active = await db
    .select({ customerId: udhaarServiceTxns.customerId, amountPaise: udhaarServiceTxns.amountPaise })
    .from(udhaarServiceTxns)
    .where(
      and(
        eq(udhaarServiceTxns.merchantId, merchantId),
        inArray(udhaarServiceTxns.status, ["funded", "repaying"]),
      ),
    );

  const byCustomer = new Map<string, LedgerLine[]>();
  for (const e of entries) {
    if (!e.customerId) continue;
    const list = byCustomer.get(e.customerId) ?? [];
    list.push({
      type: e.type as "credit" | "payment",
      amountPaise: e.amountPaise,
      entryDate: e.entryDate,
      dueDate: e.dueDate,
    });
    byCustomer.set(e.customerId, list);
  }
  const disputed = new Set(open.map((d) => d.customerId));
  const outstanding = new Map<string, number>();
  for (const t of active) outstanding.set(t.customerId, (outstanding.get(t.customerId) ?? 0) + t.amountPaise);

  return people.map((p) => ({
    customerId: p.id,
    name: p.name,
    ...assess({
      lines: byCustomer.get(p.id) ?? [],
      openDispute: disputed.has(p.id),
      outstandingPaytmPaise: outstanding.get(p.id) ?? 0,
    }),
  }));
}
