// Read-only: what would the demo shop's score and loan offer be right now?
// Used to confirm the seeded Sharma General Store lands near ~700 / ₹50,000
// before a rehearsal. `pnpm --filter @hisaab/api seed:check`
import { formatPaise } from "@hisaab/shared";
import { createDb } from "../db/client.js";
import { computeScore, offerAmountPaise, rateFor, scorecardStats } from "../services/scorecard.js";
import { emiPaise } from "../services/emi.js";
import { DEMO_MERCHANT_ID } from "./demo.js";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");
const { db, pool } = createDb(url);
try {
  const stats = await scorecardStats(db, DEMO_MERCHANT_ID);
  const { score, factors } = computeScore(stats);
  console.log(`branch ${process.env.NEON_BRANCH}: demo score ${score}`);
  for (const f of factors) {
    console.log(`  ${f.key.padEnd(20)} value ${String(f.value).padEnd(8)} points ${f.points}`);
  }
  const amount = offerAmountPaise(score, stats.salesPaise);
  const rate = rateFor(score);
  console.log(
    `offer: ${formatPaise(amount)} @ ${rate}% for 6 months → EMI ${formatPaise(emiPaise(amount, rate, 6))}`,
  );
} finally {
  await pool.end();
}
