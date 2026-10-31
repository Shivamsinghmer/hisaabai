// F4 Udhaar-as-a-Service (mock, no real money). State machine:
//   offered → funded → (repaying) → closed
// Funding: the shop gives goods on udhaar (ledger credit) and Paytm instantly pays the
// shop (ledger payment, source 'paytm_udhaar'), so the customer's balance on the shop's
// khata is settled and their obligation moves to Paytm. The customer repays Paytm through
// a mock UPI link; that repayment does not touch the shop's ledger. The funding fee is
// charged to the merchant (display only); the customer owes just the udhaar amount.
import { randomBytes } from "node:crypto";
import {
  addDays,
  formatPaise,
  rupeesToPaise,
  todayIst,
  UDHAAR_FEE_PCT,
  type EligibleCustomer,
  type Merchant,
  type UdhaarOverview,
  type UdhaarTxn,
} from "@hisaab/shared";
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customers, ledgerEntries, merchants, notifications, udhaarServiceTxns } from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import { assessCustomers } from "./eligibility.js";

const feeFor = (amountPaise: number) => Math.round((amountPaise * UDHAAR_FEE_PCT) / 100);

function toTxn(
  row: typeof udhaarServiceTxns.$inferSelect,
  customerName: string,
  payLinkBase: string,
): UdhaarTxn {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName,
    amountPaise: row.amountPaise,
    feePaise: row.feePaise ?? 0,
    status: row.status ?? "offered",
    repayUrl: row.repayToken && row.status !== "closed" ? `${payLinkBase}/${row.repayToken}` : null,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}

export async function overview(db: Db, merchantId: string, payLinkBase: string): Promise<UdhaarOverview> {
  const assessed = await assessCustomers(db, merchantId);
  const eligible: EligibleCustomer[] = assessed
    .filter((a) => a.eligible)
    .map((a) => ({
      customerId: a.customerId,
      name: a.name,
      limitPaise: a.limitPaise,
      onTimeRate: a.onTimeRate,
      historyDays: a.historyDays,
      avgTicketPaise: a.avgTicketPaise,
    }))
    .sort((a, b) => b.limitPaise - a.limitPaise);
  const notEligible = assessed
    .filter((a) => !a.eligible)
    // Customers with some ledger history first; a long tail of brand-new names isn't useful.
    .filter((a) => a.avgTicketPaise > 0)
    .map((a) => ({ customerId: a.customerId, name: a.name, reasons: a.reasons }))
    .slice(0, 8);

  const rows = await db
    .select({ txn: udhaarServiceTxns, name: customers.name })
    .from(udhaarServiceTxns)
    .innerJoin(customers, eq(customers.id, udhaarServiceTxns.customerId))
    .where(eq(udhaarServiceTxns.merchantId, merchantId))
    .orderBy(desc(udhaarServiceTxns.createdAt))
    .limit(20);
  return {
    eligible,
    notEligible,
    txns: rows.map((r) => toTxn(r.txn, r.name, payLinkBase)),
    feePct: UDHAAR_FEE_PCT,
  };
}

export async function fund(
  db: Db,
  merchant: Merchant,
  input: { customerId: string; amountRupees: number; items?: string },
  payLinkBase: string,
  createdBy: string,
): Promise<UdhaarTxn> {
  const [assessment] = await assessCustomers(db, merchant.id, input.customerId);
  if (!assessment) throw new AppError(404, "NOT_FOUND", "Customer nahi mila (Not found)");
  if (!assessment.eligible) {
    throw new AppError(
      409,
      "NOT_ELIGIBLE",
      `${assessment.name}: ${assessment.reasons[0] ?? "Paytm Udhaar available nahi"}`,
    );
  }
  const amountPaise = rupeesToPaise(input.amountRupees);
  if (amountPaise > assessment.limitPaise) {
    throw new AppError(
      409,
      "OVER_LIMIT",
      `Limit ${formatPaise(assessment.limitPaise)} hai (Over the limit for ${assessment.name})`,
    );
  }

  const token = randomBytes(16).toString("base64url");
  const fee = feeFor(amountPaise);
  const today = todayIst();
  const row = await db.transaction(async (tx) => {
    // The sale on udhaar…
    await tx.insert(ledgerEntries).values({
      merchantId: merchant.id,
      customerId: input.customerId,
      type: "credit",
      amountPaise,
      items: input.items ?? "Paytm Udhaar sale",
      source: "paytm_udhaar",
      entryDate: today,
      dueDate: addDays(today, merchant.defaultDueDays),
      createdBy,
    });
    // …and Paytm paying the shop on the spot, which settles the customer's khata.
    await tx.insert(ledgerEntries).values({
      merchantId: merchant.id,
      customerId: input.customerId,
      type: "payment",
      amountPaise,
      items: `Paytm Udhaar (fee ${formatPaise(fee)})`,
      source: "paytm_udhaar",
      entryDate: today,
      createdBy,
    });
    const [txn] = await tx
      .insert(udhaarServiceTxns)
      .values({
        merchantId: merchant.id,
        customerId: input.customerId,
        amountPaise,
        feePaise: fee,
        status: "funded",
        repayToken: token,
      })
      .returning();
    await tx.insert(notifications).values({
      merchantId: merchant.id,
      kind: "udhaar_funded",
      title: `Paytm ne ${formatPaise(amountPaise - fee)} turant bheje ✓`,
      body: `${assessment.name} · fee ${formatPaise(fee)} (${UDHAAR_FEE_PCT}%)`,
    });
    return txn!;
  });
  return toTxn(row, assessment.name, payLinkBase);
}

// ---- Customer repays Paytm through the public mock pay page ----

async function findByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ txn: udhaarServiceTxns, customerName: customers.name, shopName: merchants.shopName })
    .from(udhaarServiceTxns)
    .innerJoin(customers, eq(customers.id, udhaarServiceTxns.customerId))
    .innerJoin(merchants, eq(merchants.id, udhaarServiceTxns.merchantId))
    .where(eq(udhaarServiceTxns.repayToken, token));
  return row ?? null;
}

export async function getUdhaarPayInfo(db: Db, token: string) {
  const row = await findByToken(db, token);
  if (!row) return null;
  return {
    kind: "paytm_udhaar" as const,
    shopName: row.shopName,
    customerName: row.customerName,
    amountPaise: row.txn.amountPaise,
    status: row.txn.status ?? "funded",
  };
}

export async function confirmUdhaarRepayment(db: Db, token: string) {
  const row = await findByToken(db, token);
  if (!row) return null;
  if (row.txn.status === "closed") return { status: "paid" as const, paidPaise: 0, balancePaise: 0 };
  await db.transaction(async (tx) => {
    await tx.update(udhaarServiceTxns).set({ status: "closed" }).where(eq(udhaarServiceTxns.id, row.txn.id));
    await tx.insert(notifications).values({
      merchantId: row.txn.merchantId,
      kind: "udhaar_closed",
      title: `${row.customerName} ne Paytm ko ${formatPaise(row.txn.amountPaise)} wapas kiye ✓`,
      body: "Paytm Udhaar band. Aapko kuch nahi karna tha.",
    });
  });
  return { status: "paid" as const, paidPaise: row.txn.amountPaise, balancePaise: 0 };
}
