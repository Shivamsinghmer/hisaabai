// F3.1: compute, persist and explain the merchant score.
// Code computes; the LLM only phrases the explanation, with the same
// deterministic fallback working whether Groq is up, cached or mocked.
import type { CreditScore, ScoreFactor } from "@hisaab/shared";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import { creditScores } from "../db/schema.js";
import { renderPrompt } from "../prompts/loader.js";
import { computeScore, scorecardStats } from "../services/scorecard.js";
import type { AiServices } from "../services/types.js";

export const FACTOR_LABEL: Record<string, string> = {
  recovery_rate: "Udhaar wapasi (recovery)",
  sales_consistency: "Sale ki ek rupanta (consistency)",
  promise_reliability: "Vaade nibhaana (promise)",
  digital_share: "UPI hissedaari (digital)",
  avg_days_to_recover: "Wasooli ki raftar (days)",
  tenure_months: "Khata ki umar (tenure)",
  debtor_concentration: "Bade grahakon ka udhaar (concentration)",
};

/** One hint per weak factor (spoken on /credit and in the voice reply). */
const TIPS: Record<string, string> = {
  recovery_rate: "Due hone par customer ko turant yaad dilayein — jaldi wapasi ka matlab behtar score.",
  sales_consistency: "Roz ki sale khata mein likhein — stable sale behtar score laata hai.",
  promise_reliability: "Grahak ke vaade ka follow-up karte rahein — nibhaaye gaye vaade score badhate hain.",
  digital_share: "Grahak ko UPI par payment karayein — QR lagayein, digital share badhega.",
  avg_days_to_recover: "Udhaar jaldi wasool karein — phati raftar par score gir jaata hai.",
  tenure_months: "Khata chalte rakhein — purana record score ko majboot karta hai.",
  debtor_concentration: "Zyada udhaar ek-do grahak par na rakhein — baant dein.",
};

/**
 * Weakest factors first: rank by how much it pulls the raw total down,
 * i.e. weight × (1 − norm) only among factors below neutral.
 */
export function tipsFor(factors: ScoreFactor[]): string[] {
  return [...factors]
    .filter((f) => f.direction === "down")
    .sort((a, b) => b.weight - b.points - (a.weight - a.points))
    .slice(0, 3)
    .map((f) => TIPS[f.key] ?? `${FACTOR_LABEL[f.key]} par dhyaan dijiye.`);
}

/** §22 fallback: "Aapka score 712 hai. Pichhle mahine se 18 badha…" */
export function basicScoreReply(score: number, change: number | null, factors: ScoreFactor[], tips: string[]): string {
  const worst = [...factors].sort((a, b) => a.points - b.points)[0];
  const best = [...factors].sort((a, b) => b.points - a.points)[0];
  const lines = [`Aapka score ${score} hai.`];
  if (change !== null && change !== 0) {
    lines.push(`Pichhli baar se ${Math.abs(change)} point ${change > 0 ? "badha" : "kam hua"}.`);
  }
  if (best && best.direction === "up") lines.push(`${FACTOR_LABEL[best.key] ?? "Wapasi"} achhi chal rahi hai.`);
  if (worst && worst.direction === "down") lines.push(`${FACTOR_LABEL[worst.key] ?? "Kamzor hissa"} par dhyaan dijiye.`);
  if (tips[0]) lines.push(tips[0]);
  return lines.join(" ");
}

/** Computes the score, stores it, and reports the change vs the previous one. */
export async function computeAndStoreScore(db: Db, merchantId: string): Promise<CreditScore> {
  const [previous] = await db
    .select()
    .from(creditScores)
    .where(eq(creditScores.merchantId, merchantId))
    .orderBy(desc(creditScores.computedAt))
    .limit(1);

  const stats = await scorecardStats(db, merchantId);
  const { score, factors } = computeScore(stats);
  const tips = tipsFor(factors);
  await db.insert(creditScores).values({ merchantId, score, factors });

  return {
    score,
    change: previous ? score - previous.score : null,
    factors,
    tips,
    computedAt: new Date().toISOString(),
  };
}

const ExplainerReplySchema = z.object({ replyText: z.string().min(1).max(500) });

/** Voice answer to "Mujhe loan mil sakta hai?" — LLM explains, code falls back. */
export async function creditVoiceReply(
  db: Db,
  ai: AiServices,
  // Structural: getMerchant returns the serialized shop (ids + language enough here).
  merchant: { id: string; shopName: string; language: string },
  log: Pick<FastifyBaseLogger, "warn" | "info">,
): Promise<string> {
  const data = await computeAndStoreScore(db, merchant.id);
  try {
    const prompt = renderPrompt("score_explainer", { shop_name: merchant.shopName });
    const reply = await ai.llm.chatJson({
      op: "score_explainer",
      system: prompt.text,
      user: JSON.stringify({ score: data.score, change: data.change, factors: data.factors, tips: data.tips }),
      schema: ExplainerReplySchema,
    });
    return reply.replyText;
  } catch (err) {
    log.warn({ err: (err as Error).message }, "score explainer fell back to template");
    return basicScoreReply(data.score, data.change, data.factors, data.tips);
  }
}
