"use server";

import {
  CreditScoreSchema,
  LoanOfferSchema,
  TeachBackResultSchema,
  type TeachBackResult,
} from "@hisaab/shared";
import { revalidatePath } from "next/cache";
import { ApiFailure, apiFetch } from "@/lib/api";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; code: string; error: string };
export type Result<T> = Ok<T> | Err;

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, code: err.code, error: err.message };
    if (err instanceof Error && "digest" in err) throw err; // redirect()
    return { ok: false, code: "UNKNOWN", error: "Kuch gadbad ho gayi, dobara koshish karein" };
  }
}

/** §11 POST /consents — only lending is used in the MVP. */
export async function grantLendingConsent(): Promise<Result<{ granted: boolean }>> {
  return attempt(async () => {
    await apiFetch("/consents", { method: "POST", body: JSON.stringify({ purpose: "lending" }) });
    return { granted: true };
  });
}

/** POST /credit/offers — may fail with CONSENT_REQUIRED; the UI offers the consent step. */
export async function createOffer(): Promise<
  Result<{ offer: { id: string; amountPaise: number; tenureMonths: number; annualRatePct: number; emiPaise: number } } | { needsConsent: true }>
> {
  return attempt(async () => {
    const res = await apiFetch<{ offer: unknown }>("/credit/offers", { method: "POST" });
    const parsed = LoanOfferSchema.parse(res.offer);
    return {
      offer: {
        id: parsed.id,
        amountPaise: parsed.amountPaise,
        tenureMonths: parsed.tenureMonths,
        annualRatePct: parsed.annualRatePct,
        emiPaise: parsed.emiPaise,
      },
    };
  }).then((res) => {
    if (res.ok) return res;
    if (res.code === "CONSENT_REQUIRED") return { ok: true as const, data: { needsConsent: true } as const };
    return res as Err;
  });
}

export async function submitTeachBack(offerId: string, text: string): Promise<Result<TeachBackResult>> {
  return attempt(async () => {
    const res = await apiFetch(`/credit/offers/${encodeURIComponent(offerId)}/teach-back`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    return TeachBackResultSchema.parse(res);
  });
}

export async function acceptOffer(offerId: string): Promise<Result<{ status: string }>> {
  return attempt(async () => {
    const res = await apiFetch(`/credit/offers/${encodeURIComponent(offerId)}/accept`, { method: "POST" });
    revalidatePath("/credit");
    return { status: LoanOfferSchema.parse(res).status };
  });
}

export async function getCurrentScore(): Promise<Result<{ score: number }>> {
  return attempt(async () => {
    const res = CreditScoreSchema.parse(await apiFetch("/credit/score"));
    return { score: res.score };
  });
}
