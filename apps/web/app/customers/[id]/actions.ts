"use server";

import { revalidatePath } from "next/cache";
import { ApiFailure, apiFetch } from "@/lib/api";

export type ConsentResult = { ok: true } | { ok: false; error: string };

export async function requestNetworkConsent(customerId: string): Promise<ConsentResult> {
  try {
    await apiFetch(`/customers/${encodeURIComponent(customerId)}/network-consent`, { method: "POST" });
    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // redirect()
    return { ok: false, error: "Kuch gadbad ho gayi, dobara koshish karein" };
  }
}
