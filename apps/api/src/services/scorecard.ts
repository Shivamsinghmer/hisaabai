// §14 credit scorecard: transparent, rule-based, 300–900 like CIBIL.
// computeScore is a pure function over ledger statistics — the LLM only
// explains it later (score_explainer.md), never computes it (BUILD_PLAN rule 4).
import { todayIst } from "@hisaab/shared";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { customerBalances, ledgerEntries, promises, type ScoreFactor } from "../db/schema.js";

export const WINDOW_MONTHS = 6;
const NEUTRAL = 0.5; // too-little-data factors sit at neutral, not 0 (§14)

/** Scores are computed over the last 6 months (§14). */
export function windowStart(today = todayIst()): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setMonth(d.getMonth() - WINDOW_MONTHS);
  return d.toISOString().slice(0, 10);
}

// ---- Pure scoring ----

/** Statistics the scorecard runs on. All money in paise. */
export type ScorecardStats = {
  /** udhaar given in the window */
  creditGivenPaise: number;
  /** how much of that came back (FIFO per customer) */
  repaidPaise: number;
  /** mean days from a credit to the payment that covered part of it; null if nothing repaid */
  avgDaysToRecover: number | null;
  /** sale amounts bucketed per week over the window, zeros included */
  weeklySales: number[];
  salesPaise: number;
  upiSalesPaise: number;
  /** share of outstanding udhaar held by the top 3 debtors; null if nobody owes */
  debtorConcentration: number | null;
  monthsOfHistory: number;
  promisesMade: number;
  promisesKept: number;
};

export const FACTOR_WEIGHTS = {
  recovery_rate: 0.25,
  sales_consistency: 0.2,
  promise_reliability: 0.15,
  digital_share: 0.15,
  avg_days_to_recover: 0.1,
  tenure_months: 0.1,
  debtor_concentration: 0.05,
} as const;

/** §14: raw = Σ weight·norm → score = round(300 + raw·600). */
export function computeScore(s: ScorecardStats): { score: number; factors: ScoreFactor[] } {
  const factors = normalizeAll(s);
  const total = factors.reduce((sum, f) => sum + f.points, 0);
  return { score: Math.min(900, Math.max(300, Math.round(300 + total * 600))), factors };
}

const norm = (x: number) => Math.min(1, Math.max(0, x));

/** Sales consistency = 1 − coefficient of variation of weekly sales. */
function consistency(weekly: number[]): number {
  if (weekly.length < 4) return NEUTRAL;
  const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
  if (mean <= 0) return NEUTRAL;
  const variance = weekly.reduce((a, b) => a + (b - mean) ** 2, 0) / weekly.length;
  return norm(1 - Math.sqrt(variance) / mean);
}

/** Whole days between two yyyy-mm-dd dates (calendar days). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

function normalizeAll(s: ScorecardStats): ScoreFactor[] {
  const recovery = s.creditGivenPaise > 0 ? norm(s.repaidPaise / s.creditGivenPaise) : NEUTRAL;
  const consistencyScore = consistency(s.weeklySales);
  const promiseReliability = s.promisesMade > 0 ? norm(s.promisesKept / s.promisesMade) : NEUTRAL;
  const digital = s.salesPaise > 0 ? norm(s.upiSalesPaise / s.salesPaise) : NEUTRAL;
  // avg days: 0 days → 1, ≥ 60 days → 0 (documented in BUILD_PLAN Phase 7)
  const days = s.avgDaysToRecover === null ? NEUTRAL : norm(1 - s.avgDaysToRecover / 60);
  const tenure = norm(Math.min(s.monthsOfHistory, 12) / 12);
  // concentration: 0 → 1, ≥ 0.6 → 0
  const concentration = s.debtorConcentration === null ? NEUTRAL : norm(1 - s.debtorConcentration / 0.6);

  const raw: [string, number, number, number][] = [
    [
      "recovery_rate",
      s.creditGivenPaise > 0 ? s.repaidPaise / s.creditGivenPaise : 0,
      recovery,
      FACTOR_WEIGHTS.recovery_rate,
    ],
    ["sales_consistency", 0, consistencyScore, FACTOR_WEIGHTS.sales_consistency],
    [
      "promise_reliability",
      s.promisesMade > 0 ? s.promisesKept / s.promisesMade : 0,
      promiseReliability,
      FACTOR_WEIGHTS.promise_reliability,
    ],
    [
      "digital_share",
      s.salesPaise > 0 ? s.upiSalesPaise / s.salesPaise : 0,
      digital,
      FACTOR_WEIGHTS.digital_share,
    ],
    ["avg_days_to_recover", s.avgDaysToRecover ?? 0, days, FACTOR_WEIGHTS.avg_days_to_recover],
    ["tenure_months", Math.min(s.monthsOfHistory, 12), tenure, FACTOR_WEIGHTS.tenure_months],
    ["debtor_concentration", s.debtorConcentration ?? 0, concentration, FACTOR_WEIGHTS.debtor_concentration],
  ];

  return raw.map(([key, value, n, weight]) => ({
    key,
    value: Math.round(value * 100) / 100,
    weight,
    points: Math.round(weight * n * 1000) / 1000,
    direction: n >= NEUTRAL ? ("up" as const) : ("down" as const),
  }));
}

// ---- Offer rules (§14 mock lender) ----

export const MIN_SCORE = 600;
const MAX_OFFER_PAISE = 200_000_00; // ₹2,00,000
const ROUND_TO_PAISE = 5_000_00; // clean spoken figures: ₹5,000 steps

/** Rate per score band (proposal #4, adopted in the sprint plan). */
export function rateFor(score: number): number {
  if (score >= 760) return 18;
  if (score >= 680) return 21;
  return 24;
}

function multiplierFor(score: number): number {
  if (score >= 760) return 1.0;
  if (score >= 680) return 0.8;
  return 0.5;
}

/**
 * amount = min(₹2,00,000, avg_monthly_sales × multiplier). Big offers are
 * rounded DOWN to the nearest ₹5,000 so the spoken figure is clean;
 * small offers keep ₹100 steps (rounding a ₹1,600 offer to zero is useless).
 * All inputs and outputs are paise.
 */
export function offerAmountPaise(score: number, salesPaise: number): number {
  const monthly = salesPaise / WINDOW_MONTHS;
  const amount = Math.min(MAX_OFFER_PAISE, Math.floor(monthly * multiplierFor(score)));
  const stepped = Math.floor(amount / ROUND_TO_PAISE) * ROUND_TO_PAISE;
  return stepped >= ROUND_TO_PAISE ? stepped : Math.max(500_00, Math.floor(amount / 100) * 100);
}

// ---- Stats from the ledger (merchant-scoped) ----

export async function scorecardStats(db: Db, merchantId: string): Promise<ScorecardStats> {
  const start = windowStart();
  const today = todayIst();

  // One query for the window's credit/payment/sale entries; FIFO pairing and
  // the weekly buckets are computed in code (no free-form SQL anywhere).
  const rows = await db
    .select({
      type: ledgerEntries.type,
      amountPaise: ledgerEntries.amountPaise,
      source: ledgerEntries.source,
      customerId: ledgerEntries.customerId,
      entryDate: ledgerEntries.entryDate,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.merchantId, merchantId),
        eq(ledgerEntries.status, "confirmed"),
        inArray(ledgerEntries.type, ["credit", "payment", "sale"]),
        gte(ledgerEntries.entryDate, start),
      ),
    )
    .orderBy(ledgerEntries.entryDate, ledgerEntries.createdAt);

  const credits = rows.filter((r) => r.type === "credit");
  const payments = rows.filter((r) => r.type === "payment");
  const sales = rows.filter((r) => r.type === "sale");

  // FIFO: each payment settles the oldest unpaid credits of its customer,
  // weighted by the portion it covers (weight-correct average days).
  const queue = new Map<string, { date: string; paise: number }[]>();
  for (const c of credits)
    queue.set(c.customerId!, [
      ...(queue.get(c.customerId!) ?? []),
      { date: c.entryDate!, paise: c.amountPaise },
    ]);

  let repaid = 0;
  let repaidPortions = 0;
  let weightedDays = 0;
  for (const p of payments) {
    let left = p.amountPaise;
    const q = queue.get(p.customerId!) ?? [];
    while (left > 0 && q.length > 0) {
      const oldest = q[0]!;
      const portion = Math.min(left, oldest.paise);
      repaid += portion;
      weightedDays += daysBetween(oldest.date, p.entryDate!) * portion;
      repaidPortions += portion;
      left -= portion;
      oldest.paise -= portion;
      if (oldest.paise <= 0) q.shift();
      else q[0] = oldest;
    }
  }

  // 26 weekly buckets over the window, oldest first.
  const weeks = WINDOW_MONTHS * 4 + 2;
  const weeklySales = new Array<number>(weeks).fill(0);
  for (const sale of sales) {
    const idx = Math.min(weeks - 1, Math.max(0, Math.floor(daysBetween(start, sale.entryDate!) / 7)));
    weeklySales[idx] = (weeklySales[idx] ?? 0) + sale.amountPaise;
  }

  const [promiseAgg] = await db
    .select({
      made: sql<string>`count(*) filter (where ${promises.status} <> 'open')`,
      kept: sql<string>`count(*) filter (where ${promises.status} = 'kept')`,
    })
    .from(promises)
    .where(eq(promises.merchantId, merchantId));
  // Made = every promise with a verdict or none yet; not-yet-time 'open' ones
  // shouldn't drag the ratio down, so only dated promises count as made.
  const promisesMade = Number(promiseAgg?.made ?? 0);

  const [first] = await db
    .select({ first: sql<string | null>`min(${ledgerEntries.entryDate})` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.merchantId, merchantId), eq(ledgerEntries.status, "confirmed")));
  const monthsOfHistory = first?.first ? daysBetween(first.first, today) / 30 : 0;

  const owing = await db
    .select({ balancePaise: customerBalances.balancePaise })
    .from(customerBalances)
    .where(and(eq(customerBalances.merchantId, merchantId), sql`${customerBalances.balancePaise} > 0`))
    .orderBy(desc(customerBalances.balancePaise));
  const totalOwed = owing.reduce((s, r) => s + r.balancePaise, 0);
  const top3 = owing.slice(0, 3).reduce((s, r) => s + r.balancePaise, 0);

  return {
    creditGivenPaise: credits.reduce((s, r) => s + r.amountPaise, 0),
    repaidPaise: repaid,
    avgDaysToRecover: repaidPortions > 0 ? weightedDays / repaidPortions : null,
    weeklySales,
    salesPaise: sales.reduce((s, r) => s + r.amountPaise, 0),
    upiSalesPaise: sales.filter((r) => r.source === "upi").reduce((s, r) => s + r.amountPaise, 0),
    debtorConcentration: totalOwed > 0 ? top3 / totalOwed : null,
    monthsOfHistory,
    promisesMade,
    promisesKept: Number(promiseAgg?.kept ?? 0),
  };
}
