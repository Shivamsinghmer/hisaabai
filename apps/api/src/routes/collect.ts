import { CustomerTurnBodySchema, PayConfirmBodySchema, type CollectDashboard } from "@hisaab/shared";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { answerCall, customerTurn, endCall, getCall, recentCalls, startCall } from "../collect/callAgent.js";
import { confirmPayment, createReminder, getPayInfo } from "../collect/reminders.js";
import type { Db } from "../db/client.js";
import { listCustomers } from "../db/repos/ledger.js";
import { getMerchant } from "../db/repos/merchants.js";
import { promises, reminders } from "../db/schema.js";
import { AppError, parseBody } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";
import type { AiServices } from "../services/types.js";
import { confirmUdhaarRepayment, getUdhaarPayInfo } from "../udhaar/service.js";

const CustomerIdBody = z.strictObject({ customerId: z.string().uuid() });
const notFound = () => new AppError(404, "NOT_FOUND", "Nahi mila (Not found)");

export function collectRoutes(
  app: FastifyInstance,
  deps: { db: Db; ai: AiServices; guards: AuthGuards; payLinkBase: string; webOrigin: string },
) {
  const { db, ai, guards, payLinkBase, webOrigin } = deps;
  const merchantOf = async (req: FastifyRequest) => (await getMerchant(db, req.membership!.merchantId))!;

  // Collections dashboard (§6 /collect): who owes, overdue first.
  app.get(
    "/collect/dashboard",
    { preHandler: guards.requireMerchant },
    async (req): Promise<CollectDashboard> => {
      const merchantId = req.membership!.merchantId;
      const all = await listCustomers(db, merchantId);
      const owing = all.filter((c) => c.balancePaise > 0);
      const promiseRows = await db
        .select({
          customerId: promises.customerId,
          open: sql<string | null>`min(${promises.promisedDate}) filter (where ${promises.status} = 'open')`,
          broken: sql<string>`count(*) filter (where ${promises.status} = 'broken')`,
        })
        .from(promises)
        .where(eq(promises.merchantId, merchantId))
        .groupBy(promises.customerId);
      const byCustomer = new Map(promiseRows.map((p) => [p.customerId, p]));
      const remindedRows = await db
        .select({ customerId: reminders.customerId, n: count() })
        .from(reminders)
        .where(
          and(
            eq(reminders.merchantId, merchantId),
            eq(reminders.channel, "in_app"),
            sql`(${reminders.sentAt} at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date`,
          ),
        )
        .groupBy(reminders.customerId);
      const reminded = new Set(remindedRows.map((r) => r.customerId));

      const rank = { overdue: 0, due: 1, clear: 2, advance: 3 } as const;
      const dues = owing
        .map((c) => ({
          ...c,
          openPromiseDate: byCustomer.get(c.id)?.open ?? null,
          brokenPromises: Number(byCustomer.get(c.id)?.broken ?? 0),
          remindedToday: reminded.has(c.id),
        }))
        .sort((a, b) => rank[a.status] - rank[b.status] || b.balancePaise - a.balancePaise);
      return {
        dues,
        totals: {
          duePaise: owing.reduce((s, c) => s + c.balancePaise, 0),
          overdueCount: owing.filter((c) => c.status === "overdue").length,
          brokenPromises: dues.reduce((s, c) => s + c.brokenPromises, 0),
        },
        recentCalls: await recentCalls(db, merchantId),
      };
    },
  );

  // "Remind now" (F2.1): the merchant's tap is the approval.
  app.post("/collect/remind", { preHandler: guards.requireMerchant }, async (req) => {
    const { customerId } = parseBody(CustomerIdBody, req.body);
    return { reminder: await createReminder(db, await merchantOf(req), customerId, payLinkBase) };
  });

  // ---- Mock Paytm UPI page (public: the customer has no login) ----
  app.get<{ Params: { token: string } }>("/pay/:token", async (req) => {
    // A reminder link, or a Paytm Udhaar repayment link (F4): same public page.
    const info = (await getPayInfo(db, req.params.token)) ?? (await getUdhaarPayInfo(db, req.params.token));
    if (!info) throw notFound();
    return info;
  });

  app.post<{ Params: { token: string } }>("/pay/:token/confirm", async (req) => {
    const body = parseBody(PayConfirmBodySchema, req.body);
    const result =
      (await confirmPayment(db, req.params.token, body.amountRupees)) ??
      (await confirmUdhaarRepayment(db, req.params.token));
    if (!result) throw notFound();
    return result;
  });

  // ---- AI call, merchant side ----
  app.post("/calls", { preHandler: guards.requireMerchant }, async (req, reply) => {
    const { customerId } = parseBody(CustomerIdBody, req.body);
    const call = await startCall(db, ai, await merchantOf(req), customerId, req.log);
    return reply.code(201).send({ call, joinUrl: `${webOrigin}/call-sim/${call.id}` });
  });

  app.get<{ Params: { id: string } }>("/calls/:id", { preHandler: guards.requireMerchant }, async (req) => {
    const call = await getCall(db, req.params.id, req.membership!.merchantId);
    if (!call) throw notFound();
    return call;
  });

  app.post<{ Params: { id: string } }>(
    "/calls/:id/end",
    { preHandler: guards.requireMerchant },
    async (req) => {
      const call = await endCall(db, req.params.id, req.membership!.merchantId);
      if (!call) throw notFound();
      return call;
    },
  );

  // ---- AI call, customer side (public; the call id is an unguessable uuid) ----
  app.get<{ Params: { id: string } }>("/call-sim/:id", async (req) => {
    const call = await getCall(db, req.params.id);
    if (!call) throw notFound();
    return call;
  });

  app.post<{ Params: { id: string } }>("/call-sim/:id/answer", async (req) => {
    const call = await answerCall(db, req.params.id);
    if (!call) throw notFound();
    return call;
  });

  app.post<{ Params: { id: string } }>("/call-sim/:id/turn", async (req) => {
    let text: string;
    if (req.isMultipart()) {
      let audio: { data: Buffer; mimeType: string } | null = null;
      for await (const part of req.parts()) {
        if (part.type === "file" && part.fieldname === "audio") {
          audio = { data: await part.toBuffer(), mimeType: part.mimetype };
        }
      }
      if (!audio) throw new AppError(400, "VALIDATION_ERROR", "audio: file is required");
      try {
        text = (await ai.speech.stt(audio.data, { mimeType: audio.mimeType })).transcript;
      } catch {
        text = "";
      }
      if (!text) return { understood: false, call: await getCall(db, req.params.id) };
    } else {
      text = parseBody(CustomerTurnBodySchema, req.body).text;
    }
    return { understood: true, call: await customerTurn(db, ai, req.params.id, text, payLinkBase, req.log) };
  });
}
