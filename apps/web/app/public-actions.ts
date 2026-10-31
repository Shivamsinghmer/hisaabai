"use server";

// Customer-facing actions (no login): the mock UPI page and the call-sim tab.
import { CallStateSchema, PayInfoSchema, type CallState, type PayInfo } from "@hisaab/shared";
import { ApiFailure, publicApiFetch } from "@/lib/api";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiFailure) return { ok: false, error: err.message };
    return { ok: false, error: "Network problem, try again" };
  }
}

const tokenPath = (token: string) => `/pay/${encodeURIComponent(token)}`;
const callPath = (id: string) => `/call-sim/${encodeURIComponent(id)}`;

export async function getPayInfo(token: string): Promise<Result<PayInfo>> {
  return attempt(async () => PayInfoSchema.parse(await publicApiFetch(tokenPath(token))));
}

export async function payNow(
  token: string,
  amountRupees?: number,
): Promise<Result<{ status: string; paidPaise: number; balancePaise: number }>> {
  return attempt(() =>
    publicApiFetch(`${tokenPath(token)}/confirm`, {
      method: "POST",
      body: JSON.stringify(amountRupees ? { amountRupees } : {}),
    }),
  );
}

export async function getPublicCall(id: string): Promise<Result<CallState>> {
  return attempt(async () => CallStateSchema.parse(await publicApiFetch(callPath(id))));
}

export async function answerCall(id: string): Promise<Result<CallState>> {
  return attempt(async () =>
    CallStateSchema.parse(await publicApiFetch(`${callPath(id)}/answer`, { method: "POST" })),
  );
}

type TurnResult = Result<{ understood: boolean; call: CallState }>;

async function turn(id: string, body: BodyInit): Promise<TurnResult> {
  return attempt(async () => {
    const res = await publicApiFetch<{ understood: boolean; call: unknown }>(`${callPath(id)}/turn`, {
      method: "POST",
      body,
    });
    return { understood: res.understood, call: CallStateSchema.parse(res.call) };
  });
}

export async function sendCustomerAudio(id: string, form: FormData): Promise<TurnResult> {
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return { ok: false, error: "No audio" };
  const body = new FormData();
  body.append("audio", audio, "speech");
  return turn(id, body);
}

export async function sendCustomerText(id: string, text: string): Promise<TurnResult> {
  return turn(id, JSON.stringify({ text: text.trim().slice(0, 300) }));
}
