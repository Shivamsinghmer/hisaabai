// Applies src/db/migrations to the branch in DATABASE_URL_UNPOOLED (direct
// connection, as Neon requires for migrations). Usage:
//   pnpm db:migrate        → branch in .env.local (dev)
//   pnpm db:migrate:test   → branch in .env.test.local (test)
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20_000 });
const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

try {
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder });
  const { rows } = await client.query<{ n: number }>(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  console.log(`migrations applied: ${rows[0]?.n ?? 0} (branch ${process.env.NEON_BRANCH ?? "?"})`);
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
