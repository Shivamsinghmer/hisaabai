"use server";

import { VoiceCommandResponseSchema, type VoiceCommandResponse, type VoiceConfirm } from "@hisaab/shared";
import { revalidatePath } from "next/cache";
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
  const result = await send({ body });
  if (result.ok && result.data.entry) revalidatePath("/", "layout");
  return result;
}

/** Typed fallback (§17) and follow-up answers ("Haan, banao" → confirm). */
export async function sendVoiceText(text: string, confirm?: VoiceConfirm): Promise<VoiceResult> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: FAILED };
  const result = await send({
    body: JSON.stringify(confirm ? { text: trimmed, confirm } : { text: trimmed }),
  });
  if (result.ok && result.data.entry) revalidatePath("/", "layout");
  return result;
}

/** Undo a voice entry, or confirm "last entry hata do". */
export async function deleteEntry(id: string): Promise<{ ok: boolean; balancePaise: number | null }> {
  try {
    const res = await apiFetch<{ balancePaise: number | null }>(`/ledger/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    revalidatePath("/", "layout");
    return { ok: true, balancePaise: res.balancePaise };
  } catch (err) {
    if (err instanceof Error && "digest" in err) throw err;
    return { ok: false, balancePaise: null };
  }
}
