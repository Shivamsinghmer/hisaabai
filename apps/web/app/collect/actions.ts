"use server";

import { CallStateSchema, ReminderSchema, type CallState, type Reminder } from "@hisaab/shared";
import { revalidatePath } from "next/cache";
import { ApiFailure, apiFetch } from "@/lib/api";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // redirect()
    return { ok: false, error: "Kuch gadbad ho gayi, dobara koshish karein" };
  }
}

export async function remindCustomer(customerId: string): Promise<Result<Reminder>> {
  return attempt(async () => {
    const res = await apiFetch<{ reminder: unknown }>("/collect/remind", {
      method: "POST",
      body: JSON.stringify({ customerId }),
    });
    revalidatePath("/collect");
    return ReminderSchema.parse(res.reminder);
  });
}

export async function startAiCall(customerId: string): Promise<Result<{ callId: string }>> {
  return attempt(async () => {
    const res = await apiFetch<{ call: { id: string } }>("/calls", {
      method: "POST",
      body: JSON.stringify({ customerId }),
    });
    return { callId: res.call.id };
  });
}

export async function getCallForMerchant(callId: string): Promise<Result<CallState>> {
  return attempt(async () => CallStateSchema.parse(await apiFetch(`/calls/${encodeURIComponent(callId)}`)));
}

export async function endAiCall(callId: string): Promise<Result<CallState>> {
  return attempt(async () => {
    const res = await apiFetch(`/calls/${encodeURIComponent(callId)}/end`, { method: "POST" });
    revalidatePath("/collect");
    return CallStateSchema.parse(res);
  });
}
