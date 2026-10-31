import { z } from "zod";

/** Collection status shown on the customer list — always words + colour (§6). */
export const DueStatusSchema = z.enum(["overdue", "due", "clear", "advance"]);
export type DueStatus = z.infer<typeof DueStatusSchema>;

export const CustomerRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  balancePaise: z.number(),
  earliestDue: z.string().nullable(),
  status: DueStatusSchema,
  payPrediction: z.enum(["will_pay", "might_delay", "risky"]).nullable(),
});
export type CustomerRow = z.infer<typeof CustomerRowSchema>;

export const LedgerRowSchema = z.object({
  id: z.string(),
  type: z.enum(["credit", "payment", "sale", "purchase", "expense"]),
  amountPaise: z.number(),
  items: z.string().nullable(),
  source: z.string(),
  entryDate: z.string(),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
});
export type LedgerRow = z.infer<typeof LedgerRowSchema>;

export const PromiseRowSchema = z.object({
  id: z.string(),
  amountPaise: z.number().nullable(),
  promisedDate: z.string(),
  status: z.enum(["open", "kept", "broken"]),
});

export const CustomerDetailSchema = z.object({
  customer: CustomerRowSchema.extend({ aliases: z.array(z.string()) }),
  entries: z.array(LedgerRowSchema),
  promises: z.array(PromiseRowSchema),
});
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

/** GET /summary/today — the Home cards. */
export const TodaySummarySchema = z.object({
  date: z.string(),
  salesPaise: z.number(),
  collectedPaise: z.number(),
  udhaarDuePaise: z.number(),
  overdueCustomers: z.number(),
});
export type TodaySummary = z.infer<typeof TodaySummarySchema>;
