// §14 maths + teach-back judging, pure functions, no DB.
import { describe, expect, it } from "vitest";
import { judgeTeachBack, failReply } from "../src/credit/teachBack.js";
import { emiPaise } from "../src/services/emi.js";
import {
  computeScore,
  daysBetween,
  offerAmountPaise,
  rateFor,
  type ScorecardStats,
} from "../src/services/scorecard.js";

function stats(partial: Partial<ScorecardStats> = {}): ScorecardStats {
  return {
    creditGivenPaise: 0,
    repaidPaise: 0,
    avgDaysToRecover: null,
    weeklySales: [],
    salesPaise: 0,
    upiSalesPaise: 0,
    debtorConcentration: null,
    monthsOfHistory: 0,
    promisesMade: 0,
    promisesKept: 0,
    ...partial,
  };
}

const offer = {
  id: "o1",
  amountPaise: 5_000_000,
  tenureMonths: 6,
  annualRatePct: 21,
  emiPaise: 5_310_000 / 6, // whatever; judge uses emiPaise/100 rupees
  teachBackAttempts: 0,
  teachBackPassed: false,
  status: "offered" as const,
  createdAt: "2026-10-31",
};

describe("EMI (reducing balance)", () => {
  it("₹50,000 at 21% over 6 months ≈ ₹8,851 (BUILD_PLAN's ≈ ₹8,850)", () => {
    const emi = emiPaise(50_000_00, 21, 6) / 100;
    expect(emi).toBeGreaterThan(8_849);
    expect(emi).toBeLessThan(8_853);
  });
  it("0% is a straight split", () => {
    expect(emiPaise(60_000_00, 0, 6)).toBe(10_000_00);
  });
  it("higher rate, higher EMI", () => {
    expect(emiPaise(50_000_00, 24, 6)).toBeGreaterThan(emiPaise(50_000_00, 18, 6));
  });
});

describe("§14 scorecard", () => {
  it("an empty shop lands just under neutral (tenure = 0 months is the only real data)", () => {
    const { score, factors } = computeScore(stats());
    expect(score).toBe(570);
    expect(factors).toHaveLength(7);
    for (const f of factors.filter((x) => x.key !== "tenure_months")) {
      expect(f.points).toBeCloseTo(f.weight * 0.5, 3);
      expect(f.direction).toBe("up");
    }
    // No history yet → tenure contributes nothing, honestly labelled "down".
    expect(factors.find((x) => x.key === "tenure_months")).toMatchObject({ points: 0, direction: "down" });
  });

  it("a perfect shop lands near the top", () => {
    const s = stats({
      creditGivenPaise: 100_000,
      repaidPaise: 100_000,
      avgDaysToRecover: 5,
      weeklySales: new Array(26).fill(10_000),
      salesPaise: 260_000,
      upiSalesPaise: 260_000,
      debtorConcentration: null,
      monthsOfHistory: 12,
      promisesMade: 4,
      promisesKept: 4,
    });
    const { score, factors } = computeScore(s);
    expect(score).toBeGreaterThan(870);
    expect(factors.find((f) => f.key === "recovery_rate")?.direction).toBe("up");
  });

  it("a weak shop stays well below the offer line: broken promises, no UPI, slow recovery", () => {
    const s = stats({
      creditGivenPaise: 100_000,
      repaidPaise: 30_000,
      avgDaysToRecover: 58,
      weeklySales: [50_000, 5_000, 40_000, 2_000, 30_000, 8_000, 60_000, 1_000, 45_000, 3_000, 55_000, 2_000, 35_000],
      salesPaise: 0,
      upiSalesPaise: 0,
      debtorConcentration: 0.8,
      monthsOfHistory: 1,
      promisesMade: 5,
      promisesKept: 1,
    });
    const { score } = computeScore(s);
    expect(score).toBeLessThan(450);
  });

  it("every factor stays inside its §14 weight", () => {
    const { factors } = computeScore(stats({ monthsOfHistory: 12 }));
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });
});

describe("mock lender rules", () => {
  it("rate bands 24/21/18", () => {
    expect(rateFor(600)).toBe(24);
    expect(rateFor(679)).toBe(24);
    expect(rateFor(680)).toBe(21);
    expect(rateFor(760)).toBe(18);
  });

  it("amount = avg monthly sales × multiplier, rounded to ₹5k, capped at ₹2,00,000", () => {
    // monthly ₹65,000 at score 700 → 0.8 × = ₹52,000 → ₹50,000 (the §22 demo figure)
    expect(offerAmountPaise(700, 65_000 * 100 * 6)).toBe(50_000 * 100);
    expect(offerAmountPaise(650, 40_000 * 100 * 6)).toBe(20_000 * 100);
    expect(offerAmountPaise(800, 5_000_000 * 100 * 6)).toBe(200_000 * 100);
  });
});

describe("teach-back judge", () => {
  const sixMonths = { ...offer, tenureMonths: 6, emiPaise: 8_850 * 100 };
  it("passes within ±10% on EMI and exact tenure", () => {
    expect(judgeTeachBack({ emi_rupees: 9_000, tenure_months: 6 }, sixMonths)).toBe(true);
    expect(judgeTeachBack({ emi_rupees: 8_100, tenure_months: 6 }, sixMonths)).toBe(true);
  });
  it("fails a wrong amount or tenure, or a missing number", () => {
    expect(judgeTeachBack({ emi_rupees: 9_800, tenure_months: 6 }, sixMonths)).toBe(false);
    expect(judgeTeachBack({ emi_rupees: 8_850, tenure_months: 12 }, sixMonths)).toBe(false);
    expect(judgeTeachBack({ emi_rupees: null, tenure_months: 6 }, sixMonths)).toBe(false);
  });
  it("failure reply names the real EMI and tenure", () => {
    expect(failReply(sixMonths)).toContain("₹8,850");
    expect(failReply(sixMonths)).toContain("6 mahine");
  });
});

describe("date helper", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
  });
});
