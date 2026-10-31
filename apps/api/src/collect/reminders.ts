// F2.1 reminders with a mock Paytm UPI link, and the public pay page (F2.1 step 4).
import { randomBytes } from "node:crypto";
import { formatPaise, rupeesToPaise, todayIst, type Merchant, type Reminder } from "@hisaab/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { balanceOf } from "../db/repos/ledger.js";
import {
  customerBalances,
  customers,
  ledgerEntries,
  merchants,
  notifications,
  promises,
  reminders,
} from "../db/schema.js";
import { AppError } from "../lib/errors.js";

type ReminderRow = typeof reminders.$inferSelect;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const newPaymentToken = () => randomBytes(16).toString("base64url");

function toReminder(row: ReminderRow, customerName: string, payLinkBase: string): Reminder {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName,
    tone: row.tone ?? "gentle",
    message: row.message ?? "",
    amountPaise: row.amountPaise ?? 0,
    payUrl: `${payLinkBase}/${row.paymentToken}`,
    status: row.status ?? "sent",
    sentAt: (row.sentAt ?? new Date()).toISOString(),
  };
}

/** Gentle for a first reminder; firm after a broken promise or 15+ days overdue. Never threatening. */
export function composeReminder(o: {
  customerName: string;
  shopName: string;
  amountPaise: number;
  daysOverdue: number;
  brokenPromises: number;
  link: string;
}): { tone: "gentle" | "firm"; message: string } {
  const amount = formatPaise(o.amountPaise);
  if (o.brokenPromises > 0 || o.daysOverdue >= 15) {
    const since = o.daysOverdue > 0 ? ` ${o.daysOverdue} din se` : "";
    return {
      tone: "firm",
      message: `${o.customerName}, ${amount} ka bhugtan${since} baaki hai. Kripya aaj ${o.link} se jama karein ya bataayein kab tak denge. — ${o.shopName}`,
    };
  }
  return {
    tone: "gentle",
    message: `Namaste ${o.customerName} 🙏, ${o.shopName} se yaad dila rahe hain — aapka ${amount} baaki hai. Aasaani se yahan se de sakte hain: ${o.link}`,
  };
}

export async function createReminder(
  db: Db,
  merchant: Merchant,
  customerId: string,
  payLinkBase: string,
  opts: { channel?: "in_app" | "call_sim"; amountPaise?: number } = {},
): Promise<Reminder> {
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.merchantId, merchant.id)));
  if (!customer) throw new AppError(404, "NOT_FOUND", "Customer nahi mila (Not found)");

  const balance = await balanceOf(db, customerId);
  if (balance <= 0) throw new AppError(409, "NOTHING_DUE", `${customer.name} ka koi udhaar baaki nahi hai.`);
  const amountPaise = Math.min(opts.amountPaise ?? balance, balance);
  const channel = opts.channel ?? "in_app";

  // §16: at most one reminder a day per customer — reuse today's.
  if (channel === "in_app") {
    const [today] = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.customerId, customerId),
          eq(reminders.channel, "in_app"),
          sql`(${reminders.sentAt} at time zone 'Asia/Kolkata')::date = ${todayIst()}::date`,
        ),
      )
      .orderBy(desc(reminders.sentAt))
      .limit(1);
    if (today && today.status !== "paid") return toReminder(today, customer.name, payLinkBase);
  }

  const [due] = await db
    .select({ earliestDue: customerBalances.earliestDue })
    .from(customerBalances)
    .where(eq(customerBalances.customerId, customerId));
  const [broken] = await db
    .select({ n: count() })
    .from(promises)
    .where(and(eq(promises.customerId, customerId), eq(promises.status, "broken")));

  const token = newPaymentToken();
  const { tone, message } = composeReminder({
    customerName: customer.name,
    shopName: merchant.shopName,
    amountPaise,
    daysOverdue: due?.earliestDue ? Math.max(0, daysBetween(due.earliestDue, todayIst())) : 0,
    brokenPromises: broken?.n ?? 0,
    link: `${payLinkBase}/${token}`,
  });
  const [row] = await db
    .insert(reminders)
    .values({
      merchantId: merchant.id,
      customerId,
      channel,
      tone,
      message,
      amountPaise,
      paymentToken: token,
      status: "sent",
      approvedByMerchant: true,
    })
    .returning();
  return toReminder(row!, customer.name, payLinkBase);
}

async function findByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      reminder: reminders,
      customerName: customers.name,
      shopName: merchants.shopName,
    })
    .from(reminders)
    .innerJoin(customers, eq(customers.id, reminders.customerId))
    .innerJoin(merchants, eq(merchants.id, reminders.merchantId))
    .where(eq(reminders.paymentToken, token));
  return row ?? null;
}

export async function getPayInfo(db: Db, token: string) {
  const row = await findByToken(db, token);
  if (!row) return null;
  return {
    shopName: row.shopName,
    customerName: row.customerName,
    amountPaise: row.reminder.amountPaise ?? 0,
    status: row.reminder.status ?? "sent",
  };
}

/** Mock UPI success: records the payment, closes the reminder, tells the merchant. */
export async function confirmPayment(db: Db, token: string, amountRupees?: number) {
  const row = await findByToken(db, token);
  if (!row) return null;
  const r = row.reminder;
  if (r.status === "paid")
    return { status: "paid" as const, paidPaise: 0, balancePaise: await balanceOf(db, r.customerId) };

  const full = r.amountPaise ?? 0;
  const paid = Math.min(amountRupees ? rupeesToPaise(amountRupees) : full, full);
  if (paid <= 0) throw new AppError(400, "VALIDATION_ERROR", "amount must be positive");

  await db.transaction(async (tx) => {
    await tx.insert(ledgerEntries).values({
      merchantId: r.merchantId,
      customerId: r.customerId,
      type: "payment",
      amountPaise: paid,
      source: "upi",
      entryDate: todayIst(),
      items: "Paytm UPI link (demo)",
    });
    await tx
      .update(reminders)
      .set({ status: paid >= full ? "paid" : "sent", amountPaise: full - paid > 0 ? full - paid : full })
      .where(eq(reminders.id, r.id));
    await tx.insert(notifications).values({
      merchantId: r.merchantId,
      kind: "payment_received",
      title: `${row.customerName} ne ${formatPaise(paid)} de diye ✓`,
      body: "Paytm UPI link (demo)",
    });
  });

  const balancePaise = await balanceOf(db, r.customerId);
  if (balancePaise <= 0) {
    await db
      .update(promises)
      .set({ status: "kept" })
      .where(and(eq(promises.customerId, r.customerId), eq(promises.status, "open")));
  }
  return { status: paid >= full ? ("paid" as const) : ("partial" as const), paidPaise: paid, balancePaise };
}
