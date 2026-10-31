// F3 credit routes (§11): score, consent, offer, teach-back, accept.
// Every route is owner-only (§17: helpers are blocked from credit entirely).
import {
  ConsentBodySchema,
  ConsentSchema,
  CreditScoreSchema,
  TeachBackAnswerSchema,
  TeachBackBodySchema,
  TeachBackResultSchema,
  type Consent,
  type CreditScore,
  type LoanOffer,
  type TeachBackResult,
} from "@hisaab/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { computeAndStoreScore, tipsFor } from "../credit/score.js";
import { failReply, giveUpReply, judgeTeachBack, passReply } from "../credit/teachBack.js";
import type { Db } from "../db/client.js";
import { consents, creditScores, loanOffers, notifications } from "../db/schema.js";
import { getMerchant } from "../db/repos/merchants.js";
import { AppError, parseBody } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";
import { renderPrompt } from "../prompts/loader.js";
import type { AiServices } from "../services/types.js";
import { emiPaise } from "../services/emi.js";
import { MIN_SCORE, offerAmountPaise, rateFor, scorecardStats } from "../services/scorecard.js";

const TENURE_MONTHS = 6;
const notFound = () => new AppError(404, "NOT_FOUND", "Nahi mila (Not found)");
const toOffer = (o: typeof loanOffers.$inferSelect): LoanOffer => ({
  id: o.id,
  amountPaise: o.amountPaise,
  tenureMonths: o.tenureMonths,
  annualRatePct: Number(o.annualRatePct),
  emiPaise: o.emiPaise,
  teachBackAttempts: o.teachBackAttempts ?? 0,
  teachBackPassed: o.teachBackPassed ?? false,
  status: o.status ?? "offered",
  createdAt: (o.createdAt ?? new Date()).toISOString(),
});

export function creditRoutes(app: FastifyInstance, deps: { db: Db; ai: AiServices; guards: AuthGuards }) {
  const { db, ai, guards } = deps;

  // F3.1 — computed on demand and stored; change is vs the previous row.
  app.get("/credit/score", { preHandler: guards.requireOwner }, async (req): Promise<CreditScore> => {
    return CreditScoreSchema.parse(await computeAndStoreScore(db, req.membership!.merchantId));
  });

  // ---- Consent (§16: lending data shared only with explicit consent) ----
  app.get("/consents", { preHandler: guards.requireOwner }, async (req): Promise<Consent[]> => {
    const rows = await db
      .select()
      .from(consents)
      .where(eq(consents.merchantId, req.membership!.merchantId))
      .orderBy(desc(consents.grantedAt));
    return rows.map((c) => ({
      id: c.id,
      purpose: c.purpose,
      granted: c.granted,
      grantedAt: (c.grantedAt ?? new Date()).toISOString(),
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    }));
  });

  app.post("/consents", { preHandler: guards.requireOwner }, async (req): Promise<Consent> => {
    const { purpose } = parseBody(ConsentBodySchema, req.body);
    const [row] = await db
      .insert(consents)
      .values({ merchantId: req.membership!.merchantId, purpose, granted: true })
      .returning();
    return ConsentSchema.parse({
      id: row!.id,
      purpose: row!.purpose,
      granted: row!.granted,
      grantedAt: (row!.grantedAt ?? new Date()).toISOString(),
      revokedAt: null,
    });
  });

  app.delete<{ Params: { id: string } }>(
    "/consents/:id",
    { preHandler: guards.requireOwner },
    async (req): Promise<Consent> => {
      const [row] = await db
        .update(consents)
        .set({ granted: false, revokedAt: new Date() })
        .where(and(eq(consents.id, req.params.id), eq(consents.merchantId, req.membership!.merchantId)))
        .returning();
      if (!row) throw notFound();
      return ConsentSchema.parse({
        id: row.id,
        purpose: row.purpose,
        granted: row.granted,
        grantedAt: (row.grantedAt ?? new Date()).toISOString(),
        revokedAt: (row.revokedAt ?? new Date()).toISOString(),
      });
    },
  );

  // ---- Offer (F3.2: score ≥ 600 + live lending consent) ----
  app.post("/credit/offers", { preHandler: guards.requireOwner }, async (req) => {
    const merchantId = req.membership!.merchantId;
    const consent = await activeConsent(db, merchantId, "lending");
    if (!consent) {
      throw new AppError(
        403,
        "CONSENT_REQUIRED",
        "Loan ke liye pehle apna hisaab share karne ki anumati dein (Grant consent first)",
      );
    }
    const score = await computeAndStoreScore(db, merchantId);
    if (score.score < MIN_SCORE) {
      throw new AppError(
        409,
        "SCORE_TOO_LOW",
        `Score ${score.score} hai, loan ke liye ${MIN_SCORE} chahiye. Pehle score badhayein.`,
      );
    }

    const stats = await scorecardStats(db, merchantId);
    const amountPaise = offerAmountPaise(score.score, stats.salesPaise);
    if (amountPaise <= 0) {
      throw new AppError(409, "NO_OFFER", "Abhi ki sale ke hisaab se loan offer nahi ban sakta.");
    }
    const rate = rateFor(score.score);
    const [row] = await db
      .insert(loanOffers)
      .values({
        merchantId,
        scoreId: null,
        amountPaise,
        tenureMonths: TENURE_MONTHS,
        annualRatePct: rate.toFixed(2),
        emiPaise: emiPaise(amountPaise, rate, TENURE_MONTHS),
      })
      .returning();
    return { offer: toOffer(row!), score: score.score };
  });

  // F3.3 — the merchant repeats the terms back; code judges ±10% / exact tenure.
  app.post<{ Params: { id: string } }>(
    "/credit/offers/:id/teach-back",
    { preHandler: guards.requireOwner },
    async (req): Promise<TeachBackResult> => {
      const body = parseBody(TeachBackBodySchema, req.body);
      const [row] = await db
        .select()
        .from(loanOffers)
        .where(and(eq(loanOffers.id, req.params.id), eq(loanOffers.merchantId, req.membership!.merchantId)));
      if (!row) throw notFound();
      const offer = toOffer(row);
      if (offer.teachBackPassed) {
        return { passed: true, attempts: offer.teachBackAttempts, replyText: passReply(), offer };
      }

      let answer;
      try {
        const prompt = renderPrompt("teach_back_judge", {
          emi: String(offer.emiPaise / 100),
          tenure: String(offer.tenureMonths),
        });
        answer = await ai.llm.chatJson({
          op: "teach_back",
          system: prompt.text,
          user: body.text,
          schema: TeachBackAnswerSchema,
        });
      } catch (err) {
        app.log.warn({ err: (err as Error).message }, "teach-back extraction failed");
        throw new AppError(503, "AI_UNAVAILABLE", "Samajh nahi aaya — thodi der mein dobara koshish karein.");
      }

      const passed = judgeTeachBack(answer, offer);
      const attempts = offer.teachBackAttempts + 1;
      const [updated] = await db
        .update(loanOffers)
        .set({ teachBackAttempts: attempts, teachBackPassed: passed })
        .where(eq(loanOffers.id, row.id))
        .returning();
      const replyText =
        passed ? passReply() : attempts >= 2 ? giveUpReply() : failReply(offer);
      return TeachBackResultSchema.parse({ passed, attempts, replyText, offer: toOffer(updated!) });
    },
  );

  // F3.2 step 5 — mock disbursal; repayments would become ledger entries later.
  app.post<{ Params: { id: string } }>(
    "/credit/offers/:id/accept",
    { preHandler: guards.requireOwner },
    async (req) => {
      const merchantId = req.membership!.merchantId;
      const [row] = await db
        .select()
        .from(loanOffers)
        .where(and(eq(loanOffers.id, req.params.id), eq(loanOffers.merchantId, merchantId)));
      if (!row) throw notFound();
      if (!(row.teachBackPassed ?? false)) {
        throw new AppError(409, "TEACH_BACK_REQUIRED", "Pehle teach-back clear karein (teach-back first)");
      }
      if (row.status === "disbursed") return toOffer(row);

      const [updated] = await db
        .update(loanOffers)
        .set({ status: "disbursed" })
        .where(eq(loanOffers.id, row.id))
        .returning();
      const merchant = (await getMerchant(db, merchantId))!;
      await db.insert(notifications).values({
        merchantId,
        kind: "loan",
        title: `Loan ${Math.round(row.amountPaise / 100)} approve (demo)`,
        body: `${merchant.shopName}: ₹${Math.round(row.amountPaise / 100)} disbursed. EMI ₹${Math.round(row.emiPaise / 100)}/month.`,
      });
      app.log.info({ merchantId }, "loan disbursed (mock)");
      return toOffer(updated!);
    },
  );

  // Latest stored score, for the offer screen header.
  app.get("/credit/latest", { preHandler: guards.requireOwner }, async (req) => {
    const [row] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.merchantId, req.membership!.merchantId))
      .orderBy(desc(creditScores.computedAt))
      .limit(1);
    if (!row) throw notFound();
    return CreditScoreSchema.parse({
      score: row.score,
      change: null, // only shown on the live score screen
      factors: row.factors,
      tips: tipsFor(row.factors),
      computedAt: (row.computedAt ?? new Date()).toISOString(),
    });
  });
}

/** The merchant's latest decision wins: a re-grant after revoke, or vice versa. */
async function activeConsent(db: Db, merchantId: string, purpose: "lending"): Promise<Consent | null> {
  const [row] = await db
    .select()
    .from(consents)
    .where(and(eq(consents.merchantId, merchantId), eq(consents.purpose, purpose)))
    .orderBy(desc(consents.grantedAt))
    .limit(1);
  if (!row || !row.granted || row.revokedAt !== null) return null;
  // row is live here, so revokedAt is null on this path.
  return {
    id: row.id,
    purpose: row.purpose,
    granted: row.granted,
    grantedAt: (row.grantedAt ?? new Date()).toISOString(),
    revokedAt: null,
  };
}
