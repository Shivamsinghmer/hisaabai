// Server-side client for apps/api. Use from Server Components and Server
// Actions only: it mints a short-lived Neon Auth JWT for each call, which the
// browser never sees.
import { ApiErrorSchema, MeResponseSchema, type MeResponse } from "@hisaab/shared";
import { redirect } from "next/navigation";
import { getApiToken } from "@/lib/auth/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await getApiToken();
  if (!data?.token) redirect("/auth/sign-in");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
      authorization: `Bearer ${data.token}`,
    },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (res.status === 401) redirect("/auth/sign-in");
    throw new ApiFailure(
      res.status,
      parsed.success ? parsed.data.error.code : "HTTP_ERROR",
      parsed.success ? parsed.data.error.message : `API ${res.status}`,
    );
  }
  return body as T;
}

/** The signed-in user and their shop (null until onboarding). */
export async function getMe(): Promise<MeResponse> {
  return MeResponseSchema.parse(await apiFetch<unknown>("/me"));
}

/** For pages inside the app: sends users without a shop to onboarding. */
export async function requireShop() {
  const me = await getMe();
  if (!me.merchant || !me.membership) redirect("/onboarding");
  return { ...me, merchant: me.merchant, membership: me.membership };
}
