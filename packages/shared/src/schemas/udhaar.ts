import { z } from "zod";

/** Mock lender terms (F4): the merchant pays the funding fee; the customer owes only the udhaar. */
export const UDHAAR_FEE_PCT = 1.5;
export const UDHAAR_MAX_LIMIT_PAISE = 500_000; // ₹5,000
export const UDHAAR_MIN_HISTORY_DAYS = 90;
export const UDHAAR_MIN_ON_TIME = 0.8;

export const EligibleCustomerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  /** Remaining headroom in paise (limit minus Paytm Udhaar still outstanding). */
  limitPaise: z.number(),
  onTimeRate: z.number(),
  historyDays: z.number(),
  avgTicketPaise: z.number(),
});
export type EligibleCustomer = z.infer<typeof EligibleCustomerSchema>;

export const NotEligibleSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  reasons: z.array(z.string()),
});

export const UdhaarTxnSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  amountPaise: z.number(),
  feePaise: z.number(),
  status: z.enum(["offered", "funded", "repaying", "closed", "defaulted"]),
  repayUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type UdhaarTxn = z.infer<typeof UdhaarTxnSchema>;

export const UdhaarOverviewSchema = z.object({
  eligible: z.array(EligibleCustomerSchema),
  notEligible: z.array(NotEligibleSchema),
  txns: z.array(UdhaarTxnSchema),
  feePct: z.number(),
});
export type UdhaarOverview = z.infer<typeof UdhaarOverviewSchema>;

export const FundUdhaarBodySchema = z.strictObject({
  customerId: z.string().uuid(),
  amountRupees: z.number().positive().max(5000),
  items: z.string().trim().max(120).optional(),
});
