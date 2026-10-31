import { z } from "zod";

// What the mic can be asked to do (CLAUDE.md §12 intent_router). Every
// utterance is classified first, then routed to that feature's handler.
export const INTENTS = [
  "capture",
  "payment",
  "collect",
  "credit",
  "ask",
  "stock",
  "settings",
  "other",
] as const;
export const IntentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof IntentSchema>;

export const IntentResultSchema = z.object({
  intent: IntentSchema,
  confidence: z.number().min(0).max(1),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

/**
 * A follow-up answer re-sent as text: `confirm` lets the merchant approve what
 * the first try stopped at (creating a new customer, a likely duplicate).
 */
export const VoiceConfirmSchema = z.enum(["new_customer", "duplicate"]);
export type VoiceConfirm = z.infer<typeof VoiceConfirmSchema>;

/** POST /voice/command with JSON instead of audio (typed fallback, §17, and follow-up answers). */
export const VoiceTextBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(500),
  langHint: z.string().max(10).optional(),
  confirm: VoiceConfirmSchema.optional(),
});
export type VoiceTextBody = z.infer<typeof VoiceTextBodySchema>;

/** One tappable answer to a follow-up question. */
export const FollowUpOptionSchema = z.object({
  label: z.string(),
  /** Re-send this text (with `confirm` if set) to /voice/command… */
  text: z.string().optional(),
  confirm: VoiceConfirmSchema.optional(),
  /** …or soft-delete this ledger entry. */
  deleteEntryId: z.string().optional(),
});
export type FollowUpOption = z.infer<typeof FollowUpOptionSchema>;

export const LedgerEntrySummarySchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  type: z.enum(["credit", "payment"]),
  amountPaise: z.number(),
  /** Customer balance after this entry (negative = advance). */
  balancePaise: z.number(),
});
export type LedgerEntrySummary = z.infer<typeof LedgerEntrySummarySchema>;

export const VoiceCommandResponseSchema = z.object({
  /** False when nothing usable was heard: show "Samajh nahi aaya" + the text input. */
  understood: z.boolean(),
  transcript: z.string(),
  languageCode: z.string().nullable(),
  intent: IntentSchema.nullable(),
  confidence: z.number().nullable(),
  replyText: z.string(),
  /** Path on the API host, e.g. /media/tts/<hash>.mp3; null if speech synthesis failed. */
  replyAudioUrl: z.string().nullable(),
  /** The entry this command saved (show an Undo for 10 s). */
  entry: LedgerEntrySummarySchema.nullable().default(null),
  /** One short question when something was missing or ambiguous (§17). */
  followUp: z
    .object({ question: z.string(), options: z.array(FollowUpOptionSchema) })
    .nullable()
    .default(null),
});
export type VoiceCommandResponse = z.infer<typeof VoiceCommandResponseSchema>;

/** What the extraction prompt returns (CLAUDE.md §12 extraction contract). */
export const ExtractedEntrySchema = z.object({
  kind: z.enum(["credit", "payment", "delete_last", "unknown"]),
  customer_name: z.string().nullable(),
  is_new_customer: z.boolean().default(false),
  amount_rupees: z.number().positive().nullable(),
  items: z.string().nullable().default(null),
  due_phrase: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
});
export type ExtractedEntry = z.infer<typeof ExtractedEntrySchema>;

/** POST /voice/tts */
export const TtsBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  lang: z.string().max(10).optional(),
  voice: z.string().max(60).optional(),
});
export const TtsResponseSchema = z.object({ audioUrl: z.string() });
