// Paytm customer profile score (300–900): one customer's udhaar record across every shop
// on Hisaab AI. Transparent rules, like the merchant scorecard (§14); the LLM only explains.
//
// Base score from five factors:
//   repayment  40%  amount-weighted share of credits repaid on time, across all shops
//   current    20%  share of shops with no balance more than 30 days overdue
//   promises   15%  promises kept ÷ promises made
//   breadth    15%  shops in good standing (3 or more = full marks)
//   tenure     10%  longest history at any shop (6 months = full marks)
//
// Averaging alone would hide one unpaid shop behind three good ones, so each balance more
// than 30 days overdue then costs points on its own:
//   penalty = 150 × min(1, days overdue ÷ 90) × min(1, 0.5 + 2 × its share of all udhaar)
//   × 0.2 if the customer disputes it (a disagreement, not a refusal to pay)
// Total penalties are capped at 250. Settling the balance removes its penalty.
import type { NetworkBand, NetworkFactor, NetworkPattern, NetworkScore, ShopStanding } from "@hisaab/shared";
import { todayIst } from "@hisaab/shared";
import { daysBetween } from "../services/scorecard.js";
import { onTimeRate, type LedgerLine } from "../udhaar/eligibility.js";

export type ShopHistory = {
  label: string;
  isThisShop: boolean;
  lines: LedgerLine[];
  promisesKept: number;
  promisesBroken: number;
  openDispute: boolean;
};

const OVERDUE_GRACE_DAYS = 30;
const MAX_SHOP_PENALTY = 150;
const MAX_TOTAL_PENALTY = 250;
const DISPUTE_FACTOR = 0.2;

const WEIGHTS = { repayment: 0.4, current: 0.2, promises: 0.15, breadth: 0.15, tenure: 0.1 } as const;
const LABELS: Record<keyof typeof WEIGHTS, string> = {
  repayment: "Samay par wapasi (on-time repayment)",
  current: "Abhi koi purana baaki nahi (nothing long overdue)",
  promises: "Vaade nibhaana (promises kept)",
  breadth: "Kai dukaanon ka bharosa (good at many shops)",
  tenure: "Hisaab ki umar (history)",
};

/** Balance still owed, and days since the oldest unpaid credit fell due (payments settle oldest first). */
export function outstandingOf(
  lines: LedgerLine[],
  today: string,
): { outstandingPaise: number; overdueDays: number } {
  const credits = lines
    .filter((l) => l.type === "credit")
    .sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  let paid = lines.filter((l) => l.type === "payment").reduce((s, l) => s + l.amountPaise, 0);
  let outstandingPaise = 0;
  let oldestDue: string | null = null;
  for (const c of credits) {
    const covered = Math.min(paid, c.amountPaise);
    paid -= covered;
    if (covered < c.amountPaise) {
      outstandingPaise += c.amountPaise - covered;
      if (oldestDue === null && c.dueDate !== null) oldestDue = c.dueDate;
    }
  }
  const overdueDays = oldestDue !== null && oldestDue < today ? daysBetween(oldestDue, today) : 0;
  return { outstandingPaise, overdueDays };
}

export function bandFor(score: number): NetworkBand {
  return score >= 760 ? "trusted" : score >= 680 ? "good" : score >= 600 ? "watch" : "risky";
}

export function scoreNetwork(shops: ShopHistory[], today = todayIst()): NetworkScore {
  const totalCredited = shops
    .flatMap((s) => s.lines)
    .filter((l) => l.type === "credit")
    .reduce((s, l) => s + l.amountPaise, 0);

  const derived = shops.map((shop) => {
    const credited = shop.lines.filter((l) => l.type === "credit").reduce((s, l) => s + l.amountPaise, 0);
    const firstCredit = shop.lines
      .filter((l) => l.type === "credit")
      .map((l) => l.entryDate)
      .sort()[0];
    const historyDays = firstCredit ? daysBetween(firstCredit, today) : 0;
    const { rate } = onTimeRate(shop.lines, today);
    const { outstandingPaise, overdueDays } = outstandingOf(shop.lines, today);
    const longOverdue = overdueDays > OVERDUE_GRACE_DAYS;
    const disputed = shop.openDispute && outstandingPaise > 0;

    const standing: ShopStanding =
      disputed && overdueDays > 0
        ? "disputed"
        : longOverdue
          ? "overdue"
          : overdueDays > 0
            ? "late"
            : historyDays < 30
              ? "new"
              : "good";

    let penalty = 0;
    if (longOverdue) {
      const severity = Math.min(1, overdueDays / 90);
      const share = totalCredited > 0 ? outstandingPaise / totalCredited : 1;
      const size = Math.min(1, 0.5 + 2 * share);
      penalty = Math.round(MAX_SHOP_PENALTY * severity * size * (disputed ? DISPUTE_FACTOR : 1));
    }
    return { shop, credited, rate, historyDays, outstandingPaise, overdueDays, standing, penalty };
  });

  // Factors, each 0–1.
  const judged = derived.filter((d) => d.rate !== null && d.credited > 0);
  const judgedCredit = judged.reduce((s, d) => s + d.credited, 0);
  const repayment =
    judgedCredit > 0 ? judged.reduce((s, d) => s + d.rate! * d.credited, 0) / judgedCredit : 0.5;
  const current = derived.length
    ? derived.filter((d) => d.standing !== "overdue").length / derived.length
    : 0;
  const kept = shops.reduce((s, x) => s + x.promisesKept, 0);
  const broken = shops.reduce((s, x) => s + x.promisesBroken, 0);
  const promises = kept + broken > 0 ? kept / (kept + broken) : 0.75;
  const breadth = Math.min(1, derived.filter((d) => d.standing === "good").length / 3);
  const tenure = Math.min(1, Math.max(0, ...derived.map((d) => d.historyDays)) / 180);

  const values = { repayment, current, promises, breadth, tenure };
  const factors: NetworkFactor[] = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
    key,
    label: LABELS[key],
    value: Math.round(values[key] * 100) / 100,
    weight: WEIGHTS[key],
  }));
  const raw = factors.reduce((s, f) => s + f.weight * values[f.key as keyof typeof WEIGHTS], 0);
  const baseScore = Math.round(300 + raw * 600);
  const penaltyTotal = Math.min(
    MAX_TOTAL_PENALTY,
    derived.reduce((s, d) => s + d.penalty, 0),
  );
  const score = Math.max(300, Math.min(900, baseScore - penaltyTotal));

  const overdue = derived.filter((d) => d.standing === "overdue");
  const othersGood = derived.filter((d) => d.standing === "good").length;
  const pattern: NetworkPattern =
    overdue.length >= 2
      ? "widespread"
      : overdue.length === 1
        ? othersGood >= 2
          ? "selective"
          : "single"
        : derived.some((d) => d.standing === "disputed")
          ? "disputed"
          : "clean";

  return {
    score,
    band: bandFor(score),
    pattern,
    baseScore,
    penaltyTotal,
    factors,
    outstandingPaise: derived.reduce((s, d) => s + d.outstandingPaise, 0),
    shops: derived
      .map((d) => ({
        label: d.shop.label,
        isThisShop: d.shop.isThisShop,
        standing: d.standing,
        onTimeRate: d.rate === null ? null : Math.round(d.rate * 100) / 100,
        outstandingPaise: d.outstandingPaise,
        overdueDays: d.overdueDays,
        historyDays: d.historyDays,
        penalty: d.penalty,
      }))
      .sort((a, b) => Number(b.isThisShop) - Number(a.isThisShop)),
  };
}
