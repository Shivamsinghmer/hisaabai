import { z } from "zod";

// Languages offered at onboarding (F0). Codes follow Sarvam's BCP-47 codes;
// "hi-Latn" is Hinglish (Hindi in Latin script).
export const LANGUAGES = [
  { code: "hi-IN", label: "हिन्दी", english: "Hindi" },
  { code: "hi-Latn", label: "Hinglish", english: "Hinglish" },
  { code: "en-IN", label: "English", english: "English" },
  { code: "bn-IN", label: "বাংলা", english: "Bengali" },
  { code: "ta-IN", label: "தமிழ்", english: "Tamil" },
  { code: "te-IN", label: "తెలుగు", english: "Telugu" },
  { code: "mr-IN", label: "मराठी", english: "Marathi" },
  { code: "gu-IN", label: "ગુજરાતી", english: "Gujarati" },
  { code: "kn-IN", label: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml-IN", label: "മലയാളം", english: "Malayalam" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ", english: "Punjabi" },
  { code: "od-IN", label: "ଓଡ଼ିଆ", english: "Odia" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const LanguageCodeSchema = z.enum(LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]]);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const name = z.string().trim().min(1).max(80);

export const QuietHoursSchema = z.object({ start: hhmm, end: hhmm });

/** POST /merchants — onboarding (F0). The signed-in user becomes the owner. */
export const CreateMerchantBodySchema = z.strictObject({
  shopName: name,
  ownerName: name,
  language: LanguageCodeSchema.default("hi-IN"),
  city: z.string().trim().max(60).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,13}$/, "10-digit mobile number")
    .optional(),
  // The plain-language consent screen must be accepted to finish onboarding.
  acceptedConsent: z.literal(true),
});
export type CreateMerchantBody = z.infer<typeof CreateMerchantBodySchema>;

/** PATCH /me/settings (owner only, F11). */
export const MerchantSettingsPatchSchema = z
  .strictObject({
    shopName: name,
    ownerName: name,
    city: z.string().trim().max(60).nullable(),
    language: LanguageCodeSchema,
    defaultDueDays: z.number().int().min(1).max(90),
    autoGentleReminders: z.boolean(),
    quietHours: QuietHoursSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update");
export type MerchantSettingsPatch = z.infer<typeof MerchantSettingsPatchSchema>;

export const MerchantSchema = z.object({
  id: z.string().uuid(),
  shopName: z.string(),
  ownerName: z.string(),
  phone: z.string().nullable(),
  language: z.string(),
  city: z.string().nullable(),
  paytmLinked: z.boolean(),
  defaultDueDays: z.number(),
  autoGentleReminders: z.boolean(),
  quietHours: QuietHoursSchema,
  createdAt: z.string(),
});
export type Merchant = z.infer<typeof MerchantSchema>;

export const RoleSchema = z.enum(["owner", "helper"]);
export type Role = z.infer<typeof RoleSchema>;

/** GET /me — merchant is null until onboarding is finished. */
export const MeResponseSchema = z.object({
  user: z.object({ authUserId: z.string(), email: z.string().nullable() }),
  membership: z.object({ userId: z.string(), role: RoleSchema }).nullable(),
  merchant: MerchantSchema.nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
