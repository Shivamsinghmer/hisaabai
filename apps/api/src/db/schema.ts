// Drizzle schema mirroring CLAUDE.md §10. Money is integer paise (bigint);
// times are timestamptz (UTC). Deviations from §10, decided 2026-10-31:
// - users.auth_user_id/email: identity comes from Neon Auth (email OTP), so
//   phone is optional on users and merchants.
// - disputes.merchant_id: every table is scoped by merchant (§16).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow();
const paise = (name: string) => bigint(name, { mode: "number" });

export type QuietHours = { start: string; end: string };
export type ScoreFactor = {
  key: string;
  value: number;
  weight: number;
  points: number;
  direction: "up" | "down";
};
export type CallTurn = { role: "agent" | "customer"; text: string; at: string; audioUrl?: string | null };
export type CallMeta = {
  amountPaise?: number;
  promise?: { promisedDate: string; amountPaise: number | null };
  followUpAt?: string;
  payUrl?: string;
  /** Paid now via link during a partial ("abhi 200 deta hoon"). */
  partialPaise?: number;
};

export const merchants = pgTable("merchants", {
  id: id(),
  ownerName: text("owner_name").notNull(),
  shopName: text("shop_name").notNull(),
  phone: text("phone").unique(),
  language: text("language").notNull().default("hi-IN"),
  city: text("city"),
  paytmLinked: boolean("paytm_linked").default(false),
  defaultDueDays: integer("default_due_days").default(15),
  autoGentleReminders: boolean("auto_gentle_reminders").default(true),
  quietHours: jsonb("quiet_hours").$type<QuietHours>().default({ start: "21:00", end: "09:00" }),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
    // neon_auth.user.id; null for seeded users who never log in.
    authUserId: uuid("auth_user_id").unique(),
    email: text("email"),
    phone: text("phone").unique(),
    role: text("role").notNull().$type<"owner" | "helper">(),
    createdAt: createdAt(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('owner','helper')`), index().on(t.merchantId)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aliases: text("aliases")
      .array()
      .default(sql`'{}'::text[]`),
    phone: text("phone"),
    upiVpa: text("upi_vpa"),
    language: text("language").default("hi-IN"),
    trustLevel: text("trust_level").default("regular").$type<"new" | "regular" | "trusted" | "risky">(),
    payPrediction: text("pay_prediction").$type<"will_pay" | "might_delay" | "risky">(),
    udhaarServiceEligible: boolean("udhaar_service_eligible").default(false),
    udhaarServiceLimitPaise: paise("udhaar_service_limit_paise").default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("customers_trust_level_check", sql`${t.trustLevel} in ('new','regular','trusted','risky')`),
    index().on(t.merchantId),
  ],
);

export const khataScans = pgTable("khata_scans", {
  id: id(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  rawText: text("raw_text"),
  ocrProvider: text("ocr_provider"),
  status: text("status").default("processing").$type<"processing" | "review" | "saved" | "failed">(),
  createdAt: createdAt(),
});

export const ledgerEntryTypes = ["credit", "payment", "sale", "purchase", "expense"] as const;
export const ledgerSources = ["photo", "voice", "upi", "manual", "paytm_udhaar", "loan"] as const;

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    // null for walk-in sales
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull().$type<(typeof ledgerEntryTypes)[number]>(),
    amountPaise: paise("amount_paise").notNull(),
    items: text("items"),
    source: text("source").notNull().$type<(typeof ledgerSources)[number]>(),
    scanId: uuid("scan_id").references(() => khataScans.id),
    transcript: text("transcript"),
    confidence: real("confidence"),
    status: text("status").default("confirmed").$type<"pending_confirm" | "confirmed" | "deleted">(),
    entryDate: date("entry_date")
      .notNull()
      .default(sql`current_date`),
    dueDate: date("due_date"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("ledger_entries_type_check", sql`${t.type} in ('credit','payment','sale','purchase','expense')`),
    check("ledger_entries_amount_check", sql`${t.amountPaise} > 0`),
    check(
      "ledger_entries_source_check",
      sql`${t.source} in ('photo','voice','upi','manual','paytm_udhaar','loan')`,
    ),
    check("ledger_entries_status_check", sql`${t.status} in ('pending_confirm','confirmed','deleted')`),
    index().on(t.merchantId, t.customerId, t.entryDate),
  ],
);

// Customer balance = sum(credit) − sum(payment) over confirmed entries (§10).
// Negative balance = advance paid by the customer.
// earliest_due = due date of the oldest credit not yet covered by payments
// (payments settle the oldest credits first). §10's draft used the minimum
// due date over all credits, which marks every long-standing customer overdue.
export const customerBalances = pgView("customer_balances", {
  customerId: uuid("customer_id").notNull(),
  merchantId: uuid("merchant_id").notNull(),
  name: text("name").notNull(),
  balancePaise: paise("balance_paise").notNull(),
  earliestDue: date("earliest_due"),
}).as(sql`
  with totals as (
    select c.id as customer_id, c.merchant_id, c.name,
      coalesce(sum(e.amount_paise) filter (where e.type = 'credit'), 0)::bigint as credited,
      coalesce(sum(e.amount_paise) filter (where e.type = 'payment'), 0)::bigint as paid
    from customers c
    left join ledger_entries e on e.customer_id = c.id and e.status = 'confirmed'
    group by c.id
  ),
  running as (
    select e.customer_id, e.due_date,
      sum(e.amount_paise) over (
        partition by e.customer_id order by e.entry_date, e.created_at, e.id
      ) as credited_so_far
    from ledger_entries e
    where e.type = 'credit' and e.status = 'confirmed'
  ),
  oldest_unpaid as (
    select r.customer_id, min(r.due_date) as earliest_due
    from running r join totals t using (customer_id)
    where r.credited_so_far > t.paid
    group by r.customer_id
  )
  select t.customer_id, t.merchant_id, t.name,
    (t.credited - t.paid)::bigint as balance_paise,
    o.earliest_due
  from totals t left join oldest_unpaid o using (customer_id)
`);

export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channel: text("channel").$type<"in_app" | "whatsapp" | "sms" | "call_sim">(),
    tone: text("tone").$type<"gentle" | "firm">(),
    message: text("message"),
    amountPaise: paise("amount_paise"),
    paymentToken: text("payment_token").unique(),
    status: text("status").default("sent").$type<"queued" | "sent" | "paid" | "ignored">(),
    approvedByMerchant: boolean("approved_by_merchant").default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("reminders_channel_check", sql`${t.channel} in ('in_app','whatsapp','sms','call_sim')`),
    check("reminders_tone_check", sql`${t.tone} in ('gentle','firm')`),
    check("reminders_status_check", sql`${t.status} in ('queued','sent','paid','ignored')`),
    index().on(t.merchantId, t.customerId),
  ],
);

export const promises = pgTable(
  "promises",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amountPaise: paise("amount_paise"),
    promisedDate: date("promised_date").notNull(),
    source: text("source").$type<"call_sim" | "reminder_reply" | "merchant">(),
    status: text("status").default("open").$type<"open" | "kept" | "broken">(),
    createdAt: createdAt(),
  },
  (t) => [
    check("promises_status_check", sql`${t.status} in ('open','kept','broken')`),
    index().on(t.merchantId, t.status, t.promisedDate),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: text("status").default("ringing").$type<"ringing" | "live" | "ended">(),
    outcome: text("outcome").$type<"paid" | "promise" | "partial" | "dispute" | "no_answer" | "refused">(),
    transcript: jsonb("transcript").$type<CallTurn[]>().default([]),
    meta: jsonb("meta").$type<CallMeta>().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index().on(t.merchantId, t.customerId)],
);

export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    note: text("note"),
    status: text("status").default("open"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.merchantId, t.customerId)],
);

export const creditScores = pgTable(
  "credit_scores",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    factors: jsonb("factors").$type<ScoreFactor[]>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("credit_scores_score_check", sql`${t.score} between 300 and 900`),
    index().on(t.merchantId, t.computedAt),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull().$type<"lending" | "insurance" | "analytics" | "data_storage">(),
    granted: boolean("granted").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index().on(t.merchantId)],
);

export const loanOffers = pgTable(
  "loan_offers",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    scoreId: uuid("score_id").references(() => creditScores.id),
    amountPaise: paise("amount_paise").notNull(),
    tenureMonths: integer("tenure_months").notNull(),
    annualRatePct: numeric("annual_rate_pct", { precision: 5, scale: 2 }).notNull(),
    emiPaise: paise("emi_paise").notNull(),
    teachBackAttempts: integer("teach_back_attempts").default(0),
    teachBackPassed: boolean("teach_back_passed").default(false),
    status: text("status")
      .default("offered")
      .$type<"offered" | "accepted" | "disbursed" | "declined" | "expired">(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "loan_offers_status_check",
      sql`${t.status} in ('offered','accepted','disbursed','declined','expired')`,
    ),
    index().on(t.merchantId),
  ],
);

export const udhaarServiceTxns = pgTable(
  "udhaar_service_txns",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amountPaise: paise("amount_paise").notNull(),
    feePaise: paise("fee_paise").default(0),
    status: text("status")
      .default("offered")
      .$type<"offered" | "funded" | "repaying" | "closed" | "defaulted">(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "udhaar_service_txns_status_check",
      sql`${t.status} in ('offered','funded','repaying','closed','defaulted')`,
    ),
    index().on(t.merchantId),
  ],
);

// P2 modules
export const products = pgTable("products", {
  id: id(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  name: text("name"),
  unit: text("unit"),
  stockQty: numeric("stock_qty"),
  reorderLevel: numeric("reorder_level"),
  supplier: text("supplier"),
});

export const purchases = pgTable("purchases", {
  id: id(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  qty: numeric("qty"),
  ratePaise: paise("rate_paise"),
  billScanUrl: text("bill_scan_url"),
  purchaseDate: date("purchase_date").default(sql`current_date`),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    kind: text("kind"),
    title: text("title"),
    body: text("body"),
    read: boolean("read").default(false),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.merchantId, t.read)],
);
