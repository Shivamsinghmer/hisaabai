"use server";

import { VoiceCommandResponseSchema, type VoiceCommandResponse } from "@hisaab/shared";
import { ApiFailure, apiFetch } from "@/lib/api";

export type VoiceResult = { ok: true; data: VoiceCommandResponse } | { ok: false; error: string };

const FAILED = "Abhi jawab nahi aa paaya, dobara koshish karein (Couldn't reach Hisaab, try again)";

async function send(init: RequestInit): Promise<VoiceResult> {
  try {
    const raw = await apiFetch<unknown>("/voice/command", { method: "POST", ...init });
    return { ok: true, data: VoiceCommandResponseSchema.parse(raw) };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // let redirect() through
    return { ok: false, error: FAILED };
  }
}

/** Mic audio (FormData with "audio" and optional "langHint") → /voice/command. */
export async function sendVoiceAudio(form: FormData): Promise<VoiceResult> {
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return { ok: false, error: FAILED };
  const body = new FormData();
  body.append("audio", audio, "speech");
  const langHint = form.get("langHint");
  if (typeof langHint === "string" && langHint) body.append("langHint", langHint);
  return send({ body });
}

/** Typed fallback when speech isn't understood (§17). */
export async function sendVoiceText(text: string): Promise<VoiceResult> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: FAILED };
  return send({ body: JSON.stringify({ text: trimmed }) });
}
