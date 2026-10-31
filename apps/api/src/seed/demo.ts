// The demo merchant (CLAUDE.md §15, §22): Sharma General Store, Noida.
// Hand-placed customers match the demo script and the F1.2 utterances:
// - Gupta ji: ₹330 due and overdue. The demo's voice entry ("…120 udhaar")
//   brings it to ₹450, which the AI call then quotes.
// - Verma ji ("Ek sau bees Verma ji ke naam likho"), Sharma ji ("Sharma ji ne
//   300 jama kiye", so ≥ ₹300 due), Khan sahab (slow payer, broken promise).
// - Meena didi is deliberately NOT seeded: "Naya customer Meena didi…" creates her.
// Walk-in sales average ≈ ₹62,500/month, so the Phase 7 offer lands near ₹50,000.
import { addDays } from "@hisaab/shared";
import {
  customerHistory,
  generateMerchant,
  HISTORY_DAYS,
  type PayStyle,
  predictionFor,
  type SeedBundle,
} from "./generate.js";
import { rngFor } from "./random.js";

export const DEMO_MERCHANT_ID = rngFor("demo-merchant").uuid();

type Outstanding = { daysAgo: number; rupees: number; items?: string };
type Special = {
  name: string;
  aliases: string[];
  style: PayStyle;
  trust: "regular" | "trusted";
  outstanding: Outstanding[];
  brokenPromiseDaysAgo?: number;
};

const SPECIALS: Special[] = [
  {
    name: "Gupta ji",
    aliases: ["Gupta jee", "Suresh Gupta"],
    style: "on_time",
    trust: "regular",
    // 180 (due 5 days ago → overdue) + 150 (due in 3 days) = ₹330
    outstanding: [
      { daysAgo: 20, rupees: 180, items: "aata 5 kg" },
      { daysAgo: 12, rupees: 150, items: "arhar dal 1 kg" },
    ],
  },
  {
    name: "Verma ji",
    aliases: ["Verma jee", "Anil Verma"],
    style: "on_time",
    trust: "trusted",
    outstanding: [{ daysAgo: 6, rupees: 600, items: "sarson tel 1 litre, chini 1 kg" }],
  },
  {
    name: "Sharma ji",
    aliases: ["Sharma jee", "Dinesh Sharma"],
    style: "on_time",
    trust: "trusted",
    outstanding: [
      { daysAgo: 9, rupees: 450 },
      { daysAgo: 3, rupees: 300, items: "doodh, anda 12" },
    ],
  },
  {
    name: "Khan sahab",
    aliases: ["Khan saab", "Imran Khan"],
    style: "slow",
    trust: "regular",
    outstanding: [
      { daysAgo: 34, rupees: 700, items: "ghee 500 g" },
      { daysAgo: 25, rupees: 500 },
    ],
    brokenPromiseDaysAgo: 6,
  },
];

export function generateDemoMerchant(today: string): SeedBundle {
  const rng = rngFor("demo-merchant-data");
  const merchantId = DEMO_MERCHANT_ID;
  const start = addDays(today, -HISTORY_DAYS);

  const bundle = generateMerchant({
    rng,
    merchantId,
    health: "strong",
    city: "Noida",
    ownerName: "Ramesh Sharma",
    shopName: "Sharma General Store",
    today,
    customerCount: 30,
    baseDailySales: 1950,
    reservedNameParts: ["gupta", "verma", "sharma", "khan", "meena"],
  });

  for (const s of SPECIALS) {
    const customerId = rng.uuid();
    bundle.customers.push({
      id: customerId,
      merchantId,
      name: s.name,
      aliases: s.aliases,
      trustLevel: s.trust,
      payPrediction: s.name === "Gupta ji" ? "might_delay" : predictionFor(s.style),
      createdAt: new Date(`${start}T04:30:00Z`),
    });

    // Six months of settled history, then the hand-placed open balance.
    const history = customerHistory(rng, {
      merchantId,
      customerId,
      style: s.style,
      start,
      today: addDays(today, -40),
      dueDays: 15,
      onlySettled: true,
    });
    bundle.entries.push(...history.entries);
    bundle.promises.push(...history.promises.filter((p) => p.status !== "open"));

    for (const o of s.outstanding) {
      const entryDate = addDays(today, -o.daysAgo);
      bundle.entries.push({
        merchantId,
        customerId,
        type: "credit",
        amountPaise: o.rupees * 100,
        items: o.items ?? null,
        source: "photo",
        confidence: 0.95,
        entryDate,
        dueDate: addDays(entryDate, 15),
        createdAt: new Date(`${entryDate}T06:30:00Z`),
      });
    }

    if (s.brokenPromiseDaysAgo !== undefined) {
      const total = s.outstanding.reduce((sum, o) => sum + o.rupees, 0);
      bundle.promises.push({
        merchantId,
        customerId,
        amountPaise: total * 100,
        promisedDate: addDays(today, -s.brokenPromiseDaysAgo),
        source: "call_sim",
        status: "broken",
        createdAt: new Date(`${addDays(today, -s.brokenPromiseDaysAgo - 5)}T06:30:00Z`),
      });
    }
  }
  return bundle;
}
