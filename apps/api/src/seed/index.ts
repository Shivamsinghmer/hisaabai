// pnpm seed       → 50 synthetic merchants + the demo merchant
// pnpm seed:demo  → only the demo merchant (reset before every demo)
// Both delete only their own (deterministic) merchant ids before inserting, so
// re-running is safe and never touches onboarded shops.
// Refuses the `production` branch unless `--production` is passed (the demo
// runs on production, so `pnpm seed:demo -- --production` is allowed).
// DEMO_OWNER_EMAIL links the demo shop to that Neon Auth user, so they can log
// in as Ramesh. Without it the demo owner has no login.
import { addDays, todayIst } from "@hisaab/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb, type Db } from "../db/client.js";
import {
  customerBalances,
  customerNetworkConsents,
  customers,
  disputes,
  ledgerEntries,
  merchants,
  promises,
  users,
} from "../db/schema.js";
import { DEMO_MERCHANT_ID, DEMO_NETWORK_CONSENTS, DEMO_NETWORK_PHONES, generateDemoBundles } from "./demo.js";
import { generateMerchant, type Health, type SeedBundle } from "./generate.js";
import { CITIES, ownerName, shopName } from "./names.js";
import { rngFor } from "./random.js";

const MERCHANT_COUNT = 50;
const BATCH = 1000;

function syntheticMerchants(today: string): SeedBundle[] {
  return Array.from({ length: MERCHANT_COUNT }, (_, i) => {
    const rng = rngFor(`merchant-${i}`);
    // ~30% strong, ~50% average, ~20% weak (§15)
    const health: Health = i % 10 < 3 ? "strong" : i % 10 < 8 ? "average" : "weak";
    const { owner, surname } = ownerName(rng);
    return generateMerchant({
      rng,
      merchantId: rng.uuid(),
      health,
      city: CITIES[i % CITIES.length]!,
      ownerName: owner,
      shopName: shopName(rng, surname, owner.split(" ")[0]!),
      today,
      customerCount: rng.int(20, 60),
    });
  });
}

async function insertBatched<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function writeBundle(db: Db, b: SeedBundle) {
  await db.transaction(async (tx) => {
    await tx.insert(merchants).values(b.merchant);
    await tx.insert(users).values(b.owner);
    await insertBatched(b.customers, (c) => tx.insert(customers).values(c));
    await insertBatched(b.entries, (c) => tx.insert(ledgerEntries).values(c));
    await insertBatched(b.promises, (c) => tx.insert(promises).values(c));
    if (b.disputes?.length) await tx.insert(disputes).values(b.disputes);
  });
}

async function linkDemoOwner(db: Db, email: string) {
  const found = await db.execute<{ id: string }>(
    sql`select id from neon_auth."user" where lower(email) = lower(${email}) limit 1`,
  );
  const authUserId = found.rows[0]?.id;
  if (!authUserId) {
    console.warn(`DEMO_OWNER_EMAIL: no Neon Auth user with that email on this branch; sign up first.`);
    return;
  }
  const [existing] = await db.select().from(users).where(eq(users.authUserId, authUserId));
  if (existing && existing.merchantId !== DEMO_MERCHANT_ID) {
    console.warn("DEMO_OWNER_EMAIL already owns another shop on this branch; not linking.");
    return;
  }
  await db.update(users).set({ authUserId, email }).where(eq(users.merchantId, DEMO_MERCHANT_ID));
  console.log("demo shop linked to DEMO_OWNER_EMAIL");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "all" && mode !== "demo") throw new Error("usage: seed (all|demo) [--production]");
  const branch = process.env.NEON_BRANCH;
  if (branch === "production" && !process.argv.includes("--production")) {
    throw new Error("Refusing to seed the production branch without --production");
  }
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");

  const today = todayIst();
  // The demo shop plus three neighbouring shops that share some of its customers (Paytm profile).
  const bundles = [...(mode === "all" ? syntheticMerchants(today) : []), ...generateDemoBundles(today)];
  const { db, pool } = createDb(url);
  try {
    const ids = bundles.map((b) => b.merchant.id);
    await db.delete(merchants).where(inArray(merchants.id, ids));
    for (const [i, b] of bundles.entries()) {
      await writeBundle(db, b);
      process.stdout.write(`\rseeded ${i + 1}/${bundles.length} merchants`);
    }
    // Paytm profile consents for the demo customers (keyed by phone, so reset them too).
    await db
      .delete(customerNetworkConsents)
      .where(inArray(customerNetworkConsents.phone, DEMO_NETWORK_PHONES));
    await db
      .insert(customerNetworkConsents)
      .values(DEMO_NETWORK_CONSENTS.map((phone) => ({ phone, granted: true })));
    console.log(`\nbranch ${branch}: ${bundles.reduce((n, b) => n + b.entries.length, 0)} ledger entries`);

    if (process.env.DEMO_OWNER_EMAIL) await linkDemoOwner(db, process.env.DEMO_OWNER_EMAIL);

    // Show the demo shop's key balances so a reset can be eyeballed before a demo.
    const demo = await db
      .select({
        name: customerBalances.name,
        balancePaise: customerBalances.balancePaise,
        earliestDue: customerBalances.earliestDue,
      })
      .from(customerBalances)
      .where(eq(customerBalances.merchantId, DEMO_MERCHANT_ID));
    const key = demo.filter((c) => ["Gupta ji", "Verma ji", "Sharma ji", "Khan sahab"].includes(c.name));
    console.log("demo balances:", key.map((c) => `${c.name} ₹${c.balancePaise / 100}`).join(", "));
    console.log(`(window ${addDays(today, -183)} → ${today}, IST)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
