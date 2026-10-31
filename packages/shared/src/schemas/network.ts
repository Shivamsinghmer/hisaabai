import { z } from "zod";

// Paytm customer profile: one customer's udhaar record across every shop on Hisaab AI,
// linked by phone number and shown only with the customer's consent. Code computes the
// score; the LLM only writes the summary for the shopkeeper.

/** "+91 98765 43210", "09876543210", "9876543210" → "+919876543210"; null if not an Indian mobile. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.replace(/^0/, "");
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** "+919000000001" → "+91 •••••• 0001" (never show the full number to another shop). */
export function maskPhone(phone: string): string {
  return `+91 •••••• ${phone.slice(-4)}`;
}

export const NETWORK_BANDS = ["trusted", "good", "watch", "risky"] as const;
export type NetworkBand = (typeof NETWORK_BANDS)[number];

export const SHOP_STANDINGS = ["good", "late", "overdue", "disputed", "new"] as const;
export type ShopStanding = (typeof SHOP_STANDINGS)[number];

/**
 * clean: no overdue shop · disputed: only disputed balances · single: one overdue shop ·
 * selective: one overdue shop while paying ≥ 2 others on time · widespread: ≥ 2 overdue shops.
 */
export const NETWORK_PATTERNS = ["clean", "disputed", "single", "selective", "widespread"] as const;
export type NetworkPattern = (typeof NETWORK_PATTERNS)[number];

export const NetworkShopSchema = z.object({
  /** "Aapki dukaan" for the viewing shop, else "Dukaan 2 · Noida" (other shops stay anonymous). */
  label: z.string(),
  isThisShop: z.boolean(),
  standing: z.enum(SHOP_STANDINGS),
  onTimeRate: z.number().nullable(),
  outstandingPaise: z.number(),
  overdueDays: z.number(),
  historyDays: z.number(),
  /** Score points taken off for this shop's overdue balance. */
  penalty: z.number(),
});
export type NetworkShop = z.infer<typeof NetworkShopSchema>;

export const NetworkFactorSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** 0–1 normalised value. */
  value: z.number(),
  weight: z.number(),
});
export type NetworkFactor = z.infer<typeof NetworkFactorSchema>;

export const NetworkScoreSchema = z.object({
  score: z.number(),
  band: z.enum(NETWORK_BANDS),
  pattern: z.enum(NETWORK_PATTERNS),
  /** Score before overdue penalties: what the customer gets back by settling. */
  baseScore: z.number(),
  penaltyTotal: z.number(),
  factors: z.array(NetworkFactorSchema),
  shops: z.array(NetworkShopSchema),
  outstandingPaise: z.number(),
});
export type NetworkScore = z.infer<typeof NetworkScoreSchema>;

export const NetworkProfileSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("no_phone") }),
  z.object({ status: z.literal("no_consent"), phoneMasked: z.string() }),
  NetworkScoreSchema.extend({
    status: z.literal("ready"),
    phoneMasked: z.string(),
    /** 2–3 Hinglish sentences about the customer (LLM, template fallback). */
    summary: z.string(),
    /** One sentence for the shopkeeper: give udhaar or not, and how much care to take. */
    advice: z.string(),
  }),
]);
export type NetworkProfile = z.infer<typeof NetworkProfileSchema>;
