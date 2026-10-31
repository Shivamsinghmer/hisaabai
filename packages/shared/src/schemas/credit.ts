import { z } from "zod";

// ---- Credit score (F3.1, §14) ----

/** One §14 factor: value = raw measure, points = normalised contribution 0–1. */
export const ScoreFactorSchema = z.object({
  key: z.string(),
  value: z.number(),
  weight: z.number(),
  points: z.number().min(0).max(1),
  direction: z.enum(["up", "down"]),
});
export type ScoreFactor = z.infer<typeof ScoreFactorSchema>;

/** GET /credit/score — computed on demand and persisted in credit_scores. */
export const CreditScoreSchema = z.object({
  score: z.number().int().min(300).max(900),
  /** vs the previous stored score; null on the first ever computation. */
  change: z.number().int().nullable(),
  factors: z.array(ScoreFactorSchema),
  tips: z.array(z.string()).max(5),
  computedAt: z.string(),
});
export type CreditScore = z.infer<typeof CreditScoreSchema>;

// ---- Consent (F11 / §16: lending data shared only with explicit consent) ----

export const ConsentPurposeSchema = z.enum(["lending", "insurance", "analytics", "data_storage"]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const ConsentSchema = z.object({
  id: z.string(),
  purpose: ConsentPurposeSchema,
  granted: z.boolean(),
  grantedAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type Consent = z.infer<typeof ConsentSchema>;

/** POST /consents (revoke: DELETE /consents/:id). */
export const ConsentBodySchema = z.strictObject({ purpose: ConsentPurposeSchema });

// ---- Loan offer (F3.2/F3.3, mock lender rules from §14) ----

export const LoanOfferSchema = z.object({
  id: z.string(),
  amountPaise: z.number(),
  tenureMonths: z.number().int(),
  annualRatePct: z.number(),
  emiPaise: z.number(),
  teachBackAttempts: z.number().int(),
  teachBackPassed: z.boolean(),
  status: z.enum(["offered", "accepted", "disbursed", "declined", "expired"]),
  createdAt: z.string(),
});
export type LoanOffer = z.infer<typeof LoanOfferSchema>;

/** What teach-back emits; code compares against the real EMI (±10%) and tenure. */
export const TeachBackAnswerSchema = z.object({
  emi_rupees: z.number().positive().nullable().default(null),
  tenure_months: z.number().int().positive().nullable().default(null),
});
export type TeachBackAnswer = z.infer<typeof TeachBackAnswerSchema>;

/** POST /credit/offers — 403 without a live lending consent, 409 below score 600. */
export const CreateOfferResponseSchema = z.object({
  offer: LoanOfferSchema.nullable(),
  score: z.number(),
  consentUrl: z.string().nullable(),
});

/** POST /credit/offers/:id/teach-back (typed answer; mic path sends the same transcript). */
export const TeachBackBodySchema = z.strictObject({ text: z.string().trim().min(1).max(300) });
export type TeachBackBody = z.infer<typeof TeachBackBodySchema>;

/** POST /credit/offers/:id/teach-back */
export const TeachBackResultSchema = z.object({
  passed: z.boolean(),
  attempts: z.number().int(),
  replyText: z.string(),
  offer: LoanOfferSchema,
});
export type TeachBackResult = z.infer<typeof TeachBackResultSchema>;
