// F2.2 AI voice call, simulated between two browser tabs (merchant + customer).
// The LLM only classifies the customer's reply (call_agent.md); every agent line
// is a fixed, polite template here, so the agent can't threaten or overshare (§16).
import {
  addDays,
  CallIntentSchema,
  formatPaise,
  resolveDate,
  todayIst,
  type CallIntent,
  type CallState,
  type Merchant,
} from "@hisaab/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import { balanceOf } from "../db/repos/ledger.js";
import {
  calls,
  customers,
  disputes,
  merchants,
  notifications,
  promises,
  reminders,
  type CallMeta,
  type CallTurn,
} from "../db/schema.js";
import { AppError } from "../lib/errors.js";
import { renderPrompt } from "../prompts/loader.js";
import { mockCallIntent } from "../services/mock.js";
import type { AiServices } from "../services/types.js";
import { createReminder } from "./reminders.js";

const MAX_AGENT_TURNS = 3;
type CallRow = typeof calls.$inferSelect;
type Outcome = NonNullable<CallRow["outcome"]>;

const nowIso = () => new Date().toISOString();
const showDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

async function agentTurn(
  ai: AiServices,
  text: string,
  lang: string,
  log: Pick<FastifyBaseLogger, "warn">,
): Promise<CallTurn> {
  let audioUrl: string | null = null;
  try {
    audioUrl = (await ai.speech.tts(text, { lang })).audioUrl;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "call tts failed");
  }
  return { role: "agent", text, at: nowIso(), audioUrl };
}

async function loadCall(db: Db, callId: string, merchantId?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(callId)) return null;
  const [row] = await db
    .select({
      call: calls,
      customerName: customers.name,
      shopName: merchants.shopName,
      language: merchants.language,
    })
    .from(calls)
    .innerJoin(customers, eq(customers.id, calls.customerId))
    .innerJoin(merchants, eq(merchants.id, calls.merchantId))
    .where(merchantId ? and(eq(calls.id, callId), eq(calls.merchantId, merchantId)) : eq(calls.id, callId));
  return row ?? null;
}

function toState(row: NonNullable<Awaited<ReturnType<typeof loadCall>>>): CallState {
  const meta = (row.call.meta ?? {}) as CallMeta;
  return {
    id: row.call.id,
    shopName: row.shopName,
    customerName: row.customerName,
    amountPaise: meta.amountPaise ?? 0,
    status: row.call.status ?? "ringing",
    outcome: row.call.outcome ?? null,
    transcript: (row.call.transcript ?? []) as CallTurn[],
    promise: meta.promise ?? null,
    followUpAt: meta.followUpAt ?? null,
    payUrl: meta.payUrl ?? null,
  };
}

export async function getCall(db: Db, callId: string, merchantId?: string) {
  const row = await loadCall(db, callId, merchantId);
  return row ? toState(row) : null;
}

export async function startCall(
  db: Db,
  ai: AiServices,
  merchant: Merchant,
  customerId: string,
  log: Pick<FastifyBaseLogger, "warn">,
): Promise<CallState> {
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.merchantId, merchant.id)));
  if (!customer) throw new AppError(404, "NOT_FOUND", "Customer nahi mila (Not found)");
  const amountPaise = await balanceOf(db, customerId);
  if (amountPaise <= 0)
    throw new AppError(409, "NOTHING_DUE", `${customer.name} ka koi udhaar baaki nahi hai.`);

  const greet = await agentTurn(
    ai,
    `Namaste ${customer.name}, main ${merchant.shopName} ki taraf se bol raha hoon. Aapka ${formatPaise(amountPaise)} baaki hai. Aap kab tak de payenge?`,
    merchant.language,
    log,
  );
  const [row] = await db
    .insert(calls)
    .values({
      merchantId: merchant.id,
      customerId,
      status: "ringing",
      transcript: [greet],
      meta: { amountPaise },
    })
    .returning({ id: calls.id });
  return (await getCall(db, row!.id))!;
}

export async function answerCall(db: Db, callId: string) {
  await db
    .update(calls)
    .set({ status: "live" })
    .where(and(eq(calls.id, callId), eq(calls.status, "ringing")));
  return getCall(db, callId);
}

export async function endCall(db: Db, callId: string, merchantId: string) {
  const row = await loadCall(db, callId, merchantId);
  if (!row) return null;
  if (row.call.status !== "ended") {
    await db
      .update(calls)
      .set({ status: "ended", outcome: row.call.outcome ?? "no_answer", endedAt: new Date() })
      .where(eq(calls.id, callId));
  }
  return getCall(db, callId);
}

async function classify(
  ai: AiServices,
  text: string,
  shopName: string,
  amountPaise: number,
  log: Pick<FastifyBaseLogger, "warn">,
): Promise<CallIntent> {
  try {
    const prompt = renderPrompt("call_agent", { shop_name: shopName, amount: formatPaise(amountPaise) });
    return await ai.llm.chatJson({
      op: "call_agent",
      system: prompt.text,
      user: text,
      schema: CallIntentSchema,
    });
  } catch (err) {
    log.warn({ err: (err as Error).message }, "call classification fell back to rules");
    return mockCallIntent(text);
  }
}

/** The customer's reply → classify → act (promise / link / dispute) → agent's next line. */
export async function customerTurn(
  db: Db,
  ai: AiServices,
  callId: string,
  text: string,
  payLinkBase: string,
  log: Pick<FastifyBaseLogger, "warn" | "info">,
): Promise<CallState> {
  const row = await loadCall(db, callId);
  if (!row) throw new AppError(404, "NOT_FOUND", "Call nahi mili");
  if (row.call.status === "ended") return toState(row);

  const merchant = { id: row.call.merchantId, shopName: row.shopName } as Merchant;
  const meta: CallMeta = { ...((row.call.meta ?? {}) as CallMeta) };
  const amountPaise = meta.amountPaise ?? (await balanceOf(db, row.call.customerId));
  const transcript = [
    ...((row.call.transcript ?? []) as CallTurn[]),
    { role: "customer" as const, text, at: nowIso() },
  ];
  const name = row.customerName;

  const intent = await classify(ai, text, row.shopName, amountPaise, log);
  log.info({ callId, intent: intent.intent }, "call turn");

  let reply: string;
  let outcome: Outcome | null = row.call.outcome ?? null;
  let end = false;

  const promise = async (phrase: string | null, promisePaise: number) => {
    const date = phrase ? resolveDate(phrase, { direction: "future" }) : null;
    if (!date || date < todayIst()) return null; // §17: date in the past → ask again
    await db.insert(promises).values({
      merchantId: merchant.id,
      customerId: row.call.customerId,
      amountPaise: promisePaise,
      promisedDate: date,
      source: "call_sim",
      status: "open",
    });
    // The follow-up for the day after the promise (BullMQ is cut for the demo: stored as a queued reminder).
    const followUpAt = `${addDays(date, 1)}T04:30:00.000Z`; // 10:00 IST
    await db.insert(reminders).values({
      merchantId: merchant.id,
      customerId: row.call.customerId,
      channel: "in_app",
      tone: "gentle",
      message: `Follow-up: ${name} ne ${showDate(date)} tak ${formatPaise(promisePaise)} dene ka vaada kiya tha.`,
      amountPaise: promisePaise,
      status: "queued",
      approvedByMerchant: true,
      sentAt: new Date(followUpAt),
    });
    meta.promise = { promisedDate: date, amountPaise: promisePaise };
    meta.followUpAt = followUpAt;
    return date;
  };

  switch (intent.intent) {
    case "promise": {
      // After a partial payment, the promise covers only what's left.
      const rest = amountPaise - (meta.partialPaise ?? 0);
      const date = await promise(intent.promised_date_phrase, rest);
      if (date) {
        reply = `Theek hai, ${showDate(date)} ko yaad dila denge. Dhanyavaad!`;
        outcome = meta.partialPaise ? "partial" : "promise";
        end = true;
      } else {
        reply = "Kaunsi tareekh tak de payenge?";
      }
      break;
    }
    case "pay_now": {
      const r = await createReminder(
        db,
        { ...merchant, defaultDueDays: 15 } as Merchant,
        row.call.customerId,
        payLinkBase,
        { channel: "call_sim" },
      );
      meta.payUrl = r.payUrl;
      reply = `Dhanyavaad! ${formatPaise(amountPaise)} ka payment link aapko bhej diya hai.`;
      outcome = "paid";
      end = true;
      break;
    }
    case "partial": {
      const nowPaise = Math.min(Math.round((intent.amount_rupees ?? 0) * 100), amountPaise);
      if (nowPaise <= 0) {
        reply = `Abhi kitne rupaye de payenge?`;
        break;
      }
      const r = await createReminder(db, merchant, row.call.customerId, payLinkBase, {
        channel: "call_sim",
        amountPaise: nowPaise,
      });
      meta.payUrl = r.payUrl;
      meta.partialPaise = nowPaise;
      const rest = amountPaise - nowPaise;
      const date = rest > 0 ? await promise(intent.promised_date_phrase, rest) : null;
      outcome = "partial";
      if (rest <= 0 || date) {
        reply = date
          ? `Theek hai, ${formatPaise(nowPaise)} ka link bhej diya. Baaki ${formatPaise(rest)} ${showDate(date)} ko. Dhanyavaad!`
          : `Theek hai, ${formatPaise(nowPaise)} ka link bhej diya. Dhanyavaad!`;
        end = true;
      } else {
        reply = `Theek hai, ${formatPaise(nowPaise)} ka link bhej diya. Baaki ${formatPaise(rest)} kab tak denge?`;
      }
      break;
    }
    case "dispute":
      await db
        .insert(disputes)
        .values({ merchantId: merchant.id, customerId: row.call.customerId, note: text.slice(0, 300) });
      await db.insert(notifications).values({
        merchantId: merchant.id,
        kind: "dispute",
        title: `${name} ne kaha: payment pehle ho chuka hai`,
        body: "Call (AI) ke dauraan. Reminders roke gaye.",
      });
      reply = "Maaf kijiye. Hum dukaan ko bata dete hain, woh aapse khud baat karenge. Dhanyavaad.";
      outcome = "dispute";
      end = true;
      break;
    case "busy":
    case "wrong_person":
      reply = "Koi baat nahi, hum baad mein call karenge. Dhanyavaad.";
      outcome = "no_answer";
      end = true;
      break;
    case "refuse":
      reply = "Theek hai, hum dukaan ko bata denge. Dhanyavaad.";
      outcome = "refused";
      end = true;
      break;
    default:
      reply = `Maaf kijiye, samajh nahi aaya. Aap ${formatPaise(amountPaise)} kab tak de payenge?`;
  }

  const agentTurns = transcript.filter((t) => t.role === "agent").length;
  // The reply below is the next agent turn.
  if (!end && agentTurns + 1 >= MAX_AGENT_TURNS) {
    reply = "Dhanyavaad, hum baad mein baat karenge.";
    outcome = outcome ?? "no_answer";
    end = true;
  }
  transcript.push(await agentTurn(ai, reply, row.language, log));

  await db
    .update(calls)
    .set({
      transcript,
      meta,
      status: end ? "ended" : "live",
      outcome,
      endedAt: end ? new Date() : null,
    })
    .where(eq(calls.id, callId));
  return (await getCall(db, callId))!;
}

export async function recentCalls(db: Db, merchantId: string) {
  const rows = await db
    .select({
      id: calls.id,
      customerName: customers.name,
      outcome: calls.outcome,
      status: calls.status,
      startedAt: calls.startedAt,
    })
    .from(calls)
    .innerJoin(customers, eq(customers.id, calls.customerId))
    .where(eq(calls.merchantId, merchantId))
    .orderBy(desc(calls.startedAt))
    .limit(5);
  return rows.map((r) => ({
    ...r,
    status: r.status ?? "ringing",
    startedAt: (r.startedAt ?? new Date()).toISOString(),
  }));
}
