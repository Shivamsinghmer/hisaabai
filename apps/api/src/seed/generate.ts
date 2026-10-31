// Synthetic kirana data (CLAUDE.md §15): 6 months of walk-in sales, udhaar
// (credit) entries, repayments with realistic delays, and promises kept/broken.
import { addDays } from "@hisaab/shared";
import type { customers, ledgerEntries, merchants, promises, users } from "../db/schema.js";
import { customerName, type PersonName } from "./names.js";
import type { Rng } from "./random.js";

export type Health = "strong" | "average" | "weak";
export type PayStyle = "on_time" | "slow" | "risky";

type MerchantRow = typeof merchants.$inferInsert;
type UserRow = typeof users.$inferInsert;
type CustomerRow = typeof customers.$inferInsert;
type EntryRow = typeof ledgerEntries.$inferInsert;
type PromiseRow = typeof promises.$inferInsert;

export type SeedBundle = {
  merchant: MerchantRow & { id: string };
  owner: UserRow;
  customers: (CustomerRow & { id: string })[];
  entries: EntryRow[];
  promises: PromiseRow[];
};

export const HISTORY_DAYS = 183; // ~6 months

const PROFILES: Record<
  Health,
  { dailySales: [number, number]; upiShare: [number, number]; noise: number; mix: Record<PayStyle, number> }
> = {
  strong: {
    dailySales: [2500, 4500],
    upiShare: [0.6, 0.8],
    noise: 0.15,
    mix: { on_time: 0.8, slow: 0.17, risky: 0.03 },
  },
  average: {
    dailySales: [1500, 3000],
    upiShare: [0.4, 0.65],
    noise: 0.25,
    mix: { on_time: 0.67, slow: 0.25, risky: 0.08 },
  },
  weak: {
    dailySales: [800, 1800],
    upiShare: [0.3, 0.45],
    noise: 0.4,
    mix: { on_time: 0.5, slow: 0.32, risky: 0.18 },
  },
};

// Festival demand bumps inside the 2026 seed window. Dates are approximate.
const FESTIVALS: { date: string; days: number; boost: number }[] = [
  { date: "2026-05-27", days: 2, boost: 1.4 }, // Eid al-Adha
  { date: "2026-08-28", days: 2, boost: 1.5 }, // Raksha Bandhan
  { date: "2026-09-04", days: 1, boost: 1.3 }, // Janmashtami
  { date: "2026-10-11", days: 9, boost: 1.3 }, // Navratri
  { date: "2026-10-20", days: 1, boost: 1.6 }, // Dussehra
  { date: "2026-10-29", days: 1, boost: 1.4 }, // Karva Chauth
  { date: "2026-11-01", days: 7, boost: 1.5 }, // Diwali build-up
];

const ITEMS = [
  "2 kg chawal",
  "1 packet Maggi",
  "doodh 1 litre",
  "aata 5 kg",
  "sarson tel 1 litre",
  "sabun 2",
  "chini 1 kg",
  "arhar dal 1 kg",
  "biscuit 4 packet",
  "masala",
  "chai patti 250 g",
  "anda 12",
  "namkeen",
  "surf 1 kg",
  "ghee 500 g",
];

const rupees = (r: number) => Math.round(r) * 100;
const roundTo = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);

function festivalBoost(date: string): number {
  for (const f of FESTIVALS) {
    if (date >= f.date && date < addDays(f.date, f.days)) return f.boost;
  }
  return 1;
}

function weekdayFactor(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 1.25 : day === 6 ? 1.1 : day === 1 ? 0.9 : 1;
}

/** createdAt for a row: the entry date at a plausible shop hour (IST 8:00–21:00). */
function atShopHour(rng: Rng, date: string): Date {
  const minutes = rng.int(8 * 60, 21 * 60) - 330; // IST → UTC
  return new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000);
}

function pickStyle(rng: Rng, mix: Record<PayStyle, number>): PayStyle {
  const r = rng.next();
  if (r < mix.on_time) return "on_time";
  if (r < mix.on_time + mix.slow) return "slow";
  return "risky";
}

export function walkInSales(
  rng: Rng,
  merchantId: string,
  start: string,
  today: string,
  health: Health,
  baseDaily?: number,
) {
  const p = PROFILES[health];
  const base = baseDaily ?? rng.int(p.dailySales[0], p.dailySales[1]);
  const upiShare = rng.float(p.upiShare[0], p.upiShare[1]);
  const entries: EntryRow[] = [];
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const noise = Math.max(0.3, 1 + p.noise * (rng.next() * 2 - 1));
    const total = base * weekdayFactor(date) * festivalBoost(date) * noise;
    const share = Math.min(0.95, Math.max(0.05, upiShare + (rng.next() - 0.5) * 0.1));
    for (const [amount, source] of [
      [total * share, "upi"],
      [total * (1 - share), "manual"],
    ] as const) {
      if (amount < 1) continue;
      entries.push({
        merchantId,
        customerId: null,
        type: "sale",
        amountPaise: rupees(amount),
        source,
        entryDate: date,
        createdAt: atShopHour(rng, date),
      });
    }
  }
  return entries;
}

type CustomerHistoryOptions = {
  merchantId: string;
  customerId: string;
  style: PayStyle;
  start: string;
  today: string;
  dueDays: number;
  /** Drop credits still unpaid today (for hand-placed demo balances). */
  onlySettled?: boolean;
};

/** Credits and repayments for one customer, plus promises for slow payers. */
export function customerHistory(rng: Rng, o: CustomerHistoryOptions) {
  const entries: EntryRow[] = [];
  const promiseRows: PromiseRow[] = [];
  const creditsPerMonth = o.style === "risky" ? rng.float(1, 3) : rng.float(1, 5);

  for (let date = o.start; date <= o.today; date = addDays(date, 1)) {
    if (!rng.chance(creditsPerMonth / 30)) continue;
    const amount = rupees(Math.min(2000, Math.max(20, roundTo(rng.logNormal(250, 0.8), 5))));
    const dueDate = addDays(date, o.dueDays);

    // When (if ever) this credit gets repaid.
    let payDays: number | null;
    if (o.style === "on_time") payDays = rng.int(2, 14);
    else if (o.style === "slow") payDays = rng.int(15, 45);
    else payDays = rng.chance(0.55) ? rng.int(30, 90) : null;
    const paidOn = payDays === null ? null : addDays(date, payDays);
    const settled = paidOn !== null && paidOn <= o.today;
    if (o.onlySettled && !settled) continue;

    entries.push({
      merchantId: o.merchantId,
      customerId: o.customerId,
      type: "credit",
      amountPaise: amount,
      items: rng.chance(0.6) ? rng.pick(ITEMS) : null,
      source: rng.pick(["photo", "photo", "voice", "voice", "manual"] as const),
      confidence: rng.float(0.82, 0.99),
      entryDate: date,
      dueDate,
      createdAt: atShopHour(rng, date),
    });

    if (settled) {
      // Slow payers sometimes clear it in two parts.
      const parts = o.style === "slow" && rng.chance(0.3) ? [Math.round(amount / 200) * 100, 0] : [amount];
      if (parts.length === 2) parts[1] = amount - parts[0]!;
      parts.forEach((part, i) => {
        const day =
          i === 0 && parts.length === 2 ? addDays(date, Math.max(1, Math.floor(payDays! / 2))) : paidOn!;
        entries.push({
          merchantId: o.merchantId,
          customerId: o.customerId,
          type: "payment",
          amountPaise: part,
          source: rng.chance(0.55) ? "upi" : "manual",
          entryDate: day,
          createdAt: atShopHour(rng, day),
        });
      });
    }

    // Slow/risky payers get chased: about half make a promise after the due date.
    const lateEnough = paidOn === null || payDays! > o.dueDays + 5;
    if (o.style !== "on_time" && lateEnough && rng.chance(0.5)) {
      const madeOn = addDays(dueDate, rng.int(2, 7));
      if (madeOn > o.today) continue;
      // ~60% of promises from customers who do pay name a date they then meet.
      const keeps = paidOn !== null && paidOn > madeOn && rng.chance(0.6);
      const promisedDate = keeps ? addDays(paidOn, rng.int(0, 3)) : addDays(madeOn, rng.int(3, 10));
      const status =
        paidOn !== null && paidOn <= promisedDate && paidOn <= o.today
          ? "kept"
          : promisedDate < o.today
            ? "broken"
            : "open";
      promiseRows.push({
        merchantId: o.merchantId,
        customerId: o.customerId,
        amountPaise: amount,
        promisedDate,
        source: rng.pick(["call_sim", "reminder_reply", "merchant"] as const),
        status,
        createdAt: atShopHour(rng, madeOn),
      });
    }
  }
  return { entries, promises: promiseRows };
}

export function predictionFor(style: PayStyle) {
  return style === "on_time" ? "will_pay" : style === "slow" ? "might_delay" : "risky";
}

type GenerateOptions = {
  rng: Rng;
  merchantId: string;
  health: Health;
  city: string;
  ownerName: string;
  shopName: string;
  today: string;
  customerCount: number;
  baseDailySales?: number;
  /** Names to keep out of the generated customers (demo merchant's hand-placed ones). */
  reservedNameParts?: string[];
};

export function generateMerchant(o: GenerateOptions): SeedBundle {
  const { rng, merchantId, today } = o;
  const start = addDays(today, -HISTORY_DAYS);
  const profile = PROFILES[o.health];
  const dueDays = 15;

  const bundle: SeedBundle = {
    merchant: {
      id: merchantId,
      ownerName: o.ownerName,
      shopName: o.shopName,
      language: "hi-IN",
      city: o.city,
      paytmLinked: true,
      defaultDueDays: dueDays,
      createdAt: new Date(`${start}T04:30:00Z`),
    },
    owner: { merchantId, role: "owner" },
    customers: [],
    entries: walkInSales(rng, merchantId, start, today, o.health, o.baseDailySales),
    promises: [],
  };

  const used = new Set<string>();
  const reserved = (o.reservedNameParts ?? []).map((s) => s.toLowerCase());
  while (bundle.customers.length < o.customerCount) {
    const name: PersonName = customerName(rng);
    const lower = [name.display, ...name.aliases].join(" ").toLowerCase();
    if (used.has(name.display) || reserved.some((r) => lower.includes(r))) continue;
    used.add(name.display);

    const style = pickStyle(rng, profile.mix);
    // ~15% joined in the last two months.
    const isNew = rng.chance(0.15);
    const joined = isNew ? addDays(today, -rng.int(10, 60)) : start;
    const customerId = rng.uuid();
    bundle.customers.push({
      id: customerId,
      merchantId,
      name: name.display,
      aliases: name.aliases,
      trustLevel: isNew
        ? "new"
        : style === "risky"
          ? "risky"
          : style === "on_time" && rng.chance(0.5)
            ? "trusted"
            : "regular",
      payPrediction: predictionFor(style),
      createdAt: new Date(`${joined}T04:30:00Z`),
    });
    const history = customerHistory(rng, { merchantId, customerId, style, start: joined, today, dueDays });
    bundle.entries.push(...history.entries);
    bundle.promises.push(...history.promises);
  }
  return bundle;
}
