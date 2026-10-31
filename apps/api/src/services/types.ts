import type { z } from "zod";

export type SttResult = { transcript: string; languageCode: string | null };

export interface SpeechService {
  /** Audio (webm/ogg/mp4/wav, ≤ 30 s) → transcript. Empty transcript = nothing heard. */
  stt(audio: Buffer, opts: { mimeType: string; langHint?: string; keyterms?: string[] }): Promise<SttResult>;
  /** Text → path of a cached audio file on the API host (e.g. /media/tts/<hash>.mp3). */
  tts(text: string, opts: { lang: string; voice?: string }): Promise<{ audioUrl: string }>;
}

export interface LlmService {
  /** One JSON-mode completion validated against `schema` (one repair attempt). */
  chatJson<T>(opts: { op: string; system: string; user: string; schema: z.ZodType<T> }): Promise<T>;
}

export type AiServices = { speech: SpeechService; llm: LlmService; mock: boolean };
