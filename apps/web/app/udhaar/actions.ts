"use server";

import { UdhaarTxnSchema, type UdhaarTxn } from "@hisaab/shared";
import { revalidatePath } from "next/cache";
import { ApiFailure, apiFetch } from "@/lib/api";

export type FundResult = { ok: true; txn: UdhaarTxn } | { ok: false; error: string };

export async function fundUdhaar(customerId: string, amountRupees: number): Promise<FundResult> {
  try {
    const res = await apiFetch<{ txn: unknown }>("/udhaar-service", {
      method: "POST",
      body: JSON.stringify({ customerId, amountRupees }),
    });
    revalidatePath("/udhaar");
    return { ok: true, txn: UdhaarTxnSchema.parse(res.txn) };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // redirect()
    return { ok: false, error: "Kuch gadbad ho gayi, dobara koshish karein" };
  }
}
