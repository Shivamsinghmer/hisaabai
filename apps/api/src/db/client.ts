import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";

// node-postgres pool over Neon's pooled endpoint: the API is a long-running
// server, so one pool is reused across requests.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  // Neon scales to zero; the first connection after idle can take a few seconds.
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool);
