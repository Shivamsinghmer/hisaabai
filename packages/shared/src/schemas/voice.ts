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

/** POST /voice/command with JSON instead of audio (typed fallback, §17). */
export const VoiceTextBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(500),
  langHint: z.string().max(10).optional(),
});

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
});
export type VoiceCommandResponse = z.infer<typeof VoiceCommandResponseSchema>;

/** POST /voice/tts */
export const TtsBodySchema = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  lang: z.string().max(10).optional(),
  voice: z.string().max(60).optional(),
});
export const TtsResponseSchema = z.object({ audioUrl: z.string() });
