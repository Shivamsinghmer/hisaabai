"use server";

import { CreateMerchantBodySchema, type CreateMerchantBody } from "@hisaab/shared";
import { redirect } from "next/navigation";
import { ApiFailure, apiFetch } from "@/lib/api";

export type CreateShopResult = { error: string } | undefined;

export async function createShop(input: CreateMerchantBody): Promise<CreateShopResult> {
  const parsed = CreateMerchantBodySchema.safeParse(input);
  if (!parsed.success) return { error: "Kuch jaankari adhoori hai (Please fill all fields)" };

  try {
    await apiFetch("/merchants", { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (err) {
    // Already set up (e.g. double tap): just go home.
    if (err instanceof ApiFailure && err.code === "ALREADY_ONBOARDED") redirect("/");
    if (err instanceof ApiFailure) return { error: err.message };
    throw err;
  }
  redirect("/");
}
