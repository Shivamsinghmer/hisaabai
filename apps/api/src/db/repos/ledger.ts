// Ledger + customer data access. merchantId always comes from the membership.
import { todayIst, type CustomerRow, type DueStatus } from "@hisaab/shared";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { customerBalances, customers, ledgerEntries, promises } from "../schema.js";

export function dueStatus(balancePaise: number, earliestDue: string | null, today = todayIst()): DueStatus {
  if (balancePaise < 0) return "advance";
  if (balancePaise === 0) return "clear";
  return earliestDue && earliestDue < today ? "overdue" : "due";
}

export async function listCustomers(db: Db, merchantId: string): Promise<CustomerRow[]> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      payPrediction: customers.payPrediction,
      balancePaise: customerBalances.balancePaise,
      earliestDue: customerBalances.earliestDue,
    })
    .from(customers)
    .innerJoin(customerBalances, eq(customerBalances.customerId, customers.id))
    .where(eq(customers.merchantId, merchantId))
    .orderBy(desc(customerBalances.balancePaise), customers.name);
  const today = todayIst();
  return rows.map((r) => ({
    ...r,
    balancePaise: Number(r.balancePaise),
    payPrediction: r.payPrediction ?? null,
    status: dueStatus(Number(r.balancePaise), r.earliestDue, today),
  }));
}

export async function customerCandidates(db: Db, merchantId: string) {
  return db
    .select({ id: customers.id, name: customers.name, aliases: customers.aliases })
    .from(customers)
    .where(eq(customers.merchantId, merchantId));
}

export async function getCustomerDetail(db: Db, merchantId: string, customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.merchantId, merchantId)));
  if (!customer) return null;
  const [balance] = await db
    .select()
    .from(customerBalances)
    .where(eq(customerBalances.customerId, customerId));
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.customerId, customerId), eq(ledgerEntries.status, "confirmed")))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.createdAt))
    .limit(60);
  const promiseRows = await db
    .select()
    .from(promises)
    .where(eq(promises.customerId, customerId))
    .orderBy(desc(promises.promisedDate))
    .limit(10);
  const balancePaise = Number(balance?.balancePaise ?? 0);
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      aliases: customer.aliases ?? [],
      balancePaise,
      earliestDue: balance?.earliestDue ?? null,
      status: dueStatus(balancePaise, balance?.earliestDue ?? null),
      payPrediction: customer.payPrediction ?? null,
    },
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amountPaise: e.amountPaise,
      items: e.items,
      source: e.source,
      entryDate: e.entryDate,
      dueDate: e.dueDate,
      createdAt: (e.createdAt ?? new Date()).toISOString(),
    })),
    promises: promiseRows.map((p) => ({
      id: p.id,
      amountPaise: p.amountPaise,
      promisedDate: p.promisedDate,
      status: p.status ?? "open",
    })),
  };
}

export async function balanceOf(db: Db, customerId: string): Promise<number> {
  const [row] = await db
    .select({ balance: customerBalances.balancePaise })
    .from(customerBalances)
    .where(eq(customerBalances.customerId, customerId));
  return Number(row?.balance ?? 0);
}

/** Same customer, type and amount in the last 2 minutes (§17 duplicate guard). */
export async function recentDuplicate(
  db: Db,
  merchantId: string,
  customerId: string,
  type: "credit" | "payment",
  amountPaise: number,
) {
  const [row] = await db
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.merchantId, merchantId),
        eq(ledgerEntries.customerId, customerId),
        eq(ledgerEntries.type, type),
        eq(ledgerEntries.amountPaise, amountPaise),
        eq(ledgerEntries.status, "confirmed"),
        gt(ledgerEntries.createdAt, sql`now() - interval '2 minutes'`),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function lastEntryFor(db: Db, merchantId: string, customerId: string) {
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.merchantId, merchantId),
        eq(ledgerEntries.customerId, customerId),
        eq(ledgerEntries.status, "confirmed"),
        inArray(ledgerEntries.type, ["credit", "payment"]),
      ),
    )
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(1);
  return row ?? null;
}

/** Soft delete (§11). Returns the entry, or null if it isn't this shop's. */
export async function softDeleteEntry(db: Db, merchantId: string, entryId: string) {
  const [row] = await db
    .update(ledgerEntries)
    .set({ status: "deleted" })
    .where(and(eq(ledgerEntries.id, entryId), eq(ledgerEntries.merchantId, merchantId)))
    .returning();
  return row ?? null;
}

export async function todaySummary(db: Db, merchantId: string) {
  const today = todayIst();
  const [totals] = await db
    .select({
      sales: sql<string>`coalesce(sum(${ledgerEntries.amountPaise}) filter (where ${ledgerEntries.type} = 'sale' and ${ledgerEntries.entryDate} = ${today}), 0)`,
      collected: sql<string>`coalesce(sum(${ledgerEntries.amountPaise}) filter (where ${ledgerEntries.type} = 'payment' and ${ledgerEntries.entryDate} = ${today}), 0)`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.merchantId, merchantId), eq(ledgerEntries.status, "confirmed")));
  const [dues] = await db
    .select({
      due: sql<string>`coalesce(sum(${customerBalances.balancePaise}) filter (where ${customerBalances.balancePaise} > 0), 0)`,
      overdue: sql<string>`count(*) filter (where ${customerBalances.balancePaise} > 0 and ${customerBalances.earliestDue} < ${today})`,
    })
    .from(customerBalances)
    .where(eq(customerBalances.merchantId, merchantId));
  return {
    date: today,
    salesPaise: Number(totals?.sales ?? 0),
    collectedPaise: Number(totals?.collected ?? 0),
    udhaarDuePaise: Number(dues?.due ?? 0),
    overdueCustomers: Number(dues?.overdue ?? 0),
  };
}
