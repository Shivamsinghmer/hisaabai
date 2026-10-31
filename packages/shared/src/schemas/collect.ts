import { z } from "zod";
import { CustomerRowSchema } from "./ledger.js";

export const ReminderSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  tone: z.enum(["gentle", "firm"]),
  message: z.string(),
  amountPaise: z.number(),
  payUrl: z.string(),
  status: z.enum(["queued", "sent", "paid", "ignored"]),
  sentAt: z.string(),
});
export type Reminder = z.infer<typeof ReminderSchema>;

/** GET /collect/dashboard */
export const CollectDashboardSchema = z.object({
  dues: z.array(
    CustomerRowSchema.extend({
      openPromiseDate: z.string().nullable(),
      brokenPromises: z.number(),
      remindedToday: z.boolean(),
    }),
  ),
  totals: z.object({ duePaise: z.number(), overdueCount: z.number(), brokenPromises: z.number() }),
  recentCalls: z.array(
    z.object({
      id: z.string(),
      customerName: z.string(),
      outcome: z.string().nullable(),
      status: z.string(),
      startedAt: z.string(),
    }),
  ),
});
export type CollectDashboard = z.infer<typeof CollectDashboardSchema>;

/** Public mock UPI page (§F2.1 step 4). */
export const PayInfoSchema = z.object({
  /** "paytm_udhaar": the customer is repaying Paytm for a funded udhaar (F4), not the shop. */
  kind: z.enum(["reminder", "paytm_udhaar"]).default("reminder"),
  shopName: z.string(),
  customerName: z.string(),
  amountPaise: z.number(),
  status: z.enum(["queued", "sent", "paid", "ignored", "funded", "repaying", "closed"]),
});
export type PayInfo = z.infer<typeof PayInfoSchema>;

export const PayConfirmBodySchema = z.strictObject({
  /** Pay part of it ("abhi 200 deta hoon"); defaults to the full amount. */
  amountRupees: z.number().positive().optional(),
});

// ---- Simulated AI call (F2.2) ----

export const CALL_INTENTS = [
  "pay_now",
  "promise",
  "partial",
  "dispute",
  "wrong_person",
  "busy",
  "refuse",
  "unclear",
] as const;
export const CallIntentSchema = z.object({
  intent: z.enum(CALL_INTENTS),
  /** "Friday", "kal", "5 tareekh" — resolved to a date in code. */
  promised_date_phrase: z.string().nullable().default(null),
  amount_rupees: z.number().positive().nullable().default(null),
});
export type CallIntent = z.infer<typeof CallIntentSchema>;

export const CallTurnSchema = z.object({
  role: z.enum(["agent", "customer"]),
  text: z.string(),
  at: z.string(),
  audioUrl: z.string().nullable().optional(),
});
export type CallTurn = z.infer<typeof CallTurnSchema>;

export const CallStateSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  customerName: z.string(),
  amountPaise: z.number(),
  status: z.enum(["ringing", "live", "ended"]),
  outcome: z.string().nullable(),
  transcript: z.array(CallTurnSchema),
  /** Set when the call created a promise / scheduled follow-up. */
  promise: z.object({ promisedDate: z.string(), amountPaise: z.number().nullable() }).nullable(),
  followUpAt: z.string().nullable(),
  payUrl: z.string().nullable(),
});
export type CallState = z.infer<typeof CallStateSchema>;

export const CustomerTurnBodySchema = z.strictObject({ text: z.string().trim().min(1).max(300) });
