// The demo merchant (CLAUDE.md §15, §22): Sharma General Store, Noida.
// Hand-placed customers match the demo script and the F1.2 utterances:
// - Gupta ji: ₹330 due and overdue. The demo's voice entry ("…120 udhaar")
//   brings it to ₹450, which the AI call then quotes.
// - Verma ji ("Ek sau bees Verma ji ke naam likho"), Sharma ji ("Sharma ji ne
//   300 jama kiye", so ≥ ₹300 due), Khan sahab (slow payer, broken promise).
// - Meena didi is deliberately NOT seeded: "Naya customer Meena didi…" creates her.
// Walk-in sales average ≈ ₹62,500/month, so the Phase 7 offer lands near ₹50,000.
//
// Paytm customer profile: three neighbouring Noida shops share four of these customers,
// linked by phone, so each shows a different cross-shop case:
// - Gupta ji: on time at two other shops, ₹1,200 unpaid at a third for ~75 days
//   ("pays everyone except one" → selective pattern).
// - Verma ji: on time everywhere (trusted).
// - Sharma ji: ₹900 overdue at one shop, but disputed (counts much less).
// - Khan sahab: late at two other shops; has NOT consented, so the shop sees the consent gate.
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
type NetworkLink = { shop: number; style: PayStyle; outstanding?: Outstanding[]; disputed?: boolean };
type Special = {
  name: string;
  /** Fictional numbers; the same phone links the person across shops. */
  phone: string;
  consent: boolean;
  network: NetworkLink[];
  aliases: string[];
  style: PayStyle;
  trust: "regular" | "trusted";
  outstanding: Outstanding[];
  brokenPromiseDaysAgo?: number;
};

const SPECIALS: Special[] = [
  {
    name: "Gupta ji",
    phone: "+919000000001",
    consent: true,
    network: [
      { shop: 0, style: "on_time" },
      { shop: 1, style: "on_time" },
      {
        shop: 2,
        style: "on_time",
        outstanding: [{ daysAgo: 90, rupees: 1200, items: "ghee, chawal 10 kg" }],
      },
    ],
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
    phone: "+919000000002",
    consent: true,
    network: [
      { shop: 0, style: "on_time" },
      { shop: 1, style: "on_time" },
    ],
    aliases: ["Verma jee", "Anil Verma"],
    style: "on_time",
    trust: "trusted",
    outstanding: [{ daysAgo: 6, rupees: 600, items: "sarson tel 1 litre, chini 1 kg" }],
  },
  {
    name: "Sharma ji",
    phone: "+919000000003",
    consent: true,
    network: [{ shop: 2, style: "on_time", outstanding: [{ daysAgo: 65, rupees: 900 }], disputed: true }],
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
    phone: "+919000000004",
    consent: false,
    network: [
      { shop: 0, style: "slow", outstanding: [{ daysAgo: 60, rupees: 800 }] },
      { shop: 1, style: "slow", outstanding: [{ daysAgo: 85, rupees: 600 }] },
    ],
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
      phone: s.phone,
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

const NEIGHBOURS = [
  { key: "demo-neighbour-1", shopName: "Agarwal Kirana", ownerName: "Mukesh Agarwal", health: "strong" },
  { key: "demo-neighbour-2", shopName: "Bansal Daily Needs", ownerName: "Pankaj Bansal", health: "average" },
  { key: "demo-neighbour-3", shopName: "Jain Provision Store", ownerName: "Rakesh Jain", health: "average" },
] as const;

export const DEMO_NETWORK_PHONES = SPECIALS.map((s) => s.phone);
export const DEMO_NETWORK_CONSENTS = SPECIALS.filter((s) => s.consent).map((s) => s.phone);

/** Neighbouring shops that share the demo customers (Paytm customer profile). */
function generateNeighbours(today: string): SeedBundle[] {
  return NEIGHBOURS.map((n, shop) => {
    const rng = rngFor(n.key);
    const merchantId = rng.uuid();
    const bundle = generateMerchant({
      rng,
      merchantId,
      health: n.health,
      city: "Noida",
      ownerName: n.ownerName,
      shopName: n.shopName,
      today,
      customerCount: 12,
      reservedNameParts: ["gupta", "verma", "sharma", "khan", "meena"],
    });
    bundle.disputes = [];
    const start = addDays(today, -HISTORY_DAYS + rng.int(0, 40));

    for (const s of SPECIALS) {
      const link = s.network.find((l) => l.shop === shop);
      if (!link) continue;
      const customerId = rng.uuid();
      bundle.customers.push({
        id: customerId,
        merchantId,
        name: s.name,
        aliases: s.aliases,
        phone: s.phone,
        trustLevel: link.style === "on_time" ? "trusted" : "regular",
        payPrediction: predictionFor(link.style),
        createdAt: new Date(`${start}T04:30:00Z`),
      });
      // Settled history up to shortly before the open balance (or recent days if none).
      const oldestOpen = Math.max(0, ...(link.outstanding ?? []).map((o) => o.daysAgo));
      const history = customerHistory(rng, {
        merchantId,
        customerId,
        style: link.style,
        start,
        today: addDays(today, -Math.max(10, oldestOpen + 20)),
        dueDays: 15,
        onlySettled: true,
      });
      bundle.entries.push(...history.entries);
      bundle.promises.push(...history.promises.filter((p) => p.status !== "open"));
      for (const o of link.outstanding ?? []) {
        const entryDate = addDays(today, -o.daysAgo);
        bundle.entries.push({
          merchantId,
          customerId,
          type: "credit",
          amountPaise: o.rupees * 100,
          items: o.items ?? null,
          source: "voice",
          confidence: 0.95,
          entryDate,
          dueDate: addDays(entryDate, 15),
          createdAt: new Date(`${entryDate}T06:30:00Z`),
        });
      }
      if (link.disputed) {
        bundle.disputes.push({
          merchantId,
          customerId,
          note: "Customer ne call par kaha: maine to de diya tha",
        });
      }
    }
    return bundle;
  });
}

/** Everything `pnpm seed:demo` writes: the demo shop first, then its neighbours. */
export function generateDemoBundles(today: string): SeedBundle[] {
  return [generateDemoMerchant(today), ...generateNeighbours(today)];
}
